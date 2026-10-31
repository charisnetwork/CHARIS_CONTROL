import { useId, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { PlanArtwork } from '../../../services/controlApi';
import type { ACCENTS } from './planModel';

/** Layered gradient illustrations with a soft floating motion: a light "3D" look, no heavy GIFs. */
export function PlanArtworkImage({ artwork, accent, size = 88 }: { artwork: Exclude<PlanArtwork, 'auto'>; accent: (typeof ACCENTS)[keyof typeof ACCENTS]; size?: number }) {
  const id = useId().replace(/:/g, '');
  const still = useReducedMotion();
  if (artwork === 'none') return null;
  const fill = `url(#g${id})`;
  const shine = `url(#s${id})`;
  const shapes: Record<Exclude<PlanArtwork, 'auto' | 'none'>, ReactNode> = {
    rocket: <>
      <path d="M50 10c14 10 20 28 18 46l-8 10H40l-8-10c-2-18 4-36 18-46z" fill={fill} />
      <circle cx="50" cy="38" r="8" fill="#0f172a" opacity=".85" /><circle cx="50" cy="38" r="5" fill={shine} />
      <path d="M32 56l-10 14 14-2zM68 56l10 14-14-2z" fill={fill} opacity=".85" />
      <path d="M42 68c2 10 6 16 8 18 2-2 6-8 8-18z" fill="#fbbf24" />
    </>,
    crown: <>
      <path d="M16 70l6-38 16 18 12-26 12 26 16-18 6 38z" fill={fill} />
      <rect x="16" y="70" width="68" height="10" rx="3" fill={fill} />
      <circle cx="50" cy="56" r="5" fill="#fff" opacity=".9" /><circle cx="30" cy="60" r="3.5" fill="#fff" opacity=".7" /><circle cx="70" cy="60" r="3.5" fill="#fff" opacity=".7" />
    </>,
    gem: <>
      <path d="M28 22h44l14 20-36 42-36-42z" fill={fill} />
      <path d="M28 22l10 20h24l10-20M14 42h72M38 42l12 42 12-42" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2" />
      <path d="M38 42h24L50 22z" fill="#fff" opacity=".35" />
    </>,
    leaf: <>
      <path d="M20 78C18 40 44 18 82 18c2 38-22 62-60 60z" fill={fill} />
      <path d="M24 74c14-16 30-30 50-44" stroke="#fff" strokeOpacity=".6" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>,
    shield: <>
      <path d="M50 12l32 12v22c0 20-14 34-32 42-18-8-32-22-32-42V24z" fill={fill} />
      <path d="M36 50l10 10 18-20" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>,
    building: <>
      <rect x="26" y="20" width="32" height="64" rx="3" fill={fill} />
      <rect x="58" y="40" width="18" height="44" rx="3" fill={fill} opacity=".75" />
      {[30, 42, 54, 66].map((y) => <g key={y}><rect x="32" y={y} width="7" height="6" rx="1" fill="#fff" opacity=".7" /><rect x="45" y={y} width="7" height="6" rx="1" fill="#fff" opacity=".7" /></g>)}
    </>,
    sparkles: <>
      <path d="M44 14l7 22 22 7-22 7-7 22-7-22-22-7 22-7z" fill={fill} />
      <path d="M74 54l4 11 11 4-11 4-4 11-4-11-11-4 11-4z" fill={fill} opacity=".8" />
    </>,
    gift: <>
      <rect x="18" y="42" width="64" height="40" rx="4" fill={fill} />
      <rect x="14" y="30" width="72" height="16" rx="4" fill={fill} />
      <rect x="45" y="30" width="10" height="52" fill="#fff" opacity=".75" />
      <path d="M50 30c-6-14-22-14-20-4 1 6 14 5 20 4zm0 0c6-14 22-14 20-4-1 6-14 5-20 4z" fill="#fff" opacity=".85" />
    </>,
  };
  return (
    <motion.svg
      viewBox="0 0 100 100" width={size} height={size} aria-hidden="true"
      style={{ filter: `drop-shadow(0 14px 18px ${accent.glow})` }}
      animate={still ? undefined : { y: [0, -5, 0], rotate: [0, 2, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={accent.from} /><stop offset="1" stopColor={accent.to} /></linearGradient>
        <radialGradient id={`s${id}`}><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor={accent.from} /></radialGradient>
      </defs>
      <ellipse cx="50" cy="92" rx="26" ry="4" fill="#000" opacity=".25" />
      {shapes[artwork]}
    </motion.svg>
  );
}
