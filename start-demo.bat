@echo off
title CarbonLedger Launcher

if not exist node_modules (
    echo Installing dependencies...
    call npm install
    echo Compiling smart contracts...
    call npx hardhat build
    echo.
)

netstat -ano | findstr 127.0.0.1:8545 | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo Starting local Hardhat node on port 8545...
    start "CarbonLedger Local Node (Port 8545)" cmd /k "npx hardhat node"
    timeout /t 5 /nobreak >nul
) else (
    echo Local node already running on port 8545.
)

echo Deploying smart contracts...
call npx hardhat run scripts/deploy.ts --network localhost

echo Starting frontend at http://localhost:3000...
start http://localhost:3000
node serve-gui.js
