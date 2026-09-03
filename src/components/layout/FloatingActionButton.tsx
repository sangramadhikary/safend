'use client';

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, UserPlus, FilePlus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActionItem {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  color?: string;
}

export const FloatingActionButton = () => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  const actionItems: ActionItem[] = [
    {
      icon: UserPlus,
      label: "Add Employee",
      onClick: () => {
        setIsOpen(false);
      },
      color: "bg-blue-500"
    },
    {
      icon: FilePlus,
      label: "New Report",
      onClick: () => {
        setIsOpen(false);
      },
      color: "bg-green-500"
    },
    {
      icon: Settings,
      label: "Settings",
      onClick: () => {
        setIsOpen(false);
      },
      color: "bg-purple-500"
    }
  ];

  // Ripple effect state
  const [ripple, setRipple] = useState({ active: false, x: 0, y: 0 });

  const handleMainButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Get the button's position and dimensions
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();

    // Calculate click position relative to button
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Activate the ripple effect
    setRipple({ active: true, x, y });

    // Reset the ripple effect after animation
    setTimeout(() => {
      setRipple({ active: false, x: 0, y: 0 });
    }, 600);

    toggleOpen();
  };

  return (
    <div className="fixed bottom-20 right-6 md:bottom-6 z-40 flex flex-col-reverse items-end gap-3">
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/20 z-30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />

            <div className="relative z-40">
              {actionItems.map((item, index) => (
                <motion.button
                  key={index}
                  onClick={item.onClick}
                  className={cn(
                    "flex items-center mb-3 z-40",
                    "rounded-full shadow-md"
                  )}
                  initial={{ scale: 0, y: 0, opacity: 0 }}
                  animate={{ 
                    scale: 1, 
                    y: -60 * (index + 1),
                    opacity: 1,
                    transition: { 
                      delay: 0.05 * index,
                      type: "spring",
                      stiffness: 200,
                      damping: 15
                    }
                  }}
                  exit={{ 
                    scale: 0,
                    y: 0,
                    opacity: 0,
                    transition: {
                      delay: 0.05 * (actionItems.length - index - 1),
                      duration: 0.2
                    }
                  }}
                >
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center text-white",
                    item.color || "bg-blue-500"
                  )}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <motion.div
                    className="bg-background border rounded-r-full h-10 flex items-center pr-4 pl-2 shadow-xs"
                    initial={{ width: 0, opacity: 0 }}
                    animate={{
                      width: "auto",
                      opacity: 1,
                      transition: { delay: 0.1 + 0.05 * index }
                    }}
                    exit={{ width: 0, opacity: 0 }}
                  >
                    <span className="whitespace-nowrap text-sm font-medium">
                      {item.label}
                    </span>
                  </motion.div>
                </motion.button>
              ))}
            </div>
          </>
        )}
      </AnimatePresence>

      <motion.button
        className="w-16 h-16 bg-safend-red text-white rounded-full shadow-lg flex items-center justify-center overflow-hidden relative hover-scale"
        onClick={handleMainButtonClick}
        whileTap={{ scale: 0.95 }}
      >
        {ripple.active && (
          <motion.div
            className="absolute bg-white/30 rounded-full"
            style={{
              top: ripple.y,
              left: ripple.x,
              transform: 'translate(-50%, -50%)',
            }}
            initial={{ width: 0, height: 0, opacity: 0.7 }}
            animate={{ width: 150, height: 150, opacity: 0 }}
            transition={{ duration: 0.6 }}
          />
        )}
        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
        >
          <Plus className="h-8 w-8" />
        </motion.div>
      </motion.button>
    </div>
  );
};
