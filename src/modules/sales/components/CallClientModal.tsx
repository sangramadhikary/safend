'use client';
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Phone, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CallClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientName: string;
  clientPhone: string;
}

export function CallClientModal({ isOpen, onClose, clientName, clientPhone }: CallClientModalProps) {
  const { toast } = useToast();

  const copyPhoneNumber = () => {
    navigator.clipboard.writeText(clientPhone);
    toast({
      title: "Copied!",
      description: "Phone number copied to clipboard",
      duration: 2000,
    });
  };

  const initiateCall = () => {
    window.location.href = `tel:${clientPhone}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-green-600" />
            Call Client
          </DialogTitle>
          <DialogDescription>
            Contact your client via phone
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Contact Name */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Contact Name:</p>
            <p className="text-lg font-bold">{clientName}</p>
          </div>

          {/* Phone Number */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Phone Number:</p>
            <p className="text-2xl font-bold text-center py-2">{clientPhone}</p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pt-4">
            <Button
              variant="outline"
              onClick={copyPhoneNumber}
              className="w-full"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Number
            </Button>
            <Button
              variant="ghost"
              onClick={onClose}
              className="w-full"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
