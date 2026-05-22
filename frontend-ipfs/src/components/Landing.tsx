import { useState } from 'react';
import { isAddress } from 'viem';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Wallet } from 'lucide-react';
import { ProfileCard } from './ProfileCard';
import { Footer } from './Footer';

export function Landing() {
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();
  const isEns = trimmed.endsWith('.eth') || (trimmed.includes('.') && !trimmed.startsWith('0x'));
  const isAddr = isAddress(trimmed);
  const valid = isEns || isAddr;

  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const navigate = useNavigate();

  const primaryCta = () => (isConnected ? navigate('/settings') : openConnectModal?.());

  return (
    <main className="flex-1 overflow-y-auto bg-bg-base">
      {/* ────────────── HERO ────────────── */}
      <section className="max-w-6xl mx-auto px-6 sm:px-10 pt-14 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-12 lg:gap-16 items-center">
          {/* LEFT — editorial copy */}
          <div>
            <div className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] bg-chip text-chip-ink rounded-full px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              Live on Ethereum mainnet
            </div>

            <h1 className="dm-display text-[64px] sm:text-[88px] mt-6 text-text-primary">
              Your inbox<br />
              <span className="text-text-muted">is worth more</span><br />
              than zero.
            </h1>

            <p className="text-lg text-text-secondary max-w-[520px] mt-7 leading-relaxed">
              DMpay turns your wallet into a paywall. Set a price in USDC or ETH —
              fans pay to message you, join your group, or buy a lifetime pass.
              Payments settle on-chain. No platform cut.
            </p>

            <div className="flex flex-wrap gap-3 mt-8">
              <button
                onClick={primaryCta}
                className="bg-brand hover:bg-brand-hover text-brand-ink rounded-2xl px-6 py-4 font-medium inline-flex items-center gap-2"
              >
                {isConnected ? 'Set your price' : 'Connect & set price'} <ArrowRight size={16} />
              </button>
              <a
                href="#discover"
                className="bg-bg-panel hover:bg-bg-hover border border-border-strong text-text-primary rounded-2xl px-6 py-4 font-medium inline-flex items-center"
              >
                Browse creators
              </a>
            </div>

            <div className="flex items-center gap-5 mt-9">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">As featured on</div>
              <div className="flex flex-wrap gap-5 text-sm text-text-muted">
                <span>Bankless</span>
                <span>Farcaster</span>
                <span>Crypto Twitter</span>
                <span>The Defiant</span>
              </div>
            </div>
          </div>

          {/* RIGHT — search + result, framed */}
          <div className="relative">
            <div className="absolute -inset-7 border border-border-subtle rounded-[28px] pointer-events-none" />
            <div className="absolute -top-7 left-0 right-0 flex justify-center" style={{ transform: 'translateY(-50%)' }}>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted bg-bg-base px-3 py-1">
                · Find someone on DMpay ·
              </span>
            </div>

            <div className="bg-bg-panel border border-border-subtle rounded-[18px] shadow-card p-5 sm:p-6">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted mb-3">Search ENS or address</div>
              <div className="flex items-center bg-bg-elevated border border-border-subtle rounded-2xl pl-4 pr-3 py-2.5">
                <Search size={18} className="text-text-muted shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="vitalik.eth or 0x…"
                  className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted text-[15px] px-3 py-1.5 focus:outline-none font-mono"
                />
              </div>
              {query && !valid && (
                <div className="text-text-muted text-xs mt-3 font-mono">Type a full ENS name or 0x address.</div>
              )}

              {valid && (
                <div className="mt-5">
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted mb-3">Result</div>
                  <ProfileCard key={trimmed} nameOrAddress={trimmed} />
                </div>
              )}

              {!valid && isConnected && address && (
                <div className="mt-5">
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted mb-3">Your profile</div>
                  <ProfileCard nameOrAddress={address} />
                </div>
              )}

              {!valid && !isConnected && (
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">· A creator on DMpay</div>
                    <button
                      onClick={() => openConnectModal?.()}
                      className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted hover:text-text-primary"
                    >
                      <Wallet size={12} /> Connect
                    </button>
                  </div>
                  <ProfileCard nameOrAddress="breilyn.eth" />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ────────────── STATS STRIP ────────────── */}
      <section className="border-t border-b border-border-subtle bg-bg-elevated">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4">
          {[
            { l: 'Settled on-chain', v: '$2.4M', s: 'in the last 30 days' },
            { l: 'Active creators', v: '3,061', s: 'across 12 categories' },
            { l: 'Protocol fee', v: '2.5%', s: 'flat, immutable, on-chain' },
            { l: 'Platform cut', v: '0%', s: 'everything else is yours' },
          ].map((s, i) => (
            <div
              key={i}
              className={`px-6 sm:px-10 py-7 ${i > 0 ? 'md:border-l border-border-subtle' : ''} ${i >= 2 ? 'border-t md:border-t-0 border-border-subtle' : ''} ${i % 2 === 1 ? 'border-l md:border-l border-border-subtle' : ''}`}
            >
              <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">{s.l}</div>
              <div className="dm-display font-mono text-3xl sm:text-[38px] mt-2 text-text-primary">{s.v}</div>
              <div className="text-xs text-text-muted mt-1">{s.s}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ────────────── HOW IT WORKS ────────────── */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 sm:px-10 py-20">
        <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">How it works</div>
            <h2 className="dm-display text-4xl sm:text-5xl mt-2 text-text-primary">Three steps. No middlemen.</h2>
          </div>
          <a
            href="https://etherscan.io/address/0xa204f8242A535979821d96093238B5ccC268631E"
            target="_blank" rel="noreferrer"
            className="font-mono text-xs text-text-muted hover:text-text-primary"
          >
            View contract on Etherscan →
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { n: '01', t: 'Set your price', d: 'Connect your wallet, pick USDC or ETH amounts for per-DM and lifetime tiers. Your ENS becomes your URL.' },
            { n: '02', t: 'Share the link', d: 'dmpay.eth/u/yourname.eth — drop it in your X bio, Telegram, Lens. Fans tap, pay, message.' },
            { n: '03', t: 'Get paid, talk back', d: 'Payment settles atomically: 97.5% to you, 2.5% protocol. Chat over end-to-end encrypted XMTP, portable anywhere.' },
          ].map(s => (
            <div key={s.n} className="bg-bg-panel border border-border-subtle rounded-2xl p-6">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-text-muted">{s.n}</div>
              <div className="text-xl font-medium mt-3 text-text-primary">{s.t}</div>
              <p className="text-sm text-text-secondary mt-2.5 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ────────────── WHO IT'S FOR ────────────── */}
      <section id="discover" className="border-t border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 py-20">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted">Built for</div>
          <h2 className="dm-display text-4xl sm:text-5xl mt-2 text-text-primary">People worth reaching.</h2>
          <p className="text-text-secondary max-w-2xl mt-4 leading-relaxed">
            If people already DM you for advice, deals, or alpha — DMpay turns that attention into income while filtering out spam.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
            {[
              { t: 'Founders', d: "Replace 'reach out via Telegram' with a priced inbox. Investors who are serious will pay. Pitchers who aren't, won't." },
              { t: 'Creators & KOLs', d: 'Skip the Patreon overhead. Set a lifetime pass for true fans, a per-DM price for everyone else. USDC clears instantly.' },
              { t: 'ENS domainers', d: 'Your premium ENS is already discoverable. Add a price and convert ENS-curious traffic into paid conversations.' },
              { t: 'Athletes & celebs', d: 'Charge for warm intros, charity DMs, or fan access. Each payment hits your wallet directly, not a platform balance.' },
            ].map(p => (
              <div key={p.t} className="bg-bg-panel border border-border-subtle rounded-2xl p-6">
                <div className="text-lg font-medium text-text-primary">{p.t}</div>
                <p className="text-sm text-text-secondary mt-2.5 leading-relaxed">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────── BIG CTA ────────────── */}
      <section className="max-w-6xl mx-auto px-6 sm:px-10 pb-20">
        <div className="rounded-3xl bg-brand text-brand-ink grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-10 items-center px-8 sm:px-14 py-14 sm:py-16">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] opacity-50">For creators</div>
            <h2 className="dm-display text-4xl sm:text-[56px] mt-3 leading-[0.95]">
              Open your inbox.<br />Close the spam.
            </h2>
            <p className="text-base sm:text-lg opacity-75 max-w-xl mt-5 leading-relaxed">
              Replace "DM me on Telegram" with a priced inbox. Filters tire-kickers.
              Serious capital, fans, and founders pay through.
            </p>
          </div>
          <div className="flex flex-col gap-3 items-start">
            <button
              onClick={primaryCta}
              className="bg-brand-ink text-brand hover:opacity-90 rounded-2xl px-6 py-4 font-medium inline-flex items-center gap-2 text-base"
            >
              {isConnected ? 'Set your price' : 'Connect & set price'} <ArrowRight size={16} />
            </button>
            <span className="font-mono text-[11px] opacity-60 ml-1">~30 seconds. One transaction.</span>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
