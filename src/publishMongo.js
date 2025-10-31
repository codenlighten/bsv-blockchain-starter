import fs from "fs/promises";
import fetch from "node-fetch";
import bsv from "smartledger-bsv";
import crypto from "crypto";
import dotenv from 'dotenv';
import { UTXOManagerMongo } from './utxoManagerMongo.js';

dotenv.config();

const NETWORK = process.env.BSV_NETWORK || "main";
const API_BASE = `https://api.whatsonchain.com/v1/bsv/${NETWORK}`;
const WALLET_PATH = "./wallets/wallet.json";

const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Initialize MongoDB UTXO manager
const utxoManager = new UTXOManagerMongo(WALLET_PATH);

// --- Legacy file-based helpers (for backward compatibility) ---
async function loadWallet() {
  try {
    const data = await fs.readFile(WALLET_PATH, "utf8");
    return JSON.parse(data);
  } catch {
    const wallet = generateWallet();
    await fs.writeFile(WALLET_PATH, JSON.stringify(wallet, null, 2));
    return wallet;
  }
}

function generateWallet() {
  const privateKey = new bsv.PrivateKey();
  const address = privateKey.toAddress().toString();
  return {
    privateKey: privateKey.toString(),
    publicKey: privateKey.publicKey.toString(),
    address,
    network: NETWORK,
    created: new Date().toISOString(),
  };
}

