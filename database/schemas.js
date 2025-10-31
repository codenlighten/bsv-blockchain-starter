/**
 * LabLedger MongoDB Database Schema
 * Comprehensive collection framework for laboratory data integrity platform
 */

import mongoose from 'mongoose';

// =============================================
// 1. USER COLLECTION SCHEMA
// =============================================

const userSchema = new mongoose.Schema({
  // Basic Identity
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Authentication
  passwordHash: {
    type: String,
    required: true
  },
  salt: {
    type: String,
    required: true
  },
  
  // Profile Information
  profile: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    title: { type: String }, // Lab Director, Technician, etc.
    phone: { type: String },
    organization: { 
      type: String, // Use organizationId string instead of ObjectId
      required: true,
      index: true
    }
  },
  
  // Role and Permissions
  role: {
    type: String,
    enum: ['lab_admin', 'lab_technician', 'regulator', 'auditor', 'system_admin'],
    required: true,
    index: true
  },
  permissions: [{
    type: String,
    enum: [
      'submit_data', 'sign_reports', 'notarize_blockchain', 
      'view_audit_trail', 'manage_users', 'verify_compliance',
      'generate_zk_proofs', 'access_raw_data', 'admin_system'
    ]
  }],
  
  // Cryptographic Identity
  cryptoIdentity: {
    publicKey: { type: String, required: true }, // Hex encoded
    address: { type: String, required: true }, // BSV address
    did: { type: String }, // Decentralized Identifier
    keyDerivationPath: { type: String, default: "m/44'/236'/0'/0/0" },
    encryptedPrivateKey: { type: String }, // AES encrypted, only for recovery
    web3KeysRegistration: {
      registered: { type: Boolean, default: false },
      registrationTxid: { type: String },
      registrationDate: { type: Date }
    }
  },
  
  // Account Status
  status: {
    type: String,
    enum: ['active', 'suspended', 'pending_verification', 'deactivated'],
    default: 'pending_verification',
    index: true
  },
  emailVerified: { type: Boolean, default: false },
  lastLogin: { type: Date },
  loginAttempts: { type: Number, default: 0 },
  lockoutUntil: { type: Date },
  
  // Lab-Specific Data
  labCertifications: [{
    certification: { type: String }, // NELAP, EPA, etc.
    number: { type: String },
    expiryDate: { type: Date },
    isActive: { type: Boolean, default: true }
  }],
  
  // Security Settings
  security: {
    twoFactorEnabled: { type: Boolean, default: false },
    backupCodes: [{ type: String }],
    sessionTimeout: { type: Number, default: 3600 }, // seconds
    ipWhitelist: [{ type: String }],
    lastPasswordChange: { type: Date },
    passwordHistory: [{ 
      hash: String, 
      createdAt: { type: Date, default: Date.now } 
    }]
  },
  
  // Preferences
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      blockchain: { type: Boolean, default: true },
      auditAlerts: { type: Boolean, default: true }
    },
    dashboard: {
      defaultView: { type: String, default: 'overview' },
      timezone: { type: String, default: 'UTC' }
    }
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now, index: true }
}, {
  timestamps: true,
  collection: 'users',
  suppressReservedKeysWarning: true
});

// =============================================
// 2. NOTARIZATIONS COLLECTION SCHEMA
// =============================================

