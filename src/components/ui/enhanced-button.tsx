'use client';

import * as React from "react";
import { Button as BaseButton, ButtonProps } from "@/components/ui/button";
import { getSoundBus } from "@/services/SoundService";

export interface EnhancedButtonProps extends ButtonProps {
  soundEffect?: 'click' | 'add' | 'success' | 'delete' | 'error' | 'download' | 'notification' | 'create' | 'edit' | 'approve' | 'reject' | null;
}

const EnhancedButton = React.forwardRef<HTMLButtonElement, EnhancedButtonProps>(
  ({ soundEffect = 'click', onClick, ...props }, ref) => {
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      // Play sound if specified (only on client)
      if (soundEffect && typeof window !== 'undefined') {
        getSoundBus().play(soundEffect);
      }
      
      // Call original onClick if provided
      if (onClick) {
        onClick(event);
      }
    };

    return <BaseButton ref={ref} onClick={handleClick} {...props} />;
  }
);

EnhancedButton.displayName = "EnhancedButton";

export { EnhancedButton };
