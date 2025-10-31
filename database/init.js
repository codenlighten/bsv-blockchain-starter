/**
 * LabLedger Database Initialization Script
 * Sets up MongoDB collections, indexes, and initial data
 */

import mongoose from 'mongoose';
import { connectDatabase } from './schemas.js';
import { 
  UserService, 
  OrganizationService, 
  AuditService,
  UTXOService
} from './services.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// =============================================
// DATABASE INITIALIZATION
// =============================================

class DatabaseInitializer {
  
  static async initialize() {
    try {
      console.log('🚀 Starting LabLedger database initialization...\n');
      
      // Connect to database
      await connectDatabase();
      
      // Create indexes
      await this.createIndexes();
      
      // Create initial organizations
      await this.createInitialOrganizations();
      
      // Create system admin user
      await this.createSystemAdmin();
      
      // Create sample regulatory organization
      await this.createRegulatoryOrganization();
      
      // Set up database collections
      await this.setupCollections();
      
      console.log('\n✅ LabLedger database initialization completed successfully!');
      
      // Display summary
      await this.displaySummary();
      
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      process.exit(1);
    }
  }
  
  /**
   * Create database indexes for performance
   */
  static async createIndexes() {
    console.log('📊 Creating database indexes...');
    
    try {
      const db = mongoose.connection.db;
      
      // Users collection indexes
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('users').createIndex({ userId: 1 }, { unique: true });
      await db.collection('users').createIndex({ 'profile.organization': 1, role: 1 });
      await db.collection('users').createIndex({ 'cryptoIdentity.address': 1 });
      await db.collection('users').createIndex({ status: 1, lastActivity: -1 });
      
      // Notarizations collection indexes
      await db.collection('notarizations').createIndex({ notarizationId: 1 }, { unique: true });
      await db.collection('notarizations').createIndex({ 'blockchain.txid': 1 }, { unique: true });
      await db.collection('notarizations').createIndex({ 'sample.sampleId': 1, 'sample.labId': 1 });
      await db.collection('notarizations').createIndex({ 'sample.collectionDate': -1 });
      await db.collection('notarizations').createIndex({ 'compliance.overallCompliant': 1 });
      await db.collection('notarizations').createIndex({ 'submittedBy.userId': 1, createdAt: -1 });
      
      // Audit trail indexes
      await db.collection('audit_trail').createIndex({ auditId: 1 }, { unique: true });
      await db.collection('audit_trail').createIndex({ timestamp: -1 });
      await db.collection('audit_trail').createIndex({ 'actor.userId': 1, timestamp: -1 });
      await db.collection('audit_trail').createIndex({ 'event.type': 1, 'event.category': 1 });
      await db.collection('audit_trail').createIndex({ 'target.type': 1, 'target.id': 1 });
      await db.collection('audit_trail').createIndex({ 'correlation.workflowId': 1 });
      
      // Lab samples indexes
      await db.collection('lab_samples').createIndex({ sampleId: 1 }, { unique: true });
      await db.collection('lab_samples').createIndex({ 'collection.location.siteId': 1 });
      await db.collection('lab_samples').createIndex({ 'collection.date': -1 });
      await db.collection('lab_samples').createIndex({ 'classification.matrix': 1, 'classification.purpose': 1 });
      
      // ZK proofs indexes
      await db.collection('zk_proofs').createIndex({ proofId: 1 }, { unique: true });
      await db.collection('zk_proofs').createIndex({ sampleId: 1, analyte: 1 });
      await db.collection('zk_proofs').createIndex({ 'compliance.isCompliant': 1 });
      await db.collection('zk_proofs').createIndex({ 'blockchain.txid': 1 });
      
      // Organizations indexes
      await db.collection('organizations').createIndex({ organizationId: 1 }, { unique: true });
      await db.collection('organizations').createIndex({ name: 1 });
      await db.collection('organizations').createIndex({ type: 1, status: 1 });
      
      // UTXOs collection indexes
      await db.collection('utxos').createIndex({ txid: 1, vout: 1 }, { unique: true });
      await db.collection('utxos').createIndex({ status: 1, walletAddress: 1, satoshis: -1 });
      await db.collection('utxos').createIndex({ walletAddress: 1, status: 1, satoshis: -1 });
      await db.collection('utxos').createIndex({ fetchedAt: -1 });
      await db.collection('utxos').createIndex({ status: 1, spentAt: 1 });
      await db.collection('utxos').createIndex({ source: 1, createdAt: -1 });
      
      console.log('✅ Database indexes created successfully');
      
    } catch (error) {
      console.error('❌ Failed to create indexes:', error);
      throw error;
    }
  }
  
