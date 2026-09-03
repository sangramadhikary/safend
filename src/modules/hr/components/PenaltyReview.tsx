'use client';

import { useState } from "react";
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useToastWithSound } from "@/hooks/use-toast-with-sound";
import { usePenalties } from "@/modules/operations/hooks/usePenalties";
import {
  PenaltyRecord, HR_ACTIONS, HR_ACTION_TO_STATUS, HRAction, PenaltyStatus,
} from "@/modules/operations/schemas/penaltySchema";
import { DollarSign, FileDown, AlertTriangle } from "lucide-react";

interface PenaltyReviewProps {
  filter?: string;
}

export function PenaltyReview({ filter }: PenaltyReviewProps) {
  const { toast } = useToastWithSound();
  const { penalties, isLoading, changeStatus } = usePenalties({ status: 'Pending HR Review' });

  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedPenalty, setSelectedPenalty] = useState<PenaltyRecord | null>(null);
  const [hrAction, setHrAction] = useState<string>("");
  const [financialAmount, setFinancialAmount] = useState<string>("");
  const [hrNotes, setHrNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTakeAction = (penalty: PenaltyRecord) => {
    setSelectedPenalty(penalty);
    setHrAction("");
    setFinancialAmount("");
    setHrNotes("");
    setActionDialogOpen(true);
  };

  const handleSubmitAction = async () => {
    if (!selectedPenalty || !hrAction) return;

    const action = hrAction as HRAction;
    const newStatus = HR_ACTION_TO_STATUS[action];

    if (action === 'Financial Penalty' && (!financialAmount || parseFloat(financialAmount) <= 0)) {
      toast({ title: "Error", description: "Please enter a valid penalty amount.", variant: "destructive" });
      return;
    }

    try {
      setIsSubmitting(true);
      await changeStatus(selectedPenalty.id, newStatus);
      toast.success({ title: "Success", description: `Penalty action "${action}" applied successfully.` });
      setActionDialogOpen(false);
      setSelectedPenalty(null);
    } catch (error: any) {
      toast.error({ title: "Error", description: error.message || "Failed to apply action." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateShowCauseNotice = (penalty: PenaltyRecord) => {
    const notice = `
SHOW CAUSE NOTICE

Date: ${new Date().toLocaleDateString()}

To: ${penalty.staff_name}
Post: ${penalty.post_name}

Subject: Show Cause Notice for ${penalty.offense_type} Offense

Dear ${penalty.staff_name},

It has come to our notice that you have committed the following offense:

Type of Offense: ${penalty.offense_type}
Specific Offense: ${penalty.offense}
Date of Violation: ${new Date(penalty.violation_date).toLocaleDateString()}
Source of Information: ${penalty.source_of_information}

Description: ${penalty.description}

You are hereby directed to submit your written explanation within 48 hours of receiving this notice as to why disciplinary action should not be taken against you.

Failure to respond within the stipulated time will be treated as acceptance of the charge and action will be taken accordingly.

Regards,
HR Department
    `.trim();

    const blob = new Blob([notice], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ShowCause_${penalty.staff_name.replace(/\s+/g, '_')}_${penalty.violation_date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getOffenseTypeBadge = (type: string) => {
    switch (type) {
      case "Disciplinary": return <Badge className="bg-orange-500 hover:bg-orange-600">{type}</Badge>;
      case "Integrity": return <Badge className="bg-purple-500 hover:bg-purple-600">{type}</Badge>;
      case "Criminal": return <Badge className="bg-red-500 hover:bg-red-600">{type}</Badge>;
      default: return <Badge>{type}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <BrandLoader size="lg" message="Loading pending penalties..." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Penalty Review</h3>
          <p className="text-sm text-muted-foreground">
            {penalties.length} {penalties.length === 1 ? 'penalty' : 'penalties'} pending HR review
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm">
        <Table>
          <TableCaption>Penalties awaiting HR action</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Staff Name</TableHead>
              <TableHead>Post</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Offense</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {penalties.length > 0 ? (
              penalties.map((penalty) => (
                <TableRow key={penalty.id}>
                  <TableCell className="font-medium">{penalty.staff_name}</TableCell>
                  <TableCell>{penalty.post_name}</TableCell>
                  <TableCell>{new Date(penalty.violation_date).toLocaleDateString()}</TableCell>
                  <TableCell><span className="text-xs">{penalty.source_of_information}</span></TableCell>
                  <TableCell>{getOffenseTypeBadge(penalty.offense_type)}</TableCell>
                  <TableCell><span className="text-sm">{penalty.offense}</span></TableCell>
                  <TableCell>{penalty.weight}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => handleTakeAction(penalty)}>
                      <AlertTriangle className="h-4 w-4 mr-1" />
                      Take Action
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6">
                  No penalties pending HR review
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* HR Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Take HR Action</DialogTitle>
            <DialogDescription>
              {selectedPenalty && (
                <>
                  Penalty for <strong>{selectedPenalty.staff_name}</strong> — {selectedPenalty.offense} ({selectedPenalty.offense_type})
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Action*</Label>
              <Select value={hrAction} onValueChange={setHrAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Select HR Action" />
                </SelectTrigger>
                <SelectContent>
                  {HR_ACTIONS.map(action => (
                    <SelectItem key={action} value={action}>{action}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hrAction === 'Financial Penalty' && (
              <div className="space-y-2">
                <Label>Deduction Amount (₹)*</Label>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="number"
                    min={1}
                    placeholder="Enter amount to deduct from salary"
                    value={financialAmount}
                    onChange={(e) => setFinancialAmount(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            )}

            {hrAction === 'Show Cause Notice' && selectedPenalty && (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => generateShowCauseNotice(selectedPenalty)}
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Download Show Cause Notice
                </Button>
                <p className="text-xs text-muted-foreground">
                  A show cause notice will be generated for download
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>HR Notes (optional)</Label>
              <Textarea
                value={hrNotes}
                onChange={(e) => setHrNotes(e.target.value)}
                placeholder="Additional notes about this action..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitAction} disabled={!hrAction || isSubmitting}>
              {isSubmitting ? "Applying..." : "Apply Action"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
