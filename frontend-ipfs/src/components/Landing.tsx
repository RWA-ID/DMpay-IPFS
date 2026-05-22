import { useState } from 'react';
import { isAddress } from 'viem';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useNavigate } from 'react-router-dom';
import {
  Search, Wallet, Coins, Lock, Settings as SettingsIcon, Sparkles,
  Rocket, Mic, Award, Briefcase, MousePointerClick, Send, MessageCircle,
} from 'lucide-react';
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

  return (
    <main className="flex-1 overflow-y-auto bg-bg-base">
      <div className="max-w-6xl mx-auto px-6 pt-16 pb-12">
        {/* Hero */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-bg-panel border border-border-subtle rounded-full px-3 py-1 text-xs text-text-secondary mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-online animate-pulse" />
            Live on Ethereum mainnet
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-5 leading-[1.05]">
            <span className="bg-gradient-to-r from-white via-white to-brand bg-clip-text text-transparent">
              Pay to DM any wallet
            </span>
            <br />
            <span className="text-text-secondary">on Ethereum.</span>
          </h1>

          <p className="text-lg text-text-secondary max-w-xl mx-auto mb-6">
            Wallet owners set their price in USDC or ETH. Senders pay to open a conversation. No spam, no middlemen — payments go directly to recipients.
          </p>

          <a
            href="https://xmtp.org"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 bg-bg-panel border border-border-subtle rounded-full pl-1.5 pr-3 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors mb-10"
          >
            <img src="/xmtp.jpg" alt="" className="w-5 h-5 rounded-full" />
            Powered by XMTP
          </a>

          <div className="max-w-xl mx-auto">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-brand to-purple-500 rounded-2xl opacity-30 group-focus-within:opacity-60 blur-md transition" />
              <div className="relative flex items-center bg-bg-panel border border-border-subtle rounded-2xl pl-5 pr-5 py-2 shadow-xl">
                <Search size={20} className="text-text-muted" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="vitalik.eth or 0x…"
                  className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted text-base px-3 py-3 focus:outline-none"
                />
              </div>
            </div>
            {query && !valid && (
              <div className="text-text-muted text-xs mt-3">Type a full ENS name or 0x address.</div>
            )}
          </div>
        </div>

        {/* Profile cards */}
        {(isConnected || valid) && (
          <div className={`mt-10 grid gap-4 ${isConnected && valid ? 'md:grid-cols-2' : 'max-w-xl mx-auto'}`}>
            {isConnected && address && (
              <div>
                <div className="text-xs uppercase tracking-wider text-text-muted mb-2 px-1">Your profile</div>
                <ProfileCard nameOrAddress={address} />
                <button
                  onClick={() => navigate('/settings')}
                  className="mt-3 w-full bg-bg-panel hover:bg-bg-hover border border-border-subtle text-text-primary rounded-2xl py-3 flex items-center justify-center gap-2 font-medium text-sm transition-colors"
                >
                  <SettingsIcon size={14} /> Set up profile & pricing
                </button>
              </div>
            )}
            {valid && (
              <div>
                <div className="text-xs uppercase tracking-wider text-text-muted mb-2 px-1">Search result</div>
                <ProfileCard key={trimmed} nameOrAddress={trimmed} />
              </div>
            )}
          </div>
        )}

        {!isConnected && !valid && (
          <div className="mt-10 max-w-xl mx-auto bg-bg-panel border border-border-subtle rounded-3xl p-6 text-center">
            <Sparkles className="text-brand mx-auto mb-3" size={22} />
            <div className="font-medium text-text-primary mb-1">Want to earn from your DMs?</div>
            <div className="text-sm text-text-secondary mb-5">Connect your wallet, set a price, and start receiving paid messages.</div>
            <button
              onClick={() => openConnectModal?.()}
              className="bg-brand hover:bg-brand-hover text-brand-ink rounded-2xl px-6 py-3 font-medium text-sm"
            >
              Connect & set up profile
            </button>
          </div>
        )}

        {!isConnected && !valid && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-16">
            <Feature icon={Wallet} title="Bring your own ENS" body="No registry. Your existing ENS name is your identity." />
            <Feature icon={Coins} title="USDC or ETH" body="Recipients choose what they accept. 97.5% goes to them." />
            <Feature icon={Lock} title="Non-custodial" body="Payments forwarded atomically. No funds held." />
          </div>
        )}
      </div>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-border-subtle bg-bg-base/50">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <div className="text-xs uppercase tracking-wider text-brand mb-2">How it works</div>
            <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary mb-3">From paywall to DM in four taps</h2>
            <p className="text-text-secondary max-w-2xl mx-auto">DMpay sits on top of Ethereum and XMTP. The protocol settles payment in a single transaction. The chat is end-to-end encrypted, off-chain, and works in any XMTP client.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Step n={1} icon={SettingsIcon} title="Set your price" body="Choose USDC, ETH, or a lifetime pass. Update or disable anytime." />
            <Step n={2} icon={MousePointerClick} title="Share your link" body="Anyone can find your profile at /u/yourname.eth. Add it to your bio." />
            <Step n={3} icon={Send} title="Sender pays once" body="USDC or ETH flows directly to your wallet. 2.5% to the protocol — no escrow, no claim flow." />
            <Step n={4} icon={MessageCircle} title="Chat over XMTP" body="End-to-end encrypted DMs, portable across every XMTP client." badge={<img src="/xmtp.jpg" alt="XMTP" className="w-5 h-5 rounded-full" />} />
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section id="who-its-for" className="border-t border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <div className="text-xs uppercase tracking-wider text-brand mb-2">Built for</div>
            <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary mb-3">Pricing the inbox you already own</h2>
            <p className="text-text-secondary max-w-2xl mx-auto">If people already DM you for advice, deals, or alpha — DMpay turns that attention into income while filtering out spam.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Persona icon={Rocket} title="Founders" body="Replace 'reach out via Telegram' with a priced inbox. Investors who are serious will pay. Pitchers who aren't, won't." />
            <Persona icon={Mic} title="Creators" body="Skip the Patreon overhead. Set a lifetime pass for true fans, a per-DM price for everyone else. USDC clears instantly." />
            <Persona icon={Award} title="ENS domainers" body="Your premium ENS is already discoverable. Add a price and convert ENS-curious traffic into paid conversations." />
            <Persona icon={Briefcase} title="KOLs & advisors" body="Charge for warm intros, deal review, or DD calls. Each DM is a paid signal, not another notification you'll archive." />
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="border-t border-border-subtle">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold text-text-primary mb-3">Your inbox should pay you back.</h2>
          <p className="text-text-secondary mb-6">Set a price in under a minute. Free to enable.</p>
          <button
            onClick={() => (isConnected ? navigate('/settings') : openConnectModal?.())}
            className="bg-brand hover:bg-brand-hover text-brand-ink rounded-2xl px-6 py-3 font-medium"
          >
            {isConnected ? 'Set up my profile →' : 'Connect & set price →'}
          </button>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function Feature({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5 text-left">
      <Icon className="text-brand mb-3" size={20} />
      <div className="font-medium text-text-primary mb-1">{title}</div>
      <div className="text-sm text-text-secondary">{body}</div>
    </div>
  );
}

function Step({ n, icon: Icon, title, body, badge }: { n: number; icon: any; title: string; body: string; badge?: React.ReactNode }) {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-brand-soft text-brand text-xs font-semibold flex items-center justify-center">{n}</span>
          <Icon size={16} className="text-brand" />
        </div>
        {badge}
      </div>
      <div className="font-medium text-text-primary mb-1">{title}</div>
      <div className="text-sm text-text-secondary">{body}</div>
    </div>
  );
}

function Persona({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="bg-bg-panel border border-border-subtle rounded-2xl p-6">
      <div className="w-10 h-10 rounded-xl bg-brand-soft flex items-center justify-center mb-4">
        <Icon className="text-brand" size={18} />
      </div>
      <div className="font-semibold text-text-primary mb-2">{title}</div>
      <div className="text-sm text-text-secondary leading-relaxed">{body}</div>
    </div>
  );
}
