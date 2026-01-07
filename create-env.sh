#!/bin/bash

# Create .env file from .env.example
# This script helps set up environment variables

if [ ! -f .env.example ]; then
    echo "Error: .env.example not found"
    exit 1
fi

if [ -f .env ]; then
    echo ".env file already exists."
    read -p "Overwrite? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

cp .env.example .env

echo ""
echo ".env file created from .env.example"
echo ""
echo "Please edit .env and set the following:"
echo "  - VITE_SERVER_URL: Your public URL/IP (e.g., http://your-ip:3001)"
echo ""
echo "After editing, rebuild the client:"
echo "  npm run build"
echo ""

