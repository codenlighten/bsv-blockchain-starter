#!/usr/bin/env node

/**
 * Revenue Distribution System
 * 
 * Handles streaming royalties, revenue tracking, and automated payments:
 * - Streaming revenue calculation and distribution
 * - Automated royalty payments to rights holders
 * - Performance tracking and analytics
 * - Multi-platform revenue aggregation
 * - Smart contract integration for payments
 */

import { CatalogService, ArtistService, AuditService } from '../database/services.js';
import { connectDatabase } from '../database/schemas.js';
import { publishData } from './publishMongo.js';
import { createAgentKeys } from '../scripts/signature.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Revenue Distribution Manager Class
 */
export class RevenueManager {
  
  constructor() {
    this.initialized = false;
    
    // Platform revenue rates (satoshis per stream)
    this.platformRates = {
      spotify: 4.2, // ~$0.004 per stream
      appleMusic: 7.8, // ~$0.007 per stream
      youtube: 1.2, // ~$0.001 per stream
      amazonMusic: 4.8, // ~$0.004 per stream
      tidal: 12.5, // ~$0.01 per stream
      deezer: 6.4, // ~$0.006 per stream
      other: 3.0 // Default for other platforms
    };
    
    // Revenue split categories
    this.revenueCategories = {
      streaming: 0.70,    // 70% from streaming
      sync: 0.15,         // 15% from sync licensing
      mechanical: 0.10,   // 10% from mechanical rights
      performance: 0.05   // 5% from performance rights
    };
  }
  
  async initialize() {
    if (!this.initialized) {
      await connectDatabase();
      this.initialized = true;
      console.log('💰 Revenue Distribution System initialized');
    }
  }
  
  /**
   * Calculate revenue for streaming data
   */
  async calculateStreamingRevenue(streamingData, songId = null) {
    await this.initialize();
    
    try {
      console.log('💰 Calculating streaming revenue...');
      
      let totalRevenue = 0;
      const platformBreakdown = {};
      
      // Calculate revenue per platform
      Object.entries(streamingData).forEach(([platform, streams]) => {
        const rate = this.platformRates[platform] || this.platformRates.other;
        const revenue = streams * rate;
        
        platformBreakdown[platform] = {
          streams,
          rate,
          revenue: Math.round(revenue)
        };
        
        totalRevenue += revenue;
      });
      
      totalRevenue = Math.round(totalRevenue);
      
      // If songId provided, update the song's performance data
      if (songId) {
        const updateData = {
          'performance.platformStreams': streamingData,
          'performance.totalStreams': Object.values(streamingData).reduce((sum, streams) => sum + streams, 0),
          'performance.totalRevenue': totalRevenue,
          'performance.lastUpdated': new Date()
        };
        
        await CatalogService.updateSong(songId, updateData, {
          userId: 'revenue-system',
          role: 'system'
        });
      }
      
      console.log(`💵 Total streaming revenue: ${totalRevenue.toLocaleString()} satoshis`);
      console.log(`📊 Platform breakdown:`);
      Object.entries(platformBreakdown).forEach(([platform, data]) => {
        console.log(`   ${platform}: ${data.streams.toLocaleString()} streams × ${data.rate} sats = ${data.revenue.toLocaleString()} sats`);
      });
      
      return {
        totalRevenue,
        platformBreakdown,
        timestamp: new Date()
      };
      
    } catch (error) {
      console.error('❌ Failed to calculate streaming revenue:', error.message);
      throw error;
    }
  }
  
