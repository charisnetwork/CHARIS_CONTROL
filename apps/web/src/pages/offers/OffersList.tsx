import { Package, Plus } from 'lucide-react';

export function OffersList() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Package className="w-8 h-8 text-primary" />
            Offers
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">Manage promotional offers and banners.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:brightness-110 transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] text-sm font-medium">
          <Plus className="w-4 h-4" /> Create Offer
        </button>
      </div>

      <div className="glass rounded-2xl p-6 border border-[var(--border-color)]">
        <div className="flex items-center justify-center h-64 text-[var(--text-muted)] flex-col gap-4">
          <Package className="w-12 h-12 opacity-20" />
          <p>Promotional banners and offers go here.</p>
        </div>
      </div>
    </div>
  );
}
