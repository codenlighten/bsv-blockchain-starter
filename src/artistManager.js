#!/usr/bin/env node

/**
 * AI Artist Management System
 * 
 * Handles creation, management, and lifecycle of AI artists including:
 * - Artist persona generation and management
 * - Voice profile configuration
 * - Cryptographic identity verification
 * - Performance analytics and optimization
 * - Integration with music workflows
 */

import { ArtistService, AuditService } from '../database/services.js';
import { connectDatabase } from '../database/schemas.js';
import { signedStructuredResponse } from '../structured-json.js';
import spacesOps from '../spaces.js';
import { createAgentKeys } from '../scripts/signature.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Artist generation templates
const GENRE_TEMPLATES = {
  synthpop: {
    instruments: ['synthesizer', 'drum-machine', 'electric-guitar', 'bass-synth'],
    musicTheory: {
      preferredKeys: ['Am', 'C', 'Em', 'G'],
      timeSignatures: ['4/4', '3/4'],
      tempoRange: { min: 100, max: 140 },
      scaleModes: ['minor', 'major', 'dorian']
    },
    productionStyle: {
      arrangement: 'layered',
      dynamics: 'dynamic',
      effects: ['reverb', 'delay', 'chorus', 'distortion'],
      mixing: 'modern'
    },
    lyricalThemes: ['technology', 'future', 'love', 'nostalgia', 'digital-life']
  },
  reggae: {
    instruments: ['bass-guitar', 'electric-guitar', 'drums', 'organ', 'piano'],
    musicTheory: {
      preferredKeys: ['A', 'D', 'G', 'C'],
      timeSignatures: ['4/4'],
      tempoRange: { min: 60, max: 90 },
      scaleModes: ['major', 'minor', 'mixolydian']
    },
    productionStyle: {
      arrangement: 'sparse',
      dynamics: 'steady',
      effects: ['reverb', 'echo', 'compression'],
      mixing: 'clean'
    },
    lyricalThemes: ['unity', 'love', 'social-justice', 'spirituality', 'peace']
  },
  hiphop: {
    instruments: ['drum-machine', 'sampler', 'bass-synth', 'turntables'],
    musicTheory: {
      preferredKeys: ['Am', 'Dm', 'Gm', 'Cm'],
      timeSignatures: ['4/4'],
      tempoRange: { min: 70, max: 140 },
      scaleModes: ['minor', 'dorian', 'phrygian']
    },
    productionStyle: {
      arrangement: 'dense',
      dynamics: 'compressed',
      effects: ['compression', 'distortion', 'filter', 'vinyl-crackle'],
      mixing: 'modern'
    },
    lyricalThemes: ['struggle', 'success', 'street-life', 'ambition', 'culture']
  }
};

const VOICE_PROFILES = {
  'ethereal-female-high': {
    type: 'female',
    range: 'soprano',
    style: 'ethereal',
    characteristics: ['breathy', 'floating', 'celestial', 'smooth']
  },
  'soulful-male-mid': {
    type: 'male',
    range: 'tenor',
    style: 'soulful',
    characteristics: ['rich', 'warm', 'emotional', 'powerful']
  },
  'raspy-female-low': {
    type: 'female',
    range: 'alto',
    style: 'raspy',
    characteristics: ['gritty', 'textured', 'unique', 'memorable']
  }
};

/**
 * AI Artist Manager Class
 */
export class AIArtistManager {
  
  constructor() {
    this.initialized = false;
  }
  
  async initialize() {
    if (!this.initialized) {
      await connectDatabase();
      this.initialized = true;
      console.log('🎵 AI Artist Manager initialized');
    }
  }
  
