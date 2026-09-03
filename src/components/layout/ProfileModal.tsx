'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import UserProfile from '@/modules/UserProfile';

/**
 * Listens for the custom 'open:profile-modal' event and renders the
 * User Profile inside a full-screen dialog. This keeps the Sidebar and
 * any other trigger decoupled — just dispatch the event to open it.
 *
 * Usage from anywhere:
 *   window.dispatchEvent(new CustomEvent('open:profile-modal'));
 */
export function ProfileModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open:profile-modal', handler);
    return () => window.removeEventListener('open:profile-modal', handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-4xl w-full max-h-[92vh] overflow-y-auto p-0">
        <VisuallyHidden><DialogTitle>User Profile</DialogTitle></VisuallyHidden>
        <UserProfile />
      </DialogContent>
    </Dialog>
  );
}
