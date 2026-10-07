import { DEPLOYED_CONFIG, ABIS } from "./contracts.js";

// Standard Hardhat default simulated accounts & private keys
const DEMO_ACCOUNTS = {
  admin: {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    name: "Consortium Admin",
  },
  developer: {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    name: "Developer (Alice)",
  },
  verifier: {
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    name: "Accredited Verifier",
  },
  watchdog: {
    address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    privateKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    name: "Independent Watchdog",
  },
  juror1: {
    address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    privateKey: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
    name: "Juror 1",
  },
  juror2: {
    address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    privateKey: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
    name: "Juror 2",
  },
  satellite: {
    address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
    privateKey: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
    name: "Sentinel Satellite Provider",
  },
  buyer: {
    address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
    privateKey: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
    name: "Corporate Buyer",
  },
};

const RPC_URL = "http://127.0.0.1:8545";
let provider = new ethers.JsonRpcProvider(RPC_URL);
let isNodeConnected = false;
let activeRole = "developer";
let activeSigner;
let usdcContract, carbonContract, registryContract, marketplaceContract;
let activeAttestation = null;

// Initialize Web3 / Hardhat Provider
async function initApp() {
  setupEventListeners();
  await checkNodeStatus();
  await switchRole("developer");
}

// Check if Hardhat node is running and contracts are deployed
async function checkNodeStatus() {
  try {
    const blockNum = await provider.getBlockNumber();
    let contractsDeployed = true;
    try {
      const code = await provider.getCode(DEPLOYED_CONFIG.addresses.MockUSDC);
      if (code === "0x") {
        contractsDeployed = false;
      }
    } catch {
      contractsDeployed = false;
    }

    if (!isNodeConnected || !contractsDeployed) {
      isNodeConnected = true;
      updateNodeStatusUI(true, blockNum, contractsDeployed);
      if (contractsDeployed) {
        await refreshState();
      }
    } else {
      updateNodeStatusUI(true, blockNum, true);
    }
    return true;
  } catch (err) {
    if (isNodeConnected || !document.getElementById("nodeStatusText").dataset.checked) {
      isNodeConnected = false;
      updateNodeStatusUI(false);
    }
    return false;
  }
}

function updateNodeStatusUI(connected, blockNum = 0, contractsDeployed = true) {
  const pill = document.getElementById("nodeStatusPill");
  const dot = document.getElementById("nodeStatusDot");
  const text = document.getElementById("nodeStatusText");
  const banner = document.getElementById("nodeOfflineBanner");
  text.dataset.checked = "true";

  if (connected && contractsDeployed) {
    pill.className = "px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center space-x-2";
    dot.className = "w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50";
    text.innerText = `Node Online (Block #${blockNum})`;
    banner.classList.add("hidden");
  } else if (connected && !contractsDeployed) {
    pill.className = "px-3 py-1.5 rounded-lg bg-amber-950/60 border border-amber-800/50 text-amber-300 flex items-center space-x-2";
    dot.className = "w-2 h-2 rounded-full bg-amber-400 animate-pulse";
    text.innerText = "Contracts Missing";
    banner.innerHTML = `
      <div class="flex items-center space-x-2">
        <i class="fa-solid fa-triangle-exclamation text-amber-400 text-sm"></i>
        <span><strong>Contracts Missing:</strong> Node is online at <code>127.0.0.1:8545</code>, but smart contracts need deployment. Click <strong>Reset Demo</strong> to auto-deploy.</span>
      </div>
      <button onclick="window.handleResetDemoClick()" class="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-white font-semibold text-xs shadow">
        <i class="fa-solid fa-rotate-left mr-1"></i> Deploy & Reset Now
      </button>
    `;
    banner.classList.remove("hidden");
  } else {
    pill.className = "px-3 py-1.5 rounded-lg bg-rose-950/60 border border-rose-800/50 text-rose-300 flex items-center space-x-2";
    dot.className = "w-2 h-2 rounded-full bg-rose-500 animate-pulse";
    text.innerText = "Node Offline";
    banner.innerHTML = `
      <div class="flex items-center space-x-2">
        <i class="fa-solid fa-triangle-exclamation text-amber-400 text-sm"></i>
        <span><strong>Blockchain Node Offline:</strong> Cannot reach <code>http://127.0.0.1:8545</code>. In terminal, run: <code class="bg-black/40 px-1.5 py-0.5 rounded font-mono text-amber-300">npm run node</code></span>
      </div>
      <button onclick="window.checkNodeAndRefresh()" class="bg-rose-800 hover:bg-rose-700 px-3 py-1 rounded text-white font-semibold text-xs shadow">
        <i class="fa-solid fa-rotate mr-1"></i> Retry Connection
      </button>
    `;
    banner.classList.remove("hidden");
  }
}

