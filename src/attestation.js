/**
 * Attestation Signing & Multi-Signer Contract Engine
 * Core legal + cryptographic module for music industry contracts
 * Supports royalty splits, ownership %, contract co-signing, and zk-ready architecture
 */

import crypto from 'crypto';
import bsv from 'smartledger-bsv';
import MusicIdentitySDK, { ACTION_KEY_MAP } from './web3IdentitySDK.js';

/**
 * Key Type Enforcement Rules
 * Defines which actions require which specific key types
 */
const ATTESTATION_KEY_RULES = {
  // Property rights (ownership, splits, transfers)
  'rights-split-approval': 'property',
  'ownership-claim': 'property', 
  'rights-transfer': 'property',
  'publishing-rights': 'property',
  
  // Contractual agreements (licensing, collaborations)
  'licensing-agreement': 'contractual',
  'collaboration-agreement': 'contractual',
  'sync-license': 'contractual',
  'distribution-agreement': 'contractual',
  
  // Financial (payments, royalties)
  'royalty-agreement': 'financial',
  'payment-authorization': 'financial',
  'revenue-split': 'financial',
  
  // Legal documents  
  'nda-agreement': 'document',
  'legal-waiver': 'document',
  'copyright-assignment': 'document',
  
  // Identity verification
  'identity-verification': 'identity',
  'role-assignment': 'identity'
};

/**
 * Contract Template Definitions
 * Semantic contracts with fillable fields
 */
const CONTRACT_TEMPLATES = {
  'publishing-split': {
    version: '1.0.0',
    required_fields: ['song_title', 'song_hash', 'parties'],
    template: `
Publishing Split Agreement

This agreement establishes publishing rights and revenue splits for the musical work:

Title: {{song_title}}
Fingerprint: {{song_hash}}
Created: {{timestamp}}

The following parties agree to the specified ownership percentages:

{{#each parties}}
• {{name}} ({{pubkey_short}}) - {{split}}% ownership
{{/each}}

Total: {{total_split}}% (must equal 100%)

Terms:
- Revenue will be distributed according to these percentages
- All parties must sign with their designated cryptographic keys
- This agreement becomes binding once all signatures are collected
- Modifications require new attestation with all party signatures

This contract is cryptographically signed and legally binding.
`,
    required_signatures: 'all_parties',
    key_type: 'property'
  },

  'collaboration-agreement': {
    version: '1.0.0',
    required_fields: ['project_name', 'collaborators', 'terms'],
    template: `
Artist Collaboration Agreement

Project: {{project_name}}
Created: {{timestamp}}

Collaborating Artists:
{{#each collaborators}}
• {{name}} - {{role}} ({{pubkey_short}})
{{/each}}

Collaboration Terms:
{{terms}}

Credit and Revenue:
- All parties will be credited according to their specified roles
- Revenue sharing as per separate publishing split agreement
- Each party retains rights to their individual contributions
- Joint ownership of the final collaborative work

This agreement is cryptographically signed by all parties.
`,
    required_signatures: 'all_parties', 
    key_type: 'contractual'
  },

  'licensing-agreement': {
    version: '1.0.0',
    required_fields: ['song_title', 'licensor', 'licensee', 'license_type', 'terms'],
    template: `
Music Licensing Agreement

Musical Work: {{song_title}}
License Type: {{license_type}}
Created: {{timestamp}}

Licensor: {{licensor.name}} ({{licensor.pubkey_short}})
Licensee: {{licensee.name}} ({{licensee.pubkey_short}})

License Terms:
{{terms}}

Fees and Royalties:
{{#if fees}}
{{fees}}
{{else}}
As separately negotiated
{{/if}}

This license is granted subject to the terms above and becomes effective upon cryptographic signature by both parties.
`,
    required_signatures: ['licensor', 'licensee'],
    key_type: 'contractual'
  }
};

/**
 * AttestationBox Class
 * Core object for cryptographic contracts and multi-signature agreements
 */