  /**
   * Distribute revenue to rights holders
   */
  async distributeRevenue(songId, totalRevenue, distributionType = 'streaming', options = {}) {
    await this.initialize();
    
    try {
      const song = await CatalogService.getSongById(songId);
      if (!song) {
        throw new Error('Song not found');
      }
      
      console.log(`💰 Distributing ${totalRevenue.toLocaleString()} satoshis for "${song.metadata.title}"`);
      console.log(`📋 Distribution type: ${distributionType}`);
      
      const distributions = [];
      const distributionId = crypto.randomUUID();
      
      // Calculate splits based on revenue type
      const revenueMultiplier = this.revenueCategories[distributionType] || 1.0;
      const netRevenue = Math.round(totalRevenue * revenueMultiplier);
      
      console.log(`💡 Revenue multiplier: ${revenueMultiplier} (${(revenueMultiplier * 100)}%)`);
      console.log(`💰 Net revenue for distribution: ${netRevenue.toLocaleString()} satoshis`);
      
      // Songwriter distributions (typically 50% of publishing)
      if (song.rights.songwriter && song.rights.songwriter.length > 0) {
        const songwriterShare = 0.25; // 25% of total (50% of publishing)
        const songwriterRevenue = Math.round(netRevenue * songwriterShare);
        
        song.rights.songwriter.forEach(writer => {
          const writerAmount = Math.round((songwriterRevenue * writer.share) / 100);
          
          distributions.push({
            distributionId,
            recipientType: 'songwriter',
            recipientName: writer.name,
            recipientContact: writer.contact,
            role: writer.role,
            sharePercentage: writer.share,
            amount: writerAmount,
            currency: 'BSV',
            status: 'calculated'
          });
        });
      }
      
      // Producer distributions (typically 15% of total)
      if (song.rights.producer && song.rights.producer.length > 0) {
        const producerShare = 0.15;
        const producerRevenue = Math.round(netRevenue * producerShare);
        
        song.rights.producer.forEach(producer => {
          const producerAmount = Math.round((producerRevenue * producer.share) / 100);
          
          distributions.push({
            distributionId,
            recipientType: 'producer',
            recipientName: producer.name,
            recipientContact: producer.contact,
            role: producer.role,
            sharePercentage: producer.share,
            amount: producerAmount,
            currency: 'BSV',
            status: 'calculated'
          });
        });
      }
      
      // Performer distributions (typically 35% of total)
      if (song.rights.performer && song.rights.performer.length > 0) {
        const performerShare = 0.35;
        const performerRevenue = Math.round(netRevenue * performerShare);
        
        song.rights.performer.forEach(performer => {
          const performerAmount = Math.round((performerRevenue * performer.share) / 100);
          
          distributions.push({
            distributionId,
            recipientType: 'performer',
            recipientName: performer.name,
            recipientContact: performer.contact,
            role: performer.role,
            sharePercentage: performer.share,
            amount: performerAmount,
            currency: 'BSV',
            isAI: performer.isAI,
            status: 'calculated'
          });
        });
      }
      
      // Publisher distribution (typically 25% of total)
      if (song.rights.publisher) {
        const publisherShare = 0.25;
        const publisherAmount = Math.round(netRevenue * publisherShare);
        
        distributions.push({
          distributionId,
          recipientType: 'publisher',
          recipientName: song.rights.publisher.name,
          recipientContact: song.rights.publisher.contact,
          role: 'publisher',
          sharePercentage: song.rights.publisher.share,
          amount: publisherAmount,
          currency: 'BSV',
          status: 'calculated'
        });
      }
      
      // Label distribution (remainder after other splits)
      if (song.rights.label) {
        const otherShares = distributions.reduce((sum, dist) => sum + dist.amount, 0);
        const labelAmount = netRevenue - otherShares;
        
        distributions.push({
          distributionId,
          recipientType: 'label',
          recipientName: song.rights.label.name,
          recipientContact: song.rights.label.contact,
          role: 'label',
          sharePercentage: 100, // Label gets remainder
          amount: labelAmount,
          currency: 'BSV',
          status: 'calculated'
        });
      }
      
      // Store distribution record
      const { RevenueDistribution } = await import('../database/schemas.js');
      
      const distributionRecord = new RevenueDistribution({
        distributionId,
        songId: song.songId,
        songTitle: song.metadata.title,
        artist: song.metadata.artistName,
        distributionType,
        totalRevenue,
        netRevenue,
        revenueMultiplier,
        distributions,
        status: 'calculated',
        calculatedAt: new Date(),
        metadata: {
          platformData: options.platformData || {},
          period: options.period || 'current',
          batchId: options.batchId
        }
      });
      
      await distributionRecord.save();
      
      // Display distribution breakdown
      console.log(`\n📊 Revenue Distribution Summary`);
      console.log('==============================');
      console.log(`Distribution ID: ${distributionId}`);
      console.log(`Song: ${song.metadata.title}`);
      console.log(`Total Revenue: ${totalRevenue.toLocaleString()} sats`);
      console.log(`Net Revenue: ${netRevenue.toLocaleString()} sats`);
      console.log('');
      
      const typeGroups = {};
      distributions.forEach(dist => {
        if (!typeGroups[dist.recipientType]) {
          typeGroups[dist.recipientType] = [];
        }
        typeGroups[dist.recipientType].push(dist);
      });
      
      Object.entries(typeGroups).forEach(([type, dists]) => {
        const typeTotal = dists.reduce((sum, d) => sum + d.amount, 0);
        const typePercent = ((typeTotal / netRevenue) * 100).toFixed(1);
        
        console.log(`${type.toUpperCase()}: ${typeTotal.toLocaleString()} sats (${typePercent}%)`);
        dists.forEach(dist => {
          console.log(`   ${dist.recipientName}: ${dist.amount.toLocaleString()} sats (${dist.sharePercentage}%)`);
        });
        console.log('');
      });
      
      // Auto-distribute if enabled
      if (options.autoDistribute) {
        await this.processPayments(distributionId, options);
      }
      
      return {
        distributionId,
        distributions,
        totalRevenue,
        netRevenue
      };
      
    } catch (error) {
      console.error('❌ Failed to distribute revenue:', error.message);
      throw error;
    }
  }
  
