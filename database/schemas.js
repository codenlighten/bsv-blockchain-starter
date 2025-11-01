/**
 * AI Record Label Platform MongoDB Database Schema
 * Comprehensive collection framework for music industry rights management and revenue distribution
 */

import mongoose from 'mongoose';

// =============================================
// 1. USER COLLECTION SCHEMA (MUSIC INDUSTRY)
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
    stageName: { type: String }, // Artist stage name if applicable
    title: { type: String }, // Producer, Songwriter, Label Executive, etc.
    phone: { type: String },
    organization: { 
      type: String, // Record label, publishing company, etc.
      required: true,
      index: true
    },
    bio: { type: String }, // Artist or professional biography
    website: { type: String },
    socialMedia: {
      instagram: { type: String },
      twitter: { type: String },
      tiktok: { type: String },
      youtube: { type: String },
      spotify: { type: String }
    }
  },
  
  // Role and Permissions
  role: {
    type: String,
    enum: ['label_admin', 'a_r_manager', 'producer', 'songwriter', 'ai_artist_manager', 'rights_manager', 'revenue_manager', 'system_admin'],
    required: true,
    index: true
  },
  permissions: [{
    type: String,
    enum: [
      'create_artists', 'manage_catalog', 'publish_music', 'manage_rights',
      'calculate_revenue', 'distribute_payments', 'view_analytics', 
      'generate_reports', 'verify_ownership', 'admin_system'
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
  
  // Music Industry Specific Data
  musicCredentials: [{
    type: { type: String }, // ASCAP, BMI, SESAC, Grammy Voting Member, etc.
    number: { type: String },
    expiryDate: { type: Date },
    isActive: { type: Boolean, default: true }
  }],
  
  // Publishing and Rights Information
  publishingInfo: {
    ascap: { type: String }, // ASCAP member number
    bmi: { type: String }, // BMI member number
    sesac: { type: String }, // SESAC member number
    soundExchange: { type: String },
    performanceRights: [{ type: String }] // Other performance rights organizations
  },
  
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
// 2. AI ARTISTS COLLECTION SCHEMA
// =============================================

const aiArtistSchema = new mongoose.Schema({
  // Unique Identifiers
  artistId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Artist Identity
  identity: {
    name: { type: String, required: true, index: true },
    stageName: { type: String, required: true, unique: true, index: true },
    type: { 
      type: String, 
      enum: ['ai_generated', 'ai_assisted', 'human_collab'],
      required: true,
      index: true
    },
    genre: [{ type: String, required: true, index: true }], // Primary genres
    subgenres: [{ type: String }], // Secondary genres
    language: { type: String, default: 'en', index: true },
    country: { type: String, default: 'US' }
  },
  
  // AI Persona Configuration
  persona: {
    backstory: { type: String, required: true },
    personality: { type: String }, // Personality description
    visualStyle: { type: String, required: true }, // Art direction for images
    musicStyle: { type: String, required: true }, // Musical characteristics
    voiceProfile: {
      type: { type: String, required: true }, // Voice type: male, female, non-binary
      range: { type: String }, // Vocal range: soprano, alto, tenor, bass
      style: { type: String }, // Singing style: pop, operatic, rap, etc.
      characteristics: [{ type: String }], // Unique voice traits
      modelId: { type: String } // AI voice model identifier
    },
    demographics: {
      apparentAge: { type: Number },
      apparentGender: { type: String },
      culturalBackground: { type: String },
      fictionalLocation: { type: String }
    }
  },
  
  // Visual Assets
  artwork: {
    profileImage: { type: String }, // Path to main profile image
    albumCovers: [{ type: String }], // Paths to album artwork
    promotionalImages: [{ type: String }],
    avatarConfig: { type: mongoose.Schema.Types.Mixed }, // 3D avatar configuration
    visualBrand: {
      colorPalette: [{ type: String }], // Hex color codes
      fonts: [{ type: String }],
      logoUrl: { type: String }
    }
  },
  
  // Music Generation Configuration
  musicGeneration: {
    instruments: [{ type: String }], // Preferred instruments
    musicTheory: {
      preferredKeys: [{ type: String }], // C major, A minor, etc.
      timeSignatures: [{ type: String }], // 4/4, 3/4, etc.
      tempoRange: { min: Number, max: Number }, // BPM range
      scaleModes: [{ type: String }] // Major, minor, dorian, etc.
    },
    productionStyle: {
      arrangement: { type: String }, // Dense, sparse, layered, minimal
      dynamics: { type: String }, // Loud, soft, dynamic, compressed
      effects: [{ type: String }], // Reverb, delay, distortion, etc.
      mixing: { type: String } // Clean, lo-fi, vintage, modern
    },
    lyricalThemes: [{ type: String }], // Love, adventure, technology, etc.
    collaborationPrefs: {
      humanCollabAllowed: { type: Boolean, default: true },
      remixRights: { type: String, enum: ['open', 'restricted', 'none'], default: 'restricted' },
      samplingAllowed: { type: Boolean, default: false }
    }
  },
  
  // Performance and Analytics
  performance: {
    totalStreams: { type: Number, default: 0, index: true },
    monthlyListeners: { type: Number, default: 0 },
    followerCount: { type: Number, default: 0 },
    songsReleased: { type: Number, default: 0 },
    lastReleaseDate: { type: Date, index: true },
    topCountries: [{ country: String, streams: Number }],
    demographics: {
      ageGroups: { type: mongoose.Schema.Types.Mixed },
      genderSplit: { type: mongoose.Schema.Types.Mixed }
    }
  },
  
  // Cryptographic Identity
  cryptography: {
    // Artist Identity Hash
    identityHash: { type: String, required: true }, // SHA-256 of artist identity data
    
    // Digital Signature for Artist Identity
    signature: {
      value: { type: String, required: true }, // DER encoded signature
      publicKey: { type: String, required: true },
      address: { type: String, required: true }, // BSV address for this artist
      algorithm: { type: String, default: 'ECDSA-secp256k1' },
      timestamp: { type: Date, default: Date.now }
    },
    
    // Artist Keys (for signing their music)
    artistKeys: {
      privateKeyEncrypted: { type: String }, // Encrypted private key for artist
      publicKey: { type: String, required: true },
      address: { type: String, required: true, unique: true, index: true }
    }
  },
  
  // Blockchain Registration
  blockchain: {
    network: { type: String, default: 'BSV-mainnet', index: true },
    registrationTxid: { type: String, unique: true, index: true },
    blockHeight: { type: Number },
    confirmations: { type: Number, default: 0 },
    publishedAt: { type: Date, default: Date.now, index: true },
    explorerUrl: { type: String }
  },
  
  // Status and Lifecycle
  status: {
    type: String,
    enum: ['created', 'active', 'inactive', 'retired', 'suspended'],
    default: 'created',
    index: true
  },
  
  // Timestamps and Metadata
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: String, required: true, index: true }, // User who created this AI artist
  lastActivityAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'ai_artists',
  suppressReservedKeysWarning: true
});

// =============================================
// 3. SONGS COLLECTION SCHEMA
// =============================================

const songSchema = new mongoose.Schema({
  // Unique Identifiers
  songId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Song Information
  metadata: {
    title: { type: String, required: true, index: true },
    artistId: { type: String, required: true, index: true }, // Reference to AI artist
    artistName: { type: String, required: true, index: true },
    albumId: { type: String, index: true }, // Reference to album if part of one
    albumName: { type: String },
    trackNumber: { type: Number },
    
    // Musical Metadata
    genre: { type: String, required: true, index: true },
    subgenres: [{ type: String }],
    mood: { type: String, index: true },
    energy: { type: String }, // Low, medium, high
    danceability: { type: Number, min: 0, max: 1 }, // 0-1 scale
    valence: { type: Number, min: 0, max: 1 }, // Positivity 0-1 scale
    
    // Technical Information
    duration: { type: Number, required: true }, // Duration in seconds
    tempo: { type: Number }, // BPM
    key: { type: String }, // Musical key (C, C#, D, etc.)
    timeSignature: { type: String, default: '4/4' },
    acousticness: { type: Number, min: 0, max: 1 },
    instrumentalness: { type: Number, min: 0, max: 1 },
    
    // Release Information
    releaseDate: { type: Date, required: true, index: true },
    language: { type: String, default: 'en', index: true },
    isExplicit: { type: Boolean, default: false },
    isrc: { type: String, unique: true, sparse: true }, // International Standard Recording Code
    
    // Tags and Categories
    tags: [{ type: String, index: true }], // Searchable tags
    themes: [{ type: String }], // Lyrical or musical themes
    instruments: [{ type: String }], // Primary instruments used
  },
  
  // Audio Files and Assets
  audioAssets: {
    masterFile: { 
      path: { type: String, required: true }, // Path to high-quality master
      format: { type: String, required: true }, // WAV, FLAC, etc.
      sampleRate: { type: Number, required: true }, // 44100, 48000, etc.
      bitDepth: { type: Number, required: true }, // 16, 24, 32
      fileSize: { type: Number }, // File size in bytes
      checksum: { type: String, required: true } // File integrity hash
    },
    stems: [{ // Individual track elements
      name: { type: String, required: true }, // Vocals, drums, bass, etc.
      path: { type: String, required: true },
      format: { type: String, required: true },
      checksum: { type: String, required: true }
    }],
    mixVersions: [{ // Different mixes (radio edit, extended, etc.)
      name: { type: String, required: true },
      path: { type: String, required: true },
      duration: { type: Number },
      checksum: { type: String, required: true }
    }],
    artwork: {
      coverArt: { type: String }, // Path to album/single artwork
      lyricVideo: { type: String }, // Path to lyric video
      musicVideo: { type: String }, // Path to music video
      visualizer: { type: String } // Path to audio visualizer
    }
  },
  
  // Lyrics and Content
  lyrics: {
    hasLyrics: { type: Boolean, default: true },
    content: { type: String }, // Full lyrics text
    structure: [{ // Verse, chorus, bridge, etc.
      section: { type: String, required: true },
      lyrics: { type: String, required: true },
      timestamp: { type: Number } // Start time in seconds
    }],
    language: { type: String, default: 'en' },
    writers: [{ type: String, required: true }], // Lyric writers
    publishers: [{ type: String }]
  },
  
  // Rights and Ownership
  rights: {
    songwriter: [{ 
      name: { type: String, required: true },
      share: { type: Number, required: true }, // Percentage (0-100)
      role: { type: String }, // Lyricist, composer, etc.
      contact: { type: String }
    }],
    producer: [{ 
      name: { type: String, required: true },
      share: { type: Number, required: true },
      role: { type: String }, // Producer, co-producer, etc.
      contact: { type: String }
    }],
    performer: [{ 
      name: { type: String, required: true },
      share: { type: Number, required: true },
      role: { type: String }, // Lead vocals, backing vocals, etc.
      isAI: { type: Boolean, default: false }
    }],
    publisher: { 
      name: { type: String, required: true },
      share: { type: Number, required: true, default: 100 },
      contact: { type: String }
    },
    label: { 
      name: { type: String, required: true },
      share: { type: Number, required: true },
      contact: { type: String }
    },
    masteredBy: { type: String },
    mixedBy: { type: String }
  },
  
  // Licensing and Usage Rights
  licensing: {
    syncLicensing: { type: Boolean, default: true }, // Available for TV/film
    samplingAllowed: { type: Boolean, default: false },
    remixRights: { 
      type: String, 
      enum: ['open', 'contact-label', 'restricted', 'none'],
      default: 'contact-label' 
    },
    commercialUse: { type: Boolean, default: true },
    exclusivity: {
      isExclusive: { type: Boolean, default: false },
      exclusiveUntil: { type: Date },
      exclusiveTerritory: { type: String }
    },
    publishingRights: {
      mechanicalRights: { type: Boolean, default: true },
      performanceRights: { type: Boolean, default: true },
      synchronizationRights: { type: Boolean, default: true },
      printRights: { type: Boolean, default: true }
    }
  },
  
  // Revenue and Performance
  performance: {
    totalStreams: { type: Number, default: 0, index: true },
    totalDownloads: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0, index: true }, // In satoshis
    syncLicenses: { type: Number, default: 0 },
    platformStreams: {
      spotify: { type: Number, default: 0 },
      appleMusic: { type: Number, default: 0 },
      youtube: { type: Number, default: 0 },
      amazonMusic: { type: Number, default: 0 },
      other: { type: Number, default: 0 }
    },
    lastUpdated: { type: Date, default: Date.now }
  },
  
  // Cryptographic Proof of Ownership
  cryptography: {
    // Song Content Hash
    contentHash: { type: String, required: true }, // SHA-256 of audio content + metadata
    
    // Digital Signature for Ownership
    signature: {
      value: { type: String, required: true }, // DER encoded signature
      publicKey: { type: String, required: true },
      algorithm: { type: String, default: 'ECDSA-secp256k1' },
      timestamp: { type: Date, default: Date.now }
    },
    
    // Zero-Knowledge Proof for Revenue Privacy (if applicable)
    zkProof: {
      hasProof: { type: Boolean, default: false },
      revenueCommitment: { type: String }, // Commitment hash for private revenue
      proofHash: { type: String }, // ZK proof hash
      verificationKey: { type: String }
    }
  },
  
  // Blockchain Information
  blockchain: {
    network: { type: String, default: 'BSV-mainnet', index: true },
    txid: { type: String, unique: true, index: true },
    blockHeight: { type: Number },
    blockHash: { type: String },
    confirmations: { type: Number, default: 0 },
    fee: { type: Number }, // satoshis
    publishedAt: { type: Date, default: Date.now, index: true },
    opReturnData: { type: String }, // Raw OP_RETURN hex with song data
    explorerUrl: { type: String }
  },
  
  // Status and Workflow
  status: {
    type: String,
    enum: ['draft', 'mastered', 'signed', 'published', 'distributed', 'active', 'archived'],
    default: 'draft',
    index: true
  },
  
  // Distribution and Platform Status
  distribution: {
    platforms: [{
      name: { type: String, required: true }, // Spotify, Apple Music, etc.
      status: { 
        type: String, 
        enum: ['pending', 'submitted', 'approved', 'live', 'rejected'],
        default: 'pending' 
      },
      submittedAt: { type: Date },
      liveAt: { type: Date },
      platformId: { type: String }, // Platform-specific song ID
      url: { type: String } // Direct link to song on platform
    }],
    distributionDate: { type: Date },
    distributor: { type: String } // DistroKid, CD Baby, etc.
  },
  
  // Creation and Management
  createdBy: { type: String, required: true, index: true }, // User who created/uploaded
  approvedBy: [{ 
    userId: String, 
    approvalDate: Date, 
    role: String, 
    comments: String 
  }],
  
  // Timestamps
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  archivedAt: { type: Date } // When song was archived/removed
}, {
  timestamps: true,
  collection: 'songs',
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

// Compound indexes for common music industry queries
userSchema.index({ 'profile.organization': 1, role: 1, status: 1 });
userSchema.index({ email: 1, status: 1 });
userSchema.index({ 'cryptoIdentity.address': 1 });

// AI Artist indexes
aiArtistSchema.index({ 'identity.genre': 1, status: 1 });
aiArtistSchema.index({ 'identity.name': 1, 'identity.stageName': 1 });
aiArtistSchema.index({ 'cryptography.artistKeys.address': 1 });
aiArtistSchema.index({ 'performance.totalStreams': -1 });

// Song indexes
songSchema.index({ 'metadata.artistId': 1, 'metadata.releaseDate': -1 });
songSchema.index({ 'metadata.genre': 1, 'metadata.mood': 1 });
songSchema.index({ 'blockchain.txid': 1, 'blockchain.network': 1 });
songSchema.index({ 'performance.totalStreams': -1 });
songSchema.index({ 'performance.totalRevenue': -1 });
songSchema.index({ status: 1, 'metadata.releaseDate': -1 });

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
// AUDIT LOG SCHEMA
// =============================================
const auditLogSchema = new mongoose.Schema({
  // Core audit information
  action: { 
    type: String, 
    required: true,
    enum: [
      'USER_CREATED', 'USER_UPDATED', 'USER_LOGIN', 'USER_LOGOUT',
      'SONG_UPLOADED', 'SONG_UPDATED', 'SONG_DELETED',
      'MUSIC_PLAY', 'MUSIC_DOWNLOAD', 'MUSIC_STREAM',
      'MICRO_PAYMENT', 'REVENUE_DISTRIBUTION', 'ROYALTY_PAYMENT',
      'LICENSE_CREATED', 'LICENSE_UPDATED', 'LICENSE_EXPIRED',
      'BLOCKCHAIN_TRANSACTION', 'CRYPTO_SIGNATURE', 'KEY_ROTATION',
      'AUDIT_BATCH_COMMIT', 'SYSTEM_EVENT', 'SECURITY_EVENT'
    ],
    index: true
  },
  
  // Entity information
  entityType: { 
    type: String, 
    required: true,
    enum: ['user', 'song', 'artist', 'license', 'payment', 'system'],
    index: true
  },
  entityId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true,
    index: true
  },
  
  // User who performed the action
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    index: true
  },
  
  // Timestamp
  timestamp: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  
  // Detailed information about the action
  details: {
    // Request information
    ipAddress: { type: String },
    userAgent: { type: String },
    sessionId: { type: String },
    
    // Action-specific data
    amount: { type: Number }, // For payment actions
    currency: { type: String }, // BSV, USD, etc.
    playDuration: { type: Number }, // For music play events
    quality: { type: String }, // audio quality
    platform: { type: String }, // web, mobile, api
    location: { type: String }, // geographic location
    deviceType: { type: String }, // desktop, mobile, tablet
    
    // Before/after states for updates
    previousState: { type: mongoose.Schema.Types.Mixed },
    newState: { type: mongoose.Schema.Types.Mixed },
    
    // Additional metadata
    metadata: { type: mongoose.Schema.Types.Mixed }
  },
  
  // Blockchain verification
  blockchainHash: { 
    type: String,
    index: true
  },
  verified: { 
    type: Boolean, 
    default: false,
    index: true
  },
  batchId: { 
    type: String,
    index: true
  },
  
  // Security and integrity
  checksum: { type: String }, // Data integrity verification
  signature: { type: String }, // Cryptographic signature if applicable
  
  // Processing status
  processed: { 
    type: Boolean, 
    default: false,
    index: true
  },
  processedAt: { type: Date }
}, {
  timestamps: true,
  collection: 'auditLogs'
});

// Indexes for efficient querying
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ blockchainHash: 1 });
auditLogSchema.index({ batchId: 1 });
auditLogSchema.index({ verified: 1, processed: 1 });