export class AttestationBox {
  constructor(config = {}) {
    this.type = 'attestation';
    this.version = config.version || '1.0.0';
    this.id = config.id || this.generateId();
    this.subject = config.subject; // e.g., "song:7f19e8bc"
    this.action = config.action; // e.g., "rights-split-approval"
    this.payload = config.payload || {};
    this.signatures = config.signatures || [];
    this.metadata = {
      created: config.created || new Date().toISOString(),
      template_used: config.template_used || null,
      contract_hash: config.contract_hash || null,
      finalized: false,
      ...config.metadata
    };
  }

  /**
   * Generate unique attestation ID
   */
  generateId() {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `att_${timestamp}_${random}`;
  }

  /**
   * Create attestation from contract template
   */
  static async createFromTemplate(templateType, fields, options = {}) {
    const template = CONTRACT_TEMPLATES[templateType];
    if (!template) {
      throw new Error(`Unknown contract template: ${templateType}`);
    }

    // Validate required fields
    const missing = template.required_fields.filter(field => !fields[field]);
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    // Add timestamp to fields
    fields.timestamp = new Date().toISOString();

    // Calculate total split if applicable
    if (fields.parties) {
      fields.total_split = fields.parties.reduce((sum, party) => sum + (party.split || 0), 0);
      
      // Add shortened pubkeys for display
      fields.parties = fields.parties.map(party => ({
        ...party,
        pubkey_short: party.pubkey ? `${party.pubkey.substring(0, 8)}...${party.pubkey.substring(-4)}` : 'TBD'
      }));
    }

    // Render contract text
    const contractText = AttestationBox.renderTemplate(template.template, fields);
    const contractHash = crypto.createHash('sha256').update(contractText).digest('hex');

    // Create attestation
    const attestation = new AttestationBox({
      subject: options.subject || `contract:${templateType}`,
      action: options.action || templateType,
      payload: {
        template_type: templateType,
        template_version: template.version,
        fields: fields,
        contract_text: contractText,
        contract_hash: contractHash,
        required_signatures: template.required_signatures,
        key_type: template.key_type
      },
      template_used: templateType
    });

    attestation.metadata.contract_hash = contractHash;
    return attestation;
  }

