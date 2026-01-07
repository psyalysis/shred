#!/bin/bash

# Build and Start Script
# Rebuilds the client and restarts the PM2 process

set -e

echo "Building client..."
npm run build

echo ""
echo "Restarting PM2 process..."
pm2 restart shred

echo ""
echo "Done! Check status with: pm2 status"