  /**
   * Process payments for a distribution
   */
  async processPayments(distributionId, options = {}) {
    await this.initialize();
    
    try {
      const { RevenueDistribution } = await import('../database/schemas.js');
      const distribution = await RevenueDistribution.findOne({ distributionId });
      
      if (!distribution) {
        throw new Error('Distribution not found');
      }
      
      console.log(`💸 Processing payments for distribution ${distributionId}`);
      
      const payments = [];
      
      for (const dist of distribution.distributions) {
        // Skip AI performers or entities without payment addresses
        if (dist.isAI && options.skipAI !== false) {
          console.log(`⚠️  Skipping payment to AI performer: ${dist.recipientName}`);
          continue;
        }
        
        if (dist.amount < (options.minimumPayment || 1000)) {
          console.log(`⚠️  Skipping payment below minimum: ${dist.recipientName} (${dist.amount} sats)`);
          continue;
        }
        
        try {
          // In a real implementation, this would integrate with a payment processor
          // For now, we'll create payment records
          
          const paymentId = crypto.randomUUID();
          const payment = {
            paymentId,
            distributionId,
            recipientName: dist.recipientName,
            recipientContact: dist.recipientContact,
            recipientType: dist.recipientType,
            amount: dist.amount,
            currency: 'BSV',
            status: options.dryRun ? 'simulated' : 'pending',
            createdAt: new Date(),
            
            // Blockchain payment details (would be filled by payment processor)
            blockchain: {
              network: 'BSV-mainnet',
              fromAddress: process.env.LABEL_WALLET_ADDRESS,
              toAddress: this.getPaymentAddress(dist.recipientContact),
              txid: null, // Would be filled after broadcast
              fee: 0
            }
          };
          
          payments.push(payment);
          
          if (options.dryRun) {
            console.log(`💭 Simulated payment: ${dist.recipientName} - ${dist.amount.toLocaleString()} sats`);
          } else {
            console.log(`💸 Initiated payment: ${dist.recipientName} - ${dist.amount.toLocaleString()} sats`);
            // Here would be the actual blockchain transaction
          }
          
        } catch (paymentError) {
          console.error(`❌ Payment failed for ${dist.recipientName}:`, paymentError.message);
          
          payments.push({
            paymentId: crypto.randomUUID(),
            distributionId,
            recipientName: dist.recipientName,
            amount: dist.amount,
            status: 'failed',
            error: paymentError.message,
            createdAt: new Date()
          });
        }
      }
      
      // Update distribution with payment information
      distribution.payments = payments;
      distribution.status = options.dryRun ? 'simulated' : 'processing';
      distribution.processedAt = new Date();
      
      await distribution.save();
      
      const successful = payments.filter(p => ['pending', 'simulated'].includes(p.status));
      const failed = payments.filter(p => p.status === 'failed');
      
      console.log(`\n📊 Payment Processing Summary`);
      console.log('============================');
      console.log(`Total Payments: ${payments.length}`);
      console.log(`Successful: ${successful.length}`);
      console.log(`Failed: ${failed.length}`);
      console.log(`Mode: ${options.dryRun ? 'Simulation' : 'Live'}`);
      
      return {
        distributionId,
        payments,
        summary: {
          total: payments.length,
          successful: successful.length,
          failed: failed.length,
          totalAmount: successful.reduce((sum, p) => sum + p.amount, 0)
        }
      };
      
    } catch (error) {
      console.error('❌ Failed to process payments:', error.message);
      throw error;
    }
  }
  
