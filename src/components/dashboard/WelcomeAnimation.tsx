'use client';

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSoundBus } from "@/services/SoundService";
import { useTheme } from "@/components/ThemeProvider";

export function WelcomeAnimation() {
  const [visible, setVisible] = useState(true);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  useEffect(() => {
    // Play welcome sound when component mounts (only on client)
    if (typeof window !== 'undefined') {
      getSoundBus().play('welcome');
    }
    
    // Hide animation after 3 seconds
    const timer = setTimeout(() => {
      setVisible(false);
    }, 3000);
    
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div 
            className="flex flex-col items-center"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <motion.div
              className="w-24 h-24 bg-linear-to-r from-red-600 to-black dark:to-white rounded-xl flex items-center justify-center shadow-lg mb-4"
              animate={{ 
                rotate: [0, 10, -10, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                duration: 1.5,
                repeat: 1, 
                ease: "easeInOut"
              }}
            >
              <span className="text-white font-bold text-4xl">S</span>
            </motion.div>
            
            <motion.h1
              className="text-3xl font-bold bg-linear-to-r from-red-600 to-gray-800 dark:to-white bg-clip-text text-transparent"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              Welcome to Safend Control Room
            </motion.h1>
            
            <motion.div 
              className="mt-8 h-1 rounded-full bg-gray-300 dark:bg-gray-700"
              initial={{ width: 0 }}
              animate={{ width: 200 }}
              transition={{ delay: 0.8, duration: 1.5 }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