const notarizationSchema = new mongoose.Schema({
  // Unique Identifiers
  notarizationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Lab Sample Information
  sample: {
    sampleId: { type: String, required: true, index: true },
    labId: { type: String, required: true, index: true },
    location: {
      siteId: { type: String },
      coordinates: {
        latitude: { type: Number },
        longitude: { type: Number }
      },
      address: { type: String },
      state: { type: String, index: true },
      county: { type: String }
    },
    collectionDate: { type: Date, required: true, index: true },
    sampleType: { 
      type: String, 
      enum: ['soil', 'groundwater', 'air', 'produced_water', 'surface_water'],
      required: true,
      index: true
    }
  },
  
  // Lab Analysis Data
  analysis: {
    analytes: [{
      name: { type: String, required: true }, // benzene, arsenic, etc.
      value: { type: Number, required: true },
      units: { type: String, required: true }, // ppb, ppm, mg/L
      detectionLimit: { type: Number },
      quantificationLimit: { type: Number },
      qualifiers: [{ type: String }], // J, U, B flags
      method: { type: String }, // EPA 8260, 524.2, etc.
      casNumber: { type: String }
    }],
    qaqc: {
      blankResults: [{ analyte: String, value: Number }],
      duplicateResults: [{ analyte: String, value: Number, rpdPercent: Number }],
      spikeRecovery: [{ analyte: String, recoveryPercent: Number }],
      surrogateRecovery: [{ surrogate: String, recoveryPercent: Number }]
    },
    labCertifications: [{ type: String }], // NELAP numbers
    analysisDate: { type: Date, required: true },
    reportDate: { type: Date, required: true }
  },
  
  // Regulatory Compliance
  compliance: {
    thresholds: [{
      analyte: { type: String, required: true },
      limit: { type: Number, required: true },
      regulation: { type: String }, // EPA, state-specific
      isCompliant: { type: Boolean, required: true }
    }],
    overallCompliant: { type: Boolean, required: true, index: true },
    regulatoryForms: [{
      formType: { type: String }, // Form 27, etc.
      submissionDate: { type: Date },
      confirmationNumber: { type: String }
    }]
  },
  
  // Cryptographic Proofs
  cryptography: {
    // Data Hash
    dataHash: { type: String, required: true }, // SHA-256 of complete lab data
    
    // Digital Signature
    signature: {
      value: { type: String, required: true }, // DER encoded signature
      publicKey: { type: String, required: true },
      algorithm: { type: String, default: 'ECDSA-secp256k1' },
      timestamp: { type: Date, default: Date.now }
    },
    
    // Zero-Knowledge Proof (if applicable)
    zkProof: {
      hasProof: { type: Boolean, default: false },
      commitment: { type: String }, // Commitment hash
      proofHash: { type: String }, // ZK proof hash
      proofData: { type: mongoose.Schema.Types.Mixed }, // Encrypted proof data
      verificationKey: { type: String }
    }
  },
  
  // Blockchain Information
  blockchain: {
    network: { type: String, default: 'BSV-mainnet', index: true },
    txid: { type: String, required: true, unique: true, index: true },
    blockHeight: { type: Number },
    blockHash: { type: String },
    confirmations: { type: Number, default: 0 },
    fee: { type: Number }, // satoshis
    publishedAt: { type: Date, default: Date.now, index: true },
    opReturnData: { type: String }, // Raw OP_RETURN hex
    explorerUrl: { type: String }
  },
  
  // Chain of Custody
  chainOfCustody: [{
    step: { type: Number, required: true },
    action: { 
      type: String, 
      enum: ['collected', 'received', 'analyzed', 'signed', 'submitted'],
      required: true 
    },
    userId: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    location: { type: String },
    notes: { type: String },
    signature: { type: String }, // Digital signature of this step
    witnessId: { type: String }
  }],
  
  // User Information
  submittedBy: {
    userId: { type: String, required: true, index: true },
    role: { type: String, required: true },
    organization: { type: String, required: true }
  },
  
  // File Attachments
  attachments: [{
    filename: { type: String, required: true },
    fileType: { type: String }, // PDF, CSV, etc.
    size: { type: Number },
    hash: { type: String }, // SHA-256 of file
    uploadDate: { type: Date, default: Date.now },
    encryptedPath: { type: String }, // Encrypted storage path
    metadata: { type: mongoose.Schema.Types.Mixed }
  }],
  
  // Status and Workflow
  status: {
    type: String,
    enum: ['draft', 'signed', 'notarized', 'submitted', 'verified', 'disputed'],
    default: 'draft',
    index: true
  },
  workflowStep: { type: String, index: true },
  reviewedBy: [{ 
    userId: String, 
    reviewDate: Date, 
    status: String, 
    comments: String 
  }],
  
  // Timestamps
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  expiryDate: { type: Date } // For data retention policies
}, {
  timestamps: true,
  collection: 'notarizations',
  suppressReservedKeysWarning: true
});

// =============================================
// 3. AUDIT TRAIL COLLECTION SCHEMA
// =============================================

