import bsv from 'smartledger-bsv';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import { UTXOManagerMongo } from './utxoManagerMongo.js';
import { UTXOService } from '../database/services.js';

dotenv.config();

const NETWORK = process.env.BSV_NETWORK || 'main';
const API_BASE = `https://api.whatsonchain.com/v1/bsv/${NETWORK}`;
const FUNDING_WALLET_PATH = './wallets/wallet.json'; // Main funding wallet
const PUBLISHING_WALLET_PATH = './wallets/publishing-wallet.json'; // Publishing wallet

/**
 * Enhanced UTXO Splitting with MongoDB Integration
 * Splits funding UTXOs into small UTXOs for efficient publishing
 */
class UTXOSplitter {
  constructor() {
    this.fundingManager = new UTXOManagerMongo(FUNDING_WALLET_PATH);
    this.publishingWallet = null;
  }

  /**
   * Initialize wallets and database connections
   */
  async initialize() {
    console.log('🔧 Initializing UTXO Splitter...');
    
    // Initialize funding UTXO manager
    await this.fundingManager.initialize();
    
    // Load or create publishing wallet
    this.publishingWallet = await this.getOrCreatePublishingWallet();
    
    console.log(`💰 Funding Address: ${this.fundingManager.wallet.address}`);
    console.log(`📤 Publishing Address: ${this.publishingWallet.address}`);
    
    return this;
  }

  /**
   * Load existing publishing wallet or create new one using tools/generate-keys.js
   */
  async getOrCreatePublishingWallet() {
    try {
      const data = await fs.readFile(PUBLISHING_WALLET_PATH, 'utf8');
      return JSON.parse(data);
    } catch {
      console.log('📝 Creating new publishing wallet...');
      
      // Generate new keys using the same logic as tools/generate-keys.js
      const privateKey = bsv.PrivateKey.fromRandom();
      const publicKey = privateKey.toPublicKey();
      const address = bsv.Address.fromPublicKey(publicKey);

      const wallet = {
        privateKey: privateKey.toWIF(),
        publicKey: publicKey.toString(),
        address: address.toString(),
        purpose: 'publishing',
        network: NETWORK,
        created: new Date().toISOString()
      };

      await fs.writeFile(PUBLISHING_WALLET_PATH, JSON.stringify(wallet, null, 2));
      console.log('✅ Publishing wallet created and saved');
      
      return wallet;
    }
  }

  /**
   * Get available funding UTXOs from MongoDB, sync from blockchain if needed
   */
  async getFundingUTXOs() {
    console.log('🔍 Getting funding UTXOs...');
    
    // Get UTXOs directly from the database using the service
    const { UTXOService } = await import('../database/services.js');
    let utxos = await UTXOService.getAvailableUTXOs(this.fundingManager.wallet.address);
    
    if (utxos.length === 0) {
      console.log('📡 No UTXOs in database, syncing from blockchain...');
      utxos = await this.fundingManager.refreshUTXOs();
    }

    const stats = await this.fundingManager.getStats();
    console.log(`💾 Found ${stats.count} UTXOs with total ${stats.totalSatoshis} satoshis`);
    
    return utxos;
  }

