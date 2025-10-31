import fetch from 'node-fetch';
import bsv from 'smartledger-bsv';
import dotenv from 'dotenv';

dotenv.config();

const NETWORK = process.env.BSV_NETWORK || 'main';
const API_BASE = `https://api.whatsonchain.com/v1/bsv/${NETWORK}`;

/**
 * Extract OP_RETURN data from a transaction
 * @param {string} txid - Transaction ID to analyze
 * @returns {Object} Object containing extracted data and metadata
 */
async function extractOpReturnFromTx(txid) {
  try {
    console.log(`🔍 Fetching transaction: ${txid}`);
    
    // Get raw transaction hex
    const response = await fetch(`${API_BASE}/tx/${txid}/hex`);
    if (!response.ok) {
      throw new Error(`Failed to fetch transaction: ${response.status}`);
    }
    
    const rawHex = await response.text();
    console.log(`📄 Raw transaction size: ${rawHex.length / 2} bytes`);
    
    // Parse transaction with BSV library
    const tx = new bsv.Transaction(rawHex);
    
    const results = [];
    
    // Check each output for OP_RETURN data
    tx.outputs.forEach((output, index) => {
      const script = output.script;
      
      // Check if this is an OP_RETURN output (starts with OP_FALSE OP_RETURN)
      if (script.chunks && script.chunks.length >= 2) {
        const firstOp = script.chunks[0].opcodenum;
        const secondOp = script.chunks[1].opcodenum;
        
        // OP_FALSE = 0, OP_RETURN = 106
        if (firstOp === 0 && secondOp === 106) {
          console.log(`📝 Found OP_RETURN in output ${index}`);
          
          // Extract data from subsequent chunks
          const dataChunks = script.chunks.slice(2);
          let extractedData = '';
          let rawBytes = Buffer.alloc(0);
          
          dataChunks.forEach((chunk, chunkIndex) => {
            if (chunk.buf) {
              rawBytes = Buffer.concat([rawBytes, chunk.buf]);
              
              // Try to decode as UTF-8 text
              try {
                const text = chunk.buf.toString('utf8');
                extractedData += text;
              } catch (e) {
                // If not valid UTF-8, show as hex
                extractedData += `[HEX: ${chunk.buf.toString('hex')}]`;
              }
            }
          });
          
          results.push({
            outputIndex: index,
            satoshis: output.satoshis,
            dataText: extractedData,
            dataHex: rawBytes.toString('hex'),
            dataSize: rawBytes.length,
            chunks: dataChunks.length,
            script: script.toHex()
          });
        }
      }
    });
    
    return {
      txid,
      timestamp: new Date().toISOString(),
      totalOutputs: tx.outputs.length,
      opReturnOutputs: results.length,
      data: results,
      explorer: `https://whatsonchain.com/tx/${txid}`
    };
    
  } catch (error) {
    console.error('❌ Error extracting OP_RETURN:', error.message);
    throw error;
  }
}

/**
 * Extract and display OP_RETURN data in a nice format
 * @param {string} txid - Transaction ID
 */
async function displayOpReturnData(txid) {
  try {
    const result = await extractOpReturnFromTx(txid);
    
    console.log('\n📊 OP_RETURN Extraction Results');
    console.log('=' .repeat(50));
    console.log(`🔗 Transaction: ${result.txid}`);
    console.log(`📅 Extracted: ${result.timestamp}`);
    console.log(`📦 Total Outputs: ${result.totalOutputs}`);
    console.log(`📝 OP_RETURN Outputs: ${result.opReturnOutputs}`);
    console.log(`🌐 Explorer: ${result.explorer}`);
    
    if (result.data.length === 0) {
      console.log('⚠️  No OP_RETURN data found in this transaction');
      return result;
    }
    
    result.data.forEach((opReturn, index) => {
      console.log(`\n📝 OP_RETURN Output #${opReturn.outputIndex}:`);
      console.log(`   💰 Value: ${opReturn.satoshis} satoshis`);
      console.log(`   📏 Data Size: ${opReturn.dataSize} bytes`);
      console.log(`   🧩 Chunks: ${opReturn.chunks}`);
      console.log(`   📄 Text Data:`);
      console.log(`   "${opReturn.dataText}"`);
      console.log(`   🔢 Hex Data: ${opReturn.dataHex}`);
    });
    
    return result;
    
  } catch (error) {
    console.error('❌ Failed to extract OP_RETURN data:', error.message);
    return null;
  }
}

/**
 * Extract OP_RETURN data from multiple transactions
 * @param {string[]} txids - Array of transaction IDs
 */
async function extractFromMultipleTx(txids) {
  const results = [];
  
  for (const txid of txids) {
    try {
      console.log(`\n🔄 Processing ${txid}...`);
      const result = await extractOpReturnFromTx(txid);
      results.push(result);
      
      // Rate limiting to be nice to the API
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ Failed to process ${txid}: ${error.message}`);
      results.push({ txid, error: error.message });
    }
  }
  
  return results;
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...args] = process.argv.slice(2);
  
  if (cmd === 'extract' && args.length > 0) {
    // Extract from single transaction
    displayOpReturnData(args[0]);
  } else if (cmd === 'batch' && args.length > 0) {
    // Extract from multiple transactions
    extractFromMultipleTx(args).then(results => {
      console.log(`\n📊 Batch extraction complete: ${results.length} transactions processed`);
    });
  } else if (cmd === 'test') {
    // Test with your recent transactions
    console.log('🧪 Testing with your improved OP_RETURN extractor...');
    const testTxids = [
      '0133eea25dd86611d958a0d09d268b1806a9ab12b451b843812e6cc705422e94',
      '0824a93ded8ce3a5aac24af45d324ea5046c9dc811cd25f57fd9c0d7cd09b7c7'
    ];
    extractFromMultipleTx(testTxids);
  } else {
    console.log(`Usage:
    npm run extract <txid>              # Extract from single transaction
    npm run extract batch <txid1> <txid2> ...   # Extract from multiple transactions  
    npm run extract test                        # Test with your recent AI transactions

Examples:
    npm run extract 0133eea25dd86611d958a0d09d268b1806a9ab12b451b843812e6cc705422e94
    npm run extract test`);
  }
}

export { extractOpReturnFromTx, displayOpReturnData, extractFromMultipleTx };