'use client';

import { useEffect, useRef } from 'react';
import {
  useInView,
  useMotionValue,
  useSpring,
  useReducedMotion,
} from 'framer-motion';

interface AnimatedCounterProps {
  /** The final numeric value to count up to. */
  value: number;
  /** Optional text rendered before the number (e.g. a currency symbol). */
  prefix?: string;
  /** Optional text rendered after the number (e.g. "+", "%"). */
  suffix?: string;
  /** Number of decimal places to display. Defaults to 0. */
  decimals?: number;
  className?: string;
}

/**
 * Counts up from 0 to `value` once it scrolls into view. Respects the user's
 * reduced-motion preference by rendering the final value immediately.
 */
export function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  className,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, {
    duration: 1.6,
    bounce: 0,
  });

  useEffect(() => {
    if (!isInView) return;

    if (reduceMotion) {
      if (ref.current) {
        ref.current.textContent = `${prefix}${value.toFixed(decimals)}${suffix}`;
      }
      return;
    }

    motionValue.set(value);
  }, [isInView, value, motionValue, reduceMotion, prefix, suffix, decimals]);

  useEffect(() => {
    const unsubscribe = spring.on('change', (latest) => {
      if (ref.current) {
        ref.current.textContent = `${prefix}${latest.toFixed(decimals)}${suffix}`;
      }
    });
    return () => unsubscribe();
  }, [spring, prefix, suffix, decimals]);

  return (
    <span ref={ref} className={className}>
      {`${prefix}${(0).toFixed(decimals)}${suffix}`}
    </span>
  );
}
