#!/bin/bash

# Raspberry Pi Setup Script for Shred Game
# Run this script on your Raspberry Pi to set up the game server

set -e  # Exit on error

echo "========================================="
echo "Shred Game - Raspberry Pi Setup"
echo "========================================="
echo ""

# Check if running on Raspberry Pi (optional check)
if [ ! -f /proc/device-tree/model ] || ! grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
    echo "Warning: This script is designed for Raspberry Pi, but continuing anyway..."
    echo ""
fi

# Update system packages
echo "Step 1: Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js (using NodeSource repository for latest LTS)
echo ""
echo "Step 2: Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js already installed: $(node --version)"
fi

# Verify Node.js installation
node_version=$(node --version)
npm_version=$(npm --version)
echo "Node.js version: $node_version"
echo "npm version: $npm_version"

# Install PM2 globally
echo ""
echo "Step 3: Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
else
    echo "PM2 already installed: $(pm2 --version)"
fi

# Install project dependencies
echo ""
echo "Step 4: Installing project dependencies..."
npm install

# Build the client
echo ""
echo "Step 5: Building client..."
npm run build

# Create logs directory
echo ""
echo "Step 6: Creating logs directory..."
mkdir -p logs

# Create .env file if it doesn't exist
echo ""
echo "Step 7: Setting up environment variables..."
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo ""
    echo "IMPORTANT: Please edit .env file and set VITE_SERVER_URL to your public IP or domain"
    echo "Example: VITE_SERVER_URL=http://your-ip-address:3001"
    echo ""
    read -p "Press Enter to continue after editing .env (or Ctrl+C to exit and edit it manually)..."
else
    echo ".env file already exists, skipping..."
fi

# Start with PM2
echo ""
echo "Step 8: Starting server with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
echo ""
echo "Step 9: Setting up PM2 to start on boot..."
pm2 startup | tail -1 | sudo bash

echo ""
echo "========================================="
echo "Setup complete!"
echo "========================================="
echo ""
echo "Server is running with PM2"
echo "Useful commands:"
echo "  pm2 status          - Check server status"
echo "  pm2 logs shred      - View server logs"
echo "  pm2 restart shred   - Restart server"
echo "  pm2 stop shred      - Stop server"
echo ""
echo "Next steps:"
echo "1. Configure port forwarding on your router (port 3001)"
echo "2. Set up dynamic DNS if needed (e.g., DuckDNS)"
echo "3. Configure Nginx reverse proxy for HTTPS (optional)"
echo ""

