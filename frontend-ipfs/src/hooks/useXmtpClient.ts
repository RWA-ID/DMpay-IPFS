import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { Client } from '@xmtp/browser-sdk';
import { makeXmtpSigner, revokeAllInstallations, XMTP_ENV } from '../lib/xmtp';

let cachedClient: Client<unknown> | null = null;
let cachedAddr: string | null = null;

export function useXmtpClient() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [client, setClient] = useState<Client<unknown> | null>(cachedClient && cachedAddr === address ? cachedClient : null);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const init = useCallback(async () => {
    if (!address || !walletClient || inFlight.current) return;
    // Sanity: walletClient must be bound to the same address (wagmi can be stale on account switch)
    if (walletClient.account?.address.toLowerCase() !== address.toLowerCase()) {
      console.warn('[XMTP] walletClient stale; address mismatch', { address, walletAccount: walletClient.account?.address });
      return;
    }
    if (cachedClient && cachedAddr?.toLowerCase() === address.toLowerCase()) {
      setClient(cachedClient);
      return;
    }
    inFlight.current = true;
    setInitializing(true);
    setError(null);
    try {
      console.log('[XMTP] creating client for', address);
      const signer = makeXmtpSigner(walletClient);
      const c = await Client.create(signer, { env: XMTP_ENV } as Parameters<typeof Client.create>[1]);
      cachedClient = c;
      cachedAddr = address;
      setClient(c);
      console.log('[XMTP] client ready, inboxId', c.inboxId);
      // Ask other installations of this inbox to send us conversation history
      // + consent state. Best-effort: requires a peer install to be online.
      // https://docs.xmtp.org/chat-apps/list-stream-sync/history-sync
      c.sendSyncRequest()
        .then(() => c.syncAllDeviceSyncGroups())
        .then((s) => console.log('[XMTP] history sync requested', s))
        .catch((e) => console.warn('[XMTP] history sync request failed', e));
    } catch (e: any) {
      console.error('[XMTP] init failed', e);
      setError(e?.message ?? 'Failed to initialize XMTP');
    } finally {
      setInitializing(false);
      inFlight.current = false;
    }
  }, [address, walletClient]);

  // Auto-clear if wallet changes
  useEffect(() => {
    if (cachedAddr && address && cachedAddr.toLowerCase() !== address.toLowerCase()) {
      cachedClient = null;
      cachedAddr = null;
      setClient(null);
    }
  }, [address]);

  const revokeAndRetry = useCallback(async () => {
    if (!walletClient || inFlight.current) return;
    inFlight.current = true;
    setInitializing(true);
    setError(null);
    try {
      console.log('[XMTP] revoking all installations…');
      const n = await revokeAllInstallations(walletClient);
      console.log('[XMTP] revoked', n, 'installations; creating new client…');
      const signer = makeXmtpSigner(walletClient);
      const c = await Client.create(signer, { env: XMTP_ENV } as Parameters<typeof Client.create>[1]);
      cachedClient = c;
      cachedAddr = address ?? null;
      setClient(c);
      c.sendSyncRequest()
        .then(() => c.syncAllDeviceSyncGroups())
        .catch((e) => console.warn('[XMTP] history sync (post-revoke) failed', e));
    } catch (e: any) {
      console.error('[XMTP] revoke+retry failed', e);
      setError(e?.message ?? 'Revoke failed');
    } finally {
      setInitializing(false);
      inFlight.current = false;
    }
  }, [address, walletClient]);

  const needsRevoke = !!error && /10\/10 installations|already registered/.test(error);

  return { client, init, initializing, error, revokeAndRetry, needsRevoke };
}
