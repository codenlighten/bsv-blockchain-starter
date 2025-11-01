#!/usr/bin/env node

/**
 * Music Catalog Management System
 * 
 * Handles song uploads, metadata management, blockchain publishing, and catalog operations:
 * - Audio file processing and storage
 * - Metadata extraction and management
 * - Blockchain publishing with rights protection
 * - Distribution tracking and analytics
 * - Integration with streaming platforms
 */

import { CatalogService, ArtistService, AuditService } from '../database/services.js';
import { connectDatabase } from '../database/schemas.js';
import { publishData } from './publishMongo.js';
import spacesOps from '../spaces.js';
import { createAgentKeys } from '../scripts/signature.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// For music metadata extraction
let musicMetadata;
try {
  musicMetadata = await import('music-metadata');
} catch (error) {
  console.warn('⚠️  music-metadata not installed. Some features will be limited.');
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Music Catalog Manager Class
 */
export class MusicCatalogManager {
  
  constructor() {
    this.initialized = false;
  }
  
  async initialize() {
    if (!this.initialized) {
      await connectDatabase();
      this.initialized = true;
      console.log('🎵 Music Catalog Manager initialized');
    }
  }
  
  /**
   * Process and extract metadata from audio file
   */
  async extractAudioMetadata(filePath) {
    if (!musicMetadata) {
      console.warn('⚠️  Music metadata extraction not available');
      return {
        duration: 0,
        format: path.extname(filePath).substring(1),
        bitrate: 0,
        sampleRate: 44100,
        channels: 2
      };
    }
    
    try {
      const metadata = await musicMetadata.parseFile(filePath);
      
      return {
        duration: Math.round(metadata.format.duration || 0),
        format: metadata.format.container || path.extname(filePath).substring(1),
        bitrate: metadata.format.bitrate || 0,
        sampleRate: metadata.format.sampleRate || 44100,
        channels: metadata.format.numberOfChannels || 2,
        codec: metadata.format.codec,
        
        // Extract embedded metadata if available
        title: metadata.common.title,
        artist: metadata.common.artist,
        album: metadata.common.album,
        genre: metadata.common.genre?.[0],
        year: metadata.common.year,
        track: metadata.common.track?.no,
        bpm: metadata.common.bpm,
        key: metadata.common.key,
        
        // Technical info
        lossless: metadata.format.lossless || false,
        trackGain: metadata.common.replaygain_track_gain?.dB,
        albumGain: metadata.common.replaygain_album_gain?.dB
      };
    } catch (error) {
      console.warn(`⚠️  Failed to extract metadata from ${filePath}:`, error.message);
      return {
        duration: 0,
        format: path.extname(filePath).substring(1),
        bitrate: 0,
        sampleRate: 44100,
        channels: 2
      };
    }
  }
  
  /**
   * Upload audio file to CDN storage
   */
  async uploadAudioFile(filePath, metadata) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const fileName = path.basename(filePath);
      const mimeType = this.getMimeTypeFromExtension(path.extname(filePath));
      
      const uploadResult = await spacesOps.uploadMusicFile(
        fileBuffer,
        fileName,
        mimeType,
        {
          type: metadata.type || 'master',
          artistId: metadata.artistId,
          songId: metadata.songId,
          albumId: metadata.albumId
        }
      );
      
      console.log(`📁 Uploaded ${metadata.type || 'audio'} file: ${fileName}`);
      
      return uploadResult;
      
    } catch (error) {
      console.error(`❌ Failed to upload audio file: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create new song entry with audio file
   */
  async createSong(songData, audioFilePath, actorInfo = {}) {
    await this.initialize();
    
    try {
      console.log('🎵 Processing new song upload...');
      
      // Verify artist exists
      const artist = await ArtistService.getArtistById(songData.metadata.artistId);
      if (!artist) {
        throw new Error(`Artist not found: ${songData.metadata.artistId}`);
      }
      
      console.log(`🎤 Artist: ${artist.identity.stageName}`);
      
      // Extract audio metadata
      console.log('🔍 Extracting audio metadata...');
      const audioMetadata = await this.extractAudioMetadata(audioFilePath);
      
      // Upload master audio file
      console.log('📁 Uploading master audio file...');
      const uploadResult = await this.uploadAudioFile(audioFilePath, {
        type: 'master',
        artistId: songData.metadata.artistId,
        songId: crypto.randomUUID() // Temporary ID for upload
      });
      
      // Calculate file checksum
      const fileBuffer = await fs.readFile(audioFilePath);
      const fileChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      
      // Merge extracted metadata with provided data
      const enhancedSongData = {
        metadata: {
          ...songData.metadata,
          artistName: artist.identity.stageName,
          duration: audioMetadata.duration || songData.metadata.duration,
          tempo: audioMetadata.bpm || songData.metadata.tempo,
          key: audioMetadata.key || songData.metadata.key,
          
          // Use extracted metadata as fallbacks
          title: songData.metadata.title || audioMetadata.title || 'Untitled',
          genre: songData.metadata.genre || audioMetadata.genre || artist.identity.genre[0],
          
          // Technical metadata
          releaseDate: songData.metadata.releaseDate || new Date(),
          language: songData.metadata.language || artist.identity.language,
          isExplicit: songData.metadata.isExplicit || false,
        },
        
        audioAssets: {
          masterFile: {
            path: uploadResult.path,
            format: audioMetadata.format,
            sampleRate: audioMetadata.sampleRate,
            bitDepth: 24, // Assume high quality
            fileSize: uploadResult.size,
            checksum: fileChecksum
          },
          stems: [],
          mixVersions: [],
          artwork: {}
        },
        
        lyrics: songData.lyrics || {
          hasLyrics: false,
          content: '',
          structure: [],
          language: songData.metadata?.language || 'en',
          writers: songData.rights?.songwriter?.map(s => s.name) || [],
          publishers: []
        },
        
        rights: songData.rights || {
          songwriter: [{ 
            name: 'AI Records Label', 
            share: 100, 
            role: 'composer',
            contact: 'rights@airecords.com'
          }],
          producer: [{ 
            name: 'AI Records Production', 
            share: 100, 
            role: 'producer',
            contact: 'production@airecords.com'
          }],
          performer: [{ 
            name: artist.identity.stageName, 
            share: 100, 
            role: 'lead vocals',
            isAI: true
          }],
          publisher: { 
            name: 'AI Records Publishing', 
            share: 100,
            contact: 'publishing@airecords.com'
          },
          label: { 
            name: 'AI Records Label', 
            share: 100,
            contact: 'label@airecords.com'
          }
        },
        
        licensing: songData.licensing || {
          syncLicensing: true,
          samplingAllowed: false,
          remixRights: 'contact-label',
          commercialUse: true,
          exclusivity: {
            isExclusive: false,
            exclusiveUntil: null,
            exclusiveTerritory: null
          },
          publishingRights: {
            mechanicalRights: true,
            performanceRights: true,
            synchronizationRights: true,
            printRights: true
          }
        },
        
        performance: {
          totalStreams: 0,
          totalDownloads: 0,
          totalRevenue: 0,
          syncLicenses: 0,
          platformStreams: {
            spotify: 0,
            appleMusic: 0,
            youtube: 0,
            amazonMusic: 0,
            other: 0
          },
          lastUpdated: new Date()
        },
        
        status: 'mastered',
        
        distribution: {
          platforms: [],
          distributionDate: null,
          distributor: null
        }
      };
      
      // Create song in database
      console.log('💾 Creating song database entry...');
      const song = await CatalogService.createSong(enhancedSongData, actorInfo);
      
      // Update artist song count
      await ArtistService.updatePerformanceMetrics(
        songData.metadata.artistId,
        { 
          songsReleased: artist.performance.songsReleased + 1,
          lastReleaseDate: new Date()
        },
        actorInfo
      );
      
      console.log(`✅ Song created successfully: ${song.metadata.title}`);
      console.log(`🆔 Song ID: ${song.songId}`);
      console.log(`⏱️  Duration: ${Math.floor(song.metadata.duration / 60)}:${(song.metadata.duration % 60).toString().padStart(2, '0')}`);
      console.log(`🎵 Genre: ${song.metadata.genre}`);
      console.log(`📁 Master file: ${song.audioAssets.masterFile.path}`);
      
      return song;
      
    } catch (error) {
      console.error('❌ Failed to create song:', error.message);
      throw error;
    }
  }
  
  /**
   * Publish song to blockchain
   */
  async publishSongToBlockchain(songId, actorInfo = {}) {
    await this.initialize();
    
    try {
      const song = await CatalogService.getSongById(songId);
      if (!song) {
        throw new Error('Song not found');
      }
      
      console.log(`🔗 Publishing "${song.metadata.title}" to blockchain...`);
      
      // Create blockchain publication data
      const publicationData = JSON.stringify({
        songId: song.songId,
        title: song.metadata.title,
        artist: song.metadata.artistName,
        duration: song.metadata.duration,
        contentHash: song.cryptography.contentHash,
        rights: song.rights,
        timestamp: new Date().toISOString(),
        version: '1.0'
      });
      
      // Publish to blockchain using existing system
      let publishResult;
      for await (const update of publishData(publicationData)) {
        console.log(`📡 ${update.stage}: ${update.message || ''}`);
        
        if (update.stage === 'error') {
          throw new Error(update.message);
        } else if (update.stage === 'done') {
          publishResult = update;
          break;
        }
      }
      
      // Update song with blockchain information
      const blockchainData = {
        blockchain: {
          network: 'BSV-mainnet',
          txid: publishResult.txid,
          publishedAt: new Date(),
          explorerUrl: publishResult.explorer
        },
        status: 'published'
      };
      
      const updatedSong = await CatalogService.updateSong(songId, blockchainData, actorInfo);
      
      console.log(`✅ Song published to blockchain!`);
      console.log(`🔗 Transaction: ${publishResult.txid}`);
      console.log(`🌐 Explorer: ${publishResult.explorer}`);
      
      return updatedSong;
      
    } catch (error) {
      console.error('❌ Failed to publish song to blockchain:', error.message);
      throw error;
    }
  }
  
  /**
   * List songs with filtering
   */
  async listSongs(filters = {}, options = {}) {
    await this.initialize();
    
    try {
      const result = await CatalogService.searchSongs(filters, options);
      
      console.log(`\n🎵 Found ${result.pagination.total} songs:`);
      console.log('================================================');
      
      result.songs.forEach((song, index) => {
        const number = (result.pagination.page - 1) * result.pagination.limit + index + 1;
        const duration = `${Math.floor(song.metadata.duration / 60)}:${(song.metadata.duration % 60).toString().padStart(2, '0')}`;
        
        console.log(`${number}. ${song.metadata.title}`);
        console.log(`   Artist: ${song.metadata.artistName}`);
        console.log(`   Genre: ${song.metadata.genre}`);
        console.log(`   Duration: ${duration}`);
        console.log(`   Status: ${song.status}`);
        console.log(`   Streams: ${song.performance.totalStreams.toLocaleString()}`);
        console.log(`   Revenue: ${song.performance.totalRevenue} sats`);
        console.log(`   Released: ${song.metadata.releaseDate.toLocaleDateString()}`);
        if (song.blockchain?.txid) {
          console.log(`   Blockchain: ${song.blockchain.txid}`);
        }
        console.log('');
      });
      
      if (result.pagination.pages > 1) {
        console.log(`📄 Page ${result.pagination.page} of ${result.pagination.pages}`);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Failed to list songs:', error.message);
      throw error;
    }
  }
  
  /**
   * Get detailed song information
   */
  async getSongDetails(songId) {
    await this.initialize();
    
    try {
      const song = await CatalogService.getSongById(songId);
      
      if (!song) {
        throw new Error('Song not found');
      }
      
      const duration = `${Math.floor(song.metadata.duration / 60)}:${(song.metadata.duration % 60).toString().padStart(2, '0')}`;
      
      console.log(`\n🎵 Song: ${song.metadata.title}`);
      console.log('================================================');
      console.log(`Artist: ${song.metadata.artistName}`);
      console.log(`Genre: ${song.metadata.genre}`);
      console.log(`Duration: ${duration}`);
      console.log(`Status: ${song.status}`);
      console.log(`Released: ${song.metadata.releaseDate.toLocaleDateString()}`);
      console.log(`Language: ${song.metadata.language}`);
      console.log(`Explicit: ${song.metadata.isExplicit ? 'Yes' : 'No'}`);
      
      if (song.metadata.tempo) console.log(`Tempo: ${song.metadata.tempo} BPM`);
      if (song.metadata.key) console.log(`Key: ${song.metadata.key}`);
      if (song.metadata.mood) console.log(`Mood: ${song.metadata.mood}`);
      
      console.log(`\n📊 Performance:`);
      console.log(`   Total Streams: ${song.performance.totalStreams.toLocaleString()}`);
      console.log(`   Downloads: ${song.performance.totalDownloads.toLocaleString()}`);
      console.log(`   Revenue: ${song.performance.totalRevenue} satoshis`);
      console.log(`   Sync Licenses: ${song.performance.syncLicenses}`);
      
      console.log(`\n🎧 Platform Streams:`);
      Object.entries(song.performance.platformStreams).forEach(([platform, streams]) => {
        if (streams > 0) {
          console.log(`   ${platform}: ${streams.toLocaleString()}`);
        }
      });
      
      console.log(`\n📂 Audio Assets:`);
      console.log(`   Master: ${song.audioAssets.masterFile.format} (${(song.audioAssets.masterFile.fileSize / 1024 / 1024).toFixed(1)}MB)`);
      console.log(`   Sample Rate: ${song.audioAssets.masterFile.sampleRate}Hz`);
      console.log(`   Bit Depth: ${song.audioAssets.masterFile.bitDepth}-bit`);
      console.log(`   Checksum: ${song.audioAssets.masterFile.checksum.substring(0, 16)}...`);
      
      if (song.audioAssets.stems.length > 0) {
        console.log(`   Stems: ${song.audioAssets.stems.length} files`);
      }
      
      console.log(`\n🔐 Rights & Ownership:`);
      song.rights.songwriter?.forEach((writer, i) => {
        console.log(`   Songwriter ${i + 1}: ${writer.name} (${writer.share}%)`);
      });
      song.rights.producer?.forEach((producer, i) => {
        console.log(`   Producer ${i + 1}: ${producer.name} (${producer.share}%)`);
      });
      
      console.log(`\n📄 Licensing:`);
      console.log(`   Sync Licensing: ${song.licensing.syncLicensing ? 'Available' : 'Not Available'}`);
      console.log(`   Sampling: ${song.licensing.samplingAllowed ? 'Allowed' : 'Not Allowed'}`);
      console.log(`   Remix Rights: ${song.licensing.remixRights}`);
      console.log(`   Commercial Use: ${song.licensing.commercialUse ? 'Yes' : 'No'}`);
      
      if (song.blockchain?.txid) {
        console.log(`\n🔗 Blockchain:`);
        console.log(`   Transaction: ${song.blockchain.txid}`);
        console.log(`   Network: ${song.blockchain.network}`);
        console.log(`   Published: ${song.blockchain.publishedAt?.toLocaleDateString()}`);
        console.log(`   Confirmations: ${song.blockchain.confirmations || 0}`);
      }
      
      if (song.distribution.platforms.length > 0) {
        console.log(`\n🌐 Distribution:`);
        song.distribution.platforms.forEach(platform => {
          console.log(`   ${platform.name}: ${platform.status}`);
          if (platform.url) console.log(`      URL: ${platform.url}`);
        });
      }
      
      return song;
      
    } catch (error) {
      console.error('❌ Failed to get song details:', error.message);
      throw error;
    }
  }
  
  /**
   * Update song metadata
   */
  async updateSongMetadata(songId, updateData, actorInfo = {}) {
    await this.initialize();
    
    try {
      const song = await CatalogService.updateSong(songId, updateData, actorInfo);
      
      console.log(`✅ Updated song: ${song.metadata.title}`);
      console.log(`🔄 Changes applied: ${Object.keys(updateData).join(', ')}`);
      
      return song;
      
    } catch (error) {
      console.error('❌ Failed to update song:', error.message);
      throw error;
    }
  }
  
  /**
   * Get catalog statistics
   */
  async getCatalogStats() {
    await this.initialize();
    
    try {
      const pipeline = [
        {
          $group: {
            _id: null,
            totalSongs: { $sum: 1 },
            publishedSongs: {
              $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] }
            },
            totalStreams: { $sum: "$performance.totalStreams" },
            totalRevenue: { $sum: "$performance.totalRevenue" },
            genreDistribution: { $push: "$metadata.genre" },
            artistDistribution: { $push: "$metadata.artistName" }
          }
        }
      ];
      
      const { Song } = await import('../database/schemas.js');
      const stats = await Song.aggregate(pipeline);
      
      if (stats.length === 0) {
        console.log('📊 No songs found in catalog');
        return { totalSongs: 0 };
      }
      
      const result = stats[0];
      
      // Count genres and artists
      const genreCounts = {};
      result.genreDistribution.forEach(genre => {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      });
      
      const artistCounts = {};
      result.artistDistribution.forEach(artist => {
        artistCounts[artist] = (artistCounts[artist] || 0) + 1;
      });
      
      console.log('\n📊 Music Catalog Statistics');
      console.log('===========================');
      console.log(`Total Songs: ${result.totalSongs}`);
      console.log(`Published Songs: ${result.publishedSongs}`);
      console.log(`Total Streams: ${result.totalStreams.toLocaleString()}`);
      console.log(`Total Revenue: ${result.totalRevenue.toLocaleString()} satoshis`);
      
      console.log(`\n🎵 Top Genres:`);
      Object.entries(genreCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([genre, count]) => {
          console.log(`   ${genre}: ${count} songs`);
        });
      
      console.log(`\n🎤 Top Artists by Song Count:`);
      Object.entries(artistCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([artist, count]) => {
          console.log(`   ${artist}: ${count} songs`);
        });
      
      return {
        ...result,
        genreDistribution: genreCounts,
        artistDistribution: artistCounts
      };
      
    } catch (error) {
      console.error('❌ Failed to get catalog stats:', error.message);
      throw error;
    }
  }
  
  /**
   * Helper method to get MIME type from file extension
   */
  getMimeTypeFromExtension(extension) {
    const mimeTypes = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.aac': 'audio/aac',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg'
    };
    
    return mimeTypes[extension.toLowerCase()] || 'audio/wav';
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new MusicCatalogManager();
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'release': {
        const artistId = process.argv.find(arg => arg.startsWith('--artist='))?.split('=')[1];
        const title = process.argv.find(arg => arg.startsWith('--title='))?.split('=')[1];
        const file = process.argv.find(arg => arg.startsWith('--file='))?.split('=')[1];
        const genre = process.argv.find(arg => arg.startsWith('--genre='))?.split('=')[1];
        
        if (!artistId || !title || !file) {
          console.error('❌ Required parameters: --artist, --title, --file');
          console.log('Usage: npm run release-song --artist=<artistId> --title="Song Title" --file="./path/to/song.wav" [--genre=pop]');
          process.exit(1);
        }
        
        const songData = {
          metadata: {
            artistId,
            title,
            genre: genre || 'pop'
          }
        };
        
        const song = await manager.createSong(songData, file, {
          userId: 'cli-user',
          role: 'label_admin'
        });
        
        // Optionally publish to blockchain
        const publish = process.argv.includes('--publish');
        if (publish) {
          await manager.publishSongToBlockchain(song.songId, {
            userId: 'cli-user',
            role: 'label_admin'
          });
        }
        
        process.exit(0);
        break;
      }
      
      case 'list': {
        const artist = process.argv.find(arg => arg.startsWith('--artist='))?.split('=')[1];
        const genre = process.argv.find(arg => arg.startsWith('--genre='))?.split('=')[1];
        const status = process.argv.find(arg => arg.startsWith('--status='))?.split('=')[1];
        const limit = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '10');
        
        const filters = {};
        if (artist) filters.artistName = artist;
        if (genre) filters.genre = genre;
        if (status) filters.status = status;
        
        await manager.listSongs(filters, { limit });
        process.exit(0);
        break;
      }
      
      case 'details': {
        const songId = process.argv[3];
        if (!songId) {
          console.error('❌ Song ID required for details command');
          console.log('Usage: npm run release-song details <songId>');
          process.exit(1);
        }
        
        await manager.getSongDetails(songId);
        process.exit(0);
        break;
      }
      
      case 'publish': {
        const songId = process.argv[3];
        if (!songId) {
          console.error('❌ Song ID required for publish command');
          console.log('Usage: npm run release-song publish <songId>');
          process.exit(1);
        }
        
        await manager.publishSongToBlockchain(songId, {
          userId: 'cli-user',
          role: 'label_admin'
        });
        process.exit(0);
        break;
      }
      
      case 'stats': {
        await manager.getCatalogStats();
        process.exit(0);
        break;
      }
      
      default: {
        console.log('🎵 Music Catalog Manager');
        console.log('======================');
        console.log('Available commands:');
        console.log('  release --artist=<artistId> --title="Title" --file="path.wav" [--genre=pop] [--publish]');
        console.log('  list [--artist=Name] [--genre=Genre] [--status=Status] [--limit=Number]');
        console.log('  details <songId>');
        console.log('  publish <songId>');
        console.log('  stats');
        console.log('');
        console.log('Examples:');
        console.log('  npm run release-song release --artist="artist-123" --title="Digital Dreams" --file="./masters/song.wav"');
        console.log('  npm run release-song list --genre="synthpop" --limit=5');
        console.log('  npm run release-song details song-uuid-here');
        console.log('  npm run release-song publish song-uuid-here');
        console.log('  npm run release-song stats');
        process.exit(0);
      }
    }
  } catch (error) {
    console.error('❌ Command failed:', error.message);
    process.exit(1);
  }
}

export default MusicCatalogManager;