  /**
   * Simple template rendering (Handlebars-like syntax)
   */
  static renderTemplate(template, fields) {
    let rendered = template;

    // Handle each loops
    rendered = rendered.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, arrayName, itemTemplate) => {
      const array = fields[arrayName];
      if (!Array.isArray(array)) return '';
      
      return array.map(item => {
        let itemText = itemTemplate;
        // Replace item properties
        Object.keys(item).forEach(key => {
          itemText = itemText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), item[key]);
        });
        return itemText;
      }).join('');
    });

    // Handle conditionals
    rendered = rendered.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, fieldName, ifContent, elseContent) => {
      return fields[fieldName] ? ifContent : elseContent;
    });

    rendered = rendered.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, fieldName, content) => {
      return fields[fieldName] ? content : '';
    });

    // Handle simple variable substitution
    rendered = rendered.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const value = path.split('.').reduce((obj, key) => obj && obj[key], fields);
      return value !== undefined ? value : match;
    });

    return rendered.trim();
  }

  /**
   * Add signature to attestation
   */
  async addSignature(privateKey, signerInfo = {}) {
    try {
      // Validate key type for action
      const requiredKeyType = ATTESTATION_KEY_RULES[this.action];
      if (requiredKeyType && signerInfo.role !== requiredKeyType) {
        throw new Error(`Action "${this.action}" requires "${requiredKeyType}" key, got "${signerInfo.role}"`);
      }

      // Create signature payload
      const signaturePayload = {
        attestation_id: this.id,
        contract_hash: this.metadata.contract_hash,
        action: this.action,
        timestamp: new Date().toISOString(),
        signer: signerInfo.pubkey || this.derivePublicKey(privateKey)
      };

      // Sign the payload
      const message = JSON.stringify(signaturePayload, null, 0);
      const messageHash = crypto.createHash('sha256').update(message).digest();
      
      const privateKeyObj = bsv.PrivateKey.fromWIF(privateKey);
      const signature = bsv.crypto.ECDSA.sign(messageHash, privateKeyObj);
      const signatureHex = signature.toDER().toString('hex');

      // Get public key
      const publicKey = privateKeyObj.toPublicKey();
      const publicKeyHex = publicKey.toString('hex');

      // Verify signature
      const isValid = bsv.crypto.ECDSA.verify(messageHash, signature, publicKey);
      if (!isValid) {
        throw new Error('Signature verification failed');
      }

      // Check for duplicate signatures from same key
      const existingSignature = this.signatures.find(sig => sig.pubkey === publicKeyHex);
      if (existingSignature) {
        throw new Error('Key has already signed this attestation');
      }

      // Add signature
      const signatureEntry = {
        pubkey: publicKeyHex,
        signature: signatureHex,
        derivation: signerInfo.derivation || 'unknown',
        role: signerInfo.role || 'unknown',
        timestamp: signaturePayload.timestamp,
        message_hash: messageHash.toString('hex'),
        signer_info: {
          name: signerInfo.name || 'Anonymous',
          ...signerInfo
        }
      };

      this.signatures.push(signatureEntry);

      // Check if attestation is now complete
      this.checkCompleteness();

      return {
        success: true,
        signature: signatureEntry,
        complete: this.metadata.finalized,
        signatures_count: this.signatures.length
      };

    } catch (error) {
      throw new Error(`Signature failed: ${error.message}`);
    }
  }

  /**
   * Derive public key from private key
   */
  derivePublicKey(privateKey) {
    const privateKeyObj = bsv.PrivateKey.fromWIF(privateKey);
    return privateKeyObj.toPublicKey().toString('hex');
  }

  /**
   * Check if all required signatures are present
   */
  checkCompleteness() {
    if (!this.payload.required_signatures) {
      return false;
    }

    if (this.payload.required_signatures === 'all_parties') {
      // Check if all parties from payload have signed
      const parties = this.payload.fields?.parties || [];
      const requiredCount = parties.length;
      const currentCount = this.signatures.length;
      
      if (currentCount >= requiredCount) {
        this.metadata.finalized = true;
        this.metadata.finalized_at = new Date().toISOString();
        return true;
      }
    } else if (Array.isArray(this.payload.required_signatures)) {
      // Check specific required signers
      const required = this.payload.required_signatures.length;
      const current = this.signatures.length;
      
      if (current >= required) {
        this.metadata.finalized = true;
        this.metadata.finalized_at = new Date().toISOString();
        return true;
      }
    }

    return false;
  }

  /**
   * Verify all signatures in attestation
   */
  verifyAllSignatures() {
    const results = [];

    for (const sig of this.signatures) {
      try {
        // Reconstruct signature payload
        const signaturePayload = {
          attestation_id: this.id,
          contract_hash: this.metadata.contract_hash,
          action: this.action,
          timestamp: sig.timestamp,
          signer: sig.pubkey
        };

        const message = JSON.stringify(signaturePayload, null, 0);
        const messageHash = crypto.createHash('sha256').update(message).digest();
        const expectedHash = messageHash.toString('hex');

        // Verify hash matches
        if (sig.message_hash !== expectedHash) {
          results.push({
            pubkey: sig.pubkey,
            valid: false,
            error: 'Message hash mismatch'
          });
          continue;
        }

        // Verify signature
        const publicKey = bsv.PublicKey.fromString(sig.pubkey);
        const signature = bsv.crypto.Signature.fromDER(Buffer.from(sig.signature, 'hex'));
        const isValid = bsv.crypto.ECDSA.verify(messageHash, signature, publicKey);

        results.push({
          pubkey: sig.pubkey,
          valid: isValid,
          role: sig.role,
          timestamp: sig.timestamp,
          signer: sig.signer_info?.name || 'Anonymous'
        });

      } catch (error) {
        results.push({
          pubkey: sig.pubkey,
          valid: false,
          error: error.message
        });
      }
    }

    return {
      all_valid: results.every(r => r.valid),
      signature_count: results.length,
      valid_count: results.filter(r => r.valid).length,
      results: results,
      finalized: this.metadata.finalized
    };
  }

  /**
   * Get contract text (if from template)
   */
  getContractText() {
    return this.payload.contract_text || 'No contract text available';
  }

  /**
   * Export attestation for storage or transmission
   */
  export() {
    return {
      id: this.id,
      type: this.type,
      version: this.version,
      subject: this.subject,
      action: this.action,
      payload: this.payload,
      signatures: this.signatures,
      metadata: this.metadata
    };
  }

  /**
   * Import attestation from stored data
   */
  static import(data) {
    return new AttestationBox(data);
  }

  /**
   * Generate hash for blockchain anchoring
   */
  getAnchorHash() {
    const anchorData = {
      id: this.id,
      contract_hash: this.metadata.contract_hash,
      signatures: this.signatures.map(sig => ({
        pubkey: sig.pubkey,
        signature: sig.signature
      })),
      finalized: this.metadata.finalized
    };

    return crypto.createHash('sha256').update(JSON.stringify(anchorData)).digest('hex');
  }
}

