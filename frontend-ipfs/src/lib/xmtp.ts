import { hexToBytes, type WalletClient } from 'viem';
import { IdentifierKind, type Signer, type Identifier, Client, createBackend, getInboxIdForIdentifier } from '@xmtp/browser-sdk';

// Attachment + RemoteAttachment codecs ship with @xmtp/browser-sdk v7 — no
// explicit registration needed; the SDK exposes encryptAttachment /
// decryptAttachment / conversation.sendRemoteAttachment directly.

export function makeXmtpSigner(walletClient: WalletClient): Signer {
  const account = walletClient.account!;
  return {
    type: 'EOA',
    getIdentifier: async (): Promise<Identifier> => ({
      identifier: account.address.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum,
    }),
    signMessage: async (message: string): Promise<Uint8Array> => {
      console.log('[XMTP] requesting signature from wallet for', account.address);
      try {
        const sigHex = await walletClient.signMessage({ account, message });
        console.log('[XMTP] signature received');
        return hexToBytes(sigHex);
      } catch (e) {
        console.error('[XMTP] signature failed', e);
        throw e;
      }
    },
  };
}

export function ethIdentifier(address: string): Identifier {
  return { identifier: address.toLowerCase(), identifierKind: IdentifierKind.Ethereum };
}

export const XMTP_ENV = 'production' as const;

/**
 * Revoke all existing installations for this signer's inbox. Used to recover
 * from the "10/10 installations" cap. After this, calling Client.create will
 * register a fresh installation.
 */
export async function revokeAllInstallations(walletClient: WalletClient): Promise<number> {
  const signer = makeXmtpSigner(walletClient);
  const identifier = await signer.getIdentifier();
  const backend = await createBackend({ env: XMTP_ENV });
  const inboxId = await getInboxIdForIdentifier(backend, identifier);
  if (!inboxId) return 0;
  const states = await Client.fetchInboxStates([inboxId], backend);
  const installationIdBytes = states[0]?.installations?.map((i: any) => i.bytes) ?? [];
  if (installationIdBytes.length === 0) return 0;
  await Client.revokeInstallations(signer, inboxId, installationIdBytes, backend);
  return installationIdBytes.length;
}