window.checkNodeAndRefresh = async function () {
  const ok = await checkNodeStatus();
  if (ok) {
    await refreshState();
  } else {
    alert("Still cannot reach node at http://127.0.0.1:8545.\n\nPlease open your terminal in the carbon-ledger folder and run:\n\nnpm run node");
  }
};

// Switch active actor
async function switchRole(roleKey) {
  activeRole = roleKey;
  const acc = DEMO_ACCOUNTS[roleKey];
  activeSigner = new ethers.Wallet(acc.privateKey, provider);

  document.getElementById("activeAddress").innerText = `${acc.address.slice(0, 6)}...${acc.address.slice(-4)}`;
  document.getElementById("roleSelector").value = roleKey;

  // Re-bind contracts with the new active signer
  usdcContract = new ethers.Contract(DEPLOYED_CONFIG.addresses.MockUSDC, ABIS.MockUSDC, activeSigner);
  carbonContract = new ethers.Contract(DEPLOYED_CONFIG.addresses.CarbonCreditToken, ABIS.CarbonCreditToken, activeSigner);
  registryContract = new ethers.Contract(DEPLOYED_CONFIG.addresses.CarbonRegistry, ABIS.CarbonRegistry, activeSigner);
  marketplaceContract = new ethers.Contract(DEPLOYED_CONFIG.addresses.Marketplace, ABIS.Marketplace, activeSigner);

  await refreshState();
}

// Refresh live blockchain state & balances
async function refreshState() {
  if (!isNodeConnected || !activeSigner || !usdcContract) return;

  try {
    const blockNum = await provider.getBlockNumber();
    updateNodeStatusUI(true, blockNum, true);

    const acc = DEMO_ACCOUNTS[activeRole];
    const usdcBal = await usdcContract.balanceOf(acc.address);
    document.getElementById("userUsdcBal").innerText = `${Number(ethers.formatUnits(usdcBal, 6)).toLocaleString()} USDC`;

    const slashedUsdc = await registryContract.protocolUsdcInsuranceReserve();
    document.getElementById("statSlashedReserve").innerText = `$${Number(ethers.formatUnits(slashedUsdc, 6)).toLocaleString()} USDC`;

    await renderVerificationList();
    await renderDisputeList();
    await renderMarketplace();
    await populateTokenDropdowns();
  } catch (err) {
    console.warn("Refresh state error:", err);
  }
}

// Raw JSON-RPC nonce lookup to avoid any client-side nonce caching collisions
async function getFreshNonce(address) {
  const hex = await provider.send("eth_getTransactionCount", [address, "latest"]);
  return parseInt(hex, 16);
}

