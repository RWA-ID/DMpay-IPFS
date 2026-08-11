import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { Loader2, Send, Wallet } from 'lucide-react';
import { PublicKey } from '@solana/web3.js';
import type { Dm, Group } from '@xmtp/browser-sdk';
import { solTipCodec, type SolTipContent } from '../lib/chatContent';
import { ErrorNote, FieldLabel, SendModal, TargetPicker } from './ChatSendShell';
import { useSolanaAddress } from '../hooks/useSolanaAddress';
import {
  availableSolanaWallets,
  connectSolanaWallet,
  preAuthorisedSolanaWallet,
  lamportsToSol,
  sendSolTip,
  solToLamports,
  solanaConnection,
  type SolanaWallet,
} from '../lib/solana';

/**
 * Send a SOL tip — the one payment in DMpay that takes no protocol fee.
 *
 * The recipient is whoever the target's ENS name publishes at coin type 501.
 * If they haven't set that record there is nothing to send to and the composer
 * says so rather than offering a disabled button with no explanation.
 *
 * This is the only flow in the app with two wallets connected at once: the
 * Ethereum wallet that owns the XMTP identity and signs nothing here, and a
 * Solana wallet that signs the transfer. They are unrelated keys and the UI
 * shouldn't pretend otherwise — the card that gets posted afterwards is
 * attributed to the *Ethereum* identity, because that's who is in the chat.
 */

const PRESETS = ['0.05', '0.1', '0.5'];
const NOTE_MAX = 120;