  /**
   * Create initial organizations
   */
  static async createInitialOrganizations() {
    console.log('🏢 Creating initial organizations...');
    
    try {
      // System organization
      const systemOrg = await OrganizationService.createOrganization({
        name: 'LabLedger System',
        legalName: 'SmartLedger Solutions LLC',
        type: 'government',
        contact: {
          email: 'info@smartalerts.org',
          website: 'https://smartledger.technology'
        },
        certifications: [{
          type: 'Platform Administrator',
          number: 'LABLEDGER-SYSTEM-001',
          issuedBy: 'SmartLedger Technology',
          issuedDate: new Date(),
          status: 'active'
        }],
        configuration: {
          defaultNotarization: true,
          zkProofRequired: false,
          auditLevel: 'comprehensive'
        }
      }, {
        userId: 'system',
        role: 'system_admin'
      });
      
      console.log(`✅ Created system organization: ${systemOrg.organizationId}`);
      
      // Sample laboratory organization
      const sampleLab = await OrganizationService.createOrganization({
        name: 'Eagle Environmental Consulting',
        legalName: 'Eagle Environmental Consulting LLC',
        type: 'laboratory',
        contact: {
          address: {
            street: '123 Lab Street',
            city: 'Denver',
            state: 'CO',
            zipCode: '80202',
            country: 'US'
          },
          phone: '+1-303-555-0123',
          email: 'info@eagleenv.com',
          website: 'https://eagleenv.com'
        },
        certifications: [{
          type: 'NELAP',
          number: 'CO-12345',
          scope: ['EPA 8260', 'EPA 8270', 'EPA 6010'],
          issuedBy: 'Colorado Department of Public Health',
          issuedDate: new Date('2023-01-01'),
          expiryDate: new Date('2025-12-31'),
          status: 'active'
        }],
        configuration: {
          defaultNotarization: true,
          zkProofRequired: true,
          auditLevel: 'enhanced'
        }
      }, {
        userId: 'system',
        role: 'system_admin'
      });
      
      console.log(`✅ Created sample lab organization: ${sampleLab.organizationId}`);
      
      // Store IDs for later use
      this.systemOrgId = systemOrg.organizationId;
      this.sampleLabId = sampleLab.organizationId;
      
    } catch (error) {
      console.error('❌ Failed to create initial organizations:', error);
      throw error;
    }
  }
  
  /**
   * Create system administrator
   */
  static async createSystemAdmin() {
    console.log('👤 Creating system administrator...');
    
    try {
      const adminUser = await UserService.createUser({
        email: 'admin@smartalerts.org',
        username: 'labledger_admin',
        password: process.env.ADMIN_PASSWORD || 'CHANGE_ME_IN_PRODUCTION', // Set via environment variable
        profile: {
          firstName: 'System',
          lastName: 'Administrator',
          title: 'Platform Administrator',
          organization: this.systemOrgId
        },
        role: 'system_admin',
        permissions: [
          'submit_data', 'sign_reports', 'notarize_blockchain',
          'view_audit_trail', 'manage_users', 'verify_compliance',
          'generate_zk_proofs', 'access_raw_data', 'admin_system'
        ],
        cryptoIdentity: {
          publicKey: '03cd83e2aaedcc8cad9930553671b3931caa32b3c074fa8fb8bfa26521b80c5bd1', // From generated wallet
          address: '1He7mZoKSErTzDAeBzxZ6medyPNWfAnExo', // From generated wallet
          keyDerivationPath: "m/44'/236'/0'/0/0"
        },
        status: 'active',
        emailVerified: true
      }, {
        userId: 'system',
        role: 'system_admin',
        ipAddress: '127.0.0.1'
      });
      
      console.log(`✅ Created system admin: ${adminUser.userId}`);
      console.log(`   Email: ${adminUser.email}`);
      console.log(`   Address: ${adminUser.cryptoIdentity.address}`);
      
    } catch (error) {
      console.error('❌ Failed to create system admin:', error);
      throw error;
    }
  }
  
  /**
   * Create regulatory organization
   */
  static async createRegulatoryOrganization() {
    console.log('🏛️ Creating regulatory organization...');
    
    try {
      const regulatorOrg = await OrganizationService.createOrganization({
        name: 'Colorado Energy & Carbon Management Commission',
        legalName: 'State of Colorado ECMC',
        type: 'regulatory_agency',
        contact: {
          address: {
            street: '1120 Lincoln Street',
            city: 'Denver',
            state: 'CO',
            zipCode: '80203',
            country: 'US'
          },
          phone: '+1-303-894-2100',
          email: 'ecmc@state.co.us',
          website: 'https://ecmc.state.co.us'
        },
        certifications: [{
          type: 'State Regulatory Authority',
          number: 'CO-ECMC-2019',
          issuedBy: 'State of Colorado',
          issuedDate: new Date('2019-01-01'),
          status: 'active'
        }],
        configuration: {
          defaultNotarization: false,
          zkProofRequired: false,
          auditLevel: 'comprehensive'
        }
      }, {
        userId: 'system',
        role: 'system_admin'
      });
      
      console.log(`✅ Created regulatory organization: ${regulatorOrg.organizationId}`);
      
      // Create regulator user
      const regulatorUser = await UserService.createUser({
        email: 'regulator@state.co.us',
        username: 'co_ecmc_regulator',
        password: process.env.REGULATOR_PASSWORD || 'CHANGE_ME_IN_PRODUCTION', // Set via environment variable
        profile: {
          firstName: 'Jane',
          lastName: 'Regulator',
          title: 'Environmental Compliance Officer',
          organization: regulatorOrg.organizationId
        },
        role: 'regulator',
        permissions: [
          'view_audit_trail', 'verify_compliance', 'access_raw_data'
        ],
        cryptoIdentity: {
          publicKey: crypto.randomBytes(33).toString('hex'),
          address: 'regulator-address-placeholder',
          keyDerivationPath: "m/44'/236'/1'/0/0"
        },
        status: 'active',
        emailVerified: true
      }, {
        userId: 'system',
        role: 'system_admin',
        ipAddress: '127.0.0.1'
      });
      
      console.log(`✅ Created regulator user: ${regulatorUser.userId}`);
      
    } catch (error) {
      console.error('❌ Failed to create regulatory organization:', error);
      throw error;
    }
  }
  
