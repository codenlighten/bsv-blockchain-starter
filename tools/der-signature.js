import bsv from 'smartledger-bsv';

/**
 * Sign data with a private key using DER encoding
 * @param {string} data - The data to sign
 * @param {string} privateKeyWIF - Private key in WIF format
 * @returns {string} The DER-encoded signature in hex format
 */
function signData(data, privateKeyWIF) {
  const privateKey = bsv.PrivateKey.fromWIF(privateKeyWIF);
  const messageBuf = Buffer.from(data, 'utf8');
  const messageHash = bsv.crypto.Hash.sha256(messageBuf);

  // Create ECDSA signature
  const signature = bsv.crypto.ECDSA.sign(messageHash, privateKey);

  // Return DER-encoded signature as hex string
  return signature.toDER().toString('hex');
}

/**
 * Verify a DER-encoded signature against data and public key
 * @param {string} data - The original data that was signed
 * @param {string} signatureHex - The DER-encoded signature in hex format
 * @param {string} publicKey - The public key in hex or string format
 * @returns {boolean} True if signature is valid
 */
function verifySignature(data, signatureHex, publicKey) {
  try {
    const messageBuf = Buffer.from(data, 'utf8');
    const publicKeyObj = bsv.PublicKey.fromString(publicKey);
    const messageHash = bsv.crypto.Hash.sha256(messageBuf);
    const signatureDER = Buffer.from(signatureHex, 'hex');
    const signature = bsv.crypto.Signature.fromDER(signatureDER);

    return bsv.crypto.ECDSA.verify(messageHash, signature, publicKeyObj);
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

/**
 * Get address from private key
 * @param {string} privateKeyWIF - Private key in WIF format
 * @returns {string} The BSV address
 */
function getAddressFromPrivateKey(privateKeyWIF) {
  const privateKey = bsv.PrivateKey.fromWIF(privateKeyWIF);
  return bsv.Address.fromPublicKey(privateKey.toPublicKey()).toString();
}

/**
 * Get public key from private key
 * @param {string} privateKeyWIF - Private key in WIF format
 * @returns {string} The public key in hex format
 */
function getPublicKeyFromPrivateKey(privateKeyWIF) {
  const privateKey = bsv.PrivateKey.fromWIF(privateKeyWIF);
  return privateKey.toPublicKey().toString();
}

/**
 * Create a signature response object (similar to AgentOS format)
 * @param {string} data - The data to sign
 * @param {string} privateKeyWIF - Private key in WIF format
 * @returns {object} Signature response object
 */
function createSignedResponse(data, privateKeyWIF) {
  const signature = signData(data, privateKeyWIF);
  const address = getAddressFromPrivateKey(privateKeyWIF);
  const publicKey = getPublicKeyFromPrivateKey(privateKeyWIF);
  
  return {
    data,
    signature,
    address,
    publicKey,
    encoding: 'DER',
    format: 'hex',
    timestamp: new Date().toISOString()
  };
}

export { signData, verifySignature, getAddressFromPrivateKey, getPublicKeyFromPrivateKey, createSignedResponse };

// Example usage
function example() {
  try {
    const testPrivateKey =
      process.env.AGENT_PRIVATE_KEY || bsv.PrivateKey.fromRandom().toWIF();
    const privateKey = bsv.PrivateKey.fromWIF(testPrivateKey);
    const testPublicKey = privateKey.toPublicKey().toString();
    const testData = 'Hello, BSV DER signatures!';

    console.log('Testing BSV DER signatures...\n');
    console.log('Private Key:', testPrivateKey);
    console.log('Public Key:', testPublicKey);
    console.log('Address:', getAddressFromPrivateKey(testPrivateKey));
    console.log('Data to sign:', testData);
    console.log();

    // Test basic signing
    const signature = signData(testData, testPrivateKey);
    console.log('Signature (DER hex):', signature);

    const isValid = verifySignature(testData, signature, testPublicKey);
    console.log('Is signature valid?', isValid);
    
    // Test signed response format
    console.log('\n--- Signed Response Format ---');
    const signedResponse = createSignedResponse(testData, testPrivateKey);
    console.log(JSON.stringify(signedResponse, null, 2));

    // Verify the signed response
    const responseValid = verifySignature(
      signedResponse.data, 
      signedResponse.signature, 
      signedResponse.publicKey
    );
    console.log('Is signed response valid?', responseValid);

    return isValid && responseValid;
  } catch (error) {
    console.error('Example error:', error);
    return false;
  }
}

example();