  /**
   * Generate AI artist persona using structured AI response
   */
  async generateArtistPersona(preferences = {}) {
    const schema = {
      type: "object",
      properties: {
        identity: {
          type: "object",
          properties: {
            name: { type: "string", description: "Full artist name" },
            stageName: { type: "string", description: "Stage/performance name" },
            genre: { 
              type: "array", 
              items: { type: "string" },
              description: "Primary genres (1-3 genres)" 
            },
            language: { type: "string", description: "Primary language for music" },
            country: { type: "string", description: "Origin country" }
          },
          required: ["name", "stageName", "genre", "language", "country"]
        },
        persona: {
          type: "object",
          properties: {
            backstory: { 
              type: "string", 
              description: "Compelling artist backstory (100-200 words)" 
            },
            personality: { 
              type: "string", 
              description: "Artist personality traits and characteristics" 
            },
            visualStyle: { 
              type: "string", 
              description: "Visual aesthetic and art direction" 
            },
            musicStyle: { 
              type: "string", 
              description: "Musical characteristics and signature sound" 
            },
            voiceProfile: {
              type: "string",
              description: "Voice characteristics (select from available profiles)",
              enum: Object.keys(VOICE_PROFILES)
            },
            demographics: {
              type: "object",
              properties: {
                apparentAge: { type: "number", minimum: 18, maximum: 45 },
                apparentGender: { type: "string", enum: ["male", "female", "non-binary"] },
                culturalBackground: { type: "string" },
                fictionalLocation: { type: "string" }
              }
            }
          },
          required: ["backstory", "personality", "visualStyle", "musicStyle", "voiceProfile"]
        },
        musicGeneration: {
          type: "object",
          description: "Music generation preferences based on genre template",
          properties: {
            lyricalThemes: {
              type: "array",
              items: { type: "string" },
              description: "Preferred lyrical themes and topics"
            }
          }
        }
      },
      required: ["identity", "persona", "musicGeneration"]
    };
    
    const context = {
      availableGenres: Object.keys(GENRE_TEMPLATES),
      voiceProfiles: Object.keys(VOICE_PROFILES),
      preferences: preferences,
      instruction: "Create a unique, compelling AI artist that feels authentic and marketable. Ensure the backstory is interesting and the musical style is distinctive."
    };
    
    const prompt = `Create a new AI artist with the following preferences: ${JSON.stringify(preferences)}. 
    
    The artist should be:
    - Unique and memorable
    - Commercially viable
    - Authentic feeling despite being AI-generated
    - Suitable for the specified genre(s)
    - Have a compelling backstory that fans can connect with
    
    Available genres: ${Object.keys(GENRE_TEMPLATES).join(', ')}
    Available voice profiles: ${Object.keys(VOICE_PROFILES).join(', ')}`;
    
    return await signedStructuredResponse({
      query: prompt,
      schema,
      context,
      temperature: 0.8, // Higher creativity for artist generation
      systemPrompt: "You are a music industry expert specializing in AI artist development. Create compelling, unique artists that could succeed in today's music market."
    });
  }
  
  /**
   * Create a new AI artist
   */
  async createArtist(artistData, actorInfo = {}) {
    await this.initialize();
    
    try {
      // If artistData is just preferences, generate full persona
      if (!artistData.identity || !artistData.persona) {
        console.log('🤖 Generating AI artist persona...');
        const generated = await this.generateArtistPersona(artistData);
        if (!generated.identity) {
          throw new Error('Failed to generate valid artist persona');
        }
        artistData = generated;
      }
      
      // Apply genre template
      const primaryGenre = artistData.identity.genre[0];
      const genreTemplate = GENRE_TEMPLATES[primaryGenre];
      
      if (genreTemplate) {
        artistData.musicGeneration = {
          ...genreTemplate,
          lyricalThemes: artistData.musicGeneration?.lyricalThemes || genreTemplate.lyricalThemes,
          collaborationPrefs: {
            humanCollabAllowed: true,
            remixRights: 'restricted',
            samplingAllowed: false
          }
        };
      }
      
      // Set default performance metrics
      artistData.performance = {
        totalStreams: 0,
        monthlyListeners: 0,
        followerCount: 0,
        songsReleased: 0,
        lastReleaseDate: null,
        topCountries: [],
        demographics: {
          ageGroups: {},
          genderSplit: {}
        }
      };
      
      // Set default artwork configuration
      artistData.artwork = {
        visualBrand: {
          colorPalette: this.generateColorPalette(artistData.persona.visualStyle),
          fonts: ['Helvetica Neue', 'Arial'],
          logoUrl: null
        }
      };
      
      // Set initial status
      artistData.status = 'created';
      
      // Create artist in database
      const artist = await ArtistService.createAIArtist(artistData, actorInfo);
      
      console.log(`✅ Created AI artist: ${artist.identity.stageName} (${artist.artistId})`);
      console.log(`🎤 Genre: ${artist.identity.genre.join(', ')}`);
      console.log(`🗣️  Voice: ${artist.persona.voiceProfile}`);
      console.log(`🎨 Style: ${artist.persona.visualStyle}`);
      console.log(`🔐 Address: ${artist.cryptography.artistKeys.address}`);
      
      return artist;
      
    } catch (error) {
      console.error('❌ Failed to create AI artist:', error.message);
      throw error;
    }
  }
  
