import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();
const { time } = networkHelpers;

describe("CarbonLedger - Integration & End-to-End Suite", function () {
  let admin: any;
  let developer: any;
  let verifier: any;
  let watchdog: any;
  let juror1: any;
  let juror2: any;
  let satelliteProvider: any;
  let buyer: any;
  let unauthorizedUser: any;

  let usdc: any;
  let carbonToken: any;
  let registry: any;
  let marketplace: any;

  const DEVELOPER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DEVELOPER_ROLE"));
  const VERIFIER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VERIFIER_ROLE"));
  const JUROR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("JUROR_ROLE"));
  const BUYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BUYER_ROLE"));
  const SATELLITE_PROVIDER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SATELLITE_PROVIDER_ROLE"));
  const MARKETPLACE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MARKETPLACE_ROLE"));
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));

  const EIP712_DOMAIN_NAME = "CarbonLedgerRegistry";
  const EIP712_DOMAIN_VERSION = "1";

  async function getSatelliteSignature(
    signer: any,
    registryAddress: string,
    projectId: bigint,
    parcelHectares: bigint,
    maxBiomassDensity: bigint,
    ipfsHash: string,
    timestamp: bigint
  ) {
    const { chainId } = await ethers.provider.getNetwork();
    const domain = {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId,
      verifyingContract: registryAddress,
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
      projectId,
      parcelHectares,
      maxBiomassDensity,
      ipfsHash,
      timestamp,
    };

    return signer.signTypedData(domain, types, value);
  }

  beforeEach(async function () {
    [
      admin,
      developer,
      verifier,
      watchdog,
      juror1,
      juror2,
      satelliteProvider,
      buyer,
      unauthorizedUser,
    ] = await ethers.getSigners();

    // 1. Deploy MockUSDC
    usdc = await ethers.deployContract("MockUSDC");
    await usdc.waitForDeployment();

    // 2. Deploy CarbonCreditToken
    carbonToken = await ethers.deployContract("CarbonCreditToken", ["https://api.carbonledger.io/token/{id}.json"]);
    await carbonToken.waitForDeployment();

    // 3. Deploy CarbonRegistry
    registry = await ethers.deployContract("CarbonRegistry", [usdc.target, carbonToken.target]);
    await registry.waitForDeployment();

    // 4. Deploy Marketplace
    marketplace = await ethers.deployContract("Marketplace", [usdc.target, carbonToken.target]);
    await marketplace.waitForDeployment();

    // Configure Permissions
    await carbonToken.setRegistry(registry.target);
    await carbonToken.grantRole(MINTER_ROLE, registry.target);

    await registry.registerParticipant(developer.address, DEVELOPER_ROLE);
    await registry.registerParticipant(verifier.address, VERIFIER_ROLE);
    await registry.registerParticipant(juror1.address, JUROR_ROLE);
    await registry.registerParticipant(juror2.address, JUROR_ROLE);
    await registry.registerParticipant(satelliteProvider.address, SATELLITE_PROVIDER_ROLE);
    await registry.registerParticipant(buyer.address, BUYER_ROLE);
    await registry.registerParticipant(marketplace.target, MARKETPLACE_ROLE);

    // Fund test participants with USDC via Faucet
    const FUND_AMOUNT = ethers.parseUnits("50000", 6); // 50,000 USDC
    await usdc.faucet(developer.address, FUND_AMOUNT);
    await usdc.faucet(verifier.address, FUND_AMOUNT);
    await usdc.faucet(watchdog.address, FUND_AMOUNT);
    await usdc.faucet(buyer.address, FUND_AMOUNT);

    // Approve registry to spend USDC for bonds and stakes
    await usdc.connect(developer).approve(registry.target, ethers.MaxUint256);
    await usdc.connect(verifier).approve(registry.target, ethers.MaxUint256);
    await usdc.connect(watchdog).approve(registry.target, ethers.MaxUint256);
    await usdc.connect(buyer).approve(marketplace.target, ethers.MaxUint256);
  });

  describe("Deployment & Configuration", function () {
    it("Should correctly configure roles and participant directory", async function () {
      expect(await registry.isParticipant(developer.address)).to.be.true;
      expect(await registry.isParticipant(verifier.address)).to.be.true;
      expect(await registry.isParticipant(buyer.address)).to.be.true;
      expect(await registry.isParticipant(unauthorizedUser.address)).to.be.false;
    });

    it("Should allow admin to adjust challenge and dispute durations", async function () {
      await registry.setDurations(30, 45);
      expect(await registry.challengePeriodDuration()).to.equal(30n);
      expect(await registry.disputePeriodDuration()).to.equal(45n);
    });
  });

  describe("Project Submission & Oracle Attestation", function () {
    it("Should enforce physical plausibility bounds based on satellite density", async function () {
      const projectId = 101n;
      const vintageYear = 2025n;
      const parcelHectares = 100n;
      const maxBiomassDensity = 10n; // Max allowable = 100 * 10 = 1,000 tonnes
      const ipfsHash = ethers.keccak256(ethers.toUtf8Bytes("ipfs://monitoring-report-101"));
      const timestamp = BigInt(Math.floor(Date.now() / 1000));

      const signature = await getSatelliteSignature(
        satelliteProvider,
        registry.target as string,
        projectId,
        parcelHectares,
        maxBiomassDensity,
        ipfsHash,
        timestamp
      );

      // Attempt to claim 1,200 tonnes (> 1,000 max) -> Should revert
      const invalidInput = {
        projectId,
        name: "Amazon Reforestation",
        vintageYear,
        parcelHectares,
        maxBiomassDensity,
        claimedTons: 1200n,
        ipfsHash,
        attestationTimestamp: timestamp,
        satelliteSignature: signature,
      };

      await expect(registry.connect(developer).submitProject(invalidInput)).to.be.revertedWith(
        "CarbonRegistry: claimed carbon exceeds satellite biomass density limit"
      );
    });

    it("Should reject satellite signatures from unaccredited providers", async function () {
      const projectId = 102n;
      const vintageYear = 2025n;
      const parcelHectares = 100n;
      const maxBiomassDensity = 10n;
      const ipfsHash = ethers.keccak256(ethers.toUtf8Bytes("ipfs://fake-report"));
      const timestamp = BigInt(Math.floor(Date.now() / 1000));

      // Sign using unauthorized user instead of satelliteProvider
      const fakeSignature = await getSatelliteSignature(
        unauthorizedUser,
        registry.target as string,
        projectId,
        parcelHectares,
        maxBiomassDensity,
        ipfsHash,
        timestamp
      );

      const input = {
        projectId,
        name: "Fraudulent Project",
        vintageYear,
        parcelHectares,
        maxBiomassDensity,
        claimedTons: 500n,
        ipfsHash,
        attestationTimestamp: timestamp,
        satelliteSignature: fakeSignature,
      };

      await expect(registry.connect(developer).submitProject(input)).to.be.revertedWith(
        "CarbonRegistry: invalid or unaccredited satellite provider signature"
      );
    });
  });

  describe("Lifecycle Flow: Happy Path (Uncontested Issuance -> Trade -> Retire)", function () {
    const projectId = 1n;
    const vintageYear = 2025n;
    const parcelHectares = 200n;
    const maxBiomassDensity = 10n; // Max = 2,000 tonnes
    const claimedTons = 1000n;     // Valid claim
    let tokenId: bigint;

    beforeEach(async function () {
      tokenId = await carbonToken.packTokenId(projectId, vintageYear);
      const ipfsHash = ethers.keccak256(ethers.toUtf8Bytes("ipfs://borneo-peatland-report"));
      const timestamp = BigInt(Math.floor(Date.now() / 1000));

      const signature = await getSatelliteSignature(
        satelliteProvider,
        registry.target as string,
        projectId,
        parcelHectares,
        maxBiomassDensity,
        ipfsHash,
        timestamp
      );

      // Developer submits project + deposits $1,000 USDC bond
      await registry.connect(developer).submitProject({
        projectId,
        name: "Borneo Peatland Restoration",
        vintageYear,
        parcelHectares,
        maxBiomassDensity,
        claimedTons,
        ipfsHash,
        attestationTimestamp: timestamp,
        satelliteSignature: signature,
      });

      // Verifier audits and stakes $500 USDC
      await registry.connect(verifier).verifyProject(projectId);
    });

    it("Should successfully mint 80% conservative, 10% buffer, and 72% developer credits after challenge window", async function () {
      const devBalanceBefore = await usdc.balanceOf(developer.address);
      const verifierBalanceBefore = await usdc.balanceOf(verifier.address);

      // Fast-forward time past 60s challenge window
      await time.increase(65);

      // Finalize project
      await registry.finalizeApprovedProject(projectId);

      // 1. Bonds refunded
      expect(await usdc.balanceOf(developer.address)).to.equal(devBalanceBefore + ethers.parseUnits("1000", 6));
      expect(await usdc.balanceOf(verifier.address)).to.equal(verifierBalanceBefore + ethers.parseUnits("500", 6));

      // 2. Token Accounting:
      // Gross = 1000
      // Conservative 80% = 800
      // Buffer Pool 10% of 800 = 80
      // Developer liquid = 800 - 80 = 720
      expect(await carbonToken.balanceOf(developer.address, tokenId)).to.equal(720n);
      expect(await carbonToken.balanceOf(registry.target, tokenId)).to.equal(80n);
      expect(await registry.bufferPoolTokenReserves(tokenId)).to.equal(80n);
    });

    it("Should allow marketplace listing, purchase by buyer, and permanent retirement", async function () {
      await time.increase(65);
      await registry.finalizeApprovedProject(projectId);

      // Developer approves Marketplace to escrow credits
      await carbonToken.connect(developer).setApprovalForAll(marketplace.target, true);

      // Developer lists 200 credits at $25 USDC each
      const pricePerCredit = ethers.parseUnits("25", 6);
      const tx = await marketplace.connect(developer).createListing(tokenId, 200n, pricePerCredit);
      await tx.wait();

      expect(await carbonToken.balanceOf(marketplace.target, tokenId)).to.equal(200n);
      expect(await carbonToken.balanceOf(developer.address, tokenId)).to.equal(520n); // 720 - 200

      // Buyer purchases 100 credits for $2,500 USDC
      const devUsdcBefore = await usdc.balanceOf(developer.address);
      await marketplace.connect(buyer).buyCredits(1n, 100n);

      expect(await usdc.balanceOf(developer.address)).to.equal(devUsdcBefore + ethers.parseUnits("2500", 6));
      expect(await carbonToken.balanceOf(buyer.address, tokenId)).to.equal(100n);

      // Buyer permanently retires 40 credits
      await expect(
        carbonToken
          .connect(buyer)
          .retire(buyer.address, tokenId, 40n, "Microsoft Corporation", "FY2025 Data Center Net-Zero Offset")
      )
        .to.emit(carbonToken, "CreditRetired")
        .withArgs(
          tokenId,
          projectId,
          vintageYear,
          buyer.address,
          "Microsoft Corporation",
          40n,
          "FY2025 Data Center Net-Zero Offset",
          (val: any) => val > 0n
        );

      expect(await carbonToken.balanceOf(buyer.address, tokenId)).to.equal(60n); // 100 - 40
    });
  });

  describe("Lifecycle Flow: Watchdog Dispute & Slashing (Anti-Collusion Verification)", function () {
    const projectId = 2n;
    const vintageYear = 2024n;
    const parcelHectares = 100n;
    const maxBiomassDensity = 10n;
    const claimedTons = 500n;

    beforeEach(async function () {
      const ipfsHash = ethers.keccak256(ethers.toUtf8Bytes("ipfs://disputed-project-data"));
      const timestamp = BigInt(Math.floor(Date.now() / 1000));

      const signature = await getSatelliteSignature(
        satelliteProvider,
        registry.target as string,
        projectId,
        parcelHectares,
        maxBiomassDensity,
        ipfsHash,
        timestamp
      );

      await registry.connect(developer).submitProject({
        projectId,
        name: "Dubious Forestry Project",
        vintageYear,
        parcelHectares,
        maxBiomassDensity,
        claimedTons,
        ipfsHash,
        attestationTimestamp: timestamp,
        satelliteSignature: signature,
      });

      await registry.connect(verifier).verifyProject(projectId);
    });

    it("Should slash developer bond and verifier stake, split 50% to watchdog and 50% to protocol buffer", async function () {
      const watchdogUsdcBefore = await usdc.balanceOf(watchdog.address);

      // Watchdog challenges claim with $500 USDC bond
      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("ipfs://drone-proof-of-deforestation"));
      await registry.connect(watchdog).challengeProject(projectId, evidenceHash);

      // Jurors vote fraud
      await registry.connect(juror1).voteOnDispute(projectId, true);
      await registry.connect(juror2).voteOnDispute(projectId, true);

      // Fast-forward past dispute voting deadline (60s)
      await time.increase(65);

      // Resolve dispute
      await expect(registry.resolveDispute(projectId))
        .to.emit(registry, "DisputeResolved")
        .withArgs(projectId, true);

      // Total slashed = Developer Bond ($1000) + Verifier Stake ($500) = $1500
      // Watchdog Bounty = 50% of $1500 = $750
      // Buffer Deposit = 50% of $1500 = $750
      // Watchdog receives original bond ($500) + $750 bounty = $1250 net payout
      const watchdogUsdcAfter = await usdc.balanceOf(watchdog.address);
      expect(watchdogUsdcAfter - watchdogUsdcBefore).to.equal(ethers.parseUnits("750", 6));
      expect(await registry.protocolUsdcInsuranceReserve()).to.equal(ethers.parseUnits("750", 6));

      // Roles should be revoked
      expect(await registry.isParticipant(developer.address)).to.be.false;
      expect(await registry.isParticipant(verifier.address)).to.be.false;
    });

    it("Should compensate developer if challenge is frivolous (jury votes legitimate)", async function () {
      const devUsdcBefore = await usdc.balanceOf(developer.address);

      const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("ipfs://flawed-evidence"));
      await registry.connect(watchdog).challengeProject(projectId, evidenceHash);

      // Jurors vote legitimate (false = not fraudulent)
      await registry.connect(juror1).voteOnDispute(projectId, false);
      await registry.connect(juror2).voteOnDispute(projectId, false);

      await time.increase(65);

      await registry.resolveDispute(projectId);

      // Watchdog bond ($500) forfeited directly to Developer
      // Developer also gets their original $1000 bond refunded during mint release
      const devUsdcAfter = await usdc.balanceOf(developer.address);
      expect(devUsdcAfter - devUsdcBefore).to.equal(ethers.parseUnits("1500", 6)); // $1000 refund + $500 penalty
    });
  });

  describe("Compliance & Security Invariants", function () {
    it("Should block transfers to unauthorized (non-registered) recipients", async function () {
      const projectId = 3n;
      const vintageYear = 2025n;
      const tokenId = await carbonToken.packTokenId(projectId, vintageYear);
      const ipfsHash = ethers.keccak256(ethers.toUtf8Bytes("ipfs://compliance-test"));
      const timestamp = BigInt(Math.floor(Date.now() / 1000));

      const signature = await getSatelliteSignature(
        satelliteProvider,
        registry.target as string,
        projectId,
        100n,
        10n,
        ipfsHash,
        timestamp
      );

      await registry.connect(developer).submitProject({
        projectId,
        name: "Compliance Test Forest",
        vintageYear,
        parcelHectares: 100n,
        maxBiomassDensity: 10n,
        claimedTons: 500n,
        ipfsHash,
        attestationTimestamp: timestamp,
        satelliteSignature: signature,
      });

      await registry.connect(verifier).verifyProject(projectId);
      await time.increase(65);
      await registry.finalizeApprovedProject(projectId);

      // Attempt to transfer to unauthorizedUser (not registered)
      await expect(
        carbonToken.connect(developer).safeTransferFrom(developer.address, unauthorizedUser.address, tokenId, 10n, "0x")
      ).to.be.revertedWith("CarbonCreditToken: recipient is not a registered participant");
    });
  });
});
