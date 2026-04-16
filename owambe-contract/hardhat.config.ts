import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const hasValidKey = DEPLOYER_PRIVATE_KEY && DEPLOYER_PRIVATE_KEY.length >= 64 && DEPLOYER_PRIVATE_KEY !== "your_private_key_here";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    ...(hasValidKey ? {
      base: {
        url: "https://mainnet.base.org",
        chainId: 8453,
        accounts: [DEPLOYER_PRIVATE_KEY!],
      },
      "base-sepolia": {
        url: "https://sepolia.base.org",
        chainId: 84532,
        accounts: [DEPLOYER_PRIVATE_KEY!],
      },
      monad: {
        url: "https://testnet-rpc.monad.xyz",
        chainId: 10143,
        accounts: [DEPLOYER_PRIVATE_KEY!],
      },
    } : {}),
  },
};

export default config;
