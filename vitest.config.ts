import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Configure test environment
    environment: 'node',
    
    // Test file patterns
    include: ['tests/unit/**/*.test.{ts,js}', 'tests/unit/**/*.spec.{ts,js}', 'test/**/*.test.{ts,js}', 'test/**/*.spec.{ts,js}'],
    exclude: ['node_modules', 'dist', 'tests/e2e'],
    
    // Test globals
    globals: true,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'tests/**',
        'dist/**',
        'scripts/**',
        '**/types.ts',
        '**/index.ts'
      ]
    },
    
    // Setup files
    setupFiles: ['./tests/setup.ts'],
    
    // Timeout configuration
    testTimeout: 10000,
    hookTimeout: 15000,
    
    // Parallelization
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 2,
      }
    },
    
    // Reporter
    reporters: ['default', 'verbose']
  },
  
  // Define resolve aliases if needed
  resolve: {
    alias: {
      '@src': './src',
      '@tests': './tests',
      '@utils': './src/utils',
      '@types': './src/types'
    }
  }
});