const auditTrailSchema = new mongoose.Schema({
  // Unique Identifier
  auditId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Event Information
  event: {
    type: {
      type: String,
      enum: [
        // Authentication Events
        'user_login', 'user_logout', 'login_failed', 'password_changed',
        'two_factor_enabled', 'account_locked', 'account_unlocked',
        
        // Data Events
        'data_submitted', 'data_signed', 'data_notarized', 'data_verified',
        'data_modified', 'data_deleted', 'data_exported', 'data_viewed',
        
        // Blockchain Events
        'blockchain_publish', 'blockchain_verify', 'transaction_confirmed',
        'utxo_spent', 'wallet_created', 'key_generated',
        
        // ZK Proof Events
        'zk_proof_generated', 'zk_proof_verified', 'commitment_created',
        'compliance_checked',
        
        // Administrative Events
        'user_created', 'user_modified', 'user_deactivated', 'role_changed',
        'permission_granted', 'permission_revoked', 'organization_added',
        
        // System Events
        'system_startup', 'system_shutdown', 'backup_created', 'restore_performed',
        'security_alert', 'anomaly_detected', 'rate_limit_exceeded',
        
        // File Events
        'file_uploaded', 'file_downloaded', 'file_encrypted', 'file_decrypted',
        
        // API Events
        'api_call', 'api_error', 'webhook_triggered',
        
        // UTXO Management Events
        'bulk_create', 'reserve', 'spend', 'restore', 'cleanup', 'create'
      ],
      required: true,
      index: true
    },
    category: {
      type: String,
      enum: ['authentication', 'data', 'blockchain', 'crypto', 'admin', 'system', 'file', 'api', 'utxo_management'],
      required: true,
      index: true
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'error', 'critical'],
      default: 'info',
      index: true
    }
  },
  
  // Actor Information
  actor: {
    userId: { type: String, index: true },
    role: { type: String },
    ipAddress: { type: String, index: true },
    userAgent: { type: String },
    sessionId: { type: String },
    organizationId: { type: String, index: true }
  },
  
  // Target Information (what was acted upon)
  target: {
    type: {
      type: String,
      enum: ['user', 'sample', 'notarization', 'file', 'transaction', 'proof', 'organization', 'system', 'utxo', 'utxo_collection'],
      index: true
    },
    id: { type: String, index: true }, // ID of the target object
    name: { type: String }, // Human-readable name
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  
  // Event Details
  details: {
    description: { type: String, required: true },
    
    // Before/After for modifications
    changes: {
      before: { type: mongoose.Schema.Types.Mixed },
      after: { type: mongoose.Schema.Types.Mixed },
      fields: [{ type: String }] // Changed field names
    },
    
    // Blockchain specific
    blockchain: {
      txid: { type: String },
      network: { type: String },
      blockHeight: { type: Number },
      fee: { type: Number }
    },
    
    // Cryptographic details
    cryptography: {
      hash: { type: String },
      signature: { type: String },
      publicKey: { type: String },
      algorithm: { type: String }
    },
    
    // Error information
    error: {
      code: { type: String },
      message: { type: String },
      stack: { type: String }
    },
    
    // Performance metrics
    performance: {
      duration: { type: Number }, // milliseconds
      resourceUsage: { type: mongoose.Schema.Types.Mixed }
    },
    
    // Additional context
    context: { type: mongoose.Schema.Types.Mixed }
  },
  
  // Request Information (for API calls)
  request: {
    method: { type: String },
    endpoint: { type: String },
    headers: { type: mongoose.Schema.Types.Mixed },
    body: { type: mongoose.Schema.Types.Mixed }, // Sanitized
    params: { type: mongoose.Schema.Types.Mixed },
    query: { type: mongoose.Schema.Types.Mixed }
  },
  
  // Response Information (for API calls)
  response: {
    statusCode: { type: Number },
    headers: { type: mongoose.Schema.Types.Mixed },
    body: { type: mongoose.Schema.Types.Mixed }, // Sanitized
    size: { type: Number }
  },
  
  // Compliance and Legal
  compliance: {
    regulatoryRequirement: { type: String }, // Which regulation requires this audit
    retentionPeriod: { type: Number }, // days to retain
    classification: { 
      type: String, 
      enum: ['public', 'internal', 'confidential', 'restricted'],
      default: 'internal'
    }
  },
  
  // Correlation and Tracing
  correlation: {
    sessionId: { type: String, index: true },
    requestId: { type: String, index: true },
    parentAuditId: { type: String, index: true }, // Link to parent event
    childAuditIds: [{ type: String }], // Link to child events
    workflowId: { type: String, index: true }, // End-to-end workflow tracking
    batchId: { type: String, index: true } // Batch operations
  },
  
  // Geographic and Network Information
  location: {
    country: { type: String },
    region: { type: String },
    city: { type: String },
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number }
    }
  },
  
  // Timestamps and Lifecycle
  timestamp: { type: Date, default: Date.now, required: true, index: true },
  processedAt: { type: Date },
  archivedAt: { type: Date },
  
  // Data Integrity
  integrity: {
    hash: { type: String }, // Hash of the audit record itself
    signature: { type: String }, // Digital signature of audit record
    merkleProof: { type: String }, // Merkle tree proof for batch verification
    blockchainAnchor: { type: String } // Optional blockchain anchoring
  }
}, {
  timestamps: false, // We handle timestamps manually
  collection: 'audit_trail',
  suppressReservedKeysWarning: true
});

