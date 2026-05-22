import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const MAINNET_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const DMPayDirectMainnetModule = buildModule("DMPayDirectMainnetModule", (m) => {
  const deployer = m.getAccount(0);
  const dmPayDirect = m.contract("DMPayDirect", [MAINNET_USDC, deployer]);
  return { dmPayDirect };
});

export default DMPayDirectMainnetModule;