// --- Enhanced Async Generator for Publishing with Small UTXOs ---
async function* publishGenerator(text) {
  try {
    // Load wallets
    const publishingWallet = JSON.parse(await fs.readFile('./wallets/publishing-wallet.json', 'utf8'));
    const sweepWallet = JSON.parse(await fs.readFile('./wallets/sweep-wallet.json', 'utf8'));
    
    yield { 
      stage: "wallets_loaded", 
      publishing: publishingWallet.address,
      sweep: sweepWallet.address
    };

    // Start with one UTXO and calculate exact transaction size
    yield { stage: "calculating_size", message: "Starting with 1 UTXO, will calculate exact size..." };
    
    const dataSize = Buffer.from(text, 'utf8').length;
    let requiredUTXOs = 1;
    
    yield { 
      stage: "size_estimated", 
      message: `Data: ${dataSize} bytes, Starting with: ${requiredUTXOs} UTXO` 
    };

    // Initialize database connection and get publishing UTXOs
    const { UTXOService } = await import('../database/services.js');
    const { connectDatabase, UTXO } = await import('../database/schemas.js');
    await connectDatabase();
    
    // Get smallest UTXOs first for efficient publishing (override default largest-first)
    const availableUTXOs = await UTXO.find({
      walletAddress: publishingWallet.address,
      status: 'available',
      satoshis: { $gte: 0 }
    }).sort({ satoshis: 1 }).limit(requiredUTXOs).exec(); // Smallest first!
    
    if (availableUTXOs.length < requiredUTXOs) {
      yield { 
        stage: "error", 
        message: `Insufficient publishing UTXOs: need ${requiredUTXOs}, have ${availableUTXOs.length}. Run splitUtxos.js first.` 
      };
      return;
    }

    // Select and reserve UTXOs
    const selectedUTXOs = availableUTXOs.slice(0, requiredUTXOs);
    yield { stage: "reserving_utxos", message: `Reserving ${selectedUTXOs.length} UTXOs...` };
    
    const reservedUTXOs = [];
    for (const utxo of selectedUTXOs) {
      try {
        // Use the UTXO model's reserve method directly
        await utxo.reserve('publishing');
        reservedUTXOs.push(utxo);
      } catch (error) {
        // If reservation fails, restore already reserved UTXOs
        for (const prevReserved of reservedUTXOs) {
          await prevReserved.release('publishing');
        }
        yield { stage: "error", message: `Failed to reserve UTXOs: ${error.message}` };
        return;
      }
    }
    
    // Calculate actual total input from reserved UTXOs
    const totalInput = reservedUTXOs.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    
    yield { 
      stage: "utxos_reserved", 
      message: `Reserved ${reservedUTXOs.length} UTXOs totaling ${totalInput} satoshis` 
    };

    // --- build + sign transaction ---
    yield { stage: "building_tx", message: "Building transaction..." };

    const publishingPrivateKey = bsv.PrivateKey.fromWIF(publishingWallet.privateKey);
    let tx = new bsv.Transaction();

    // add reserved UTXOs
    for (const utxo of reservedUTXOs) {
      tx.from({
        txid: utxo.txid,
        outputIndex: utxo.vout,
        script: bsv.Script.fromHex(utxo.script),
        satoshis: utxo.satoshis
      });
    }

    // OP_RETURN
    tx.addOutput(new bsv.Transaction.Output({
      script: bsv.Script.buildSafeDataOut(Buffer.from(text, "utf8")),
      satoshis: 0
    }));

    // set change + fee and sign
    tx.change(sweepWallet.address)
      .feePerKb(10)
      .sign(publishingPrivateKey);

    const actualFee = tx.getFee();
    const changeAmount = tx.inputAmount - tx.outputAmount - actualFee;

    yield {
      stage: "tx_built",
      message: `Fee fixed @10 sats/KB = ${actualFee} sats. Change: ${changeAmount} → ${sweepWallet.address}`
    };

    const raw = tx.toString();
    yield { stage: "signed", txHex: raw };

    try {
      // Broadcast transaction
      yield { stage: "broadcasting", message: "Broadcasting transaction to network..." };
      
      const response = await fetch(`${API_BASE}/tx/raw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txhex: raw })
      });
      
      if (!response.ok) {
        throw new Error(`Broadcast failed: ${response.status} ${response.statusText}`);
      }
      
      const txidResponse = await response.text();
      const cleanTxid = txidResponse.replace(/["\n\r]/g, '').trim();
      
      yield { stage: "broadcasted", txid: cleanTxid };

      // Mark all used UTXOs as spent
      for (const utxo of reservedUTXOs) {
        await utxo.markSpent(cleanTxid, 'publishing');
      }
      
      yield { 
        stage: "utxos_spent", 
        message: `Marked ${reservedUTXOs.length} UTXOs as spent in ${cleanTxid}` 
      };

      // Add change output to sweep address as new UTXO
      const changeOutputIndex = tx.outputs.findIndex(o => o.satoshis > 0);
      if (changeOutputIndex !== -1) {
        const changeOutput = tx.outputs[changeOutputIndex];
        const changeUTXO = {
          txid: cleanTxid,
          vout: changeOutputIndex,
          satoshis: changeOutput.satoshis,
          script: changeOutput.script.toHex(),
          scriptPubKey: changeOutput.script.toHex(),
          walletAddress: sweepWallet.address,
          source: 'change_output',
          status: 'available'
        };
        
        await UTXOService.addUTXO(changeUTXO, 'publishing');
        
        yield { 
          stage: "change_utxo_added", 
          message: `Added change UTXO to sweep address: ${cleanTxid}:${changeOutputIndex} with ${changeOutput.satoshis} satoshis`,
          newUTXO: changeUTXO 
        };
      } else {
        yield { 
          stage: "no_change", 
          message: "No change output created (fee consumed entire input)" 
        };
      }

      // Get final publishing wallet stats
      const finalPublishingStats = await UTXOService.getWalletStats(publishingWallet.address);
      const finalSweepStats = await UTXOService.getWalletStats(sweepWallet.address);
      
      yield { 
        stage: "done", 
        txid: cleanTxid,
        publishingUTXOs: finalPublishingStats.availableUTXOs || 0,
        sweepBalance: finalSweepStats.availableBalance || 0,
        explorer: `https://whatsonchain.com/tx/${cleanTxid}`
      };
      
    } catch (e) {
      // If broadcast failed, restore all reserved UTXOs
      yield { stage: "error_restoring", message: "Broadcast failed, restoring UTXOs..." };
      
      let restoredCount = 0;
      for (const utxo of reservedUTXOs) {
        try {
          await utxo.release('publishing');
          restoredCount++;
        } catch (restoreError) {
          console.warn(`Failed to restore UTXO ${utxo.txid}:${utxo.vout}:`, restoreError.message);
        }
      }
      
      yield { 
        stage: "error", 
        message: e.message, 
        utxos_restored: restoredCount,
        total_utxos: reservedUTXOs.length
      };
    }
    
  } catch (error) {
    yield { stage: "error", message: `Initialization failed: ${error.message}` };
  }
}

