# BSV Starter Template - Complete Setup Guide

Welcome to the comprehensive setup guide for the BSV Blockchain Starter Template! This guide will walk you through every step needed to get your BSV application up and running.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Interactive Initialization](#interactive-initialization)
4. [Wallet Management](#wallet-management)
5. [UTXO Optimization](#utxo-optimization)
6. [Publishing Your First Transaction](#publishing-your-first-transaction)
7. [Advanced Configuration](#advanced-configuration)
8. [Troubleshooting](#troubleshooting)
9. [Production Deployment](#production-deployment)

## 🔧 Prerequisites

### System Requirements

- **Node.js**: Version 16 or higher with ES Module support
- **MongoDB**: Local instance or cloud service (MongoDB Atlas recommended)
- **BSV**: Some Bitcoin SV for transactions (testnet recommended for learning)
- **Git**: For version control and cloning the repository

### Installation Verification

```bash
# Check Node.js version (should be 16+)
node --version

# Check npm version
npm --version

# Check MongoDB (if running locally)
mongod --version

# Check Git
git --version
```

### MongoDB Setup Options

#### Option 1: Local MongoDB
```bash
# Ubuntu/Debian
sudo apt install mongodb

# macOS with Homebrew
brew install mongodb-community

# Start MongoDB service
sudo systemctl start mongod  # Linux
brew services start mongodb-community  # macOS
```

#### Option 2: MongoDB Atlas (Recommended)
1. Visit [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free account
3. Create a new cluster
4. Get your connection string (save for later)

## 🚀 Initial Setup

### 1. Clone the Repository

```bash
# Clone this starter template
git clone <your-repo-url> my-bsv-app
cd my-bsv-app

# Install dependencies
npm install
```

### 2. Verify Installation

```bash
# Check that all dependencies installed correctly
npm list --depth=0
```

You should see key packages like:
- `smartledger-bsv`
- `mongoose`
- `mongodb`
- And others...

## 🎯 Interactive Initialization

### Start the Setup Wizard

```bash
npm run init
```

This launches the **BSV Application Starter** interactive wizard that will guide you through:

### Step 1: MongoDB Configuration
```
🔗 MongoDB Connection Setup
Enter MongoDB URI: mongodb://localhost:27017/my-bsv-app
Testing connection... ✅ Connected successfully!
```

**Connection String Examples:**
- Local: `mongodb://localhost:27017/your-app-name`
- Atlas: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>`

### Step 2: Network Selection
```
🌐 Network Selection
Select BSV network:
1. Mainnet (real BSV, real money)
2. Testnet (free test BSV)
Choice: 2
```

**Recommendation**: Start with testnet (option 2) for learning and development.

### Step 3: Wallet Management
```
🔑 Wallet Management
Choose wallet setup:
1. Generate new wallets (recommended for new projects)
2. Import existing wallet from WIF
3. Skip wallet setup (configure manually later)
Choice: 1
```

#### Option 1: Generate New Wallets
The wizard will create three wallets:
- **Funding Wallet**: Your main BSV storage
- **Publishing Wallet**: Optimized for frequent transactions
- **Sweep Wallet**: Collects change outputs

#### Option 2: Import Existing Wallet
```
Enter your WIF private key: L1abc123def456...
Import as: funding
✅ Imported funding wallet successfully!
```

### Step 4: Initial Verification
```
💰 Wallet Verification
Checking balances...
Funding wallet: 0 BSV (needs funding)
Publishing wallet: 0 UTXOs available

📋 Setup complete! Next steps:
1. Fund your funding wallet: 1YourAddress...
2. Split UTXOs: npm run split-utxos 50 10
3. Start publishing: npm run publish "Hello BSV!"
```

## 🔑 Wallet Management

### Understanding the Multi-Wallet Architecture

| Wallet Type | Purpose | Optimal UTXO Size | Usage |
|-------------|---------|-------------------|--------|
| **Funding** | Main BSV storage, UTXO splitting | Large (1000+ sats) | Rarely used directly |
| **Publishing** | Frequent transactions | Small (10 sats) | Every transaction |
| **Sweep** | Change collection | Any size | Automatic cleanup |

### Advanced Wallet Commands

```bash
# Generate all wallet types
npm run generate-keys -- --all

# Generate specific wallet type
npm run generate-keys -- --type publishing

# Import from WIF key
npm run generate-keys -- --wif L1abc123... --type funding

# Use testnet
npm run generate-keys -- --all --network test

# Interactive mode (asks before overwriting)
npm run generate-keys -- --all --interactive

# Force overwrite existing wallets
npm run generate-keys -- --all --force
```

### Wallet File Locations

After setup, your wallets are stored in:
```
wallets/
├── wallet.json              # Funding wallet
├── publishing-wallet.json   # Publishing wallet (10-sat UTXOs)
└── sweep-wallet.json        # Sweep wallet
```

**Security Note**: These files contain private keys and are automatically gitignored.

## 💰 Funding Your Wallets

### For Testnet (Free)

1. **Get Testnet BSV**:
   - Visit [BSV Testnet Faucet](https://test.bitails.io/)
   - Enter your funding wallet address
   - Request testnet BSV (usually 0.01 BSV)

2. **Verify Receipt**:
   ```bash
   npm run get-utxos
   ```

### For Mainnet (Real BSV)

1. **Purchase BSV** from exchanges like:
   - CoinEx
   - Bittrex
   - KuCoin

2. **Send to Funding Wallet**:
   - Use the address from your `wallets/wallet.json`
   - Start with small amounts for testing

## ⚡ UTXO Optimization

### Understanding UTXO Strategy

The key to ultra-low fees is using small UTXOs. Here's why:

| UTXO Size | Fee Rate | Efficiency | Best For |
|-----------|----------|------------|----------|
| 10 sats | 45.66 sat/KB | ✅ Optimal | High-frequency publishing |
| 25 sats | 135.86 sat/KB | ⚠️ Higher | Medium-frequency use |
| 546 sats | 10 sat/KB | 💰 Wasteful | Traditional transactions |

### UTXO Splitting Commands

```bash
# Optimal for most applications (recommended)
npm run split-utxos 50 10

# High-frequency applications
npm run split-utxos 100 5

# Lower-frequency, slightly larger data
npm run split-utxos 25 25

# Custom amounts
npm run split-utxos <count> <satoshis>
```

### Monitoring UTXOs

```bash
# Check available UTXOs
npm run get-utxos

# Verify UTXO status in database
node src/getUtxosMongo.js
```

Example output:
```
📊 UTXO Summary:
Available UTXOs: 47
Total Value: 470 satoshis
Average Size: 10 satoshis
Ready for publishing: ✅
```

## 📡 Publishing Your First Transaction

### Simple Publishing

```bash
# Publish a simple message
npm run publish "Hello BSV Blockchain!"
```

### Programmatic Publishing

```javascript
import { publishData } from './src/publishMongo.js';

// Using async generator for real-time progress
for await (const update of publishData("My important data")) {
  console.log(`Stage: ${update.stage}`);
  
  if (update.message) {
    console.log(`Progress: ${update.message}`);
  }
  
  if (update.stage === 'done') {
    console.log(`✅ Published! TXID: ${update.txid}`);
    console.log(`Remaining UTXOs: ${update.publishingUTXOs}`);
    break;
  }
}
```

### Progress Stages

The publishing process goes through these stages:
1. **wallets_loaded**: Wallet files loaded and validated
2. **utxos_reserved**: UTXO selected and reserved in MongoDB
3. **tx_built**: Transaction constructed and signed
4. **broadcasted**: Transaction sent to BSV network
5. **done**: Transaction confirmed, UTXO marked as spent

## 🔧 Advanced Configuration

### Environment Variables

Create a `.env` file for advanced configuration:

```env
# Network Configuration
BSV_NETWORK=test
WHATSONCHAIN_API=https://api.whatsonchain.com/v1/bsv/test

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/my-bsv-app
MONGODB_OPTIONS={"useNewUrlParser": true}

# Application Settings
DEFAULT_FEE_RATE=10
MAX_UTXO_AGE_HOURS=24
DEBUG_MODE=true

# Security Settings (for production)
ENABLE_RATE_LIMITING=true
MAX_REQUESTS_PER_MINUTE=60
```

### Custom Configuration

Edit `src/publishMongo.js` for application-specific settings:

```javascript
// Customize fee rates
const FEE_RATE = 10; // satoshis per KB

// Customize UTXO selection
const PREFERRED_UTXO_SIZE = 10; // satoshis

// Customize data encoding
const OP_RETURN_PREFIX = '19HxigV4QyBv3tHpQVcUEQyq1pzZVdoAut'; // Your app identifier
```

### Network Switching

To switch between testnet and mainnet:

```bash
# Switch to testnet
npm run generate-keys -- --all --network test

# Switch to mainnet (be careful!)
npm run generate-keys -- --all --network main
```

## 🔍 Troubleshooting

### Common Issues and Solutions

#### "Insufficient UTXOs for publishing"
```
❌ Error: No UTXOs available for publishing
```
**Solution**:
1. Check wallet funding: `npm run get-utxos`
2. Split UTXOs if funded: `npm run split-utxos 50 10`
3. Wait for UTXO confirmation (10-20 minutes after splitting)

#### "MongoDB connection failed"
```
❌ Error: MongoNetworkError: connect ECONNREFUSED
```
**Solutions**:
1. **Local MongoDB**: Ensure service is running
   ```bash
   sudo systemctl start mongod  # Linux
   brew services start mongodb-community  # macOS
   ```
2. **MongoDB Atlas**: Check connection string and network access
3. **Firewall**: Ensure MongoDB port (27017) is accessible

#### "Transaction broadcast failed"
```
❌ Error: Transaction broadcast failed
```
**Solutions**:
1. **Check network**: Verify internet connection to BSV network
2. **Verify UTXOs**: Ensure UTXOs haven't been double-spent
3. **Fee rate**: Increase fee rate if network is congested
4. **Data size**: Ensure data fits in single transaction (≤100KB)

#### "Wallet not found"
```
❌ Error: ENOENT: no such file or directory 'wallets/wallet.json'
```
**Solution**:
```bash
# Regenerate wallets
npm run generate-keys -- --all
```

### Debug Mode

Enable detailed logging:

```bash
DEBUG=true npm run publish "debug test"
```

This will show:
- Detailed UTXO selection process
- Transaction building steps
- Network communication
- MongoDB operations

### Checking System Health

```bash
# Verify all components
node -e "
import('./src/publishMongo.js').then(async (module) => {
  console.log('✅ Publishing module loads correctly');
});
"

# Test MongoDB connection
node -e "
import mongoose from 'mongoose';
mongoose.connect('mongodb://localhost:27017/test')
  .then(() => console.log('✅ MongoDB connection successful'))
  .catch(err => console.log('❌ MongoDB error:', err.message));
"
```

## 🚀 Production Deployment

### Security Checklist

- [ ] **Private Keys**: Store securely, never in code or logs
- [ ] **Environment Variables**: Use proper secret management
- [ ] **MongoDB**: Enable authentication and encryption
- [ ] **Network**: Use firewall and VPN for database access
- [ ] **Backups**: Regular wallet and database backups
- [ ] **Monitoring**: Set up transaction and error monitoring

### Recommended Production Setup

1. **Server Configuration**:
   ```bash
   # Use PM2 for process management
   npm install -g pm2
   
   # Create ecosystem file
   echo 'module.exports = {
     apps: [{
       name: "bsv-app",
       script: "src/publishMongo.js",
       env: { NODE_ENV: "production" }
     }]
   }' > ecosystem.config.js
   
   # Start with PM2
   pm2 start ecosystem.config.js
   ```

2. **Database Security**:
   ```javascript
   // Use authenticated MongoDB
   const mongoUri = process.env.MONGODB_URI; // Include auth credentials
   
   // Enable connection pooling
   const options = {
     maxPoolSize: 10,
     serverSelectionTimeoutMS: 5000,
     socketTimeoutMS: 45000,
   };
   ```

3. **Monitoring Setup**:
   ```bash
   # Monitor logs
   pm2 logs bsv-app
   
   # Monitor performance
   pm2 monit
   
   # Set up alerts for failed transactions
   # (implement custom monitoring based on your needs)
   ```

### Scaling Considerations

1. **Database Optimization**:
   - Index frequently queried fields
   - Implement UTXO cleanup routines
   - Consider sharding for high-volume applications

2. **Application Architecture**:
   - Use connection pooling for MongoDB
   - Implement queue system for high-frequency publishing
   - Add rate limiting and request validation

3. **Infrastructure**:
   - Load balancing for multiple instances
   - Redis for session management
   - CDN for static assets

---

## 🎉 Congratulations!

You now have a fully configured BSV blockchain application! 

### Next Steps:
1. **Explore Features**: Try different publishing options
2. **Build Your App**: Add your specific business logic
3. **Deploy to Production**: Follow the production guidelines
4. **Join the Community**: Share your BSV application with the community

### Resources for Continued Learning:
- [BSV Documentation](https://docs.bsv.blockchain/)
- [SmartLedger BSV Library](https://www.npmjs.com/package/smartledger-bsv)
- [MongoDB Best Practices](https://docs.mongodb.com/manual/administration/production-notes/)
- [BSV Developer Resources](https://bitcoinsv.io/developers/)

**Happy Building on BSV! 🚀**