// Faucet Action
async function handleFaucet() {
  const btn = document.getElementById("faucetBtn");
  const originalHtml = btn.innerHTML;

  if (!isNodeConnected) {
    alert("Blockchain node is offline! Please start it in your terminal with:\n\nnpm run node");
    return;
  }

  try {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Minting...`;

    const acc = DEMO_ACCOUNTS[activeRole];
    // Check contract existence
    const code = await provider.getCode(DEPLOYED_CONFIG.addresses.MockUSDC);
    if (code === "0x") {
      throw new Error("Contract not found on node. Please click 'Reset Demo' to deploy fresh contracts.");
    }

    const nonce = await getFreshNonce(acc.address);
    const tx = await usdcContract.faucet(acc.address, ethers.parseUnits("5000", 6), { nonce });
    await tx.wait();
    await refreshState();

    btn.innerHTML = `<i class="fa-solid fa-check mr-1"></i> +5k Minted!`;
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }, 1500);
  } catch (err) {
    console.error("Faucet error:", err);
    btn.innerHTML = originalHtml;
    btn.disabled = false;
    alert("Faucet failed: " + (err.reason || err.message || err));
  }
}

// 1-Click Reset Demo Action
async function handleResetDemo() {
  if (!confirm("Reset demo state? This will clear all transactions, redeploy fresh contracts, and restore initial balances.")) {
    return;
  }

  const btn = document.getElementById("resetDemoBtn");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Resetting Protocol...`;

  try {
    const res = await fetch("/api/reset", { method: "POST" });
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to reset protocol");
    }

    btn.innerHTML = `<i class="fa-solid fa-check mr-1"></i> Reset Complete!`;
    setTimeout(() => {
      window.location.href = window.location.pathname + "?t=" + Date.now();
    }, 600);
  } catch (err) {
    console.error("Reset error:", err);
    btn.innerHTML = originalHtml;
    btn.disabled = false;
    alert("Automatic reset failed: " + err.message + "\n\nMake sure the local node is running ('npm run node') or run 'npm run reset' in your terminal.");
  }
}

window.handleResetDemoClick = handleResetDemo;

// EIP-712 Satellite Attestation generator
async function generateSatelliteSignature() {
  if (!isNodeConnected) {
    alert("Blockchain node is offline. Please run 'npm run node' in your terminal.");
    return null;
  }

  try {
    const projId = BigInt(document.getElementById("projId").value);
    const parcelHectares = BigInt(document.getElementById("projHectares").value);
    const maxDensity = BigInt(document.getElementById("projDensity").value);
    const ipfsHash = ethers.keccak256(ethers.toUtf8Bytes("ipfs://monitoring-report-" + projId));
    const timestamp = BigInt(Math.floor(Date.now() / 1000));

    const satelliteWallet = new ethers.Wallet(DEMO_ACCOUNTS.satellite.privateKey, provider);
    const network = await provider.getNetwork();

    const domain = {
      name: "CarbonLedgerRegistry",
      version: "1",
      chainId: network.chainId,
      verifyingContract: DEPLOYED_CONFIG.addresses.CarbonRegistry,
    };

    const types = {
      SatelliteAttestation: [
        { name: "projectId", type: "uint256" },
        { name: "parcelHectares", type: "uint256" },
        { name: "maxBiomassDensity", type: "uint256" },
        { name: "ipfsHash", type: "bytes32" },
        { name: "timestamp", type: "uint256" },
      ],
    };

    const value = {
      projectId: projId,
      parcelHectares,
      maxBiomassDensity: maxDensity,
      ipfsHash,
      timestamp,
    };

    const signature = await satelliteWallet.signTypedData(domain, types, value);
    activeAttestation = {
      projectId: projId,
      parcelHectares,
      maxBiomassDensity: maxDensity,
      ipfsHash,
      timestamp,
      signature,
    };

    document.getElementById("signatureDisplay").innerText = `✓ Signed by Sentinel Oracle (${DEMO_ACCOUNTS.satellite.address.slice(0, 6)}...${DEMO_ACCOUNTS.satellite.address.slice(-4)})`;
    return activeAttestation;
  } catch (err) {
    console.error("Error generating satellite signature:", err);
    alert("Error generating satellite signature: " + err.message);
    return null;
  }
}

// Render dynamic lists
async function renderVerificationList() {
  const container = document.getElementById("pendingVerificationList");
  container.innerHTML = "";

  try {
    const p = await registryContract.projects(1);
    if (p && p.status === 1n) { // Submitted
      container.innerHTML = `
        <div class="p-4 rounded-xl bg-[#0d121c] border border-slate-800 flex items-center justify-between">
          <div>
            <p class="font-bold text-white text-sm">Project #${p.projectId}: ${p.name} (${p.vintageYear})</p>
            <p class="text-xs text-slate-400 mt-0.5">Claimed: <strong class="text-white">${p.claimedTons} tonnes</strong> • Land: ${p.parcelHectares} ha • Max Density: ${p.maxBiomassDensity} t/ha</p>
          </div>
          <button onclick="window.auditProject(${p.projectId})" class="bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs px-4 py-2 rounded-lg shadow-sm transition-all">
            <i class="fa-solid fa-stamp mr-1"></i> Stake $500 & Approve
          </button>
        </div>
      `;
    } else {
      container.innerHTML = `<p class="text-xs text-slate-500 italic">No projects currently awaiting audit.</p>`;
    }
  } catch (e) {}
}