// --- Legacy async generator (backwards compatibility) ---
async function* publishGeneratorLegacy(text) {
  const wallet = await loadWallet();
  yield { stage: "wallet_loaded", address: wallet.address };

  let utxos = await readUTXOs();
  if (utxos.length === 0) {
    yield { stage: "fetching_utxos" };
    utxos = await fetchUTXOs(wallet.address);
    await writeUTXOs(utxos);
    yield { stage: "utxos_fetched", count: utxos.length };
  }

  if (utxos.length === 0) {
    yield { stage: "error", message: "No UTXOs available — fund wallet first" };
    return;
  }

  // Log current UTXO status
  const totalBalance = utxos.reduce((sum, u) => sum + u.satoshis, 0);
  yield { 
    stage: "utxo_status", 
    message: `Using UTXO: ${utxos[0].satoshis} sats (${utxos.length} total UTXOs, ${totalBalance} sats balance)` 
  };

  const utxo = utxos.shift(); // safely remove one
  await writeUTXOs(utxos); // immediately persist updated state

  const privateKey = bsv.PrivateKey.fromString(wallet.privateKey);
  const tx = new bsv.Transaction()
    .from({
      txid: utxo.txid,
      outputIndex: utxo.vout,
      script: bsv.Script.fromHex(utxo.script || utxo.scriptPubKey),
      satoshis: utxo.satoshis,
    })
    .addOutput(new bsv.Transaction.Output({
      script: bsv.Script.buildSafeDataOut(Buffer.from(text, "utf8")),
      satoshis: 0,
    }))
    .change(wallet.address)
    .feePerKb(10)
    .sign(privateKey);

  const raw = tx.toString();
  yield { stage: "signed", txHex: raw };

  try {
    const response = await fetch(`${API_BASE}/tx/raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txhex: raw })
    });
    const txidResponse = await response.text();
    const cleanTxid = txidResponse.replace(/["\n\r]/g, '').trim(); // Clean up response
    yield { stage: "broadcasted", txid: txidResponse };

    // Find change output (the one with satoshis > 0, usually the last output)
    const changeOutputIndex = tx.outputs.findIndex(o => o.satoshis > 0);
    if (changeOutputIndex !== -1) {
      const changeOutput = tx.outputs[changeOutputIndex];
      const changeUTXO = {
        txid: cleanTxid,
        vout: changeOutputIndex,
        satoshis: changeOutput.satoshis,
        scriptPubKey: changeOutput.script.toHex(),
        script: changeOutput.script.toHex(), // For compatibility with fetchUTXOs format
      };
      
      // Add the new change UTXO to our list
      const currentUTXOs = await readUTXOs();
      currentUTXOs.push(changeUTXO);
      await writeUTXOs(currentUTXOs);
      
      yield { stage: "utxo_updated", newUTXO: changeUTXO, availableUTXOs: currentUTXOs.length };
    }

    yield { stage: "done", txid: txidResponse };
  } catch (e) {
    // If broadcast failed, we should restore the spent UTXO
    const currentUTXOs = await readUTXOs();
    currentUTXOs.unshift(utxo); // Add the spent UTXO back to the beginning
    await writeUTXOs(currentUTXOs);
    yield { stage: "error", message: e.message, utxo_restored: true };
  }
}

// --- File-based UTXO helpers (legacy support) ---
async function fetchUTXOs(address) {
  const response = await fetch(`${API_BASE}/address/${address}/unspent`);
  if (!response.ok) {
    throw new Error(`Failed to fetch UTXOs: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Do not dust-filter; only validate required fields
  return data
    .filter(u => {
      if (!u.tx_hash || typeof u.tx_pos !== "number" || !u.value) {
        console.warn(`Invalid UTXO data:`, u);
        return false;
      }
      return true;
    })
    .map(u => ({
      txid: u.tx_hash,
      vout: u.tx_pos,
      satoshis: u.value,
      script: bsv.Script.buildPublicKeyHashOut(address).toHex(),
      scriptPubKey: bsv.Script.buildPublicKeyHashOut(address).toHex(),
      confirmations: u.confirmations || 0,
      fetchedAt: Date.now()
    }))
    .sort((a, b) => b.satoshis - a.satoshis);
}

async function readUTXOs() {
  try {
    const data = await fs.readFile("./utxos.json", "utf8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeUTXOs(utxos) {
  await fs.writeFile("./utxos.json", JSON.stringify(utxos, null, 2));
}

// --- Direct broadcast from hex file ---
async function publishFromHexFile(hexFilePath = './oppushtx_hex.txt') {
  try {
    console.log(`📡 Reading transaction hex from ${hexFilePath}...`);
    const txHex = await fs.readFile(hexFilePath, 'utf8');
    const cleanHex = txHex.trim();
    
    console.log(`🔍 Transaction size: ${cleanHex.length / 2} bytes`);
    console.log(`📤 Broadcasting to ${NETWORK} network...`);
    
    const response = await fetch(`${API_BASE}/tx/raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txhex: cleanHex })
    });
    const txid = await response.text();
    
    console.log('✅ Transaction broadcast successful!');
    console.log(`🔗 TXID: ${txid}`);
    console.log(`🌐 View on WhatsOnChain: https://whatsonchain.com/tx/${txid}`);
    
    return txid;
    
  } catch (error) {
    console.error('❌ Broadcast failed:', error.message);
    throw error;
  }
}

// --- Main export functions ---

/**
 * Publish data using MongoDB UTXO management (recommended)
 * @param {string} text - Text to publish as OP_RETURN
 * @param {Object} options - Publishing options
 * @returns {AsyncGenerator} Progress updates
 */
export async function* publishData(text, options = {}) {
  const { useLegacy = false } = options;
  
  if (useLegacy) {
    console.log('⚠️  Using legacy file-based UTXO management');
    yield* publishGeneratorLegacy(text);
  } else {
    console.log('✅ Using MongoDB UTXO management');
    yield* publishGenerator(text);
  }
}

/**
 * Publish from hex file
 */
export { publishFromHexFile };

/**
 * Get UTXO manager instance for direct access
 */
export { utxoManager };

/**
 * Legacy functions for backward compatibility
 */
export { loadWallet, generateWallet, fetchUTXOs, readUTXOs, writeUTXOs };

// --- CLI usage ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const text = process.argv[2];
  const hexFile = process.argv[3];
  
  if (hexFile) {
    // Broadcast from hex file
    try {
      const txid = await publishFromHexFile(hexFile);
      process.exit(0);
    } catch (error) {
      console.error('Failed to broadcast hex file:', error.message);
      process.exit(1);
    }
  } else if (text) {
    // Publish text data
    console.log(`📝 Publishing: "${text}"`);
    
    try {
      for await (const update of publishData(text)) {
        if (update.stage === 'error') {
          console.error(`❌ ${update.message}`);
          process.exit(1);
        } else if (update.stage === 'done') {
          console.log(`✅ Published successfully! TXID: ${update.txid}`);
          console.log(`🌐 View: ${update.explorer}`);
          console.log(`📤 Publishing UTXOs remaining: ${update.publishingUTXOs}`);
          console.log(`🧹 Sweep balance: ${update.sweepBalance} satoshis`);
          process.exit(0);
        } else {
          const message = update.message || JSON.stringify(update);
          console.log(`📊 ${update.stage}: ${message}`);
        }
      }
    } catch (error) {
      console.error('❌ Publishing failed:', error.message);
      process.exit(1);
    }
  } else {
    console.log('Usage:');
    console.log('  node publish.js "text to publish"');
    console.log('  node publish.js "" path/to/hex_file.txt');
    process.exit(1);
  }
}