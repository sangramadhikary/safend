'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Zap } from 'lucide-react';
import { OneTimeInvoiceForm } from './OneTimeInvoiceForm';
import { GenerateInvoiceDialog } from './GenerateInvoiceDialog';

interface RaiseInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function RaiseInvoiceDialog({ open, onOpenChange, onSuccess }: RaiseInvoiceDialogProps) {
  const [selectedOption, setSelectedOption] = useState<'choice' | 'one-time' | 'generate'>('choice');

  const handleClose = () => {
    setSelectedOption('choice');
    onOpenChange(false);
  };

  const handleSuccess = () => {
    setSelectedOption('choice');
    onSuccess();
    onOpenChange(false);
  };

  if (selectedOption === 'one-time') {
    return (
      <OneTimeInvoiceForm
        open={true}
        onOpenChange={(v) => { if (!v) { setSelectedOption('choice'); onOpenChange(false); } }}
        onSuccess={handleSuccess}
        onBack={() => setSelectedOption('choice')}
      />
    );
  }

  if (selectedOption === 'generate') {
    return (
      <GenerateInvoiceDialog
        open={true}
        onOpenChange={(v) => { if (!v) { setSelectedOption('choice'); onOpenChange(false); } }}
        onSuccess={handleSuccess}
        onBack={() => setSelectedOption('choice')}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Raise Invoice</DialogTitle>
          <p className="text-sm text-muted-foreground">Choose how you want to create the invoice</p>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 py-4">
          {/* Option 1: One-Time Invoice */}
          <Card
            className="cursor-pointer border-2 hover:border-safend-red/50 transition-all hover:shadow-md"
            onClick={() => setSelectedOption('one-time')}
          >
            <CardContent className="p-5 flex items-start gap-4">
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-base">Raise One-Time Invoice</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Manually fill in client details, service details, amount, GST, and due date. 
                  Ideal for ad-hoc or custom invoices.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Option 2: Generate Invoice */}
          <Card
            className="cursor-pointer border-2 hover:border-safend-red/50 transition-all hover:shadow-md"
            onClick={() => setSelectedOption('generate')}
          >
            <CardContent className="p-5 flex items-start gap-4">
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                <Zap className="h-6 w-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-base">Generate Invoice</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Select a client and billing period. The system will auto-fetch duty data, 
                  salary rates, and service types to generate the invoice.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
