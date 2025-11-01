/**
 * Attestation API Endpoints
 * REST API for cryptographic contract creation, signing, and verification
 * Integrates with existing identity system and enforces key-type validation
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { AttestationBox, AttestationManager, CONTRACT_TEMPLATES, ATTESTATION_KEY_RULES } from '../src/attestation.js';
import MusicIdentitySDK from '../src/web3IdentitySDK.js';
import { User } from '../database/schemas.js';
import { connectDatabase } from '../database/schemas.js';
import crypto from 'crypto';

const router = express.Router();

// In-memory storage for demo (use database in production)
const attestationManager = new AttestationManager();

/**
 * Get available contract templates
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = attestationManager.getAvailableTemplates();
    
    res.json({
      success: true,
      templates,
      key_rules: ATTESTATION_KEY_RULES,
      message: 'Available contract templates and key enforcement rules'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create new attestation from template
 */
router.post('/create', async (req, res) => {
  try {
    const { templateType, fields, options = {}, identityAddress } = req.body;
    
    if (!templateType) {
      return res.status(400).json({
        success: false,
        error: 'Template type required'
      });
    }

    if (!CONTRACT_TEMPLATES[templateType]) {
      return res.status(400).json({
        success: false,
        error: `Unknown template type: ${templateType}`,
        available: Object.keys(CONTRACT_TEMPLATES)
      });
    }

    // Validate user identity if provided
    let user = null;
    if (identityAddress) {
      await connectDatabase();
      user = await User.findOne({ 'cryptoIdentity.address': identityAddress });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found with this identity address'
        });
      }
    }

    // Create attestation
    const attestation = await attestationManager.createAttestation(templateType, fields, options);
    
    res.status(201).json({
      success: true,
      attestation: {
        id: attestation.id,
        subject: attestation.subject,
        action: attestation.action,
        contract_hash: attestation.metadata.contract_hash,
        created: attestation.metadata.created,
        template_used: attestation.metadata.template_used,
        required_key_type: CONTRACT_TEMPLATES[templateType].key_type,
        required_signatures: attestation.payload.required_signatures
      },
      contract_preview: attestation.getContractText(),
      next_steps: [
        'Share attestation ID with required signers',
        `Each party signs with their ${CONTRACT_TEMPLATES[templateType].key_type} key`,
        'Verify all signatures once complete'
      ]
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get attestation details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const attestation = await attestationManager.loadAttestation(id);
    
    res.json({
      success: true,
      attestation: attestation.export(),
      contract_text: attestation.getContractText(),
      verification: attestation.verifyAllSignatures(),
      blockchain_hash: attestation.getAnchorHash()
    });

  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Sign attestation with cryptographic key
 */
router.post('/:id/sign', async (req, res) => {
  try {
    const { id } = req.params;
    const { signedPayload, identityAddress, signerInfo = {} } = req.body;
    
    if (!signedPayload || !identityAddress) {
      return res.status(400).json({
        success: false,
        error: 'Signed payload and identity address required'
      });
    }

    await connectDatabase();

    // Load attestation
    const attestation = await attestationManager.loadAttestation(id);
    
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

    // Verify the signed payload using MusicIdentitySDK
    const verification = MusicIdentitySDK.verifyActionSignature(
      signedPayload,
      signedPayload.publicKey
    );

    if (!verification.valid) {
      return res.status(401).json({
        success: false,
        error: `Signature verification failed: ${verification.reason}`
      });
    }

    // Check that the public key belongs to the user
    const keyType = verification.keyType || signerInfo.role;
    const expectedPublicKey = user.cryptoIdentity.derivedKeys[keyType];
    
    if (signedPayload.publicKey !== expectedPublicKey) {
      return res.status(401).json({
        success: false,
        error: 'Public key does not match user identity'
      });
    }

    // Validate key type for attestation action
    const requiredKeyType = ATTESTATION_KEY_RULES[attestation.action];
    if (requiredKeyType && keyType !== requiredKeyType) {
      return res.status(400).json({
        success: false,
        error: `Action "${attestation.action}" requires "${requiredKeyType}" key, got "${keyType}"`
      });
    }

    // Extract private key from signed payload to create attestation signature
    // Note: In production, this would be handled more securely
    const privateKeyWIF = reconstructPrivateKeyForSigning(signedPayload, user, keyType);
    
    // Add signature to attestation
    const signingInfo = {
      role: keyType,
      name: user.profile?.firstName + ' ' + user.profile?.lastName || 'Anonymous',
      pubkey: signedPayload.publicKey,
      derivation: `m/44'/236'/${getKeyTypeIndex(keyType)}'/0/0`,
      ...signerInfo
    };

    const result = await attestationManager.signAttestation(id, privateKeyWIF, signingInfo);
    
    res.json({
      success: true,
      result,
      attestation: {
        id: attestation.id,
        signatures: result.signatures_count,
        complete: result.complete,
        finalized: attestation.metadata.finalized
      },
      message: result.complete 
        ? '🎉 All signatures collected! Contract is now legally binding.' 
        : `✅ Signature added. ${result.signatures_count} signatures collected.`
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Verify attestation signatures
 */
router.get('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    
    const attestation = await attestationManager.loadAttestation(id);
    const verification = attestation.verifyAllSignatures();
    
    res.json({
      success: true,
      attestation_id: id,
      verification,
      contract_hash: attestation.metadata.contract_hash,
      blockchain_hash: attestation.getAnchorHash(),
      status: verification.finalized ? 'FINALIZED' : 'PENDING_SIGNATURES',
      legal_status: verification.all_valid && verification.finalized 
        ? 'LEGALLY_BINDING' 
        : 'DRAFT'
    });

  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * List all attestations
 */
router.get('/', async (req, res) => {
  try {
    const { identityAddress, status, templateType } = req.query;
    
    let attestations = await attestationManager.listAttestations();
    
    // Filter by criteria if provided
    if (status) {
      const isFinalized = status === 'finalized';
      attestations = attestations.filter(a => a.finalized === isFinalized);
    }
    
    if (templateType) {
      attestations = attestations.filter(a => a.action === templateType);
    }

    // TODO: Filter by user involvement if identityAddress provided
    // This would require checking signature participants
    
    res.json({
      success: true,
      count: attestations.length,
      attestations,
      filters: { status, templateType, identityAddress }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create attestation with API signing (all-in-one)
 */
router.post('/create-and-sign', async (req, res) => {
  try {
    const { 
      templateType, 
      fields, 
      signerCredentials,  // Array of { identityAddress, signedPayload }
      options = {}
    } = req.body;

    if (!templateType || !fields) {
      return res.status(400).json({
        success: false,
        error: 'Template type and fields required'
      });
    }

    if (!signerCredentials || !Array.isArray(signerCredentials)) {
      return res.status(400).json({
        success: false,
        error: 'Signer credentials array required'
      });
    }

    await connectDatabase();

    // Create attestation
    const attestation = await attestationManager.createAttestation(templateType, fields, options);
    
    // Add signatures from each signer
    const signatureResults = [];
    
    for (const signer of signerCredentials) {
      try {
        const user = await User.findOne({
          'cryptoIdentity.address': signer.identityAddress
        });

        if (!user) {
          signatureResults.push({
            identityAddress: signer.identityAddress,
            success: false,
            error: 'User not found'
          });
          continue;
        }

        // Verify signed payload
        const verification = MusicIdentitySDK.verifyActionSignature(
          signer.signedPayload,
          signer.signedPayload.publicKey
        );

        if (!verification.valid) {
          signatureResults.push({
            identityAddress: signer.identityAddress,
            success: false,
            error: `Invalid signature: ${verification.reason}`
          });
          continue;
        }

        // Add signature to attestation (simplified for API)
        const keyType = verification.keyType || CONTRACT_TEMPLATES[templateType].key_type;
        const signingInfo = {
          role: keyType,
          name: user.profile?.firstName + ' ' + user.profile?.lastName || 'API User',
          pubkey: signer.signedPayload.publicKey,
          derivation: `m/44'/236'/${getKeyTypeIndex(keyType)}'/0/0`
        };

        // This is a simplified version - in production, handle private keys more securely
        const mockPrivateKey = 'mock_key_for_api_demo';
        const result = await attestation.addSignature(mockPrivateKey, signingInfo);
        
        signatureResults.push({
          identityAddress: signer.identityAddress,
          success: true,
          signer: signingInfo.name
        });

      } catch (error) {
        signatureResults.push({
          identityAddress: signer.identityAddress,
          success: false,
          error: error.message
        });
      }
    }

    res.status(201).json({
      success: true,
      attestation: {
        id: attestation.id,
        contract_hash: attestation.metadata.contract_hash,
        signatures: attestation.signatures.length,
        finalized: attestation.metadata.finalized
      },
      signature_results: signatureResults,
      contract_text: attestation.getContractText()
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Export attestation for blockchain anchoring
 */
router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;
    
    const attestation = await attestationManager.loadAttestation(id);
    
    if (format === 'blockchain') {
      // Minimal format for blockchain anchoring
      const anchorData = {
        attestation_id: attestation.id,
        contract_hash: attestation.metadata.contract_hash,
        signatures: attestation.signatures.map(sig => ({
          pubkey: sig.pubkey,
          signature: sig.signature
        })),
        finalized: attestation.metadata.finalized,
        anchor_hash: attestation.getAnchorHash()
      };
      
      res.json({
        success: true,
        format: 'blockchain',
        data: anchorData,
        op_return_data: Buffer.from(JSON.stringify(anchorData)).toString('hex')
      });
      
    } else {
      // Full export
      res.json({
        success: true,
        format: 'json',
        data: attestation.export()
      });
    }

  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Utility Functions
 */

function getKeyTypeIndex(keyType) {
  const indices = {
    identity: 0,
    property: 1,
    contractual: 2,
    privacy: 3,
    messages: 4,
    financial: 5,
    document: 6
  };
  return indices[keyType] || 0;
}

function reconstructPrivateKeyForSigning(signedPayload, user, keyType) {
  // In a real implementation, this would securely reconstruct or reference
  // the private key for signing. For demo purposes, we'll use a mock.
  // The actual signing would happen client-side with the user's private keys.
  return 'mock_private_key_for_demo';
}

export default router;