  /**
   * Generate revenue report for artist or label
   */
  async generateRevenueReport(artistId = null, period = 'monthly', options = {}) {
    await this.initialize();
    
    try {
      console.log('📊 Generating revenue report...');
      
      const now = new Date();
      let startDate, endDate;
      
      // Calculate date range based on period
      switch (period) {
        case 'weekly':
          startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
          endDate = now;
          break;
        case 'monthly':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          break;
        case 'quarterly':
          const quarter = Math.floor(now.getMonth() / 3);
          startDate = new Date(now.getFullYear(), quarter * 3, 1);
          endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
          break;
        case 'yearly':
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = new Date(now.getFullYear(), 11, 31);
          break;
        default:
          startDate = options.startDate || new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
          endDate = options.endDate || now;
      }
      
      // Build query
      const query = {
        'performance.lastUpdated': {
          $gte: startDate,
          $lte: endDate
        }
      };
      
      if (artistId) {
        query['metadata.artistId'] = artistId;
      }
      
      const songs = await CatalogService.searchSongs(query, { limit: 1000 });
      
      const report = {
        period: period,
        startDate,
        endDate,
        artistId,
        generatedAt: new Date(),
        
        summary: {
          totalSongs: songs.songs.length,
          totalStreams: 0,
          totalRevenue: 0,
          averageRevenuePerStream: 0,
          topPlatform: null
        },
        
        platformAnalytics: {},
        songPerformance: [],
        revenueBreakdown: {
          streaming: 0,
          sync: 0,
          mechanical: 0,
          performance: 0
        },
        
        projections: {
          nextMonth: 0,
          nextQuarter: 0,
          yearEnd: 0
        }
      };
      
      // Process each song
      songs.songs.forEach(song => {
        report.summary.totalStreams += song.performance.totalStreams;
        report.summary.totalRevenue += song.performance.totalRevenue;
        
        // Platform analytics
        Object.entries(song.performance.platformStreams).forEach(([platform, streams]) => {
          if (!report.platformAnalytics[platform]) {
            report.platformAnalytics[platform] = {
              streams: 0,
              revenue: 0,
              songs: 0
            };
          }
          
          const revenue = streams * (this.platformRates[platform] || this.platformRates.other);
          
          report.platformAnalytics[platform].streams += streams;
          report.platformAnalytics[platform].revenue += revenue;
          report.platformAnalytics[platform].songs += 1;
        });
        
        // Song performance
        report.songPerformance.push({
          songId: song.songId,
          title: song.metadata.title,
          artist: song.metadata.artistName,
          streams: song.performance.totalStreams,
          revenue: song.performance.totalRevenue,
          revenuePerStream: song.performance.totalStreams > 0 
            ? (song.performance.totalRevenue / song.performance.totalStreams).toFixed(4)
            : 0,
          syncLicenses: song.performance.syncLicenses
        });
      });
      
      // Calculate averages and find top platform
      if (report.summary.totalStreams > 0) {
        report.summary.averageRevenuePerStream = 
          (report.summary.totalRevenue / report.summary.totalStreams).toFixed(4);
      }
      
      const platforms = Object.entries(report.platformAnalytics);
      if (platforms.length > 0) {
        platforms.sort(([,a], [,b]) => b.revenue - a.revenue);
        report.summary.topPlatform = {
          name: platforms[0][0],
          revenue: platforms[0][1].revenue,
          streams: platforms[0][1].streams
        };
      }
      
      // Calculate revenue breakdown (simulated categories)
      report.revenueBreakdown.streaming = Math.round(report.summary.totalRevenue * 0.70);
      report.revenueBreakdown.sync = Math.round(report.summary.totalRevenue * 0.15);
      report.revenueBreakdown.mechanical = Math.round(report.summary.totalRevenue * 0.10);
      report.revenueBreakdown.performance = Math.round(report.summary.totalRevenue * 0.05);
      
      // Simple projections based on current trends
      const daysInPeriod = (endDate - startDate) / (24 * 60 * 60 * 1000);
      const dailyRevenue = report.summary.totalRevenue / daysInPeriod;
      
      report.projections.nextMonth = Math.round(dailyRevenue * 30);
      report.projections.nextQuarter = Math.round(dailyRevenue * 90);
      report.projections.yearEnd = Math.round(dailyRevenue * 365);
      
      // Sort song performance by revenue
      report.songPerformance.sort((a, b) => b.revenue - a.revenue);
      
      // Display report
      console.log(`\n📊 Revenue Report - ${period.toUpperCase()}`);
      console.log('='.repeat(50));
      console.log(`Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`);
      console.log(`Generated: ${report.generatedAt.toLocaleString()}`);
      
      console.log(`\n💰 Summary:`);
      console.log(`   Total Songs: ${report.summary.totalSongs}`);
      console.log(`   Total Streams: ${report.summary.totalStreams.toLocaleString()}`);
      console.log(`   Total Revenue: ${report.summary.totalRevenue.toLocaleString()} sats`);
      console.log(`   Avg Revenue/Stream: ${report.summary.averageRevenuePerStream} sats`);
      
      if (report.summary.topPlatform) {
        console.log(`   Top Platform: ${report.summary.topPlatform.name} (${report.summary.topPlatform.revenue.toLocaleString()} sats)`);
      }
      
      console.log(`\n🎵 Platform Performance:`);
      platforms.slice(0, 5).forEach(([platform, data]) => {
        console.log(`   ${platform}: ${data.streams.toLocaleString()} streams → ${data.revenue.toLocaleString()} sats`);
      });
      
      console.log(`\n📈 Revenue Breakdown:`);
      console.log(`   Streaming: ${report.revenueBreakdown.streaming.toLocaleString()} sats (70%)`);
      console.log(`   Sync Licensing: ${report.revenueBreakdown.sync.toLocaleString()} sats (15%)`);
      console.log(`   Mechanical: ${report.revenueBreakdown.mechanical.toLocaleString()} sats (10%)`);
      console.log(`   Performance: ${report.revenueBreakdown.performance.toLocaleString()} sats (5%)`);
      
      console.log(`\n🔮 Projections:`);
      console.log(`   Next Month: ${report.projections.nextMonth.toLocaleString()} sats`);
      console.log(`   Next Quarter: ${report.projections.nextQuarter.toLocaleString()} sats`);
      console.log(`   Year End: ${report.projections.yearEnd.toLocaleString()} sats`);
      
      console.log(`\n🏆 Top Performing Songs:`);
      report.songPerformance.slice(0, 10).forEach((song, i) => {
        console.log(`   ${i + 1}. ${song.title} - ${song.artist}`);
        console.log(`      ${song.streams.toLocaleString()} streams → ${song.revenue.toLocaleString()} sats`);
      });
      
      // Save report if requested
      if (options.saveToFile) {
        const reportPath = path.join(__dirname, '..', 'docs', `revenue-report-${Date.now()}.json`);
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n💾 Report saved to: ${reportPath}`);
      }
      
      return report;
      
    } catch (error) {
      console.error('❌ Failed to generate revenue report:', error.message);
      throw error;
    }
  }
  
  /**
   * Helper method to get payment address for recipient
   */
  getPaymentAddress(contact) {
    // In a real implementation, this would look up the recipient's wallet address
    // For now, return a placeholder
    return process.env.DEFAULT_PAYMENT_ADDRESS || '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  }
  
  /**
   * Batch process streaming data updates
   */
  async batchUpdateStreaming(updates, options = {}) {
    await this.initialize();
    
    try {
      console.log(`📊 Processing ${updates.length} streaming updates...`);
      
      const results = [];
      
      for (const update of updates) {
        try {
          const { songId, platformStreams, period } = update;
          
          // Calculate revenue for this update
          const revenueCalc = await this.calculateStreamingRevenue(platformStreams, songId);
          
          // Distribute revenue if enabled
          if (options.autoDistribute) {
            const distribution = await this.distributeRevenue(
              songId, 
              revenueCalc.totalRevenue, 
              'streaming',
              { 
                platformData: revenueCalc.platformBreakdown,
                period: period,
                batchId: options.batchId,
                autoDistribute: true,
                dryRun: options.dryRun
              }
            );
            
            results.push({
              songId,
              revenue: revenueCalc.totalRevenue,
              distributionId: distribution.distributionId,
              status: 'distributed'
            });
          } else {
            results.push({
              songId,
              revenue: revenueCalc.totalRevenue,
              status: 'calculated'
            });
          }
          
        } catch (updateError) {
          console.error(`❌ Failed to process update for song ${update.songId}:`, updateError.message);
          results.push({
            songId: update.songId,
            status: 'error',
            error: updateError.message
          });
        }
      }
      
      const successful = results.filter(r => r.status !== 'error');
      const failed = results.filter(r => r.status === 'error');
      const totalRevenue = successful.reduce((sum, r) => sum + (r.revenue || 0), 0);
      
      console.log(`\n📊 Batch Processing Summary`);
      console.log('==========================');
      console.log(`Total Updates: ${updates.length}`);
      console.log(`Successful: ${successful.length}`);
      console.log(`Failed: ${failed.length}`);
      console.log(`Total Revenue: ${totalRevenue.toLocaleString()} sats`);
      console.log(`Auto-Distribute: ${options.autoDistribute ? 'Yes' : 'No'}`);
      
      return {
        batchId: options.batchId || crypto.randomUUID(),
        results,
        summary: {
          total: updates.length,
          successful: successful.length,
          failed: failed.length,
          totalRevenue
        }
      };
      
    } catch (error) {
      console.error('❌ Batch processing failed:', error.message);
      throw error;
    }
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new RevenueManager();
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'calculate': {
        const songId = process.argv.find(arg => arg.startsWith('--song='))?.split('=')[1];
        const spotify = parseInt(process.argv.find(arg => arg.startsWith('--spotify='))?.split('=')[1] || '0');
        const appleMusic = parseInt(process.argv.find(arg => arg.startsWith('--apple='))?.split('=')[1] || '0');
        const youtube = parseInt(process.argv.find(arg => arg.startsWith('--youtube='))?.split('=')[1] || '0');
        
        if (!songId) {
          console.error('❌ Song ID required for calculate command');
          console.log('Usage: npm run calculate-revenue --song=<songId> --spotify=1000 --apple=500 --youtube=2000');
          process.exit(1);
        }
        
        const streamingData = { spotify, appleMusic, youtube };
        await manager.calculateStreamingRevenue(streamingData, songId);
        process.exit(0);
        break;
      }
      
      case 'distribute': {
        const songId = process.argv.find(arg => arg.startsWith('--song='))?.split('=')[1];
        const revenue = parseInt(process.argv.find(arg => arg.startsWith('--revenue='))?.split('=')[1]);
        const type = process.argv.find(arg => arg.startsWith('--type='))?.split('=')[1] || 'streaming';
        const autoPayments = process.argv.includes('--auto-pay');
        const dryRun = process.argv.includes('--dry-run');
        
        if (!songId || !revenue) {
          console.error('❌ Required parameters: --song, --revenue');
          console.log('Usage: npm run distribute-payments --song=<songId> --revenue=10000 [--type=streaming] [--auto-pay] [--dry-run]');
          process.exit(1);
        }
        
        await manager.distributeRevenue(songId, revenue, type, {
          autoDistribute: autoPayments,
          dryRun: dryRun
        });
        process.exit(0);
        break;
      }
      
      case 'report': {
        const artistId = process.argv.find(arg => arg.startsWith('--artist='))?.split('=')[1];
        const period = process.argv.find(arg => arg.startsWith('--period='))?.split('=')[1] || 'monthly';
        const save = process.argv.includes('--save');
        
        await manager.generateRevenueReport(artistId, period, { saveToFile: save });
        process.exit(0);
        break;
      }
      
      case 'batch': {
        const file = process.argv.find(arg => arg.startsWith('--file='))?.split('=')[1];
        const autoDistribute = process.argv.includes('--auto-distribute');
        const dryRun = process.argv.includes('--dry-run');
        
        if (!file) {
          console.error('❌ Batch file required');
          console.log('Usage: npm run calculate-revenue batch --file=streaming-data.json [--auto-distribute] [--dry-run]');
          process.exit(1);
        }
        
        const batchData = JSON.parse(await fs.readFile(file, 'utf-8'));
        await manager.batchUpdateStreaming(batchData, {
          autoDistribute,
          dryRun,
          batchId: crypto.randomUUID()
        });
        process.exit(0);
        break;
      }
      
      default: {
        console.log('💰 Revenue Distribution System');
        console.log('=============================');
        console.log('Available commands:');
        console.log('  calculate --song=<songId> --spotify=<streams> --apple=<streams> --youtube=<streams>');
        console.log('  distribute --song=<songId> --revenue=<amount> [--type=streaming] [--auto-pay] [--dry-run]');
        console.log('  report [--artist=<artistId>] [--period=weekly|monthly|quarterly] [--save]');
        console.log('  batch --file=<jsonFile> [--auto-distribute] [--dry-run]');
        console.log('');
        console.log('Examples:');
        console.log('  npm run calculate-revenue calculate --song="song-123" --spotify=10000 --apple=5000');
        console.log('  npm run distribute-payments --song="song-123" --revenue=50000 --auto-pay');
        console.log('  npm run calculate-revenue report --artist="artist-123" --period=monthly --save');
        console.log('  npm run calculate-revenue batch --file="monthly-streaming.json" --auto-distribute');
        process.exit(0);
      }
    }
  } catch (error) {
    console.error('❌ Command failed:', error.message);
    process.exit(1);
  }
}

export default RevenueManager;