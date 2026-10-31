import type { ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { Check, Infinity as InfinityIcon, Sparkles, TicketPercent } from 'lucide-react';
import { PlanArtworkImage } from './planVisuals';
import type { PlanArtwork } from '../../../services/controlApi';
import { ACCENTS, offerPrice, periodLabel, type CardOffer, type CardPlan } from './planModel';

const money = (value: number, currency: string) =>
  `${currency === 'INR' ? '₹' : `${currency} `}${value.toLocaleString('en-IN', { maximumFractionDigits: value % 1 ? 2 : 0 })}`;

/** Hanging price tag that swings gently, for plans with a live offer. */
function OfferTag({ offer, accent }: { offer: CardOffer; accent: (typeof ACCENTS)[keyof typeof ACCENTS] }) {
  const still = useReducedMotion();
  const text = offer.discount_type === 'percentage' ? `${Number(offer.discount_value)}% OFF` : `₹${Number(offer.discount_value)} OFF`;
  return (
    <motion.div
      className="absolute -top-2 left-5 z-10 origin-top"
      animate={still ? undefined : { rotate: [-7, 7, -7] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="mx-auto h-4 w-px bg-white/50" />
      <div className="relative rounded-md px-3 py-1.5 text-xs font-black tracking-wide text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})`, boxShadow: `0 8px 20px ${accent.glow}` }}>
        <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-slate-950 ring-2 ring-white/60" />
        {text}
      </div>
    </motion.div>
  );
}

export function PlanCard({ plan, artwork, accent, recommended = false, preview = false, children, dimmed = false }: {
  plan: CardPlan;
  artwork: Exclude<PlanArtwork, 'auto'>;
  accent: (typeof ACCENTS)[keyof typeof ACCENTS];
  recommended?: boolean;
  preview?: boolean;
  children?: ReactNode;
  dimmed?: boolean;
}) {
  const still = useReducedMotion();
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(y, [0, 1], [7, -7]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(x, [0, 1], [-7, 7]), { stiffness: 200, damping: 20 });
  const glare = useTransform([x, y], ([gx, gy]: number[]) => `radial-gradient(circle at ${gx * 100}% ${gy * 100}%, rgba(255,255,255,0.12), transparent 55%)`);
  const price = Number(plan.price);
  const discounted = offerPrice(price, plan.offer);
  const shown = plan.features.slice(0, 7);

  return (
    <div className={`relative [perspective:1200px] ${preview ? '' : 'h-full'} ${dimmed ? 'opacity-60' : ''}`}>
      <motion.article
        onPointerMove={(event) => { if (still) return; const box = event.currentTarget.getBoundingClientRect(); x.set((event.clientX - box.left) / box.width); y.set((event.clientY - box.top) / box.height); }}
        onPointerLeave={() => { x.set(0.5); y.set(0.5); }}
        style={still ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className="relative flex h-full flex-col overflow-hidden rounded-3xl p-[1.5px]"
      >
        {/* Animated gradient frame: brighter and spinning on the recommended plan. */}
        <div className={`absolute inset-[-60%] ${recommended && !still ? 'animate-[spin_6s_linear_infinite]' : ''}`} style={{ background: recommended ? `conic-gradient(from 0deg, ${accent.from}, ${accent.to}, transparent 40%, ${accent.from})` : `linear-gradient(160deg, ${accent.from}55, transparent 45%)` }} />
        <div className="relative flex h-full flex-col rounded-[calc(1.5rem-1.5px)] bg-slate-950/95 p-6 pt-7">
          <motion.div className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: glare }} />
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full blur-3xl" style={{ background: accent.glow }} />
          {plan.offer && <OfferTag offer={plan.offer} accent={accent} />}
          {(plan.badge || recommended) && <span className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold text-white shadow" style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}><Sparkles className="h-3 w-3" />{plan.badge || 'Recommended'}</span>}

          <div className="relative flex items-start justify-between gap-3" style={{ transform: still ? undefined : 'translateZ(40px)' }}>
            <div className="min-w-0 flex-1 pt-6">
              <h3 className="break-words text-2xl font-bold leading-tight tracking-tight">{plan.name || 'Plan name'}</h3>
              {plan.tagline && <p className="mt-1 text-sm text-slate-400">{plan.tagline}</p>}
            </div>
            <div className="mt-5 shrink-0"><PlanArtworkImage artwork={artwork} accent={accent} size={84} /></div>
          </div>

          <div className="relative mt-4" style={{ transform: still ? undefined : 'translateZ(30px)' }}>
            {(plan.compare_at_price || discounted !== null) && <p className="text-sm text-slate-500 line-through">{money(Number(plan.compare_at_price && discounted === null ? plan.compare_at_price : price), plan.currency)}</p>}
            <p className="flex items-baseline gap-1">
              <span className="bg-clip-text text-4xl font-black text-transparent" style={{ backgroundImage: `linear-gradient(135deg, #fff, ${accent.from})` }}>{price === 0 ? 'Free' : money(discounted ?? price, plan.currency)}</span>
              {price > 0 && <span className="text-sm text-slate-400">{periodLabel(plan.duration_value, plan.duration_unit)}</span>}
            </p>
            {plan.offer && discounted !== null && <p className="mt-1 text-xs font-semibold" style={{ color: accent.from }}>with code {plan.offer.code}</p>}
          </div>

          {plan.highlights.length > 0 && <ul className="relative mt-5 space-y-2">{plan.highlights.map((line) => <li key={line} className="flex gap-2 text-sm font-medium text-slate-100"><Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent.from }} />{line}</li>)}</ul>}

          <ul className="relative mt-5 flex-1 space-y-2 border-t border-white/5 pt-4">
            {shown.map((feature) => <li key={feature.name} className="flex items-center justify-between gap-3 text-sm text-slate-300">
              <span className="flex min-w-0 items-center gap-2"><span className="grid h-4 w-4 shrink-0 place-items-center rounded-full" style={{ background: `${accent.to}33` }}><Check className="h-3 w-3" style={{ color: accent.from }} /></span><span className="truncate">{feature.name}</span></span>
              <span className="shrink-0 text-xs text-slate-500">{feature.detail ?? <InfinityIcon className="h-3.5 w-3.5" />}</span>
            </li>)}
            {plan.features.length > shown.length && <li className="text-xs text-slate-500">+ {plan.features.length - shown.length} more features</li>}
            {plan.features.length === 0 && <li className="text-sm text-slate-500">No features switched on yet.</li>}
          </ul>

          {preview && <div className="relative mt-5 space-y-2">
            {plan.coupons_allowed && <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2 text-sm text-slate-400"><TicketPercent className="h-4 w-4" />{plan.offer ? <span className="font-mono text-slate-200">{plan.offer.code}</span> : 'Have a coupon?'}</div>}
            <button type="button" tabIndex={-1} className="w-full rounded-xl py-3 text-sm font-bold text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})`, boxShadow: `0 10px 30px ${accent.glow}` }}>{price === 0 ? 'Start free' : 'Subscribe now'}</button>
          </div>}
          {children && <div className="relative mt-5">{children}</div>}
        </div>
      </motion.article>
    </div>
  );
}
