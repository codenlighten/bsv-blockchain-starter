import OpenAI from "openai";
import dotenv from "dotenv";
import { encode } from "gpt-tokenizer";
import { signData, verifySignature, getPublicKeyFromPrivateKey, getAddressFromPrivateKey } from "./tools/derSignature.js";
import { platformAddress, platformPublicKey, createAgentKeys } from "./signature.js";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const OPENAI_MODEL = "gpt-4o-mini";

dotenv.config();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ======================================================
 * Memory Manager — rolling 21-message + 3-summary logic
 * ====================================================== */
export class MemoryManager {
  constructor({ 
    maxInteractions = 21, 
    maxSummaries = 3, 
    tokenLimit = 100000,
    persistToFile = true,
    memoryDir = './memory',
    ownerName = 'default'
  } = {}) {
    this.maxInteractions = maxInteractions;
    this.maxSummaries = maxSummaries;
    this.tokenLimit = tokenLimit;
    this.persistToFile = persistToFile;
    this.memoryDir = memoryDir;
    this.ownerName = ownerName;

    this.interactions = []; // [{ role, text, ts }]
    this.summaries = [];    // [{ range, text, ts }]
    this.totalCount = 0;

    // Initialize file persistence if enabled
    if (this.persistToFile) {
      this._initializeFileSystem();
      this._loadFromFile();
    }
  }