// =============================================
// 4. LAB SAMPLES COLLECTION SCHEMA
// =============================================

const labSampleSchema = new mongoose.Schema({
  // Sample Identification
  sampleId: { type: String, required: true, unique: true, index: true },
  labSampleId: { type: String, required: true, index: true }, // Lab's internal ID
  
  // Collection Information
  collection: {
    date: { type: Date, required: true, index: true },
    time: { type: String },
    collectedBy: { type: String, required: true },
    witnessedBy: { type: String },
    weatherConditions: { type: String },
    temperature: { type: Number }, // Celsius
    
    // Location Details
    location: {
      siteId: { type: String, required: true, index: true },
      coordinates: {
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        elevation: { type: Number }
      },
      address: { type: String },
      wellId: { type: String },
      depthFrom: { type: Number },
      depthTo: { type: Number }
    }
  },
  
  // Sample Classification
  classification: {
    matrix: { 
      type: String, 
      enum: ['soil', 'groundwater', 'surface_water', 'air', 'produced_water', 'sludge', 'sediment'],
      required: true,
      index: true
    },
    purpose: {
      type: String,
      enum: ['baseline', 'monitoring', 'remediation', 'closure', 'emergency'],
      required: true,
      index: true
    },
    regulatoryProgram: { type: String }, // RCRA, CERCLA, state program
    priority: {
      type: String,
      enum: ['routine', 'expedited', 'rush', 'emergency'],
      default: 'routine'
    }
  },
  
  // Chain of Custody Details
  chainOfCustody: {
    custodyNumber: { type: String, required: true, unique: true },
    relinquishedBy: [{ 
      name: String, 
      date: Date, 
      signature: String,
      company: String
    }],
    receivedBy: [{ 
      name: String, 
      date: Date, 
      signature: String,
      company: String
    }],
    sealIntact: { type: Boolean, default: true },
    temperatureAtReceipt: { type: Number },
    conditionAtReceipt: { type: String }
  },
  
  // Analysis Request
  analysisRequest: {
    requestedAnalytes: [{ 
      name: String, 
      method: String, 
      reportingLimit: Number,
      units: String
    }],
    requestedTurnaround: { type: String }, // 24hr, 7day, etc.
    specialInstructions: { type: String },
    qualityLevel: { type: String } // Level 1, 2, 3, 4
  },
  
  // Laboratory Processing
  labProcessing: {
    receivedDate: { type: Date, index: true },
    processedBy: { type: String },
    preparationMethod: { type: String },
    preservatives: [{ type: String }],
    holdingTime: { type: Number }, // days
    holdingTimeExceeded: { type: Boolean, default: false }
  },
  
  // Associated Notarizations
  notarizations: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Notarization' 
  }],
  
  // Status Tracking
  status: {
    type: String,
    enum: ['collected', 'in_transit', 'received', 'processing', 'analyzed', 'reported', 'archived'],
    default: 'collected',
    index: true
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'lab_samples',
  suppressReservedKeysWarning: true
});

// =============================================
// 5. ZERO-KNOWLEDGE PROOFS COLLECTION SCHEMA
// =============================================

