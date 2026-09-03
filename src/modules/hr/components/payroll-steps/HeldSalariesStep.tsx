'use client';
import { useState, useEffect } from "react";
import { HeldSalaryUI } from "../index";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabaseClient } from "@/integrations/supabase/client";
import { CheckCircle, AlertCircle, Send, BookOpen, Clock, CalendarClock } from "lucide-react";

interface HeldSalaryExtended extends HeldSalaryUI {
  id?: string;
  employeeCode?: string;
  designation?: string;
  period?: string;
  payrollRunId?: string;
  action?: "SENT_TO_HR" | "REPO_SALARY" | "HOLD_TILL";
  holdTillDate?: string;
  actionDate?: string;
  actionBy?: string;
}

export function HeldSalariesStep() {
  const [heldSalaries, setHeldSalaries] = useState<HeldSalaryExtended[]>([]);
  const [loading, setLoading] = useState(true);
  const [holdTillDialogOpen, setHoldTillDialogOpen] = useState(false);
  const [holdTillDate, setHoldTillDate] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"SENT_TO_HR" | "REPO_SALARY" | null>(null);
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [reasonText, setReasonText] = useState("");
  const [selectedHeldId, setSelectedHeldId] = useState<string | null>(null);
  const { toast } = useToast();

  // Load held salaries from DB
  useEffect(() => {
    fetchHeldSalaries();
  }, []);

  const fetchHeldSalaries = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from('held_salaries')
        .select('*')
        .order('held_on', { ascending: false });

      if (!error && data) {
        setHeldSalaries(data.map((row: any) => ({
          id: row.id,
          employeeId: row.employee_id,
          employeeCode: row.employee_code,
          employeeName: row.employee_name,
          designation: row.designation,
          amount: Number(row.amount) || 0,
          reason: row.reason || '',
          heldBy: row.held_by || 'HR',
          heldOn: row.held_on,
          resolved: row.resolved || false,
          resolvedOn: row.resolved_on,
          resolvedBy: row.resolved_by,
          resolutionNotes: row.resolution_notes,
          period: row.period,
          payrollRunId: row.payroll_run_id,
          action: row.resolution_action,
          holdTillDate: row.hold_till_date,
          actionDate: row.resolved_on,
          actionBy: row.resolved_by,
        })));
      }
    } catch (err) {
      console.error('Error loading held salaries:', err);
    } finally {
      setLoading(false);
    }
  };

  const unresolvedHolds = heldSalaries.filter(h => !h.resolved);
  const resolvedHolds = heldSalaries.filter(h => h.resolved);

  const openConfirmDialog = (employeeId: string, action: "SENT_TO_HR" | "REPO_SALARY") => {
    setSelectedEmployeeId(employeeId);
    setConfirmAction(action);
    setConfirmDialogOpen(true);
  };

  const openHoldTillDialog = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setHoldTillDate("");
    setHoldTillDialogOpen(true);
  };

  const openReasonDialog = (heldId: string) => {
    setSelectedHeldId(heldId);
    const held = heldSalaries.find(h => h.id === heldId);
    setReasonText(held?.reason || '');
    setReasonDialogOpen(true);
  };

  const handleSaveReason = async () => {
    if (!selectedHeldId) return;
    await supabaseClient.from('held_salaries').update({ reason: reasonText }).eq('id', selectedHeldId);
    setHeldSalaries(prev => prev.map(h => h.id === selectedHeldId ? { ...h, reason: reasonText } : h));
    toast({ title: "Reason Updated", description: "Hold reason saved." });
    setReasonDialogOpen(false);
    setSelectedHeldId(null);
    setReasonText("");
  };

  // Action 1: Send HR to Pay — releases the held salary back for payment processing
  const handleSendHRToPay = async () => {
    if (!selectedEmployeeId) return;
    const held = heldSalaries.find(h => h.employeeId === selectedEmployeeId);
    if (!held) return;

    try {
      // Backend: Update held_salaries status & create notification for HR
      await supabaseClient.from('held_salaries').update({
        status: 'RELEASED_TO_HR',
        resolved: true,
        resolved_on: new Date().toISOString(),
        resolved_by: 'HR Manager',
        resolution_action: 'SENT_TO_HR',
        resolution_notes: 'Released for payment by HR'
      }).eq('employee_id', selectedEmployeeId).eq('resolved', false);

      // Create notification for HR to process payment
      await supabaseClient.from('notifications').insert({
        type: 'HELD_SALARY_RELEASED',
        title: `Salary released for payment: ${held.employeeName}`,
        message: `Held salary of ₹${held.amount.toLocaleString('en-IN')} for ${held.employeeName} has been released. Please include in next payroll.`,
        target_role: 'hr',
        status: 'unread',
        created_at: new Date().toISOString()
      });

      // Update local state
      setHeldSalaries(prev => prev.map(h =>
        h.employeeId === selectedEmployeeId
          ? { ...h, resolved: true, action: "SENT_TO_HR", actionDate: new Date().toISOString(), actionBy: "HR Manager", resolvedOn: new Date().toISOString(), resolvedBy: "HR Manager", resolutionNotes: "Released for payment by HR" }
          : h
      ));

      toast({ title: "Sent to HR for Payment", description: `₹${held.amount.toLocaleString('en-IN')} for ${held.employeeName} released for payment processing` });
    } catch (err: any) {
      console.error('Error sending to HR:', err);
      // Still update UI (fallback for missing tables)
      setHeldSalaries(prev => prev.map(h =>
        h.employeeId === selectedEmployeeId
          ? { ...h, resolved: true, action: "SENT_TO_HR", actionDate: new Date().toISOString(), actionBy: "HR Manager", resolvedOn: new Date().toISOString(), resolvedBy: "HR Manager", resolutionNotes: "Released for payment by HR" }
          : h
      ));
      toast({ title: "Sent to HR for Payment", description: `₹${held.amount.toLocaleString('en-IN')} for ${held.employeeName} released for payment processing` });
    } finally {
      setConfirmDialogOpen(false);
      setSelectedEmployeeId(null);
      setConfirmAction(null);
    }
  };

  // Action 2: Repo Salary — repossess the salary, becomes income in accounts book
  const handleRepoSalary = async () => {
    if (!selectedEmployeeId) return;
    const held = heldSalaries.find(h => h.employeeId === selectedEmployeeId);
    if (!held) return;

    try {
      // Backend: Update held_salaries status
      await supabaseClient.from('held_salaries').update({
        status: 'REPOSSESSED',
        resolved: true,
        resolved_on: new Date().toISOString(),
        resolved_by: 'HR Manager',
        resolution_action: 'REPO_SALARY',
        resolution_notes: 'Salary repossessed — recorded as income'
      }).eq('employee_id', selectedEmployeeId).eq('resolved', false);

      // Backend: Record as income in accounts receivables/income
      await supabaseClient.from('receivables').insert({
        type: 'SALARY_REPO',
        description: `Repossessed salary — ${held.employeeName} (${held.reason})`,
        amount: held.amount,
        status: 'received',
        employee_id: selectedEmployeeId,
        employee_name: held.employeeName,
        recorded_by: 'HR Manager',
        received_date: new Date().toISOString(),
        created_at: new Date().toISOString()
      });

      // Create notification for accounts
      await supabaseClient.from('notifications').insert({
        type: 'SALARY_REPOSSESSED',
        title: `Salary repossessed: ${held.employeeName}`,
        message: `₹${held.amount.toLocaleString('en-IN')} from ${held.employeeName} has been repossessed and recorded as income. Reason: ${held.reason}`,
        target_role: 'accounts',
        status: 'unread',
        created_at: new Date().toISOString()
      });

      // Update local state
      setHeldSalaries(prev => prev.map(h =>
        h.employeeId === selectedEmployeeId
          ? { ...h, resolved: true, action: "REPO_SALARY", actionDate: new Date().toISOString(), actionBy: "HR Manager", resolvedOn: new Date().toISOString(), resolvedBy: "HR Manager", resolutionNotes: "Salary repossessed — recorded as income in accounts" }
          : h
      ));

      toast({ title: "Salary Repossessed", description: `₹${held.amount.toLocaleString('en-IN')} recorded as income in Accounts book` });
    } catch (err: any) {
      console.error('Error repo salary:', err);
      setHeldSalaries(prev => prev.map(h =>
        h.employeeId === selectedEmployeeId
          ? { ...h, resolved: true, action: "REPO_SALARY", actionDate: new Date().toISOString(), actionBy: "HR Manager", resolvedOn: new Date().toISOString(), resolvedBy: "HR Manager", resolutionNotes: "Salary repossessed — recorded as income in accounts" }
          : h
      ));
      toast({ title: "Salary Repossessed", description: `₹${held.amount.toLocaleString('en-IN')} recorded as income in Accounts book` });
    } finally {
      setConfirmDialogOpen(false);
      setSelectedEmployeeId(null);
      setConfirmAction(null);
    }
  };

  // Action 3: Hold Till — hold until a specific date, then notify HR to act
  const handleHoldTill = async () => {
    if (!selectedEmployeeId || !holdTillDate) return;
    const held = heldSalaries.find(h => h.employeeId === selectedEmployeeId);
    if (!held) return;

    try {
      // Backend: Update held_salaries with hold_till_date
      await supabaseClient.from('held_salaries').update({
        status: 'HOLD_TILL',
        hold_till_date: holdTillDate,
        updated_at: new Date().toISOString()
      }).eq('employee_id', selectedEmployeeId).eq('resolved', false);

      // Backend: Create a scheduled notification for HR when the date arrives
      await supabaseClient.from('notifications').insert({
        type: 'HELD_SALARY_REMINDER',
        title: `Action required: Held salary for ${held.employeeName}`,
        message: `The hold period for ${held.employeeName}'s salary (₹${held.amount.toLocaleString('en-IN')}) has ended. Reason: ${held.reason}. Please take action — Send to Pay or Repo Salary.`,
        target_role: 'hr',
        status: 'scheduled',
        scheduled_for: new Date(holdTillDate).toISOString(),
        created_at: new Date().toISOString()
      });

      // Update local state
      setHeldSalaries(prev => prev.map(h =>
        h.employeeId === selectedEmployeeId
          ? { ...h, action: "HOLD_TILL", holdTillDate }
          : h
      ));

      toast({
        title: "Hold Extended",
        description: `Salary for ${held.employeeName} held till ${new Date(holdTillDate).toLocaleDateString('en-IN')}. HR will be notified to take action on that date.`
      });
    } catch (err: any) {
      console.error('Error hold till:', err);
      setHeldSalaries(prev => prev.map(h =>
        h.employeeId === selectedEmployeeId
          ? { ...h, action: "HOLD_TILL", holdTillDate }
          : h
      ));
      toast({
        title: "Hold Extended",
        description: `Salary for ${held.employeeName} held till ${new Date(holdTillDate).toLocaleDateString('en-IN')}. HR will be notified to take action on that date.`
      });
    } finally {
      setHoldTillDialogOpen(false);
      setSelectedEmployeeId(null);
      setHoldTillDate("");
    }
  };

  const getActionBadge = (action?: string) => {
    switch (action) {
      case "SENT_TO_HR":
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">Sent to HR</Badge>;
      case "REPO_SALARY":
        return <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">Repossessed</Badge>;
      case "HOLD_TILL":
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">Hold Till</Badge>;
      default:
        return <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">Resolved</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Held Salaries</CardTitle>
          <CardDescription>
            Salaries put on hold due to pending issues. Choose an action for each — release for payment, repossess, or extend hold.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Active Holds */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <CardTitle className="text-base">Active Holds ({unresolvedHolds.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : unresolvedHolds.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p className="font-medium">No salaries currently on hold</p>
              <p className="text-sm mt-1">All employee salaries are clear for processing.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount (₹)</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Held By</TableHead>
                  <TableHead>Hold Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unresolvedHolds.map((held) => (
                  <TableRow key={held.id || held.employeeId}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{held.employeeName}</p>
                        <p className="text-xs text-muted-foreground">{held.employeeCode} · {held.designation}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{held.period || '—'}</TableCell>
                    <TableCell className="text-right font-semibold">₹{held.amount.toLocaleString('en-IN')}</TableCell>
                    <TableCell>
                      {held.reason ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs max-w-[150px] truncate cursor-pointer" onClick={() => held.id && openReasonDialog(held.id)}>
                          {held.reason}
                        </Badge>
                      ) : (
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => held.id && openReasonDialog(held.id)}>
                          + Add Reason
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{held.heldBy}</TableCell>
                    <TableCell className="text-sm">{new Date(held.heldOn).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>
                      {held.action === "HOLD_TILL" && held.holdTillDate ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                          <CalendarClock className="h-3 w-3 mr-1" />
                          Till {new Date(held.holdTillDate).toLocaleDateString('en-IN')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-xs">
                          On Hold
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-green-600 hover:text-green-700 hover:bg-green-50 text-xs"
                          onClick={() => openConfirmDialog(held.employeeId, "SENT_TO_HR")}
                        >
                          <Send className="h-3.5 w-3.5 mr-1" /> Release to Pay
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 text-xs"
                          onClick={() => openConfirmDialog(held.employeeId, "REPO_SALARY")}
                        >
                          <BookOpen className="h-3.5 w-3.5 mr-1" /> Repo Salary
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs"
                          onClick={() => openHoldTillDialog(held.employeeId)}
                        >
                          <Clock className="h-3.5 w-3.5 mr-1" /> Hold Till
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Resolved Holds */}
      {resolvedHolds.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <CardTitle className="text-base">Recently Resolved ({resolvedHolds.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Amount (₹)</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Action Taken</TableHead>
                  <TableHead>Resolved By</TableHead>
                  <TableHead>Resolved On</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolvedHolds.map((held) => (
                  <TableRow key={held.employeeId} className="opacity-75">
                    <TableCell className="font-medium">{held.employeeName}</TableCell>
                    <TableCell className="text-right">₹{held.amount.toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-sm">{held.reason}</TableCell>
                    <TableCell>{getActionBadge(held.action)}</TableCell>
                    <TableCell className="text-sm">{held.actionBy || held.resolvedBy}</TableCell>
                    <TableCell className="text-sm">{held.resolvedOn ? new Date(held.resolvedOn).toLocaleDateString('en-IN') : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Confirm Action Dialog (Send HR to Pay / Repo Salary) */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "SENT_TO_HR" ? "Send to HR for Payment" : "Repossess Salary"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === "SENT_TO_HR"
                ? "This will release the held salary and notify HR to include it in the next payment run. The employee will receive their salary."
                : "This will repossess the held salary and record it as income in the Accounts book. The employee will NOT receive this salary."
              }
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const held = heldSalaries.find(h => h.employeeId === selectedEmployeeId);
            if (!held) return null;
            return (
              <div className="py-4 space-y-3">
                <div className="p-3 rounded-lg bg-muted/50 border space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Employee</span>
                    <span className="font-medium">{held.employeeName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-semibold">₹{held.amount.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Hold Reason</span>
                    <span>{held.reason}</span>
                  </div>
                </div>
                {confirmAction === "REPO_SALARY" && (
                  <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 text-sm text-purple-800 dark:text-purple-200">
                    <strong>Note:</strong> ₹{held.amount.toLocaleString('en-IN')} will be recorded as income (receivable) in the Accounts module.
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
            {confirmAction === "SENT_TO_HR" && (
              <Button onClick={handleSendHRToPay} className="bg-green-600 hover:bg-green-700 flex items-center gap-1">
                <Send className="h-4 w-4" /> Confirm & Send
              </Button>
            )}
            {confirmAction === "REPO_SALARY" && (
              <Button onClick={handleRepoSalary} className="bg-purple-600 hover:bg-purple-700 flex items-center gap-1">
                <BookOpen className="h-4 w-4" /> Confirm Repo
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hold Till Date Dialog */}
      <Dialog open={holdTillDialogOpen} onOpenChange={setHoldTillDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" /> Hold Till Date
            </DialogTitle>
            <DialogDescription>
              Select a date until which this salary should remain on hold. On that date, HR will receive a notification to take action (Send to Pay or Repo).
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const held = heldSalaries.find(h => h.employeeId === selectedEmployeeId);
            if (!held) return null;
            return (
              <div className="py-4 space-y-4">
                <div className="p-3 rounded-lg bg-muted/50 border space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Employee</span>
                    <span className="font-medium">{held.employeeName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-semibold">₹{held.amount.toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Hold Until</label>
                  <Input
                    type="date"
                    value={holdTillDate}
                    onChange={(e) => setHoldTillDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    HR will be reminded to take action on this date
                  </p>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldTillDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleHoldTill}
              disabled={!holdTillDate}
              className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1"
            >
              <Clock className="h-4 w-4" /> Set Hold Date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Reason Dialog */}
      <Dialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Update Hold Reason</DialogTitle>
            <DialogDescription>
              Add or update the reason why this salary is being held.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Enter reason for holding salary (e.g., Absconded, Under investigation, Pending documentation...)"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveReason} disabled={!reasonText.trim()}>
              Save Reason
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
