import { useEffect, useMemo, useRef, useState } from 'react';
import { usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { namehash } from 'viem/ens';
import { formatEther, type Hex } from 'viem';
import { Loader2, CheckCircle2, AlertCircle, Search, Clock, Sparkles } from 'lucide-react';
import {
  ETH_REGISTRAR_CONTROLLER, PUBLIC_RESOLVER, SECONDS_PER_YEAR, REVERSE_RECORD_ETH, ZERO_REFERRER,
  ethRegistrarControllerAbi, buildResolverData, generateSecret, EDITABLE_TEXT_KEYS, type Registration,
} from '../lib/ens';

const STORAGE_KEY = 'dmpay:ensCommit';
const LABEL_RE = /^[a-z0-9-]+$/;

const FIELD_LABELS: Record<string, { label: string; placeholder: string }> = {
  'description': { label: 'Bio', placeholder: 'Founder, investor, degen…' },
  'url': { label: 'Website', placeholder: 'https://yoursite.xyz' },
  'com.twitter': { label: 'X / Twitter', placeholder: 'yourhandle' },
  'com.github': { label: 'GitHub', placeholder: 'yourhandle' },
};

type Step = 'form' | 'committed' | 'ready' | 'done';

/**
 * Full in-app .eth registration via ENS ETHRegistrarController (commit/reveal).
 * On register we bundle resolver records (addr + chosen texts) and set the ETH
 * primary name, so the user is fully discoverable in one flow.
 */
export function EnsRegister({ address, onRegistered }: { address: `0x${string}`; onRegistered: (name: string) => void }) {
  const publicClient = usePublicClient();

  const [labelInput, setLabelInput] = useState('');
  const [years, setYears] = useState(1);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [step, setStep] = useState<Step>('form');
  const [committedAt, setCommittedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [localError, setLocalError] = useState<string | null>(null);
  // Frozen registration params captured at commit time (must match exactly on reveal).
  const regRef = useRef<Registration | null>(null);

  const label = labelInput.trim().toLowerCase();
  const validLabel = label.length >= 3 && LABEL_RE.test(label);
  const duration = BigInt(years) * SECONDS_PER_YEAR;
  const fullName = `${label}.eth`;

  const { data: available, isLoading: checkingAvail } = useReadContract({
    address: ETH_REGISTRAR_CONTROLLER, abi: ethRegistrarControllerAbi, functionName: 'available',
    args: [label], query: { enabled: validLabel && step === 'form' },
  });
  const { data: price } = useReadContract({
    address: ETH_REGISTRAR_CONTROLLER, abi: ethRegistrarControllerAbi, functionName: 'rentPrice',
    args: [label, duration], query: { enabled: validLabel && available === true && step === 'form' },
  });
  const { data: minAge } = useReadContract({
    address: ETH_REGISTRAR_CONTROLLER, abi: ethRegistrarControllerAbi, functionName: 'minCommitmentAge',
  });

  const minAgeSec = minAge ? Number(minAge) : 60;
  const totalPrice = price ? price.base + price.premium : 0n;

  // commit + register transactions
  const { writeContract: writeCommit, data: commitHash, isPending: committing, error: commitErr, reset: resetCommit } = useWriteContract();
  const { isLoading: commitConfirming, isSuccess: commitDone } = useWaitForTransactionReceipt({ hash: commitHash });
  const { writeContract: writeRegister, data: regHash, isPending: registering, error: regErr, reset: resetRegister } = useWriteContract();
  const { isLoading: regConfirming, isSuccess: regDone } = useWaitForTransactionReceipt({ hash: regHash });

  // Restore an in-flight commitment after a refresh.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { label: string; years: number; texts: Record<string, string>; secret: Hex; committedAt: number; owner: string };
      if (saved.owner?.toLowerCase() !== address.toLowerCase()) return;
      setLabelInput(saved.label);
      setYears(saved.years);
      setTexts(saved.texts);
      setCommittedAt(saved.committedAt);
      regRef.current = rebuildReg(saved.label, BigInt(saved.years) * SECONDS_PER_YEAR, saved.secret, address, saved.texts);
      setStep('committed');
    } catch { /* ignore */ }
  }, [address]);

  // Countdown ticker while waiting out the commitment age.
  useEffect(() => {
    if (step !== 'committed') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);

  const remaining = useMemo(() => {
    if (!committedAt) return minAgeSec;
    return Math.max(0, Math.ceil((committedAt + (minAgeSec + 5) * 1000 - now) / 1000));
  }, [committedAt, minAgeSec, now]);

  useEffect(() => { if (step === 'committed' && committedAt && remaining === 0) setStep('ready'); }, [step, committedAt, remaining]);
  useEffect(() => { if (commitDone && step === 'form') { setCommittedAt(Date.now()); setStep('committed'); } }, [commitDone, step]);
  useEffect(() => {
    if (regDone) {
      sessionStorage.removeItem(STORAGE_KEY);
      setStep('done');
      const t = setTimeout(() => onRegistered(fullName), 1000);
      return () => clearTimeout(t);
    }
  }, [regDone]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCommit() {
    if (!publicClient || !validLabel) return;
    setLocalError(null); resetCommit(); resetRegister();
    try {
      const s = generateSecret();
      const reg = rebuildReg(label, duration, s, address, texts);
      const commitment = await publicClient.readContract({
        address: ETH_REGISTRAR_CONTROLLER, abi: ethRegistrarControllerAbi, functionName: 'makeCommitment', args: [reg],
      });
      regRef.current = reg;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ label, years, texts, secret: s, committedAt: Date.now(), owner: address }));
      writeCommit({ address: ETH_REGISTRAR_CONTROLLER, abi: ethRegistrarControllerAbi, functionName: 'commit', args: [commitment] });
    } catch (e: any) {
      setLocalError(e?.shortMessage ?? e?.message ?? 'Failed to create commitment');
    }
  }

  async function handleRegister() {
    if (!publicClient || !regRef.current) return;
    setLocalError(null); resetRegister();
    try {
      // Re-read price at reveal time (it can drift) and add a small buffer.
      const fresh = await publicClient.readContract({
        address: ETH_REGISTRAR_CONTROLLER, abi: ethRegistrarControllerAbi, functionName: 'rentPrice', args: [regRef.current.label, regRef.current.duration],
      });
      const value = ((fresh.base + fresh.premium) * 105n) / 100n;
      writeRegister({ address: ETH_REGISTRAR_CONTROLLER, abi: ethRegistrarControllerAbi, functionName: 'register', args: [regRef.current], value });
    } catch (e: any) {
      setLocalError(e?.shortMessage ?? e?.message ?? 'Registration failed');
    }
  }

  function cancelFlow() {
    sessionStorage.removeItem(STORAGE_KEY);
    regRef.current = null;
    setCommittedAt(null); setStep('form');
    resetCommit(); resetRegister();
  }

  const error = localError ?? (commitErr as any)?.shortMessage ?? commitErr?.message ?? (regErr as any)?.shortMessage ?? regErr?.message ?? null;

  if (step === 'done') {
    return (
      <div className="text-center py-6">
        <CheckCircle2 size={28} className="text-success mx-auto mb-3" />
        <div className="dm-display text-2xl text-text-primary">{fullName} is yours.</div>
        <div className="text-sm text-text-secondary mt-2">Set as your primary name. Loading your profile…</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Name + availability */}
      <div>
        <div className="text-sm text-text-secondary mb-1.5">Choose a name</div>
        <div className="flex items-center bg-bg-elevated border border-border-subtle rounded-xl pl-4 pr-3 py-2.5 focus-within:ring-1 focus-within:ring-brand">
          <Search size={16} className="text-text-muted shrink-0" />
          <input
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value.replace(/\.eth$/i, ''))}
            disabled={step !== 'form'}
            placeholder="yourname"
            className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted px-3 py-0.5 focus:outline-none font-mono lowercase disabled:opacity-60"
          />
          <span className="font-mono text-text-muted text-sm">.eth</span>
        </div>
        {labelInput && !validLabel && (
          <div className="text-text-muted text-xs mt-2 font-mono">3+ chars, letters/numbers/hyphens only.</div>
        )}
        {step === 'form' && validLabel && (
          <div className="mt-2 text-sm font-mono flex items-center gap-2">
            {checkingAvail ? (
              <span className="text-text-muted flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Checking…</span>
            ) : available === true ? (
              <span className="text-success flex items-center gap-1.5"><CheckCircle2 size={12} /> {fullName} is available</span>
            ) : available === false ? (
              <span className="text-danger flex items-center gap-1.5"><AlertCircle size={12} /> {fullName} is taken</span>
            ) : null}
          </div>
        )}
      </div>

      {step === 'form' && validLabel && available === true && (
        <>
          {/* Term + price */}
          <div>
            <div className="text-sm text-text-secondary mb-1.5">Register for</div>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((y) => (
                <button
                  key={y}
                  onClick={() => setYears(y)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-medium border transition-colors ${years === y ? 'bg-brand text-brand-ink border-brand' : 'bg-bg-elevated text-text-secondary border-border-subtle hover:border-border-strong'}`}
                >
                  {y} {y === 1 ? 'year' : 'years'}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-baseline justify-between bg-bg-elevated border border-border-subtle rounded-xl px-4 py-3">
              <span className="text-sm text-text-muted">Estimated cost</span>
              <span className="dm-display font-mono text-xl text-text-primary">
                {totalPrice > 0n ? `${trim(formatEther(totalPrice), 4)} ETH` : '—'}
              </span>
            </div>
            <div className="text-[11px] text-text-muted mt-1.5">+ gas. Rent is paid for the full term; a small buffer is added for price drift.</div>
          </div>

          {/* Optional records */}
          <details className="bg-bg-elevated/50 border border-border-subtle rounded-xl px-4 py-3">
            <summary className="text-sm text-text-secondary cursor-pointer select-none">Add profile records (optional)</summary>
            <div className="grid gap-3 mt-3">
              {EDITABLE_TEXT_KEYS.map((key) => (
                <label key={key} className="block">
                  <div className="text-xs text-text-muted mb-1">{FIELD_LABELS[key].label}</div>
                  <input
                    value={texts[key] ?? ''}
                    onChange={(e) => setTexts((t) => ({ ...t, [key]: e.target.value }))}
                    placeholder={FIELD_LABELS[key].placeholder}
                    className="w-full bg-bg-elevated border border-border-subtle rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-brand text-sm"
                  />
                </label>
              ))}
            </div>
          </details>

          <InfoLine>Two steps, ~60s apart: a <b>commit</b> reserves the name, then <b>register</b> mints it, sets it as your primary name, and writes your records.</InfoLine>

          {error && <ErrorBox msg={error} />}

          <button
            onClick={handleCommit}
            disabled={committing || commitConfirming}
            className="w-full bg-brand hover:bg-brand-hover disabled:bg-bg-elevated disabled:text-text-muted text-brand-ink rounded-2xl py-3.5 flex items-center justify-center gap-2 font-medium transition-colors"
          >
            {committing || commitConfirming
              ? <><Loader2 size={16} className="animate-spin" /> {committing ? 'Confirm commit in wallet…' : 'Committing…'}</>
              : <><Sparkles size={16} /> Register {fullName}</>}
          </button>
        </>
      )}

      {(step === 'committed' || step === 'ready') && (
        <div className="bg-bg-elevated/50 border border-border-subtle rounded-2xl p-5 text-center">
          <Clock size={22} className="text-text-muted mx-auto mb-2" />
          <div className="dm-display text-xl text-text-primary">{fullName}</div>
          {step === 'committed' ? (
            <>
              <div className="text-sm text-text-secondary mt-2">Commitment confirmed. Waiting {remaining}s before we can register (prevents front-running).</div>
              <div className="mt-3 font-mono text-3xl text-text-primary tabular-nums">{remaining}s</div>
            </>
          ) : (
            <div className="text-sm text-text-secondary mt-2">Ready to register. This second transaction mints {fullName} and sets it as your primary name.</div>
          )}

          {error && <div className="mt-3 text-left"><ErrorBox msg={error} /></div>}

          <button
            onClick={handleRegister}
            disabled={step !== 'ready' || registering || regConfirming}
            className="mt-4 w-full bg-brand hover:bg-brand-hover disabled:bg-bg-elevated disabled:text-text-muted text-brand-ink rounded-2xl py-3.5 flex items-center justify-center gap-2 font-medium transition-colors"
          >
            {registering || regConfirming
              ? <><Loader2 size={16} className="animate-spin" /> {registering ? 'Confirm register in wallet…' : 'Registering…'}</>
              : step === 'ready' ? <><Sparkles size={16} /> Complete registration</> : <><Loader2 size={16} className="animate-spin" /> Waiting…</>}
          </button>
          <button onClick={cancelFlow} className="mt-2 text-xs text-text-muted hover:text-text-primary">Start over</button>
        </div>
      )}
    </div>
  );
}

function rebuildReg(label: string, duration: bigint, secret: Hex, owner: `0x${string}`, texts: Record<string, string>): Registration {
  const node = namehash(`${label}.eth`) as Hex;
  const data = buildResolverData(node, { addr: owner, texts });
  return { label, owner, duration, secret, resolver: PUBLIC_RESOLVER, data, reverseRecord: REVERSE_RECORD_ETH, referrer: ZERO_REFERRER };
}

function InfoLine({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-text-muted leading-relaxed bg-bg-elevated/50 border border-border-subtle rounded-xl px-3.5 py-2.5">{children}</div>;
}
function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-xl px-3 py-2.5 flex items-start gap-2">
      <AlertCircle size={14} className="shrink-0 mt-0.5" />
      <div className="flex-1 break-words">{msg}</div>
    </div>
  );
}
function trim(n: string, decimals: number) {
  const [a, b] = n.split('.');
  if (!b) return a;
  return `${a}.${b.slice(0, decimals).replace(/0+$/, '') || '0'}`;
}
