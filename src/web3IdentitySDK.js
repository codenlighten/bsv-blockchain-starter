/**
 * Web3 Identity SDK for AI Record Label Platform
 * Handles BIP32/BIP44 HD derivation, signatures, and cryptographic identity management
 * Based on web3keys.html pattern with enhanced functionality for music industry use cases
 */

import bsv from 'smartledger-bsv';
import crypto from 'crypto';

/**
 * Music Industry Identity Derivation Paths (BIP44 Compatible)
 * Each role in the music ecosystem has dedicated cryptographic keys
 */
const DERIVATION_PATHS = {
  // Core identity verification (artist profiles, user registration)
  identity: "m/44'/236'/0'/0/0",
  
  // Property rights (song ownership, copyright, publishing)
  property: "m/44'/236'/1'/0/0",
  
  // Contractual agreements (licensing, collaborations, splits)
  contractual: "m/44'/236'/2'/0/0",
  
  // Privacy & encrypted communications (private messages, confidential docs)
  privacy: "m/44'/236'/3'/0/0",
  
  // Messages & fan interactions (social media, fan communications)  
  messages: "m/44'/236'/4'/0/0",
  
  // Financial transactions (royalty payments, revenue splits)
  financial: "m/44'/236'/5'/0/0",
  
  // Document signing (contracts, agreements, legal docs)
  document: "m/44'/236'/6'/0/0"
};

/**
 * Action-to-Key mapping for signature verification
 */
const ACTION_KEY_MAP = {
  // Identity actions
  'register-identity': 'identity',
  'register-artist': 'identity',
  'update-profile': 'identity',
  'verify-identity': 'identity',
  
  // Property rights actions
  'upload-song': 'property',
  'claim-ownership': 'property',
  'transfer-rights': 'property',
  'publish-release': 'property',
  
  // Contractual actions
  'sign-agreement': 'contractual',
  'approve-collaboration': 'contractual',
  'accept-license': 'contractual',
  'split-royalties': 'contractual',
  
  // Privacy actions
  'encrypt-message': 'privacy',
  'private-communication': 'privacy',
  'confidential-document': 'privacy',
  
  // Message actions
  'fan-message': 'messages',
  'social-post': 'messages',
  'community-interaction': 'messages',
  
  // Financial actions
  'withdraw-royalties': 'financial',
  'process-payment': 'financial',
  'revenue-distribution': 'financial',
  
  // Document actions
  'sign-contract': 'document',
  'legal-agreement': 'document',
  'official-document': 'document'
};

export class MusicIdentitySDK {
  constructor() {
    this.mnemonic = null;
    this.hdWallet = null;
    this.derivedKeys = {};
    this.addresses = {};
    this.publicKeys = {};
  }

  /**
   * Generate new cryptographic identity for music industry professional
   */
  generateIdentity() {
    try {
      // Generate BIP39 mnemonic (12 words for better UX)
      this.mnemonic = bsv.Mnemonic.fromRandom();
      
      // Create HD wallet from mnemonic
      const seed = this.mnemonic.toSeed();
      this.hdWallet = bsv.HDPrivateKey.fromSeed(seed);
      
      // Derive all music industry keys
      this.deriveAllKeys();
      
      return {
        mnemonic: this.mnemonic.toString(),
        identityAddress: this.addresses.identity,
        addresses: this.addresses,
        publicKeys: this.publicKeys,
        derivationPaths: DERIVATION_PATHS
      };
    } catch (error) {
      throw new Error(`Identity generation failed: ${error.message}`);
    }
  }

  /**
   * Restore identity from mnemonic backup
   */
  restoreFromMnemonic(mnemonicPhrase) {
    try {
      this.mnemonic = bsv.Mnemonic.fromString(mnemonicPhrase);
      const seed = this.mnemonic.toSeed();
      this.hdWallet = bsv.HDPrivateKey.fromSeed(seed);
      
      this.deriveAllKeys();
      
      return {
        restored: true,
        addresses: this.addresses,
        publicKeys: this.publicKeys
      };
    } catch (error) {
      throw new Error(`Identity restoration failed: ${error.message}`);
    }
  }

  /**
   * Derive all keys for music industry use cases
   */
  deriveAllKeys() {
    this.derivedKeys = {};
    this.addresses = {};
    this.publicKeys = {};
    
    Object.entries(DERIVATION_PATHS).forEach(([keyType, path]) => {
      const derivedKey = this.hdWallet.deriveChild(path);
      const privateKey = derivedKey.privateKey;
      const publicKey = privateKey.publicKey;
      const address = bsv.Address.fromPublicKey(publicKey);
      
      this.derivedKeys[keyType] = privateKey;
      this.publicKeys[keyType] = publicKey.toString();
      this.addresses[keyType] = address.toString();
    });
  }

