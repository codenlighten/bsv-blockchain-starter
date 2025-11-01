#!/usr/bin/env node

/**
 * Rights Management System
 * 
 * Handles music rights, licensing, ownership verification, and legal compliance:
 * - Ownership verification and split management
 * - Licensing agreement generation
 * - Sync licensing and commercial use tracking
 * - Copyright protection and DMCA compliance
 * - Publishing rights administration
 */

import { CatalogService, ArtistService, AuditService } from '../database/services.js';
import { connectDatabase } from '../database/schemas.js';
import { publishData } from './publishMongo.js';
import spacesOps from '../spaces.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Rights Management System Class
 */
export class RightsManager {
  
  constructor() {
    this.initialized = false;
  }
  
  async initialize() {
    if (!this.initialized) {
      await connectDatabase();
      this.initialized = true;
      console.log('⚖️  Rights Management System initialized');
    }
  }
  
  /**
   * Verify ownership and rights for a song
   */
  async verifyRights(songId) {
    await this.initialize();
    
    try {
      const song = await CatalogService.getSongById(songId);
      if (!song) {
        throw new Error('Song not found');
      }
      
      console.log(`⚖️  Verifying rights for "${song.metadata.title}"...`);
      
      // Verify percentage splits add up to 100%
      const verification = {
        songId: song.songId,
        title: song.metadata.title,
        artist: song.metadata.artistName,
        verificationDate: new Date(),
        issues: [],
        status: 'valid',
        splits: {
          songwriter: this.verifySplits(song.rights.songwriter, 'Songwriter'),
          producer: this.verifySplits(song.rights.producer, 'Producer'),
          performer: this.verifySplits(song.rights.performer, 'Performer')
        },
        publisher: this.verifyPublisher(song.rights.publisher),
        label: this.verifyLabel(song.rights.label),
        licensing: this.verifyLicensing(song.licensing),
        blockchain: this.verifyBlockchain(song.blockchain)
      };
      
      // Check for issues
      if (verification.splits.songwriter.issues.length > 0) {
        verification.issues.push(...verification.splits.songwriter.issues);
      }
      if (verification.splits.producer.issues.length > 0) {
        verification.issues.push(...verification.splits.producer.issues);
      }
      if (verification.splits.performer.issues.length > 0) {
        verification.issues.push(...verification.splits.performer.issues);
      }
      
      if (verification.issues.length > 0) {
        verification.status = 'issues_found';
      }
      
      // Display results
      console.log(`\n📊 Rights Verification Report`);
      console.log('============================');
      console.log(`Song: ${verification.title}`);
      console.log(`Artist: ${verification.artist}`);
      console.log(`Status: ${verification.status === 'valid' ? '✅ Valid' : '⚠️  Issues Found'}`);
      console.log(`Verified: ${verification.verificationDate.toLocaleString()}`);
      
      console.log(`\n🎵 Songwriter Rights:`);
      verification.splits.songwriter.splits.forEach(split => {
        console.log(`   ${split.name}: ${split.share}% (${split.role})`);
      });
      console.log(`   Total: ${verification.splits.songwriter.totalShare}%`);
      
      console.log(`\n🎛️  Producer Rights:`);
      verification.splits.producer.splits.forEach(split => {
        console.log(`   ${split.name}: ${split.share}% (${split.role})`);
      });
      console.log(`   Total: ${verification.splits.producer.totalShare}%`);
      
      console.log(`\n🎤 Performer Rights:`);
      verification.splits.performer.splits.forEach(split => {
        console.log(`   ${split.name}: ${split.share}% (${split.role})`);
      });
      console.log(`   Total: ${verification.splits.performer.totalShare}%`);
      
      console.log(`\n📄 Publishing:`);
      console.log(`   Publisher: ${verification.publisher.name} (${verification.publisher.share}%)`);
      console.log(`   Contact: ${verification.publisher.contact}`);
      console.log(`   Status: ${verification.publisher.valid ? '✅ Valid' : '❌ Invalid'}`);
      
      console.log(`\n🏢 Label:`);
      console.log(`   Label: ${verification.label.name} (${verification.label.share}%)`);
      console.log(`   Contact: ${verification.label.contact}`);
      console.log(`   Status: ${verification.label.valid ? '✅ Valid' : '❌ Invalid'}`);
      
      console.log(`\n📜 Licensing:`);
      console.log(`   Sync Licensing: ${verification.licensing.syncLicensing ? '✅ Available' : '❌ Not Available'}`);
      console.log(`   Commercial Use: ${verification.licensing.commercialUse ? '✅ Allowed' : '❌ Restricted'}`);
      console.log(`   Sampling: ${verification.licensing.samplingAllowed ? '✅ Allowed' : '❌ Not Allowed'}`);
      console.log(`   Remix Rights: ${verification.licensing.remixRights}`);
      
      if (verification.blockchain.published) {
        console.log(`\n🔗 Blockchain:`);
        console.log(`   Transaction: ${verification.blockchain.txid}`);
        console.log(`   Network: ${verification.blockchain.network}`);
        console.log(`   Status: ✅ Published`);
      }
      
      if (verification.issues.length > 0) {
        console.log(`\n⚠️  Issues Found:`);
        verification.issues.forEach((issue, i) => {
          console.log(`   ${i + 1}. ${issue}`);
        });
      }
      
      return verification;
      
    } catch (error) {
      console.error('❌ Rights verification failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Generate licensing agreement
   */
  async generateLicense(songId, licenseType, licensee, terms = {}) {
    await this.initialize();
    
    try {
      const song = await CatalogService.getSongById(songId);
      if (!song) {
        throw new Error('Song not found');
      }
      
      console.log(`📜 Generating ${licenseType} license for "${song.metadata.title}"...`);
      
      const licenseId = crypto.randomUUID();
      const license = {
        licenseId,
        songId: song.songId,
        songTitle: song.metadata.title,
        artist: song.metadata.artistName,
        licenseType,
        licensee: {
          name: licensee.name || 'Unknown',
          email: licensee.email || '',
          company: licensee.company || '',
          address: licensee.address || {}
        },
        terms: {
          territory: terms.territory || 'Worldwide',
          duration: terms.duration || '1 year',
          exclusivity: terms.exclusivity || 'non-exclusive',
          usage: terms.usage || 'standard commercial use',
          fee: terms.fee || 0,
          royaltyRate: terms.royaltyRate || 0,
          paymentTerms: terms.paymentTerms || 'Net 30',
          ...terms
        },
        restrictions: this.getLicenseRestrictions(licenseType, song.licensing),
        rights: this.getLicenseRights(licenseType, song.licensing),
        status: 'pending',
        createdAt: new Date(),
        validFrom: new Date(),
        validUntil: new Date(Date.now() + (terms.durationDays || 365) * 24 * 60 * 60 * 1000),
        
        // Legal text
        legalText: this.generateLegalText(licenseType, song, licensee, terms)
      };
      
      // Store license agreement
      const { Licensing } = await import('../database/schemas.js');
      const licenseDoc = new Licensing(license);
      await licenseDoc.save();
      
      // Generate PDF if requested
      if (terms.generatePdf) {
        await this.generateLicensePdf(license);
      }
      
      console.log(`✅ ${licenseType} license generated successfully`);
      console.log(`📄 License ID: ${licenseId}`);
      console.log(`👤 Licensee: ${licensee.name}`);
      console.log(`🌍 Territory: ${license.terms.territory}`);
      console.log(`⏱️  Duration: ${license.terms.duration}`);
      console.log(`💰 Fee: ${license.terms.fee} satoshis`);
      
      return license;
      
    } catch (error) {
      console.error('❌ License generation failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Track sync license usage
   */
  async trackSyncUsage(licenseId, usage) {
    await this.initialize();
    
    try {
      const { Licensing } = await import('../database/schemas.js');
      const license = await Licensing.findOne({ licenseId });
      
      if (!license) {
        throw new Error('License not found');
      }
      
      // Add usage tracking
      if (!license.usage) license.usage = [];
      
      const usageEntry = {
        usageId: crypto.randomUUID(),
        date: new Date(),
        project: usage.project || 'Unknown Project',
        medium: usage.medium || 'digital',
        territory: usage.territory || license.terms.territory,
        duration: usage.duration || 0,
        audience: usage.audience || 0,
        revenue: usage.revenue || 0,
        description: usage.description || '',
        metadata: usage.metadata || {}
      };
      
      license.usage.push(usageEntry);
      
      // Update performance metrics
      const song = await CatalogService.getSongById(license.songId);
      if (song) {
        const updateData = {
          'performance.syncLicenses': song.performance.syncLicenses + 1,
          'performance.totalRevenue': song.performance.totalRevenue + (usage.revenue || 0),
          'performance.lastUpdated': new Date()
        };
        
        await CatalogService.updateSong(license.songId, updateData);
      }
      
      await license.save();
      
      console.log(`📊 Sync usage tracked for license ${licenseId}`);
      console.log(`🎬 Project: ${usage.project}`);
      console.log(`📺 Medium: ${usage.medium}`);
      console.log(`👥 Audience: ${usage.audience?.toLocaleString()}`);
      console.log(`💰 Revenue: ${usage.revenue} satoshis`);
      
      return usageEntry;
      
    } catch (error) {
      console.error('❌ Failed to track sync usage:', error.message);
      throw error;
    }
  }
  
  /**
   * Generate rights report for an artist or label
   */
  async generateRightsReport(artistId = null, options = {}) {
    await this.initialize();
    
    try {
      console.log('📊 Generating rights report...');
      
      // Build query
      const query = {};
      if (artistId) {
        query['metadata.artistId'] = artistId;
      }
      
      const songs = await CatalogService.searchSongs(query, { limit: 1000 });
      
      const report = {
        generatedAt: new Date(),
        artistId,
        totalSongs: songs.songs.length,
        totalRevenue: 0,
        totalStreams: 0,
        syncLicenses: 0,
        
        // Rights breakdown
        songwriterRights: {},
        producerRights: {},
        performerRights: {},
        publishingRights: {},
        
        // Licensing summary
        licensing: {
          syncAvailable: 0,
          commercialUse: 0,
          samplingAllowed: 0,
          exclusiveDeals: 0
        },
        
        // Revenue by source
        revenueStreams: {
          streaming: 0,
          sync: 0,
          mechanical: 0,
          performance: 0,
          other: 0
        },
        
        songs: []
      };
      
      // Process each song
      songs.songs.forEach(song => {
        report.totalRevenue += song.performance.totalRevenue;
        report.totalStreams += song.performance.totalStreams;
        report.syncLicenses += song.performance.syncLicenses;
        
        // Track rights holders
        song.rights.songwriter?.forEach(writer => {
          if (!report.songwriterRights[writer.name]) {
            report.songwriterRights[writer.name] = { totalShare: 0, songs: 0 };
          }
          report.songwriterRights[writer.name].totalShare += writer.share;
          report.songwriterRights[writer.name].songs += 1;
        });
        
        song.rights.producer?.forEach(producer => {
          if (!report.producerRights[producer.name]) {
            report.producerRights[producer.name] = { totalShare: 0, songs: 0 };
          }
          report.producerRights[producer.name].totalShare += producer.share;
          report.producerRights[producer.name].songs += 1;
        });
        
        // Licensing stats
        if (song.licensing.syncLicensing) report.licensing.syncAvailable++;
        if (song.licensing.commercialUse) report.licensing.commercialUse++;
        if (song.licensing.samplingAllowed) report.licensing.samplingAllowed++;
        if (song.licensing.exclusivity?.isExclusive) report.licensing.exclusiveDeals++;
        
        report.songs.push({
          songId: song.songId,
          title: song.metadata.title,
          artist: song.metadata.artistName,
          revenue: song.performance.totalRevenue,
          streams: song.performance.totalStreams,
          syncLicenses: song.performance.syncLicenses,
          releaseDate: song.metadata.releaseDate,
          status: song.status
        });
      });
      
      // Display report
      console.log('\n📊 Music Rights Report');
      console.log('======================');
      console.log(`Generated: ${report.generatedAt.toLocaleString()}`);
      console.log(`Total Songs: ${report.totalSongs}`);
      console.log(`Total Revenue: ${report.totalRevenue.toLocaleString()} satoshis`);
      console.log(`Total Streams: ${report.totalStreams.toLocaleString()}`);
      console.log(`Sync Licenses: ${report.syncLicenses}`);
      
      console.log(`\n✍️  Top Songwriters:`);
      Object.entries(report.songwriterRights)
        .sort(([,a], [,b]) => b.songs - a.songs)
        .slice(0, 10)
        .forEach(([name, data]) => {
          const avgShare = (data.totalShare / data.songs).toFixed(1);
          console.log(`   ${name}: ${data.songs} songs (avg ${avgShare}% share)`);
        });
      
      console.log(`\n🎛️  Top Producers:`);
      Object.entries(report.producerRights)
        .sort(([,a], [,b]) => b.songs - a.songs)
        .slice(0, 10)
        .forEach(([name, data]) => {
          const avgShare = (data.totalShare / data.songs).toFixed(1);
          console.log(`   ${name}: ${data.songs} songs (avg ${avgShare}% share)`);
        });
      
      console.log(`\n📜 Licensing Summary:`);
      console.log(`   Sync Licensing Available: ${report.licensing.syncAvailable} songs`);
      console.log(`   Commercial Use Allowed: ${report.licensing.commercialUse} songs`);
      console.log(`   Sampling Allowed: ${report.licensing.samplingAllowed} songs`);
      console.log(`   Exclusive Deals: ${report.licensing.exclusiveDeals} songs`);
      
      console.log(`\n🎵 Top Performing Songs:`);
      report.songs
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .forEach((song, i) => {
          console.log(`   ${i + 1}. ${song.title} - ${song.artist}`);
          console.log(`      Revenue: ${song.revenue.toLocaleString()} sats | Streams: ${song.streams.toLocaleString()}`);
        });
      
      // Save report to file if requested
      if (options.saveToFile) {
        const reportPath = path.join(__dirname, '..', 'docs', `rights-report-${Date.now()}.json`);
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n💾 Report saved to: ${reportPath}`);
      }
      
      return report;
      
    } catch (error) {
      console.error('❌ Failed to generate rights report:', error.message);
      throw error;
    }
  }
  
  /**
   * Helper methods for verification
   */
  
  verifySplits(splits, type) {
    const result = {
      type,
      splits: splits || [],
      totalShare: 0,
      issues: []
    };
    
    if (!splits || splits.length === 0) {
      result.issues.push(`No ${type.toLowerCase()} splits defined`);
      return result;
    }
    
    splits.forEach(split => {
      result.totalShare += split.share || 0;
      
      if (!split.name) {
        result.issues.push(`${type} missing name`);
      }
      
      if (!split.share || split.share <= 0) {
        result.issues.push(`${type} ${split.name} has invalid share: ${split.share}`);
      }
      
      if (!split.contact && !split.email) {
        result.issues.push(`${type} ${split.name} missing contact information`);
      }
    });
    
    if (Math.abs(result.totalShare - 100) > 0.01) {
      result.issues.push(`${type} splits total ${result.totalShare}%, should be 100%`);
    }
    
    return result;
  }
  
  verifyPublisher(publisher) {
    return {
      name: publisher?.name || 'Unknown',
      share: publisher?.share || 0,
      contact: publisher?.contact || '',
      valid: !!(publisher?.name && publisher?.share && publisher?.contact)
    };
  }
  
  verifyLabel(label) {
    return {
      name: label?.name || 'Unknown',
      share: label?.share || 0,
      contact: label?.contact || '',
      valid: !!(label?.name && label?.share && label?.contact)
    };
  }
  
  verifyLicensing(licensing) {
    return {
      syncLicensing: licensing?.syncLicensing || false,
      commercialUse: licensing?.commercialUse || false,
      samplingAllowed: licensing?.samplingAllowed || false,
      remixRights: licensing?.remixRights || 'none',
      exclusivity: licensing?.exclusivity || {}
    };
  }
  
  verifyBlockchain(blockchain) {
    return {
      published: !!(blockchain?.txid),
      txid: blockchain?.txid || null,
      network: blockchain?.network || null
    };
  }
  
  /**
   * Get license restrictions based on type and song licensing
   */
  getLicenseRestrictions(licenseType, licensing) {
    const restrictions = [];
    
    if (licenseType === 'sync') {
      if (!licensing.syncLicensing) {
        restrictions.push('Sync licensing not available for this track');
      }
      restrictions.push('Must provide usage reports within 30 days');
      restrictions.push('Cannot be used for political or controversial content without approval');
    }
    
    if (licenseType === 'commercial') {
      if (!licensing.commercialUse) {
        restrictions.push('Commercial use restricted for this track');
      }
      restrictions.push('Attribution required in all uses');
    }
    
    if (licenseType === 'sampling') {
      if (!licensing.samplingAllowed) {
        restrictions.push('Sampling not permitted for this track');
      }
      restrictions.push('Derivative works must be registered');
      restrictions.push('Original artist credit required');
    }
    
    return restrictions;
  }
  
  /**
   * Get license rights based on type
   */
  getLicenseRights(licenseType, licensing) {
    const rights = [];
    
    switch (licenseType) {
      case 'sync':
        rights.push('Synchronization with visual media');
        rights.push('Broadcast and streaming rights');
        rights.push('Digital distribution within territory');
        break;
        
      case 'commercial':
        rights.push('Commercial advertisement usage');
        rights.push('Brand association rights');
        rights.push('Multi-platform distribution');
        break;
        
      case 'mechanical':
        rights.push('Reproduction and distribution');
        rights.push('Digital mechanical rights');
        rights.push('Physical media rights');
        break;
        
      case 'performance':
        rights.push('Public performance rights');
        rights.push('Live venue performance');
        rights.push('Radio and streaming performance');
        break;
    }
    
    return rights;
  }
  
  /**
   * Generate legal license text
   */
  generateLegalText(licenseType, song, licensee, terms) {
    return `
MUSIC LICENSE AGREEMENT - ${licenseType.toUpperCase()}

This License Agreement ("Agreement") is entered into between AI Records Label ("Licensor") 
and ${licensee.name} ("Licensee") for the musical composition "${song.metadata.title}" 
performed by ${song.metadata.artistName}.

GRANT OF RIGHTS:
Subject to the terms and conditions herein, Licensor grants to Licensee a ${terms.exclusivity || 'non-exclusive'} 
license to use the above-mentioned musical composition in the territory of ${terms.territory || 'Worldwide'} 
for a period of ${terms.duration || '1 year'} from the effective date.

PERMITTED USES:
${terms.usage || 'Standard commercial usage as defined in Schedule A'}

RESTRICTIONS:
- This license does not grant ownership of the underlying composition
- Licensee must provide usage reports as specified
- Any derivative works must receive prior written approval
- Political or controversial usage requires separate approval

PAYMENT TERMS:
License Fee: ${terms.fee || 0} satoshis
Royalty Rate: ${terms.royaltyRate || 0}%
Payment Terms: ${terms.paymentTerms || 'Net 30 days'}

This agreement is governed by the laws of the jurisdiction specified in the master agreement.

License ID: ${crypto.randomUUID()}
Generated: ${new Date().toISOString()}
    `.trim();
  }
  
  /**
   * Generate license PDF (placeholder for PDF generation)
   */
  async generateLicensePdf(license) {
    // This would integrate with a PDF generation library
    console.log(`📄 PDF generation would create license document for ${license.licenseId}`);
    return license.licenseId + '.pdf';
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new RightsManager();
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'verify': {
        const songId = process.argv[3];
        if (!songId) {
          console.error('❌ Song ID required for verify command');
          console.log('Usage: npm run verify-rights <songId>');
          process.exit(1);
        }
        
        await manager.verifyRights(songId);
        process.exit(0);
        break;
      }
      
      case 'license': {
        const songId = process.argv.find(arg => arg.startsWith('--song='))?.split('=')[1];
        const type = process.argv.find(arg => arg.startsWith('--type='))?.split('=')[1];
        const licensee = process.argv.find(arg => arg.startsWith('--licensee='))?.split('=')[1];
        
        if (!songId || !type || !licensee) {
          console.error('❌ Required parameters: --song, --type, --licensee');
          console.log('Usage: npm run verify-rights license --song=<songId> --type=sync --licensee="Company Name"');
          process.exit(1);
        }
        
        const terms = {
          territory: process.argv.find(arg => arg.startsWith('--territory='))?.split('=')[1] || 'Worldwide',
          duration: process.argv.find(arg => arg.startsWith('--duration='))?.split('=')[1] || '1 year',
          fee: parseInt(process.argv.find(arg => arg.startsWith('--fee='))?.split('=')[1] || '0')
        };
        
        await manager.generateLicense(songId, type, { name: licensee }, terms);
        process.exit(0);
        break;
      }
      
      case 'report': {
        const artistId = process.argv.find(arg => arg.startsWith('--artist='))?.split('=')[1];
        const saveFile = process.argv.includes('--save');
        
        await manager.generateRightsReport(artistId, { saveToFile: saveFile });
        process.exit(0);
        break;
      }
      
      case 'usage': {
        const licenseId = process.argv.find(arg => arg.startsWith('--license='))?.split('=')[1];
        const project = process.argv.find(arg => arg.startsWith('--project='))?.split('=')[1];
        
        if (!licenseId || !project) {
          console.error('❌ Required parameters: --license, --project');
          console.log('Usage: npm run verify-rights usage --license=<licenseId> --project="Movie Title"');
          process.exit(1);
        }
        
        const usage = {
          project,
          medium: process.argv.find(arg => arg.startsWith('--medium='))?.split('=')[1] || 'digital',
          audience: parseInt(process.argv.find(arg => arg.startsWith('--audience='))?.split('=')[1] || '0'),
          revenue: parseInt(process.argv.find(arg => arg.startsWith('--revenue='))?.split('=')[1] || '0')
        };
        
        await manager.trackSyncUsage(licenseId, usage);
        process.exit(0);
        break;
      }
      
      default: {
        console.log('⚖️  Rights Management System');
        console.log('============================');
        console.log('Available commands:');
        console.log('  verify <songId>');
        console.log('  license --song=<songId> --type=<sync|commercial|mechanical> --licensee="Name" [--territory=Worldwide] [--fee=0]');
        console.log('  report [--artist=<artistId>] [--save]');
        console.log('  usage --license=<licenseId> --project="Name" [--medium=digital] [--audience=0] [--revenue=0]');
        console.log('');
        console.log('Examples:');
        console.log('  npm run verify-rights verify song-uuid-here');
        console.log('  npm run verify-rights license --song="song-123" --type=sync --licensee="Netflix" --fee=100000');
        console.log('  npm run verify-rights report --artist="artist-123" --save');
        console.log('  npm run verify-rights usage --license="lic-123" --project="Commercial Campaign"');
        process.exit(0);
      }
    }
  } catch (error) {
    console.error('❌ Command failed:', error.message);
    process.exit(1);
  }
}

export default RightsManager;