  /**
   * Split a funding UTXO into 50 UTXOs of 25 satoshis each
   */
  async splitIntoSmallUTXOs(fundingUTXO, splitCount = 50, splitValue = 25) {
    console.log(`✂️  Splitting UTXO ${fundingUTXO.txid}:${fundingUTXO.vout} (${fundingUTXO.satoshis} sats)`);
    
    const totalSplitValue = splitCount * splitValue; // 50 * 25 = 1250 sats
    const estimatedFee = 300; // Conservative estimate for fee
    
    if (fundingUTXO.satoshis < totalSplitValue + estimatedFee) {
      throw new Error(`Insufficient funds: need ${totalSplitValue + estimatedFee}, have ${fundingUTXO.satoshis}`);
    }

    // Reserve the funding UTXO using the model's reserve method
    await fundingUTXO.reserve('utxo_splitter');
    const reservedUTXO = fundingUTXO;

    // Build transaction
    const fundingPrivateKey = bsv.PrivateKey.fromWIF(this.fundingManager.wallet.privateKey);
    const tx = new bsv.Transaction()
      .from({
        txid: fundingUTXO.txid,
        outputIndex: fundingUTXO.vout,
        script: bsv.Script.fromHex(fundingUTXO.script),
        satoshis: fundingUTXO.satoshis
      });

    // Add 50 outputs of 25 satoshis each to publishing address
    for (let i = 0; i < splitCount; i++) {
      tx.to(this.publishingWallet.address, splitValue);
    }

    // Add change output back to funding address (this will be the new funding UTXO)
    tx.change(this.fundingManager.wallet.address)
      .feePerKb(10) // Use 10 sats per KB as specified
      .sign(fundingPrivateKey);

    const actualFee = tx.getFee();
    const changeAmount = fundingUTXO.satoshis - totalSplitValue - actualFee;
    
    console.log(`💸 Transaction details:`);
    console.log(`   Inputs: ${fundingUTXO.satoshis} sats`);
    console.log(`   Split outputs: ${splitCount} × ${splitValue} = ${totalSplitValue} sats`);
    console.log(`   Fee: ${actualFee} sats`);
    console.log(`   Change: ${changeAmount} sats`);
    
    return tx;
  }

  /**
   * Broadcast transaction and update MongoDB with new UTXOs
   */
  async broadcastAndUpdateMongo(tx, originalUTXO, splitCount = 50, splitValue = 25) {
    console.log('📡 Broadcasting split transaction...');
    
    const raw = tx.toString();
    
    try {
      const response = await fetch(`${API_BASE}/tx/raw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txhex: raw })
      });
      
      if (!response.ok) {
        throw new Error(`Broadcast failed: ${response.status} ${response.statusText}`);
      }
      
      const txidResponse = await response.text();
      const txid = txidResponse.replace(/["\n\r]/g, '').trim();
      
      console.log(`✅ Transaction broadcast! TXID: ${txid}`);
      
      // Mark original funding UTXO as spent
      await this.fundingManager.markUTXOSpent(originalUTXO, txid);
      console.log(`🗑️  Marked original UTXO as spent`);
      
      // Add new split UTXOs to database (outputs 0-49 go to publishing address)
      const newUTXOs = [];
      for (let i = 0; i < splitCount; i++) {
        const newUTXO = {
          txid: txid,
          vout: i,
          satoshis: splitValue,
          script: bsv.Script.buildPublicKeyHashOut(this.publishingWallet.address).toHex(),
          scriptPubKey: bsv.Script.buildPublicKeyHashOut(this.publishingWallet.address).toHex(),
          walletAddress: this.publishingWallet.address,
          source: 'split_operation',
          status: 'available'
        };
        newUTXOs.push(newUTXO);
      }
      
      // Save split UTXOs to database
      const result = await UTXOService.saveUTXOs(newUTXOs, this.publishingWallet.address, 'split_operation', 'utxo_splitter');
      console.log(`💾 Saved ${result.saved} split UTXOs to database`);
      
      // Add change output as new funding UTXO (last output)
      const changeOutputIndex = tx.outputs.length - 1;
      const changeOutput = tx.outputs[changeOutputIndex];
      
      if (changeOutput.satoshis > 0) {
        const changeUTXO = {
          txid: txid,
          vout: changeOutputIndex,
          satoshis: changeOutput.satoshis,
          script: changeOutput.script.toHex(),
          scriptPubKey: changeOutput.script.toHex(),
          walletAddress: this.fundingManager.wallet.address,
          source: 'change_output',
          status: 'available'
        };
        
        await this.fundingManager.addUTXO(changeUTXO);
        console.log(`💰 Added change UTXO: ${txid}:${changeOutputIndex} (${changeOutput.satoshis} sats)`);
      }
      
      return {
        txid,
        splitUTXOs: newUTXOs.length,
        changeAmount: changeOutput.satoshis,
        explorer: `https://whatsonchain.com/tx/${txid}`
      };
      
    } catch (error) {
      // If broadcast failed, restore the reserved UTXO
      await this.fundingManager.restoreUTXO(originalUTXO);
      throw new Error(`Broadcast failed: ${error.message}`);
    }
  }

