'use client';
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EmailClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientName: string;
  clientEmail: string;
  companyName: string;
}

export function EmailClientModal({ isOpen, onClose, clientName, clientEmail, companyName }: EmailClientModalProps) {
  const { toast } = useToast();

  const emailSubject = `We're Excited to Collaborate, ${clientName}!`;
  
  const emailBody = `Dear ${clientName},

Greetings from Safend Sales Team!

We're thrilled to connect with you regarding professional security services that can add value to your business. Our comprehensive security solutions are designed to combine reliability, professionalism, and affordability — perfect for modern businesses like ${companyName}.

Let's explore how we can collaborate to create secure and trusted solutions together.

Warm regards,

Safend Sales & Client Relations
Cuttack, Odisha
📞 +91-XXXXXXXXXX
🌐 www.safend.com`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
      duration: 2000,
    });
  };

  const openGmailDraft = () => {
    const encodedSubject = encodeURIComponent(emailSubject);
    const encodedBody = encodeURIComponent(emailBody);
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${clientEmail}&su=${encodedSubject}&body=${encodedBody}`;
    window.open(gmailUrl, '_blank');
  };

  const openOutlookDraft = () => {
    const encodedSubject = encodeURIComponent(emailSubject);
    const encodedBody = encodeURIComponent(emailBody);
    const outlookUrl = `https://outlook.office.com/mail/deeplink/compose?to=${clientEmail}&subject=${encodedSubject}&body=${encodedBody}`;
    window.open(outlookUrl, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-red-600" />
            Email Client
          </DialogTitle>
          <DialogDescription>
            Send a professional email to your client
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Client Info */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Client Name:</p>
            <p className="text-lg font-bold">{clientName}</p>
          </div>

          {/* Email Address with Copy */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Email Address:</p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-medium">{clientEmail}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(clientEmail, "Email address")}
                className="flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy Email
              </Button>
            </div>
          </div>

          {/* Email Preview */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Email Preview:</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(emailBody, "Email draft")}
                className="flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy Draft
              </Button>
            </div>
            <div className="bg-white dark:bg-gray-900 p-4 rounded border border-gray-200 dark:border-gray-700">
              <p className="font-semibold mb-2">Subject: {emailSubject}</p>
              <div className="text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                {emailBody}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={openGmailDraft}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              <Mail className="h-4 w-4 mr-2" />
              Send via Gmail
            </Button>
            <Button
              onClick={openOutlookDraft}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Mail className="h-4 w-4 mr-2" />
              Send via Outlook
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
