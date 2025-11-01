/**
 * Identity Registration & Authentication API
 * Handles cryptographic identity registration and signature-based authentication
 * Replaces traditional password authentication with BSV signature verification
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import MusicIdentitySDK, { ACTION_KEY_MAP } from '../src/web3IdentitySDK.js';
import { User } from '../database/schemas.js';
import { connectDatabase } from '../database/schemas.js';
import crypto from 'crypto';
import bsv from 'smartledger-bsv';

const router = express.Router();

/**
 * Generate authentication challenge for signature-based login
 */
router.post('/auth/challenge', async (req, res) => {
  try {
    const { identityAddress } = req.body;
    
    if (!identityAddress) {
      return res.status(400).json({
        success: false,
        error: 'Identity address required'
      });
    }

    // Generate random challenge
    const challenge = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store challenge temporarily (in production, use Redis)
    // For demo, we'll return it directly
    const challengeData = {
      challenge,
      identityAddress,
      expiresAt: expiresAt.toISOString(),
      action: 'verify-identity'
    };

    res.json({
      success: true,
      challengeData,
      instructions: 'Sign this challenge with your identity key and submit to /auth/verify'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Verify signed authentication challenge
 */
router.post('/auth/verify', async (req, res) => {
  try {
    const { signedChallenge, identityAddress } = req.body;
    
    if (!signedChallenge || !identityAddress) {
      return res.status(400).json({
        success: false,
        error: 'Signed challenge and identity address required'
      });
    }

    await connectDatabase();
    
    // Find user by identity address
    const user = await User.findOne({ 
      'cryptoIdentity.address': identityAddress 
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found with this identity address'
      });
    }

    // Verify signature
    const verification = MusicIdentitySDK.verifyActionSignature(
      signedChallenge, 
      user.cryptoIdentity.publicKey
    );

    if (!verification.valid) {
      return res.status(401).json({
        success: false,
        error: `Authentication failed: ${verification.reason}`
      });
    }

    // Check timestamp (prevent replay attacks)
    const signedTime = new Date(verification.timestamp);
    const now = new Date();
    const timeDiff = now - signedTime;
    
    if (timeDiff > 5 * 60 * 1000) { // 5 minutes
      return res.status(401).json({
        success: false,
        error: 'Challenge expired'
      });
    }

    // Generate session token (simplified for demo)
    const sessionToken = crypto.randomBytes(32).toString('hex');
    
    // Update last activity
    user.lastActivity = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Authentication successful',
      sessionToken,
      user: {
        id: user._id,
        email: user.email,
        name: `${user.profile.firstName} ${user.profile.lastName}`,
        role: user.role,
        identityAddress: user.cryptoIdentity.address,
        verified: true
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Register new cryptographic identity
 */
router.post('/identity/register', async (req, res) => {
  try {
    const { signedRegistration } = req.body;
    
    if (!signedRegistration) {
      return res.status(400).json({
        success: false,
        error: 'Signed registration payload required'
      });
    }

    await connectDatabase();

    // Verify signature
    const verification = MusicIdentitySDK.verifyActionSignature(
      signedRegistration,
      signedRegistration.publicKey
    );

    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        error: `Registration verification failed: ${verification.reason}`
      });
    }

    // Extract registration data
    const { payload } = signedRegistration;
    const { data: registrationData } = payload;

    // Check if identity address already exists
    const existingUser = await User.findOne({
      'cryptoIdentity.address': registrationData.identityAddress
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Identity address already registered'
      });
    }

    // Create new user with cryptographic identity
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const username = registrationData.userInfo.email.split('@')[0] + '_' + Math.random().toString(36).substr(2, 4);
    
    // Generate dummy password hash (not used for auth)
    const dummyPassword = crypto.randomBytes(32).toString('hex');
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.pbkdf2Sync(dummyPassword, salt, 100000, 64, 'sha512').toString('hex');

    const newUser = new User({
      email: registrationData.userInfo.email,
      username: username,
      userId: userId,
      passwordHash: passwordHash,
      salt: salt,
      
      profile: {
        firstName: registrationData.userInfo.firstName || 'Artist',
        lastName: registrationData.userInfo.lastName || 'User',
        title: registrationData.userInfo.title || 'Music Professional',
        organization: registrationData.userInfo.organization || 'Independent',
        bio: registrationData.userInfo.bio || 'Music industry professional'
      },
      
      role: mapUserRole(registrationData.userInfo.role),
      permissions: getPermissionsForRole(registrationData.userInfo.role),
      
      // Complete cryptographic identity
      cryptoIdentity: {
        publicKey: registrationData.publicKeys.identity,
        address: registrationData.identityAddress,
        keyDerivationPath: "m/44'/236'/0'/0/0",
        
        // Store all derived public keys
        derivedKeys: {
          identity: registrationData.publicKeys.identity,
          property: registrationData.publicKeys.property,
          contractual: registrationData.publicKeys.contractual,
          privacy: registrationData.publicKeys.privacy,
          messages: registrationData.publicKeys.messages,
          financial: registrationData.publicKeys.financial,
          document: registrationData.publicKeys.document
        },
        
        // Store all derived addresses
        addresses: registrationData.addresses,
        
        web3KeysRegistration: {
          registered: true,
          registrationTxid: payload.timestamp, // Use timestamp as registration ID
          registrationDate: new Date(payload.timestamp)
        }
      },
      
      status: 'active',
      emailVerified: false,
      
      security: {
        authMethod: 'cryptographic_signature',
        twoFactorEnabled: false,
        encryptionEnabled: true,
        lastKeyRotation: new Date()
      },
      
      preferences: {
        notifications: {
          email: true,
          blockchain: true,
          auditAlerts: true
        },
        dashboard: {
          defaultView: 'overview',
          timezone: 'UTC'
        }
      }
    });

    await newUser.save();

    res.status(201).json({
      success: true,
      message: 'Cryptographic identity registered successfully',
      user: {
        id: newUser._id,
        email: newUser.email,
        identityAddress: newUser.cryptoIdentity.address,
        role: newUser.role,
        registrationDate: newUser.createdAt
      },
      availableKeys: Object.keys(registrationData.addresses)
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Sign action with appropriate key
 */
router.post('/action/sign', async (req, res) => {
  try {
    const { action, data, identityAddress } = req.body;
    
    if (!action || !data || !identityAddress) {
      return res.status(400).json({
        success: false,
        error: 'Action, data, and identity address required'
      });
    }

    await connectDatabase();

    // Verify user exists
    const user = await User.findOne({
      'cryptoIdentity.address': identityAddress
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if action is valid
    const requiredKeyType = ACTION_KEY_MAP[action];
    if (!requiredKeyType) {
      return res.status(400).json({
        success: false,
        error: `Unknown action: ${action}`
      });
    }

    // Return signing instructions
    res.json({
      success: true,
      signingInstructions: {
        action,
        requiredKeyType,
        expectedPublicKey: user.cryptoIdentity.derivedKeys[requiredKeyType],
        expectedAddress: user.cryptoIdentity.addresses[requiredKeyType],
        instructions: `Sign this data with your ${requiredKeyType} key and submit to /action/execute`
      },
      payload: {
        action,
        data,
        timestamp: new Date().toISOString(),
        keyType: requiredKeyType,
        derivationPath: `m/44'/236'/${Object.keys(user.cryptoIdentity.addresses).indexOf(requiredKeyType)}'/0/0`
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Execute signed action
 */
router.post('/action/execute', async (req, res) => {
  try {
    const { signedAction, identityAddress } = req.body;
    
    if (!signedAction || !identityAddress) {
      return res.status(400).json({
        success: false,
        error: 'Signed action and identity address required'
      });
    }

    await connectDatabase();

    // Find user
    const user = await User.findOne({
      'cryptoIdentity.address': identityAddress
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify signature with appropriate key
    const { payload } = signedAction;
    const requiredKeyType = payload.keyType;
    const expectedPublicKey = user.cryptoIdentity.derivedKeys[requiredKeyType];

    const verification = MusicIdentitySDK.verifyActionSignature(
      signedAction,
      expectedPublicKey
    );

    if (!verification.valid) {
      return res.status(401).json({
        success: false,
        error: `Action verification failed: ${verification.reason}`
      });
    }

    // Execute action based on type
    let actionResult;
    switch (payload.action) {
      case 'upload-song':
        actionResult = await handleSongUpload(payload.data, user);
        break;
      case 'claim-ownership':
        actionResult = await handleOwnershipClaim(payload.data, user);
        break;
      case 'sign-agreement':
        actionResult = await handleAgreementSigning(payload.data, user);
        break;
      default:
        actionResult = {
          success: true,
          message: `Action ${payload.action} verified and logged`,
          timestamp: verification.timestamp
        };
    }

    res.json({
      success: true,
      verification,
      actionResult,
      message: `${payload.action} executed successfully with ${requiredKeyType} key`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper functions
 */
function mapUserRole(role) {
  const roleMap = {
    'artist': 'ai_artist_manager',
    'producer': 'producer', 
    'songwriter': 'songwriter',
    'label': 'label_admin',
    'publisher': 'rights_manager',
    'platform': 'system_admin'
  };
  return roleMap[role] || 'producer';
}

function getPermissionsForRole(role) {
  const permissionMap = {
    'artist': ['create_artists', 'manage_catalog'],
    'producer': ['create_artists', 'manage_catalog', 'publish_music'],
    'songwriter': ['create_artists', 'publish_music'],
    'label': ['manage_catalog', 'manage_rights', 'calculate_revenue'],
    'publisher': ['manage_rights', 'calculate_revenue', 'generate_reports'],
    'platform': ['admin_system', 'view_analytics', 'generate_reports']
  };
  return permissionMap[role] || ['create_artists'];
}

// Placeholder action handlers
async function handleSongUpload(data, user) {
  return {
    success: true,
    message: 'Song upload verified with property key',
    uploadId: crypto.randomBytes(16).toString('hex'),
    timestamp: new Date()
  };
}

async function handleOwnershipClaim(data, user) {
  return {
    success: true,
    message: 'Ownership claim verified with property key',
    claimId: crypto.randomBytes(16).toString('hex'),
    timestamp: new Date()
  };
}

async function handleAgreementSigning(data, user) {
  return {
    success: true,
    message: 'Agreement signed with contractual key',
    agreementId: crypto.randomBytes(16).toString('hex'),
    timestamp: new Date()
  };
}

export default router;