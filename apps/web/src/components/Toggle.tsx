import { motion } from 'framer-motion';

/** Accessible on/off switch. */
export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:opacity-40 ${checked ? 'bg-blue-500' : 'bg-slate-700'}`}
    >
      <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} className={`h-5 w-5 rounded-full bg-white shadow ${checked ? 'ml-[22px]' : 'ml-0.5'}`} />
    </button>
  );
}
