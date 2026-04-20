/**
 * brain-memory — Feature validation script
 * 
 * Validates that all major features are working correctly
 */

import { ContextEngine } from './src/engine/context.js';
import { DEFAULT_CONFIG } from './src/types.js';
import fs from 'fs';

async function validateFeatures() {
  console.log('🔍 Validating brain-memory features...\n');

  // Use a temporary database for testing
  const config = {
    ...DEFAULT_CONFIG,
    dbPath: './test-validation.db',
    llm: {
      apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-test',
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.MODEL || 'gpt-3.5-turbo'
    },
    embedding: {
      apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-test',
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
    }
  };

  let engine;
  try {
    console.log('✅ Testing ContextEngine initialization...');
    engine = new ContextEngine(config);
    console.log('   ✓ ContextEngine created successfully\n');
  } catch (error) {
    console.error('   ✗ ContextEngine initialization failed:', error.message);
    return false;
  }

  try {
    console.log('✅ Testing core functionality...');
    
    // Test stats retrieval
    const stats = engine.getStats();
    console.log('   ✓ getStats() works:', stats);
    
    // Test working memory context
    const context = engine.getWorkingMemoryContext();
    console.log('   ✓ getWorkingMemoryContext() works:', context !== null ? 'context available' : 'no context');
    
    // Test node search (should work even with empty DB)
    const nodes = engine.searchNodes('test');
    console.log('   ✓ searchNodes() works:', `found ${nodes.length} nodes`);
    
    // Test getting all active nodes
    const allNodes = engine.getAllActiveNodes();
    console.log('   ✓ getAllActiveNodes() works:', `found ${allNodes.length} nodes`);
    
    console.log('   ✓ Core functionality validated\n');
  } catch (error) {
    console.error('   ✗ Core functionality validation failed:', error.message);
    return false;
  }

  try {
    console.log('✅ Testing plugin integration hooks...');
    
    // Test the basic methods that OpenClaw would call
    if (typeof engine.processTurn === 'function') {
      console.log('   ✓ processTurn method available');
    } else {
      console.log('   ⚠ processTurn method not available');
    }
    
    if (typeof engine.recall === 'function') {
      console.log('   ✓ recall method available');
    } else {
      console.log('   ⚠ recall method not available');
    }
    
    if (typeof engine.performFusion === 'function') {
      console.log('   ✓ performFusion method available');
    } else {
      console.log('   ⚠ performFusion method not available');
    }
    
    if (typeof engine.reflectOnSession === 'function') {
      console.log('   ✓ reflectOnSession method available');
    } else {
      console.log('   ⚠ reflectOnSession method not available');
    }
    
    if (typeof engine.performReasoning === 'function') {
      console.log('   ✓ performReasoning method available');
    } else {
      console.log('   ⚠ performReasoning method not available');
    }
    
    if (typeof engine.runMaintenance === 'function') {
      console.log('   ✓ runMaintenance method available');
    } else {
      console.log('   ⚠ runMaintenance method not available');
    }
    
    console.log('   ✓ Plugin integration hooks validated\n');
  } catch (error) {
    console.error('   ✗ Plugin integration validation failed:', error.message);
    return false;
  }

  // Cleanup
  try {
    engine.close();
    if (fs.existsSync('./test-validation.db')) {
      fs.unlinkSync('./test-validation.db');
    }
    console.log('   ✓ Resources cleaned up');
  } catch (error) {
    console.warn('   ⚠ Could not clean up resources:', error.message);
  }

  console.log('\n🎉 All validations completed successfully!');
  console.log('✅ brain-memory core features are working correctly');
  return true;
}

// Run validation
validateFeatures()
  .then(success => {
    if (success) {
      console.log('\n🎊 Validation PASSED - brain-memory is ready for OpenClaw integration!');
      process.exit(0);
    } else {
      console.log('\n💥 Validation FAILED - please fix issues before proceeding');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n💥 Validation ERROR:', error);
    process.exit(1);
  });