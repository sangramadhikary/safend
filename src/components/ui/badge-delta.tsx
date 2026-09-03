'use client';

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export type DeltaType = 
  | "increase" 
  | "moderateIncrease" 
  | "unchanged" 
  | "moderateDecrease" 
  | "decrease";

const badgeDeltaVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      deltaType: {
        increase: "border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
        moderateIncrease: "border-transparent bg-emerald-50/50 text-emerald-600 dark:bg-emerald-900/10 dark:text-emerald-500",
        unchanged: "border-transparent bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
        moderateDecrease: "border-transparent bg-amber-50/50 text-amber-600 dark:bg-amber-900/10 dark:text-amber-500",
        decrease: "border-transparent bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
      },
    },
    defaultVariants: {
      deltaType: "unchanged",
    },
  }
)

export interface BadgeDeltaProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeDeltaVariants> {
  asChild?: boolean
}

function BadgeDelta({
  className,
  deltaType,
  ...props
}: BadgeDeltaProps) {
  const deltaIcons = {
    increase: "↑",
    moderateIncrease: "↗",
    unchanged: "→",
    moderateDecrease: "↘",
    decrease: "↓"
  };

  const icon = deltaType ? deltaIcons[deltaType] : deltaIcons.unchanged;

  return (
    <div className={cn(badgeDeltaVariants({ deltaType }), className)} {...props}>
      {icon}
    </div>
  )
}

export { BadgeDelta, badgeDeltaVariants }
