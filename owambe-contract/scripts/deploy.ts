import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying OwaGame with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "MON");

  const OwaGame = await ethers.getContractFactory("OwaGame");
  const owaGame = await OwaGame.deploy();
  await owaGame.waitForDeployment();

  const address = await owaGame.getAddress();
  console.log("OwaGame deployed to:", address);
  console.log("\nAdd this to your frontend .env:");
  console.log(`REACT_APP_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
