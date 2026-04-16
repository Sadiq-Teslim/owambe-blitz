import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying OwaGame with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Admin wallet receives the 2.5% platform fee
  const ADMIN_WALLET = process.env.ADMIN_WALLET || deployer.address;
  console.log("Admin (fee recipient):", ADMIN_WALLET);

  const OwaGame = await ethers.getContractFactory("OwaGame");
  const owaGame = await OwaGame.deploy(ADMIN_WALLET);
  await owaGame.waitForDeployment();

  const address = await owaGame.getAddress();
  console.log("OwaGame deployed to:", address);
  console.log("\nAdd this to your frontend .env:");
  console.log(`VITE_CONTRACT_ADDRESS=${address}`);
  console.log("\nBase Mainnet token addresses:");
  console.log("USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  console.log("USDT: 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
