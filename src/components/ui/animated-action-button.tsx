'use client';

/**
 * AnimatedActionButton
 * A button that animates through idle → loading → success/error states.
 * Drop-in replacement for save, delete, confirm buttons.
 *
 * Usage:
 *   <AnimatedActionButton
 *     onClick={handleSave}
 *     idleLabel="Save"
 *     successLabel="Saved!"
 *     errorLabel="Failed"
 *     variant="save"   // 'save' | 'delete' | 'confirm'
 *   />
 */

import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Loader2, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnimatedAction, type ActionState } from "@/hooks/useAnimatedAction";
import type { ButtonHTMLAttributes } from "react";

interface AnimatedActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onClick: () => Promise<void>;
  idleLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  loadingLabel?: string;
  variant?: "save" | "delete" | "confirm" | "default";
  size?: "sm" | "md" | "lg";
  idleIcon?: React.ReactNode;
}

const stateConfig: Record<ActionState, { bg: string; text: string }> = {
  idle:    { bg: "",                                                          text: "" },
  loading: { bg: "opacity-80 cursor-not-allowed",                            text: "" },
  success: { bg: "bg-green-500 border-green-500 hover:bg-green-500",         text: "text-white" },
  error:   { bg: "bg-red-500 border-red-500 hover:bg-red-500",               text: "text-white" },
};

const variantBase: Record<string, string> = {
  save:    "bg-[#D71920] hover:bg-[#B01419] text-white border-transparent",
  delete:  "bg-red-600 hover:bg-red-700 text-white border-transparent",
  confirm: "bg-black dark:bg-white text-white dark:text-black border-transparent",
  default: "bg-background border border-input hover:bg-accent text-foreground",
};

const sizeClass: Record<string, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-10 px-5 text-sm gap-2",
};

const defaultIcons: Record<string, React.ReactNode> = {
  save:    <Save className="h-3.5 w-3.5" />,
  delete:  <Trash2 className="h-3.5 w-3.5" />,
  confirm: <Check className="h-3.5 w-3.5" />,
  default: null,
};

export function AnimatedActionButton({
  onClick,
  idleLabel = "Save",
  successLabel = "Done!",
  errorLabel = "Failed",
  loadingLabel = "Saving...",
  variant = "save",
  size = "md",
  idleIcon,
  className,
  disabled,
  ...props
}: AnimatedActionButtonProps) {
  const { run, state } = useAnimatedAction(onClick);

  const icon = idleIcon ?? defaultIcons[variant];

  const currentLabel =
    state === "loading" ? loadingLabel :
    state === "success" ? successLabel :
    state === "error"   ? errorLabel   :
    idleLabel;

  const currentIcon =
    state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
    state === "success" ? <Check className="h-3.5 w-3.5" /> :
    state === "error"   ? <X className="h-3.5 w-3.5" /> :
    icon;

  return (
    <motion.button
      onClick={run}
      disabled={disabled || state === "loading"}
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: state === "idle" ? 1.02 : 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        variantBase[variant],
        stateConfig[state].bg,
        stateConfig[state].text,
        sizeClass[size],
        className
      )}
      {...(props as any)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.12 }}
          className="flex items-center gap-1.5"
        >
          {currentIcon}
          {currentLabel}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
