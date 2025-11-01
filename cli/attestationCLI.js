#!/usr/bin/env node
/**
 * Attestation CLI Tool
 * Command-line interface for creating, signing, and verifying cryptographic contracts
 */

import { program } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { AttestationBox, AttestationManager, CONTRACT_TEMPLATES, ATTESTATION_KEY_RULES } from '../src/attestation.js';
import MusicIdentitySDK from '../src/web3IdentitySDK.js';
import chalk from 'chalk';

// Global manager instance
const manager = new AttestationManager();

/**
 * Create new attestation from template
 */
program
  .command('create <template-type>')
  .description('Create new attestation from contract template')
  .option('-f, --file <path>', 'Save to file')
  .option('-s, --subject <subject>', 'Subject identifier (e.g., song:abc123)')
  .option('--interactive', 'Interactive mode for filling template fields')
  .action(async (templateType, options) => {
    try {
      console.log(chalk.blue(`\n🔨 Creating attestation from template: ${templateType}`));
      
      const template = CONTRACT_TEMPLATES[templateType];
      if (!template) {
        console.error(chalk.red(`❌ Unknown template type: ${templateType}`));
        console.log(chalk.yellow('Available templates:'));
        Object.keys(CONTRACT_TEMPLATES).forEach(t => {
          console.log(`  • ${t} - ${CONTRACT_TEMPLATES[t].required_fields.join(', ')}`);
        });
        process.exit(1);
      }

      console.log(chalk.green(`✅ Template found: ${template.version}`));
      console.log(chalk.gray(`Required fields: ${template.required_fields.join(', ')}`));
      console.log(chalk.gray(`Key type: ${template.key_type}`));

      let fields = {};

      if (options.interactive) {
        fields = await interactiveFieldEntry(template);
      } else {
        // Example fields for demo
        fields = getExampleFields(templateType);
        console.log(chalk.yellow('🎯 Using example data (use --interactive for custom fields)'));
      }

      const attestationOptions = {
        subject: options.subject || `contract:${templateType}`,
        action: templateType
      };

      const attestation = await manager.createAttestation(templateType, fields, attestationOptions);
      
      console.log(chalk.green(`\n✅ Attestation created: ${attestation.id}`));
      console.log(chalk.gray(`Subject: ${attestation.subject}`));
      console.log(chalk.gray(`Contract hash: ${attestation.metadata.contract_hash}`));
      
      // Show contract preview
      console.log(chalk.blue('\n📄 Contract Preview:'));
      console.log(chalk.cyan('─'.repeat(60)));
      console.log(attestation.getContractText());
      console.log(chalk.cyan('─'.repeat(60)));

      // Save to file if requested
      const filename = options.file || `attestation_${attestation.id}.json`;
      await saveAttestationToFile(attestation, filename);
      
      console.log(chalk.green(`\n💾 Saved to: ${filename}`));
      console.log(chalk.yellow(`\n🔐 Next steps:`));
      console.log(`  1. Share this file with required signers`);
      console.log(`  2. Each party signs: ${chalk.bold(`npx agility attestation sign ${filename} --${template.key_type}`)}`);
      console.log(`  3. Verify: ${chalk.bold(`npx agility attestation verify ${filename}`)}`);

    } catch (error) {
      console.error(chalk.red(`❌ Creation failed: ${error.message}`));
      process.exit(1);
    }
  });

/**
 * Sign attestation
 */
program
  .command('sign <file>')
  .description('Sign attestation with your cryptographic key')
  .option('--identity', 'Sign with identity key')
  .option('--property', 'Sign with property key') 
  .option('--contractual', 'Sign with contractual key')
  .option('--financial', 'Sign with financial key')
  .option('--document', 'Sign with document key')
  .option('--key <wif>', 'Use specific private key (WIF format)')
  .option('--name <name>', 'Signer name')
  .option('--derivation <path>', 'Key derivation path')
  .action(async (file, options) => {
    try {
      console.log(chalk.blue(`\n🔐 Signing attestation: ${file}`));

      // Load attestation
      const attestation = await loadAttestationFromFile(file);
      console.log(chalk.green(`✅ Loaded attestation: ${attestation.id}`));

      // Determine key type
      const keyType = getSelectedKeyType(options);
      if (!keyType) {
        console.error(chalk.red('❌ Must specify key type: --identity, --property, --contractual, --financial, or --document'));
        process.exit(1);
      }

      // Validate key type for action
      const requiredKeyType = ATTESTATION_KEY_RULES[attestation.action];
      if (requiredKeyType && keyType !== requiredKeyType) {
        console.error(chalk.red(`❌ Action "${attestation.action}" requires "${requiredKeyType}" key, got "${keyType}"`));
        process.exit(1);
      }

      console.log(chalk.green(`✅ Using ${keyType} key for action: ${attestation.action}`));

      // Get private key
      let privateKey = options.key;
      if (!privateKey) {
        privateKey = await promptForPrivateKey(keyType);
      }

      // Signer information
      const signerInfo = {
        role: keyType,
        name: options.name || await promptForName(),
        derivation: options.derivation || `m/44'/236'/${getKeyTypeIndex(keyType)}'/0/0`
      };

      // Add signature
      const result = await attestation.addSignature(privateKey, signerInfo);
      
      console.log(chalk.green(`\n✅ Signature added successfully!`));
      console.log(chalk.gray(`Signer: ${signerInfo.name}`));
      console.log(chalk.gray(`Public Key: ${result.signature.pubkey}`));
      console.log(chalk.gray(`Signatures: ${result.signatures_count}`));
      
      if (result.complete) {
        console.log(chalk.green(`🎉 CONTRACT COMPLETE! All required signatures collected.`));
        console.log(chalk.yellow(`📋 Final contract hash: ${attestation.metadata.contract_hash}`));
      }

      // Save updated attestation
      await saveAttestationToFile(attestation, file);
      console.log(chalk.green(`💾 Updated ${file}`));

    } catch (error) {
      console.error(chalk.red(`❌ Signing failed: ${error.message}`));
      process.exit(1);
    }
  });

