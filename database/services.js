/**
 * AI Record Label Platform Database Service Layer
 * Comprehensive CRUD operations with automatic audit trail generation for music industry
 */

import { 
  User, 
  AIArtist,
  Song, 
  AuditTrail, 
  ZKProof, 
  Organization,
  UTXO
} from './schemas.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// =============================================
// AUDIT TRAIL HELPER FUNCTIONS
// =============================================

class AuditService {
  
  /**
   * Create audit trail entry
   * @param {Object} auditData - Audit information
   */
  static async createAuditEntry(auditData) {
    try {
      const auditId = crypto.randomUUID();
      
      const auditEntry = new AuditTrail({
        auditId,
        ...auditData,
        timestamp: new Date(),
        integrity: {
          hash: this.generateAuditHash(auditData)
        }
      });
      
      await auditEntry.save();
      return auditEntry;
    } catch (error) {
      console.error('Failed to create audit entry:', error);
      // Don't throw - audit failures shouldn't break main operations
    }
  }
  
  /**
   * Generate hash for audit record integrity
   */
  static generateAuditHash(auditData) {
    const dataString = JSON.stringify(auditData, Object.keys(auditData).sort());
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }
  
  /**
   * Query audit trail with filters
   */
  static async queryAuditTrail(filters = {}, options = {}) {
    const {
      userId,
      eventType,
      category,
      severity,
      targetType,
      targetId,
      fromDate,
      toDate,
      ipAddress,
      organizationId
    } = filters;
    
    const query = {};
    
    if (userId) query['actor.userId'] = userId;
    if (eventType) query['event.type'] = eventType;
    if (category) query['event.category'] = category;
    if (severity) query['event.severity'] = severity;
    if (targetType) query['target.type'] = targetType;
    if (targetId) query['target.id'] = targetId;
    if (ipAddress) query['actor.ipAddress'] = ipAddress;
    if (organizationId) query['actor.organizationId'] = organizationId;
    
    if (fromDate || toDate) {
      query.timestamp = {};
      if (fromDate) query.timestamp.$gte = new Date(fromDate);
      if (toDate) query.timestamp.$lte = new Date(toDate);
    }
    
    const {
      page = 1,
      limit = 100,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = options;
    
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (page - 1) * limit;
    
    const results = await AuditTrail
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();
      
    const total = await AuditTrail.countDocuments(query);
    
    return {
      results,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
}

// =============================================
// USER SERVICE
// =============================================

export class UserService {
  
  /**
   * Create new user with audit trail
   */
  static async createUser(userData, actorInfo = {}) {
    try {
      // Hash password
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(userData.password, salt);
      
      // Generate unique user ID
      const userId = crypto.randomUUID();
      
      const user = new User({
        userId,
        ...userData,
        passwordHash,
        salt,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await user.save();
      
      // Create audit trail
      await AuditService.createAuditEntry({
        event: {
          type: 'user_created',
          category: 'admin',
          severity: 'info'
        },
        actor: actorInfo,
        target: {
          type: 'user',
          id: userId,
          name: `${userData.profile.firstName} ${userData.profile.lastName}`
        },
        details: {
          description: `User account created for ${userData.email}`,
          changes: {
            after: {
              email: userData.email,
              role: userData.role,
              organization: userData.profile.organization
            }
          }
        }
      });
      
      // Remove sensitive data from response
      const userResponse = user.toObject();
      delete userResponse.passwordHash;
      delete userResponse.salt;
      
      return userResponse;
      
    } catch (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }
  
  /**
   * Authenticate user
   */
  static async authenticateUser(email, password, requestInfo = {}) {
    try {
      const user = await User.findOne({ 
        email: email.toLowerCase(),
        status: { $in: ['active', 'pending_verification'] }
      });
      
      if (!user) {
        // Audit failed login
        await AuditService.createAuditEntry({
          event: {
            type: 'login_failed',
            category: 'authentication',
            severity: 'warning'
          },
          actor: {
            ipAddress: requestInfo.ipAddress,
            userAgent: requestInfo.userAgent
          },
          details: {
            description: `Failed login attempt for ${email}`,
            error: {
              code: 'USER_NOT_FOUND',
              message: 'Invalid credentials'
            }
          }
        });
        
        return null;
      }
      
      // Check account lockout
      if (user.lockoutUntil && user.lockoutUntil > Date.now()) {
        await AuditService.createAuditEntry({
          event: {
            type: 'login_failed',
            category: 'authentication',
            severity: 'warning'
          },
          actor: {
            userId: user.userId,
            ipAddress: requestInfo.ipAddress,
            userAgent: requestInfo.userAgent
          },
          details: {
            description: `Login attempt on locked account: ${email}`,
            error: {
              code: 'ACCOUNT_LOCKED',
              message: 'Account temporarily locked'
            }
          }
        });
        
        return null;
      }
      
      // Verify password
      const isValid = await bcrypt.compare(password, user.passwordHash);
      
      if (!isValid) {
        // Increment failed attempts
        user.loginAttempts = (user.loginAttempts || 0) + 1;
        
        // Lock account after 5 failed attempts
        if (user.loginAttempts >= 5) {
          user.lockoutUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        }
        
        await user.save();
        
        await AuditService.createAuditEntry({
          event: {
            type: 'login_failed',
            category: 'authentication',
            severity: 'warning'
          },
          actor: {
            userId: user.userId,
            ipAddress: requestInfo.ipAddress,
            userAgent: requestInfo.userAgent
          },
          details: {
            description: `Invalid password for ${email}`,
            error: {
              code: 'INVALID_PASSWORD',
              message: 'Invalid credentials'
            }
          }
        });
        
        return null;
      }
      
      // Successful login
      user.lastLogin = new Date();
      user.lastActivity = new Date();
      user.loginAttempts = 0;
      user.lockoutUntil = undefined;
      await user.save();
      
      await AuditService.createAuditEntry({
        event: {
          type: 'user_login',
          category: 'authentication',
          severity: 'info'
        },
        actor: {
          userId: user.userId,
          role: user.role,
          ipAddress: requestInfo.ipAddress,
          userAgent: requestInfo.userAgent,
          organizationId: user.profile.organization
        },
        target: {
          type: 'user',
          id: user.userId,
          name: `${user.profile.firstName} ${user.profile.lastName}`
        },
        details: {
          description: `Successful login for ${email}`
        }
      });
      
      // Remove sensitive data
      const userResponse = user.toObject();
      delete userResponse.passwordHash;
      delete userResponse.salt;
      
      return userResponse;
      
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }
  
  /**
   * Update user with audit trail
   */
  static async updateUser(userId, updateData, actorInfo = {}) {
    try {
      const user = await User.findOne({ userId });
      if (!user) {
        throw new Error('User not found');
      }
      
      const before = user.toObject();
      
      // Update user
      Object.assign(user, updateData, { updatedAt: new Date() });
      await user.save();
      
      const after = user.toObject();
      
      // Determine changed fields
      const changedFields = Object.keys(updateData);
      
      await AuditService.createAuditEntry({
        event: {
          type: 'user_modified',
          category: 'admin',
          severity: 'info'
        },
        actor: actorInfo,
        target: {
          type: 'user',
          id: userId,
          name: `${user.profile.firstName} ${user.profile.lastName}`
        },
        details: {
          description: `User profile updated`,
          changes: {
            before: Object.fromEntries(changedFields.map(field => [field, before[field]])),
            after: Object.fromEntries(changedFields.map(field => [field, after[field]])),
            fields: changedFields
          }
        }
      });
      
      return user;
      
    } catch (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }
  
  /**
   * Get user by ID
   */
  static async getUserById(userId) {
    const user = await User.findOne({ userId });
    if (!user) return null;
    
    const userResponse = user.toObject();
    delete userResponse.passwordHash;
    delete userResponse.salt;
    
    return userResponse;
  }
  
  /**
   * Search users with filters
   */
  static async searchUsers(filters = {}, options = {}) {
    const query = {};
    
    if (filters.role) query.role = filters.role;
    if (filters.status) query.status = filters.status;
    if (filters.organization) query['profile.organization'] = filters.organization;
    if (filters.email) query.email = new RegExp(filters.email, 'i');
    
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;
    
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (page - 1) * limit;
    
    const users = await User
      .find(query, { passwordHash: 0, salt: 0 })
      .sort(sort)
      .skip(skip)
      .limit(limit);
      
    const total = await User.countDocuments(query);
    
    return {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
}

// =============================================
// AI ARTIST SERVICE
// =============================================

export class ArtistService {
  
  /**
   * Create new AI artist
   */
  static async createAIArtist(artistData, actorInfo = {}) {
    try {
      const artistId = crypto.randomUUID();
      
      // Generate cryptographic identity for the artist
      const { signData, getAddressFromPrivateKey, getPublicKeyFromPrivateKey } = await import('../tools/der-signature.js');
      const bsv = (await import('smartledger-bsv')).default;
      
      const artistPrivateKey = new bsv.PrivateKey();
      const artistAddress = artistPrivateKey.toAddress().toString();
      const artistPublicKey = artistPrivateKey.publicKey.toString();
      
      // Create identity hash
      const identityData = JSON.stringify({
        name: artistData.identity.name,
        stageName: artistData.identity.stageName,
        genre: artistData.identity.genre,
        createdAt: new Date().toISOString()
      });
      const identityHash = crypto.createHash('sha256').update(identityData).digest('hex');
      
      // Sign the identity
      const signature = await signData(identityHash, artistPrivateKey.toWIF());
      
      const artist = new AIArtist({
        artistId,
        ...artistData,
        cryptography: {
          identityHash,
          signature: {
            value: signature,
            publicKey: artistPublicKey,
            address: artistAddress,
            timestamp: new Date()
          },
          artistKeys: {
            privateKeyEncrypted: artistPrivateKey.toWIF(), // In production, this should be encrypted
            publicKey: artistPublicKey,
            address: artistAddress
          }
        },
        createdBy: actorInfo.userId || 'system',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await artist.save();
      
      await AuditService.createAuditEntry({
        event: {
          type: 'data_submitted',
          category: 'data',
          severity: 'info'
        },
        actor: actorInfo,
        target: {
          type: 'user',
          id: artistId,
          name: `AI Artist ${artistData.identity.stageName}`
        },
        details: {
          description: `Created AI artist ${artistData.identity.stageName} with cryptographic identity`,
          cryptography: {
            hash: identityHash,
            publicKey: artistPublicKey,
            address: artistAddress
          }
        }
      });
      
      return artist;
      
    } catch (error) {
      throw new Error(`Failed to create AI artist: ${error.message}`);
    }
  }
  
  /**
   * Get artist by ID or address
   */
  static async getArtistById(artistId) {
    return await AIArtist.findOne({ 
      $or: [
        { artistId },
        { 'cryptography.artistKeys.address': artistId }
      ]
    });
  }
  
  /**
   * Search artists
   */
  static async searchArtists(filters = {}, options = {}) {
    const query = {};
    
    if (filters.name) query['identity.name'] = new RegExp(filters.name, 'i');
    if (filters.stageName) query['identity.stageName'] = new RegExp(filters.stageName, 'i');
    if (filters.genre) query['identity.genre'] = { $in: Array.isArray(filters.genre) ? filters.genre : [filters.genre] };
    if (filters.language) query['identity.language'] = filters.language;
    if (filters.status) query.status = filters.status;
    if (filters.type) query['identity.type'] = filters.type;
    
    if (filters.minStreams) query['performance.totalStreams'] = { $gte: filters.minStreams };
    if (filters.createdBy) query.createdBy = filters.createdBy;
    
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;
    
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (page - 1) * limit;
    
    const artists = await AIArtist
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);
      
    const total = await AIArtist.countDocuments(query);
    
    return {
      artists,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
  
  /**
   * Update artist information
   */
  static async updateArtist(artistId, updateData, actorInfo = {}) {
    try {
      const artist = await AIArtist.findOne({ artistId });
      if (!artist) {
        throw new Error('AI Artist not found');
      }
      
      const before = artist.toObject();
      
      // Update artist data
      Object.assign(artist, updateData, { 
        updatedAt: new Date(),
        lastActivityAt: new Date()
      });
      
      await artist.save();
      
      const after = artist.toObject();
      const changedFields = Object.keys(updateData);
      
      await AuditService.createAuditEntry({
        event: {
          type: 'data_modified',
          category: 'data',
          severity: 'info'
        },
        actor: actorInfo,
        target: {
          type: 'user',
          id: artistId,
          name: `AI Artist ${artist.identity.stageName}`
        },
        details: {
          description: `Updated AI artist profile`,
          changes: {
            before: Object.fromEntries(changedFields.map(field => [field, before[field]])),
            after: Object.fromEntries(changedFields.map(field => [field, after[field]])),
            fields: changedFields
          }
        }
      });
      
      return artist;
      
    } catch (error) {
      throw new Error(`Failed to update AI artist: ${error.message}`);
    }
  }
  
  /**
   * Update artist performance metrics
   */
  static async updatePerformanceMetrics(artistId, metrics, actorInfo = {}) {
    try {
      const artist = await AIArtist.findOne({ artistId });
      if (!artist) {
        throw new Error('AI Artist not found');
      }
      
      // Update performance data
      artist.performance = { ...artist.performance, ...metrics };
      artist.lastActivityAt = new Date();
      artist.updatedAt = new Date();
      
      await artist.save();
      
      await AuditService.createAuditEntry({
        event: {
          type: 'data_modified',
          category: 'data',
          severity: 'info'
        },
        actor: actorInfo,
        target: {
          type: 'user',
          id: artistId,
          name: `AI Artist ${artist.identity.stageName}`
        },
        details: {
          description: `Updated performance metrics`,
          metadata: metrics
        }
      });
      
      return artist;
      
    } catch (error) {
      throw new Error(`Failed to update artist performance: ${error.message}`);
    }
  }
}

// =============================================
// MUSIC CATALOG SERVICE
// =============================================

export class CatalogService {
  
  /**
   * Create new song entry
   */
  static async createSong(songData, actorInfo = {}) {
    try {
      const songId = crypto.randomUUID();
      
      // Generate cryptographic signature for song ownership
      const { signData } = await import('../tools/der-signature.js');
      
      // Create content hash from metadata and file checksums
      const contentData = JSON.stringify({
        title: songData.metadata.title,
        artistId: songData.metadata.artistId,
        duration: songData.metadata.duration,
        audioAssets: songData.audioAssets,
        rights: songData.rights,
        createdAt: new Date().toISOString()
      });
      const contentHash = crypto.createHash('sha256').update(contentData).digest('hex');
      
      // Get platform keys for signing
      const { createAgentKeys } = await import('../scripts/signature.js');
      const platformKeys = createAgentKeys('platform');
      const signature = await signData(contentHash, platformKeys.privateKey);
      
      const song = new Song({
        songId,
        ...songData,
        cryptography: {
          contentHash,
          signature: {
            value: signature,
            publicKey: platformKeys.publicKey,
            timestamp: new Date()
          }
        },
        createdBy: actorInfo.userId || 'system',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await song.save();
      
      await AuditService.createAuditEntry({
        event: {
          type: 'data_submitted',
          category: 'data',
          severity: 'info'
        },
        actor: actorInfo,
        target: {
          type: 'notarization',
          id: songId,
          name: `Song ${songData.metadata.title} by ${songData.metadata.artistName}`
        },
        details: {
          description: `Created song entry with cryptographic ownership proof`,
          cryptography: {
            hash: contentHash,
            signature: signature,
            publicKey: platformKeys.publicKey
          }
        }
      });
      
      return song;
      
    } catch (error) {
      throw new Error(`Failed to create song: ${error.message}`);
    }
  }
  
  /**
   * Get song by ID or blockchain transaction
   */
  static async getSongById(songId) {
    return await Song.findOne({ 
      $or: [
        { songId },
        { 'blockchain.txid': songId }
      ]
    });
  }
  
  /**
   * Search songs in catalog
   */
  static async searchSongs(filters = {}, options = {}) {
    const query = {};
    
    if (filters.title) query['metadata.title'] = new RegExp(filters.title, 'i');
    if (filters.artistId) query['metadata.artistId'] = filters.artistId;
    if (filters.artistName) query['metadata.artistName'] = new RegExp(filters.artistName, 'i');
    if (filters.genre) query['metadata.genre'] = filters.genre;
    if (filters.mood) query['metadata.mood'] = filters.mood;
    if (filters.status) query.status = filters.status;
    if (filters.language) query['metadata.language'] = filters.language;
    if (filters.isExplicit !== undefined) query['metadata.isExplicit'] = filters.isExplicit;
    
    if (filters.minDuration) query['metadata.duration'] = { $gte: filters.minDuration };
    if (filters.maxDuration) query['metadata.duration'] = { ...query['metadata.duration'], $lte: filters.maxDuration };
    
    if (filters.minStreams) query['performance.totalStreams'] = { $gte: filters.minStreams };
    if (filters.minRevenue) query['performance.totalRevenue'] = { $gte: filters.minRevenue };
    
    if (filters.fromDate || filters.toDate) {
      query['metadata.releaseDate'] = {};
      if (filters.fromDate) query['metadata.releaseDate'].$gte = new Date(filters.fromDate);
      if (filters.toDate) query['metadata.releaseDate'].$lte = new Date(filters.toDate);
    }
    
    if (filters.tags && filters.tags.length > 0) {
      query['metadata.tags'] = { $in: filters.tags };
    }
    
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;
    
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (page - 1) * limit;
    
    const songs = await Song
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);
      
    const total = await Song.countDocuments(query);
    
    return {
      songs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
  
  /**
   * Update song metadata
   */
  static async updateSong(songId, updateData, actorInfo = {}) {
    try {
      const song = await Song.findOne({ songId });
      if (!song) {
        throw new Error('Song not found');
      }
      
      const before = song.toObject();
      
      // Update song data
      Object.assign(song, updateData, { updatedAt: new Date() });
      await song.save();
      
      const after = song.toObject();
      const changedFields = Object.keys(updateData);
      
      await AuditService.createAuditEntry({
        event: {
          type: 'data_modified',
          category: 'data',
          severity: 'info'
        },
        actor: actorInfo,
        target: {
          type: 'notarization',
          id: songId,
          name: `Song ${song.metadata.title}`
        },
        details: {
          description: `Updated song metadata`,
          changes: {
            before: Object.fromEntries(changedFields.map(field => [field, before[field]])),
            after: Object.fromEntries(changedFields.map(field => [field, after[field]])),
            fields: changedFields
          }
        }
      });
      
      return song;
      
    } catch (error) {
      throw new Error(`Failed to update song: ${error.message}`);
    }
  }
  
  /**
   * Update song performance metrics
   */
  static async updateSongPerformance(songId, metrics, actorInfo = {}) {
    try {
      const song = await Song.findOne({ songId });
      if (!song) {
        throw new Error('Song not found');
      }
      
      // Update performance data
      song.performance = { ...song.performance, ...metrics, lastUpdated: new Date() };
      song.updatedAt = new Date();
      
      await song.save();
      
      await AuditService.createAuditEntry({
        event: {
          type: 'data_modified',
          category: 'data',
          severity: 'info'
        },
        actor: actorInfo,
        target: {
          type: 'notarization',
          id: songId,
          name: `Song ${song.metadata.title}`
        },
        details: {
          description: `Updated song performance metrics`,
          metadata: metrics
        }
      });
      
      return song;
      
    } catch (error) {
      throw new Error(`Failed to update song performance: ${error.message}`);
    }
  }
  
  /**
   * Get songs by artist
   */
  static async getSongsByArtist(artistId, options = {}) {
    return await this.searchSongs({ artistId }, options);
  }
  
  /**
   * Get top performing songs
   */
  static async getTopSongs(metric = 'totalStreams', limit = 10) {
    const sortField = `performance.${metric}`;
    
    return await Song
      .find({ status: { $in: ['published', 'distributed', 'active'] } })
      .sort({ [sortField]: -1 })
      .limit(limit)
      .select('songId metadata.title metadata.artistName performance');
  }
  
  /**
   * Update distribution status
   */
  static async updateDistributionStatus(songId, platform, status, platformData = {}, actorInfo = {}) {
    try {
      const song = await Song.findOne({ songId });
      if (!song) {
        throw new Error('Song not found');
      }
      
      // Find or create platform entry
      let platformEntry = song.distribution.platforms.find(p => p.name === platform);
      
      if (platformEntry) {
        platformEntry.status = status;
        Object.assign(platformEntry, platformData);
      } else {
        song.distribution.platforms.push({
          name: platform,
          status,
          ...platformData
        });
      }
      
      song.updatedAt = new Date();
      await song.save();
      
      await AuditService.createAuditEntry({
        event: {
          type: 'data_modified',
          category: 'data',
          severity: 'info'
        },
        actor: actorInfo,
        target: {
          type: 'notarization',
          id: songId,
          name: `Song ${song.metadata.title}`
        },
        details: {
          description: `Updated ${platform} distribution status to ${status}`,
          metadata: { platform, status, ...platformData }
        }
      });
      
      return song;
      
    } catch (error) {
      throw new Error(`Failed to update distribution status: ${error.message}`);
    }
  }
}

// =============================================
// ZERO-KNOWLEDGE PROOF SERVICE
// =============================================

export class ZKProofService {
  
  /**
   * Create ZK proof record
   */
  static async createZKProof(proofData, actorInfo = {}) {
    try {
      const proofId = crypto.randomUUID();
      
      const zkProof = new ZKProof({
        proofId,
        ...proofData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await zkProof.save();
      
      await AuditService.createAuditEntry({
        event: {
          type: 'zk_proof_generated',
          category: 'crypto',
          severity: 'info'
        },
        actor: actorInfo,
        target: {
          type: 'proof',
          id: proofId,
          name: `ZK Proof for ${proofData.sampleId} - ${proofData.analyte}`
        },
        details: {
          description: `Zero-knowledge proof generated for compliance verification`,
          cryptography: {
            hash: proofData.proof.proofHash,
            algorithm: proofData.cryptography.algorithm
          }
        }
      });
      
      return zkProof;
      
    } catch (error) {
      throw new Error(`Failed to create ZK proof: ${error.message}`);
    }
  }
  
  /**
   * Verify ZK proof
   */
  static async verifyZKProof(proofId, verifierInfo, actorInfo = {}) {
    try {
      const zkProof = await ZKProof.findOne({ proofId });
      if (!zkProof) {
        throw new Error('ZK proof not found');
      }
      
      // Add verification record
      zkProof.verifications.push({
        verifiedBy: verifierInfo.userId,
        verifiedAt: new Date(),
        result: verifierInfo.result,
        verifierRole: verifierInfo.role,
        notes: verifierInfo.notes
      });
      
      await zkProof.save();
      
      await AuditService.createAuditEntry({
        event: {
          type: 'zk_proof_verified',
          category: 'crypto',
          severity: 'info'
        },
        actor: actorInfo,
        target: {
          type: 'proof',
          id: proofId,
          name: `ZK Proof for ${zkProof.sampleId} - ${zkProof.analyte}`
        },
        details: {
          description: `Zero-knowledge proof verification completed`,
          verification: {
            result: verifierInfo.result,
            verifier: verifierInfo.userId
          }
        }
      });
      
      return zkProof;
      
    } catch (error) {
      throw new Error(`Failed to verify ZK proof: ${error.message}`);
    }
  }
  
  /**
   * Get ZK proofs for sample
   */
  static async getZKProofsForSample(sampleId) {
    return await ZKProof.find({ sampleId }).sort({ createdAt: -1 });
  }
}

// =============================================
// ORGANIZATION SERVICE
// =============================================

export class OrganizationService {
  
  /**
   * Create organization
   */
  static async createOrganization(orgData, actorInfo = {}) {
    try {
      const organizationId = crypto.randomUUID();
      
      const organization = new Organization({
        organizationId,
        ...orgData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await organization.save();
      
      await AuditService.createAuditEntry({
        event: {
          type: 'organization_added',
          category: 'admin',
          severity: 'info'
        },
        actor: actorInfo,
        target: {
          type: 'organization',
          id: organizationId,
          name: orgData.name
        },
        details: {
          description: `New organization registered: ${orgData.name}`,
          changes: {
            after: {
              name: orgData.name,
              type: orgData.type
            }
          }
        }
      });
      
      return organization;
      
    } catch (error) {
      throw new Error(`Failed to create organization: ${error.message}`);
    }
  }
  
  /**
   * Get organization by ID
   */
  static async getOrganizationById(organizationId) {
    return await Organization.findOne({ organizationId });
  }
  
  /**
   * Search organizations
   */
  static async searchOrganizations(filters = {}, options = {}) {
    const query = {};
    
    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.name) query.name = new RegExp(filters.name, 'i');
    
    const {
      page = 1,
      limit = 20,
      sortBy = 'name',
      sortOrder = 'asc'
    } = options;
    
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (page - 1) * limit;
    
    const organizations = await Organization
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);
      
    const total = await Organization.countDocuments(query);
    
    return {
      organizations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
}

// =============================================
// GENERAL UTILITY FUNCTIONS
// =============================================

export class DatabaseService {
  
  /**
   * Get platform statistics
   */
  static async getPlatformStats() {
    const [
      totalUsers,
      totalNotarizations,
      totalAuditEntries,
      totalZKProofs,
      totalOrganizations,
      recentActivity
    ] = await Promise.all([
      User.countDocuments({ status: 'active' }),
      Notarization.countDocuments(),
      AuditTrail.countDocuments(),
      ZKProof.countDocuments(),
      Organization.countDocuments({ status: 'active' }),
      AuditTrail.find()
        .sort({ timestamp: -1 })
        .limit(10)
        .select('event.type actor.userId timestamp target.type')
    ]);
    
    return {
      users: totalUsers,
      notarizations: totalNotarizations,
      auditEntries: totalAuditEntries,
      zkProofs: totalZKProofs,
      organizations: totalOrganizations,
      recentActivity
    };
  }
  
  /**
   * Clean up old audit records (for compliance with retention policies)
   */
  static async cleanupOldAuditRecords(retentionDays = 2555) { // ~7 years default
    const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));
    
    const result = await AuditTrail.deleteMany({
      timestamp: { $lt: cutoffDate },
      'compliance.retentionPeriod': { $lt: retentionDays }
    });
    
    return result.deletedCount;
  }
}

// =============================================
// UTXO SERVICE CLASS
// =============================================

export class UTXOService {
  
  /**
   * Save UTXOs to database (bulk operation)
   */
  static async saveUTXOs(utxos, walletAddress, source = 'blockchain_fetch', actor = 'system') {
    const savedUTXOs = [];
    
    try {
      // Process UTXOs without sessions for better reliability
      for (const utxo of utxos) {
        // Check if UTXO already exists
        const existing = await UTXO.findOne({
          txid: utxo.txid,
          vout: utxo.vout
        });
        
        if (!existing) {
          const newUTXO = new UTXO({
            txid: utxo.txid,
            vout: utxo.vout,
            satoshis: utxo.satoshis,
            script: utxo.script,
            scriptPubKey: utxo.scriptPubKey || utxo.script,
            walletAddress,
            blockHeight: utxo.blockHeight || 0,
            confirmations: utxo.confirmations || 0,
            fetchedAt: utxo.fetchedAt || new Date(),
            source,
            status: utxo.status || 'available',
            createdBy: actor,
            updatedBy: actor
          });
          
          await newUTXO.save();
          savedUTXOs.push(newUTXO);
        }
      }
      
      // Create audit trail
      await AuditService.createAuditEntry({
        event: {
          type: 'bulk_create',
          category: 'utxo_management',
          severity: 'info'
        },
        actor: { userId: actor, type: 'system' },
        target: { type: 'utxo_collection', id: walletAddress },
        details: {
          description: `Saved ${savedUTXOs.length} new UTXOs for wallet ${walletAddress}`,
          metadata: {
            totalUTXOs: utxos.length,
            newUTXOs: savedUTXOs.length,
            source,
            totalSatoshis: savedUTXOs.reduce((sum, u) => sum + u.satoshis, 0)
          }
        }
      });
      
      return {
        success: true,
        saved: savedUTXOs.length,
        total: utxos.length,
        utxos: savedUTXOs
      };
      
    } catch (error) {
      throw new Error(`Failed to save UTXOs: ${error.message}`);
    }
  }
  
  /**
   * Get available UTXOs for a wallet
   */
  static async getAvailableUTXOs(walletAddress, minAmount = 0, limit = 100) {
    try {
      const utxos = await UTXO.findAvailable(walletAddress, minAmount)
        .limit(limit)
        .exec();
        
      return utxos;
    } catch (error) {
      throw new Error(`Failed to fetch available UTXOs: ${error.message}`);
    }
  }
  
  /**
   * Reserve a UTXO for spending (atomic operation)
   */
  static async reserveUTXO(walletAddress, requiredAmount = 0, actor = 'system') {
    const session = await UTXO.startSession();
    
    try {
      let reservedUTXO;
      
      await session.withTransaction(async () => {
        // Find and reserve the best UTXO
        const utxo = await UTXO.findOne({
          walletAddress,
          status: 'available',
          satoshis: { $gte: requiredAmount }
        })
        .sort({ satoshis: -1 }) // Largest first
        .session(session);
        
        if (!utxo) {
          throw new Error(`No suitable UTXO available for ${requiredAmount} satoshis`);
        }
        
        // Reserve it
        await utxo.reserve(actor);
        reservedUTXO = utxo;
        
        // Create audit trail
          await AuditService.createAuditEntry({
            event: {
              type: 'reserve',
              category: 'utxo_management',
              severity: 'info'
            },
            actor: { userId: actor, type: 'system' },
            target: { type: 'utxo', id: `${utxo.txid}:${utxo.vout}` },
            details: {
              description: `Reserved UTXO ${utxo.txid}:${utxo.vout} with ${utxo.satoshis} satoshis`,
              metadata: {
                walletAddress,
                requiredAmount,
                actualAmount: utxo.satoshis,
                txid: utxo.txid,
                vout: utxo.vout
              }
            }
          });
      });
      
      return reservedUTXO;
      
    } catch (error) {
      throw new Error(`Failed to reserve UTXO: ${error.message}`);
    } finally {
      await session.endSession();
    }
  }
  
  /**
   * Mark UTXO as spent
   */
  static async markUTXOSpent(txid, vout, spentInTxid, actor = 'system') {
    const session = await UTXO.startSession();
    
    try {
      let spentUTXO;
      
      await session.withTransaction(async () => {
        const utxo = await UTXO.findOne({ txid, vout }).session(session);
        
        if (!utxo) {
          throw new Error(`UTXO ${txid}:${vout} not found`);
        }
        
        await utxo.markSpent(spentInTxid, actor);
        spentUTXO = utxo;
        
        // Create audit trail
          await AuditService.createAuditEntry({
            event: {
              type: 'spend',
              category: 'utxo_management',
              severity: 'info'
            },
            actor: { userId: actor, type: 'system' },
            target: { type: 'utxo', id: `${txid}:${vout}` },
            details: {
              description: `Marked UTXO ${txid}:${vout} as spent in transaction ${spentInTxid}`,
              metadata: {
                originalTxid: txid,
                originalVout: vout,
                spentInTxid,
                satoshis: utxo.satoshis,
                walletAddress: utxo.walletAddress
              }
            }
          });
      });
      
      return spentUTXO;
      
    } catch (error) {
      throw new Error(`Failed to mark UTXO as spent: ${error.message}`);
    } finally {
      await session.endSession();
    }
  }
  
  /**
   * Add new UTXO (typically change output)
   */
  static async addUTXO(utxoData, actor = 'system') {
    const session = await UTXO.startSession();
    
    try {
      let newUTXO;
      
      await session.withTransaction(async () => {
        // Check if UTXO already exists
        const existing = await UTXO.findOne({
          txid: utxoData.txid,
          vout: utxoData.vout
        }).session(session);
        
        if (existing) {
          throw new Error(`UTXO ${utxoData.txid}:${utxoData.vout} already exists`);
        }
        
        newUTXO = new UTXO({
          ...utxoData,
          createdBy: actor,
          updatedBy: actor,
          fetchedAt: new Date()
        });
        
        await newUTXO.save({ session });
        
        // Create audit trail
          await AuditService.createAuditEntry({
            event: {
              type: 'bulk_create', // Use allowed value
              category: 'utxo_management',
              severity: 'info'
            },
            actor: { userId: actor, type: 'system' },
            target: { type: 'utxo', id: `${newUTXO.txid}:${newUTXO.vout}` },
            details: {
              description: `Added new UTXO ${newUTXO.txid}:${newUTXO.vout} with ${newUTXO.satoshis} satoshis`,
              metadata: {
                txid: newUTXO.txid,
                vout: newUTXO.vout,
                satoshis: newUTXO.satoshis,
                walletAddress: newUTXO.walletAddress,
                source: newUTXO.source
              }
            }
          });
      });
      
      return newUTXO;
      
    } catch (error) {
      throw new Error(`Failed to add UTXO: ${error.message}`);
    } finally {
      await session.endSession();
    }
  }
  
  /**
   * Restore UTXO (if transaction failed)
   */
  static async restoreUTXO(txid, vout, actor = 'system') {
    const session = await UTXO.startSession();
    
    try {
      let restoredUTXO;
      
      await session.withTransaction(async () => {
        const utxo = await UTXO.findOne({ txid, vout }).session(session);
        
        if (!utxo) {
          throw new Error(`UTXO ${txid}:${vout} not found`);
        }
        
        if (utxo.status !== 'reserved' && utxo.status !== 'spent') {
          throw new Error(`Cannot restore UTXO with status: ${utxo.status}`);
        }
        
        await utxo.release(actor);
        restoredUTXO = utxo;
        
        // Create audit trail
          await AuditService.createAuditEntry({
            event: {
              type: 'restore',
              category: 'utxo_management',
              severity: 'info'
            },
            actor: { userId: actor, type: 'system' },
            target: { type: 'utxo', id: `${txid}:${vout}` },
            details: {
              description: `Restored UTXO ${txid}:${vout} back to available status`,
              metadata: {
                txid,
                vout,
                satoshis: utxo.satoshis,
                previousStatus: utxo.status,
                walletAddress: utxo.walletAddress
              }
            }
          });
      });
      
      return restoredUTXO;
      
    } catch (error) {
      throw new Error(`Failed to restore UTXO: ${error.message}`);
    } finally {
      await session.endSession();
    }
  }
  
  /**
   * Get wallet balance and statistics
   */
  static async getWalletStats(walletAddress) {
    try {
      const [balanceResult, statusCounts, totalUTXOs] = await Promise.all([
        UTXO.getBalance(walletAddress),
        UTXO.aggregate([
          { $match: { walletAddress } },
          { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$satoshis' } } }
        ]),
        UTXO.countDocuments({ walletAddress })
      ]);
      
      const balance = balanceResult[0] || { total: 0, count: 0 };
      
      return {
        walletAddress,
        totalBalance: balance.total || 0,
        availableBalance: statusCounts.find(s => s._id === 'available')?.total || 0,
        totalUTXOs: totalUTXOs,
        availableUTXOs: balance.count || 0,
        statusBreakdown: statusCounts.reduce((acc, status) => {
          acc[status._id] = { count: status.count, satoshis: status.total };
          return acc;
        }, {}),
        lastUpdated: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to get wallet stats: ${error.message}`);
    }
  }
  
  /**
   * Clean up old spent UTXOs
   */
  static async cleanupOldUTXOs(daysOld = 30, actor = 'system') {
    try {
      const result = await UTXO.cleanupOldSpent(daysOld);
      
      if (result.deletedCount > 0) {
        await AuditService.createAuditEntry({
          action: 'UTXO_CLEANUP',
          actor: { userId: actor, type: 'system' },
          target: { type: 'utxo_collection', id: 'cleanup' },
          event: {
            type: 'cleanup',
            category: 'utxo_management',
            description: `Cleaned up ${result.deletedCount} old spent UTXOs older than ${daysOld} days`,
            metadata: {
              deletedCount: result.deletedCount,
              daysOld
            }
          }
        });
      }
      
      return result.deletedCount;
    } catch (error) {
      throw new Error(`Failed to cleanup old UTXOs: ${error.message}`);
    }
  }
  
  /**
   * Validate UTXO exists and is spendable
   */
  static async validateUTXO(txid, vout) {
    try {
      const utxo = await UTXO.findOne({ txid, vout });
      
      if (!utxo) {
        return { valid: false, reason: 'UTXO not found' };
      }
      
      if (utxo.status !== 'available') {
        return { valid: false, reason: `UTXO status is ${utxo.status}` };
      }
      
      return { valid: true, utxo };
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }
}

// Export audit service for direct access
export { AuditService };