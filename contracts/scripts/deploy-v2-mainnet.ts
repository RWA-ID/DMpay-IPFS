import { network } from "hardhat";

// Mainnet USDC
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

// Treasury = current V1 owner (deployer EOA per memory)
const TREASURY = "0x5f11a48230f7CdaB91A2361576239091E4b1165b";

async function main() {
  const { viem } = await network.connect({ network: "mainnet", chainType: "l1" });
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  console.log("Deployer :", deployer.account.address);
  console.log("USDC     :", USDC);
  console.log("Treasury :", TREASURY);

  const balance = await publicClient.getBalance({ address: deployer.account.address });
  const gasPrice = await publicClient.getGasPrice();
  console.log("Balance  :", Number(balance) / 1e18, "ETH");
  console.log("Gas price:", Number(gasPrice) / 1e9, "gwei");

  console.log("\nDeploying DMPayDirectV2…");
  const dm = await viem.deployContract("DMPayDirectV2", [USDC, TREASURY]);
  console.log("✅ Deployed at:", dm.address);

  // Sanity reads
  const usdcAddr = await dm.read.usdc();
  const treasuryAddr = await dm.read.treasury();
  const feeBps = await dm.read.FEE_BPS();
  console.log("usdc()    =", usdcAddr);
  console.log("treasury()=", treasuryAddr);
  console.log("FEE_BPS   =", feeBps);

  console.log("\nNext steps:");
  console.log("1. Verify on Etherscan:");
  console.log(`   npx hardhat verify --network mainnet ${dm.address} ${USDC} ${TREASURY}`);
  console.log("2. Update frontend-ipfs/src/lib/contracts.ts → DMPAY_DIRECT_ADDRESS");
  console.log("3. Re-call setPrice() from each recipient wallet that had a V1 price.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
