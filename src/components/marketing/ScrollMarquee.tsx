'use client';

import { motion, useReducedMotion } from 'framer-motion';

interface ScrollMarqueeProps {
  /** Items to display in the marquee */
  items: Array<{ text: string; image?: string }>;
  /** Direction of scroll */
  direction?: 'left' | 'right';
  /** Duration of one full cycle in seconds */
  duration?: number;
  /** Whether to show images alongside text */
  showImages?: boolean;
  /** Additional class for the wrapper */
  className?: string;
}

/**
 * Horizontal infinite-scrolling marquee inspired by newformcap.com.
 * Text + optional image pairs scroll continuously. The text is large
 * display-scale (heading-sm) and images are rounded editorial crops.
 */
export function ScrollMarquee({
  items,
  direction = 'left',
  duration = 25,
  showImages = true,
  className = '',
}: ScrollMarqueeProps) {
  const reduceMotion = useReducedMotion();

  const xFrom = direction === 'left' ? '0%' : '-50%';
  const xTo = direction === 'left' ? '-50%' : '0%';

  return (
    <div className={`relative w-full overflow-hidden ${className}`}>
      <motion.div
        className="flex items-center gap-8 whitespace-nowrap"
        animate={reduceMotion ? undefined : { x: [xFrom, xTo] }}
        transition={
          reduceMotion
            ? undefined
            : { x: { duration, repeat: Infinity, ease: 'linear' } }
        }
      >
        {/* Duplicate items for seamless loop */}
        {[...items, ...items].map((item, i) => (
          <div key={`${item.text}-${i}`} className="flex items-center gap-6 shrink-0">
            {showImages && item.image && (
              <div className="w-[80px] h-[80px] rounded-[14px] overflow-hidden shrink-0">
                <img
                  src={item.image}
                  alt=""
                  className="w-full h-full object-cover grayscale"
                />
              </div>
            )}
            <span className="text-[clamp(2rem,5vw,3.75rem)] font-display font-bold text-safend-ink leading-[0.9] tracking-[-0.02em]">
              {item.text}
            </span>
            {/* Red separator dot */}
            <span className="w-2 h-2 rounded-full bg-safend-red shrink-0" aria-hidden />
          </div>
        ))}
      </motion.div>
    </div>
  );
}