  /**
   * Set up collection validation and constraints
   */
  static async setupCollections() {
    console.log('⚙️ Setting up collection constraints...');
    
    try {
      const db = mongoose.connection.db;
      
      // Check if TTL index already exists before creating
      const existingIndexes = await db.collection('audit_trail').indexes();
      const ttlIndexExists = existingIndexes.some(index => 
        index.key && index.key.timestamp && index.expireAfterSeconds
      );
      
      if (!ttlIndexExists) {
        // Set up TTL index for audit trail cleanup (optional)
        await db.collection('audit_trail').createIndex(
          { "timestamp": 1 },
          { expireAfterSeconds: 63072000 } // 2 years
        );
        console.log('✅ TTL index created for audit trail');
      } else {
        console.log('✅ TTL index already exists for audit trail');
      }
      
      console.log('✅ Collection constraints configured');
      
    } catch (error) {
      console.error('❌ Failed to setup collections:', error);
      // Don't throw - this is not critical for basic functionality
    }
  }
  
  /**
   * Display initialization summary
   */
  static async displaySummary() {
    console.log('\n📊 LabLedger Database Summary:');
    console.log('=' .repeat(50));
    
    try {
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();
      
      console.log('\n📁 Collections created:');
      for (const collection of collections) {
        if (collection.name.startsWith('system') || collection.name.includes('index')) continue;
        
        const count = await db.collection(collection.name).countDocuments();
        const indexes = await db.collection(collection.name).indexes();
        
        console.log(`   ✅ ${collection.name}: ${count} documents, ${indexes.length} indexes`);
      }
      
      console.log('\n🔐 Initial Accounts Created:');
      console.log('   👤 System Admin: admin@smartalerts.org');
      console.log('   🏛️ Regulator: regulator@state.co.us');
      console.log('   ⚠️  Remember to change default passwords!');
      
      console.log('\n🏢 Organizations:');
      console.log('   🏗️ LabLedger System (Platform)');
      console.log('   🧪 Eagle Environmental (Sample Lab)');
      console.log('   🏛️ Colorado ECMC (Regulator)');
      
      console.log('\n🚀 Next Steps:');
      console.log('   1. Change default passwords');
      console.log('   2. Configure environment variables');
      console.log('   3. Start the LabLedger server');
      console.log('   4. Test blockchain integration');
      console.log('   5. Configure email notifications');
      
      console.log('\n📞 Support: info@smartalerts.org');
      console.log('🌐 Documentation: https://github.com/smartledger/labledger');
      
    } catch (error) {
      console.error('❌ Failed to display summary:', error);
    }
  }
}

// =============================================
// CLI INTERFACE
// =============================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'init';
  
  switch (command) {
    case 'init':
      await DatabaseInitializer.initialize();
      break;
      
    case 'indexes':
      await connectDatabase();
      await DatabaseInitializer.createIndexes();
      console.log('✅ Indexes created successfully');
      break;
      
    case 'summary':
      await connectDatabase();
      await DatabaseInitializer.displaySummary();
      break;
      
    case 'clean':
      console.log('🧹 Cleaning database...');
      await connectDatabase();
      
      // Drop all collections (destructive!)
      const collections = await mongoose.connection.db.listCollections().toArray();
      for (const collection of collections) {
        await mongoose.connection.db.dropCollection(collection.name);
        console.log(`   🗑️ Dropped ${collection.name}`);
      }
      console.log('✅ Database cleaned');
      break;
      
    default:
      console.log(`
LabLedger Database Manager

Usage: node database/init.js [command]

Commands:
  init     Initialize complete database (default)
  indexes  Create/update indexes only
  summary  Display database summary
  clean    Clean database (destructive!)

Examples:
  node database/init.js init
  node database/init.js indexes
  node database/init.js summary
      `);
  }
  
  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  });
}

export { DatabaseInitializer };