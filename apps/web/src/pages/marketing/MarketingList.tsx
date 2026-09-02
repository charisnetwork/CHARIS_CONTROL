import { Activity, TrendingUp } from 'lucide-react';

export function MarketingList() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Activity className="w-8 h-8 text-primary" />
            Marketing
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">Affiliate campaigns and ad metrics.</p>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 border border-[var(--border-color)]">
        <div className="flex items-center justify-center h-64 text-[var(--text-muted)] flex-col gap-4">
          <TrendingUp className="w-12 h-12 opacity-20" />
          <p>Campaign metrics and performance data.</p>
        </div>
      </div>
    </div>
  );
}
