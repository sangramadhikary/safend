'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Download,
  FileText,
  CheckCircle2,
  CalendarDays,
  XCircle,
  Send,
  Clock,
  UserCheck,
  ArrowRight,
  Shield,
  Users,
  ClipboardList,
  HandshakeIcon,
  CalendarX2,
  MailCheck,
  Info,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { updateWorkOrder } from '@/services/supabase/WorkOrderFirebaseService';

type TerminationStep = 'initiate' | 'letter_generated' | 'awaiting_client' | 'client_responded' | 'completed';

interface TerminateWorkOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: any;
}

export function TerminateWorkOrderModal({ isOpen, onClose, workOrder }: TerminateWorkOrderModalProps) {
  const { toast } = useToast();

  // Determine current step from existing termination data
  const getTerminationData = () => workOrder?.terminationData || {};
  const getInitialStep = (): TerminationStep => {
    const td = getTerminationData();
    if (td.status === 'completed') return 'completed';
    if (td.status === 'client_responded') return 'client_responded';
    if (td.status === 'awaiting_client') return 'awaiting_client';
    if (td.status === 'letter_generated') return 'letter_generated';
    return 'initiate';
  };

  const [step, setStep] = useState<TerminationStep>(getInitialStep);
  const [lastWorkingDay, setLastWorkingDay] = useState(getTerminationData().lastWorkingDay || '');
  const [reason, setReason] = useState(getTerminationData().reason || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Track the latest saved termination data locally to avoid stale spreads
  const [savedTerminationData, setSavedTerminationData] = useState<any>(getTerminationData());

  // Client response states
  const [clientResponse, setClientResponse] = useState<'approved' | 'extend' | 'negotiate' | ''>('');
  const [newLastWorkingDay, setNewLastWorkingDay] = useState('');
  const [negotiationNotes, setNegotiationNotes] = useState('');

  // Re-sync state when workOrder prop changes (modal reopen with fresh data)
  useEffect(() => {
    const td = workOrder?.terminationData || {};
    setSavedTerminationData(td);
    setLastWorkingDay(td.lastWorkingDay || '');
    setReason(td.reason || '');
    setStep(getInitialStep());
    setClientResponse('');
    setNewLastWorkingDay('');
    setNegotiationNotes('');
  }, [workOrder?.id, workOrder?.terminationData?.status]);

  // Calculate days until last working day (timezone-safe: compare date strings)
  const daysRemaining = (() => {
    if (!lastWorkingDay) return null;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayMs = new Date(todayStr).getTime();
    const targetMs = new Date(lastWorkingDay).getTime();
    return Math.ceil((targetMs - todayMs) / (1000 * 60 * 60 * 24));
  })();

  const handleGenerateLetter = async () => {
    if (!lastWorkingDay || !reason) {
      toast({ title: 'Missing Fields', description: 'Please fill in both Last Working Day and Reason.', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/termination-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: workOrder.clientName || workOrder.companyName || '',
          contactPerson: workOrder.contactPerson || '',
          address: workOrder.address || '',
          city: workOrder.city || '',
          state: workOrder.state || '',
          pincode: workOrder.pincode || '',
          workOrderId: workOrder.workOrderId || '',
          startDate: workOrder.startDate || '',
          lastWorkingDay,
          reason,
          value: workOrder.value || '',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate termination letter');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Termination_Letter_${(workOrder.clientName || 'Client').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Save termination data
      const newData = {
        status: 'letter_generated',
        lastWorkingDay,
        reason,
        letterGeneratedAt: new Date().toISOString(),
      };
      await saveTerminationData(newData);
      setSavedTerminationData(newData);

      setStep('letter_generated');
      toast({ title: '✅ Termination Letter Downloaded', description: 'Send this letter to the client and await their response.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to generate letter', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleMarkLetterSent = async () => {
    setIsSaving(true);
    try {
      const newData = {
        ...savedTerminationData,
        status: 'awaiting_client',
        lastWorkingDay,
        reason,
        letterSentAt: new Date().toISOString(),
      };
      await saveTerminationData(newData);
      setSavedTerminationData(newData);
      setStep('awaiting_client');
      toast({ title: '📬 Letter Marked as Sent', description: 'Waiting for client to respond. You\'ll update the status once they reply.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClientResponse = async () => {
    if (!clientResponse) {
      toast({ title: 'Select Response', description: 'Please select the client\'s response.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      if (clientResponse === 'approved') {
        const newData = {
          ...savedTerminationData,
          status: 'client_responded',
          clientResponse: 'approved',
          clientRespondedAt: new Date().toISOString(),
          lastWorkingDay,
          reason,
        };
        await saveTerminationData(newData);
        setSavedTerminationData(newData);
        setStep('client_responded');
        toast({ title: '✅ Client Approved', description: 'Termination confirmed by client. Mark it complete when ready.' });
      } else if (clientResponse === 'extend') {
        if (!newLastWorkingDay) {
          toast({ title: 'Missing Date', description: 'Please enter the new last working day.', variant: 'destructive' });
          setIsSaving(false);
          return;
        }
        const newData = {
          ...savedTerminationData,
          status: 'awaiting_client',
          clientResponse: 'extend',
          lastWorkingDay: newLastWorkingDay,
          reason,
          extensionNote: `Extended from ${lastWorkingDay} to ${newLastWorkingDay}`,
          updatedAt: new Date().toISOString(),
        };
        await saveTerminationData(newData);
        setSavedTerminationData(newData);
        setLastWorkingDay(newLastWorkingDay);
        setClientResponse('');
        setNewLastWorkingDay('');
        toast({ title: '📅 Date Extended', description: `Last working day updated to ${new Date(newLastWorkingDay).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}. Continue monitoring.` });
      } else if (clientResponse === 'negotiate') {
        const newData = {
          ...savedTerminationData,
          status: 'awaiting_client',
          clientResponse: 'negotiate',
          negotiationNotes,
          lastWorkingDay,
          reason,
          updatedAt: new Date().toISOString(),
        };
        await saveTerminationData(newData);
        setSavedTerminationData(newData);
        setClientResponse('');
        setNegotiationNotes('');
        toast({ title: '🤝 Negotiation Noted', description: 'Notes saved. Update again when the client makes a final decision.' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkTerminated = async () => {
    setIsSaving(true);
    try {
      // NOW change status to Terminated — this is the only point where operations stop
      await updateWorkOrder(workOrder.id, { status: 'Terminated' });

      // Single write: save termination data AND deactivate posts in one call
      const finalData = {
        ...savedTerminationData,
        status: 'completed',
        clientResponse: 'approved',
        terminatedAt: new Date().toISOString(),
        lastWorkingDay,
        reason,
      };
      await fetch('/api/bff/work-order-termination', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: workOrder.id,
          terminationData: finalData,
          deactivatePosts: true,
        }),
      });

      setSavedTerminationData(finalData);
      setStep('completed');
      toast({
        title: '🛑 Work Order Terminated',
        description: `Services will stop after ${new Date(lastWorkingDay).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}. Roster & ops stopped.`,
      });
      setTimeout(() => onClose(), 1500);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelTermination = async () => {
    setIsSaving(true);
    try {
      // Clear termination data — set to null so the indicator disappears cleanly
      await saveTerminationData(null);
      setSavedTerminationData({});
      // Do NOT change the work order status — it was never changed during termination process.
      // The WO stays at whatever status it was before (In Progress, Completed, Scheduled).
      // Roster, attendance, billing — all continue unaffected.
      toast({ title: '↩️ Termination Cancelled', description: 'Termination process cancelled. Everything continues as normal — no changes were made to operations.' });
      onClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveTerminationData = async (data: any) => {
    const response = await fetch('/api/bff/work-order-termination', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workOrderId: workOrder.id, terminationData: data }),
    });
    if (!response.ok) {
      throw new Error('Failed to save termination data');
    }
  };

  const handleRedownloadLetter = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/termination-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: workOrder.clientName || workOrder.companyName || '',
          contactPerson: workOrder.contactPerson || '',
          address: workOrder.address || '',
          city: workOrder.city || '',
          state: workOrder.state || '',
          pincode: workOrder.pincode || '',
          workOrderId: workOrder.workOrderId || '',
          startDate: workOrder.startDate || '',
          lastWorkingDay,
          reason,
          value: workOrder.value || '',
        }),
      });

      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Termination_Letter_${(workOrder.clientName || 'Client').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Downloaded', description: 'Termination letter PDF saved.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  // Step config for the stepper
  const steps = [
    { key: 'initiate', label: 'Initiate', icon: ClipboardList },
    { key: 'letter_generated', label: 'Letter Ready', icon: FileText },
    { key: 'awaiting_client', label: 'Client Review', icon: Clock },
    { key: 'client_responded', label: 'Finalize', icon: CheckCircle2 },
  ];

  const currentStepIndex = steps.findIndex(s => s.key === step);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header with gradient */}
        <div className="bg-linear-to-r from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 border-b px-8 pt-7 pb-5 rounded-t-lg">
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/50 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
              Terminate Work Order
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm flex items-center gap-3 pt-1 text-muted-foreground">
                <span className="font-semibold text-foreground">{workOrder?.clientName}</span>
                <Badge variant="outline" className="font-mono text-xs">{workOrder?.workOrderId}</Badge>
                {workOrder?.value && (
                  <Badge variant="secondary" className="text-xs">{workOrder.value}</Badge>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          {/* Visual Stepper */}
          <div className="flex items-center mt-5 gap-1">
            {steps.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === currentStepIndex;
              const isCompleted = i < currentStepIndex || step === 'completed';
              return (
                <React.Fragment key={s.key}>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                    isActive 
                      ? 'bg-white dark:bg-gray-800 shadow-xs border border-orange-200 dark:border-orange-800' 
                      : isCompleted 
                        ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' 
                        : 'bg-white/50 dark:bg-gray-800/50 border border-transparent'
                  }`}>
                    <div className={`p-1 rounded ${
                      isActive ? 'text-orange-600' : isCompleted ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      {isCompleted && !isActive ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className={`text-xs font-medium hidden sm:inline ${
                      isActive ? 'text-orange-700 dark:text-orange-400' : isCompleted ? 'text-green-700 dark:text-green-400' : 'text-gray-400'
                    }`}>
                      {s.label}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <ArrowRight className={`h-3 w-3 shrink-0 ${
                      i < currentStepIndex ? 'text-green-400' : 'text-gray-300'
                    }`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="px-8 py-6">
          {/* ─── Step 1: Initiate ─── */}
          {step === 'initiate' && (
            <div className="space-y-6">
              {/* Info banner */}
              <div className="flex gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-xl">
                <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-medium mb-1">How this works</p>
                  <p className="text-xs text-blue-600 dark:text-blue-300 leading-relaxed">
                    You'll set a last working day and provide a reason. A professional termination letter will be generated 
                    on company letterhead for you to send to the client. Once the client confirms, you'll mark it done and 
                    only then will operations (roster, attendance, billing) stop.
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-300 leading-relaxed mt-2 font-medium">
                    ℹ️ Until you finalize the termination, everything continues normally — rosters, attendance, and all activities stay active. You can cancel at any point to abort the termination entirely.
                  </p>
                </div>
              </div>

              {/* Work Order Summary Card */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border">
                <div>
                  <p className="text-xs text-muted-foreground">Client</p>
                  <p className="font-medium text-sm">{workOrder.clientName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Contract Start</p>
                  <p className="font-medium text-sm">
                    {workOrder.startDate ? new Date(workOrder.startDate as string).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current Status</p>
                  <p className="font-medium text-sm">{workOrder.status}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Contract Value</p>
                  <p className="font-medium text-sm">{workOrder.value || '₹0'}</p>
                </div>
              </div>

              {/* Form */}
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="lastWorkingDay" className="text-sm font-medium flex items-center gap-2">
                    <CalendarX2 className="h-4 w-4 text-orange-500" />
                    Proposed Last Working Day
                  </Label>
                  <div className="relative">
                    <input
                      id="lastWorkingDay"
                      type="date"
                      value={lastWorkingDay}
                      onChange={(e) => setLastWorkingDay(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full h-12 px-4 pr-12 text-transparent border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    />
                    {/* Visual display over the input */}
                    <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                      <CalendarDays className="h-5 w-5 text-orange-500 mr-3 shrink-0" />
                      <span className={`text-base ${lastWorkingDay ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                        {lastWorkingDay
                          ? new Date(lastWorkingDay + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })
                          : 'Click to select date'}
                      </span>
                    </div>
                    {/* Calendar icon on right */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <div className="p-1.5 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
                        <CalendarDays className="h-4 w-4 text-orange-600" />
                      </div>
                    </div>
                  </div>
                  {lastWorkingDay && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                      daysRemaining !== null && daysRemaining > 7
                        ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300'
                        : daysRemaining !== null && daysRemaining > 0
                          ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300'
                          : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300'
                    }`}>
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      {daysRemaining !== null && daysRemaining > 0
                        ? <span><strong>{daysRemaining} day{daysRemaining > 1 ? 's' : ''}</strong> from today — services will continue until this date.</span>
                        : daysRemaining === 0
                          ? <span><strong>That's today!</strong> Services will stop immediately upon finalization.</span>
                          : <span><strong>This date is in the past.</strong> Please select a future date.</span>}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason" className="text-sm font-medium flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-orange-500" />
                    Reason for Termination
                  </Label>
                  <Textarea
                    id="reason"
                    placeholder="e.g., Contract period ended and client does not wish to renew, Client requested early termination due to budget constraints, Service quality issues raised by client..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    className="text-sm resize-none"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t">
                <Button variant="ghost" onClick={onClose} className="text-muted-foreground">
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateLetter}
                  disabled={isGenerating || !lastWorkingDay || !reason}
                  size="lg"
                  className="bg-orange-600 hover:bg-orange-700 text-white px-6"
                >
                  {isGenerating ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                      Generating PDF...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      Generate & Download Letter
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 2: Letter Generated ─── */}
          {step === 'letter_generated' && (
            <div className="space-y-6">
              {/* Success Card */}
              <div className="text-center py-6">
                <div className="inline-flex p-4 bg-green-50 dark:bg-green-950/30 rounded-full mb-4">
                  <FileText className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold mb-1">Termination Letter Ready!</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  The letter has been downloaded to your device. Send it to the client via email or hand-delivery 
                  and mark it as sent once done.
                </p>
              </div>

              {/* Details Summary */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Last Working Day</span>
                  <span className="font-semibold text-sm">
                    {new Date(lastWorkingDay).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-sm text-muted-foreground">Reason</span>
                  <span className="text-sm text-right max-w-[60%]">{reason}</span>
                </div>
                {daysRemaining !== null && daysRemaining > 0 && (
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Time Remaining</span>
                    <Badge variant="outline" className="text-orange-600 border-orange-200">
                      <Clock className="h-3 w-3 mr-1" />
                      {daysRemaining} day{daysRemaining > 1 ? 's' : ''}
                    </Badge>
                  </div>
                )}
              </div>

              {/* What to do next */}
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900 rounded-xl p-4">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Next Step: Send the letter to the client
                </p>
                <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1 ml-6 list-disc">
                  <li>Email the PDF to the client's authorized representative</li>
                  <li>Request written acknowledgment of receipt</li>
                  <li>Once sent, click "I've Sent the Letter" below</li>
                </ul>
              </div>

              {/* Normal operations notice */}
              <div className="flex gap-2 p-3 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 rounded-lg">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                <p className="text-xs text-green-700 dark:text-green-300">
                  <span className="font-medium">Operations are running normally.</span> Roster, attendance, and billing are unaffected. Nothing changes until you finalize the termination.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCancelTermination} disabled={isSaving}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancel Termination
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleRedownloadLetter} disabled={isGenerating}>
                    <Download className="mr-2 h-4 w-4" />
                    Re-download
                  </Button>
                </div>
                <Button onClick={handleMarkLetterSent} disabled={isSaving} size="lg" className="px-6">
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                      Saving...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <MailCheck className="h-4 w-4" />
                      I've Sent the Letter
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 3: Awaiting Client ─── */}
          {step === 'awaiting_client' && (
            <div className="space-y-6">
              {/* Status Banner */}
              <div className="flex gap-4 p-5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                <div className="p-3 bg-amber-100 dark:bg-amber-900/50 rounded-xl h-fit">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-amber-800 dark:text-amber-200">Awaiting Client Response</h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    The termination letter has been sent. Update below once the client responds.
                  </p>
                  <div className="flex items-center gap-4 mt-3">
                    <div className="text-xs">
                      <span className="text-muted-foreground">Last Working Day: </span>
                      <span className="font-semibold">
                        {new Date(lastWorkingDay).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    {daysRemaining !== null && (
                      <Badge variant={daysRemaining <= 7 ? 'destructive' : 'outline-solid'} className="text-xs">
                        {daysRemaining > 0 ? `${daysRemaining} days left` : 'Overdue'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Normal operations notice */}
              <div className="flex gap-2 p-3 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 rounded-lg">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                <p className="text-xs text-green-700 dark:text-green-300">
                  <span className="font-medium">Operations running normally.</span> Roster, attendance, and billing continue as usual until you finalize the termination.
                </p>
              </div>

              {/* Client Response Selection */}
              <div className="space-y-4">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-blue-500" />
                  What did the client say?
                </Label>
                
                {/* Response Cards */}
                <div className="grid gap-3">
                  <button
                    onClick={() => setClientResponse('approved')}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                      clientResponse === 'approved' 
                        ? 'border-green-500 bg-green-50 dark:bg-green-950/30' 
                        : 'border-gray-200 dark:border-gray-700 hover:border-green-300 hover:bg-green-50/50'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${clientResponse === 'approved' ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-100 dark:bg-gray-800'}`}>
                      <CheckCircle2 className={`h-5 w-5 ${clientResponse === 'approved' ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Client Approved Termination</p>
                      <p className="text-xs text-muted-foreground">Client agrees to terminate on the proposed date</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setClientResponse('extend')}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                      clientResponse === 'extend' 
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' 
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50/50'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${clientResponse === 'extend' ? 'bg-blue-100 dark:bg-blue-900' : 'bg-gray-100 dark:bg-gray-800'}`}>
                      <CalendarDays className={`h-5 w-5 ${clientResponse === 'extend' ? 'text-blue-600' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Client Wants to Extend</p>
                      <p className="text-xs text-muted-foreground">Client agrees to terminate but wants a later date</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setClientResponse('negotiate')}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                      clientResponse === 'negotiate' 
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30' 
                        : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 hover:bg-purple-50/50'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${clientResponse === 'negotiate' ? 'bg-purple-100 dark:bg-purple-900' : 'bg-gray-100 dark:bg-gray-800'}`}>
                      <HandshakeIcon className={`h-5 w-5 ${clientResponse === 'negotiate' ? 'text-purple-600' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Client Wants to Negotiate</p>
                      <p className="text-xs text-muted-foreground">Client doesn't want to terminate, wants to discuss alternatives</p>
                    </div>
                  </button>
                </div>

                {/* Conditional fields based on selection */}
                {clientResponse === 'extend' && (
                  <div className="ml-4 pl-4 border-l-2 border-blue-200 space-y-2 animate-in slide-in-from-top-2">
                    <Label htmlFor="newLastWorkingDay" className="text-sm">New Last Working Day</Label>
                    <div className="relative">
                      <input
                        id="newLastWorkingDay"
                        type="date"
                        value={newLastWorkingDay}
                        onChange={(e) => setNewLastWorkingDay(e.target.value)}
                        min={lastWorkingDay || new Date().toISOString().split('T')[0]}
                        className="w-full h-10 px-4 pr-12 text-transparent border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                      />
                      <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                        <CalendarDays className="h-4 w-4 text-blue-500 mr-2 shrink-0" />
                        <span className={`text-sm ${newLastWorkingDay ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                          {newLastWorkingDay
                            ? new Date(newLastWorkingDay + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })
                            : 'Select new date...'}
                        </span>
                      </div>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <CalendarDays className="h-4 w-4 text-blue-500" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The termination will still proceed, just on a later date.
                    </p>
                  </div>
                )}

                {clientResponse === 'negotiate' && (
                  <div className="ml-4 pl-4 border-l-2 border-purple-200 space-y-2 animate-in slide-in-from-top-2">
                    <Label htmlFor="negotiationNotes" className="text-sm">What does the client propose?</Label>
                    <Textarea
                      id="negotiationNotes"
                      placeholder="e.g., Client wants to reduce manpower instead of terminating, Client offering revised contract terms, Client requesting 3-month trial extension..."
                      value={negotiationNotes}
                      onChange={(e) => setNegotiationNotes(e.target.value)}
                      rows={3}
                      className="text-sm resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      If negotiations succeed, you can cancel the termination process entirely.
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCancelTermination} disabled={isSaving}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancel Termination
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleRedownloadLetter} disabled={isGenerating}>
                    <Download className="mr-2 h-4 w-4" />
                    Re-download
                  </Button>
                </div>
                <Button
                  onClick={handleClientResponse}
                  disabled={isSaving || !clientResponse}
                  size="lg"
                  className="px-6"
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                      Saving...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <ArrowRight className="h-4 w-4" />
                      Update Status
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ─── Step 4: Client Approved — Finalize ─── */}
          {step === 'client_responded' && (
            <div className="space-y-6">
              {/* Approval confirmation */}
              <div className="text-center py-6">
                <div className="inline-flex p-4 bg-green-50 dark:bg-green-950/30 rounded-full mb-4">
                  <UserCheck className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold mb-1">Client Has Approved</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  The client has confirmed the termination. Review the impact below and finalize when ready.
                </p>
              </div>

              {/* Impact Summary */}
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900 rounded-xl p-5">
                <p className="font-medium text-sm text-red-800 dark:text-red-200 mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  This action will stop all operations — only proceed after last working day
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-700 dark:text-red-300">Security personnel will be withdrawn after <strong>{new Date(lastWorkingDay).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CalendarDays className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-700 dark:text-red-300">Future roster preparation for this site will stop</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Users className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-700 dark:text-red-300">Attendance tracking for deployed guards will end</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-700 dark:text-red-300">Final invoice will need to be generated separately</p>
                  </div>
                </div>
                {daysRemaining !== null && daysRemaining > 0 && (
                  <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                      ⚠️ The last working day is still {daysRemaining} day{daysRemaining > 1 ? 's' : ''} away. 
                      Consider waiting until that date arrives to finalize.
                    </p>
                  </div>
                )}
              </div>

              {/* Final Details */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Work Order</span>
                  <span className="font-mono text-sm">{workOrder.workOrderId}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Client</span>
                  <span className="text-sm font-medium">{workOrder.clientName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Last Working Day</span>
                  <span className="text-sm font-semibold text-red-600">
                    {new Date(lastWorkingDay).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-sm text-muted-foreground">Reason</span>
                  <span className="text-sm text-right max-w-[55%]">{reason}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t">
                <Button variant="ghost" onClick={onClose}>
                  Close (Decide Later)
                </Button>
                <Button
                  onClick={handleMarkTerminated}
                  disabled={isSaving}
                  size="lg"
                  className="bg-red-600 hover:bg-red-700 text-white px-6"
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                      Processing...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Confirm & Terminate
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ─── Completed ─── */}
          {step === 'completed' && (
            <div className="space-y-6 py-8">
              <div className="text-center">
                <div className="inline-flex p-5 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
                  <CheckCircle2 className="h-12 w-12 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Termination Complete</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  This work order has been successfully terminated. All downstream operations have been notified.
                </p>
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                  <CalendarX2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    Terminated on {savedTerminationData.terminatedAt ? new Date(savedTerminationData.terminatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'today'}
                  </span>
                </div>
              </div>
              <div className="flex justify-center pt-4">
                <Button variant="outline" onClick={onClose} size="lg">
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
