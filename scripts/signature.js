import bsv from 'smartledger-bsv';
import dotenv from 'dotenv';

dotenv.config();

// Platform identity keys from environment
const platformIdentity = process.env.PLATFORM_IDENTITY_WIF || bsv.PrivateKey.fromRandom().toWIF();
const agentIdentity = process.env.AGENT_IDENTITY_WIF || bsv.PrivateKey.fromRandom().toWIF();
const userIdentity = process.env.USER_IDENTITY_WIF || bsv.PrivateKey.fromRandom().toWIF();

export async function signData(data, privateKeyWIF = null) {
  const privateKey = privateKeyWIF ? 
    bsv.PrivateKey.fromWIF(privateKeyWIF) : 
    bsv.PrivateKey.fromWIF(platformIdentity);
  
  const message = bsv.Message.fromString(data);
  const signature = message.sign(privateKey);
  return signature;
}

export async function verifySignature(data, signature, address = null) {
  // If no address provided, use platform address
  const targetAddress = address || bsv.Address.fromPublicKey(bsv.PrivateKey.fromWIF(platformIdentity).toPublicKey()).toString();
  
  const message = bsv.Message.fromString(data);
  return message.verify(targetAddress, signature);
}

// New function to get address from private key
export function getAddressFromPrivateKey(privateKeyWIF) {
  const privateKey = bsv.PrivateKey.fromWIF(privateKeyWIF);
  const publicKey = privateKey.toPublicKey();
  return bsv.Address.fromPublicKey(publicKey).toString();
}

// Helper function to create agent keys from environment
export function createAgentKeys(agentType = 'platform') {
  let privateKeyWIF;
  let agentName;
  
  switch (agentType) {
    case 'agent':
      privateKeyWIF = agentIdentity;
      agentName = 'AgentOS';
      break;
    case 'user':
      privateKeyWIF = userIdentity;
      agentName = 'UserOS';
      break;
    case 'platform':
    default:
      privateKeyWIF = platformIdentity;
      agentName = 'Platform';
      break;
  }
  
  const privateKey = bsv.PrivateKey.fromWIF(privateKeyWIF);
  const publicKey = privateKey.toPublicKey();
  const address = bsv.Address.fromPublicKey(publicKey).toString();
  
  return {
    privateKey: privateKeyWIF,
    publicKey: publicKey.toString(),
    address: address,
    agentName: agentName
  };
}

//example usage:
async function example() {
  try {
    const data = "Important message";
    const signature = await signData(data);
    console.log("Signature:", signature.toString());

    const isValid = await verifySignature(data, signature);
    console.log("Is signature valid?", isValid);
    
    return isValid;
  } catch (error) {
    console.error("Example error:", error);
    return false;
  }
}

// Uncomment to run the example
// example();

// Export platform keys
export const platformPrivateKey = bsv.PrivateKey.fromWIF(platformIdentity);
export const platformPublicKey = platformPrivateKey.toPublicKey();
export const platformAddress = bsv.Address.fromPublicKey(platformPublicKey).toString();

// Export agent keys
export const agentPrivateKey = bsv.PrivateKey.fromWIF(agentIdentity);
export const agentPublicKey = agentPrivateKey.toPublicKey();
export const agentAddress = bsv.Address.fromPublicKey(agentPublicKey).toString();

// Export user keys
export const userPrivateKey = bsv.PrivateKey.fromWIF(userIdentity);
export const userPublicKey = userPrivateKey.toPublicKey();
export const userAddress = bsv.Address.fromPublicKey(userPublicKey).toString();

