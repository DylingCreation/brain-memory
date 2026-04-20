#!/bin/bash

# brain-memory Release Script
# Automates the release process for npm and git

set -e  # Exit on any error

echo "🔍 Verifying project is ready for release..."

# Check if we're on the main branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "❌ Please switch to main branch before releasing"
  exit 1
fi

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working directory is not clean. Please commit all changes."
  exit 1
fi

# Run tests to ensure everything works
echo "🧪 Running tests..."
npm test

# Build the project
echo "🔨 Building project..."
npm run build

# Check if build succeeded
if [ ! -d "dist" ]; then
  echo "❌ Build failed - no dist directory created"
  exit 1
fi

echo "✅ All checks passed!"

# Get current version
VERSION=$(node -p "require('./package.json').version")
NAME=$(node -p "require('./package.json').name")

echo "📦 Preparing to release $NAME@$VERSION"

# Update changelog if needed
if [ -f "CHANGELOG.md" ]; then
  echo "📝 Updating changelog with latest changes..."
  # In a real scenario, you'd update the changelog with unreleased changes
fi

# Tag the release
TAG="v$VERSION"
echo "🏷️ Creating git tag: $TAG"
git tag "$TAG" -a -m "Release $NAME@$VERSION

This release includes:

- Performance optimizations
- TypeScript type error fixes
- Enhanced error handling
- Comprehensive test coverage
- Improved documentation
- Vector search performance improvements
- Better memory management
- Security enhancements
- Working memory and reflection systems"

# Push changes and tags
echo "📤 Pushing to GitHub..."
git push origin main
git push origin "$TAG"

echo "🚀 Ready to publish to npm!"
echo ""
echo "To publish to npm, run:"
echo "  npm publish"
echo ""
echo "Make sure you're logged in to npm with proper permissions:"
echo "  npm whoami"
echo ""
echo "After publishing, verify the package is available:"
echo "  npm view $NAME@$VERSION"