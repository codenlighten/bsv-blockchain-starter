import fetch from 'node-fetch';
import fs from 'fs';
import bsv from 'smartledger-bsv';
import dotenv from 'dotenv';
import { UTXOManagerMongo } from './utxoManagerMongo.js';

dotenv.config();

const NETWORK = process.env.BSV_NETWORK || 'main';
const API_BASE = `https://api.whatsonchain.com/v1/bsv/${NETWORK}`;

/**
 * Enhanced UTXO fetcher with MongoDB persistence
 */
async function getUtxosMongo(options = {}) {
  const { 
    saveToFile = true, 
    saveToMongo = true, 
    syncExisting = false,
    walletPath = './wallets/wallet.json' 
  } = options;

  try {
    // Initialize MongoDB UTXO manager
    const utxoManager = new UTXOManagerMongo(walletPath);
    await utxoManager.initialize();
    
    const wallet = await utxoManager.loadWallet();
    const { address } = wallet;
    
    console.log(`🔍 Fetching UTXOs for address: ${address}...`);
    console.log(`📡 Using network: ${NETWORK}`);
    console.log(`💾 Save to file: ${saveToFile}, Save to MongoDB: ${saveToMongo}`);

    if (syncExisting) {
      console.log('🔄 Performing full sync with blockchain...');
      const syncResult = await utxoManager.syncWithBlockchain();
      console.log(`✅ Sync complete: ${syncResult.freshUTXOs} fresh, ${syncResult.markedSpent} marked spent`);
      
      // Get final stats
      const stats = await utxoManager.getStats();
      console.log(`💰 Final balance: ${stats.totalSatoshis} satoshis (${stats.count} UTXOs)`);
      return;
    }

    // Fetch fresh UTXOs from blockchain
    const url = `${API_BASE}/address/${address}/unspent/all`;
    console.log(`🌐 API URL: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();

    if (data.result && data.result.length > 0) {
      console.log(`📥 Received ${data.result.length} UTXOs from API`);
      
      // Filter out UTXOs that are spent in mempool and format for BSV library compatibility
      const availableUtxos = data.result.filter(utxo => !utxo.isSpentInMempoolTx);
      
      if (availableUtxos.length === 0) {
        console.log('⚠️  All UTXOs are spent in mempool transactions. Wait for confirmation.');
        return;
      }
      
      const formattedUtxos = availableUtxos.map(utxo => ({
        txid: utxo.tx_hash,
        vout: utxo.tx_pos,
        satoshis: utxo.value,
        script: bsv.Script.buildPublicKeyHashOut(address).toHex(),
        scriptPubKey: bsv.Script.buildPublicKeyHashOut(address).toHex(),
        blockHeight: utxo.height || 0,
        confirmations: utxo.confirmations || 0,
        walletAddress: address,
        fetchedAt: new Date()
      }));

      // Save to file if requested (backward compatibility)
      if (saveToFile) {
        const legacyFormat = formattedUtxos.map(utxo => ({
          txid: utxo.txid,
          vout: utxo.vout,
          satoshis: utxo.satoshis,
          script: utxo.script
        }));
        
        fs.writeFileSync('utxos.json', JSON.stringify(legacyFormat, null, 2));
        console.log(`📁 Saved ${availableUtxos.length} UTXOs to utxos.json (legacy format)`);
      }

      // Save to MongoDB if requested
      if (saveToMongo) {
        const { UTXOService } = await import('../database/services.js');
        const result = await UTXOService.saveUTXOs(formattedUtxos, address, 'blockchain_fetch', 'getUtxos');
        console.log(`🗄️  Saved ${result.saved}/${result.total} UTXOs to MongoDB`);
        
        if (result.saved < result.total) {
          console.log(`ℹ️  ${result.total - result.saved} UTXOs already existed in database`);
        }
      }
      
      console.log(`✅ Found and processed ${availableUtxos.length} available UTXO(s)`);
      if (data.result.length > availableUtxos.length) {
        console.log(`🚫 Filtered out ${data.result.length - availableUtxos.length} UTXO(s) that are spent in mempool`);
      }
      
      const totalBalance = availableUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
      console.log(`💰 Available balance: ${totalBalance} satoshis`);
      
      // Show first UTXO for reference
      if (availableUtxos.length > 0) {
        const first = availableUtxos[0];
        console.log(`📋 First available UTXO: ${first.tx_hash}:${first.tx_pos} (${first.value} sats)`);
      }

      // Get updated database stats if using MongoDB
      if (saveToMongo) {
        const stats = await utxoManager.getStats();
        console.log(`📊 Database stats: ${stats.count} total UTXOs, ${stats.totalSatoshis} satoshis`);
        
        if (stats.statusBreakdown) {
          console.log('📈 Status breakdown:');
          Object.entries(stats.statusBreakdown).forEach(([status, data]) => {
            console.log(`   ${status}: ${data.count} UTXOs (${data.satoshis} satoshis)`);
          });
        }
      }
      
    } else {
      console.log('⚠️  No UTXOs found for this address.');
      console.log('💡 To proceed, you need to fund this address with some BSV.');
      console.log(`📬 Send BSV to: ${address}`);
      console.log('🌐 You can use a BSV faucet or send from another wallet.');
    }

  } catch (error) {
    console.error('❌ Error fetching UTXOs:', error.message);
    
    if (error.message.includes('404')) {
      console.log('💡 Address not found or never used. Fund it first with some BSV.');
    } else if (error.message.includes('MongoDB')) {
      console.log('🔧 MongoDB error - falling back to file-only mode');
      
      // Fallback to legacy mode
      await getUtxosLegacy();
    }
  }
}

/**
 * Legacy UTXO fetcher (file-based only)
 */
async function getUtxosLegacy() {
  console.log('📁 Using legacy file-based UTXO management');
  
  try {
    // Read wallet from generated wallet.json
    const wallet = JSON.parse(fs.readFileSync('./wallet.json', 'utf8'));
    const { address } = wallet;
    
    console.log(`🔍 Fetching UTXOs for address: ${address}...`);
    console.log(`📡 Using network: ${NETWORK}`);

    const url = `${API_BASE}/address/${address}/unspent/all`;
    console.log(`🌐 API URL: ${url}`);
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.result && data.result.length > 0) {
      console.log('📥 Raw API response:', data);
      
      // Filter out UTXOs that are spent in mempool and format for BSV library compatibility
      const availableUtxos = data.result.filter(utxo => !utxo.isSpentInMempoolTx);
      
      if (availableUtxos.length === 0) {
        console.log('⚠️  All UTXOs are spent in mempool transactions. Wait for confirmation.');
        return;
      }
      
      const formattedUtxos = availableUtxos.map(utxo => ({
        txid: utxo.tx_hash,
        vout: utxo.tx_pos,
        satoshis: utxo.value,
        script: bsv.Script.buildPublicKeyHashOut(address).toHex(),
      }));

      fs.writeFileSync('utxos.json', JSON.stringify(formattedUtxos, null, 2));
      
      console.log(`✅ Found and saved ${availableUtxos.length} available UTXO(s) to utxos.json`);
      if (data.result.length > availableUtxos.length) {
        console.log(`🚫 Filtered out ${data.result.length - availableUtxos.length} UTXO(s) that are spent in mempool`);
      }
      console.log(`💰 Available balance: ${availableUtxos.reduce((sum, utxo) => sum + utxo.value, 0)} satoshis`);
      
      // Show first UTXO for reference
      if (availableUtxos.length > 0) {
        const first = availableUtxos[0];
        console.log(`📋 First available UTXO: ${first.tx_hash}:${first.tx_pos} (${first.value} sats)`);
      }
    } else {
      console.log('⚠️  No UTXOs found for this address.');
      console.log('💡 To proceed, you need to fund this address with some BSV.');
      console.log(`📬 Send BSV to: ${address}`);
      console.log('🌐 You can use a BSV faucet or send from another wallet.');
    }
  } catch (error) {
    console.error('❌ Error fetching UTXOs:', error.message);
    
    if (error.message.includes('404')) {
      console.log('💡 Address not found or never used. Fund it first with some BSV.');
    }
  }
}

// Export functions
export { getUtxosMongo, getUtxosLegacy };

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const useMongo = !args.includes('--legacy');
  const syncMode = args.includes('--sync');
  const fileOnly = args.includes('--file-only');
  const mongoOnly = args.includes('--mongo-only');
  
  if (args.includes('--help')) {
    console.log('Usage: node getUtxosMongo.js [options]');
    console.log('Options:');
    console.log('  --legacy     Use legacy file-based approach only');
    console.log('  --sync       Perform full blockchain synchronization');
    console.log('  --file-only  Save to file only (no MongoDB)');
    console.log('  --mongo-only Save to MongoDB only (no file)');
    console.log('  --help       Show this help message');
    process.exit(0);
  }

  const options = {
    saveToFile: !mongoOnly,
    saveToMongo: !fileOnly && useMongo,
    syncExisting: syncMode
  };

  if (useMongo) {
    console.log('🚀 Using enhanced MongoDB UTXO management');
    getUtxosMongo(options).catch(console.error);
  } else {
    console.log('📁 Using legacy file-based UTXO management');
    getUtxosLegacy().catch(console.error);
  }
}