// =============================================
// MODEL EXPORTS
// =============================================

export const User = mongoose.model('User', userSchema);
export const AIArtist = mongoose.model('AIArtist', aiArtistSchema);
export const Song = mongoose.model('Song', songSchema);
export const AuditTrail = mongoose.model('AuditTrail', auditTrailSchema);
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export const ZKProof = mongoose.model('ZKProof', zkProofSchema);
export const Organization = mongoose.model('Organization', organizationSchema);
export const UTXO = mongoose.model('UTXO', utxoSchema);

/**
 * Licensing Schema
 * Tracks licensing agreements, sync deals, and usage rights
 */
const LicensingSchema = new mongoose.Schema({
  licenseId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  songId: {
    type: String,
    required: true,
    index: true
  },
  songTitle: String,
  artist: String,
  
  licenseType: {
    type: String,
    required: true,
    enum: ['sync', 'commercial', 'mechanical', 'performance', 'sampling', 'remix', 'cover']
  },
  
  licensee: {
    name: { type: String, required: true },
    email: String,
    company: String,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String
    }
  },
  
  terms: {
    territory: { type: String, default: 'Worldwide' },
    duration: { type: String, default: '1 year' },
    durationDays: { type: Number, default: 365 },
    exclusivity: { type: String, enum: ['exclusive', 'non-exclusive'], default: 'non-exclusive' },
    usage: String,
    fee: { type: Number, default: 0 }, // in satoshis
    royaltyRate: { type: Number, default: 0 }, // percentage
    paymentTerms: { type: String, default: 'Net 30' },
    maxUses: Number,
    audienceLimit: Number
  },
  
  restrictions: [String],
  rights: [String],
  
  status: {
    type: String,
    enum: ['pending', 'active', 'expired', 'terminated', 'breach'],
    default: 'pending'
  },
  
  usage: [{
    usageId: String,
    date: Date,
    project: String,
    medium: String, // tv, film, digital, radio, etc
    territory: String,
    duration: Number, // seconds of music used
    audience: Number,
    revenue: Number, // revenue generated in satoshis
    description: String,
    metadata: mongoose.Schema.Types.Mixed
  }],
  
  payments: [{
    paymentId: String,
    amount: Number, // satoshis
    currency: { type: String, default: 'BSV' },
    txid: String, // blockchain transaction
    date: Date,
    type: { type: String, enum: ['license_fee', 'royalty', 'usage_fee'] },
    status: { type: String, enum: ['pending', 'confirmed', 'failed'] }
  }],
  
  legalText: String,
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  validFrom: Date,
  validUntil: Date,
  
  // Audit trail
  auditLog: [{
    action: String,
    actor: String,
    timestamp: { type: Date, default: Date.now },
    changes: mongoose.Schema.Types.Mixed,
    ipAddress: String
  }]
});

