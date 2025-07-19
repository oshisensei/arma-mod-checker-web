#!/bin/bash
set -e

echo "Starting Vercel build..."

# Install dependencies
echo "Installing dependencies..."
npm install --no-audit --no-fund

# Build the project
echo "Building project..."
npm run build

echo "Build completed successfully!" 