/**
 * MongoDB-based UTXO Manager for LabLedger
 * Mirrors file-based logic with enhanced database persistence and audit trails
 */

import fetch from 'node-fetch';
import bsv from 'smartledger-bsv';
import { UTXOService } from '../database/services.js';
import { connectDatabase } from '../database/schemas.js';

const NETWORK = process.env.BSV_NETWORK || 'main';
const API_BASE = `https://api.whatsonchain.com/v1/bsv/${NETWORK}`;

export class UTXOManagerMongo {
  constructor(walletPath = './wallet.json') {
    this.walletPath = walletPath;
    this.wallet = null;
    this.isConnected = false;
  }

  /**
   * Initialize database connection and load wallet
   */
  async initialize() {
    if (!this.isConnected) {
      await connectDatabase();
      this.isConnected = true;
    }
    
    if (!this.wallet) {
      this.wallet = await this.loadWallet();
    }
    
    return this;
  }

  /**
   * Load wallet with error handling
   */
  async loadWallet() {
    try {
      const fs = await import('fs/promises');
      const data = await fs.readFile(this.walletPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to load wallet: ${error.message}`);
    }
  }

  /**
   * Fetch fresh UTXOs from blockchain with enhanced validation
   */
  async fetchFreshUTXOs(address = null) {
    const walletAddress = address || this.wallet?.address;
    if (!walletAddress) {
      throw new Error('Wallet address not available');
    }

    const url = `${API_BASE}/address/${walletAddress}/unspent/all`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.result || !Array.isArray(data.result)) {
        return [];
      }

      // Enhanced filtering and validation
      const validUtxos = data.result
        .filter(utxo => {
          // Filter out spent in mempool
          if (utxo.isSpentInMempoolTx) return false;
          
          // Validate required fields
          if (!utxo.tx_hash || typeof utxo.tx_pos !== 'number' || !utxo.value) {
            console.warn(`Invalid UTXO data:`, utxo);
            return false;
          }
          
          // Filter out dust (less than 546 satoshis)
          if (utxo.value < 546) return false;
          
          return true;
        })
        .map(utxo => ({
          txid: utxo.tx_hash,
          vout: utxo.tx_pos,
          satoshis: utxo.value,
          script: bsv.Script.buildPublicKeyHashOut(walletAddress).toHex(),
          scriptPubKey: bsv.Script.buildPublicKeyHashOut(walletAddress).toHex(),
          blockHeight: utxo.height || 0,
          confirmations: utxo.confirmations || 0,
          walletAddress,
          fetchedAt: new Date()
        }))
        .sort((a, b) => {
          // Sort by confirmations (more confirmed first), then by value (larger first)
          if (a.confirmations !== b.confirmations) {
            return b.confirmations - a.confirmations;
          }
          return b.satoshis - a.satoshis;
        });

      return validUtxos;
      
    } catch (error) {
      throw new Error(`Failed to fetch UTXOs: ${error.message}`);
    }
  }

  /**
   * Load UTXOs from database with automatic refresh if needed
   */
  async loadUTXOs(maxAge = 300000, forceRefresh = false) { // 5 minutes default
    await this.initialize();
    
    if (forceRefresh) {
      return await this.refreshUTXOs();
    }

    try {
      const utxos = await UTXOService.getAvailableUTXOs(this.wallet.address);
      
      // Check if UTXOs are stale
      if (utxos.length > 0) {
        const oldestFetch = Math.min(...utxos.map(u => u.fetchedAt?.getTime() || 0));
        if (Date.now() - oldestFetch > maxAge) {
          console.log('🔄 UTXOs are stale, refreshing...');
          return await this.refreshUTXOs();
        }
      } else {
        // No UTXOs found, fetch fresh
        return await this.refreshUTXOs();
      }
      
      return utxos;
    } catch (error) {
      console.warn('Failed to load UTXOs from database, fetching fresh:', error.message);
      return await this.refreshUTXOs();
    }
  }

  /**
   * Refresh UTXOs from blockchain and save to database
   */
  async refreshUTXOs() {
    await this.initialize();
    
    const freshUtxos = await this.fetchFreshUTXOs();
    
    if (freshUtxos.length > 0) {
      const result = await UTXOService.saveUTXOs(
        freshUtxos, 
        this.wallet.address, 
        'blockchain_fetch', 
        'utxo_manager'
      );
      
      console.log(`✅ Saved ${result.saved} new UTXOs to database`);
      return result.utxos;
    }
    
    return [];
  }

  /**
   * Reserve a UTXO for spending with database transaction
   */
  async reserveUTXO(requiredAmount = 0) {
    await this.initialize();
    
    try {
      const reservedUTXO = await UTXOService.reserveUTXO(
        this.wallet.address, 
        requiredAmount, 
        'utxo_manager'
      );
      
      return reservedUTXO;
      
    } catch (error) {
      throw new Error(`Failed to reserve UTXO: ${error.message}`);
    }
  }

  /**
   * Add new UTXO (change output) to database
   */
  async addUTXO(newUtxo) {
    await this.initialize();
    
    try {
      const utxoData = {
        txid: newUtxo.txid,
        vout: newUtxo.vout,
        satoshis: newUtxo.satoshis,
        script: newUtxo.script,
        scriptPubKey: newUtxo.scriptPubKey || newUtxo.script,
        walletAddress: this.wallet.address,
        source: 'change_output',
        status: 'available'
      };
      
      const addedUTXO = await UTXOService.addUTXO(utxoData, 'utxo_manager');
      return addedUTXO;
      
    } catch (error) {
      // If UTXO already exists, that's okay
      if (error.message.includes('already exists')) {
        console.log(`UTXO ${newUtxo.txid}:${newUtxo.vout} already exists in database`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Restore UTXO if transaction failed
   */
  async restoreUTXO(utxo) {
    await this.initialize();
    
    try {
      const restoredUTXO = await UTXOService.restoreUTXO(
        utxo.txid, 
        utxo.vout, 
        'utxo_manager'
      );
      
      return restoredUTXO;
      
    } catch (error) {
      throw new Error(`Failed to restore UTXO: ${error.message}`);
    }
  }

  /**
   * Mark UTXO as spent in database
   */
  async markUTXOSpent(utxo, spentInTxid) {
    await this.initialize();
    
    try {
      const spentUTXO = await UTXOService.markUTXOSpent(
        utxo.txid, 
        utxo.vout, 
        spentInTxid, 
        'utxo_manager'
      );
      
      return spentUTXO;
      
    } catch (error) {
      throw new Error(`Failed to mark UTXO as spent: ${error.message}`);
    }
  }

  /**
   * Get current balance from database
   */
  async getBalance() {
    await this.initialize();
    
    try {
      const stats = await UTXOService.getWalletStats(this.wallet.address);
      return stats.availableBalance || 0;
    } catch (error) {
      console.warn('Failed to get balance from database:', error.message);
      return 0;
    }
  }

  /**
   * Get comprehensive UTXO statistics
   */
  async getStats() {
    await this.initialize();
    
    try {
      const stats = await UTXOService.getWalletStats(this.wallet.address);
      
      return {
        count: stats.availableUTXOs || 0,
        totalSatoshis: stats.availableBalance || 0,
        averageValue: stats.availableUTXOs > 0 ? 
          Math.round(stats.availableBalance / stats.availableUTXOs) : 0,
        statusBreakdown: stats.statusBreakdown || {},
        lastUpdated: stats.lastUpdated
      };
    } catch (error) {
      console.warn('Failed to get stats from database:', error.message);
      return {
        count: 0,
        totalSatoshis: 0,
        averageValue: 0,
        statusBreakdown: {},
        lastUpdated: new Date()
      };
    }
  }

  /**
   * Validate UTXO against database and optionally blockchain
   */
  async validateUTXO(utxo, checkBlockchain = false) {
    await this.initialize();
    
    try {
      // Check database first
      const validation = await UTXOService.validateUTXO(utxo.txid, utxo.vout);
      
      if (!validation.valid) {
        return validation;
      }
      
      // Optionally check against blockchain (expensive operation)
      if (checkBlockchain) {
        try {
          const url = `${API_BASE}/tx/${utxo.txid}/out/${utxo.vout}/spent`;
          const response = await fetch(url);
          
          if (response.status === 404) {
            // UTXO is unspent on blockchain
            return { valid: true, source: 'blockchain' };
          } else if (response.ok) {
            // UTXO is spent on blockchain - mark in database
            await this.markUTXOSpent(utxo, 'unknown');
            return { valid: false, reason: 'UTXO is spent on blockchain' };
          } else {
            console.warn(`Blockchain validation failed for ${utxo.txid}:${utxo.vout}`);
            return validation; // Fall back to database validation
          }
        } catch (error) {
          console.warn(`Blockchain validation error: ${error.message}`);
          return validation; // Fall back to database validation
        }
      }
      
      return validation;
      
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }

  /**
   * Clean up old spent UTXOs
   */
  async cleanupOldUTXOs(daysOld = 30) {
    await this.initialize();
    
    try {
      const deletedCount = await UTXOService.cleanupOldUTXOs(daysOld, 'utxo_manager');
      console.log(`🧹 Cleaned up ${deletedCount} old spent UTXOs`);
      return deletedCount;
    } catch (error) {
      console.warn('Failed to cleanup old UTXOs:', error.message);
      return 0;
    }
  }

  /**
   * Convert UTXO to blockchain format for BSV library
   */
  toBlockchainFormat(utxo) {
    return {
      txid: utxo.txid,
      outputIndex: utxo.vout,
      script: bsv.Script.fromHex(utxo.script),
      satoshis: utxo.satoshis
    };
  }

  /**
   * Get UTXOs in the format expected by existing code
   */
  async getUTXOsForSpending(requiredAmount = 0) {
    await this.initialize();
    
    const utxos = await this.loadUTXOs();
    
    // Convert to format expected by existing publish.js code
    return utxos.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.vout,
      satoshis: utxo.satoshis,
      script: utxo.script,
      scriptPubKey: utxo.scriptPubKey || utxo.script
    }));
  }

  /**
   * Synchronize database UTXOs with blockchain (maintenance operation)
   */
  async syncWithBlockchain() {
    await this.initialize();
    
    console.log('🔄 Synchronizing UTXOs with blockchain...');
    
    // Get fresh UTXOs from blockchain
    const blockchainUTXOs = await this.fetchFreshUTXOs();
    
    // Get current database UTXOs
    const dbUTXOs = await UTXOService.getAvailableUTXOs(this.wallet.address, 0, 1000);
    
    // Save new UTXOs from blockchain
    if (blockchainUTXOs.length > 0) {
      await UTXOService.saveUTXOs(
        blockchainUTXOs, 
        this.wallet.address, 
        'sync_operation', 
        'utxo_manager'
      );
    }
    
    // Mark database UTXOs as spent if they don't exist on blockchain
    const blockchainUTXOSet = new Set(
      blockchainUTXOs.map(u => `${u.txid}:${u.vout}`)
    );
    
    let markedSpent = 0;
    for (const dbUTXO of dbUTXOs) {
      const utxoKey = `${dbUTXO.txid}:${dbUTXO.vout}`;
      if (!blockchainUTXOSet.has(utxoKey)) {
        try {
          await this.markUTXOSpent(dbUTXO, 'sync_spent');
          markedSpent++;
        } catch (error) {
          console.warn(`Failed to mark ${utxoKey} as spent:`, error.message);
        }
      }
    }
    
    console.log(`✅ Sync complete: ${blockchainUTXOs.length} fresh UTXOs, ${markedSpent} marked spent`);
    
    return {
      freshUTXOs: blockchainUTXOs.length,
      markedSpent
    };
  }
}