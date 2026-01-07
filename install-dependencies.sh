#!/bin/bash

# Install System Dependencies
# Installs required system packages for the Raspberry Pi

set -e

echo "Installing system dependencies..."

# Update package list
sudo apt-get update

# Install essential build tools
sudo apt-get install -y \
    build-essential \
    curl \
    git

# Install Node.js if not already installed
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install PM2 if not already installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# Install Nginx (optional, for reverse proxy)
read -p "Install Nginx for reverse proxy? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo apt-get install -y nginx
    echo "Nginx installed. Configuration file: nginx/shred.conf"
fi

echo ""
echo "System dependencies installed!"