const zkProofSchema = new mongoose.Schema({
  // Proof Identification
  proofId: { type: String, required: true, unique: true, index: true },
  sampleId: { type: String, required: true, index: true },
  analyte: { type: String, required: true, index: true },
  
  // Proof Details
  proof: {
    commitment: { type: String, required: true }, // Cryptographic commitment
    proofHash: { type: String, required: true }, // ZK proof hash
    challenge: { type: String },
    response: { type: String },
    verificationKey: { type: String },
    proofData: { type: mongoose.Schema.Types.Mixed } // Encrypted proof details
  },
  
  // Compliance Information
  compliance: {
    threshold: { type: Number, required: true },
    isCompliant: { type: Boolean, required: true, index: true },
    regulation: { type: String }, // Which regulation this proves compliance with
    units: { type: String }
  },
  
  // Cryptographic Metadata
  cryptography: {
    algorithm: { type: String, default: 'LabLedger-ZK-v1.0' },
    keyDerivation: { type: String },
    nonce: { type: String },
    salt: { type: String }
  },
  
  // Blockchain Integration
  blockchain: {
    published: { type: Boolean, default: false },
    txid: { type: String, index: true },
    network: { type: String },
    publishedAt: { type: Date }
  },
  
  // Verification History
  verifications: [{
    verifiedBy: { type: String },
    verifiedAt: { type: Date, default: Date.now },
    result: { type: Boolean },
    verifierRole: { type: String },
    notes: { type: String }
  }],
  
  // Batch Information (for multiple analytes)
  batch: {
    batchId: { type: String, index: true },
    batchSize: { type: Number },
    batchHash: { type: String }
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  expiryDate: { type: Date } // When proof becomes invalid
}, {
  timestamps: true,
  collection: 'zk_proofs',
  suppressReservedKeysWarning: true
});

// =============================================
// 6. ORGANIZATIONS COLLECTION SCHEMA
// =============================================

const organizationSchema = new mongoose.Schema({
  // Organization Identity
  organizationId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, index: true },
  legalName: { type: String },
  
  // Organization Type
  type: {
    type: String,
    enum: ['laboratory', 'regulatory_agency', 'consulting_firm', 'oil_gas_operator', 'government'],
    required: true,
    index: true
  },
  
  // Contact Information
  contact: {
    address: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      zipCode: { type: String },
      country: { type: String, default: 'US' }
    },
    phone: { type: String },
    email: { type: String },
    website: { type: String }
  },
  
  // Certifications and Licenses
  certifications: [{
    type: { type: String }, // NELAP, EPA, State
    number: { type: String },
    scope: [{ type: String }], // Which analyses certified for
    issuedBy: { type: String },
    issuedDate: { type: Date },
    expiryDate: { type: Date },
    status: { 
      type: String, 
      enum: ['active', 'expired', 'suspended', 'revoked'],
      default: 'active'
    }
  }],
  
  // Blockchain Integration
  blockchain: {
    publicKey: { type: String }, // Organization's public key
    address: { type: String }, // BSV address
    did: { type: String }, // Decentralized identifier
    registrationTxid: { type: String }
  },
  
  // Platform Configuration
  configuration: {
    defaultNotarization: { type: Boolean, default: true },
    zkProofRequired: { type: Boolean, default: false },
    auditLevel: { 
      type: String, 
      enum: ['basic', 'enhanced', 'comprehensive'],
      default: 'basic'
    }
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'suspended', 'deactivated'],
    default: 'active',
    index: true
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'organizations',
  suppressReservedKeysWarning: true
});

// =============================================
// INDEXES AND PERFORMANCE OPTIMIZATION
// =============================================

// Compound indexes for common queries
userSchema.index({ 'profile.organization': 1, role: 1, status: 1 });
userSchema.index({ email: 1, status: 1 });
userSchema.index({ 'cryptoIdentity.address': 1 });

notarizationSchema.index({ 'sample.labId': 1, 'sample.collectionDate': -1 });
notarizationSchema.index({ 'blockchain.txid': 1, 'blockchain.network': 1 });
notarizationSchema.index({ 'submittedBy.userId': 1, createdAt: -1 });
notarizationSchema.index({ 'compliance.overallCompliant': 1, 'sample.state': 1 });

auditTrailSchema.index({ 'actor.userId': 1, timestamp: -1 });
auditTrailSchema.index({ 'event.type': 1, 'event.category': 1, timestamp: -1 });
auditTrailSchema.index({ 'target.type': 1, 'target.id': 1, timestamp: -1 });
auditTrailSchema.index({ 'correlation.workflowId': 1, timestamp: 1 });

labSampleSchema.index({ 'collection.location.siteId': 1, 'collection.date': -1 });
labSampleSchema.index({ 'classification.matrix': 1, 'classification.purpose': 1 });

zkProofSchema.index({ sampleId: 1, analyte: 1 });
zkProofSchema.index({ 'compliance.isCompliant': 1, 'compliance.regulation': 1 });