  /**
   * List all artists with filtering
   */
  async listArtists(filters = {}, options = {}) {
    await this.initialize();
    
    try {
      const result = await ArtistService.searchArtists(filters, options);
      
      console.log(`\n🎵 Found ${result.pagination.total} AI artists:`);
      console.log('================================================');
      
      result.artists.forEach((artist, index) => {
        const number = (result.pagination.page - 1) * result.pagination.limit + index + 1;
        console.log(`${number}. ${artist.identity.stageName}`);
        console.log(`   Name: ${artist.identity.name}`);
        console.log(`   Genre: ${artist.identity.genre.join(', ')}`);
        console.log(`   Status: ${artist.status}`);
        console.log(`   Streams: ${artist.performance.totalStreams.toLocaleString()}`);
        console.log(`   Songs: ${artist.performance.songsReleased}`);
        console.log(`   Created: ${artist.createdAt.toLocaleDateString()}`);
        console.log(`   Address: ${artist.cryptography.artistKeys.address}`);
        console.log('');
      });
      
      if (result.pagination.pages > 1) {
        console.log(`📄 Page ${result.pagination.page} of ${result.pagination.pages}`);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Failed to list artists:', error.message);
      throw error;
    }
  }
  
  /**
   * Update artist information
   */
  async updateArtist(artistId, updateData, actorInfo = {}) {
    await this.initialize();
    
    try {
      const artist = await ArtistService.updateArtist(artistId, updateData, actorInfo);
      
      console.log(`✅ Updated AI artist: ${artist.identity.stageName}`);
      console.log(`🔄 Changes applied: ${Object.keys(updateData).join(', ')}`);
      
      return artist;
      
    } catch (error) {
      console.error('❌ Failed to update artist:', error.message);
      throw error;
    }
  }
  
  /**
   * Get detailed artist information
   */
  async getArtistDetails(artistId) {
    await this.initialize();
    
    try {
      const artist = await ArtistService.getArtistById(artistId);
      
      if (!artist) {
        throw new Error('Artist not found');
      }
      
      console.log(`\n🎵 AI Artist: ${artist.identity.stageName}`);
      console.log('================================================');
      console.log(`Real Name: ${artist.identity.name}`);
      console.log(`Genre: ${artist.identity.genre.join(', ')}`);
      console.log(`Language: ${artist.identity.language}`);
      console.log(`Country: ${artist.identity.country}`);
      console.log(`Status: ${artist.status}`);
      console.log(`\n📖 Backstory:`);
      console.log(artist.persona.backstory);
      console.log(`\n🎤 Voice Profile: ${artist.persona.voiceProfile}`);
      console.log(`🎨 Visual Style: ${artist.persona.visualStyle}`);
      console.log(`🎵 Music Style: ${artist.persona.musicStyle}`);
      console.log(`\n📊 Performance:`);
      console.log(`   Total Streams: ${artist.performance.totalStreams.toLocaleString()}`);
      console.log(`   Monthly Listeners: ${artist.performance.monthlyListeners.toLocaleString()}`);
      console.log(`   Followers: ${artist.performance.followerCount.toLocaleString()}`);
      console.log(`   Songs Released: ${artist.performance.songsReleased}`);
      console.log(`\n🔐 Blockchain Identity:`);
      console.log(`   Address: ${artist.cryptography.artistKeys.address}`);
      console.log(`   Public Key: ${artist.cryptography.artistKeys.publicKey.substring(0, 20)}...`);
      console.log(`   Created: ${artist.createdAt.toLocaleString()}`);
      
      return artist;
      
    } catch (error) {
      console.error('❌ Failed to get artist details:', error.message);
      throw error;
    }
  }
  
  /**
   * Activate an artist (set status to active and ready for releases)
   */
  async activateArtist(artistId, actorInfo = {}) {
    await this.initialize();
    
    try {
      const artist = await ArtistService.updateArtist(artistId, { 
        status: 'active',
        lastActivityAt: new Date()
      }, actorInfo);
      
      console.log(`✅ Activated AI artist: ${artist.identity.stageName}`);
      console.log(`🎵 Artist is now ready for music releases`);
      
      return artist;
      
    } catch (error) {
      console.error('❌ Failed to activate artist:', error.message);
      throw error;
    }
  }
  
  /**
   * Generate color palette based on visual style
   */
  generateColorPalette(visualStyle) {
    const palettes = {
      'cyberpunk-neon': ['#ff0080', '#00ffff', '#8000ff', '#ffff00', '#ff8000'],
      'vintage-warm': ['#d4a574', '#8b4513', '#daa520', '#cd853f', '#f4a460'],
      'minimalist-clean': ['#ffffff', '#f5f5f5', '#e0e0e0', '#c0c0c0', '#808080'],
      'vibrant-pop': ['#ff1493', '#00bfff', '#32cd32', '#ffd700', '#ff4500'],
      'earth-tones': ['#8fbc8f', '#daa520', '#cd853f', '#d2691e', '#bc8f8f']
    };
    
    // Try to match style keywords to palettes
    for (const [style, palette] of Object.entries(palettes)) {
      if (visualStyle.toLowerCase().includes(style.split('-')[0])) {
        return palette;
      }
    }
    
    // Default to vibrant pop
    return palettes['vibrant-pop'];
  }
  
  /**
   * Get artist statistics
   */
  async getArtistStats() {
    await this.initialize();
    
    try {
      const pipeline = [
        {
          $group: {
            _id: null,
            totalArtists: { $sum: 1 },
            activeArtists: {
              $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] }
            },
            totalStreams: { $sum: "$performance.totalStreams" },
            totalSongs: { $sum: "$performance.songsReleased" },
            genreDistribution: { $push: "$identity.genre" }
          }
        }
      ];
      
      const { AIArtist } = await import('../database/schemas.js');
      const stats = await AIArtist.aggregate(pipeline);
      
      if (stats.length === 0) {
        console.log('📊 No artists found in database');
        return { totalArtists: 0 };
      }
      
      const result = stats[0];
      
      // Flatten and count genres
      const allGenres = result.genreDistribution.flat();
      const genreCounts = {};
      allGenres.forEach(genre => {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      });
      
      console.log('\n📊 AI Artist Platform Statistics');
      console.log('================================');
      console.log(`Total Artists: ${result.totalArtists}`);
      console.log(`Active Artists: ${result.activeArtists}`);
      console.log(`Total Streams: ${result.totalStreams.toLocaleString()}`);
      console.log(`Total Songs: ${result.totalSongs}`);
      console.log(`\n🎵 Genre Distribution:`);
      
      Object.entries(genreCounts)
        .sort(([,a], [,b]) => b - a)
        .forEach(([genre, count]) => {
          console.log(`   ${genre}: ${count} artists`);
        });
      
      return {
        ...result,
        genreDistribution: genreCounts
      };
      
    } catch (error) {
      console.error('❌ Failed to get artist stats:', error.message);
      throw error;
    }
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new AIArtistManager();
  const command = process.argv[2];
  
