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
 * Mainnet RPC endpoints, tried in order.
 *
 * **Not `api.mainnet-beta.solana.com`.** That endpoint is Solana Labs' own
 * node and it answers a browser request from a real deployment with a hard
 * HTTP 403 "Access forbidden" — it is documented as unsuitable for
 * applications and is aggressively rate-limited. Using it as the default meant
 * every SOL tip failed with `failed to get balance of account …: 403`, which
 * reads like a wallet problem and isn't.
 *
 * publicnode is the same provider this app already uses for Ethereum
 * (`lib/wagmi.ts`), needs no key, and sends `access-control-allow-origin: *` —
 * which the IPFS build requires, since a key restricted to app.dmpay.me is
 * useless from a gateway and an unrestricted key in the bundle is a published
 * key.
 *
 * `VITE_SOLANA_RPC` is tried first when set, so a deploy can put a dedicated
 * endpoint in front without touching this list.
 */
export const SOLANA_RPCS: string[] = [
  import.meta.env.VITE_SOLANA_RPC as string | undefined,
  'https://solana-rpc.publicnode.com',
  // Second free endpoint, verified to answer with `access-control-allow-origin: *`.
  // One endpoint is not redundancy — a tip that fails because a single public
  // node is having a bad minute looks identical to a broken feature.
  'https://solana.leorpc.com/?api_key=FREE',
].filter((url): url is string => !!url);

export const SOLANA_RPC = SOLANA_RPCS[0];

/**
 * Try each endpoint until one answers at the transport level.
 *
 * Only HTTP-level failures move on. A 200 carrying a JSON-RPC error is the
 * node *answering* — "account not found" is a real answer, and retrying it
 * elsewhere would turn one honest response into several pointless round trips.
 */
async function fallbackFetch(_input: unknown, init?: RequestInit): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (const url of SOLANA_RPCS) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;
      lastResponse = response;
    } catch (e) {
      lastError = e;
    }
  }

  // Hand back the last real response so web3.js reports the actual status
  // rather than a generic network failure.
  if (lastResponse) return lastResponse;
  throw lastError ?? new Error('No Solana RPC endpoint could be reached');
}

let connection: Connection | null = null;
export function solanaConnection(): Connection {
  if (!connection) {
    connection = new Connection(SOLANA_RPC, {
      commitment: 'confirmed',
      fetch: fallbackFetch as unknown as typeof fetch,
    });
  }
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

/**
 * A Solana account this wallet has *already* authorised for this origin.
 *
 * The Wallet Standard populates `wallet.accounts` at registration when the
 * origin was previously granted access, so a returning visitor needs no second
 * connect click. Checking this first is the difference between "click your
 * wallet, then see your balance" and just seeing the balance.
 *
 * It cannot help on a first visit: until the user approves once, the array is
 * empty by design. Connecting to the same extension for Ethereum doesn't fill
 * it either — an EVM connection and a Solana connection are separate grants
 * inside one wallet, which is why being "already connected" in the app's top
 * bar isn't enough on its own.
 *
 * Accounts are filtered by chain because a multi-chain wallet lists its EVM
 * accounts here too, and an 0x address would fail base58 decoding downstream.
 */
export function authorisedSolanaAccount(wallet: SolanaWallet): string | null {
  try {
    const account = (wallet.handle.accounts ?? []).find((a: any) =>
      a?.chains?.includes(SOLANA_CHAIN),
    );
    if (!account?.address) return null;
    return new PublicKey(account.address).toBase58();
  } catch {
    return null;
  }
}

/**
 * The first wallet already holding an authorised Solana account, if any.
 * Returns the wallet and the address together so the caller can go straight
 * to showing a balance.
 */
export function preAuthorisedSolanaWallet(): { wallet: SolanaWallet; address: string } | null {
  for (const wallet of availableSolanaWallets()) {
    const address = authorisedSolanaAccount(wallet);
    if (address) return { wallet, address };
  }
  return null;
}

/** Connect and return the account's base58 address. */
export async function connectSolanaWallet(wallet: SolanaWallet): Promise<string> {
  const connect = wallet.handle.features[FEATURE_CONNECT] as { connect: () => Promise<{ accounts: any[] }> };
  const { accounts } = await connect.connect();

  // Take the first *Solana* account, not the first account. A multi-chain
  // wallet returns its EVM accounts in the same array, and an 0x address is
  // not valid base58 — decoding one throws rather than returning a wrong
  // answer, which would surface here as an unexplained failure to connect.
  const account = (accounts ?? []).find((a: any) => a?.chains?.includes(SOLANA_CHAIN)) ?? accounts?.[0];
  if (!account) {
    throw new Error('That wallet shared no account. If it has no Solana account yet, create one first.');
  }
  try {
    return new PublicKey(account.address).toBase58();
  } catch {
    throw new Error('That wallet shared no Solana account. Create one in the wallet, then try again.');
  }
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
  // Match on the raw address string rather than round-tripping every entry
  // through PublicKey: a multi-chain wallet lists EVM accounts here too, and
  // constructing a PublicKey from an 0x address throws — inside `find`, that
  // aborts the whole search and the send fails before it starts.
  const account =
    wallet.handle.accounts.find((a: any) => a?.address === from) ??
    wallet.handle.accounts.find((a: any) => a?.chains?.includes(SOLANA_CHAIN));
  if (!account) throw new Error('That wallet no longer has the Solana account this tip was set up with');

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
