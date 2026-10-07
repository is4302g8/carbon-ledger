// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "./CarbonCreditToken.sol";

/**
 * @title CarbonRegistry
 * @notice Central governance, project lifecycle, and dispute resolution hub for CarbonLedger.
 * Features:
 * - Role-based participant registry (Developer, Verifier, Juror, Buyer, Satellite Provider)
 * - EIP-712 Satellite Cryptographic Attestation verification with physical plausibility checks
 * - Bonded verification & watchdog challenge windows
 * - Jury-based dispute resolution with anti-collusion slashing (50% buffer / 50% watchdog)
 * - Automated credit issuance with conservative crediting and buffer pool insurance reserves
 */
contract CarbonRegistry is AccessControl, ReentrancyGuard, EIP712, ERC1155Holder, IParticipantRegistry {
    using ECDSA for bytes32;

    bytes32 public constant DEVELOPER_ROLE = keccak256("DEVELOPER_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant JUROR_ROLE = keccak256("JUROR_ROLE");
    bytes32 public constant BUYER_ROLE = keccak256("BUYER_ROLE");
    bytes32 public constant SATELLITE_PROVIDER_ROLE = keccak256("SATELLITE_PROVIDER_ROLE");
    bytes32 public constant MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");

    bytes32 public constant SATELLITE_ATTESTATION_TYPEHASH = keccak256(
        "SatelliteAttestation(uint256 projectId,uint256 parcelHectares,uint256 maxBiomassDensity,bytes32 ipfsHash,uint256 timestamp)"
    );

    enum ProjectStatus {
        None,
        Submitted,
        Verified,
        Challenged,
        Approved,
        Slashed
    }

    struct ProjectInput {
        uint256 projectId;
        string name;
        uint256 vintageYear;
        uint256 parcelHectares;
        uint256 maxBiomassDensity;
        uint256 claimedTons;
        bytes32 ipfsHash;
        uint256 attestationTimestamp;
        bytes satelliteSignature;
    }

    struct Project {
        uint256 projectId;
        string name;
        address developer;
        address verifier;
        address watchdog;
        uint256 vintageYear;
        uint256 parcelHectares;
        uint256 maxBiomassDensity;
        uint256 claimedTons;
        bytes32 ipfsHash;
        uint256 challengeDeadline;
        uint256 disputeDeadline;
        ProjectStatus status;
        uint256 fraudVotes;
        uint256 legitimateVotes;
    }

    IERC20 public immutable usdc;
    CarbonCreditToken public immutable carbonToken;

    // Economic parameters (denominated in USDC with 6 decimals)
    uint256 public developerBondAmount = 1000 * 1e6; // $1,000 USDC
    uint256 public verifierStakeAmount = 500 * 1e6;  // $500 USDC
    uint256 public watchdogBondAmount = 500 * 1e6;   // $500 USDC

    // Protocol issuance ratios (percentages)
    uint256 public conservativeRate = 80; // 80% conservative crediting
    uint256 public bufferPoolRate = 10;   // 10% insurance buffer

    // Timing parameters (configurable for local testing and testnets)
    uint256 public challengePeriodDuration = 60; // default 60 seconds
    uint256 public disputePeriodDuration = 60;   // default 60 seconds

    // Accumulated protocol insurance reserve (USDC from slashing)
    uint256 public protocolUsdcInsuranceReserve;

    // Mappings
    mapping(uint256 => Project) public projects;
    mapping(uint256 => mapping(address => bool)) public hasVotedOnDispute;
    mapping(uint256 => uint256) public bufferPoolTokenReserves; // tokenId => credits in buffer pool

    // Events
    event ParticipantRegistered(address indexed account, bytes32 indexed role);
    event ParticipantRevoked(address indexed account, bytes32 indexed role);
    event ProjectSubmitted(uint256 indexed projectId, address indexed developer, string name, uint256 claimedTons);
    event ProjectVerified(uint256 indexed projectId, address indexed verifier, uint256 challengeDeadline);
    event ProjectChallenged(uint256 indexed projectId, address indexed watchdog, bytes32 evidenceHash, uint256 disputeDeadline);
    event JurorVoteCast(uint256 indexed projectId, address indexed juror, bool isFraudulent);
    event DisputeResolved(uint256 indexed projectId, bool fraudConfirmed);
    event ProjectSlashed(uint256 indexed projectId, address indexed watchdog, uint256 bounty);
    event CreditsIssued(uint256 indexed projectId, uint256 indexed tokenId, uint256 developerAmount, uint256 bufferAmount);

    constructor(
        address usdcAddress,
        address carbonTokenAddress
    ) EIP712("CarbonLedgerRegistry", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        usdc = IERC20(usdcAddress);
        carbonToken = CarbonCreditToken(carbonTokenAddress);
    }

    /**
     * @notice Check whether an account is an authorized participant in the registry
     */
    function isParticipant(address account) external view override returns (bool) {
        return hasRole(DEVELOPER_ROLE, account) ||
               hasRole(VERIFIER_ROLE, account) ||
               hasRole(JUROR_ROLE, account) ||
               hasRole(BUYER_ROLE, account) ||
               hasRole(SATELLITE_PROVIDER_ROLE, account) ||
               hasRole(MARKETPLACE_ROLE, account) ||
               hasRole(DEFAULT_ADMIN_ROLE, account) ||
               account == address(this);
    }

    /**
     * @notice Register a participant with a specific role
     */
    function registerParticipant(address account, bytes32 role) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(role, account);
        emit ParticipantRegistered(account, role);
    }

    /**
     * @notice Revoke a participant's role
     */
    function revokeParticipant(address account, bytes32 role) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(role, account);
        emit ParticipantRevoked(account, role);
    }

    /**
     * @notice Configure challenge and dispute durations (useful for test & live demos)
     */
    function setDurations(uint256 challengeDuration_, uint256 disputeDuration_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        challengePeriodDuration = challengeDuration_;
        disputePeriodDuration = disputeDuration_;
    }

    /**
     * @notice Submit a new carbon credit project claim using a packed struct
     */
    function submitProject(ProjectInput calldata input) external nonReentrant {
        require(hasRole(DEVELOPER_ROLE, msg.sender), "CarbonRegistry: caller must be a registered developer");
        require(projects[input.projectId].status == ProjectStatus.None, "CarbonRegistry: project already exists");
        require(input.claimedTons > 0, "CarbonRegistry: claimed tonnes must be positive");
        require(input.parcelHectares > 0, "CarbonRegistry: hectares must be positive");

        // Verify EIP-712 satellite telemetry signature
        bytes32 structHash = keccak256(
            abi.encode(
                SATELLITE_ATTESTATION_TYPEHASH,
                input.projectId,
                input.parcelHectares,
                input.maxBiomassDensity,
                input.ipfsHash,
                input.attestationTimestamp
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recoveredSigner = ECDSA.recover(digest, input.satelliteSignature);
        require(
            hasRole(SATELLITE_PROVIDER_ROLE, recoveredSigner),
            "CarbonRegistry: invalid or unaccredited satellite provider signature"
        );

        // Enforce on-chain physical plausibility bound
        uint256 maxAllowableTons = input.parcelHectares * input.maxBiomassDensity;
        require(
            input.claimedTons <= maxAllowableTons,
            "CarbonRegistry: claimed carbon exceeds satellite biomass density limit"
        );

        // Require developer bond deposit in USDC
        require(
            usdc.transferFrom(msg.sender, address(this), developerBondAmount),
            "CarbonRegistry: developer bond transfer failed"
        );

        projects[input.projectId] = Project({
            projectId: input.projectId,
            name: input.name,
            developer: msg.sender,
            verifier: address(0),
            watchdog: address(0),
            vintageYear: input.vintageYear,
            parcelHectares: input.parcelHectares,
            maxBiomassDensity: input.maxBiomassDensity,
            claimedTons: input.claimedTons,
            ipfsHash: input.ipfsHash,
            challengeDeadline: 0,
            disputeDeadline: 0,
            status: ProjectStatus.Submitted,
            fraudVotes: 0,
            legitimateVotes: 0
        });

        emit ProjectSubmitted(input.projectId, msg.sender, input.name, input.claimedTons);
    }

    /**
     * @notice Accredited verifier audits the project, deposits stake, and initiates challenge window
     */
    function verifyProject(uint256 projectId) external nonReentrant {
        require(hasRole(VERIFIER_ROLE, msg.sender), "CarbonRegistry: caller must be an accredited verifier");
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Submitted, "CarbonRegistry: project not in submitted state");
        require(p.developer != msg.sender, "CarbonRegistry: verifier cannot be project developer");

        // Require verifier stake deposit in USDC
        require(
            usdc.transferFrom(msg.sender, address(this), verifierStakeAmount),
            "CarbonRegistry: verifier stake transfer failed"
        );

        p.verifier = msg.sender;
        p.status = ProjectStatus.Verified;
        p.challengeDeadline = block.timestamp + challengePeriodDuration;

        emit ProjectVerified(projectId, msg.sender, p.challengeDeadline);
    }

    /**
     * @notice Watchdog disputes a verified claim by posting a challenge bond
     */
    function challengeProject(uint256 projectId, bytes32 evidenceHash) external nonReentrant {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Verified, "CarbonRegistry: project not in verified state");
        require(block.timestamp <= p.challengeDeadline, "CarbonRegistry: challenge period has expired");
        require(msg.sender != p.developer, "CarbonRegistry: developer cannot challenge own project");
        require(msg.sender != p.verifier, "CarbonRegistry: verifier cannot challenge own verified project");

        // Require watchdog bond deposit in USDC
        require(
            usdc.transferFrom(msg.sender, address(this), watchdogBondAmount),
            "CarbonRegistry: watchdog bond transfer failed"
        );

        p.watchdog = msg.sender;
        p.status = ProjectStatus.Challenged;
        p.disputeDeadline = block.timestamp + disputePeriodDuration;

        emit ProjectChallenged(projectId, msg.sender, evidenceHash, p.disputeDeadline);
    }

    /**
     * @notice Accredited juror casts a vote on a challenged claim
     */
    function voteOnDispute(uint256 projectId, bool isFraudulent) external {
        require(hasRole(JUROR_ROLE, msg.sender), "CarbonRegistry: caller must be an accredited juror");
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Challenged, "CarbonRegistry: project not in challenged state");
        require(block.timestamp <= p.disputeDeadline, "CarbonRegistry: dispute voting period has closed");
        require(!hasVotedOnDispute[projectId][msg.sender], "CarbonRegistry: juror has already voted");

        hasVotedOnDispute[projectId][msg.sender] = true;

        if (isFraudulent) {
            p.fraudVotes += 1;
        } else {
            p.legitimateVotes += 1;
        }

        emit JurorVoteCast(projectId, msg.sender, isFraudulent);
    }

    /**
     * @notice Resolve dispute after the voting window has closed
     */
    function resolveDispute(uint256 projectId) external nonReentrant {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Challenged, "CarbonRegistry: project not in challenged state");
        require(block.timestamp > p.disputeDeadline, "CarbonRegistry: dispute voting period still active");

        bool fraudConfirmed = p.fraudVotes > p.legitimateVotes;

        if (fraudConfirmed) {
            // Case 1: Fraud Confirmed
            p.status = ProjectStatus.Slashed;

            // Slashed funds: Developer Bond + Verifier Stake
            uint256 totalSlashed = developerBondAmount + verifierStakeAmount;
            uint256 watchdogBounty = totalSlashed / 2;
            uint256 bufferDeposit = totalSlashed - watchdogBounty;

            protocolUsdcInsuranceReserve += bufferDeposit;

            // Refund watchdog's original dispute bond + reward 50% bounty
            uint256 watchdogTotalPayout = watchdogBondAmount + watchdogBounty;
            require(usdc.transfer(p.watchdog, watchdogTotalPayout), "CarbonRegistry: watchdog payout failed");

            // Revoke badges of fraudulent parties
            _revokeRole(DEVELOPER_ROLE, p.developer);
            _revokeRole(VERIFIER_ROLE, p.verifier);

            emit DisputeResolved(projectId, true);
            emit ProjectSlashed(projectId, p.watchdog, watchdogBounty);
        } else {
            // Case 2: Claim is Legitimate (Frivolous challenge)
            // Watchdog bond is forfeited and compensated to developer for delay
            require(usdc.transfer(p.developer, watchdogBondAmount), "CarbonRegistry: compensatory transfer failed");

            emit DisputeResolved(projectId, false);

            // Proceed to finalize project issuance
            _mintAndRelease(projectId);
        }
    }

    /**
     * @notice Finalize project and mint credits when challenge period passes without dispute
     */
    function finalizeApprovedProject(uint256 projectId) external nonReentrant {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Verified, "CarbonRegistry: project not in verified state");
        require(block.timestamp > p.challengeDeadline, "CarbonRegistry: challenge period still active");

        _mintAndRelease(projectId);
    }

    /**
     * @dev Internal routine to calculate conservative allocations and mint tokens
     */
    function _mintAndRelease(uint256 projectId) internal {
        Project storage p = projects[projectId];
        p.status = ProjectStatus.Approved;

        // Refund honest developer bond and verifier stake
        require(usdc.transfer(p.developer, developerBondAmount), "CarbonRegistry: dev bond refund failed");
        require(usdc.transfer(p.verifier, verifierStakeAmount), "CarbonRegistry: verifier stake refund failed");

        // Unified Credit Accounting
        // 1. Conservative crediting (e.g. 80%)
        uint256 eligibleCredits = (p.claimedTons * conservativeRate) / 100;
        // 2. Buffer pool insurance reserve (e.g. 10% of eligible)
        uint256 bufferCredits = (eligibleCredits * bufferPoolRate) / 100;
        // 3. Developer liquid issuance (72% of gross)
        uint256 developerCredits = eligibleCredits - bufferCredits;

        uint256 tokenId = carbonToken.packTokenId(p.projectId, p.vintageYear);

        // Record in buffer pool
        bufferPoolTokenReserves[tokenId] += bufferCredits;

        // Mint buffer credits to registry
        carbonToken.mint(address(this), tokenId, bufferCredits, "");

        // Mint liquid credits to developer
        carbonToken.mint(p.developer, tokenId, developerCredits, "");

        emit CreditsIssued(projectId, tokenId, developerCredits, bufferCredits);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControl, ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
