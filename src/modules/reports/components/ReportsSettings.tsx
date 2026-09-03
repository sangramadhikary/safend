'use client';

import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Mail, Clock, FileText } from "lucide-react";

interface ScheduledEmail {
  id: string;
  reportName: string;
  recipients: string;
  frequency: string;
  day: string;
  time: string;
  format: string;
  enabled: boolean;
}

const REPORT_OPTIONS = [
  'Daily Attendance Report',
  'Rota Coverage Report',
  'Shift-wise Manpower',
  'Penalty & Incident Summary',
  'Monthly Salary Statement',
  'PF ECR (Electronic Challan)',
  'ESI Contribution Report',
  'Headcount & Attrition',
  'Profit & Loss Statement',
  'Receivables Aging',
  'Payables Summary',
  'GSTR-1 (Outward Supplies)',
  'GSTR-3B Summary',
  'TDS Return (26Q/24Q)',
  'Invoice Register',
  'Client Billing Summary',
  'Agreement Expiry Report',
];

export function ReportsSettings() {
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const [schedules, setSchedules] = useState<ScheduledEmail[]>([
    { id: '1', reportName: 'Daily Attendance Report', recipients: 'operations@safends.com', frequency: 'daily', day: '', time: '08:00', format: 'excel', enabled: true },
    { id: '2', reportName: 'Receivables Aging', recipients: 'accounts@safends.com, admin@safends.com', frequency: 'weekly', day: 'monday', time: '09:00', format: 'excel', enabled: true },
    { id: '3', reportName: 'Monthly Salary Statement', recipients: 'hr@safends.com', frequency: 'monthly', day: '1', time: '10:00', format: 'pdf', enabled: true },
    { id: '4', reportName: 'GSTR-3B Summary', recipients: 'accounts@safends.com', frequency: 'monthly', day: '10', time: '09:00', format: 'json', enabled: false },
  ]);

  const [newSchedule, setNewSchedule] = useState({
    reportName: '', recipients: '', frequency: 'daily', day: '', time: '09:00', format: 'excel',
  });

  const handleAdd = () => {
    if (!newSchedule.reportName || !newSchedule.recipients) {
      toast({ title: "Error", description: "Select a report and enter at least one email", variant: "destructive" });
      return;
    }
    setSchedules([...schedules, { ...newSchedule, id: Date.now().toString(), enabled: true }]);
    setAddDialogOpen(false);
    setNewSchedule({ reportName: '', recipients: '', frequency: 'daily', day: '', time: '09:00', format: 'excel' });
    toast({ title: "Schedule Added", description: `${newSchedule.reportName} will be sent ${newSchedule.frequency}` });
  };

  const handleDelete = (id: string) => {
    setSchedules(schedules.filter(s => s.id !== id));
    toast({ title: "Removed", description: "Email schedule deleted" });
  };

  const handleToggle = (id: string) => {
    setSchedules(schedules.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const getFrequencyLabel = (s: ScheduledEmail) => {
    if (s.frequency === 'daily') return `Daily at ${s.time}`;
    if (s.frequency === 'weekly') return `Every ${s.day} at ${s.time}`;
    if (s.frequency === 'monthly') return `${s.day}${getOrdinal(s.day)} of month at ${s.time}`;
    return s.frequency;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Auto Email Reports</h3>
          <p className="text-sm text-muted-foreground">Schedule reports to be sent automatically via email</p>
        </div>
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Schedule
        </Button>
      </div>

      {/* Schedules Table */}
      <Card>
        <CardContent className="p-0">
          {schedules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No email schedules</p>
              <p className="text-sm mt-1">Add a schedule to auto-send reports via email</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Report</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.id} className={!schedule.enabled ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm">{schedule.reportName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {schedule.recipients.split(',').map((email, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] font-normal">{email.trim()}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {getFrequencyLabel(schedule)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase">{schedule.format}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={schedule.enabled} onCheckedChange={() => handleToggle(schedule.id)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(schedule.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Schedule Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Email Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Report</Label>
              <Select value={newSchedule.reportName} onValueChange={(v) => setNewSchedule({ ...newSchedule, reportName: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select report" /></SelectTrigger>
                <SelectContent>
                  {REPORT_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Recipients (comma-separated emails)</Label>
              <Input className="mt-1" placeholder="e.g. hr@safends.com, admin@safends.com" value={newSchedule.recipients} onChange={(e) => setNewSchedule({ ...newSchedule, recipients: e.target.value })} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Frequency</Label>
                <Select value={newSchedule.frequency} onValueChange={(v) => setNewSchedule({ ...newSchedule, frequency: v, day: '' })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newSchedule.frequency === 'weekly' && (
                <div>
                  <Label className="text-xs">Day</Label>
                  <Select value={newSchedule.day} onValueChange={(v) => setNewSchedule({ ...newSchedule, day: v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Day" /></SelectTrigger>
                    <SelectContent>
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => <SelectItem key={d} value={d.toLowerCase()}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {newSchedule.frequency === 'monthly' && (
                <div>
                  <Label className="text-xs">Day of Month</Label>
                  <Select value={newSchedule.day} onValueChange={(v) => setNewSchedule({ ...newSchedule, day: v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Day" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className="text-xs">Time</Label>
                <Input type="time" className="mt-1" value={newSchedule.time} onChange={(e) => setNewSchedule({ ...newSchedule, time: e.target.value })} />
              </div>
            </div>

            <div>
              <Label className="text-xs">File Format</Label>
              <Select value={newSchedule.format} onValueChange={(v) => setNewSchedule({ ...newSchedule, format: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} className="bg-safend-red hover:bg-safend-red/90 text-white">Add Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getOrdinal(day: string): string {
  const n = parseInt(day);
  if (n === 1 || n === 21 || n === 31) return 'st';
  if (n === 2 || n === 22) return 'nd';
  if (n === 3 || n === 23) return 'rd';
  return 'th';
}