// Create indexes
LicensingSchema.index({ songId: 1, licenseType: 1 });
LicensingSchema.index({ 'licensee.name': 1 });
LicensingSchema.index({ status: 1 });
LicensingSchema.index({ validFrom: 1, validUntil: 1 });

export const Licensing = mongoose.model('Licensing', LicensingSchema);

/**
 * Revenue Distribution Schema
 * Tracks revenue calculations and payment distributions
 */
const RevenueDistributionSchema = new mongoose.Schema({
  distributionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  songId: {
    type: String,
    required: true,
    index: true
  },
  songTitle: String,
  artist: String,
  
  distributionType: {
    type: String,
    required: true,
    enum: ['streaming', 'sync', 'mechanical', 'performance', 'sales'],
    index: true
  },
  
  // Revenue amounts
  totalRevenue: { type: Number, required: true }, // Original total revenue
  netRevenue: { type: Number, required: true }, // After platform/category adjustments
  revenueMultiplier: { type: Number, default: 1.0 }, // Category multiplier applied
  
  // Distribution breakdown
  distributions: [{
    recipientType: { 
      type: String, 
      enum: ['songwriter', 'producer', 'performer', 'publisher', 'label'],
      required: true 
    },
    recipientName: { type: String, required: true },
    recipientContact: String,
    role: String, // specific role like 'lead vocalist', 'co-producer'
    sharePercentage: { type: Number, required: true }, // Their percentage of this category
    amount: { type: Number, required: true }, // Calculated payment amount in satoshis
    currency: { type: String, default: 'BSV' },
    isAI: { type: Boolean, default: false },
    status: { 
      type: String, 
      enum: ['calculated', 'pending', 'paid', 'failed'],
      default: 'calculated' 
    }
  }],
  
  // Payment processing
  payments: [{
    paymentId: String,
    distributionId: String,
    recipientName: String,
    recipientContact: String,
    recipientType: String,
    amount: Number,
    currency: { type: String, default: 'BSV' },
    status: { 
      type: String, 
      enum: ['pending', 'confirmed', 'failed', 'simulated'],
      default: 'pending' 
    },
    createdAt: { type: Date, default: Date.now },
    confirmedAt: Date,
    
    blockchain: {
      network: { type: String, default: 'BSV-mainnet' },
      fromAddress: String,
      toAddress: String,
      txid: String,
      fee: Number,
      confirmations: { type: Number, default: 0 }
    },
    
    error: String
  }],
  
  // Status and timing
  status: {
    type: String,
    enum: ['calculated', 'processing', 'completed', 'failed', 'simulated'],
    default: 'calculated',
    index: true
  },
  
  calculatedAt: { type: Date, default: Date.now },
  processedAt: Date,
  completedAt: Date,
  
  // Metadata
  metadata: {
    platformData: mongoose.Schema.Types.Mixed, // Platform-specific breakdown
    period: String, // Reporting period
    batchId: String // If part of batch processing
  },
  
  // Audit trail
  auditLog: [{
    action: String,
    actor: String,
    timestamp: { type: Date, default: Date.now },
    changes: mongoose.Schema.Types.Mixed
  }]
});

