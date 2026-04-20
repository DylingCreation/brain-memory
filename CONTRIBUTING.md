# Contributing to brain-memory

Thank you for your interest in contributing to brain-memory! We welcome contributions from the community to help improve this unified knowledge management system for AI agents.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Testing](#testing)
- [Documentation](#documentation)
- [Pull Request Process](#pull-request-process)
- [Issues](#issues)

## Getting Started

1. Fork the repository
2. Clone your fork:
```bash
git clone https://github.com/YOUR_USERNAME/brain-memory.git
cd brain-memory
```

3. Install dependencies:
```bash
npm install
```

4. Create a new branch for your feature or bug fix:
```bash
git checkout -b feature/my-feature
# or
git checkout -b bugfix/issue-description
```

## Development Workflow

### Setting up the Environment

1. Copy the example environment file:
```bash
cp .env.example .env
# Edit .env with your API keys and settings
```

2. Run the development server:
```bash
npm run dev
```

### Making Changes

1. Ensure you're working on the correct branch
2. Make your changes in the appropriate files
3. Add or update tests as necessary
4. Update documentation if needed
5. Run tests to ensure everything works:
```bash
npm test
```

## Code Style

### TypeScript Guidelines

- Use TypeScript for all new code
- Follow the existing code style and naming conventions
- Use descriptive variable and function names
- Add JSDoc comments to exported functions and classes
- Use interfaces for object shapes rather than type aliases when possible

### File Organization

- Place source files in the `src/` directory
- Organize by feature/module in subdirectories
- Keep related files together (e.g., types, utils, main implementation)
- Use barrel exports (index.ts) to simplify imports

### Naming Conventions

- Use PascalCase for class names and interfaces
- Use camelCase for function names, variables, and methods
- Use UPPER_SNAKE_CASE for constants
- Use descriptive names that indicate purpose

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test suite
npm run test:integration
npm run test:performance
```

### Writing Tests

- Write unit tests for new functions and classes
- Add integration tests for new features
- Use descriptive test names that explain the expected behavior
- Follow the AAA pattern (Arrange, Act, Assert)
- Test edge cases and error conditions

## Documentation

### Source Code Documentation

- Add JSDoc comments to all exported functions, classes, and interfaces
- Document parameters, return values, and potential errors
- Provide examples where helpful

### External Documentation

- Update relevant files in the `docs/` directory
- Add usage examples for new features
- Update API references as needed

## Pull Request Process

1. Ensure your code follows the style guidelines
2. Update documentation as needed
3. Add tests for new functionality
4. Run all tests and ensure they pass
5. Squash commits if necessary to create a clean history
6. Submit a pull request to the `main` branch
7. Fill out the pull request template with:
   - Description of changes
   - Related issues (if any)
   - Testing performed
8. Wait for review and address feedback

### Pull Request Requirements

- All tests must pass
- Code coverage should not decrease significantly
- Changes should be well-documented
- Breaking changes should be clearly explained

## Issues

### Creating Issues

When creating an issue, please:

- Use a clear and descriptive title
- Provide a detailed description of the problem
- Include steps to reproduce (for bugs)
- Specify the expected vs. actual behavior
- Add relevant labels (bug, enhancement, etc.)

### Issue Lifecycle

- Issues will be reviewed by maintainers
- Priority will be assigned based on impact
- Volunteers may be assigned to work on issues
- Progress will be tracked in the issue comments

## Questions?

If you have questions about contributing, feel free to:

- Open an issue for discussion
- Check the existing documentation in the `docs/` directory
- Look at existing code for examples of patterns and practices

Thank you for contributing to brain-memory!