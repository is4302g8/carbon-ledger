#!/bin/bash
echo "========================================================"
echo " 🌿 CarbonLedger: Launching Local Blockchain & Dashboard"
echo "========================================================"
echo ""

# First-time setup: install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
    echo "[Setup] First-time run detected: Installing dependencies (npm install)..."
    npm install
    echo "[Setup] Compiling smart contracts..."
    npx hardhat compile
    echo "[Setup] Installation complete!"
    echo ""
fi

# Check if node is running on port 8545
if ! nc -z 127.0.0.1 8545 2>/dev/null; then
    echo "[1/3] Starting Local Hardhat Node in background..."
    npx hardhat node > /dev/null 2>&1 &
    sleep 4
else
    echo "[1/3] Local Hardhat Node is already active on port 8545."
fi

echo "[2/3] Deploying smart contracts and seeding demo accounts..."
npx hardhat run scripts/deploy.ts --network localhost

echo ""
echo "========================================================"
echo " ✓ Setup complete! Launching dashboard at http://localhost:3000"
echo " Press Ctrl+C to stop the GUI server."
echo "========================================================"

# Automatically open browser
if which xdg-open > /dev/null; then
  xdg-open http://localhost:3000 &
elif which open > /dev/null; then
  open http://localhost:3000 &
fi

node serve-gui.js
