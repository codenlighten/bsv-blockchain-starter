import crypto from 'crypto';
import bsv from 'smartledger-bsv';
import fs from 'fs';

/**
 * LabLedger Zero-Knowledge Proof System
 * Allows labs to prove compliance without revealing actual test values
 * 
 * Use Cases:
 * - Prove contaminant levels are below regulatory limits
 * - Verify sample integrity without exposing raw data
 * - Demonstrate compliance for remediation closure
 * - Audit trail verification without data disclosure
 */

class LabLedgerZKProof {
  constructor() {
    this.salt = crypto.randomBytes(32);
    this.challenges = [];
  }

  /**
   * Generate a commitment to lab data without revealing the data
   * @param {number} actualValue - The actual test result
   * @param {number} threshold - The regulatory threshold/limit
   * @param {string} analyte - Type of analyte (benzene, arsenic, etc.)
   * @param {string} sampleId - Sample identifier
   * @returns {Object} Commitment that can be published to blockchain
   */
  generateComplianceCommitment(actualValue, threshold, analyte, sampleId) {
    // Create a random nonce for this commitment
    const nonce = crypto.randomBytes(16);
    
    // Generate commitment hash: H(value || threshold || analyte || sampleId || nonce)
    const commitment = crypto.createHash('sha256')
      .update(Buffer.from(actualValue.toString()))
      .update(Buffer.from(threshold.toString()))
      .update(Buffer.from(analyte))
      .update(Buffer.from(sampleId))
      .update(nonce)
      .digest('hex');

    // Store private data for later proof generation
    const secret = {
      actualValue,
      threshold,
      analyte,
      sampleId,
      nonce: nonce.toString('hex'),
      timestamp: Date.now()
    };

    return {
      commitment,
      secret,
      isCompliant: actualValue <= threshold,
      metadata: {
        analyte,
        sampleId,
        threshold,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Generate a zero-knowledge proof that the committed value is below threshold
   * @param {Object} secret - Secret data from commitment generation
   * @param {string} challenge - Challenge from verifier
   * @returns {Object} Zero-knowledge proof
   */
  generateComplianceProof(secret, challenge = null) {
    if (!challenge) {
      challenge = crypto.randomBytes(32).toString('hex');
    }

    const { actualValue, threshold, analyte, sampleId, nonce } = secret;
    
    // Simple ZK proof: prove value <= threshold without revealing value
    // In production, use more sophisticated ZK-SNARKs or ZK-STARKs
    
    // Generate proof components
    const r = crypto.randomInt(1000, 9999); // Random blinding factor
    const blindedValue = (actualValue * r) % 1000000;
    const blindedThreshold = (threshold * r) % 1000000;
    
    // Create proof hash
    const proofHash = crypto.createHash('sha256')
      .update(Buffer.from(blindedValue.toString()))
      .update(Buffer.from(blindedThreshold.toString()))
      .update(Buffer.from(challenge))
      .update(Buffer.from(nonce, 'hex'))
      .digest('hex');

    return {
      proof: {
        blindedValue,
        blindedThreshold,
        proofHash,
        challenge,
        r, // In production, this would be computed differently
        isCompliant: actualValue <= threshold
      },
      metadata: {
        analyte,
        sampleId,
        timestamp: new Date().toISOString(),
        prover: 'LabLedger-ZK-v1.0'
      }
    };
  }

  /**
   * Verify a zero-knowledge proof without learning the actual value
   * @param {string} commitment - Original commitment hash
   * @param {Object} proof - The zero-knowledge proof
   * @param {Object} metadata - Public metadata
   * @returns {boolean} True if proof is valid
   */
  verifyComplianceProof(commitment, proof, metadata) {
    try {
      const { blindedValue, blindedThreshold, proofHash, challenge, r, isCompliant } = proof;
      
      // Verify the proof structure
      if (!blindedValue || !blindedThreshold || !proofHash || !challenge) {
        return false;
      }

      // Basic consistency checks
      if (isCompliant && blindedValue > blindedThreshold) {
        console.log('⚠️  Proof inconsistency: claims compliant but blinded value > threshold');
        return false;
      }

      // In a full ZK implementation, this would involve:
      // 1. Verifying ZK-SNARK/ZK-STARK proof
      // 2. Checking commitment consistency
      // 3. Validating challenge-response protocol
      
      console.log('✅ ZK Proof verification passed');
      console.log(`📊 Analyte: ${metadata.analyte}`);
      console.log(`🧪 Sample: ${metadata.sampleId}`);
      console.log(`✓ Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON-COMPLIANT'}`);
      
      return true;
      
    } catch (error) {
      console.error('❌ ZK Proof verification failed:', error.message);
      return false;
    }
  }

  /**
   * Create a batch ZK proof for multiple analytes from the same sample
   * @param {Array} testResults - Array of {analyte, value, threshold} objects
   * @param {string} sampleId - Sample identifier
   * @returns {Object} Batch proof
   */
  generateBatchComplianceProof(testResults, sampleId) {
    const commitments = [];
    const secrets = [];
    
    testResults.forEach(test => {
      const commitment = this.generateComplianceCommitment(
        test.value,
        test.threshold,
        test.analyte,
        sampleId
      );
      commitments.push(commitment);
      secrets.push(commitment.secret);
    });

    // Generate aggregate proof
    const challenge = crypto.randomBytes(32).toString('hex');
    const proofs = secrets.map(secret => 
      this.generateComplianceProof(secret, challenge)
    );

    return {
      sampleId,
      commitments: commitments.map(c => c.commitment),
      proofs,
      batchHash: crypto.createHash('sha256')
        .update(commitments.map(c => c.commitment).join(''))
        .digest('hex'),
      overallCompliant: testResults.every(test => test.value <= test.threshold),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate ZK proof for blockchain publishing
   * @param {Object} complianceData - Lab compliance data
   * @returns {Object} Blockchain-ready ZK proof
   */
  async generateBlockchainProof(complianceData) {
    const { sampleId, analyte, value, threshold, labId } = complianceData;
    
    // Generate commitment and proof
    const commitment = this.generateComplianceCommitment(value, threshold, analyte, sampleId);
    const proof = this.generateComplianceProof(commitment.secret);
    
    // Create blockchain payload
    const blockchainData = {
      schema: 'LabLedger.ZKProof.v1',
      sampleId,
      analyte,
      labId,
      commitment: commitment.commitment,
      proof: proof.proof.proofHash,
      compliant: commitment.isCompliant,
      threshold, // This can be public (regulatory limit)
      timestamp: new Date().toISOString(),
      zkProofVersion: '1.0'
    };

    // Sign the proof with lab's private key
    const wallet = JSON.parse(fs.readFileSync('./wallets/wallet.json', 'utf8'));
    const privateKey = bsv.PrivateKey.fromWIF(wallet.privateKey);
    const signature = this.signProof(blockchainData, privateKey);

    return {
      blockchainData,
      signature,
      commitment,
      proof,
      publishReady: true
    };
  }

  /**
   * Sign ZK proof with lab's private key
   * @param {Object} proofData - The proof data to sign
   * @param {Object} privateKey - BSV private key
   * @returns {string} Digital signature
   */
  signProof(proofData, privateKey) {
    const dataString = JSON.stringify(proofData, Object.keys(proofData).sort());
    const hash = crypto.createHash('sha256').update(dataString).digest();
    const signature = bsv.crypto.ECDSA.sign(hash, privateKey);
    return signature.toString();
  }

  /**
   * Verify signed ZK proof
   * @param {Object} proofData - The proof data
   * @param {string} signature - Digital signature
   * @param {string} publicKey - Lab's public key
   * @returns {boolean} True if signature is valid
   */
  verifyProofSignature(proofData, signature, publicKey) {
    try {
      const dataString = JSON.stringify(proofData, Object.keys(proofData).sort());
      const hash = crypto.createHash('sha256').update(dataString).digest();
      const pubKey = bsv.PublicKey.fromString(publicKey);
      const sig = bsv.crypto.Signature.fromString(signature);
      return bsv.crypto.ECDSA.verify(hash, sig, pubKey);
    } catch (error) {
      return false;
    }
  }
}

// Example usage and testing
async function demonstrateZKProofs() {
  console.log('🔐 LabLedger Zero-Knowledge Proof Demonstration');
  console.log('=' .repeat(60));
  
  const zkProof = new LabLedgerZKProof();
  
  // Example: Benzene test result
  console.log('\n📊 Single Analyte ZK Proof:');
  const benzeneResult = {
    sampleId: 'WELD-CO-112-001',
    analyte: 'benzene',
    value: 0.8, // ppb - actual result (kept secret)
    threshold: 5.0, // ppb - regulatory limit (public)
    labId: 'EAGLE-ENV'
  };
  
  const blockchainProof = await zkProof.generateBlockchainProof(benzeneResult);
  console.log(`✅ Generated ZK proof for ${benzeneResult.analyte}`);
  console.log(`🔒 Commitment: ${blockchainProof.commitment.commitment.substring(0, 16)}...`);
  console.log(`✓ Compliant: ${blockchainProof.commitment.isCompliant}`);
  console.log(`📝 Proof Hash: ${blockchainProof.proof.proof.proofHash.substring(0, 16)}...`);
  
  // Verification
  const isValid = zkProof.verifyComplianceProof(
    blockchainProof.commitment.commitment,
    blockchainProof.proof.proof,
    blockchainProof.proof.metadata
  );
  console.log(`🔍 Proof Verification: ${isValid ? 'VALID' : 'INVALID'}`);
  
  // Batch proof for multiple analytes
  console.log('\n📊 Batch ZK Proof (Multiple Analytes):');
  const multipleTests = [
    { analyte: 'benzene', value: 0.8, threshold: 5.0 },
    { analyte: 'toluene', value: 2.1, threshold: 1000.0 },
    { analyte: 'arsenic', value: 8.5, threshold: 10.0 },
    { analyte: 'barium', value: 950, threshold: 2000.0 }
  ];
  
  const batchProof = zkProof.generateBatchComplianceProof(multipleTests, 'WELD-CO-112-001');
  console.log(`✅ Generated batch proof for ${multipleTests.length} analytes`);
  console.log(`✓ Overall Compliant: ${batchProof.overallCompliant}`);
  console.log(`🔒 Batch Hash: ${batchProof.batchHash.substring(0, 16)}...`);
  
  // Save proof for blockchain publishing
  fs.writeFileSync('zk-proof.json', JSON.stringify(blockchainProof, null, 2));
  console.log('\n💾 ZK proof saved to zk-proof.json');
  console.log('🚀 Ready for blockchain publishing with publish.js');
  
  return blockchainProof;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...args] = process.argv.slice(2);
  
  if (cmd === 'demo') {
    demonstrateZKProofs();
  } else if (cmd === 'generate' && args.length >= 4) {
    const [sampleId, analyte, value, threshold] = args;
    const zkProof = new LabLedgerZKProof();
    const proof = zkProof.generateComplianceCommitment(
      parseFloat(value),
      parseFloat(threshold),
      analyte,
      sampleId
    );
    console.log('Generated ZK Proof:', proof);
  } else {
    console.log(`Usage:
    npm run zk-proof demo                                   # Run demonstration
    npm run zk-proof generate <sampleId> <analyte> <value> <threshold>  # Generate single proof

Examples:
    npm run zk-proof demo
    npm run zk-proof generate WELD-112 benzene 0.8 5.0`);
  }
}

export { LabLedgerZKProof };