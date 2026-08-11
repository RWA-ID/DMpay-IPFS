import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getWallets } from '@wallet-standard/app';

/**
 * Solana tipping.
 *
 * ## Why this has no contract, and therefore no fee
 *
 * Every other payment in DMpay runs through DMPayDirectV2, which splits
 * 97.5 / 2.5 — the protocol fee is taken by the contract, in the same call.
 * A SOL tip is a bare SystemProgram.transfer between two accounts. There is no
 * program in the path that *could* take a cut, so "no platform fee" here isn't
 * a policy we apply, it's a property of the instruction: the recipient receives
 * exactly the amount sent, and the only deduction is the ~0.000005 SOL the
 * network charges the sender.
 *
 * That also means there is nothing to verify against a contract's logs the way
 * chatReceipts.ts verifies an EVM tip. See `verifySolTip` for what replaces it.
 *
 * ## Where the recipient's address comes from
 *
 * Their ENS name, via the `addr` record at SLIP-44 coin type 501. DMpay
 * identity is already ENS-shaped, so this needs no new registry and no profile
 * field: a user who wants SOL tips sets one record and every DMpay client can
 * find it. The tradeoff is stated plainly in the UI — you are paying whatever
 * address that name currently points at, and whoever controls the name
 * controls where the money goes.
 */

/**
 * SLIP-44 coin type for Solana.
 *
 * Note this is a *plain* SLIP-44 type, not an ENSIP-11 chain-specific one, so
 * it is not `0x80000000 | chainId` and none of the signed-32-bit bitwise
 * trouble that formula causes in JavaScript applies here. 501 is just 501.
 */
export const SOLANA_COIN_TYPE = 501;

/** Solana addresses are 32 bytes; anything else came from a bad record. */
const SOLANA_ADDRESS_BYTES = 32;

export const SOL_DECIMALS = 9;

/**
 * Public mainnet RPC.
 *
 * Called from the user's own browser, not from a Worker — which matters,
 * because shared egress IPs are exactly what gets a Worker throttled on public
 * Solana RPCs. Overridable so a deploy can point at a dedicated endpoint
 * without a code change; leaving it unset is fine for the volume a tip button
 * generates.
 */
export const SOLANA_RPC =
  (import.meta.env.VITE_SOLANA_RPC as string | undefined) || 'https://api.mainnet-beta.solana.com';

let connection: Connection | null = null;
export function solanaConnection(): Connection {
  if (!connection) connection = new Connection(SOLANA_RPC, 'confirmed');
  return connection;
}

/**
 * Turn an ENS `addr(node, 501)` record into a Solana address.
 *
 * The record holds the raw 32-byte public key (ENSIP-9 stores each coin's
 * native binary form), so this decodes bytes to base58 rather than reading a
 * string. A resolver that returns `0x` or the wrong length has no usable record
 * — treated as "not set" rather than as an error, because that is the normal
 * state for the overwhelming majority of names.
 */
