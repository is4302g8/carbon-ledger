# CarbonLedger: A Blockchain Registry for Carbon Credits
### *Protocol Architecture & Decentralized Settlement Exchange*

CarbonLedger is an enterprise-grade Web3 protocol built with **Hardhat 3** that eliminates double counting and solves credit quality risks in voluntary and compliance carbon markets.

---

## Architecture Overview

1. **`MockUSDC.sol`**:
   - ERC-20 stablecoin (6 decimals) with an interactive faucet for bonds, stakes, and marketplace settlements.
2. **`CarbonCreditToken.sol`**:
   - Semi-fungible **ERC-1155** token encoding `(projectId << 32) | vintageYear`.
   - Overridden `_update` transfer hook enforcing KYC/compliance participant registration.
   - Dedicated `retire()` function that permanently burns credits and emits public offset certificates.
3. **`CarbonRegistry.sol`**:
   - Participant role directory (Developer, Verifier, Watchdog, Jurors, Satellite Provider, Buyer).
   - **EIP-712 Satellite Cryptographic Attestation** enforcing on-chain physical plausibility bounds ($\text{Claimed} \le \text{Hectares} \times \text{MaxDensity}$).
   - Parameterized challenge window and jury dispute chamber.
   - Anti-collusion slashing: 50% to Watchdog bounty, 50% to Protocol Insurance Buffer Reserve.
   - Automated issuance applying **80% conservative crediting** and **10% buffer pool reserve**.
4. **`Marketplace.sol`**:
   - Peer-to-peer exchange for ERC-1155 carbon credits with atomic USDC settlement.

---

## Quick Start (Zero Setup)

Once you clone the repository, run the automated launcher:

### Windows (1-Click)
Double-click **`start-demo.bat`** (or run `.\start-demo.bat` in terminal).
* Automatically installs dependencies if missing (`npm install`).
* Automatically boots the local blockchain node on port 8545.
* Automatically deploys and configures contracts.
* Launches the interactive dashboard at **`http://localhost:3000`** in your browser.

### macOS / Linux (1-Click)
Run in terminal:
```bash
chmod +x start-demo.sh && ./start-demo.sh
```

---

## Manual Terminal Workflow

If you prefer running commands manually:

1. **Install Dependencies:** `npm install`
2. **Run Test Suite:** `npm test`
3. **Start Node:** `npm run node`
4. **Deploy Contracts:** `npm run deploy`
5. **Launch GUI:** `npm run gui` (open `http://localhost:3000`)
Executes all 9 unit and scenario tests covering Happy Path, Watchdog Slashing, Frivolous Challenges, Satellite Bounds, and Compliance Invariants:
```bash
npm test
```

### 2. Start the Local Blockchain Node
```bash
npm run node
```

### 3. Deploy Contracts
In a new terminal window:
```bash
npm run deploy
```

### 4. Launch the Interactive GUI
Start the local demo web dashboard:
```bash
npm run gui
```
Then open your browser at **`http://localhost:3000`**.

---

## How to Close & Reset the Demo for a Fresh Run

Because Hardhat runs in memory, resetting the entire state takes only a few seconds:

### Method 1: The One-Command Reset (Fastest)
Keep your node and GUI running, and run this single command in a terminal:
```bash
npm run reset
```
Then press **`F5`** in your browser. All transactions, balances, and projects are wiped clean back to initial state.

### Method 2: Restarting the Node
1. In the terminal running `npm run node`, press **`Ctrl + C`** to shut it down.
2. Start it again: `npm run node` (this gives you a brand new, empty blockchain).
3. In your other terminal, redeploy fresh contracts: `npm run deploy`
4. Refresh the browser page (`F5`).

### Method 3: In-GUI Reset Button
Click the red **"Reset Demo"** button in the top navigation bar of the web dashboard.

---

## Interactive Demonstration Workflow in the GUI

1. **Switch Role to Developer (Alice):**
   - Click *Faucet +5k USDC* to get demo collateral.
   - Review prefilled project parameters (Borneo Peatland Reforestation).
   - Click *Sign with Sentinel Provider* to generate EIP-712 satellite telemetry.
   - Click *Bond $1,000 & Submit Claim*.
2. **Switch Role to Accredited Verifier:**
   - In Tab 2, click *Stake $500 & Approve*.
   - Project transitions to `VERIFIED` and the challenge window begins.
3. **Watchdog Challenge or Finalize:**
   - **Option A (No Dispute):** Click *Finalize Issuance*. The contract mints 80% conservative credits, deposits 10% into the buffer pool, and delivers 72% directly to the developer.
   - **Option B (Watchdog Dispute):** Click *Post $500 Bond & Challenge*. Switch to Jurors, cast votes, and click *Resolve Dispute & Execute Slashing* to demonstrate the 50/50 reward/insurance split.
4. **Marketplace Trading (Developer + Buyer):**
   - In Tab 4, developer lists 100 credits for $25 USDC each.
   - Switch role to Corporate Buyer, click *Buy 50 Credits*, and observe atomic settlement.
5. **Retirement & Certificate Generator:**
   - In Tab 5, enter Beneficiary Name (e.g., "Apple Inc.") and Offset Reason.
   - Click *Burn Credits & Generate Certificate* to permanently burn tokens and view the live on-chain Certificate of Retirement!