  async _initializeFileSystem() {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
      console.log(`📁 Memory directory initialized: ${this.memoryDir}`);
    } catch (error) {
      console.error(`❌ Failed to create memory directory: ${error.message}`);
      this.persistToFile = false;
    }
  }

  _getMemoryFilePath(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const fileName = `${this.ownerName}-memory-${targetDate}.json`;
    return path.join(this.memoryDir, fileName);
  }

  async _loadFromFile() {
    try {
      const filePath = this._getMemoryFilePath();
      console.log(`🔄 Loading memory from: ${filePath}`);
      
      const data = await fs.readFile(filePath, 'utf8');
      const memoryData = JSON.parse(data);
      
      this.interactions = memoryData.interactions || [];
      this.summaries = memoryData.summaries || [];
      this.totalCount = memoryData.totalCount || 0;
      
      console.log(`✅ Memory loaded: ${this.interactions.length} interactions, ${this.summaries.length} summaries, totalCount: ${this.totalCount}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`📝 No existing memory file found, starting fresh session`);
      } else {
        console.error(`❌ Error loading memory: ${error.message}`);
      }
    }
  }

  async _saveToFile() {
    if (!this.persistToFile) return;
    
    try {
      const filePath = this._getMemoryFilePath();
      const memoryData = {
        interactions: this.interactions,
        summaries: this.summaries,
        totalCount: this.totalCount,
        lastUpdated: new Date().toISOString(),
        metadata: {
          ownerName: this.ownerName,
          maxInteractions: this.maxInteractions,
          maxSummaries: this.maxSummaries,
          tokenLimit: this.tokenLimit
        }
      };
      
      await fs.writeFile(filePath, JSON.stringify(memoryData, null, 2), 'utf8');
      console.log(`💾 Memory saved to: ${filePath}`);
    } catch (error) {
      console.error(`❌ Error saving memory: ${error.message}`);
    }
  }

  async _createBackup() {
    if (!this.persistToFile) return;
    
    try {
      const currentFile = this._getMemoryFilePath();
      const backupFile = currentFile.replace('.json', `-backup-${Date.now()}.json`);
      
      await fs.copyFile(currentFile, backupFile);
      console.log(`🔒 Memory backup created: ${backupFile}`);
    } catch (error) {
      console.error(`❌ Error creating backup: ${error.message}`);
    }
  }

  _countTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    try { return encode(text).length; }
    catch { return text.split(/\s+/).length * 1.3; }
  }

  _contextTokenCount() {
    const inter = this.interactions.reduce((n, i) => n + this._countTokens(i.text), 0);
    const sums = this.summaries.reduce((n, s) => n + this._countTokens(s.text), 0);
    return inter + sums;
  }

  async addInteraction(role, text, signature = null, publicKey = null, originalHash = null) {
    const ts = new Date().toISOString();
    this.totalCount += 1;
    
    // Create interaction object with cryptographic fields
    const interaction = { 
      role, 
      text, 
      ts,
      signature,
      publicKey,
      originalHash,
      verified: false
    };

    // Verify signature if provided
    if (signature && publicKey) {
      try {
        // Use original hash if provided, otherwise create new hash
        const hashToVerify = originalHash || crypto.createHash('sha256').update(text).digest('hex');
        interaction.textHash = hashToVerify;
        interaction.verified = await verifySignature(hashToVerify, signature, publicKey);
        if (interaction.verified) {
          console.log(`✅ Signature verified for ${role} message`);
        } else {
          console.log(`❌ Signature verification failed for ${role} message`);
        }
      } catch (error) {
        console.error(`❌ Signature verification error: ${error.message}`);
        interaction.verified = false;
      }
    }

    this.interactions.push(interaction);

    // If > maxInteractions messages, summarize the newest batch
    if (this.interactions.length > this.maxInteractions) {
      console.log(`📊 Creating summary for interactions ${this.totalCount - this.maxInteractions} to ${this.totalCount}`);
      const startIndex = this.totalCount - this.maxInteractions;
      const endIndex = this.totalCount;
      const summary = await this._summarizeWindow(startIndex, endIndex);
      this._storeSummary(summary, startIndex, endIndex);
      this.interactions.shift(); // remove oldest
    }

    // If token budget exceeded, compress summaries
    if (this._contextTokenCount() > this.tokenLimit) {
      console.log(`🗜️ Token limit exceeded, compressing summaries`);
      await this._compressSummaries();
    }

    // Save to file after each interaction
    await this._saveToFile();
  }

  async _summarizeWindow(startIndex, endIndex) {
    const windowText = this.interactions.map(i => `${i.role}: ${i.text}`).join("\n");
    const systemPrompt = `
You are a conversation summarizer.
Summarize these 21 messages (≈300 words) preserving:
• Goals, decisions, facts, names, and evolving state.
Output valid JSON:
{
  "range": {"startIndex": number, "endIndex": number},
  "text": string,
  "ts": string
}`;

    const res = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: windowText }
      ],
      response_format: { type: "json_object" }
    });

    try {
      return JSON.parse(res.choices[0].message.content);
    } catch (err) {
      console.error("❌ _summarizeWindow JSON parse error:", err);
      console.error("Raw content:", res.choices[0].message.content);
      return {
        range: { startIndex, endIndex },
        text: `Summary of ${startIndex}-${endIndex}: ${windowText.slice(0, 400)}...`,
        ts: new Date().toISOString()
      };
    }
  }

  _storeSummary(summary, startIndex, endIndex) {
    const entry = {
      range: { startIndex, endIndex },
      text: summary.text || summary,
      ts: new Date().toISOString()
    };
    this.summaries.push(entry);
    if (this.summaries.length > this.maxSummaries) this.summaries.shift();
  }

  async _compressSummaries() {
    if (this.summaries.length < 3) return;
    const combined = this.summaries.map((s, i) => `(${i + 1}) ${s.text}`).join("\n");

    const res = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: "Condense the following summaries into one, preserving all key facts, names, and goals." },
        { role: "user", content: combined }
      ]
    });

    const meta = res.choices[0].message.content;
    this.summaries = [{
      range: { startIndex: 0, endIndex: this.totalCount },
      text: meta,
      ts: new Date().toISOString()
    }];
  }

  getContext() {
    const summaryMessages = this.summaries.slice(-3).map(s => ({
      role: "system",
      content: `Summary of conversation from message ${s.range.startIndex} to ${s.range.endIndex}:\n${s.text}`
    }));

    const interactionMessages = this.interactions.map(i => ({
      role: i.role === 'ai' ? 'assistant' : i.role,
      content: i.text
    }));

    return [
      ...summaryMessages,
      ...interactionMessages
    ];
  }

  getStats() {
    return {
      enabled: true,
      interactions: this.interactions.length,
      summaries: this.summaries.length,
      totalCount: this.totalCount,
      tokenCount: this._contextTokenCount(),
      persistenceEnabled: this.persistToFile,
      memoryFile: this.persistToFile ? this._getMemoryFilePath() : null,
      ownerName: this.ownerName
    };
  }
}

/* ======================================================
 * Cryptographically Signed Response Helper with Agent Identity
 * ====================================================== */
export async function signedStructuredResponse({
  query,
  schema,
  context,
  model = OPENAI_MODEL,
  temperature = 0.2,
  systemPrompt = "You are an AI that outputs ONLY valid JSON strictly conforming to the provided schema. Include a 'missingContext' array describing any missing information needed for perfection. If nothing is missing, return an empty array.",
  agentKey = null // New parameter for agent-specific signing
} = {}) {

  // Default envelope schema with cryptographic fields and conversation control
  const baseSchema = {
    type: "object",
    properties: {
      response: { type: "string" },
      includesCode: { type: "boolean" },
      code: { type: "string" },
      continue: { 
        type: "boolean", 
        description: "Whether this agent has more work to do and should be called again automatically" 
      },
      questionForUser: { 
        type: "boolean", 
        description: "Whether this agent has a follow-up question for the user" 
      },
      question: { 
        type: "string", 
        description: "The follow-up question for the user (only if questionForUser is true)" 
      }
    },
    required: ["response", "includesCode", "code", "continue", "questionForUser"]
  };

  // Merge user-provided schema (if any) with the base envelope
  const mergedSchema = schema
    ? {
        type: "object",
        properties: {
          ...schema.properties,
          ...baseSchema.properties
        },
        required: Array.from(new Set([
          ...(schema.required || []),
          ...baseSchema.required
        ]))
      }
    : baseSchema;

  const schemaPrompt = `You must respond with a JSON object that follows this JSON schema exactly: ${JSON.stringify(
    mergedSchema
  )}. Do not include any additional commentary or explanations.`;

  const messages = [
    { role: "system", content: `${systemPrompt}\n${schemaPrompt}` }
  ];

  if (context) {
    messages.push({
      role: "system",
      content: `Additional context for your reasoning:\n${JSON.stringify(context, null, 2)}`
    });
  }

  if (query) {
    messages.push({ role: "user", content: query });
  }

  const response = await client.chat.completions.create({
    model,
    temperature,
    messages,
    response_format: { type: "json_object" }
  });

  try {
    const aiResponse = JSON.parse(response.choices[0].message.content);
    
    // Create cryptographic signature for the response
    const responseText = JSON.stringify(aiResponse);
    const responseHash = crypto.createHash('sha256').update(responseText).digest('hex');
    
    // Use agent-specific key if provided, otherwise use platform key
    let signature, signingAddress, publicKey;
    if (agentKey && agentKey.privateKey) {
      signature = await signData(responseHash, agentKey.privateKey);
      signingAddress = getAddressFromPrivateKey(agentKey.privateKey);
      publicKey = getPublicKeyFromPrivateKey(agentKey.privateKey);
    } else {
      // Get platform key from environment or create one
      const platformKeys = createAgentKeys('platform');
      signature = await signData(responseHash, platformKeys.privateKey);
      signingAddress = platformKeys.address;
      publicKey = platformKeys.publicKey;
    }
    
    // Return signed response with cryptographic proof
    return {
      ...aiResponse,
      _signature: {
        signature,
        responseHash,
        address: signingAddress,
        publicKey: publicKey,
        timestamp: new Date().toISOString(),
        algorithm: "BSV-ECDSA-DER",
        encoding: "hex",
        agentIdentity: agentKey ? agentKey.agentName : "Platform"
      }
    };
  } catch (err) {
    console.error("❌ JSON parse error:", err);
    return {
      response: "Error parsing model output.",
      includesCode: false,
      code: "",
      error: response.choices[0].message.content,
      _signature: null
    };
  }
}

/* ======================================================
 * Signature Verification Helper
 * ====================================================== */
export async function verifyResponseSignature(signedResponse) {
  if (!signedResponse._signature) {
    return { verified: false, error: "No signature found" };
  }

  const { signature, responseHash, publicKey, timestamp, algorithm } = signedResponse._signature;
  
  try {
    // Recreate response without signature for verification
    const responseWithoutSig = { ...signedResponse };
    delete responseWithoutSig._signature;
    const responseText = JSON.stringify(responseWithoutSig);
    const computedHash = crypto.createHash('sha256').update(responseText).digest('hex');
    
    // Verify hash matches
    if (computedHash !== responseHash) {
      return { 
        verified: false, 
        error: "Response hash mismatch",
        expected: responseHash,
        computed: computedHash
      };
    }
    
    // Verify signature
    const isValid = await verifySignature(responseHash, signature, publicKey);
    
    return {
      verified: isValid,
      publicKey,
      timestamp,
      algorithm,
      responseHash,
      error: isValid ? null : "Signature verification failed"
    };
  } catch (error) {
    return {
      verified: false,
      error: `Verification error: ${error.message}`
    };
  }
}
/* ======================================================
 * Chatbot Conversation Loop (demo) with Signatures
 * ====================================================== */
const memory = new MemoryManager({ maxInteractions: 21, maxSummaries: 3 });

export async function chatWithMemory(userMessage, schema = null, context = null) {
  // Sign the user message
  const messageHash = crypto.createHash('sha256').update(userMessage).digest('hex');
  const userSignature = await signData(messageHash);
  
  await memory.addInteraction("user", userMessage, userSignature, platformAddress, messageHash);
  const contextMessages = memory.getContext();

  const schemaToUse = schema || {
    type: "object",
    properties: {
      response: { type: "string" },
      includesCode: { type: "boolean" },
      code: { type: "string" }
    },
    required: ["response", "includesCode", "code"]
  };

  const res = await signedStructuredResponse({
    query: userMessage,
    schema: schemaToUse,
    context,
    model: OPENAI_MODEL,
    temperature: 0.4
  });

  // Extract signature info for storage
  const aiResponseText = JSON.stringify(res);
  const aiSignature = res._signature?.signature;
  const aiPublicKey = res._signature?.publicKey;
  const aiResponseHash = res._signature?.responseHash;

  await memory.addInteraction("ai", aiResponseText, aiSignature, aiPublicKey, aiResponseHash);
  return res;
}

/* ======================================================
 * Export
 * ====================================================== */
export default { 
  signedStructuredResponse, 
  verifyResponseSignature,
  chatWithMemory, 
  MemoryManager 
};

// Keep legacy export for backwards compatibility
export { signedStructuredResponse as structuredResponse };
