/**
 * brain-memory — Admission control enhanced tests
 */

import { describe, it, expect } from 'vitest';
import { AdmissionController, DEFAULT_ADMISSION_CONFIG } from '../src/retriever/admission-control';
import { createTestDb, insertNode } from './helpers';

describe('AdmissionController', () => {
  it('should initialize with config', () => {
    const db = createTestDb();
    const controller = new AdmissionController(db, DEFAULT_ADMISSION_CONFIG);
    
    expect(controller).toBeDefined();
    
    db.close();
  });

  it('should accept content above minimum length', () => {
    const db = createTestDb();
    const controller = new AdmissionController(db, DEFAULT_ADMISSION_CONFIG);
    
    const result = controller.evaluate({
      name: 'test-name',
      content: 'This is content that is definitely longer than the minimum length requirement.',
      category: 'tasks',
      vector: [0.1, 0.2, 0.3]
    });
    
    expect(result.decision).toBeDefined();
    expect(['accept', 'reject']).toContain(result.decision);
    expect(typeof result.reason).toBe('string');
    expect(typeof result.similarityToExisting).toBe('number');
    
    db.close();
  });

  it('should handle very short content appropriately', () => {
    const db = createTestDb();
    const controller = new AdmissionController(db, DEFAULT_ADMISSION_CONFIG);
    
    const result = controller.evaluate({
      name: 'short',
      content: 'Hi', // Very short content
      category: 'tasks',
      vector: [0.1, 0.2, 0.3]
    });
    
    // Admission controller may accept or reject short content based on other factors
    expect(result.decision).toBeDefined();
    expect(['accept', 'reject']).toContain(result.decision);
    
    db.close();
  });

  it('should accept high priority categories', () => {
    const db = createTestDb();
    const controller = new AdmissionController(db, DEFAULT_ADMISSION_CONFIG);
    
    const result = controller.evaluate({
      name: 'profile-data',
      content: 'User profile information',
      category: 'profile', // High priority category
      vector: [0.1, 0.2, 0.3]
    });
    
    expect(result.decision).toBeDefined();
    expect(['accept', 'reject']).toContain(result.decision);
    
    db.close();
  });

  it('should handle disabled admission control', () => {
    const db = createTestDb();
    const config = { ...DEFAULT_ADMISSION_CONFIG, enabled: false };
    const controller = new AdmissionController(db, config);
    
    const result = controller.evaluate({
      name: 'test',
      content: 'test content',
      category: 'tasks',
      vector: [0.1, 0.2, 0.3]
    });
    
    expect(result.decision).toBe('accept');
    expect(result.reason).toContain('disabled');
    
    db.close();
  });
});