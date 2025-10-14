// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.27;

import {Script} from "@forge-std/Script.sol";
import {console2} from "@forge-std/console2.sol";

import {MerchantRegistry} from "../src/core/MerchantRegistry.sol";
import {Invoice} from "../src/core/Invoice.sol";
import {Checkout} from "../src/core/Checkout.sol";
import {BridgeEscrow} from "../src/core/BridgeEscrow.sol";
import {TapKitAccount} from "../src/account/TapKitAccount.sol";
import {TapKitAccountFactory} from "../src/account/TapKitAccountFactory.sol";
import {TapKitPaymaster} from "../src/paymaster/TapKitPaymaster.sol";

/// @notice Deployment script for all PyPay contracts
/// @dev Reads addresses from environment variables (no hardcoding)
contract DeployScript is Script {
    // Read from env
    address PYUSD;
    address PERMIT2;
    address ENTRY_POINT;
    address DEPLOYER;
    address PAYMASTER_OWNER;
    uint256 MAX_AMOUNT_PER_TX;

    function setUp() public {
        // Load env variables
        PYUSD = vm.envAddress("PYUSD");
        PERMIT2 = vm.envAddress("PERMIT2");
        ENTRY_POINT = vm.envAddress("ENTRY_POINT");
        DEPLOYER = vm.envAddress("DEPLOYER");
        PAYMASTER_OWNER = vm.envOr("PAYMASTER_OWNER", DEPLOYER);
        MAX_AMOUNT_PER_TX = vm.envOr("MAX_AMOUNT_PER_TX", uint256(10000000000)); // 10k PYUSD default

        // Validate addresses
        require(PYUSD != address(0), "PYUSD address not set");
        require(PERMIT2 != address(0), "PERMIT2 address not set");
        require(ENTRY_POINT != address(0), "ENTRY_POINT address not set");
        require(DEPLOYER != address(0), "DEPLOYER address not set");
    }

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy core contracts
        console2.log("Deploying MerchantRegistry...");
        MerchantRegistry registry = new MerchantRegistry(DEPLOYER);
        console2.log("MerchantRegistry deployed at:", address(registry));

        console2.log("Deploying Invoice...");
        Invoice invoice = new Invoice(address(registry));
        console2.log("Invoice deployed at:", address(invoice));

        console2.log("Deploying Checkout...");
        Checkout checkout = new Checkout(PYUSD, PERMIT2, address(registry));
        console2.log("Checkout deployed at:", address(checkout));

        console2.log("Deploying BridgeEscrow...");
        BridgeEscrow bridgeEscrow = new BridgeEscrow(DEPLOYER, PYUSD);
        console2.log("BridgeEscrow deployed at:", address(bridgeEscrow));

        // Deploy AA contracts
        console2.log("Deploying TapKitAccountFactory...");
        TapKitAccountFactory factory = new TapKitAccountFactory(ENTRY_POINT);
        console2.log("TapKitAccountFactory deployed at:", address(factory));
        console2.log("Account implementation at:", factory.accountImplementation());

        console2.log("Deploying TapKitPaymaster...");
        TapKitPaymaster paymaster = new TapKitPaymaster(
            PAYMASTER_OWNER, address(checkout), address(registry), PYUSD, MAX_AMOUNT_PER_TX
        );
        console2.log("TapKitPaymaster deployed at:", address(paymaster));

        vm.stopBroadcast();

        // Print deployment summary
        console2.log("\n=== Deployment Summary ===");
        console2.log("Chain ID:", block.chainid);
        console2.log("MerchantRegistry:", address(registry));
        console2.log("Invoice:", address(invoice));
        console2.log("Checkout:", address(checkout));
        console2.log("BridgeEscrow:", address(bridgeEscrow));
        console2.log("TapKitAccountFactory:", address(factory));
        console2.log("TapKitAccount Implementation:", factory.accountImplementation());
        console2.log("TapKitPaymaster:", address(paymaster));
        console2.log("\nAdd these to your .env file:");
        console2.log(
            string.concat(
                "REGISTRY_",
                _chainPrefix(),
                "=",
                vm.toString(address(registry))
            )
        );
        console2.log(
            string.concat(
                "INVOICE_",
                _chainPrefix(),
                "=",
                vm.toString(address(invoice))
            )
        );
        console2.log(
            string.concat(
                "CHECKOUT_",
                _chainPrefix(),
                "=",
                vm.toString(address(checkout))
            )
        );
        console2.log(
            string.concat(
                "PAYMASTER_",
                _chainPrefix(),
                "=",
                vm.toString(address(paymaster))
            )
        );
        console2.log(
            string.concat(
                "BRIDGE_ESCROW_",
                _chainPrefix(),
                "=",
                vm.toString(address(bridgeEscrow))
            )
        );
        console2.log(
            string.concat(
                "ACCOUNT_FACTORY_",
                _chainPrefix(),
                "=",
                vm.toString(address(factory))
            )
        );
    }

    function _chainPrefix() internal view returns (string memory) {
        if (block.chainid == 421614) return "ARBSEPOLIA";
        if (block.chainid == 11155111) return "SEPOLIA";
        return "UNKNOWN";
    }
}