  /**
   * Main function to split UTXOs
   */
  async splitUTXOs(splitCount = 50, splitValue = 25) {
    await this.initialize();
    
    // Get available funding UTXOs
    const fundingUTXOs = await this.getFundingUTXOs();
    
    if (fundingUTXOs.length === 0) {
      throw new Error('No funding UTXOs available. Please fund the wallet first.');
    }
    
    // Use the largest UTXO for splitting
    const largestUTXO = fundingUTXOs.sort((a, b) => b.satoshis - a.satoshis)[0];
    const minRequired = (splitCount * splitValue) + 500; // Split amount + estimated fee
    
    if (largestUTXO.satoshis < minRequired) {
      throw new Error(`Largest UTXO (${largestUTXO.satoshis} sats) is too small. Need at least ${minRequired} sats.`);
    }
    
    // Split the UTXO
    const tx = await this.splitIntoSmallUTXOs(largestUTXO, splitCount, splitValue);
    
    // Broadcast and update database
    const result = await this.broadcastAndUpdateMongo(tx, largestUTXO, splitCount, splitValue);
    
    console.log('\n🎉 UTXO splitting completed successfully!');
    console.log(`🔗 Transaction: ${result.explorer}`);
    console.log(`📦 Created ${result.splitUTXOs} UTXOs of ${splitValue} sats each`);
    console.log(`💰 Change: ${result.changeAmount} sats`);
    
    return result;
  }

  /**
   * Get statistics for both funding and publishing wallets
   */
  async getStats() {
    await this.initialize();
    
    const fundingStats = await this.fundingManager.getStats();
    const publishingStats = await UTXOService.getWalletStats(this.publishingWallet.address);
    
    return {
      funding: {
        address: this.fundingManager.wallet.address,
        utxos: fundingStats.count,
        balance: fundingStats.totalSatoshis
      },
      publishing: {
        address: this.publishingWallet.address,
        utxos: publishingStats.availableUTXOs || 0,
        balance: publishingStats.availableBalance || 0
      }
    };
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...args] = process.argv.slice(2);
  
  const splitter = new UTXOSplitter();
  
  if (cmd === 'split') {
    const splitCount = parseInt(args[0]) || 50;
    const splitValue = parseInt(args[1]) || 25;
    
    splitter.splitUTXOs(splitCount, splitValue)
      .then(result => {
        console.log('\n✅ Split operation completed successfully!');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Split operation failed:', error.message);
        process.exit(1);
      });
      
  } else if (cmd === 'stats') {
    splitter.getStats()
      .then(stats => {
        console.log('\n📊 Wallet Statistics:');
        console.log(`💰 Funding: ${stats.funding.utxos} UTXOs, ${stats.funding.balance} sats`);
        console.log(`📤 Publishing: ${stats.publishing.utxos} UTXOs, ${stats.publishing.balance} sats`);
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Failed to get stats:', error.message);
        process.exit(1);
      });
      
  } else {
    console.log('Usage:');
    console.log('  node splitUtxos.js split [count] [value]    # Split UTXOs (default: 50 × 25 sats)');
    console.log('  node splitUtxos.js stats                   # Show wallet statistics');
    console.log('');
    console.log('Examples:');
    console.log('  node splitUtxos.js split                   # Split into 50 UTXOs of 25 sats');
    console.log('  node splitUtxos.js split 100 30            # Split into 100 UTXOs of 30 sats');
    console.log('  node splitUtxos.js stats                   # Show current balances');
    process.exit(1);
  }
}

export { UTXOSplitter };