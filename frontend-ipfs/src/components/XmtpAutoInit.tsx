import { useEffect } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { useXmtpClient } from '../hooks/useXmtpClient';

/**
 * Mounted at the top of the app shell. As soon as a wallet is connected and a
 * walletClient is available, kick off XMTP client initialization. On first run
 * in a browser this triggers a one-time signature prompt; subsequent loads
 * recover silently from local XMTP storage.
 */
export function XmtpAutoInit() {
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { client, init, initializing } = useXmtpClient();

  useEffect(() => {
    if (isConnected && walletClient && !client && !initializing) {
      init();
    }
  }, [isConnected, walletClient, client, initializing, init]);

  return null;
}
