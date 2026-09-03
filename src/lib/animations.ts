/**
 * Centralized Framer Motion animation variants for the Safend HRM app.
 * Import from here instead of defining inline variants per component.
 */

import type { Variants, Transition } from "framer-motion";

// ─── Shared transitions ───────────────────────────────────────────────────────

export const spring: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 30,
};

export const springGentle: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 28,
};

export const easeOut: Transition = {
  duration: 0.22,
  ease: [0.25, 0.46, 0.45, 0.94],
};

export const easeOutFast: Transition = {
  duration: 0.15,
  ease: [0.25, 0.46, 0.45, 0.94],
};

// ─── Page / route transitions ─────────────────────────────────────────────────

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.15, ease: "easeIn" } },
};

// ─── Tab content ──────────────────────────────────────────────────────────────

export const tabContentVariants: Variants = {
  initial: { opacity: 0, y: 8, scale: 0.995 },
  animate: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: {
    opacity: 0, y: -4, scale: 0.995,
    transition: { duration: 0.14, ease: "easeIn" },
  },
};

// ─── Modal / Dialog ───────────────────────────────────────────────────────────

export const overlayVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.18 } },
};

export const dialogVariants: Variants = {
  initial: { opacity: 0, scale: 0.94, y: 12 },
  animate: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: "spring", stiffness: 400, damping: 32 },
  },
  exit: {
    opacity: 0, scale: 0.96, y: 8,
    transition: { duration: 0.16, ease: "easeIn" },
  },
};

// ─── Sheet / Drawer ───────────────────────────────────────────────────────────

export const sheetVariants = {
  right: {
    initial: { x: "100%", opacity: 0 },
    animate: { x: 0, opacity: 1, transition: springGentle },
    exit:    { x: "100%", opacity: 0, transition: easeOut },
  },
  left: {
    initial: { x: "-100%", opacity: 0 },
    animate: { x: 0, opacity: 1, transition: springGentle },
    exit:    { x: "-100%", opacity: 0, transition: easeOut },
  },
  bottom: {
    initial: { y: "100%", opacity: 0 },
    animate: { y: 0, opacity: 1, transition: springGentle },
    exit:    { y: "100%", opacity: 0, transition: easeOut },
  },
  top: {
    initial: { y: "-100%", opacity: 0 },
    animate: { y: 0, opacity: 1, transition: springGentle },
    exit:    { y: "-100%", opacity: 0, transition: easeOut },
  },
};

// ─── List / stagger ───────────────────────────────────────────────────────────

export const listContainerVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

export const listItemVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: easeOut },
  exit:    { opacity: 0, y: -4, transition: easeOutFast },
};

// ─── Card / panel entrance ────────────────────────────────────────────────────

export const cardVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] } },
};

// ─── Fade only ────────────────────────────────────────────────────────────────

export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
};

// ─── Scale pop (for chips, badges, toasts) ────────────────────────────────────

export const popVariants: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { opacity: 1, scale: 1, transition: spring },
  exit:    { opacity: 0, scale: 0.8, transition: easeOutFast },
};

// ─── Slide up (for toasts, banners) ──────────────────────────────────────────

export const slideUpVariants: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: springGentle },
  exit:    { opacity: 0, y: 8, transition: easeOutFast },
};

// ─── Theme toggle icon swap ───────────────────────────────────────────────────

export const iconEnter: Variants = {
  initial: { opacity: 0, rotate: -30, scale: 0.6 },
  animate: { opacity: 1, rotate: 0, scale: 1, transition: spring },
};

export const iconExit: Variants = {
  initial: { opacity: 1, rotate: 0, scale: 1 },
  exit:    { opacity: 0, rotate: 30, scale: 0.6, transition: easeOutFast },
};