async function renderDisputeList() {
  const verifiedContainer = document.getElementById("verifiedProjectsList");
  const disputeContainer = document.getElementById("activeDisputesList");
  verifiedContainer.innerHTML = "";
  disputeContainer.innerHTML = "";

  try {
    const p = await registryContract.projects(1);
    if (!p) return;

    if (p.status === 2n) { // Verified (In Challenge Window)
      verifiedContainer.innerHTML = `
        <div class="p-4 rounded-xl bg-[#0d121c] border border-slate-800 space-y-3">
          <div class="flex items-center justify-between">
            <p class="font-bold text-white text-sm">Project #${p.projectId}: ${p.name}</p>
            <span class="badge-gold text-xs px-2 py-0.5 rounded">Challenge Active</span>
          </div>
          <p class="text-xs text-slate-400">Claimed: <strong class="text-white">${p.claimedTons} tCO₂e</strong> • Verifier: <span class="font-mono text-slate-300">${p.verifier.slice(0, 8)}...</span></p>
          <div class="flex space-x-2">
            <button onclick="window.challengeProject(${p.projectId})" class="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs py-2 rounded-lg shadow-sm transition-all">
              <i class="fa-solid fa-shield-cat mr-1"></i> Post $500 Bond & Challenge
            </button>
            <button onclick="window.finalizeProject(${p.projectId})" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs py-2 rounded-lg shadow-sm transition-all">
              <i class="fa-solid fa-check-double mr-1"></i> Finalize Issuance
            </button>
          </div>
        </div>
      `;
    } else if (p.status === 3n) { // Challenged (Jury voting active)
      disputeContainer.innerHTML = `
        <div class="p-4 rounded-xl bg-[#0d121c] border border-slate-800 space-y-3">
          <div class="flex items-center justify-between">
            <p class="font-bold text-white text-sm">Dispute on Project #${p.projectId}</p>
            <span class="badge-alert text-xs px-2 py-0.5 rounded">Voting Open</span>
          </div>
          <p class="text-xs text-slate-400">Votes: <strong class="text-rose-400">${p.fraudVotes}</strong> Fraud vs <strong class="text-blue-400">${p.legitimateVotes}</strong> Legitimate</p>
          <div class="flex space-x-2">
            <button onclick="window.jurorVote(${p.projectId}, true)" class="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs py-2 rounded-lg shadow-sm transition-all">
              <i class="fa-solid fa-thumbs-down mr-1"></i> Vote Fraudulent
            </button>
            <button onclick="window.jurorVote(${p.projectId}, false)" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs py-2 rounded-lg shadow-sm transition-all">
              <i class="fa-solid fa-thumbs-up mr-1"></i> Vote Legitimate
            </button>
          </div>
          <button onclick="window.resolveDispute(${p.projectId})" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs py-2 rounded-lg shadow-sm transition-all">
            <i class="fa-solid fa-gavel mr-1"></i> Resolve Dispute & Execute Slashing
          </button>
        </div>
      `;
    }
  } catch (e) {}
}

async function renderMarketplace() {
  const container = document.getElementById("marketplaceListingsContainer");
  container.innerHTML = "";

  try {
    const listing = await marketplaceContract.listings(1);
    if (listing && listing.active) {
      container.innerHTML = `
        <div class="p-4 rounded-xl bg-[#0d121c] border border-slate-800 space-y-3">
          <div class="flex items-center justify-between">
            <span class="badge-primary text-xs font-bold px-2 py-0.5 rounded">Token #${listing.tokenId}</span>
            <span class="text-white font-bold text-sm">$${ethers.formatUnits(listing.pricePerCredit, 6)} / tCO₂e</span>
          </div>
          <p class="text-xs text-slate-300">Available: <strong class="text-white">${listing.amount} tonnes</strong></p>
          <button onclick="window.buyListing(1, 50)" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs py-2 rounded-lg shadow-sm transition-all">
            <i class="fa-solid fa-cart-shopping mr-1"></i> Buy 50 Credits (As Buyer)
          </button>
        </div>
      `;
    } else {
      container.innerHTML = `<p class="text-xs text-slate-500 italic col-span-2">No active marketplace listings.</p>`;
    }
  } catch (e) {}
}

