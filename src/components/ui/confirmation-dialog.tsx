'use client';

import React, { useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader } from "lucide-react";
import { getSoundBus } from "@/services/SoundService";

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  isLoading = false,
  icon,
}: ConfirmationDialogProps) {
  // Play notification sound when dialog opens
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      getSoundBus().play('notification');
    }
  }, [isOpen]);

  const handleConfirm = () => {
    // Play appropriate sound for action type (only on client)
    if (typeof window !== 'undefined') {
      getSoundBus().play(variant === 'destructive' ? 'delete' : 'success');
    }
    onConfirm();
  };

  const handleCancel = () => {
    if (typeof window !== 'undefined') {
      getSoundBus().play('click');
    }
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {icon && <span>{icon}</span>}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={isLoading} onClick={handleCancel}>
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button 
              variant={variant} 
              onClick={handleConfirm}
              disabled={isLoading}
              className="gap-2"
            >
              {isLoading && <Loader className="h-4 w-4 animate-spin" />}
              {isLoading ? "Processing..." : confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
