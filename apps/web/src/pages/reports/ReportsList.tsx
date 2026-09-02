import { BarChart3, PieChart } from 'lucide-react';

export function ReportsList() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-primary" />
            Reports
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">Revenue analytics, MRR/ARR, churn metrics.</p>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 border border-[var(--border-color)]">
        <div className="flex items-center justify-center h-64 text-[var(--text-muted)] flex-col gap-4">
          <PieChart className="w-12 h-12 opacity-20" />
          <p>Comprehensive charts and reporting analytics.</p>
        </div>
      </div>
    </div>
  );
}
