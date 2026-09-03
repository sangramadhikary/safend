'use client';

import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

type GlassVariant = 'light' | 'red' | 'dark';

const VARIANT_CLASS: Record<GlassVariant, string> = {
  light: 'liquid-glass',
  red: 'liquid-glass-red',
  dark: 'liquid-glass-dark',
};

interface GlassCardProps extends HTMLMotionProps<'div'> {
  variant?: GlassVariant;
  /** Adds the animated specular sheen sweep on hover. */
  sheen?: boolean;
  className?: string;
}

/**
 * Reusable liquid-glass / glassmorphism surface. Combines the frosted glass
 * utilities defined in index.css with optional hover sheen and motion props.
 */
export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ variant = 'light', sheen = false, className, children, ...rest }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={cn(
          'relative overflow-hidden rounded-2xl',
          VARIANT_CLASS[variant],
          sheen && 'glass-sheen',
          className,
        )}
        {...rest}
      >
        {children}
      </motion.div>
    );
  },
);

GlassCard.displayName = 'GlassCard';
