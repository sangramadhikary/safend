'use client';

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

interface ModuleCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function ModuleCard({ children, className, delay = 0 }: ModuleCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card className={`glass-card overflow-hidden border border-gray-200 dark:border-gray-800 shadow-md bg-white/50 dark:bg-gray-900/50 backdrop-blur-xs ${className}`}>
        {children}
      </Card>
    </motion.div>
  );
}
