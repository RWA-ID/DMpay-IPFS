import { ExternalLink } from 'lucide-react';

const CONTRACT_ADDRESS = '0xa204f8242A535979821d96093238B5ccC268631E';

export function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-bg-base">
      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
        <div className="col-span-1 md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-brand flex items-center justify-center text-brand-ink font-bold text-xs">D</div>
            <span className="font-semibold text-text-primary">DMpay</span>
          </div>
          <p className="text-text-secondary">Non-custodial pay-to-DM on Ethereum. Set your price, get paid in USDC or ETH, message over XMTP.</p>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-text-muted mb-3">Product</div>
          <ul className="space-y-2 text-text-secondary">
            <li><a href="#how-it-works" className="hover:text-text-primary">How it works</a></li>
            <li><a href="#who-its-for" className="hover:text-text-primary">Who it's for</a></li>
            <li><a href="/settings" className="hover:text-text-primary">Set up your profile</a></li>
            <li><a href="/inbox" className="hover:text-text-primary">Inbox</a></li>
          </ul>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-text-muted mb-3">Onchain</div>
          <ul className="space-y-2 text-text-secondary">
            <li>
              <a href={`https://etherscan.io/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-text-primary">
                Contract on Etherscan <ExternalLink size={12} />
              </a>
            </li>
            <li>
              <a href={`https://eth.blockscout.com/address/${CONTRACT_ADDRESS}#code`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-text-primary">
                Source (Blockscout) <ExternalLink size={12} />
              </a>
            </li>
            <li className="text-text-muted text-xs font-mono break-all">{CONTRACT_ADDRESS}</li>
          </ul>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-text-muted mb-3">Community</div>
          <ul className="space-y-2 text-text-secondary">
            <li>
              <a href="https://x.com/dmpayeth" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-text-primary">
                @dmpayeth on X <ExternalLink size={12} />
              </a>
            </li>
            <li>
              <a href="https://github.com/RWA-ID/DMpay-Protocol" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-text-primary">
                GitHub <ExternalLink size={12} />
              </a>
            </li>
            <li>
              <a href="https://xmtp.org" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-text-primary">
                <img src="/xmtp.jpg" alt="XMTP" className="w-4 h-4 rounded-full" />
                Powered by XMTP <ExternalLink size={12} />
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 py-4 text-xs text-text-muted flex flex-col sm:flex-row justify-between gap-2">
          <div>© 2026 DMpay. Non-custodial protocol. No accounts. No backend.</div>
          <div>Protocol fee 2.5% · 97.5% to recipient · Atomic settlement</div>
        </div>
      </div>
    </footer>
  );
}
