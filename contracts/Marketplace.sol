// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./CarbonCreditToken.sol";

/**
 * @title Marketplace
 * @notice Permissioned exchange for listing and purchasing ERC-1155 carbon credits with USDC settlement.
 * Features:
 * - Direct peer-to-peer order listing with non-custodial / escrowed ERC-1155 credits
 * - Atomic delivery-versus-payment (DvP) settlement in USDC
 * - Partial order fills
 */
contract Marketplace is ERC1155Holder, ReentrancyGuard, Ownable {
    struct Listing {
        uint256 listingId;
        address seller;
        uint256 tokenId;
        uint256 amount;
        uint256 pricePerCredit; // USDC per credit (6 decimals)
        bool active;
    }

    IERC20 public immutable usdc;
    CarbonCreditToken public immutable carbonToken;

    uint256 public nextListingId = 1;
    mapping(uint256 => Listing) public listings;

    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 pricePerCredit
    );

    event ListingCancelled(uint256 indexed listingId, address indexed seller);

    event CreditsPurchased(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed seller,
        uint256 tokenId,
        uint256 amount,
        uint256 totalPrice
    );

    constructor(
        address usdcAddress,
        address carbonTokenAddress
    ) Ownable(msg.sender) {
        usdc = IERC20(usdcAddress);
        carbonToken = CarbonCreditToken(carbonTokenAddress);
    }

    /**
     * @notice Create a listing to sell carbon credits at a fixed USDC price
     * @param tokenId ERC-1155 token identifier
     * @param amount Quantity of metric tonnes to list
     * @param pricePerCredit Price in USDC (6 decimals) per tonne
     */
    function createListing(
        uint256 tokenId,
        uint256 amount,
        uint256 pricePerCredit
    ) external nonReentrant returns (uint256 listingId) {
        require(amount > 0, "Marketplace: amount must be positive");
        require(pricePerCredit > 0, "Marketplace: price must be positive");

        listingId = nextListingId++;

        // Escrow credits into marketplace contract
        carbonToken.safeTransferFrom(msg.sender, address(this), tokenId, amount, "");

        listings[listingId] = Listing({
            listingId: listingId,
            seller: msg.sender,
            tokenId: tokenId,
            amount: amount,
            pricePerCredit: pricePerCredit,
            active: true
        });

        emit ListingCreated(listingId, msg.sender, tokenId, amount, pricePerCredit);
    }

    /**
     * @notice Cancel an active listing and retrieve unsold credits
     */
    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "Marketplace: listing is not active");
        require(listing.seller == msg.sender, "Marketplace: only seller can cancel");

        listing.active = false;
        uint256 refundAmount = listing.amount;
        listing.amount = 0;

        // Return credits from escrow to seller
        carbonToken.safeTransferFrom(address(this), msg.sender, listing.tokenId, refundAmount, "");

        emit ListingCancelled(listingId, msg.sender);
    }

    /**
     * @notice Buy listed carbon credits with atomic USDC settlement
     * @param listingId Identifier of the listing
     * @param buyAmount Quantity of credits to purchase
     */
    function buyCredits(uint256 listingId, uint256 buyAmount) external nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "Marketplace: listing is not active");
        require(buyAmount > 0 && buyAmount <= listing.amount, "Marketplace: invalid buy amount");
        require(msg.sender != listing.seller, "Marketplace: seller cannot buy own credits");

        uint256 totalPrice = buyAmount * listing.pricePerCredit;

        // Atomic payment: transfer USDC from buyer directly to seller
        require(
            usdc.transferFrom(msg.sender, listing.seller, totalPrice),
            "Marketplace: USDC transfer to seller failed"
        );

        // Update listing inventory
        listing.amount -= buyAmount;
        if (listing.amount == 0) {
            listing.active = false;
        }

        // Transfer credits from marketplace escrow to buyer
        carbonToken.safeTransferFrom(address(this), msg.sender, listing.tokenId, buyAmount, "");

        emit CreditsPurchased(
            listingId,
            msg.sender,
            listing.seller,
            listing.tokenId,
            buyAmount,
            totalPrice
        );
    }
}
