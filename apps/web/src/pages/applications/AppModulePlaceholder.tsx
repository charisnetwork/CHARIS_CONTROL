import { Construction } from 'lucide-react';
import { useProductStore } from '../../store/productStore';

export function AppModulePlaceholder({ title, phase }: { title: string; phase: number }) {
  const application = useProductStore((state) => state.selectedProduct);
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-lg rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-blue-500/10 text-blue-400"><Construction className="h-6 w-6" /></span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-blue-400">Implementation phase {phase}</p>
        <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">This module will activate for {application?.displayName} after its app-scoped API and isolation tests pass. Legacy global data is intentionally not shown here.</p>
      </div>
    </div>
  );
}
