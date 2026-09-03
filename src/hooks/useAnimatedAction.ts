/**
 * useAnimatedAction — wraps an async action with loading/success/error states
 * for driving animated feedback on save, delete, and other mutations.
 *
 * Usage:
 *   const { run, state } = useAnimatedAction(async () => { await save(); });
 *   // state: 'idle' | 'loading' | 'success' | 'error'
 */

import { useState, useCallback } from "react";

export type ActionState = "idle" | "loading" | "success" | "error";

interface UseAnimatedActionOptions {
  /** How long to hold the success/error state before resetting to idle (ms) */
  resetDelay?: number;
}

export function useAnimatedAction(
  action: () => Promise<void>,
  options: UseAnimatedActionOptions = {}
) {
  const { resetDelay = 1800 } = options;
  const [state, setState] = useState<ActionState>("idle");

  const run = useCallback(async () => {
    if (state === "loading") return;
    setState("loading");
    try {
      await action();
      setState("success");
    } catch {
      setState("error");
    } finally {
      setTimeout(() => setState("idle"), resetDelay);
    }
  }, [action, state, resetDelay]);

  return { run, state, isLoading: state === "loading" };
}