export function SolTipComposer({ conversation, target, candidates, onClose, onSent }: {
  conversation: Dm<unknown> | Group<unknown>;
  target: `0x${string}` | null;
  candidates?: `0x${string}`[];
  onClose: () => void;
  onSent: () => void;
}) {
  const { address: me } = useAccount();
  const [picked, setPicked] = useState<`0x${string}` | null>(target);
  const recipient = target ?? picked;

  const { solanaAddress, ensName, isLoading: resolving } = useSolanaAddress(recipient);

  const [wallets, setWallets] = useState<SolanaWallet[]>([]);
  const [wallet, setWallet] = useState<SolanaWallet | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    setWallets(availableSolanaWallets());

    // If a wallet has already granted this origin a Solana account, use it
    // rather than asking again — the balance should just be there. Wallets
    // register asynchronously, so re-check briefly instead of reading once on
    // mount and concluding there's nothing.
    let settled = false;
    const adopt = () => {
      if (settled) return;
      const found = preAuthorisedSolanaWallet();
      if (!found) return;
      settled = true;
      setWallet(found.wallet);
      setFrom(found.address);
    };
    adopt();
    const timers = [150, 400, 900].map((ms) => setTimeout(() => { setWallets(availableSolanaWallets()); adopt(); }, ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!from) return;
    let cancelled = false;
    solanaConnection()
      .getBalance(new PublicKey(from))
      .then((lamports) => { if (!cancelled) setBalance(lamportsToSol(lamports)); })
      .catch(() => { /* a missing balance only costs the "max" shortcut */ });
    return () => { cancelled = true; };
  }, [from]);

  const parsed = useMemo(() => {
    const value = Number(amount);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [amount]);

  // Leave room for the network fee; spending the exact balance always fails.
  const overBalance = parsed !== null && balance !== null && parsed > balance - 0.00001;

  async function connect(w: SolanaWallet) {
    setFailure(null);
    try {
      const address = await connectSolanaWallet(w);
      setWallet(w);
      setFrom(address);
    } catch (e: any) {
      setFailure(e?.message ?? 'Could not connect that wallet');
    }
  }

  async function pay() {
    if (!wallet || !from || !solanaAddress || parsed === null || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const signature = await sendSolTip({ wallet, from, to: solanaAddress, sol: parsed });

      // Posted only after the wallet returns a signature — an unbacked receipt
      // in the thread is worse than no receipt, same rule as the EVM tip card.
      const content: SolTipContent = {
        signature,
        lamports: String(solToLamports(parsed)),
        from,
        to: solanaAddress,
        // The Ethereum identity behind this XMTP sender. The Solana key that
        // signed the transfer is unrelated to it, so without this there is
        // nothing tying the payment back to the person in the conversation.
        fromEth: me,
        note: note.trim() || undefined,
      };
      await conversation.send(solTipCodec.encode(content) as any);
      onSent();
      onClose();
    } catch (e: any) {
      console.error('sol tip failed', e);
      setFailure(e?.message ?? 'The transfer did not go through');
    } finally {
      setBusy(false);
    }
  }

  const recipientLabel = ensName ?? (recipient ? `${recipient.slice(0, 6)}…${recipient.slice(-4)}` : '');

  return (
    <SendModal title="Tip in SOL" kicker="· Solana · no fee" onClose={onClose}>
      {!target && candidates && (
        <TargetPicker candidates={candidates} value={picked} onChange={setPicked} />
      )}

      {!recipient ? (
        <div className="text-sm text-text-muted">Choose who this is for.</div>
      ) : resolving ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 size={14} className="animate-spin" /> Looking up their Solana address…
        </div>
      ) : !solanaAddress ? (
        <div className="text-sm text-text-secondary leading-relaxed">
          <span className="text-text-primary font-medium">{recipientLabel}</span> hasn't published a
          Solana address yet.
          <div className="mt-2 text-text-muted">
            DMpay reads it from their ENS name — the <code className="text-text-secondary">SOL</code> address
            record. They can add one from their profile, and it'll work here straight away.
          </div>
        </div>
      ) : (
        <>
          <div className="bg-bg-elevated rounded-2xl px-4 py-3 mb-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted mb-1">
              Paying
            </div>
            <div className="text-sm text-text-primary">{recipientLabel}</div>
            <div className="font-mono text-[10.5px] text-text-faint break-all mt-1">{solanaAddress}</div>
            {/* Say plainly where this came from. The name's owner controls the
                record, so trusting the tip means trusting the name. */}
            <div className="text-[10.5px] text-text-muted mt-2 leading-relaxed">
              From their ENS record. Whoever controls {ensName ?? 'the name'} controls this address.
            </div>
          </div>

          {!from ? (
            <>
              <FieldLabel>Connect a Solana wallet</FieldLabel>
              {wallets.length === 0 ? (
                <div className="text-sm text-text-muted leading-relaxed">
                  No Solana wallet detected in this browser. Phantom, Solflare and Backpack all
                  work, as do MetaMask and Trust Wallet once they have a Solana account — install
                  one and reopen this.
                </div>
              ) : (
                <div className="rounded-2xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
                  {wallets.map((w) => (
                    <button
                      key={w.name}
                      onClick={() => connect(w)}
                      className="w-full px-3.5 py-3 flex items-center gap-3 text-left hover:bg-bg-hover transition-colors"
                    >
                      {w.icon
                        ? <img src={w.icon} alt="" className="w-6 h-6 rounded-md shrink-0" />
                        : <Wallet size={16} className="text-text-muted shrink-0" />}
                      <span className="text-sm text-text-primary">{w.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Which account is actually paying. A multi-account wallet gives
                  no clue otherwise, and the recipient's address is shown in
                  full just above — the payer deserves the same treatment. */}
              <div className="flex items-center gap-1.5 mb-3 min-w-0">
                {wallet?.icon && <img src={wallet.icon} alt="" className="w-3.5 h-3.5 rounded shrink-0" />}
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint shrink-0">
                  from
                </span>
                <span className="font-mono text-[10.5px] text-text-muted truncate" title={from}>
                  {from.slice(0, 6)}…{from.slice(-4)}
                </span>
              </div>

              <div className="flex items-baseline justify-between mb-2">
                <FieldLabel>Amount</FieldLabel>
                {balance !== null && (
                  <button
                    onClick={() => setAmount(Math.max(0, balance - 0.00001).toFixed(4))}
                    className="font-mono text-[10px] text-text-faint hover:text-text-secondary"
                  >
                    Balance {balance.toFixed(4)} SOL
                  </button>
                )}
              </div>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full bg-bg-elevated border border-border-subtle rounded-xl px-4 py-3 dm-display font-mono text-2xl text-text-primary placeholder:text-text-faint focus:outline-none focus:border-brand"
              />
              <div className="flex gap-2 mt-2 mb-5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setAmount(p)}
                    className="flex-1 rounded-lg py-1.5 font-mono text-xs bg-bg-elevated border border-border-subtle text-text-secondary hover:bg-bg-hover"
                  >
                    {p}
                  </button>
                ))}
              </div>

              <FieldLabel>Note (optional)</FieldLabel>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                placeholder="What's it for?"
                className="w-full bg-bg-elevated border border-border-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:border-brand"
              />

              <p className="text-[11px] text-text-muted leading-relaxed mt-4">
                {parsed !== null ? (
                  <>They receive <span className="font-mono text-text-secondary">{parsed} SOL</span> — the
                  whole amount. No protocol fee on Solana tips; you pay only the network fee
                  (about 0.000005 SOL).</>
                ) : (
                  <>Sent wallet to wallet with no contract in between, so there's no protocol fee —
                  they receive exactly what you send.</>
                )}
              </p>

              {overBalance && <ErrorNote>That's more than your SOL balance, once the network fee is covered.</ErrorNote>}
              {failure && <ErrorNote>{failure}</ErrorNote>}

              <button
                onClick={pay}
                disabled={busy || parsed === null || overBalance}
                className="mt-5 w-full bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink rounded-2xl py-3 flex items-center justify-center gap-2 font-medium transition-colors"
              >
                {busy
                  ? <><Loader2 size={15} className="animate-spin" /> Confirm in your wallet…</>
                  : <><Send size={15} /> Send {parsed ?? ''} SOL</>}
              </button>
            </>
          )}
        </>
      )}
    </SendModal>
  );
}
