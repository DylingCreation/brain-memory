#!/bin/bash

# brain-memory NPM Publish Script
# Publishes the package to npm registry

set -e  # Exit on any error

echo "📦 brain-memory NPM Publisher"
echo ""

# Check if logged in to npm
echo "🔐 Checking npm login status..."
if npm whoami >/dev/null 2>&1; then
  echo "✅ Logged in as: $(npm whoami)"
else
  echo "❌ Not logged in to npm. Please run: npm login"
  exit 1
fi

# Get package info
NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")

echo "🏷️ Package: $NAME@$VERSION"
echo ""

# Double check build exists
echo "🔨 Verifying build..."
if [ ! -d "dist" ]; then
  echo "💡 No dist directory found, running build..."
  npm run build
fi

# Dry run to see what would be published
echo "🔍 Preview of files to be published:"
npm pack --dry-run

echo ""
read -p "Publish $NAME@$VERSION to npm? [y/N]: " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🚀 Publishing to npm..."
  npm publish --access public
  
  echo "✅ Successfully published $NAME@$VERSION to npm!"
  echo ""
  echo "Users can now install with:"
  echo "  npm install $NAME"
  echo ""
  echo "Or with:"
  echo "  npm install brain-memory"
else
  echo "❌ Publish cancelled."
fi