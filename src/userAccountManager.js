/**
 * User Account Manager with Web3 Cryptographic Identity
 * Implements secure key generation, storage, and management for AI Record Label platform
 * Based on web3keys.html pattern with smartledger-bsv integration
 */

import crypto from 'crypto';
import bsv from 'smartledger-bsv'; // Using v3.3.5 security-hardened version
import { User } from '../database/schemas.js';
import { connectDatabase } from '../database/schemas.js';

class UserAccountManager {
  constructor() {
    this.connected = false;
  }

  async initialize() {
    if (!this.connected) {
      await connectDatabase();
      this.connected = true;
    }
  }

  /**
   * Generate cryptographic identity using BSV standards
   * Implements mnemonic generation and key derivation
   */
  generateCryptoIdentity() {
    try {
      // Generate mnemonic using BSV standards (BIP39 compatible)
      const mnemonic = bsv.Mnemonic.fromRandom();
      
      // Derive HD wallet from mnemonic
      const seed = mnemonic.toSeed();
      const hdPrivateKey = bsv.HDPrivateKey.fromSeed(seed);
      
      // Generate primary identity keys
      const privateKey = hdPrivateKey.deriveChild(0).privateKey;
      const publicKey = privateKey.publicKey;
      const address = bsv.Address.fromPublicKey(publicKey);
      
      // Generate signing and encryption key pairs
      const signingKey = hdPrivateKey.deriveChild(1).privateKey;
      const encryptionKey = hdPrivateKey.deriveChild(2).privateKey;
      
      return {
        mnemonic: mnemonic.toString(),
        privateKey: privateKey.toString(),
        publicKey: publicKey.toString(),
        address: address.toString(),
        signingKey: signingKey.toString(),
        encryptionKey: encryptionKey.toString(),
        hdPath: "m/0'/0'/0'"
      };
    } catch (error) {
      throw new Error(`Crypto identity generation failed: ${error.message}`);
    }
  }