async function populateTokenDropdowns() {
  const batchSelect = document.getElementById("userTokenBatches");
  const retireSelect = document.getElementById("retireTokenSelect");
  batchSelect.innerHTML = "";
  retireSelect.innerHTML = "";

  try {
    const tokenId = (1n << 32n) | 2025n;
    const bal = await carbonContract.balanceOf(DEMO_ACCOUNTS[activeRole].address, tokenId);
    if (bal > 0n) {
      const opt = `<option value="${tokenId}">Project #1 (2025) - Balance: ${bal} tCO₂e</option>`;
      batchSelect.innerHTML = opt;
      retireSelect.innerHTML = opt;
      document.getElementById("statIssuedCredits").innerText = `${bal} tCO₂e`;
    } else {
      batchSelect.innerHTML = `<option value="">No credits owned</option>`;
      retireSelect.innerHTML = `<option value="">No credits owned</option>`;
    }
  } catch (e) {}
}

// Helper: Ensure sufficient USDC allowance without unnecessary approval transactions
async function ensureUsdcAllowance(spender, requiredAmount) {
  try {
    const currentAllowance = await usdcContract.allowance(activeSigner.address, spender);
    if (currentAllowance < requiredAmount) {
      const nonce = await getFreshNonce(activeSigner.address);
      const tx = await usdcContract.approve(spender, ethers.MaxUint256, { nonce });
      await tx.wait();
    }
  } catch (e) {
    console.warn("Allowance check notice:", e);
  }
}

// Global actions
window.auditProject = async function (id) {
  try {
    await switchRole("verifier");
    await ensureUsdcAllowance(DEPLOYED_CONFIG.addresses.CarbonRegistry, ethers.parseUnits("500", 6));
    const nonce = await getFreshNonce(activeSigner.address);
    const tx = await registryContract.verifyProject(id, { nonce });
    await tx.wait();
    alert(`Project #${id} verified.`);
    await refreshState();
  } catch (err) {
    alert("Audit error: " + (err.reason || err.message));
  }
};

window.challengeProject = async function (id) {
  try {
    await switchRole("watchdog");
    await ensureUsdcAllowance(DEPLOYED_CONFIG.addresses.CarbonRegistry, ethers.parseUnits("500", 6));
    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("ipfs://watchdog-evidence"));
    const nonce = await getFreshNonce(activeSigner.address);
    const tx = await registryContract.challengeProject(id, evidenceHash, { nonce });
    await tx.wait();
    alert(`Dispute filed on Project #${id}.`);
    await refreshState();
  } catch (err) {
    alert("Challenge error: " + (err.reason || err.message));
  }
};

window.finalizeProject = async function (id) {
  try {
    const p = await registryContract.projects(id);
    const latestBlock = await provider.getBlock("latest");
    if (latestBlock && latestBlock.timestamp <= Number(p.challengeDeadline)) {
      const timeToAdvance = Number(p.challengeDeadline) - latestBlock.timestamp + 5;
      await provider.send("evm_increaseTime", [timeToAdvance]);
      await provider.send("evm_mine", []);
    }
    const nonce = await getFreshNonce(activeSigner.address);
    const tx = await registryContract.finalizeApprovedProject(id, { nonce });
    await tx.wait();
    alert(`Project #${id} approved. Credits minted.`);
    await refreshState();
  } catch (err) {
    alert("Finalize error: " + (err.reason || err.message));
  }
};