  /**
   * Sign data with appropriate key based on action type
   */
  signForAction(action, data, timestamp = null) {
    try {
      // Determine which key to use for this action
      const keyType = ACTION_KEY_MAP[action];
      if (!keyType) {
        throw new Error(`Unknown action type: ${action}`);
      }

      const privateKey = this.derivedKeys[keyType];
      if (!privateKey) {
        throw new Error(`Key not derived for type: ${keyType}`);
      }

      // Create standardized signing payload
      const signingPayload = {
        action,
        data,
        timestamp: timestamp || new Date().toISOString(),
        keyType,
        derivationPath: DERIVATION_PATHS[keyType]
      };

      // Sign the payload
      const message = bsv.Message.fromString(JSON.stringify(signingPayload));
      const signature = message.sign(privateKey);

      return {
        payload: signingPayload,
        signature: signature.toString(),
        publicKey: this.publicKeys[keyType],
        address: this.addresses[keyType],
        signingKey: keyType
      };
    } catch (error) {
      throw new Error(`Signing failed: ${error.message}`);
    }
  }

  /**
   * Verify signature matches expected key type for action
   */
  static verifyActionSignature(signedPayload, publicKey) {
    try {
      const { payload, signature } = signedPayload;
      const expectedKeyType = ACTION_KEY_MAP[payload.action];
      
      if (payload.keyType !== expectedKeyType) {
        return {
          valid: false,
          reason: `Wrong key type. Expected: ${expectedKeyType}, Got: ${payload.keyType}`
        };
      }

      // Verify signature
      const message = bsv.Message.fromString(JSON.stringify(payload));
      const pubKey = bsv.PublicKey.fromString(publicKey);
      const isValid = message.verify(bsv.Address.fromPublicKey(pubKey), signature);

      return {
        valid: isValid,
        action: payload.action,
        keyType: payload.keyType,
        timestamp: payload.timestamp
      };
    } catch (error) {
      return {
        valid: false,
        reason: `Verification error: ${error.message}`
      };
    }
  }

  /**
   * Export encrypted identity backup
   */
  exportEncryptedBackup(password) {
    if (!this.mnemonic) {
      throw new Error('No identity to export');
    }

    try {
      const backupData = {
        mnemonic: this.mnemonic.toString(),
        derivationPaths: DERIVATION_PATHS,
        addresses: this.addresses,
        publicKeys: this.publicKeys,
        exportDate: new Date().toISOString(),
        version: '1.0'
      };

      // Encrypt with password
      const salt = crypto.randomBytes(16);
      const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(JSON.stringify(backupData), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return {
        encrypted,
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        algorithm: 'aes-256-cbc',
        keyDerivation: 'pbkdf2-sha512-100000'
      };
    } catch (error) {
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  /**
   * Import from encrypted backup
   */
  static importFromEncryptedBackup(encryptedBackup, password) {
    try {
      const { encrypted, salt, iv, algorithm } = encryptedBackup;
      
      // Derive key from password
      const key = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 32, 'sha512');
      const ivBuffer = Buffer.from(iv, 'hex');
      
      // Decrypt
      const decipher = crypto.createDecipheriv(algorithm, key, ivBuffer);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      const backupData = JSON.parse(decrypted);
      
      // Restore identity
      const sdk = new MusicIdentitySDK();
      sdk.restoreFromMnemonic(backupData.mnemonic);
      
      return sdk;
    } catch (error) {
      throw new Error(`Import failed: ${error.message}`);
    }
  }

  /**
   * Generate registration payload for backend
   */
  generateRegistrationPayload(userInfo) {
    if (!this.addresses.identity) {
      throw new Error('Identity not generated');
    }

    const registrationData = {
      userInfo,
      identityAddress: this.addresses.identity,
      publicKeys: this.publicKeys,
      addresses: this.addresses,
      registrationDate: new Date().toISOString()
    };

    // Sign with identity key
    return this.signForAction('register-artist', registrationData);
  }

  /**
   * Create authentication challenge response
   */
  createAuthChallenge(challenge) {
    const authData = {
      challenge,
      timestamp: new Date().toISOString(),
      identityAddress: this.addresses.identity
    };

    return this.signForAction('verify-identity', authData);
  }
}

export { DERIVATION_PATHS, ACTION_KEY_MAP };
export default MusicIdentitySDK;