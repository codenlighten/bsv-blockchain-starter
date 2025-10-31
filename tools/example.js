#!/usr/bin/env node

/**
 * Example usage of the unified tools interface
 * Run with: node tools/example.js
 */

import tools from './index.js';

console.log('🚀 MuniFi-X Tools Interface Examples\n');

// Example 1: Generate a key pair
console.log('📝 Example 1: Generate Key Pair');
const keyPair = tools.generateKeyPair();
console.log('Generated:', keyPair);
console.log();

// Example 2: Generate JWT secret
console.log('🔐 Example 2: Generate JWT Secret');
const secret = tools.generateJWTSecret(32); // 32 bytes = 64 hex chars
console.log('JWT Secret:', secret);
console.log();

// Example 3: Sign and verify data
console.log('✍️  Example 3: Sign and Verify Data');
const testData = 'Hello from MuniFi-X tools!';
const signResult = tools.signAndVerify(testData, keyPair.privateKey);
console.log('Sign & Verify Result:', {
  data: signResult.data,
  signature: signResult.signature.substring(0, 32) + '...', // Truncate for display
  isValid: signResult.isValid,
  address: signResult.address
});
console.log();

// Example 4: Create complete identity
console.log('👤 Example 4: Create Identity');
const identity = tools.createIdentity('TestUser');
console.log('Identity:', {
  name: identity.name,
  id: identity.id,
  address: identity.address,
  created: identity.created
});

// Test identity methods
const identitySignature = identity.sign('Test message for identity');
const identityVerification = identity.verify('Test message for identity', identitySignature);
console.log('Identity signature test:', identityVerification);
console.log();

// Example 5: Get detailed key information
console.log('🔍 Example 5: Key Details');
const keyDetails = tools.getKeyDetails(keyPair.privateKey);
console.log('Key Details:', {
  privateKeyWIF: keyDetails.privateKey.wif,
  publicKeyHex: keyDetails.publicKey.hex,
  addressMainnet: keyDetails.address.mainnet,
  addressTestnet: keyDetails.address.testnet
});
console.log();

// Example 6: Batch signing
console.log('📦 Example 6: Batch Signing');
const dataItems = [
  'First message',
  'Second message', 
  'Third message'
];
const batchResults = tools.batchSign(dataItems, keyPair.privateKey);
console.log('Batch signed:', batchResults.map(r => ({
  data: r.data,
  signature: r.signature.substring(0, 16) + '...', // Truncate for display
  address: r.address
})));
console.log();

// Example 7: Validation
console.log('✅ Example 7: Validation');
console.log('Valid private key?', tools.isValidPrivateKey(keyPair.privateKey));
console.log('Valid address?', tools.isValidAddress(keyPair.address));
console.log('Invalid private key?', tools.isValidPrivateKey('invalid-key'));
console.log('Invalid address?', tools.isValidAddress('invalid-address'));
console.log();

// Example 8: CLI-style usage
console.log('💻 Example 8: CLI-style Interface');
console.log('CLI generate key:');
const cliKey = tools.cli.generateKey();
console.log();

console.log('CLI generate secret:');
const cliSecret = tools.cli.generateSecret(16);
console.log();

console.log('CLI sign data:');
const cliSign = tools.cli.sign('CLI test message', cliKey.privateKey);
console.log();

console.log('CLI create identity:');
const cliIdentity = tools.cli.identity('CLIUser');
console.log();

console.log('✨ All examples completed successfully!');