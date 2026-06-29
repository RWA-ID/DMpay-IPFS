import { createPublicClient, fallback, http } from 'viem';
import { mainnet } from 'viem/chains';

// V2 deployment block — start of all DMpay V2 on-chain history.
export const DMPAY_V2_DEPLOY_BLOCK = 25169356n;

// Dedicated client for wide eth_getLogs scans. The app's default RPC
// (publicnode) rejects wide log ranges as "archive". These public
// endpoints serve full-range getLogs without an API key.
export const logsClient = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http('https://gateway.tenderly.co/public/mainnet'),
    http('https://eth.api.onfinality.io/public'),
  ]),
});
