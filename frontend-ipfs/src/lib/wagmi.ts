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
  ssr: false,
});
