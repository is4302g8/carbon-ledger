@echo off
title CarbonLedger Launcher
echo ========================================================
echo  🌿 CarbonLedger: Launching Local Blockchain & Dashboard
echo ========================================================
echo.

if not exist node_modules (
    echo [Setup] First-time run detected: Installing dependencies...
    call npm install
    echo [Setup] Compiling smart contracts...
    call npx hardhat compile
    echo [Setup] Installation complete!
    echo.
)

netstat -ano | findstr 127.0.0.1:8545 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo [1/3] Starting Local Hardhat Node in separate window...
    start "CarbonLedger Local Node (Port 8545)" cmd /k "npx hardhat node"
    echo [2/3] Waiting for node to initialize (5 seconds)...
    timeout /t 5 /nobreak >nul
) else (
    echo [1/3] Local Hardhat Node is already active on port 8545.
    echo [2/3] Node confirmed online.
)

echo [3/3] Deploying smart contracts and seeding demo accounts...
call npx hardhat run scripts/deploy.ts --network localhost

echo.
echo ========================================================
echo  ✓ Setup complete! Launching dashboard at http://localhost:3000
echo  Press Ctrl+C in this window to stop the GUI server.
echo ========================================================
start http://localhost:3000
node serve-gui.js