// Create indexes for revenue distribution
RevenueDistributionSchema.index({ songId: 1, calculatedAt: -1 });
RevenueDistributionSchema.index({ distributionType: 1, status: 1 });
RevenueDistributionSchema.index({ 'distributions.recipientName': 1 });
RevenueDistributionSchema.index({ 'payments.status': 1, 'payments.createdAt': -1 });

export const RevenueDistribution = mongoose.model('RevenueDistribution', RevenueDistributionSchema);

/**
 * Workflow Execution Schema
 * Tracks automated workflow executions and results
 */
const WorkflowExecutionSchema = new mongoose.Schema({
  workflowId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  type: {
    type: String,
    required: true,
    enum: ['weekly_content_generation', 'platform_sync', 'backup', 'revenue_distribution', 'rights_verification'],
    index: true
  },
  
  status: {
    type: String,
    required: true,
    enum: ['running', 'completed', 'partial', 'failed'],
    default: 'running',
    index: true
  },
  
  // Execution metrics
  targetCount: Number, // Target number of items to process
  successCount: { type: Number, default: 0 },
  failCount: { type: Number, default: 0 },
  processedCount: { type: Number, default: 0 },
  partialCount: { type: Number, default: 0 },
  
  // Execution results
  results: [{
    itemId: String, // Song ID, Artist ID, etc.
    itemType: String, // 'song', 'artist', 'license', etc.
    status: String, // 'success', 'failed', 'partial'
    data: mongoose.Schema.Types.Mixed, // Results data
    error: String // Error message if failed
  }],
  
  // Generated content (for content generation workflows)
  generatedContent: [{
    songId: String,
    title: String,
    artist: String,
    genre: String,
    status: String,
    audioPath: String,
    error: String
  }],
  
  // Sync results (for platform sync workflows)
  syncResults: [{
    songId: String,
    title: String,
    platforms: [{
      platform: String,
      status: String,
      platformId: String,
      url: String,
      error: String
    }],
    overallStatus: String,
    error: String
  }],
  
  // Configuration used for execution
  configuration: {
    songsPerWeek: Number,
    platforms: [String],
    genreDistribution: mongoose.Schema.Types.Mixed,
    qualityThreshold: Number,
    autoPublish: Boolean,
    autoDistribute: Boolean
  },
  
  // Timing information
  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
  duration: Number, // milliseconds
  
  // Error information
  error: {
    message: String,
    stack: String,
    code: String
  },
  
  // Performance metrics
  performance: {
    averageProcessingTime: Number, // ms per item
    peakMemoryUsage: Number,
    totalApiCalls: Number,
    failureRate: Number // percentage
  },
  
  // Audit trail
  executedBy: { type: String, default: 'system' },
  trigger: { 
    type: String, 
    enum: ['manual', 'scheduled', 'event', 'api'],
    default: 'manual' 
  },
  
  // Metadata
  metadata: mongoose.Schema.Types.Mixed
});

// Create indexes for workflow execution
WorkflowExecutionSchema.index({ type: 1, status: 1, startedAt: -1 });
WorkflowExecutionSchema.index({ executedBy: 1, startedAt: -1 });
WorkflowExecutionSchema.index({ trigger: 1, type: 1 });

export const WorkflowExecution = mongoose.model('WorkflowExecution', WorkflowExecutionSchema);

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
      dbName: process.env.DB_NAME || 'ai-records',
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