# MuniFi-X Tools

A unified interface for BSV cryptographic utilities and key management.

## Overview

The tools directory provides a comprehensive set of utilities for Bitcoin SV operations:

- **DER Signatures**: Sign and verify data using Bitcoin-standard DER encoding
- **Key Management**: Generate, validate, and manage BSV key pairs
- **JWT Secrets**: Generate cryptographically secure secrets for authentication
- **Batch Operations**: Sign multiple data items efficiently
- **Identity Management**: Create complete identity objects with built-in methods

## Quick Start

```javascript
import tools from './tools/index.js';

// Generate a key pair
const keyPair = tools.generateKeyPair();
console.log('Address:', keyPair.address);

// Sign data
const signature = tools.signData('Hello BSV!', keyPair.privateKey);

// Verify signature  
const isValid = tools.verifySignature('Hello BSV!', signature, keyPair.publicKey);
```

## API Reference

### Key Generation

#### `generateKeyPair(options)`
Generate a new BSV key pair.

```javascript
const keyPair = tools.generateKeyPair({ network: 'mainnet' });
// Returns: { privateKey, publicKey, address, network }
```

#### `generateMultipleKeys(count)`
Generate multiple key pairs for testing.

```javascript
const keys = tools.generateMultipleKeys(5);
// Returns: Array of key pair objects with IDs
```

### Signing & Verification

#### `signData(data, privateKeyWIF)`
Sign data using DER encoding.

```javascript
const signature = tools.signData('Hello BSV!', privateKey);
// Returns: DER-encoded signature in hex
```

#### `verifySignature(data, signatureHex, publicKey)`
Verify a DER signature.

```javascript
const isValid = tools.verifySignature(data, signature, publicKey);
// Returns: boolean
```

#### `signAndVerify(data, privateKeyWIF)`
Sign data and immediately verify (useful for testing).

```javascript
const result = tools.signAndVerify('Test data', privateKey);
// Returns: { data, signature, publicKey, address, isValid, timestamp }
```

#### `createSignedResponse(data, privateKeyWIF)`
Create a structured signature response (AgentOS compatible).

```javascript
const response = tools.createSignedResponse('Hello BSV!', privateKey);
// Returns: { data, signature, address, publicKey, encoding, format, timestamp }
```

### Batch Operations

#### `batchSign(dataArray, privateKeyWIF)`
Sign multiple data items in one operation.

```javascript
const signatures = tools.batchSign(['msg1', 'msg2', 'msg3'], privateKey);
// Returns: Array of signature objects
```

### Identity Management

#### `createIdentity(name, options)`
Create a complete identity with keys and methods.

```javascript
const identity = tools.createIdentity('Alice');
// Returns identity object with built-in sign/verify methods

// Use identity methods
const signature = identity.sign('Hello World');
const isValid = identity.verify('Hello World', signature);
```

### Utilities

#### `generateJWTSecret(length)`
Generate cryptographically secure JWT secret.

```javascript
const secret = tools.generateJWTSecret(64); // 64 bytes = 128 hex chars
```

#### `getKeyDetails(privateKeyWIF)`
Get comprehensive key information.

```javascript
const details = tools.getKeyDetails(privateKey);
// Returns: { privateKey: {...}, publicKey: {...}, address: {...} }
```

#### `isValidPrivateKey(privateKeyWIF)`
Validate private key format.

```javascript
const isValid = tools.isValidPrivateKey(privateKey);
// Returns: boolean
```

#### `isValidAddress(address)`
Validate BSV address format.

```javascript
const isValid = tools.isValidAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2');
// Returns: boolean
```

## CLI Interface

For quick command-line style operations:

```javascript
import { cli } from './tools/index.js';

// Generate key and display
cli.generateKey();

// Generate and display JWT secret
cli.generateSecret(32);

// Sign data and display result
cli.sign('Hello BSV!', privateKey);

// Create identity and display
cli.identity('Alice');
```

## Examples

Run the examples to see all features in action:

```bash
node tools/example.js
```

## File Structure

```
tools/
├── index.js          # Unified interface (THIS FILE)
├── der-signature.js  # DER signature utilities
├── generate-keys.js  # Simple key generator
├── generate-secret.js # JWT secret generator
├── example.js        # Usage examples
└── README.md         # This documentation
```

## Integration Examples

### With Publishing System

```javascript
import tools from './tools/index.js';
import { publishData } from './publishMongo.js';

// Create signed data for publishing
const identity = tools.createIdentity('Publisher');
const signedData = identity.createSignedResponse('Hello BSV Blockchain!');

// Publish the signed data
for await (const update of publishData(JSON.stringify(signedData))) {
  if (update.stage === 'done') {
    console.log('Published signed data:', update.txid);
  }
}
```

### With UTXO Management

```javascript
import tools from './tools/index.js';
import { UTXOManagerMongo } from './utxoManagerMongo.js';

// Validate wallet before using
const wallet = await loadWallet();
if (!tools.isValidPrivateKey(wallet.privateKey)) {
  throw new Error('Invalid wallet private key');
}

// Get key details
const keyDetails = tools.getKeyDetails(wallet.privateKey);
console.log('Wallet addresses:', keyDetails.address);
```

## Security Notes

- Never expose private keys in logs or client-side code
- Use `generateJWTSecret()` for session secrets, not key generation
- Always validate inputs with `isValidPrivateKey()` and `isValidAddress()`
- DER signatures are Bitcoin-standard and blockchain-compatible
- All cryptographic operations use the `smartledger-bsv` library

## License

Part of the MuniFi-X project.