#!/bin/bash

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo "Compiling smart contracts..."
    npx hardhat build
fi

if ! nc -z 127.0.0.1 8545 2>/dev/null; then
    echo "Starting local Hardhat node on port 8545..."
    npx hardhat node > /dev/null 2>&1 &
    sleep 4
else
    echo "Local node already running on port 8545."
fi

echo "Deploying smart contracts..."
npx hardhat run scripts/deploy.ts --network localhost

echo "Starting frontend at http://localhost:3000..."
if which xdg-open > /dev/null; then
  xdg-open http://localhost:3000 &
elif which open > /dev/null; then
  open http://localhost:3000 &
fi

node serve-gui.js
