'use client';

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const toggleTheme = () => {
    // Use View Transitions API for a full-page ripple if supported
    if (typeof document !== "undefined" && (document as any).startViewTransition) {
      (document as any).startViewTransition(() => {
        setTheme(theme === "light" ? "dark" : "light");
      });
    } else {
      setTheme(theme === "light" ? "dark" : "light");
    }
  };

  const isDark = theme === "dark";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            className={cn(
              "rounded-full w-8 h-8 relative overflow-hidden",
              "bg-background/90 backdrop-blur-md border shadow-lg",
              "transition-all duration-300 ease-out hover:scale-110 active:scale-95",
              isDark
                ? "shadow-primary/20 border-primary/20"
                : "shadow-black/10 border-border"
            )}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {/* Animated background glow */}
            <motion.div
              className="absolute inset-0 rounded-full"
              animate={{
                background: isDark
                  ? "radial-gradient(circle, rgba(215,25,32,0.15) 0%, transparent 70%)"
                  : "radial-gradient(circle, rgba(251,191,36,0.15) 0%, transparent 70%)",
              }}
              transition={{ duration: 0.4 }}
            />

            {/* Icon swap with AnimatePresence */}
            <AnimatePresence mode="wait" initial={false}>
              {isDark ? (
                <motion.div
                  key="sun"
                  initial={{ opacity: 0, rotate: -60, scale: 0.5 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 60, scale: 0.5 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="relative"
                >
                  <Sun className="h-4 w-4 text-amber-400" />
                </motion.div>
              ) : (
                <motion.div
                  key="moon"
                  initial={{ opacity: 0, rotate: 60, scale: 0.5 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: -60, scale: 0.5 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="relative"
                >
                  <Moon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                </motion.div>
              )}
            </AnimatePresence>

            <span className="sr-only">
              {isDark ? "Switch to light mode" : "Switch to dark mode"}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className="bg-background/95 backdrop-blur-xs border border-primary/20 shadow-xl"
          sideOffset={8}
        >
          <p className="text-sm font-medium">
            {isDark ? "Switch to Light" : "Switch to Dark"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
