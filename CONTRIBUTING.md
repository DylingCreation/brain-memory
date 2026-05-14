# Contributing to brain-memory

Thanks for your interest in contributing!

## Quick Start

```bash
git clone https://github.com/DylingCreation/brain-memory.git
cd brain-memory
npm install
npm run build
npm test
```

## Running Tests

```bash
# All tests
npm test

# Skip LLM integration tests (no API key needed)
npx vitest run --exclude '**/llm-integration*'
```

## Project Structure

```
src/         — TypeScript source code
test/        — Test files
scripts/     — Development scripts
dist/        — Built output (generated)
docs/        — Documentation
```

## Commit Convention

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation
- `test:` — tests
- `chore:` — maintenance

## Pull Request Process

1. Fork the repo and create a branch
2. Make your changes
3. Run `npm run build && npm test`
4. Submit a PR with a clear description
