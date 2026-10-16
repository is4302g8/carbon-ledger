# CarbonLedger

A smart contract system for carbon credit issuance, verification, and retirement on Ethereum.

## Overview

CarbonLedger tracks carbon credits from initial project registration through verification, trading, and final retirement. It addresses two common problems in carbon credit accounting:
- **Over-crediting / invalid claims:** Validates project boundaries using signed satellite telemetry (EIP-712) and enforces a maximum biomass density check on-chain.
- **Double counting:** Issues credits as semi-fungible ERC-1155 tokens with a dedicated burn function for retirement.

The system also includes an economic dispute mechanism: verifiers stake collateral to endorse projects, and third-party challengers can dispute claims during a challenge window. Disputed projects are reviewed and voted on by registered jurors, with slashed collateral split between the challenger and an insurance reserve pool.

## Contracts

- `CarbonRegistry.sol`: Core registry contract. Manages participant roles, project submissions, verifier staking, dispute challenges, juror voting, and token issuance calculations (80% baseline issuance, 10% allocated to an insurance buffer pool).
- `CarbonCreditToken.sol`: ERC-1155 token representing verified credits. Token IDs are encoded as `(projectId << 32) | vintageYear`. Includes a `retire()` function that permanently burns credits and emits retirement metadata.
- `Marketplace.sol`: Escrow contract for listing and purchasing ERC-1155 carbon credits with USDC settlement.
- `MockUSDC.sol`: Standard ERC-20 token (6 decimals) used for bonds, stakes, and marketplace settlements in local development.

## Setup

### Prerequisites

- Node.js >= 22 (required by Hardhat 3; check with `node -v`)
- npm

### Installation

```bash
git clone https://github.com/is4302g8/carbon-ledger.git
cd carbon-ledger
npm install
```

## Running Tests

Run the Hardhat test suite:

```bash
npx hardhat test
```

The test suite covers project submission, satellite signature verification, density limit checks, verifier staking, dispute challenge/resolution flows, and marketplace purchases.

## Running Locally

### Option 1: Automated Script

- **Windows:** Double-click `start-demo.bat` (or run `.\start-demo.bat` in PowerShell/cmd).
- **macOS / Linux:** Run `./start-demo.sh`.

The script installs dependencies if missing, starts a local Hardhat node, deploys the contracts, and launches the web interface at `http://localhost:3000`.

### Option 2: Manual Steps

1. Start the local node:
```bash
npx hardhat node
```

2. In a separate terminal, compile and deploy the contracts:
```bash
npx hardhat run scripts/deploy.ts --network localhost
```

3. Start the local frontend server:
```bash
node serve-gui.js
```

Open `http://localhost:3000` in your browser.

Note: each deploy rewrites `frontend/contracts.js` and `frontend/deployed-contracts.json` with the new contract addresses, so these files will show as modified in `git status`. Only commit them if a contract's ABI changed.

## Resetting State

To wipe local chain state and redeploy fresh contracts:

```bash
npm run reset
```

Or click the "Reset Demo" button in the web dashboard navigation bar.

## Project Structure

```
contracts/              # Solidity contracts
├── CarbonCreditToken.sol
├── CarbonRegistry.sol
├── Marketplace.sol
└── MockUSDC.sol
scripts/                # Deployment and reset scripts
├── deploy.ts
└── reset.js
test/                   # Test suite
└── CarbonLedger.test.ts
frontend/               # Web interface (HTML/JS)
├── app.js
├── contracts.js
└── index.html
start-demo.bat          # Windows startup script
start-demo.sh           # Unix startup script
serve-gui.js            # Minimal static file server and reset API
```