window.jurorVote = async function (id, isFraud) {
  try {
    if (activeRole !== "juror1" && activeRole !== "juror2") {
      await switchRole("juror1");
    }
    const nonce = await getFreshNonce(activeSigner.address);
    const tx = await registryContract.voteOnDispute(id, isFraud, { nonce });
    await tx.wait();
    alert(`Vote submitted: ${isFraud ? "FRAUDULENT" : "LEGITIMATE"}`);
    await refreshState();
  } catch (err) {
    alert("Vote error: " + (err.reason || err.message));
  }
};

window.resolveDispute = async function (id) {
  try {
    const p = await registryContract.projects(id);
    const latestBlock = await provider.getBlock("latest");
    if (latestBlock && latestBlock.timestamp <= Number(p.disputeDeadline)) {
      const timeToAdvance = Number(p.disputeDeadline) - latestBlock.timestamp + 5;
      await provider.send("evm_increaseTime", [timeToAdvance]);
      await provider.send("evm_mine", []);
    }
    const nonce = await getFreshNonce(activeSigner.address);
    const tx = await registryContract.resolveDispute(id, { nonce });
    await tx.wait();
    alert(`Dispute resolved.`);
    await refreshState();
  } catch (err) {
    alert("Resolve error: " + (err.reason || err.message));
  }
};

window.buyListing = async function (listingId, amount) {
  try {
    await switchRole("buyer");
    const totalCost = ethers.parseUnits("1250", 6);
    await ensureUsdcAllowance(DEPLOYED_CONFIG.addresses.Marketplace, totalCost);
    const nonce = await getFreshNonce(activeSigner.address);
    const tx = await marketplaceContract.buyCredits(listingId, amount, { nonce });
    await tx.wait();
    alert(`Purchased ${amount} credits.`);
    await refreshState();
  } catch (err) {
    alert("Purchase error: " + (err.reason || err.message));
  }
};

