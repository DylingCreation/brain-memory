import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Configure test environment
    environment: 'node',
    
    // Test file patterns — unified test root
    include: ['test/**/*.test.{ts,js}', 'test/**/*.spec.{ts,js}'],
    exclude: ['node_modules', 'dist'],
    
    // Test globals
    globals: true,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'test/**',
        'dist/**',
        'scripts/**',
        'docs/**',
        '**/types.ts',
        '**/prompts.ts',
        // Root-level non-source (configs, templates, build outputs, barrel exports)
        '*.js',
        '*.template.js',
        '*.template.ts',
        'index.ts',
        'vitest.config.ts',
        'openclaw-register.ts',
      ]
    },
    
    // Setup files (none required — each test file handles its own setup)
    // setupFiles: ['./test/setup.ts'],
    
    // Timeout configuration
    testTimeout: 10000,
    hookTimeout: 15000,
    
    // Parallelization (forks required — SQLite can't share process in threads mode)
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 4,
        minForks: 2,
      }
    },
    
    // Reporter
    reporters: ['default', 'verbose']
  },
  
  // Define resolve aliases if needed
  resolve: {
    alias: {
      '@test': './test',
      '@utils': './src/utils',
      '@types': './src/types'
    }
  }
});