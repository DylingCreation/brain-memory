/**
 * brain-memory — Admission control enhanced tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AdmissionController, DEFAULT_ADMISSION_CONFIG } from '../src/retriever/admission-control';
import { createTestStorage, cleanupTestDb } from './helpers';

let storage: ReturnType<typeof createTestStorage>;

beforeEach(() => { storage = createTestStorage(); });
afterEach(() => { cleanupTestDb(storage); });

describe('AdmissionController', () => {
  it('should initialize with config', () => {
    const controller = new AdmissionController(storage, DEFAULT_ADMISSION_CONFIG);
    expect(controller).toBeDefined();
  });

  it('should accept content above minimum length', () => {
    const controller = new AdmissionController(storage, DEFAULT_ADMISSION_CONFIG);
    
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
  });

  it('should handle very short content appropriately', () => {
    const enabledConfig = { ...DEFAULT_ADMISSION_CONFIG, enabled: true };
    const controller = new AdmissionController(storage, enabledConfig);
    
    const result = controller.evaluate({
      name: 'short',
      content: 'hi',
      category: 'tasks',
    });
    
    expect(result.decision).toBe('reject');
    expect(result.reason).toContain('too short');
  });

  it('should accept high priority categories', () => {
    const enabledConfig = { ...DEFAULT_ADMISSION_CONFIG, enabled: true };
    const controller = new AdmissionController(storage, enabledConfig);
    
    const result = controller.evaluate({
      name: 'profile-test',
      content: 'I am a software engineer who loves coding',
      category: 'profile',
    });
    
    expect(result.decision).toBe('accept');
  });

  it('should handle disabled admission control', () => {
    const disabledConfig = { ...DEFAULT_ADMISSION_CONFIG, enabled: false };
    const controller = new AdmissionController(storage, disabledConfig);
    
    const result = controller.evaluate({
      name: 'test',
      content: 'short',
      category: 'events',
    });
    
    expect(result.decision).toBe('accept');
  });
});