function setupEventListeners() {
  document.getElementById("roleSelector").addEventListener("change", (e) => switchRole(e.target.value));
  document.getElementById("faucetBtn").addEventListener("click", handleFaucet);
  document.getElementById("resetDemoBtn").addEventListener("click", handleResetDemo);
  document.getElementById("signAttestationBtn").addEventListener("click", generateSatelliteSignature);

  // Physical bound input listener for live calculation
  const updateBound = () => {
    const hectares = Number(document.getElementById("projHectares").value) || 0;
    const density = Number(document.getElementById("projDensity").value) || 0;
    const claimed = Number(document.getElementById("projClaimed").value) || 0;
    const max = hectares * density;
    const statusEl = document.getElementById("plausibilityStatus");

    if (claimed <= max) {
      statusEl.className = "text-xs text-emerald-400 mt-1 font-medium";
      statusEl.innerText = `✓ Plausible: Claimed ${claimed.toLocaleString()} t ≤ Max Allowable ${max.toLocaleString()} t`;
    } else {
      statusEl.className = "text-xs text-rose-400 mt-1 font-bold";
      statusEl.innerText = `✗ Rejection Warning: Claimed ${claimed.toLocaleString()} t exceeds Max ${max.toLocaleString()} t!`;
    }
  };

  document.getElementById("projHectares").addEventListener("input", updateBound);
  document.getElementById("projDensity").addEventListener("input", updateBound);
  document.getElementById("projClaimed").addEventListener("input", updateBound);

  document.getElementById("submitProjectForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isNodeConnected) {
      alert("Node offline! Run 'npm run node' in your terminal.");
      return;
    }

    const submitBtn = e.target.querySelector("button[type='submit']");
    const originalText = submitBtn.innerHTML;

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Submitting & Bonding...`;

      const projId = BigInt(document.getElementById("projId").value);
      const name = document.getElementById("projName").value;
      const vintage = BigInt(document.getElementById("projVintage").value);
      const hectares = BigInt(document.getElementById("projHectares").value);
      const density = BigInt(document.getElementById("projDensity").value);
      const claimed = BigInt(document.getElementById("projClaimed").value);

      // Verify physical plausibility before transaction
      if (claimed > hectares * density) {
        throw new Error(`Claimed tonnes (${claimed}) exceeds maximum allowable density limit (${hectares * density} tonnes).`);
      }

      // Check if signature matches current inputs; if not or absent, generate fresh attestation
      if (
        !activeAttestation ||
        activeAttestation.projectId !== projId ||
        activeAttestation.parcelHectares !== hectares ||
        activeAttestation.maxBiomassDensity !== density
      ) {
        await generateSatelliteSignature();
      }

      if (!activeAttestation) {
        throw new Error("Unable to obtain Sentinel satellite telemetry signature.");
      }

      await switchRole("developer");
      await ensureUsdcAllowance(DEPLOYED_CONFIG.addresses.CarbonRegistry, ethers.parseUnits("1000", 6));

      const input = {
        projectId: projId,
        name,
        vintageYear: vintage,
        parcelHectares: hectares,
        maxBiomassDensity: density,
        claimedTons: claimed,
        ipfsHash: activeAttestation.ipfsHash,
        attestationTimestamp: activeAttestation.timestamp,
        satelliteSignature: activeAttestation.signature,
      };

      const nonce = await getFreshNonce(activeSigner.address);
      const tx = await registryContract.submitProject(input, { nonce });
      await tx.wait();
      alert(`Project #${projId} registered.`);
      activeAttestation = null;
      document.getElementById("signatureDisplay").innerText = "Attestation verified and project active";
      await refreshState();
    } catch (err) {
      console.error("Submission error:", err);
      alert("Submission error: " + (err.reason || err.message));
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  document.getElementById("createListingForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector("button[type='submit']");
    const originalText = submitBtn.innerHTML;

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Creating Listing...`;

      await switchRole("developer");
      const tokenId = (1n << 32n) | 2025n;
      const amt = BigInt(document.getElementById("listAmount").value);
      const price = ethers.parseUnits(document.getElementById("listPrice").value, 6);

      // Verify and set approval only if not already approved
      const isApproved = await carbonContract.isApprovedForAll(activeSigner.address, DEPLOYED_CONFIG.addresses.Marketplace);
      if (!isApproved) {
        const nonce1 = await getFreshNonce(activeSigner.address);
        const appTx = await carbonContract.setApprovalForAll(DEPLOYED_CONFIG.addresses.Marketplace, true, { nonce: nonce1 });
        await appTx.wait();
      }

      const nonce2 = await getFreshNonce(activeSigner.address);
      const tx = await marketplaceContract.createListing(tokenId, amt, price, { nonce: nonce2 });
      await tx.wait();
      alert(`Listed ${amt} credits for sale.`);
      await refreshState();
    } catch (err) {
      console.error("Listing error:", err);
      alert("Listing error: " + (err.reason || err.message));
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  document.getElementById("retireCreditsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await switchRole("buyer");
      const tokenId = (1n << 32n) | 2025n;
      const amt = BigInt(document.getElementById("retireAmount").value);
      const beneficiary = document.getElementById("retireBeneficiary").value;
      const reason = document.getElementById("retireReason").value;

      const nonce = await getFreshNonce(activeSigner.address);
      const tx = await carbonContract.retire(DEMO_ACCOUNTS.buyer.address, tokenId, amt, beneficiary, reason, { nonce });
      await tx.wait();

      document.getElementById("certBeneficiary").innerText = beneficiary;
      document.getElementById("certAmount").innerText = `${amt} tCO₂e`;
      document.getElementById("certProject").innerText = `Project #1 (Vintage 2025)`;
      document.getElementById("certReason").innerText = reason;
      document.getElementById("statRetiredCredits").innerText = `${amt} tCO₂e`;

      alert(`Retired ${amt} credits.`);
      await refreshState();
    } catch (err) {
      alert("Retirement error: " + (err.reason || err.message));
    }
  });

  // Tab switching
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach((t) => {
        t.classList.remove("active-tab", "text-blue-400", "border-blue-500");
        t.classList.add("text-slate-400", "border-transparent");
      });
      tab.classList.add("active-tab", "text-blue-400", "border-blue-500");
      tab.classList.remove("text-slate-400", "border-transparent");

      const targetId = tab.getAttribute("data-tab");
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));
      document.getElementById(targetId).classList.remove("hidden");
    });
  });
}

window.addEventListener("DOMContentLoaded", initApp);