  /**
   * Encrypt sensitive data using password-based encryption
   */
  encryptWithPassword(data, password) {
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      encrypted,
      salt: salt.toString('hex'),
      iv: iv.toString('hex')
    };
  }

  /**
   * Decrypt sensitive data using password
   */
  decryptWithPassword(encryptedData, password, salt, iv) {
    const key = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 32, 'sha512');
    const ivBuffer = Buffer.from(iv, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, ivBuffer);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  /**
   * Create new user account with web3 cryptographic identity
   */
  async createUserAccount(userData) {
    await this.initialize();
    
    try {
      // Generate cryptographic identity
      const cryptoIdentity = this.generateCryptoIdentity();
      
      // Encrypt sensitive keys with user password
      const encryptedKeys = this.encryptWithPassword({
        mnemonic: cryptoIdentity.mnemonic,
        privateKey: cryptoIdentity.privateKey,
        signingKey: cryptoIdentity.signingKey,
        encryptionKey: cryptoIdentity.encryptionKey
      }, userData.password);
      
      // Create password hash and salt
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = crypto.pbkdf2Sync(userData.password, salt, 100000, 64, 'sha512').toString('hex');
      
      // Generate unique user ID and username
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const username = userData.email.split('@')[0] + '_' + Math.random().toString(36).substr(2, 4);
      
      // Create user document matching the actual schema
      const newUser = new User({
        email: userData.email,
        username: username,
        userId: userId,
        passwordHash: passwordHash,
        salt: salt,
        
        // Profile Information (required fields)
        profile: {
          firstName: userData.profile?.firstName || userData.name?.split(' ')[0] || 'User',
          lastName: userData.profile?.lastName || userData.name?.split(' ').slice(1).join(' ') || 'Account',
          title: userData.profile?.title || userData.role || 'Music Professional',
          organization: userData.profile?.organization || userData.entityType || 'Independent',
          phone: userData.contactInfo?.phone || userData.phone,
          bio: userData.profile?.bio || `${userData.entityType || 'Professional'} in the music industry`,
          website: userData.contactInfo?.website,
          socialMedia: userData.profile?.socialMedia || {}
        },
        
        // Role (must match enum values)
        role: this.mapRoleToEnum(userData.role),
        
        // Permissions based on role
        permissions: this.getPermissionsForRole(userData.role),
        
        // Cryptographic Identity (matching schema structure)
        cryptoIdentity: {
          publicKey: cryptoIdentity.publicKey,
          address: cryptoIdentity.address,
          keyDerivationPath: cryptoIdentity.hdPath,
          encryptedPrivateKey: encryptedKeys.encrypted, // Store encrypted private key
          web3KeysRegistration: {
            registered: true,
            registrationDate: new Date()
          }
        },
        
        // Account Status
        status: 'active',
        emailVerified: false,
        
        // Contact Information
        contactInfo: userData.contactInfo || {},
        
        // Music Credentials
        musicCredentials: userData.musicCredentials || [],
        
        // Publishing Info
        publishingInfo: userData.publishingInfo || {},
        
        // Security Settings
        security: {
          twoFactorEnabled: false,
          passwordStrength: this.calculatePasswordStrength(userData.password),
          encryptionEnabled: true,
          lastKeyRotation: new Date(),
          sessionTimeout: 3600,
          lastPasswordChange: new Date()
        },
        
        // Preferences
        preferences: {
          notifications: {
            email: true,
            blockchain: true,
            auditAlerts: true
          },
          dashboard: {
            defaultView: 'overview',
            timezone: 'UTC'
          }
        }
      });
      
      const savedUser = await newUser.save();
      
      // Return user info without sensitive data
      const userResponse = savedUser.toObject();
      delete userResponse.passwordHash;
      delete userResponse.salt;
      delete userResponse.cryptoIdentity.encryptedPrivateKey;
      
      console.log(`✅ Created user account: ${userData.email} with BSV address: ${cryptoIdentity.address}`);
      
      return {
        user: userResponse,
        publicKeys: {
          bsvAddress: cryptoIdentity.address,
          publicKey: cryptoIdentity.publicKey
        }
      };
    } catch (error) {
      throw new Error(`User account creation failed: ${error.message}`);
    }
  }

  /**
   * Verify user cryptographic identity
   */
  async verifyCryptoIdentity(userId, password) {
    await this.initialize();
    
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      
      // Decrypt private keys
      const decryptedKeys = this.decryptWithPassword(
        user.cryptoIdentity.encryptedKeys.data,
        password,
        user.cryptoIdentity.encryptedKeys.salt,
        user.cryptoIdentity.encryptedKeys.iv
      );
      
      // Verify key pair integrity
      const privateKey = bsv.PrivateKey.fromString(decryptedKeys.privateKey);
      const derivedPublicKey = privateKey.publicKey.toString();
      
      if (derivedPublicKey !== user.cryptoIdentity.publicKey) {
        throw new Error('Key pair verification failed');
      }
      
      // Mark as verified
      user.cryptoIdentity.verified = true;
      user.cryptoIdentity.verificationDate = new Date();
      await user.save();
      
      return {
        verified: true,
        bsvAddress: user.cryptoIdentity.bsvAddress,
        publicKey: user.cryptoIdentity.publicKey
      };
    } catch (error) {
      throw new Error(`Identity verification failed: ${error.message}`);
    }
  }

  /**
   * Sign data with user's private key
   */
  async signData(userId, password, data) {
    await this.initialize();
    
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      
      // Decrypt signing key
      const decryptedKeys = this.decryptWithPassword(
        user.cryptoIdentity.encryptedKeys.data,
        password,
        user.cryptoIdentity.encryptedKeys.salt,
        user.cryptoIdentity.encryptedKeys.iv
      );
      
      const signingKey = bsv.PrivateKey.fromString(decryptedKeys.signingKey);
      const message = bsv.Message.fromString(JSON.stringify(data));
      const signature = message.sign(signingKey);
      
      return {
        data,
        signature: signature.toString(),
        publicKey: user.cryptoIdentity.publicKey,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Data signing failed: ${error.message}`);
    }
  }

  /**
   * Map user role to valid enum values
   */
  mapRoleToEnum(role) {
    const roleMap = {
      'producer': 'producer',
      'publisher': 'rights_manager',
      'platform': 'system_admin',
      'artist': 'ai_artist_manager',
      'writer': 'songwriter',
      'admin': 'label_admin'
    };
    
    return roleMap[role] || 'producer';
  }
  
  /**
   * Get permissions based on role
   */
  getPermissionsForRole(role) {
    const permissionMap = {
      'producer': ['create_artists', 'manage_catalog', 'publish_music'],
      'publisher': ['manage_rights', 'calculate_revenue', 'generate_reports'],
      'platform': ['admin_system', 'view_analytics', 'generate_reports'],
      'artist': ['create_artists', 'manage_catalog'],
      'writer': ['create_artists', 'publish_music'],
      'admin': ['admin_system', 'manage_catalog', 'manage_rights', 'calculate_revenue']
    };
    
    return permissionMap[role] || ['create_artists'];
  }

  /**
   * Calculate password strength score
   */
  calculatePasswordStrength(password) {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return Math.min(score, 5);
  }

  /**
   * Get user public profile (safe for sharing)
   */
  async getUserPublicProfile(userId) {
    await this.initialize();
    
    try {
      const user = await User.findById(userId).select('-password -cryptoIdentity.encryptedKeys');
      if (!user) {
        throw new Error('User not found');
      }
      
      return {
        id: user._id,
        email: user.email,
        name: user.name,
        entityType: user.entityType,
        bsvAddress: user.cryptoIdentity.bsvAddress,
        publicKey: user.cryptoIdentity.publicKey,
        verified: user.cryptoIdentity.verified,
        createdAt: user.createdAt
      };
    } catch (error) {
      throw new Error(`Failed to get user profile: ${error.message}`);
    }
  }

  /**
   * Create the three specific user accounts for upside_down.mp3
   */
  async createProjectAccounts() {
    await this.initialize();
    
    console.log('🎵 Creating AI Record Label project accounts...\n');
    
    const accounts = [];
    
    // 1. Gregory Ward - Writer/Producer (70% ownership)
    try {
      // First check if user already exists
      let existingUser = await User.findOne({ email: 'gregory.ward@airecordlabel.com' });
      
      let gregoryAccount;
      if (existingUser) {
        console.log('✅ Gregory Ward account already exists - using existing account');
        gregoryAccount = {
          user: existingUser,
          publicKeys: {
            bsvAddress: existingUser.cryptoIdentity.address,
            publicKey: existingUser.cryptoIdentity.publicKey
          }
        };
      } else {
        gregoryAccount = await this.createUserAccount({
        email: 'gregory.ward@airecordlabel.com',
        password: 'SecurePass123!',
        name: 'Gregory Ward',
        entityType: 'individual',
        role: 'producer',
        
        // Profile information
        profile: {
          firstName: 'Gregory',
          lastName: 'Ward',
          title: 'Music Producer & Songwriter',
          organization: 'Gregory Ward Productions',
          bio: 'Award-winning music producer specializing in electronic and AI-assisted compositions'
        },
        
        // Professional credentials
        musicCredentials: [{
          type: 'Producer',
          number: 'PROD-001',
          isActive: true
        }],
        
        publishingInfo: {
          ascap: 'ASCAP-GW-001'
        },
        
        // Contact information
        contactInfo: {
          phone: '+1-555-0101',
          address: {
            street: '123 Music Row',
            city: 'Nashville',
            state: 'TN',
            zipCode: '37203',
            country: 'USA'
          }
        }
      });
      }
      
      accounts.push({
        name: 'Gregory Ward',
        role: 'Writer/Producer',
        ownership: 70,
        account: gregoryAccount
      });
      
      console.log('✅ Gregory Ward account ready - Writer/Producer (70% ownership)');
    } catch (error) {
      console.error('❌ Failed to create Gregory Ward account:', error.message);
    }
    
    // 2. Zion Gates Music Trust - Publishing (20% ownership)
    try {
      // First check if user already exists
      let existingUser = await User.findOne({ email: 'admin@ziongatesmusic.com' });
      
      let zionAccount;
      if (existingUser) {
        console.log('✅ Zion Gates Music Trust account already exists - using existing account');
        zionAccount = {
          user: existingUser,
          publicKeys: {
            bsvAddress: existingUser.cryptoIdentity.address,
            publicKey: existingUser.cryptoIdentity.publicKey
          }
        };
      } else {
        zionAccount = await this.createUserAccount({
        email: 'admin@ziongatesmusic.com',
        password: 'TrustSecure456!',
        name: 'Zion Gates Music Trust',
        entityType: 'trust',
        role: 'publisher',
        
        // Profile information
        profile: {
          firstName: 'Zion Gates',
          lastName: 'Music Trust',
          title: 'Music Publishing Trust',
          organization: 'Zion Gates Music Publishing LLC',
          bio: 'Leading music publishing trust specializing in rights management and royalty distribution'
        },
        
        // Trust credentials
        musicCredentials: [{
          type: 'Publishing Trust',
          number: 'TRUST-001',
          isActive: true
        }],
        
        publishingInfo: {
          bmi: 'BMI-ZGMT-001'
        },
        
        // Trust contact information
        contactInfo: {
          phone: '+1-555-0202',
          address: {
            street: '456 Publishing Ave',
            city: 'Los Angeles',
            state: 'CA',
            zipCode: '90210',
            country: 'USA'
          }
        }
      });
      }
      
      accounts.push({
        name: 'Zion Gates Music Trust',
        role: 'Publisher',
        ownership: 20,
        account: zionAccount
      });
      
      console.log('✅ Zion Gates Music Trust account ready - Publisher (20% ownership)');
    } catch (error) {
      console.error('❌ Failed to create Zion Gates Music Trust account:', error.message);
    }
    
    // 3. SmartLedger Technology - Platform/Technology (10% ownership)
    try {
      // First check if user already exists
      let existingUser = await User.findOne({ email: 'platform@smartledger.tech' });
      
      let smartledgerAccount;
      if (existingUser) {
        console.log('✅ SmartLedger Technology account already exists - using existing account');
        smartledgerAccount = {
          user: existingUser,
          publicKeys: {
            bsvAddress: existingUser.cryptoIdentity.address,
            publicKey: existingUser.cryptoIdentity.publicKey
          }
        };
      } else {
        smartledgerAccount = await this.createUserAccount({
        email: 'platform@smartledger.tech',
        password: 'TechSecure789!',
        name: 'SmartLedger Technology',
        entityType: 'corporation',
        role: 'platform',
        
        // Profile information
        profile: {
          firstName: 'SmartLedger',
          lastName: 'Technology',
          title: 'Blockchain Technology Platform',
          organization: 'SmartLedger Solutions LLC',
          bio: 'Leading blockchain technology provider for music industry rights management and micro-payments'
        },
        
        // Technology credentials
        musicCredentials: [{
          type: 'Technology Platform',
          number: 'TECH-001',
          isActive: true
        }],
        
        // Platform contact information
        contactInfo: {
          phone: '+1-555-0303',
          address: {
            street: '789 Tech Boulevard',
            city: 'San Francisco',
            state: 'CA',
            zipCode: '94107',
            country: 'USA'
          }
        }
      });
      }
      
      accounts.push({
        name: 'SmartLedger Technology',
        role: 'Platform Provider',
        ownership: 10,
        account: smartledgerAccount
      });
      
      console.log('✅ SmartLedger Technology account ready - Platform Provider (10% ownership)');
    } catch (error) {
      console.error('❌ Failed to create SmartLedger Technology account:', error.message);
    }
    
    console.log('\n🎯 Project accounts created successfully!');
    console.log('📊 Ownership Distribution:');
    accounts.forEach(account => {
      console.log(`   - ${account.name}: ${account.ownership}% (${account.role})`);
      console.log(`     BSV Address: ${account.account.publicKeys.bsvAddress}`);
    });
    
    return accounts;
  }
}

export default UserAccountManager;