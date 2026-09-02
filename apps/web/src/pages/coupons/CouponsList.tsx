import { Ticket, Plus, Power } from 'lucide-react';

export function CouponsList() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Ticket className="w-8 h-8 text-primary" />
            Coupons
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">Manage promotional coupons and discounts.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:brightness-110 transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] text-sm font-medium">
          <Plus className="w-4 h-4" /> Create Coupon
        </button>
      </div>

      <div className="glass rounded-2xl p-6 border border-[var(--border-color)]">
        <div className="flex items-center justify-center h-64 text-[var(--text-muted)] flex-col gap-4">
          <Ticket className="w-12 h-12 opacity-20" />
          <p>Active coupons will be displayed here.</p>
          <div className="flex items-center gap-2 text-xs">
            <Power className="w-3 h-3 text-emerald-400" />
            <span>Toggle active status to enable/disable</span>
          </div>
        </div>
      </div>
    </div>
  );
}
