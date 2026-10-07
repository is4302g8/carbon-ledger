import { network } from "hardhat";
import fs from "fs";
import path from "path";

const { ethers } = await network.create();

async function main() {
  const [deployer, developer, verifier, watchdog, juror1, juror2, satelliteProvider, buyer] =
    await ethers.getSigners();

  console.log("----------------------------------------------------");
  console.log("Deploying Fresh CarbonLedger Contracts...");
  console.log("Deployer:", deployer.address);

  // 1. Deploy MockUSDC
  const usdc = await ethers.deployContract("MockUSDC");
  await usdc.waitForDeployment();
  console.log("MockUSDC:", usdc.target);

  // 2. Deploy CarbonCreditToken
  const carbonToken = await ethers.deployContract("CarbonCreditToken", [
    "https://api.carbonledger.io/metadata/{id}.json",
  ]);
  await carbonToken.waitForDeployment();
  console.log("CarbonCreditToken:", carbonToken.target);

  // 3. Deploy CarbonRegistry
  const registry = await ethers.deployContract("CarbonRegistry", [usdc.target, carbonToken.target]);
  await registry.waitForDeployment();
  console.log("CarbonRegistry:", registry.target);

  // 4. Deploy Marketplace
  const marketplace = await ethers.deployContract("Marketplace", [usdc.target, carbonToken.target]);
  await marketplace.waitForDeployment();
  console.log("Marketplace:", marketplace.target);

  // Setup Roles
  const DEVELOPER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DEVELOPER_ROLE"));
  const VERIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VERIFIER_ROLE"));
  const JUROR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("JUROR_ROLE"));
  const BUYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BUYER_ROLE"));
  const SATELLITE_PROVIDER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SATELLITE_PROVIDER_ROLE"));
  const MARKETPLACE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MARKETPLACE_ROLE"));
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));

  await carbonToken.setRegistry(registry.target);
  await carbonToken.grantRole(MINTER_ROLE, registry.target);

  await registry.registerParticipant(developer.address, DEVELOPER_ROLE);
  await registry.registerParticipant(verifier.address, VERIFIER_ROLE);
  await registry.registerParticipant(juror1.address, JUROR_ROLE);
  await registry.registerParticipant(juror2.address, JUROR_ROLE);
  await registry.registerParticipant(satelliteProvider.address, SATELLITE_PROVIDER_ROLE);
  await registry.registerParticipant(buyer.address, BUYER_ROLE);
  await registry.registerParticipant(marketplace.target, MARKETPLACE_ROLE);

  // Configure demo challenge & dispute periods (10 min challenge, 1 hour dispute voting)
  await registry.setDurations(600, 3600);

  // Fund demo accounts with USDC
  const FAUCET_AMOUNT = ethers.parseUnits("25000", 6); // 25,000 USDC
  await usdc.faucet(developer.address, FAUCET_AMOUNT);
  await usdc.faucet(verifier.address, FAUCET_AMOUNT);
  await usdc.faucet(watchdog.address, FAUCET_AMOUNT);
  await usdc.faucet(buyer.address, FAUCET_AMOUNT);

  // Pre-approve protocol contracts for demo accounts to eliminate redundant approve transactions
  const MAX_ALLOWANCE = ethers.MaxUint256;
  await usdc.connect(developer).approve(registry.target, MAX_ALLOWANCE);
  await usdc.connect(verifier).approve(registry.target, MAX_ALLOWANCE);
  await usdc.connect(watchdog).approve(registry.target, MAX_ALLOWANCE);
  await usdc.connect(buyer).approve(marketplace.target, MAX_ALLOWANCE);

  // Pre-approve carbon credits to Marketplace for developer
  await carbonToken.connect(developer).setApprovalForAll(marketplace.target, true);

  // Export artifacts directly to frontend
  const contractsData = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    addresses: {
      MockUSDC: usdc.target,
      CarbonCreditToken: carbonToken.target,
      CarbonRegistry: registry.target,
      Marketplace: marketplace.target,
    },
    accounts: {
      admin: deployer.address,
      developer: developer.address,
      verifier: verifier.address,
      watchdog: watchdog.address,
      juror1: juror1.address,
      juror2: juror2.address,
      satelliteProvider: satelliteProvider.address,
      buyer: buyer.address,
    },
  };

  const artifactsDir = "artifacts/contracts";
  const contractNames = ["MockUSDC", "CarbonCreditToken", "CarbonRegistry", "Marketplace"];
  const abis: Record<string, any> = {};

  for (const name of contractNames) {
    const file = path.join(artifactsDir, name + ".sol", name + ".json");
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      abis[name] = data.abi;
    }
  }

  const frontendDir = path.resolve("./frontend");
  if (!fs.existsSync(frontendDir)) {
    fs.mkdirSync(frontendDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(frontendDir, "deployed-contracts.json"),
    JSON.stringify(contractsData, null, 2)
  );

  const jsContent =
    "export const DEPLOYED_CONFIG = " +
    JSON.stringify(contractsData, null, 2) +
    ";\n\nexport const ABIS = " +
    JSON.stringify(abis, null, 2) +
    ";\n";

  fs.writeFileSync(path.join(frontendDir, "contracts.js"), jsContent);

  console.log("✓ Updated frontend/deployed-contracts.json & frontend/contracts.js");
  console.log("✓ Ready for clean demo!");
  console.log("----------------------------------------------------");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
