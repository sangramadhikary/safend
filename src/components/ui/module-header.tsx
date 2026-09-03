'use client';
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { usePathname } from 'next/navigation';

// Paths where the layout-level ModuleHeaderBar is active
// (these modules should NOT render a second header)
const HOISTED_PATHS = ['/dashboard', '/sales', '/operations', '/hr', '/accounts', '/office-admin'];

interface ModuleHeaderProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
}

export function ModuleHeader({
  title,
  description,
  actionLabel,
  actionIcon,
  onAction
}: ModuleHeaderProps) {
  const pathname = usePathname();
  const segment = '/' + (pathname.split('/')[1] || '');

  // If the persistent layout header is already showing this module's title,
  // skip rendering to avoid duplicates. The title+description are already
  // painted above by ModuleHeaderBar in PersistentLayout.
  if (HOISTED_PATHS.includes(segment)) {
    return null;
  }

  return <div className="flex justify-between items-center mb-6">
      <div>
        <motion.h1 className="text-3xl font-bold bg-linear-to-r from-red-600 to-black bg-clip-text text-transparent" initial={{
        opacity: 0,
        x: -20
      }} animate={{
        opacity: 1,
        x: 0
      }} transition={{
        delay: 0.2
      }}>
          {title}
        </motion.h1>
        <p className="text-muted-foreground">
          {description}
        </p>
      </div>
      {actionLabel && <motion.div initial={{
      opacity: 0,
      scale: 0.9
    }} animate={{
      opacity: 1,
      scale: 1
    }} transition={{
      delay: 0.3
    }}>
          
        </motion.div>}
    </div>;
}