organizationSchema.index({ type: 1, status: 1 });

// =============================================
// 7. UTXO COLLECTION SCHEMA
// =============================================

const utxoSchema = new mongoose.Schema({
  // UTXO Identification
  txid: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^[a-fA-F0-9]{64}$/.test(v);
      },
      message: 'txid must be a valid 64-character hexadecimal string'
    }
  },
  vout: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'vout must be an integer'
    }
  },
  
  // Value and Script
  satoshis: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'satoshis must be an integer'
    }
  },
  script: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^[a-fA-F0-9]*$/.test(v);
      },
      message: 'script must be a valid hexadecimal string'
    }
  },
  scriptPubKey: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^[a-fA-F0-9]*$/.test(v);
      },
      message: 'scriptPubKey must be a valid hexadecimal string'
    }
  },
  
  // Status and Tracking
  status: {
    type: String,
    enum: ['available', 'reserved', 'spent', 'confirmed_spent'],
    default: 'available',
    index: true
  },
  
  // Blockchain Information
  blockHeight: {
    type: Number,
    min: 0,
    default: 0
  },
  confirmations: {
    type: Number,
    min: 0,
    default: 0
  },
  
  // Wallet Association
  walletAddress: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: function(v) {
        // Basic BSV address validation (starts with 1 for mainnet)
        return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(v);
      },
      message: 'walletAddress must be a valid BSV address'
    }
  },
  
  // Metadata
  fetchedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  reservedAt: {
    type: Date,
    index: true
  },
  spentAt: {
    type: Date,
    index: true
  },
  spentInTxid: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^[a-fA-F0-9]{64}$/.test(v);
      },
      message: 'spentInTxid must be a valid 64-character hexadecimal string'
    }
  },
  
  // Source tracking
  source: {
    type: String,
    enum: ['blockchain_fetch', 'change_output', 'manual_add', 'sync_operation', 'split_operation'],
    default: 'blockchain_fetch',
    index: true
  },
  
  // Notes and metadata
  notes: {
    type: String,
    maxlength: 500
  },
  
  // Audit trail
  createdBy: {
    type: String,
    default: 'system'
  },
  updatedBy: {
    type: String,
    default: 'system'
  }
}, {
  timestamps: true,
  collection: 'utxos'
});

// =============================================
// UTXO INDEXES
// =============================================

// Compound index for efficient UTXO lookups
utxoSchema.index({ txid: 1, vout: 1 }, { unique: true });

// Status-based queries
utxoSchema.index({ status: 1, walletAddress: 1, satoshis: -1 });
utxoSchema.index({ status: 1, fetchedAt: 1 });

// Wallet-specific queries
utxoSchema.index({ walletAddress: 1, status: 1, satoshis: -1 });

// Time-based queries
utxoSchema.index({ fetchedAt: -1 });
utxoSchema.index({ reservedAt: -1 });
utxoSchema.index({ spentAt: -1 });

// Cleanup queries (for removing old spent UTXOs)
utxoSchema.index({ status: 1, spentAt: 1 });

// Source tracking
utxoSchema.index({ source: 1, createdAt: -1 });

// =============================================
// UTXO INSTANCE METHODS
// =============================================

utxoSchema.methods.reserve = function(reservedBy = 'system') {
  if (this.status !== 'available') {
    throw new Error(`Cannot reserve UTXO with status: ${this.status}`);
  }
  this.status = 'reserved';
  this.reservedAt = new Date();
  this.updatedBy = reservedBy;
  return this.save();
};

utxoSchema.methods.markSpent = function(spentInTxid, spentBy = 'system') {
  if (this.status !== 'reserved' && this.status !== 'available') {
    throw new Error(`Cannot mark UTXO as spent with status: ${this.status}`);
  }
  this.status = 'spent';
  this.spentAt = new Date();
  this.spentInTxid = spentInTxid;
  this.updatedBy = spentBy;
  return this.save();
};

utxoSchema.methods.release = function(releasedBy = 'system') {
  if (this.status !== 'reserved') {
    throw new Error(`Cannot release UTXO with status: ${this.status}`);
  }
  this.status = 'available';
  this.reservedAt = undefined;
  this.updatedBy = releasedBy;
  return this.save();
};

