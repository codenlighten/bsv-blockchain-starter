import crypto from 'crypto';
import bsv from 'smartledger-bsv';
import {
  signData,
  verifySignature,
  getAddressFromPrivateKey,
  getPublicKeyFromPrivateKey,
  createSignedResponse
} from './der-signature.js';

/**
 * Unified Tools Interface for MuniFi-X
 * Provides easy access to cryptographic utilities
 */

// Re-export DER signature functions
export {
  signData,
  verifySignature,
  getAddressFromPrivateKey,
  getPublicKeyFromPrivateKey,
  createSignedResponse
} from './der-signature.js';

/**
 * Generate BSV key pair
 * @param {Object} options - Generation options
 * @param {string} options.network - Network ('mainnet' or 'testnet')
 * @returns {Object} Key pair with privateKey, publicKey, and address
 */
export function generateKeyPair(options = {}) {
  const { network = 'mainnet' } = options;
  
  const privateKey = bsv.PrivateKey.fromRandom();
  const publicKey = privateKey.toPublicKey();
  const address = bsv.Address.fromPublicKey(publicKey, network);

  return {
    privateKey: privateKey.toWIF(),
    publicKey: publicKey.toString(),
    address: address.toString(),
    network
  };
}

/**
 * Generate JWT secret
 * @param {number} length - Length in bytes (default: 64)
 * @returns {string} Hex-encoded secret
 */
export function generateJWTSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Validate BSV private key format
 * @param {string} privateKeyWIF - Private key in WIF format
 * @returns {boolean} True if valid
 */
export function isValidPrivateKey(privateKeyWIF) {
  try {
    bsv.PrivateKey.fromWIF(privateKeyWIF);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate BSV address format
 * @param {string} address - BSV address
 * @returns {boolean} True if valid
 */
export function isValidAddress(address) {
  try {
    bsv.Address.fromString(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert private key to all related formats
 * @param {string} privateKeyWIF - Private key in WIF format
 * @returns {Object} All key formats and address
 */
export function getKeyDetails(privateKeyWIF) {
  if (!isValidPrivateKey(privateKeyWIF)) {
    throw new Error('Invalid private key format');
  }

  const privateKey = bsv.PrivateKey.fromWIF(privateKeyWIF);
  const publicKey = privateKey.toPublicKey();
  const address = bsv.Address.fromPublicKey(publicKey);

  return {
    privateKey: {
      wif: privateKey.toWIF(),
      hex: privateKey.toString(),
      bn: privateKey.bn.toString()
    },
    publicKey: {
      hex: publicKey.toString(),
      compressed: publicKey.toString(),
      uncompressed: publicKey.toString(false)
    },
    address: {
      mainnet: address.toString(),
      testnet: bsv.Address.fromPublicKey(publicKey, 'testnet').toString()
    }
  };
}

/**
 * Sign and verify data in one operation (for testing)
 * @param {string} data - Data to sign
 * @param {string} privateKeyWIF - Private key in WIF format
 * @returns {Object} Signature and verification result
 */
export function signAndVerify(data, privateKeyWIF) {
  const signature = signData(data, privateKeyWIF);
  const publicKey = getPublicKeyFromPrivateKey(privateKeyWIF);
  const isValid = verifySignature(data, signature, publicKey);
  
  return {
    data,
    signature,
    publicKey,
    address: getAddressFromPrivateKey(privateKeyWIF),
    isValid,
    timestamp: new Date().toISOString()
  };
}

/**
 * Generate multiple key pairs for testing
 * @param {number} count - Number of key pairs to generate
 * @returns {Array} Array of key pair objects
 */
export function generateMultipleKeys(count = 5) {
  const keys = [];
  
  for (let i = 0; i < count; i++) {
    keys.push({
      id: i + 1,
      ...generateKeyPair(),
      generated: new Date().toISOString()
    });
  }
  
  return keys;
}

/**
 * Create a complete identity object with keys and signature capability
 * @param {string} name - Identity name
 * @param {Object} options - Additional options
 * @returns {Object} Complete identity object
 */
export function createIdentity(name, options = {}) {
  const keyPair = generateKeyPair(options);
  const jwtSecret = generateJWTSecret();
  
  return {
    name,
    id: crypto.randomUUID(),
    ...keyPair,
    jwtSecret,
    created: new Date().toISOString(),
    
    // Helper methods bound to this identity
    sign: (data) => signData(data, keyPair.privateKey),
    verify: (data, signature) => verifySignature(data, signature, keyPair.publicKey),
    createSignedResponse: (data) => createSignedResponse(data, keyPair.privateKey)
  };
}

/**
 * Utility to check if data was signed by a specific address
 * @param {string} data - Original data
 * @param {string} signature - DER signature in hex
 * @param {string} address - Expected signer address
 * @returns {boolean} True if signature matches address
 */
export function verifySignatureByAddress(data, signature, address) {
  try {
    // We need to derive the public key from the signature and data
    // This is a simplified approach - in practice you'd need the public key
    console.warn('verifySignatureByAddress: Requires public key for full verification');
    return false; // Placeholder - would need public key recovery
  } catch {
    return false;
  }
}

/**
 * Batch sign multiple data items
 * @param {Array} dataArray - Array of strings to sign
 * @param {string} privateKeyWIF - Private key in WIF format
 * @returns {Array} Array of signature objects
 */
export function batchSign(dataArray, privateKeyWIF) {
  const publicKey = getPublicKeyFromPrivateKey(privateKeyWIF);
  const address = getAddressFromPrivateKey(privateKeyWIF);
  
  return dataArray.map((data, index) => ({
    index,
    data,
    signature: signData(data, privateKeyWIF),
    publicKey,
    address,
    timestamp: new Date().toISOString()
  }));
}

/**
 * CLI-style interface for quick operations
 */
export const cli = {
  generateKey: () => {
    const keyPair = generateKeyPair();
    console.log('🔑 Generated new BSV key pair:');
    console.log(`Private Key: ${keyPair.privateKey}`);
    console.log(`Public Key:  ${keyPair.publicKey}`);
    console.log(`Address:     ${keyPair.address}`);
    return keyPair;
  },
  
  generateSecret: (length = 64) => {
    const secret = generateJWTSecret(length);
    console.log(`🔐 Generated JWT secret (${length} bytes): ${secret}`);
    return secret;
  },
  
  sign: (data, privateKey) => {
    const result = signAndVerify(data, privateKey);
    console.log('✍️  Signed data:');
    console.log(`Data:      ${result.data}`);
    console.log(`Signature: ${result.signature}`);
    console.log(`Valid:     ${result.isValid}`);
    console.log(`Address:   ${result.address}`);
    return result;
  },
  
  identity: (name) => {
    const identity = createIdentity(name);
    console.log(`👤 Created identity "${name}":`)
    console.log(`ID:      ${identity.id}`);
    console.log(`Address: ${identity.address}`);
    console.log(`Created: ${identity.created}`);
    return identity;
  }
};

// Default export for convenience
export default {
  // Key management
  generateKeyPair,
  generateJWTSecret,
  generateMultipleKeys,
  createIdentity,
  
  // Validation
  isValidPrivateKey,
  isValidAddress,
  getKeyDetails,
  
  // Signing
  signData,
  verifySignature,
  signAndVerify,
  batchSign,
  createSignedResponse,
  
  // Utilities
  getAddressFromPrivateKey,
  getPublicKeyFromPrivateKey,
  verifySignatureByAddress,
  
  // CLI interface
  cli
};