/**
 * Attestation Manager
 * High-level interface for managing attestations
 */
export class AttestationManager {
  constructor(config = {}) {
    this.storage = config.storage || new Map(); // In-memory by default
    this.blockchain = config.blockchain || null; // Optional blockchain anchoring
  }

  /**
   * Create new attestation from template
   */
  async createAttestation(templateType, fields, options = {}) {
    const attestation = await AttestationBox.createFromTemplate(templateType, fields, options);
    await this.saveAttestation(attestation);
    return attestation;
  }

  /**
   * Save attestation to storage
   */
  async saveAttestation(attestation) {
    this.storage.set(attestation.id, attestation.export());
    return attestation.id;
  }

  /**
   * Load attestation from storage
   */
  async loadAttestation(id) {
    const data = this.storage.get(id);
    if (!data) {
      throw new Error(`Attestation not found: ${id}`);
    }
    return AttestationBox.import(data);
  }

  /**
   * Sign attestation with private key
   */
  async signAttestation(id, privateKey, signerInfo) {
    const attestation = await this.loadAttestation(id);
    const result = await attestation.addSignature(privateKey, signerInfo);
    await this.saveAttestation(attestation);

    // If finalized, optionally anchor to blockchain
    if (attestation.metadata.finalized && this.blockchain) {
      await this.anchorToBlockchain(attestation);
    }

    return result;
  }

  /**
   * Anchor attestation to blockchain (optional)
   */
  async anchorToBlockchain(attestation) {
    if (!this.blockchain) return null;

    const hash = attestation.getAnchorHash();
    // Placeholder for blockchain anchoring logic
    console.log(`📡 Anchoring attestation ${attestation.id} to blockchain: ${hash}`);
    return hash;
  }

  /**
   * List all attestations
   */
  async listAttestations() {
    const attestations = [];
    for (const [id, data] of this.storage) {
      attestations.push({
        id: data.id,
        subject: data.subject,
        action: data.action,
        signatures: data.signatures.length,
        finalized: data.metadata.finalized,
        created: data.metadata.created
      });
    }
    return attestations;
  }

  /**
   * Get available contract templates
   */
  getAvailableTemplates() {
    return Object.keys(CONTRACT_TEMPLATES).map(key => ({
      type: key,
      version: CONTRACT_TEMPLATES[key].version,
      required_fields: CONTRACT_TEMPLATES[key].required_fields,
      key_type: CONTRACT_TEMPLATES[key].key_type
    }));
  }
}

export { ATTESTATION_KEY_RULES, CONTRACT_TEMPLATES };
export default AttestationBox;