utxoSchema.methods.toBlockchainFormat = function() {
  return {
    txid: this.txid,
    outputIndex: this.vout,
    script: this.script,
    satoshis: this.satoshis
  };
};

// =============================================
// UTXO STATIC METHODS
// =============================================

utxoSchema.statics.findAvailable = function(walletAddress, minAmount = 0) {
  return this.find({
    walletAddress,
    status: 'available',
    satoshis: { $gte: minAmount }
  }).sort({ satoshis: -1 }); // Largest first
};

utxoSchema.statics.getBalance = function(walletAddress) {
  return this.aggregate([
    { $match: { walletAddress, status: 'available' } },
    { $group: { _id: null, total: { $sum: '$satoshis' }, count: { $sum: 1 } } }
  ]);
};

utxoSchema.statics.cleanupOldSpent = function(daysOld = 30) {
  const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
  return this.deleteMany({
    status: { $in: ['spent', 'confirmed_spent'] },
    spentAt: { $lt: cutoffDate }
  });
};

// =============================================
// 8. MUNICIPAL BONDS COLLECTION SCHEMA
// =============================================

const bondSchema = new mongoose.Schema({
  // Bond Identification
  bondId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Issuer Information
  issuer: {
    name: { type: String, required: true },
    jurisdiction: { type: String, required: true },
    creditRating: { type: String },
    publicKey: { type: String, required: true },
    verificationStatus: { 
      type: String, 
      enum: ['pending', 'verified', 'rejected'],
      default: 'verified'
    }
  },
  
  // Bond Details
  details: {
    name: { type: String, required: true },
    description: { type: String, required: true },
    purpose: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    denomination: { type: Number, default: 1000 }, // Default $1,000 denominations
    totalTokens: { type: Number, required: true }
  },
  
  // Financial Terms
  terms: {
    interestRate: { type: Number, required: true }, // Annual percentage
    maturityDate: { type: Date, required: true },
    paymentFrequency: { 
      type: String, 
      enum: ['monthly', 'quarterly', 'semi-annual', 'annual'],
      required: true 
    },
    callableDate: { type: Date },
    taxExempt: { type: Boolean, default: false }
  },
  
  // Regulatory Information
  regulatory: {
    cusipNumber: { type: String },
    secRegistration: { type: String },
    ratingAgency: { type: String },
    bondRating: { type: String },
    legalOpinion: { type: String }
  },
  
  // Tokenization Information
  tokenized: { type: Boolean, default: false },
  tokenSymbol: { type: String },
  tokenName: { type: String },
  minInvestment: { type: Number },
  maxTokensPerInvestor: { type: Number },
  kycRequired: { type: Boolean, default: true },
  availableTokens: { type: Number, default: 0 },
  soldTokens: { type: Number, default: 0 },
  
  // Blockchain Integration
  blockchain: {
    tokenAddress: { type: String },
    contractAddress: { type: String },
    deploymentTxId: { type: String }
  },
  
  // Status and Lifecycle
  status: {
    type: String,
    enum: ['issued', 'available_for_sale', 'fully_sold', 'active', 'matured', 'redeemed', 'defaulted'],
    default: 'issued',
    index: true
  },
  
  // Dates
  issuanceDate: { type: Date, required: true },
  tokenizationDate: { type: Date },
  redemptionDate: { type: Date },
  redemptionAmount: { type: Number },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'bonds'
});

// =============================================
// 9. BOND HOLDERS COLLECTION SCHEMA
// =============================================

const bondHolderSchema = new mongoose.Schema({
  // Identification
  bondId: { type: String, required: true, index: true },
  holderId: { type: String, required: true, index: true },
  
  // Holder Information
  holderInfo: {
    id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    walletAddress: { type: String, required: true }
  },
  
  // Holdings
  tokenQuantity: { type: Number, required: true, default: 0 },
  totalInvestment: { type: Number, required: true, default: 0 },
  
  // Purchase History
  lastPurchaseDate: { type: Date },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'bond_holders'
});

// =============================================
// 10. BOND TRANSACTIONS COLLECTION SCHEMA
// =============================================

