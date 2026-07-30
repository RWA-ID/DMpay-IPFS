import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet } from 'wagmi/chains';
import { http } from 'wagmi';

// TODO: replace with your WalletConnect Cloud project id (https://cloud.walletconnect.com)
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID || 'YOUR_WALLETCONNECT_PROJECT_ID';

export const config = getDefaultConfig({
  appName: 'DMpay',
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [mainnet],
  transports: {
    [mainnet.id]: http('https://ethereum-rpc.publicnode.com'),
  },
  // Collapse concurrent eth_calls into one Multicall3 aggregate3. The list views
  // fan out per row — a price read, a name, an avatar, a registrar expiry — and
  // each was its own round-trip against a public RPC.
  //
  // Safe for CCIP-Read: a batched call that reverts comes back through
  // aggregate3's allowFailure, is rethrown as a RawContractError carrying the
  // raw revert data, and viem's `call` still matches the OffchainLookup
  // signature against the per-request `to` — so offchain/wildcard resolvers keep
  // working. Verified in viem's actions/public/call.js before enabling.
  batch: { multicall: true },
  ssr: false,
});
