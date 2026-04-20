# brain-memory - Makefile

.PHONY: help install build test test-unit test-integration test-performance lint clean docs

# Show help message
help:
	@echo "brain-memory - Unified knowledge graph + vector memory system"
	@echo ""
	@echo "Usage:"
	@echo "  make install             Install dependencies"
	@echo "  make build               Build the project"
	@echo "  make test                Run all tests"
	@echo "  make test-unit           Run unit tests"
	@echo "  make test-integration    Run integration tests"
	@echo "  make test-performance    Run performance tests"
	@echo "  make lint                Lint the code"
	@echo "  make clean               Clean build artifacts"
	@echo "  make docs                Generate documentation"
	@echo "  make start               Start the service"

# Install dependencies
install:
	npm install

# Build the project
build:
	npm run build

# Run all tests
test:
	npm test

# Run unit tests
test-unit:
	npm run test:unit

# Run integration tests
test-integration:
	npm run test:integration

# Run performance tests
test-performance:
	npm run test:performance

# Lint the code
lint:
	npm run lint

# Clean build artifacts
clean:
	npm run clean

# Generate documentation
docs:
	npm run docs

# Start the service
start:
	npm start

# Run development server
dev:
	npm run dev