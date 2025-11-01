/**
 * AI Record Label Platform - Main API Server
 * Complete cryptographic identity-driven music rights platform
 * Handles signature-based authentication and blockchain integration
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDatabase } from './database/schemas.js';

// Import API routes
import identityAPI from './api/identityAPI.js';
import attestationAPI from './api/attestationAPI.js';
import blockchainAttestationAPI from './api/blockchainAttestationAPI.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:5500'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/public', express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/identity', identityAPI);
app.use('/api/attestation', attestationAPI);
app.use('/api/blockchain-attestation', blockchainAttestationAPI);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'AI Record Label Platform',
    timestamp: new Date().toISOString(),
    features: [
      'Cryptographic Identity Management',
      'BSV Blockchain Integration',
      'Music Rights Management',
      'Signature-based Authentication',
      'Multi-party Ownership',
      'Micro-payment Royalties'
    ]
  });
});

// Serve web3keys.html at root for easy access
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'web3keys.html'));
});

// API Documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'AI Record Label API Documentation',
    version: '1.0.0',
    description: 'Cryptographic identity-driven music rights platform with BSV blockchain integration',
    
    authentication: {
      method: 'Signature-based',
      description: 'Uses BIP32/BIP44 HD wallet signatures instead of passwords',
      flow: [
        '1. Generate identity with /public/web3keys.html',
        '2. Register identity with POST /api/identity/register',
        '3. Get auth challenge with POST /api/identity/auth/challenge',
        '4. Sign challenge and verify with POST /api/identity/auth/verify'
      ]
    },
    
    endpoints: {
      identity: {
        'POST /api/identity/register': 'Register new cryptographic identity',
        'POST /api/identity/auth/challenge': 'Get authentication challenge',
        'POST /api/identity/auth/verify': 'Verify signed challenge',
        'POST /api/identity/action/sign': 'Get signing instructions for action',
        'POST /api/identity/action/execute': 'Execute signed action'
      },
      attestation: {
        'GET /api/attestation/templates': 'List available contract templates',
        'POST /api/attestation/create': 'Create new attestation from template',
        'GET /api/attestation/:id': 'Get attestation details',
        'POST /api/attestation/:id/sign': 'Sign attestation with crypto key',
        'GET /api/attestation/:id/verify': 'Verify attestation signatures',
        'GET /api/attestation': 'List all attestations',
        'POST /api/attestation/create-and-sign': 'Create and sign in one step'
      },
      blockchain_attestation: {
        'POST /api/blockchain-attestation/create-with-audit': 'Create attestation with blockchain audit',
        'POST /api/blockchain-attestation/:id/sign-with-audit': 'Sign with blockchain recording',
        'GET /api/blockchain-attestation/:id/audit-trail': 'Get complete blockchain audit trail',
        'POST /api/blockchain-attestation/:id/generate-zk-proof': 'Generate privacy-preserving proof',
        'POST /api/blockchain-attestation/verify-zk-proof': 'Verify zk-proof without private data',
        'GET /api/blockchain-attestation/:id/blockchain-status': 'Get blockchain anchoring status',
        'GET /api/blockchain-attestation/:id/legal-export': 'Export for legal compliance'
      }
    },
    
    keyDerivation: {
      purpose: "Music industry specialized key types",
      basePath: "m/44'/236'",
      keyTypes: {
        identity: "m/44'/236'/0'/0/0 - User authentication",
        property: "m/44'/236'/1'/0/0 - Song ownership & uploads", 
        contractual: "m/44'/236'/2'/0/0 - Agreements & licensing",
        privacy: "m/44'/236'/3'/0/0 - Private communications",
        messages: "m/44'/236'/4'/0/0 - Public communications", 
        financial: "m/44'/236'/5'/0/0 - Payments & royalties",
        document: "m/44'/236'/6'/0/0 - Document signing & verification"
      }
    },
    
    actionKeyMapping: {
      'verify-identity': 'identity',
      'create-profile': 'identity',
      'upload-song': 'property',
      'claim-ownership': 'property',
      'sign-agreement': 'contractual',
      'license-music': 'contractual',
      'send-private-message': 'privacy',
      'access-private-content': 'privacy',
      'send-public-message': 'messages',
      'post-announcement': 'messages',
      'process-payment': 'financial',
      'distribute-royalties': 'financial',
      'sign-document': 'document',
      'verify-document': 'document'
    },
    
    examples: {
      registration: {
        description: 'Example registration payload from web3keys.html',
        endpoint: 'POST /api/identity/register',
        payload: {
          signedRegistration: {
            signature: 'base64_signature',
            publicKey: 'compressed_public_key',
            payload: {
              action: 'register-identity',
              timestamp: '2024-01-01T00:00:00.000Z',
              data: {
                identityAddress: '1ABC...xyz',
                publicKeys: { /* all 7 key types */ },
                addresses: { /* all 7 addresses */ },
                userInfo: {
                  email: 'artist@music.com',
                  firstName: 'Artist',
                  role: 'artist'
                }
              }
            }
          }
        }
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /',
      'GET /health',
      'GET /api/docs', 
      'POST /api/identity/register',
      'POST /api/identity/auth/challenge',
      'POST /api/identity/auth/verify',
      'POST /api/identity/action/sign',
      'POST /api/identity/action/execute',
      'GET /api/attestation/templates',
      'POST /api/attestation/create',
      'POST /api/attestation/:id/sign',
      'GET /api/attestation/:id/verify'
    ]
  });
});

// Start server
async function startServer() {
  try {
    // Connect to database
    await connectDatabase();
    console.log('✅ Database connected successfully');
    
    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 AI Record Label Platform running on port ${PORT}`);
      console.log(`📝 Web3 Key Generator: http://localhost:${PORT}/`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
      console.log(`💊 Health Check: http://localhost:${PORT}/health`);
      console.log(`\n🔐 Authentication Flow:`);
      console.log(`   1. Generate keys: http://localhost:${PORT}/`);
      console.log(`   2. Register identity: POST /api/identity/register`);
      console.log(`   3. Authenticate: POST /api/identity/auth/challenge + verify`);
      console.log(`\n🎵 Ready for cryptographic music rights management!`);
    });
    
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});

// Start the server
startServer();

export default app;