'use client';

/**
 * Animated SVG checkbox — Uiverse.io / mrhyddenn
 *
 * Uses Radix `data-state` to drive CSS stroke-dashoffset animations.
 * The path draws the box outline, and the polyline draws the checkmark.
 * On check: path dashes away, polyline draws in with a delay.
 */

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { cn } from '@/lib/utils';

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'group relative inline-flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center',
      'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator forceMount asChild>
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        className="checkbox-svg"
        aria-hidden="true"
      >
        <path
          className="checkbox-box"
          d="M1,9 L1,3.5 C1,2 2,1 3.5,1 L14.5,1 C16,1 17,2 17,3.5 L17,14.5 C17,16 16,17 14.5,17 L3.5,17 C2,17 1,16 1,14.5 L1,9 Z"
        />
        <polyline
          className="checkbox-check"
          points="1 9 7 14 15 4"
        />
      </svg>
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