/**
 * Verify attestation signatures
 */
program
  .command('verify <file>')
  .description('Verify all signatures in attestation')
  .option('--verbose', 'Show detailed verification results')
  .action(async (file, options) => {
    try {
      console.log(chalk.blue(`\n🔍 Verifying attestation: ${file}`));

      const attestation = await loadAttestationFromFile(file);
      const verification = attestation.verifyAllSignatures();

      console.log(chalk.green(`\n📋 Attestation: ${attestation.id}`));
      console.log(chalk.gray(`Subject: ${attestation.subject}`));
      console.log(chalk.gray(`Action: ${attestation.action}`));
      console.log(chalk.gray(`Contract Hash: ${attestation.metadata.contract_hash}`));

      console.log(chalk.blue(`\n🔐 Signature Verification:`));
      console.log(`${verification.valid_count}/${verification.signature_count} signatures valid`);
      console.log(`Status: ${verification.all_valid ? chalk.green('✅ VALID') : chalk.red('❌ INVALID')}`);
      console.log(`Finalized: ${verification.finalized ? chalk.green('✅ YES') : chalk.yellow('⏳ PENDING')}`);

      if (options.verbose) {
        console.log(chalk.blue(`\n📝 Signature Details:`));
        verification.results.forEach((result, i) => {
          const status = result.valid ? chalk.green('✅') : chalk.red('❌');
          console.log(`${i + 1}. ${status} ${result.signer} (${result.role})`);
          console.log(`   Key: ${result.pubkey.substring(0, 16)}...`);
          console.log(`   Time: ${result.timestamp}`);
          if (result.error) {
            console.log(chalk.red(`   Error: ${result.error}`));
          }
        });
      }

      if (verification.finalized) {
        console.log(chalk.green(`\n🎉 CONTRACT IS LEGALLY BINDING AND CRYPTOGRAPHICALLY ENFORCED! 🎉`));
        
        // Show contract text
        console.log(chalk.blue(`\n📄 Final Contract:`));
        console.log(chalk.cyan('═'.repeat(80)));
        console.log(attestation.getContractText());
        console.log(chalk.cyan('═'.repeat(80)));
        
        // Show anchor hash for blockchain
        console.log(chalk.yellow(`\n⚓ Blockchain Anchor Hash: ${attestation.getAnchorHash()}`));
      }

    } catch (error) {
      console.error(chalk.red(`❌ Verification failed: ${error.message}`));
      process.exit(1);
    }
  });

/**
 * List available templates
 */
program
  .command('templates')
  .description('List available contract templates')
  .action(() => {
    console.log(chalk.blue('\n📋 Available Contract Templates:\n'));
    
    Object.entries(CONTRACT_TEMPLATES).forEach(([type, template]) => {
      console.log(chalk.green(`🔖 ${type}`));
      console.log(chalk.gray(`   Version: ${template.version}`));
      console.log(chalk.gray(`   Key Type: ${template.key_type}`));
      console.log(chalk.gray(`   Fields: ${template.required_fields.join(', ')}`));
      console.log();
    });

    console.log(chalk.yellow('Usage:'));
    console.log(`  ${chalk.bold('npx agility attestation create <template-type> --interactive')}`);
  });

/**
 * Show attestation info
 */
program
  .command('info <file>')
  .description('Show attestation information')
  .action(async (file) => {
    try {
      const attestation = await loadAttestationFromFile(file);
      
      console.log(chalk.blue('\n📋 Attestation Information:\n'));
      console.log(`${chalk.bold('ID:')} ${attestation.id}`);
      console.log(`${chalk.bold('Type:')} ${attestation.type} v${attestation.version}`);
      console.log(`${chalk.bold('Subject:')} ${attestation.subject}`);
      console.log(`${chalk.bold('Action:')} ${attestation.action}`);
      console.log(`${chalk.bold('Created:')} ${attestation.metadata.created}`);
      console.log(`${chalk.bold('Finalized:')} ${attestation.metadata.finalized ? '✅ YES' : '⏳ PENDING'}`);
      console.log(`${chalk.bold('Signatures:')} ${attestation.signatures.length}`);
      
      if (attestation.metadata.contract_hash) {
        console.log(`${chalk.bold('Contract Hash:')} ${attestation.metadata.contract_hash}`);
      }

      if (attestation.signatures.length > 0) {
        console.log(chalk.blue('\n🔐 Signatures:'));
        attestation.signatures.forEach((sig, i) => {
          console.log(`${i + 1}. ${sig.signer_info?.name || 'Anonymous'} (${sig.role})`);
          console.log(`   ${sig.pubkey.substring(0, 16)}... at ${sig.timestamp}`);
        });
      }

    } catch (error) {
      console.error(chalk.red(`❌ Failed to read attestation: ${error.message}`));
      process.exit(1);
    }
  });

