# BSV Blockchain Starter Template 🚀

![BSV](https://img.shields.io/badge/BSV-Blockchain-orange)
![MongoDB](https://img.shields.io/badge/MongoDB-UTXO%20Management-green)
![License](https://img.shields.io/badge/License-MIT-blue)

> **🔐 Security Note**: This repository contains template files. The wallet JSON files in the `/wallets/` directory are gitignored and should contain your actual funded keys for local development only. Never commit real private keys to version control.

A comprehensive starter template for building BSV (Bitcoin SV) blockchain applications with MongoDB UTXO management, ultra-efficient fee optimization, and professional project structure. Ready-to-use with interactive setup wizard!

## ✨ Features

- **🎯 Interactive Setup Wizard**: Complete project initialization with `npm run init`
- **🔑 Multi-Wallet Architecture**: Funding, publishing, and sweep wallets for optimal UTXO management
- **⚡ Ultra-Efficient Publishing**: 10-sat UTXOs achieving 45.66 sat/KB effective fee rates (66% improvement)
- **🗄️ MongoDB UTXO State**: Complete transaction state management with atomic reservations
- **🔐 Security First**: Private keys never logged, secure wallet file management, gitignore protection
- **📊 Professional Structure**: Organized project layout with comprehensive npm scripts
- **🛠️ Advanced Wallet Tools**: CLI options for WIF import, network selection, batch generation
- **⚡ Zero-Knowledge Proofs**: Privacy-preserving proof generation and verification
- **📝 Digital Signatures**: Multi-identity signature management system

## 📁 Project Structure

```
bsv-blockchain-starter/
├── src/                    # Core publishing system
│   ├── publishMongo.js     # Main publishing engine
│   ├── utxoManagerMongo.js # MongoDB UTXO management
│   ├── splitUtxos.js       # UTXO splitting utility
│   └── getUtxosMongo.js    # UTXO fetching and sync
├── scripts/                # Utility scripts
│   ├── generate-wallet-keys.js # Enhanced wallet generation with CLI options
│   ├── extract-op-return.js    # OP_RETURN data extraction
│   ├── signature.js            # Digital signature demo
│   └── zk-proof.js            # Zero-knowledge proofs
├── database/               # MongoDB schemas and services
│   ├── schemas.js          # Database models
│   ├── services.js         # CRUD operations
│   └── init.js            # Database initialization
├── wallets/                      # Secure wallet storage (gitignored)
│   ├── wallet.json              # Funding wallet (main BSV storage)
│   ├── publishing-wallet.json   # Publishing wallet (10-sat UTXOs)
│   └── sweep-wallet.json        # Sweep wallet (collects change)
├── database/                     # MongoDB configuration and models
│   ├── init.js                  # Database initialization
│   ├── schemas.js               # Mongoose schemas
│   ├── services.js              # Database service layer
│   └── models/                  # Data models
├── docs/                        # Documentation and guides
├── tools/                       # Development tools and utilities
├── init.js                     # Interactive project setup wizard
└── package.json               # Project configuration with npm scripts
```

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ with ES Module support
- MongoDB instance (local or cloud)
- BSV funding (mainnet or testnet)

### 1. Clone and Initialize

```bash
git clone <your-repo-url>
cd bsv-blockchain-starter
npm install
npm run init
```

The **interactive setup wizard** will guide you through:
- ✅ MongoDB connection testing
- 🔑 Wallet generation or import (with custom WIF options)
- 🌐 Network selection (mainnet/testnet)
- 💰 Balance verification and funding instructions
- 📋 Complete project initialization

### 2. Fund Your Wallet

After initialization, fund your **funding wallet** with BSV:
```
Your funding wallet address: 1YourGeneratedAddress...
```

### 3. Split UTXOs for Efficient Publishing

```bash
# Create 50 UTXOs of 10 satoshis each (optimal for publishing)
npm run split-utxos 50 10
```

### 4. Start Publishing

```bash
# Publish your first message to the BSV blockchain
npm run publish "Hello BSV Blockchain!"
```

## 📚 Usage Examples

### Basic Publishing
```javascript
import { publishData } from './src/publishMongo.js';

for await (const update of publishData("Hello BSV!")) {
  console.log(`${update.stage}: ${update.message || ''}`);
  
  if (update.stage === 'done') {
    console.log(`Published! TXID: ${update.txid}`);
    console.log(`Remaining UTXOs: ${update.publishingUTXOs}`);
  }
}
```

### UTXO Management
```javascript
import { UTXOManagerMongo } from './src/utxoManagerMongo.js';

const manager = new UTXOManagerMongo('./wallets/wallet.json');
await manager.initialize();

// Get balance
const balance = await manager.getBalance();
console.log(`Balance: ${balance} satoshis`);

// Get UTXOs
const utxos = await manager.getUTXOs();
console.log(`Available UTXOs: ${utxos.length}`);
```

### Zero-Knowledge Proofs
```bash
npm run zk-proof
```

### Extract OP_RETURN Data
```bash
npm run extract <txid>
```

## 🔧 Configuration

### MongoDB Setup
The system requires MongoDB for UTXO state management:

```javascript
// Database automatically creates these collections:
// - users: User management
// - utxos: UTXO tracking with status (available/reserved/spent)
// - notarizations: Transaction records
// - audit_trails: Complete audit history
```

### Wallet Architecture

- **Funding Wallet**: Holds large UTXOs for splitting
- **Publishing Wallet**: Contains small UTXOs (10 sats) for efficient publishing
- **Sweep Wallet**: Collects change outputs

### Fee Optimization

The system achieves ultra-low effective fees:
- Target: 10 sat/KB transaction fee rate
- With 10-sat UTXOs: ~45.66 sat/KB effective rate
- With 25-sat UTXOs: ~135.86 sat/KB effective rate
- **Improvement: 66% reduction** using smaller UTXOs

## 📊 Performance Metrics

### UTXO Efficiency Comparison
| UTXO Size | Effective Fee Rate | Efficiency |
|-----------|-------------------|------------|
| 10 sats   | 45.66 sat/KB     | ✅ Optimal |
| 25 sats   | 135.86 sat/KB    | ⚠️ Higher  |
| 546 sats  | 10 sat/KB        | 💰 Wasteful|

### Transaction Sizes
- Small data (≤50 bytes): ~180-220 bytes
- Medium data (≤200 bytes): ~350-400 bytes
- Fee calculation: `(tx_size / 1000) * 10` sats

## 🛠 Development

### Available NPM Scripts

```bash
npm run generate-keys     # Generate wallet keypairs
npm run split-utxos      # Split large UTXOs into small ones
npm run publish          # Publish data to blockchain
npm run get-utxos        # Fetch and sync UTXOs
npm run extract          # Extract OP_RETURN data
npm run zk-proof         # Generate ZK proofs
npm run signature        # Digital signature demo
npm run test             # Run test suite
```

### Testing

```bash
# Test publishing system
npm test

# Test individual components
node src/publishMongo.js "test message"
node src/splitUtxos.js split 10 10
npm run zk-proof
```

## 🔐 Security

### Private Key Management
- Wallet files are gitignored for security
- Use environment variables for sensitive data
- Regular backups recommended

### UTXO Reservation System
- Atomic UTXO reservation prevents double-spending
- Automatic cleanup of failed transactions
- Comprehensive audit trail

### Database Security
- MongoDB connection with authentication
- Audit trails for all UTXO operations
- Status tracking prevents UTXO conflicts

## 🌐 API Reference

### Publishing API
```javascript
publishData(text, options)
// Returns: AsyncGenerator with progress updates
// Stages: wallets_loaded → utxos_reserved → tx_built → broadcasted → done
```

### UTXO Manager API
```javascript
const manager = new UTXOManagerMongo(walletPath);
await manager.initialize();
await manager.getBalance();
await manager.getUTXOs(limit);
await manager.addUTXO(utxoData);
```

### Database Services API
```javascript
UTXOService.getAvailableUTXOs(address, minAmount, limit);
UTXOService.reserveUTXO(address, amount, actor);
UTXOService.markUTXOSpent(txid, vout, spentTxid, actor);
UTXOService.addUTXO(utxoData, actor);
```

## 📋 Troubleshooting

### Common Issues

**"Insufficient UTXOs"**
- Run `npm run split-utxos` to create publishing UTXOs
- Check wallet funding with `npm run get-utxos`

**MongoDB Connection Issues**
- Verify MONGODB_URI in .env file
- Ensure MongoDB is running
- Check network connectivity

**High Fee Rates**
- Use smaller UTXOs (10 sats recommended)
- Check UTXO size distribution
- Consider re-splitting UTXOs

### Debug Mode
```bash
DEBUG=true npm run publish "debug message"
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Make changes and test thoroughly
4. Commit: `git commit -am 'Add new feature'`
5. Push: `git push origin feature/new-feature`
6. Create Pull Request

### Development Guidelines
- Follow existing code style
- Add tests for new features
- Update documentation
- Test with both testnet and mainnet

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- BSV Blockchain for the scalable blockchain infrastructure
- smartledger-bsv library for transaction building
- MongoDB for robust data management
- Node.js ecosystem for development tools

## 📞 Support

For issues and questions:
- Create GitHub issues for bugs
- Check troubleshooting section
- Review API documentation
- Test with small amounts first

---

**Created with ❤️ for the BSV ecosystem**# bsv-blockchain-starter
