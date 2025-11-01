#!/usr/bin/env node

/**
 * Enhanced BSV Wallet Generator
 * 
 * Generates BSV wallet keys with support for:
 * - Multiple wallet types (funding, publishing, sweep)
 * - Custom WIF key import
 * - Network selection (mainnet/testnet)
 * - Batch generation
 * - Integration with init.js
 * 
 * Usage:
 *   npm run generate-keys                         # Generate funding wallet
 *   npm run generate-keys -- --type publishing   # Generate specific wallet type
 *   npm run generate-keys -- --all              # Generate all three wallets
 *   npm run generate-keys -- --wif <wif_key>    # Import from WIF
 *   npm run generate-keys -- --network test     # Use testnet
 */

import bsv from 'smartledger-bsv';
import fs from 'fs';
import path from 'path';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  title: (msg) => console.log(`${colors.bright}${colors.cyan}🔑 ${msg}${colors.reset}`)
};

class WalletGenerator {
  constructor(options = {}) {
    this.options = options;
    // Map network names to BSV library format
    const networkMap = {
      'main': 'livenet',
      'test': 'testnet',
      'livenet': 'livenet',
      'testnet': 'testnet',
      'regtest': 'regtest'
    };
    this.network = networkMap[options.network] || 'livenet';
    this.walletsDir = './wallets';
  }

  async generateWallet(type = 'funding', wif = null) {
    try {
      // Ensure wallets directory exists
      if (!fs.existsSync(this.walletsDir)) {
        fs.mkdirSync(this.walletsDir, { recursive: true });
        log.info(`Created wallets directory: ${this.walletsDir}`);
      }

      let privateKey;
      
      if (wif) {
        // Import from WIF
        try {
          privateKey = bsv.PrivateKey.fromWIF(wif);
          log.info(`Importing wallet from WIF...`);
        } catch (error) {
          throw new Error(`Invalid WIF key: ${error.message}`);
        }
      } else {
        // Generate new random private key
        privateKey = bsv.PrivateKey.fromRandom();
        log.info(`Generating new ${type} wallet...`);
      }

      // Derive public key and address
      const publicKey = privateKey.toPublicKey();
      const address = privateKey.toAddress(this.network);

      // Create wallet object
      const wallet = {
        privateKey: privateKey.toWIF(),
        publicKey: publicKey.toString(),
        address: address.toString(),
        network: this.network,
        type: type,
        created: new Date().toISOString()
      };

      // Determine filename
      const filename = this.getWalletFilename(type);
      const filepath = path.join(this.walletsDir, filename);

      // Check if wallet already exists
      if (fs.existsSync(filepath) && !this.options.force) {
        if (this.options.interactive) {
          const readline = await import('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          const answer = await new Promise(resolve => {
            rl.question(`${type} wallet already exists. Overwrite? (y/N): `, resolve);
          });
          
          rl.close();
          
          if (answer.toLowerCase() !== 'y') {
            log.warning(`Skipped ${type} wallet generation`);
            return null;
          }
        } else {
          log.warning(`${type} wallet already exists at ${filepath}. Use --force to overwrite.`);
          return null;
        }
      }

      // Save wallet to file
      fs.writeFileSync(filepath, JSON.stringify(wallet, null, 2));
      
      log.success(`Generated ${type} wallet: ${address.toString()}`);
      log.info(`Saved to: ${filepath}`);
      
      return wallet;

    } catch (error) {
      log.error(`Failed to generate ${type} wallet: ${error.message}`);
      throw error;
    }
  }

  async generateAllWallets() {
    log.title('Generating All BSV Wallets');
    console.log('============================');
    console.log();

    const walletTypes = ['funding', 'publishing', 'sweep'];
    const generatedWallets = {};

    for (const type of walletTypes) {
      try {
        const wallet = await this.generateWallet(type);
        if (wallet) {
          generatedWallets[type] = wallet;
        }
        console.log(); // Add spacing
      } catch (error) {
        log.error(`Failed to generate ${type} wallet: ${error.message}`);
      }
    }

    this.showWalletSummary(generatedWallets);
    this.showFundingInstructions(generatedWallets);
    
    return generatedWallets;
  }

  getWalletFilename(type) {
    const filenames = {
      funding: 'wallet.json',
      publishing: 'publishing-wallet.json',
      sweep: 'sweep-wallet.json'
    };
    
    return filenames[type] || `${type}-wallet.json`;
  }

  showWalletSummary(wallets) {
    console.log();
    log.title('Wallet Summary');
    console.log('===============');
    console.log();

    Object.entries(wallets).forEach(([type, wallet]) => {
      console.log(`${colors.bright}${type.toUpperCase()} WALLET:${colors.reset}`);
      console.log(`  Address: ${colors.green}${wallet.address}${colors.reset}`);
      console.log(`  Network: ${wallet.network}`);
      console.log(`  File: ${this.getWalletFilename(type)}`);
      console.log();
    });
  }

  showFundingInstructions(wallets) {
    log.title('Funding Instructions');
    console.log('====================');
    console.log();

    if (wallets.funding) {
      log.info('Next Steps:');
      console.log('1. Fund your FUNDING wallet with BSV:');
      console.log(`   ${colors.bright}${wallets.funding.address}${colors.reset}`);
      console.log();
      console.log('2. Split UTXOs for efficient publishing:');
      console.log('   npm run split-utxos 50 10');
      console.log();
      console.log('3. Start publishing data:');
      console.log('   npm run publish "Hello BSV!"');
      console.log();
    }

    log.warning('⚠️  SECURITY REMINDERS:');
    console.log('• Keep your private keys secure and backed up');
    console.log('• Never share your wallet.json files');
    console.log('• The funding wallet holds your main BSV balance');
    console.log('• Publishing wallet uses small UTXOs (10 sats each)');
    console.log('• Sweep wallet collects change from transactions');
    console.log();

    if (this.network === 'test') {
      log.info('Testnet Resources:');
      console.log('• Get testnet BSV: https://test.bitails.io/');
      console.log('• Testnet explorer: https://test.whatsonchain.com/');
    } else {
      log.info('Mainnet Resources:');
      console.log('• BSV explorer: https://whatsonchain.com/');
      console.log('• Buy BSV at exchanges like CoinEx, Bittrex, etc.');
    }
  }

  showHelp() {
    console.log(`
Enhanced BSV Wallet Generator

Usage:
  npm run generate-keys [network] [-- options]

Positional Arguments:
  network              Network: livenet (default), testnet, or regtest

Options:
  --type <type>        Generate specific wallet (funding, publishing, sweep)
  --all               Generate all three wallet types
  --wif <wif_key>     Import wallet from WIF private key
  --network <net>     Network: livenet, testnet, regtest, main, or test
  --force             Overwrite existing wallets
  --interactive       Ask before overwriting existing wallets
  --help              Show this help message

Examples:
  npm run generate-keys                                # Generate funding wallet (livenet)
  npm run generate-keys livenet                        # Generate funding wallet (livenet)
  npm run generate-keys testnet                        # Generate funding wallet (testnet)
  npm run generate-keys -- --type publishing          # Generate publishing wallet
  npm run generate-keys -- --all                      # Generate all wallets
  npm run generate-keys testnet -- --all              # Generate all testnet wallets
  npm run generate-keys -- --wif L1abc...             # Import from WIF key
  npm run generate-keys -- --all --force              # Overwrite existing wallets

Wallet Types:
  funding     - Main wallet for holding BSV and splitting UTXOs
  publishing  - Wallet with small UTXOs for efficient data publishing
  sweep       - Wallet that collects change outputs from transactions
    `);
  }
}