/**
 * Generate identity for testing
 */
program
  .command('generate-identity')
  .description('Generate test identity with all key types')
  .option('-n, --name <name>', 'Name for identity', 'Test User')
  .action(async (options) => {
    try {
      console.log(chalk.blue('\n🔑 Generating Test Identity...\n'));
      
      const sdk = new MusicIdentitySDK();
      const identity = sdk.generateIdentity();
      
      console.log(chalk.green(`✅ Identity Generated`));
      console.log(`${chalk.bold('Address:')} ${identity.identityAddress}`);
      console.log(`${chalk.bold('Mnemonic:')} ${identity.mnemonic}`);
      
      console.log(chalk.blue('\n🗝️  Private Keys (WIF format):'));
      Object.entries(identity.addresses).forEach(([keyType, address]) => {
        console.log(`${chalk.bold(keyType)}:`);
        console.log(`  Address: ${address}`);
        console.log(`  Private: ${sdk.derivedKeys[keyType]?.toString()}`);
      });

      console.log(chalk.yellow('\n⚠️  Store these keys securely! They are for testing only.'));
      
    } catch (error) {
      console.error(chalk.red(`❌ Identity generation failed: ${error.message}`));
      process.exit(1);
    }
  });

/**
 * Utility Functions
 */

async function loadAttestationFromFile(filename) {
  try {
    const data = await fs.readFile(filename, 'utf8');
    const parsed = JSON.parse(data);
    return AttestationBox.import(parsed);
  } catch (error) {
    throw new Error(`Cannot load attestation from ${filename}: ${error.message}`);
  }
}

async function saveAttestationToFile(attestation, filename) {
  const data = JSON.stringify(attestation.export(), null, 2);
  await fs.writeFile(filename, data, 'utf8');
}

function getSelectedKeyType(options) {
  if (options.identity) return 'identity';
  if (options.property) return 'property';
  if (options.contractual) return 'contractual';
  if (options.financial) return 'financial';
  if (options.document) return 'document';
  return null;
}

function getKeyTypeIndex(keyType) {
  const indices = {
    identity: 0,
    property: 1,
    contractual: 2,
    privacy: 3,
    messages: 4,
    financial: 5,
    document: 6
  };
  return indices[keyType] || 0;
}

async function promptForPrivateKey(keyType) {
  // In a real implementation, this would prompt securely
  console.log(chalk.yellow(`🔑 Please provide your ${keyType} private key (WIF format):`));
  console.log(chalk.gray('(In production, this would be a secure prompt)'));
  console.log(chalk.red('⚠️  For demo, use: npx agility attestation generate-identity'));
  process.exit(0);
}

async function promptForName() {
  // In a real implementation, this would prompt for name
  return 'Demo Signer';
}

function getExampleFields(templateType) {
  switch (templateType) {
    case 'publishing-split':
      return {
        song_title: 'Demo Song',
        song_hash: 'abc123def456',
        parties: [
          {
            name: 'Artist One', 
            pubkey: '02ab1234567890abcdef1234567890abcdef1234567890abcdef1234567890abf3',
            split: 40
          },
          {
            name: 'Artist Two',
            pubkey: '03c81234567890abcdef1234567890abcdef1234567890abcdef1234567890ab1d', 
            split: 40
          },
          {
            name: 'Producer',
            pubkey: '02df1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab91',
            split: 20
          }
        ]
      };
      
    case 'collaboration-agreement':
      return {
        project_name: 'Demo Collaboration',
        collaborators: [
          { name: 'Lead Artist', role: 'Vocalist' },
          { name: 'Producer', role: 'Music Production' }
        ],
        terms: 'Joint creative effort with shared ownership of final work'
      };
      
    case 'licensing-agreement':
      return {
        song_title: 'Demo Song',
        licensor: { name: 'Original Artist', pubkey_short: '02ab1234...' },
        licensee: { name: 'Film Studio', pubkey_short: '03c81234...' },
        license_type: 'Sync License',
        terms: 'One-time use in film production',
        fees: '$5,000 upfront + 2% of film revenue'
      };
      
    default:
      return {};
  }
}

async function interactiveFieldEntry(template) {
  console.log(chalk.yellow('\n📝 Interactive field entry not implemented in demo.'));
  console.log(chalk.gray('Using example data instead...'));
  return getExampleFields(template);
}

// Set up commander
program
  .name('attestation')
  .description('AI Record Label Attestation CLI - Cryptographic Contract Engine')
  .version('1.0.0');

program.parse();