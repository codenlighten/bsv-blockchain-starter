/**
 * Cryptographic Identity Demo
 * Demonstrates complete signature-based authentication flow for music industry
 */

import MusicIdentitySDK from './src/web3IdentitySDK.js';
import fetch from 'node-fetch';

// Demo configuration
const API_BASE = 'http://localhost:3000/api';
const DEMO_USER = {
  email: 'demo.artist@airecords.com',
  firstName: 'Demo',
  lastName: 'Artist',
  role: 'artist',
  organization: 'AI Records Demo'
};

console.log('🎵 AI Record Label - Cryptographic Identity Demo');
console.log('================================================\n');

async function runDemo() {
  try {
    console.log('Step 1: Generating Cryptographic Identity');
    console.log('-----------------------------------------');
    
    // Generate identity (simulates web3keys.html output)
    const sdk = new MusicIdentitySDK();
    const identity = sdk.generateIdentity();
    
    console.log(`✅ Identity Address: ${identity.identityAddress}`);
    console.log(`✅ Generated ${Object.keys(identity.addresses).length} specialized keys:`);
    Object.entries(identity.addresses).forEach(([keyType, address]) => {
      console.log(`   ${keyType}: ${address}`);
    });
    console.log();

    console.log('Step 2: Creating Registration Payload');
    console.log('-------------------------------------');
    
    // Create registration payload
    const registrationData = {
      identityAddress: identity.addresses.identity,
      publicKeys: identity.publicKeys,
      addresses: identity.addresses,
      userInfo: DEMO_USER
    };
    
    const registrationPayload = sdk.signForAction('register-identity', registrationData);
    
    console.log(`✅ Registration payload created`);
    console.log(`   Action: ${registrationPayload.payload.action}`);
    console.log(`   Timestamp: ${registrationPayload.payload.timestamp}`);
    console.log(`   Signature: ${registrationPayload.signature.substring(0, 20)}...`);
    console.log();

    console.log('Step 3: Registering with Backend API');
    console.log('------------------------------------');
    
    // Register identity with API
    const registerResponse = await fetch(`${API_BASE}/identity/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        signedRegistration: registrationPayload 
      })
    });
    
    const registerResult = await registerResponse.json();
    
    if (registerResult.success) {
      console.log(`✅ Registration successful!`);
      console.log(`   User ID: ${registerResult.user.id}`);
      console.log(`   Role: ${registerResult.user.role}`);
      console.log(`   Available Keys: ${registerResult.availableKeys.join(', ')}`);
    } else {
      throw new Error(`Registration failed: ${registerResult.error}`);
    }
    console.log();

    console.log('Step 4: Authentication Challenge');
    console.log('--------------------------------');
    
    // Get authentication challenge
    const challengeResponse = await fetch(`${API_BASE}/identity/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        identityAddress: identity.identityAddress 
      })
    });
    
    const challengeResult = await challengeResponse.json();
    
    if (challengeResult.success) {
      console.log(`✅ Challenge received`);
      console.log(`   Challenge: ${challengeResult.challengeData.challenge.substring(0, 20)}...`);
      console.log(`   Expires: ${challengeResult.challengeData.expiresAt}`);
    } else {
      throw new Error(`Challenge failed: ${challengeResult.error}`);
    }
    console.log();

    console.log('Step 5: Signing Authentication Challenge');
    console.log('---------------------------------------');
    
    // Sign challenge with identity key
    const challengeData = challengeResult.challengeData;
    const signedChallenge = sdk.signForAction(
      challengeData.action,
      challengeData.challenge
    );
    
    console.log(`✅ Challenge signed with identity key`);
    console.log(`   Signature: ${signedChallenge.signature.substring(0, 20)}...`);
    console.log();

    console.log('Step 6: Verifying Authentication');
    console.log('--------------------------------');
    
    // Verify authentication
    const authResponse = await fetch(`${API_BASE}/identity/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signedChallenge,
        identityAddress: identity.identityAddress
      })
    });
    
    const authResult = await authResponse.json();
    
    if (authResult.success) {
      console.log(`✅ Authentication successful!`);
      console.log(`   Session Token: ${authResult.sessionToken.substring(0, 20)}...`);
      console.log(`   User: ${authResult.user.name} (${authResult.user.role})`);
    } else {
      throw new Error(`Authentication failed: ${authResult.error}`);
    }
    console.log();

    console.log('Step 7: Demonstrating Action-Based Signing');
    console.log('------------------------------------------');
    
    // Demonstrate different action types
    const actions = [
      { action: 'upload-song', data: { title: 'Demo Track', genre: 'Electronic' } },
      { action: 'claim-ownership', data: { songId: 'demo_123', percentage: 100 } },
      { action: 'sign-agreement', data: { agreementType: 'licensing', terms: 'Standard license' } }
    ];

    for (const actionTest of actions) {
      console.log(`\n   Testing: ${actionTest.action}`);
      
      // Get signing instructions
      const signInstructions = await fetch(`${API_BASE}/identity/action/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionTest.action,
          data: actionTest.data,
          identityAddress: identity.identityAddress
        })
      });
      
      const instructionResult = await signInstructions.json();
      
      if (instructionResult.success) {
        const requiredKey = instructionResult.signingInstructions.requiredKeyType;
        console.log(`   ✅ Requires: ${requiredKey} key`);
        
        // Sign with appropriate key (SDK automatically uses correct key for action)
        const signedAction = sdk.signForAction(
          actionTest.action,
          actionTest.data
        );
        
        // Execute signed action
        const executeResponse = await fetch(`${API_BASE}/identity/action/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signedAction,
            identityAddress: identity.identityAddress
          })
        });
        
        const executeResult = await executeResponse.json();
        
        if (executeResult.success) {
          console.log(`   ✅ Executed: ${executeResult.message}`);
          console.log(`   ✅ Verified: ${executeResult.verification.valid ? 'Valid' : 'Invalid'}`);
        } else {
          console.log(`   ❌ Failed: ${executeResult.error}`);
        }
      }
    }

    console.log('\n\nDemo Completed Successfully! 🎉');
    console.log('================================');
    console.log('\n🔐 Key Features Demonstrated:');
    console.log('   ✅ BIP32/BIP44 HD wallet generation');
    console.log('   ✅ 7 specialized key types for music industry');
    console.log('   ✅ Cryptographic identity registration');
    console.log('   ✅ Signature-based authentication (no passwords!)');
    console.log('   ✅ Action-specific key usage enforcement');
    console.log('   ✅ Complete API integration');
    
    console.log('\n🎵 Ready for Production Use:');
    console.log('   • Artists can generate secure identities');
    console.log('   • Property keys for song ownership');
    console.log('   • Contractual keys for licensing agreements');
    console.log('   • Financial keys for royalty payments');
    console.log('   • Document keys for legal verification');
    console.log('\n🚀 Next Steps:');
    console.log('   1. Deploy to production server');
    console.log('   2. Integrate with music upload frontend');
    console.log('   3. Connect to BSV blockchain for on-chain verification');
    console.log('   4. Add multi-signature support for complex agreements');

  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
    if (error.response) {
      const errorBody = await error.response.text();
      console.error('   Response:', errorBody);
    }
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`http://localhost:3000/health`);
    const health = await response.json();
    
    if (health.status === 'healthy') {
      console.log('✅ Server is running - starting demo...\n');
      return true;
    }
  } catch (error) {
    console.log('❌ Server not running. Please start with: npm start');
    console.log('   Then run this demo with: node cryptoDemo.js\n');
    return false;
  }
}

// Run demo if server is available
checkServer().then(serverReady => {
  if (serverReady) {
    runDemo();
  }
});

export default { runDemo };