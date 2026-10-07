// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

interface IParticipantRegistry {
    function isParticipant(address account) external view returns (bool);
}

/**
 * @title CarbonCreditToken
 * @notice ERC-1155 Semi-Fungible Token representing carbon credits.
 * Each token ID uniquely encodes both the Project ID and the Vintage Year:
 *   tokenId = (projectId << 32) | vintageYear
 * 
 * Enforces compliance via the _update transfer hook (only registered participants can receive credits).
 * Includes an explicit `retire()` function that permanently burns tokens and emits public offset certificates.
 */
contract CarbonCreditToken is ERC1155, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    IParticipantRegistry public registry;

    /// @notice Emitted whenever carbon credits are permanently burned to offset emissions
    event CreditRetired(
        uint256 indexed tokenId,
        uint256 indexed projectId,
        uint256 indexed vintageYear,
        address account,
        string beneficiary,
        uint256 amount,
        string reason,
        uint256 timestamp
    );

    constructor(string memory uri_) ERC1155(uri_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Set the participant registry address for compliance transfer checks
     */
    function setRegistry(address registryAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        registry = IParticipantRegistry(registryAddress);
    }

    /**
     * @notice Pack project ID and vintage year into a single ERC-1155 token ID
     */
    function packTokenId(uint256 projectId, uint256 vintageYear) public pure returns (uint256) {
        return (projectId << 32) | (vintageYear & 0xFFFFFFFF);
    }

    /**
     * @notice Unpack an ERC-1155 token ID back into its project ID and vintage year
     */
    function unpackTokenId(uint256 tokenId) public pure returns (uint256 projectId, uint256 vintageYear) {
        projectId = tokenId >> 32;
        vintageYear = tokenId & 0xFFFFFFFF;
    }

    /**
     * @notice Mint credits (only callable by CarbonRegistry contract)
     */
    function mint(address to, uint256 id, uint256 amount, bytes memory data) external onlyRole(MINTER_ROLE) {
        _mint(to, id, amount, data);
    }

    /**
     * @notice Batch mint credits (only callable by CarbonRegistry contract)
     */
    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) external onlyRole(MINTER_ROLE) {
        _mintBatch(to, ids, amounts, data);
    }

    /**
     * @notice Permanently retire (burn) carbon credits to claim emission offset
     * @param account The address holding the carbon credits
     * @param id The token ID representing (projectId, vintageYear)
     * @param amount The number of metric tonnes (credits) to retire
     * @param beneficiary The corporation or entity claiming the offset (e.g., "Google LLC")
     * @param reason The carbon accounting context (e.g., "Scope 1 Emissions 2025")
     */
    function retire(
        address account,
        uint256 id,
        uint256 amount,
        string memory beneficiary,
        string memory reason
    ) external {
        require(
            account == _msgSender() || isApprovedForAll(account, _msgSender()),
            "CarbonCreditToken: caller not owner or approved"
        );
        require(amount > 0, "CarbonCreditToken: amount must be positive");

        _burn(account, id, amount);

        (uint256 projectId, uint256 vintageYear) = unpackTokenId(id);

        emit CreditRetired(
            id,
            projectId,
            vintageYear,
            account,
            beneficiary,
            amount,
            reason,
            block.timestamp
        );
    }

    /**
     * @dev OpenZeppelin v5 transfer hook.
     * Enforces that transfers between accounts must only be between registered participants.
     * Minting (from == 0) and burning (to == 0) bypass this check.
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal virtual override {
        super._update(from, to, ids, values);

        // If transfer is peer-to-peer (not mint and not burn), enforce participant registry
        if (from != address(0) && to != address(0) && address(registry) != address(0)) {
            require(registry.isParticipant(to), "CarbonCreditToken: recipient is not a registered participant");
            require(registry.isParticipant(from), "CarbonCreditToken: sender is not a registered participant");
        }
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
