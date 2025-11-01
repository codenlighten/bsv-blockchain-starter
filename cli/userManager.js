#!/usr/bin/env node

/**
 * User Account Management CLI
 * Command-line interface for managing user accounts with web3 cryptographic identities
 */

import UserAccountManager from '../src/userAccountManager.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const userManager = new UserAccountManager();

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function createUserFlow() {
  try {
    console.log('\n🔐 Create New User Account with Web3 Identity');
    console.log('============================================');
    
    const email = await askQuestion('Email: ');
    const name = await askQuestion('Full Name: ');
    const entityType = await askQuestion('Entity Type (individual/corporation/trust): ');
    const role = await askQuestion('Role (producer/publisher/artist/platform): ');
    const password = await askQuestion('Password: ');
    const phone = await askQuestion('Phone (optional): ');
    
    console.log('\n🔑 Generating cryptographic identity...');
    
    const userData = {
      email,
      name,
      entityType: entityType || 'individual',
      role: role || 'artist',
      password,
      contactInfo: phone ? { phone } : {}
    };
    
    const result = await userManager.createUserAccount(userData);
    
    console.log('\n✅ User account created successfully!');
    console.log(`   User ID: ${result.user._id}`);
    console.log(`   BSV Address: ${result.publicKeys.bsvAddress}`);
    console.log(`   Public Key: ${result.publicKeys.publicKey}`);
    
  } catch (error) {
    console.error('\n❌ Account creation failed:', error.message);
  }
}

async function verifyUserFlow() {
  try {
    console.log('\n🔍 Verify User Cryptographic Identity');
    console.log('=====================================');
    
    const userId = await askQuestion('User ID: ');
    const password = await askQuestion('Password: ');
    
    console.log('\n🔑 Verifying identity...');
    
    const result = await userManager.verifyCryptoIdentity(userId, password);
    
    console.log('\n✅ Identity verification successful!');
    console.log(`   Verified: ${result.verified}`);
    console.log(`   BSV Address: ${result.bsvAddress}`);
    console.log(`   Public Key: ${result.publicKey}`);
    
  } catch (error) {
    console.error('\n❌ Identity verification failed:', error.message);
  }
}

async function signDataFlow() {
  try {
    console.log('\n✍️  Sign Data with User Key');
    console.log('===========================');
    
    const userId = await askQuestion('User ID: ');
    const password = await askQuestion('Password: ');
    const dataToSign = await askQuestion('Data to sign: ');
    
    console.log('\n🔑 Signing data...');
    
    const result = await userManager.signData(userId, password, { message: dataToSign });
    
    console.log('\n✅ Data signed successfully!');
    console.log(`   Signature: ${result.signature}`);
    console.log(`   Public Key: ${result.publicKey}`);
    console.log(`   Timestamp: ${result.timestamp}`);
    
  } catch (error) {
    console.error('\n❌ Data signing failed:', error.message);
  }
}

async function createProjectAccountsFlow() {
  try {
    console.log('\n🎵 Create AI Record Label Project Accounts');
    console.log('==========================================');
    console.log('This will create the three accounts needed for upside_down.mp3:');
    console.log('  - Gregory Ward (Writer/Producer): 70%');
    console.log('  - Zion Gates Music Trust (Publisher): 20%');
    console.log('  - SmartLedger Technology (Platform): 10%');
    console.log('');
    
    const confirm = await askQuestion('Create these accounts? (y/N): ');
    if (confirm.toLowerCase() !== 'y') {
      console.log('❌ Account creation cancelled');
      return;
    }
    
    console.log('\n🔑 Creating project accounts...');
    
    const accounts = await userManager.createProjectAccounts();
    
    console.log('\n✅ Project accounts created successfully!');
    console.log('📊 Account Details:');
    accounts.forEach((account, index) => {
      console.log(`\n   ${index + 1}. ${account.name}`);
      console.log(`      Role: ${account.role}`);
      console.log(`      Ownership: ${account.ownership}%`);
      console.log(`      User ID: ${account.account.user._id}`);
      console.log(`      BSV Address: ${account.account.publicKeys.bsvAddress}`);
    });
    
  } catch (error) {
    console.error('\n❌ Project account creation failed:', error.message);
  }
}

async function showMenu() {
  console.log('\n🔐 AI Record Label - User Account Management');
  console.log('===========================================');
  console.log('1. Create new user account');
  console.log('2. Verify user identity');
  console.log('3. Sign data with user key');
  console.log('4. Create project accounts (Gregory Ward, Zion Gates, SmartLedger)');
  console.log('5. Exit');
  console.log('');
  
  const choice = await askQuestion('Select option (1-5): ');
  
  switch (choice) {
    case '1':
      await createUserFlow();
      break;
    case '2':
      await verifyUserFlow();
      break;
    case '3':
      await signDataFlow();
      break;
    case '4':
      await createProjectAccountsFlow();
      break;
    case '5':
      console.log('👋 Goodbye!');
      rl.close();
      return;
    default:
      console.log('❌ Invalid option. Please select 1-5.');
  }
  
  // Show menu again
  await showMenu();
}

async function main() {
  try {
    console.log('🚀 Starting User Account Management CLI...');
    await userManager.initialize();
    console.log('✅ System initialized successfully');
    
    await showMenu();
  } catch (error) {
    console.error('💥 System initialization failed:', error.message);
    process.exit(1);
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('💥 CLI execution failed:', error.message);
    process.exit(1);
  });
}