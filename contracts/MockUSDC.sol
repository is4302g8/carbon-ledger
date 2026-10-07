// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @notice Standard ERC-20 stablecoin mock with 6 decimals used for
 * developer bonds, verifier stakes, watchdog challenge bonds, and marketplace settlements.
 * Includes a public faucet for demonstration and local testing.
 */
contract MockUSDC is ERC20, Ownable {
    uint8 private constant DECIMALS = 6;

    constructor() ERC20("USD Coin Mock", "USDC") Ownable(msg.sender) {
        // Mint initial supply of 1,000,000 USDC to deployer
        _mint(msg.sender, 1_000_000 * 10 ** DECIMALS);
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @notice Demo faucet: allows any account to mint test USDC for interactive demonstration.
     * @param to Address receiving the minted USDC
     * @param amount Amount of USDC to mint (in base units, 6 decimals)
     */
    function faucet(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
