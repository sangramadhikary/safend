'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { CheckCircle, XCircle, Utensils } from 'lucide-react';
import { useMessFundRequests, MessFundRequestWithWeek } from '@/modules/operations';
import { useToast } from '@/hooks/use-toast';

export function MessFundRequestsSection() {
  const { fundRequests, isLoading, approveFundRequest, rejectFundRequest } = useMessFundRequests();
  const { toast } = useToast();

  const [approveDialog, setApproveDialog] = useState<MessFundRequestWithWeek | null>(null);
  const [rejectDialog, setRejectDialog] = useState<MessFundRequestWithWeek | null>(null);
  const [approvedAmount, setApprovedAmount] = useState('');
  const [notes, setNotes] = useState('');

  const pendingRequests = fundRequests.filter(fr => fr.status === 'pending');
  const processedRequests = fundRequests.filter(fr => fr.status !== 'pending');

  const handleApprove = async () => {
    if (!approveDialog || !approvedAmount) return;

    try {
      await approveFundRequest.mutateAsync({
        id: approveDialog.id,
        approved_amount: parseFloat(approvedAmount),
        notes,
      });
      toast({
        title: "Fund Approved",
        description: `₹${parseFloat(approvedAmount).toLocaleString()} approved for mess fund`,
      });
      setApproveDialog(null);
      setApprovedAmount('');
      setNotes('');
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleReject = async () => {
    if (!rejectDialog) return;

    try {
      await rejectFundRequest.mutateAsync({ id: rejectDialog.id, notes });
      toast({ title: "Fund Request Rejected", description: "The mess fund request has been rejected" });
      setRejectDialog(null);
      setNotes('');
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="text-center py-4 text-muted-foreground">Loading mess fund requests...</div>;
  }

  if (fundRequests.length === 0) {
    return null; // Don't show section if no requests exist
  }

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <Utensils className="h-5 w-5 text-orange-500" />
        <h3 className="text-xl font-semibold">Mess Fund Requests</h3>
        {pendingRequests.length > 0 && (
          <Badge className="bg-amber-500 ml-2">{pendingRequests.length} pending</Badge>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week Period</TableHead>
                <TableHead>Posts</TableHead>
                <TableHead>Request Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fundRequests.map(request => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">
                    {request.mess_weeks
                      ? `${format(new Date(request.mess_weeks.week_start_date), 'dd MMM')} — ${format(new Date(request.mess_weeks.week_end_date), 'dd MMM yy')}`
                      : 'N/A'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {request.mess_weeks?.mess_week_posts?.map(p => p.post_name).join(', ') || 'N/A'}
                  </TableCell>
                  <TableCell>{format(new Date(request.created_at), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>
                    {request.approved_amount
                      ? <span className="text-green-600 font-medium">₹{request.approved_amount.toLocaleString()}</span>
                      : request.requested_amount
                        ? <span>₹{request.requested_amount.toLocaleString()} (requested)</span>
                        : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className={
                      request.status === 'approved' ? 'bg-green-500' :
                      request.status === 'rejected' ? 'bg-red-500' : 'bg-amber-500'
                    }>
                      {request.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {request.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-300 hover:bg-green-50"
                          onClick={() => setApproveDialog(request)}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-300 hover:bg-red-50"
                          onClick={() => setRejectDialog(request)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                    {request.status !== 'pending' && (
                      <span className="text-sm text-muted-foreground">
                        {request.notes || '—'}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Approve Dialog */}
      <Dialog open={!!approveDialog} onOpenChange={() => setApproveDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Approve Mess Fund</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {approveDialog?.mess_weeks && (
              <p className="text-sm text-muted-foreground">
                Week: {format(new Date(approveDialog.mess_weeks.week_start_date), 'dd MMM')} — {format(new Date(approveDialog.mess_weeks.week_end_date), 'dd MMM yyyy')}
              </p>
            )}
            <div>
              <Label htmlFor="amount">Approved Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(e.target.value)}
                placeholder="Enter amount to grant"
              />
            </div>
            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialog(null)}>Cancel</Button>
            <Button
              onClick={handleApprove}
              disabled={!approvedAmount || approveFundRequest.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {approveFundRequest.isPending ? 'Approving...' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={() => setRejectDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Mess Fund Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reject-notes">Reason (optional)</Label>
              <Textarea
                id="reject-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason for rejection..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>Cancel</Button>
            <Button
              onClick={handleReject}
              disabled={rejectFundRequest.isPending}
              variant="destructive"
            >
              {rejectFundRequest.isPending ? 'Rejecting...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