export function solanaAddressFromEnsRecord(raw: string | null | undefined): string | null {
  if (!raw || raw === '0x' || raw === '0x0') return null;
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (hex.length !== SOLANA_ADDRESS_BYTES * 2) return null;
  try {
    const bytes = new Uint8Array(SOLANA_ADDRESS_BYTES);
    for (let i = 0; i < SOLANA_ADDRESS_BYTES; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    if (bytes.every((b) => b === 0)) return null;
    return new PublicKey(bytes).toBase58();
  } catch {
    return null;
  }
}

/** Encode a base58 Solana address back into the 32-byte hex an ENS record wants. */
export function ensRecordFromSolanaAddress(address: string): `0x${string}` | null {
  try {
    const bytes = new PublicKey(address.trim()).toBytes();
    return `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return null;
  }
}

export function isValidSolanaAddress(value: string): boolean {
  try {
    const key = new PublicKey(value.trim());
    // A valid-looking base58 string can still be off-curve. Tips must go to a
    // real account, not a PDA that nobody holds the key for.
    return PublicKey.isOnCurve(key.toBytes());
  } catch {
    return false;
  }
}

export const solToLamports = (sol: number) => Math.round(sol * LAMPORTS_PER_SOL);
export const lamportsToSol = (lamports: number) => lamports / LAMPORTS_PER_SOL;

/* ------------------------------------------------------------------------ *
 * Wallets
 * ------------------------------------------------------------------------ */

export type SolanaWallet = {
  name: string;
  icon: string;
  /** The underlying wallet-standard object. */
  handle: any;
};

const SOLANA_CHAIN = 'solana:mainnet';
const FEATURE_CONNECT = 'standard:connect';
const FEATURE_SIGN_AND_SEND = 'solana:signAndSendTransaction';

/**
 * Wallets the browser has registered, via the Wallet Standard.
 *
 * Deliberately not @solana/wallet-adapter-react: that pulls in a per-wallet
 * adapter list that has to be kept current, and every wallet worth supporting
 * (Phantom, Solflare, Backpack) registers itself through the standard now.
 * This is the same mechanism the adapter uses underneath, without the tree.
 */
export function availableSolanaWallets(): SolanaWallet[] {
  try {
    return getWallets()
      .get()
      .filter(
        (w) =>
          w.chains.includes(SOLANA_CHAIN) &&
          FEATURE_CONNECT in w.features &&
          FEATURE_SIGN_AND_SEND in w.features,
      )
      .map((w) => ({ name: w.name, icon: w.icon, handle: w }));
  } catch {
    return [];
  }
}

/** Connect and return the account's base58 address. */
export async function connectSolanaWallet(wallet: SolanaWallet): Promise<string> {
  const connect = wallet.handle.features[FEATURE_CONNECT] as { connect: () => Promise<{ accounts: any[] }> };
  const { accounts } = await connect.connect();
  const account = accounts?.[0];
  if (!account) throw new Error('No account was shared by the wallet');
  return new PublicKey(account.address).toBase58();
}

/**
 * Send a SOL tip. Returns the transaction signature.
 *
 * The recipient's balance must end up above the rent-exempt minimum or the
 * runtime rejects the transfer, so a dust tip to a brand-new empty account
 * fails. Checked up front to turn a cryptic simulation error into a sentence.
 */
export async function sendSolTip({
  wallet,
  from,
  to,
  sol,
}: {
  wallet: SolanaWallet;
  from: string;
  to: string;
  sol: number;
}): Promise<string> {
  const connection = solanaConnection();
  const fromKey = new PublicKey(from);
  const toKey = new PublicKey(to);
  const lamports = solToLamports(sol);
  if (lamports <= 0) throw new Error('Enter an amount above zero');

  const [rentExempt, recipientBalance] = await Promise.all([
    connection.getMinimumBalanceForRentExemption(0),
    connection.getBalance(toKey),
  ]);
  if (recipientBalance + lamports < rentExempt) {
    const needed = lamportsToSol(rentExempt - recipientBalance);
    throw new Error(
      `That account holds no SOL yet, so the network requires at least ${needed.toFixed(5)} SOL to create it.`,
    );
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({
    feePayer: fromKey,
    blockhash,
    lastValidBlockHeight,
  }).add(
    // The entire payment. One instruction, no program, no fee account.
    SystemProgram.transfer({ fromPubkey: fromKey, toPubkey: toKey, lamports }),
  );

  const feature = wallet.handle.features[FEATURE_SIGN_AND_SEND] as {
    signAndSendTransaction: (input: any) => Promise<Array<{ signature: Uint8Array }>>;
  };
  const account = wallet.handle.accounts.find((a: any) => new PublicKey(a.address).toBase58() === from)
    ?? wallet.handle.accounts[0];

  const [result] = await feature.signAndSendTransaction({
    account,
    chain: SOLANA_CHAIN,
    transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
  });

  // The wallet returns raw signature bytes; base58 is what explorers take.
  const { default: bs58 } = await import('bs58');
  return bs58.encode(result.signature);
}

export const solscanTx = (signature: string) => `https://solscan.io/tx/${signature}`;

/* ------------------------------------------------------------------------ *
 * Verification
 * ------------------------------------------------------------------------ */

export type SolVerifyState =
  | { status: 'pending' }
  | { status: 'verified' }
  | { status: 'failed'; reason: string };

/**
 * Confirm that a claimed SOL tip actually happened, and for the claimed amount.
 *
 * The EVM cards verify by reading DMPayDirectV2's event log. A bare transfer
 * emits no event, so this reconstructs the movement from the transaction's
 * pre/post balances instead: find the recipient's account index, and check the
 * balance rose by at least what the card claims.
 *
 * "At least" rather than "exactly" because a transaction may legitimately
 * contain more than one instruction. Understating what you sent is not an
 * attack worth blocking; overstating it is, and that is what this catches.
 */
export async function verifySolTip(
  signature: string,
  to: string,
  lamports: number,
): Promise<SolVerifyState> {
  try {
    const tx = await solanaConnection().getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
    if (!tx) return { status: 'failed', reason: 'No such transaction on Solana mainnet' };
    if (tx.meta?.err) return { status: 'failed', reason: 'That transaction failed on-chain' };

    const keys = tx.transaction.message.getAccountKeys({
      accountKeysFromLookups: tx.meta?.loadedAddresses,
    });
    const target = new PublicKey(to).toBase58();
    let index = -1;
    for (let i = 0; i < keys.length; i++) {
      if (keys.get(i)?.toBase58() === target) { index = i; break; }
    }
    if (index === -1) return { status: 'failed', reason: 'That transaction never paid this address' };

    const before = tx.meta?.preBalances?.[index];
    const after = tx.meta?.postBalances?.[index];
    if (before === undefined || after === undefined) {
      return { status: 'failed', reason: 'Balances missing from that transaction' };
    }
    if (after - before < lamports) {
      return { status: 'failed', reason: 'The amount received was smaller than claimed' };
    }
    return { status: 'verified' };
  } catch {
    // A dropped RPC call is not evidence of fraud. Stay pending so the card
    // shows "verifying" rather than accusing a legitimate sender.
    return { status: 'pending' };
  }
}