// CLI argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Handle first positional argument as network if it's a valid network
  if (args.length > 0 && !args[0].startsWith('--')) {
    const firstArg = args[0];
    if (['livenet', 'testnet', 'regtest', 'main', 'test'].includes(firstArg)) {
      options.network = firstArg;
      args.shift(); // Remove the processed argument
    }
  }
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--type':
      case '-t':
        options.type = args[++i];
        break;
      case '--all':
      case '-a':
        options.all = true;
        break;
      case '--wif':
      case '-w':
        options.wif = args[++i];
        break;
      case '--network':
      case '-n':
        options.network = args[++i];
        break;
      case '--force':
      case '-f':
        options.force = true;
        break;
      case '--interactive':
      case '-i':
        options.interactive = true;
        break;
    }
  }
  
  return options;
}

// Export for use in other modules
export { WalletGenerator };

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs();
  const generator = new WalletGenerator(options);

  if (options.help) {
    generator.showHelp();
    process.exit(0);
  }

  try {
    if (options.all) {
      await generator.generateAllWallets();
    } else {
      const type = options.type || 'funding';
      const wallet = await generator.generateWallet(type, options.wif);
      
      if (wallet) {
        generator.showWalletSummary({ [type]: wallet });
        generator.showFundingInstructions({ [type]: wallet });
      }
    }
  } catch (error) {
    log.error(`Wallet generation failed: ${error.message}`);
    process.exit(1);
  }
}
