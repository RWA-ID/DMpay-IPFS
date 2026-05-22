import { FileText } from 'lucide-react';

export function DetailsPane() {
  return (
    <aside className="w-72 bg-bg-panel border-l border-border-subtle p-6 hidden lg:block">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Details</h3>
      <div className="space-y-6">
        <div>
          <h4 className="text-xs uppercase tracking-wider text-text-muted mb-3">Shared files</h4>
          <div className="bg-bg-elevated rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-soft rounded-lg flex items-center justify-center">
              <FileText size={18} className="text-brand" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">Q3 onboarding</div>
              <div className="text-xs text-text-muted">flow.fig</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
