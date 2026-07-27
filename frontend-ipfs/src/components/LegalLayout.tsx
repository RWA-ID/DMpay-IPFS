import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Footer } from './Footer';

export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <main className="flex-1 overflow-y-auto bg-bg-base">
      <div className="max-w-3xl mx-auto px-6 py-14">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm mb-10"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <h1 className="dm-display text-[clamp(2rem,6vw,3.25rem)] text-text-primary">{title}</h1>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-muted mt-4">
          Last updated: {updated}
        </p>

        <div className="mt-12 space-y-10 text-sm leading-relaxed text-text-secondary">{children}</div>
      </div>
      <Footer />
    </main>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-text-primary font-semibold text-base mb-3">{heading}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-text-primary/90 font-semibold mb-1">{children}</h3>;
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-5 space-y-2 marker:text-text-faint">{children}</ul>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-text-primary underline underline-offset-2 decoration-border-strong hover:decoration-text-primary"
    >
      {children}
    </a>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[0.92em] text-text-primary break-all">{children}</span>;
}
