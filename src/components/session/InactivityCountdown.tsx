'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';

interface InactivityCountdownProps {
  durationSeconds: number;
  onExpire: () => void;
  onCancel: () => void;
}

/**
 * Full-screen overlay showing a countdown timer.
 * The user can click "Stay Logged In" to cancel the auto-logout.
 * Any mouse/keyboard activity also cancels via the parent's activity listener.
 */
export function InactivityCountdown({ durationSeconds, onExpire, onCancel }: InactivityCountdownProps) {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiredRef = useRef(false);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          if (!expiredRef.current) {
            expiredRef.current = true;
            // Use setTimeout to avoid state update during render
            setTimeout(onExpire, 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [onExpire, durationSeconds]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = secondsLeft / durationSeconds;

  return (
    <motion.div
      className="fixed inset-0 z-9997 bg-black/70 backdrop-blur-xs flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      role="alertdialog"
      aria-modal="true"
      aria-label="Inactivity warning"
    >
      <motion.div
        className="bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        {/* Circular progress indicator */}
        <div className="relative w-24 h-24 mx-auto mb-5">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke="currentColor"
              className="text-gray-200 dark:text-gray-700"
              strokeWidth="6"
            />
            {/* Progress circle */}
            <circle
              cx="50" cy="50" r="42"
              fill="none"
              stroke="currentColor"
              className="text-red-500"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 42}
              strokeDashoffset={2 * Math.PI * 42 * (1 - progress)}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          {/* Timer text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
              {minutes}:{seconds.toString().padStart(2, '0')}
            </span>
          </div>
        </div>

        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Are you still there?
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          You&apos;ll be logged out due to inactivity in{' '}
          <span className="font-medium text-red-600">{minutes}:{seconds.toString().padStart(2, '0')}</span>
        </p>

        <button
          onClick={onCancel}
          className="w-full px-6 py-3 rounded-xl bg-[#D71920] hover:bg-[#b8151b] text-white font-semibold text-sm shadow-lg shadow-red-500/25 transition-all hover:shadow-xl hover:shadow-red-500/30 focus:outline-hidden focus:ring-2 focus:ring-red-500/50"
          autoFocus
        >
          Stay Logged In
        </button>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
          Any activity will cancel this timer
        </p>
      </motion.div>
    </motion.div>
  );
}