  try {
    switch (command) {
      case 'create': {
        // Parse command line arguments for artist creation
        const name = process.argv.find(arg => arg.startsWith('--name='))?.split('=')[1];
        const genre = process.argv.find(arg => arg.startsWith('--genre='))?.split('=')[1];
        const voice = process.argv.find(arg => arg.startsWith('--voice='))?.split('=')[1];
        const style = process.argv.find(arg => arg.startsWith('--style='))?.split('=')[1];
        
        const preferences = {};
        if (name) preferences.preferredName = name;
        if (genre) preferences.preferredGenre = genre;
        if (voice) preferences.voiceProfile = voice;
        if (style) preferences.visualStyle = style;
        
        const artist = await manager.createArtist(preferences, {
          userId: 'cli-user',
          role: 'label_admin'
        });
        
        process.exit(0);
        break;
      }
      
      case 'list': {
        const genre = process.argv.find(arg => arg.startsWith('--genre='))?.split('=')[1];
        const status = process.argv.find(arg => arg.startsWith('--status='))?.split('=')[1];
        const limit = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '10');
        
        const filters = {};
        if (genre) filters.genre = genre;
        if (status) filters.status = status;
        
        await manager.listArtists(filters, { limit });
        process.exit(0);
        break;
      }
      
      case 'details': {
        const artistId = process.argv[3];
        if (!artistId) {
          console.error('❌ Artist ID required for details command');
          console.log('Usage: npm run create-artist details <artistId>');
          process.exit(1);
        }
        
        await manager.getArtistDetails(artistId);
        process.exit(0);
        break;
      }
      
      case 'activate': {
        const artistId = process.argv[3];
        if (!artistId) {
          console.error('❌ Artist ID required for activate command');
          console.log('Usage: npm run create-artist activate <artistId>');
          process.exit(1);
        }
        
        await manager.activateArtist(artistId, {
          userId: 'cli-user',
          role: 'label_admin'
        });
        process.exit(0);
        break;
      }
      
      case 'stats': {
        await manager.getArtistStats();
        process.exit(0);
        break;
      }
      
      default: {
        console.log('🎵 AI Artist Manager');
        console.log('==================');
        console.log('Available commands:');
        console.log('  create [--name=Name] [--genre=Genre] [--voice=Profile] [--style=Style]');
        console.log('  list [--genre=Genre] [--status=Status] [--limit=Number]');
        console.log('  details <artistId>');
        console.log('  activate <artistId>');
        console.log('  stats');
        console.log('');
        console.log('Examples:');
        console.log('  npm run create-artist create --name="Luna" --genre="synthpop"');
        console.log('  npm run create-artist list --genre="reggae" --limit=5');
        console.log('  npm run create-artist details artist-uuid-here');
        console.log('  npm run create-artist activate artist-uuid-here');
        console.log('  npm run create-artist stats');
        process.exit(0);
      }
    }
  } catch (error) {
    console.error('❌ Command failed:', error.message);
    process.exit(1);
  }
}

export default AIArtistManager;