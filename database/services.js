/**
 * LabLedger Database Service Layer
 * Comprehensive CRUD operations with automatic audit trail generation
 */

import { 
  User, 
  Notarization, 
  AuditTrail, 
  LabSample, 
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
// NOTARIZATION SERVICE
// =============================================

export class NotarizationService {
  
  /**
   * Create new notarization
   */
  static async createNotarization(notarizationData, actorInfo = {}) {
    try {
      const notarizationId = crypto.randomUUID();
      
      const notarization = new Notarization({
        notarizationId,
        ...notarizationData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await notarization.save();
      
      await AuditService.createAuditEntry({
        event: {
          type: 'data_notarized',
          category: 'data',
          severity: 'info'
        },
        actor: actorInfo,
        target: {
          type: 'notarization',
          id: notarizationId,
          name: `Sample ${notarizationData.sample.sampleId}`
        },
        details: {
          description: `Lab data notarized to blockchain`,
          blockchain: {
            txid: notarizationData.blockchain.txid,
            network: notarizationData.blockchain.network
          }
        }
      });
      
      return notarization;
      
    } catch (error) {
      throw new Error(`Failed to create notarization: ${error.message}`);
    }
  }
  
  /**
   * Get notarization by transaction ID
   */
  static async getNotarizationByTxid(txid) {
    return await Notarization.findOne({ 'blockchain.txid': txid });
  }
  
  /**
   * Search notarizations
   */
  static async searchNotarizations(filters = {}, options = {}) {
    const query = {};
    
    if (filters.sampleId) query['sample.sampleId'] = filters.sampleId;
    if (filters.labId) query['sample.labId'] = filters.labId;
    if (filters.state) query['sample.location.state'] = filters.state;
    if (filters.compliant !== undefined) query['compliance.overallCompliant'] = filters.compliant;
    if (filters.status) query.status = filters.status;
    if (filters.txid) query['blockchain.txid'] = filters.txid;
    
    if (filters.fromDate || filters.toDate) {
      query['sample.collectionDate'] = {};
      if (filters.fromDate) query['sample.collectionDate'].$gte = new Date(filters.fromDate);
      if (filters.toDate) query['sample.collectionDate'].$lte = new Date(filters.toDate);
    }
    
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;
    
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (page - 1) * limit;
    
    const notarizations = await Notarization
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);
      
    const total = await Notarization.countDocuments(query);
    
    return {
      notarizations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
  
  /**
   * Update notarization status
   */
  static async updateNotarizationStatus(notarizationId, status, actorInfo = {}) {
    try {
      const notarization = await Notarization.findOne({ notarizationId });
      if (!notarization) {
        throw new Error('Notarization not found');
      }
      
      const oldStatus = notarization.status;
      notarization.status = status;
      notarization.updatedAt = new Date();
      
      await notarization.save();
      
      await AuditService.createAuditEntry({
        event: {
          type: 'data_modified',
          category: 'data',
          severity: 'info'
        },
        actor: actorInfo,
        target: {
          type: 'notarization',
          id: notarizationId,
          name: `Sample ${notarization.sample.sampleId}`
        },
        details: {
          description: `Notarization status changed from ${oldStatus} to ${status}`,
          changes: {
            before: { status: oldStatus },
            after: { status: status },
            fields: ['status']
          }
        }
      });
      
      return notarization;
      
    } catch (error) {
      throw new Error(`Failed to update notarization: ${error.message}`);
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
    const session = await UTXO.startSession();
    const savedUTXOs = [];
    
    try {
      await session.withTransaction(async () => {
        for (const utxo of utxos) {
          // Check if UTXO already exists
          const existing = await UTXO.findOne({
            txid: utxo.txid,
            vout: utxo.vout
          }).session(session);
          
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
              createdBy: actor,
              updatedBy: actor
            });
            
            await newUTXO.save({ session });
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
      });
      
      return {
        success: true,
        saved: savedUTXOs.length,
        total: utxos.length,
        utxos: savedUTXOs
      };
      
    } catch (error) {
      throw new Error(`Failed to save UTXOs: ${error.message}`);
    } finally {
      await session.endSession();
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