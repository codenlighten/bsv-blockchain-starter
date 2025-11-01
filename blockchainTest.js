/**
 * Simple Blockchain Test - Debug BSV Integration
 */

import { BlockchainAuditTrail } from './src/blockchainAudit.js';

console.log('🔍 Testing Blockchain Audit Trail Initialization...\n');

async function testBlockchainInit() {
  try {
    console.log('1. Creating BlockchainAuditTrail instance...');
    const auditTrail = new BlockchainAuditTrail();
    
    console.log('2. Initializing wallet...');
    const walletInitialized = await auditTrail.initializeWallet();
    
    if (walletInitialized) {
      console.log('✅ Wallet initialized successfully!');
      console.log(`   Address: ${auditTrail.publishingAddress}`);
    } else {
      console.log('❌ Wallet initialization failed');
      return;
    }
    
    console.log('\n3. Creating mock attestation for testing...');
    const mockAttestation = {
      id: 'test-attestation-123',
      subject: 'test-blockchain',
      action: 'demo',
      metadata: {
        contract_hash: 'abc123def456789',
        finalized: false
      },
      signatures: []
    };
    
    console.log('4. Publishing test event to blockchain...');
    const result = await auditTrail.publishAuditEvent(mockAttestation, 'created', {
      demo: true,
      test_run: new Date().toISOString()
    });
    
    if (result && result.blockchain_txid) {
      console.log('✅ Test event published successfully!');
      console.log(`   Event ID: ${result.event_id}`);
      console.log(`   TXID: ${result.blockchain_txid}`);
      console.log(`   Block Explorer: https://whatsonchain.com/tx/${result.blockchain_txid}`);
      console.log(`   Published At: ${result.published_at}`);
    } else {
      console.log('❌ Publishing failed - no result returned');
      console.log('Result:', result);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testBlockchainInit();