const bondTransactionSchema = new mongoose.Schema({
  // Transaction Identification
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  bondId: { type: String, required: true, index: true },
  
  // Transaction Details
  type: {
    type: String,
    enum: ['purchase', 'transfer', 'redemption'],
    required: true,
    index: true
  },
  
  // Addresses
  fromAddress: { type: String, required: true, index: true },
  toAddress: { type: String, required: true, index: true },
  
  // Amounts
  tokenQuantity: { type: Number, required: true },
  pricePerToken: { type: Number },
  totalAmount: { type: Number, required: true },
  transferPrice: { type: Number }, // For secondary market transfers
  
  // Participants
  investorInfo: {
    id: { type: String },
    name: { type: String },
    email: { type: String },
    walletAddress: { type: String }
  },
  fromInvestor: {
    id: { type: String },
    name: { type: String },
    email: { type: String },
    walletAddress: { type: String }
  },
  toInvestor: {
    id: { type: String },
    name: { type: String },
    email: { type: String },
    walletAddress: { type: String }
  },
  
  // Payment Information
  paymentMethod: { type: String },
  
  // KYC and Compliance
  kycVerified: { type: Boolean, default: false },
  
  // Status and Blockchain
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  blockchainTxId: { type: String },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now, index: true },
  completedAt: { type: Date }
}, {
  timestamps: true,
  collection: 'bond_transactions'
});

// =============================================
// 11. BOND PAYMENTS COLLECTION SCHEMA
// =============================================

const bondPaymentSchema = new mongoose.Schema({
  // Payment Identification
  paymentId: { type: String, required: true, index: true },
  bondId: { type: String, required: true, index: true },
  holderId: { type: String, required: true, index: true },
  
  // Payment Type
  type: {
    type: String,
    enum: ['coupon', 'redemption', 'special'],
    default: 'coupon',
    index: true
  },
  
  // Holder Information
  holderInfo: {
    id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    walletAddress: { type: String, required: true }
  },
  
  // Payment Details
  tokenQuantity: { type: Number, required: true },
  paymentPerToken: { type: Number, required: true },
  totalPayment: { type: Number, required: true },
  
  // Payment Information
  paymentDate: { type: Date, required: true, index: true },
  paymentPeriod: { type: String }, // Q1 2024, etc.
  
  // For redemptions
  redemptionId: { type: String },
  redemptionPerToken: { type: Number },
  totalRedemption: { type: Number },
  redemptionDate: { type: Date },
  
  // Status
  status: {
    type: String,
    enum: ['scheduled', 'processed', 'paid', 'failed'],
    default: 'processed',
    index: true
  },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'bond_payments'
});

// =============================================
// BOND INDEXES
// =============================================

// Bond indexes
bondSchema.index({ 'issuer.name': 1, status: 1 });
bondSchema.index({ status: 1, 'terms.maturityDate': 1 });
bondSchema.index({ tokenized: 1, status: 1 });

// Bond holder indexes
bondHolderSchema.index({ bondId: 1, holderId: 1 }, { unique: true });
bondHolderSchema.index({ holderId: 1 });

// Transaction indexes
bondTransactionSchema.index({ bondId: 1, createdAt: -1 });
bondTransactionSchema.index({ 'investorInfo.id': 1, createdAt: -1 });
bondTransactionSchema.index({ status: 1, createdAt: -1 });

// Payment indexes
bondPaymentSchema.index({ bondId: 1, paymentDate: -1 });
bondPaymentSchema.index({ holderId: 1, paymentDate: -1 });
bondPaymentSchema.index({ paymentId: 1, bondId: 1 });

// =============================================
// MODEL EXPORTS
// =============================================

export const User = mongoose.model('User', userSchema);
export const Notarization = mongoose.model('Notarization', notarizationSchema);
export const AuditTrail = mongoose.model('AuditTrail', auditTrailSchema);
export const LabSample = mongoose.model('LabSample', labSampleSchema);
export const ZKProof = mongoose.model('ZKProof', zkProofSchema);
export const Organization = mongoose.model('Organization', organizationSchema);
export const UTXO = mongoose.model('UTXO', utxoSchema);

// Bond-related models
export const Bond = mongoose.model('Bond', bondSchema);
export const BondHolder = mongoose.model('BondHolder', bondHolderSchema);
export const BondTransaction = mongoose.model('BondTransaction', bondTransactionSchema);
export const BondPayment = mongoose.model('BondPayment', bondPaymentSchema);

// Database connection helper
export const connectDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MongoDB URI not found in environment variables. Please set MONGODB_URI.');
    }
    
    await mongoose.connect(mongoUri, {
      dbName: process.env.DB_NAME || 'bsv-blockchain-starter',
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};