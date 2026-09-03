'use client';

import { motion, useReducedMotion } from 'framer-motion';

interface MeshBackgroundProps {
  /** 'light' for white sections, 'red' for the dark CTA section. */
  tone?: 'light' | 'red';
  /** Show the subtle dotted/grid texture overlay. */
  grid?: boolean;
}

/**
 * Animated aurora-style mesh gradient that sits behind glassmorphism panels and
 * gives them something colourful to refract. Purely decorative.
 */
export function MeshBackground({ tone = 'light', grid = true }: MeshBackgroundProps) {
  const reduceMotion = useReducedMotion();

  if (tone === 'red') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-[#D71920] via-[#b8151b] to-[#7f0e13]" />
        <motion.div
          className="absolute -top-1/4 -left-1/4 h-[60%] w-[60%] rounded-full bg-[#ff4d4d]/40 blur-[120px]"
          animate={reduceMotion ? undefined : { x: [0, 60, 0], y: [0, 40, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-1/4 -right-1/4 h-[60%] w-[60%] rounded-full bg-[#5a0a0e]/60 blur-[120px]"
          animate={reduceMotion ? undefined : { x: [0, -50, 0], y: [0, -30, 0] }}
          transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut' }}
        />
        {grid && (
          <div
            className="absolute inset-0 opacity-20 mask-[radial-gradient(ellipse_at_center,black,transparent_75%)]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)',
              backgroundSize: '26px 26px',
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-b from-gray-50 via-white to-gray-50" />
      {/* Soft coloured aurora blobs that give the glass something to refract */}
      <motion.div
        className="absolute -top-32 -left-24 h-112 w-md rounded-full bg-[#D71920]/12 blur-[110px]"
        animate={reduceMotion ? undefined : { x: [0, 50, 0], y: [0, 30, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/3 -right-24 h-104 w-104 rounded-full bg-[#ff4d4d]/12 blur-[110px]"
        animate={reduceMotion ? undefined : { x: [0, -45, 0], y: [0, -25, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 21, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-[#3b82f6]/8 blur-[100px]"
        animate={reduceMotion ? undefined : { x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
      />
      {grid && (
        <div
          className="absolute inset-0 opacity-[0.35] mask-[radial-gradient(ellipse_at_center,black,transparent_70%)]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
      )}
    </div>
  );
}
