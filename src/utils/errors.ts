/**
 * brain-memory — Unified error types
 *
 * R3 fix: Replaces raw `throw new Error(msg)` with typed error classes,
 * allowing callers to differentiate between config, storage, LLM, and runtime errors.
 */

/** Base error for all brain-memory errors. Carries an error code for programmatic handling. */
export class BrainMemoryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.code = code;
    this.name = 'BrainMemoryError';
  }
}

/** Configuration error — invalid or missing config values. */
export class ConfigError extends BrainMemoryError {
  constructor(message: string) {
    super('CONFIG_ERROR', message);
    this.name = 'ConfigError';
  }
}

/** Storage error — database connection, schema, or I/O failures. */
export class StorageError extends BrainMemoryError {
  constructor(message: string) {
    super('STORAGE_ERROR', message);
    this.name = 'StorageError';
  }
}

/** LLM error — model invocation failures, rate limits, invalid responses. */
export class LLMError extends BrainMemoryError {
  constructor(message: string) {
    super('LLM_ERROR', message);
    this.name = 'LLMError';
  }
}

/** Embedding error — embedding service failures. */
export class EmbeddingError extends BrainMemoryError {
  constructor(message: string) {
    super('EMBED_ERROR', message);
    this.name = 'EmbeddingError';
  }
}

/** Validation error — invalid input data or type constraints. */
export class ValidationError extends BrainMemoryError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}

/** Runtime error — unexpected internal failures. */
export class RuntimeError extends BrainMemoryError {
  constructor(message: string) {
    super('RUNTIME_ERROR', message);
    this.name = 'RuntimeError';
  }
}
