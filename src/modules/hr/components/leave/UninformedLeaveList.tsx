'use client';

import { useState } from "react";
import { UninformedLeave } from "../index";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface UninformedLeaveListProps {
  leaves: UninformedLeave[];
  onResolve: (id: string, resolution: 'Regularized' | 'Converted' | 'Marked Abscond') => void;
}

export function UninformedLeaveList({ leaves, onResolve }: UninformedLeaveListProps) {
  const [isRegularizeDialogOpen, setIsRegularizeDialogOpen] = useState(false);
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [isWarnDialogOpen, setIsWarnDialogOpen] = useState(false);
  const [isAbscondDialogOpen, setIsAbscondDialogOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<UninformedLeave | null>(null);
  const [remarks, setRemarks] = useState("");
  const [leaveType, setLeaveType] = useState("sick");

  const handleRegularize = (leave: UninformedLeave) => {
    setSelectedLeave(leave);
    setRemarks("");
    setIsRegularizeDialogOpen(true);
  };

  const handleConvert = (leave: UninformedLeave) => {
    setSelectedLeave(leave);
    setLeaveType("sick");
    setIsConvertDialogOpen(true);
  };

  const handleWarn = (leave: UninformedLeave) => {
    setSelectedLeave(leave);
    setRemarks("");
    setIsWarnDialogOpen(true);
  };

  const handleMarkAbscond = (leave: UninformedLeave) => {
    setSelectedLeave(leave);
    setRemarks("");
    setIsAbscondDialogOpen(true);
  };

  const confirmRegularize = () => {
    if (selectedLeave) {
      onResolve(selectedLeave.id, 'Regularized');
    }
    setIsRegularizeDialogOpen(false);
  };

  const confirmConvert = () => {
    if (selectedLeave) {
      onResolve(selectedLeave.id, 'Converted');
    }
    setIsConvertDialogOpen(false);
  };

  const confirmWarn = () => {
    // In a real app, this would send a warning to the employee
    setIsWarnDialogOpen(false);
  };

  const confirmAbscond = () => {
    if (selectedLeave) {
      onResolve(selectedLeave.id, 'Marked Abscond');
    }
    setIsAbscondDialogOpen(false);
  };

  // Group consecutive days for the same employee
  const groupedLeaves = leaves.reduce<{[key: string]: UninformedLeave[]}>((acc, leave) => {
    const key = leave.employeeId;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(leave);
    return acc;
  }, {});

  // Sort by date and get consecutive days
  Object.values(groupedLeaves).forEach(employeeLeaves => {
    employeeLeaves.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  });

  const isConsecutive = (leaves: UninformedLeave[], index: number): number => {
    if (index === 0) return 1;
    
    const currentDate = new Date(leaves[index].date);
    const previousDate = new Date(leaves[index - 1].date);
    
    // Check if dates are consecutive
    const diffTime = Math.abs(currentDate.getTime() - previousDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      return isConsecutive(leaves, index - 1) + 1;
    }
    
    return 1;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Uninformed Leave Tracker</CardTitle>
        <CardDescription>
          Manage and track uninformed absences
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Post</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Consecutive Days</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaves.length > 0 ? (
              leaves.map((leave, index) => {
                const consecutiveDays = isConsecutive(
                  groupedLeaves[leave.employeeId], 
                  groupedLeaves[leave.employeeId].findIndex(l => l.id === leave.id)
                );
                const isRisky = consecutiveDays >= 3;
                
                return (
                  <TableRow key={leave.id}>
                    <TableCell className="font-medium">{leave.employeeName}</TableCell>
                    <TableCell>{new Date(leave.date).toLocaleDateString()}</TableCell>
                    <TableCell>{leave.postId || 'N/A'}</TableCell>
                    <TableCell>
                      {leave.resolution ? (
                        <Badge variant="outline">{leave.resolution}</Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {isRisky ? (
                        <Badge variant="destructive" className="flex gap-1 items-center">
                          {consecutiveDays} days
                          <span className="h-4 w-4">⚠️</span>
                        </Badge>
                      ) : (
                        <Badge variant="outline">{consecutiveDays} day{consecutiveDays > 1 ? 's' : ''}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!leave.resolution && (
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleRegularize(leave)}>
                            Regularize
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleConvert(leave)}>
                            Convert
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleWarn(leave)}>
                            Warn
                          </Button>
                          {isRisky && (
                            <Button variant="destructive" size="sm" onClick={() => handleMarkAbscond(leave)}>
                              Mark Abscond
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6">
                  No uninformed leaves to display
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        
        {/* Regularize Dialog */}
        <Dialog open={isRegularizeDialogOpen} onOpenChange={setIsRegularizeDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Regularize Uninformed Leave</DialogTitle>
              <DialogDescription>
                Enter details to regularize the absence for {selectedLeave?.employeeName} on {selectedLeave?.date}.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="remarks">Reason for Absence</Label>
                <Textarea 
                  id="remarks" 
                  value={remarks} 
                  onChange={(e) => setRemarks(e.target.value)} 
                  placeholder="Enter the reason for absence"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRegularizeDialogOpen(false)}>Cancel</Button>
              <Button onClick={confirmRegularize}>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Convert Dialog */}
        <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convert to Leave</DialogTitle>
              <DialogDescription>
                Convert uninformed absence to a leave for {selectedLeave?.employeeName} on {selectedLeave?.date}.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="leaveType">Leave Type</Label>
                <Select value={leaveType} onValueChange={setLeaveType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Leave Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sick">Sick Leave</SelectItem>
                    <SelectItem value="casual">Casual Leave</SelectItem>
                    <SelectItem value="earned">Earned Leave</SelectItem>
                    <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="leaveReason">Reason</Label>
                <Textarea 
                  id="leaveReason" 
                  value={remarks} 
                  onChange={(e) => setRemarks(e.target.value)} 
                  placeholder="Enter reason for leave"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsConvertDialogOpen(false)}>Cancel</Button>
              <Button onClick={confirmConvert}>Convert</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Warn Dialog */}
        <Dialog open={isWarnDialogOpen} onOpenChange={setIsWarnDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue Warning</DialogTitle>
              <DialogDescription>
                Send a warning to {selectedLeave?.employeeName} regarding uninformed absence on {selectedLeave?.date}.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="warningMessage">Warning Message</Label>
                <Textarea 
                  id="warningMessage" 
                  value={remarks} 
                  onChange={(e) => setRemarks(e.target.value)} 
                  placeholder="Enter warning message"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsWarnDialogOpen(false)}>Cancel</Button>
              <Button onClick={confirmWarn}>Send Warning</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Abscond Dialog */}
        <Dialog open={isAbscondDialogOpen} onOpenChange={setIsAbscondDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark as Abscond</DialogTitle>
              <DialogDescription>
                This will mark {selectedLeave?.employeeName} as abscond and create an abscond case. Salary will be locked.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="abscondReason">Remarks</Label>
                <Textarea 
                  id="abscondReason" 
                  value={remarks} 
                  onChange={(e) => setRemarks(e.target.value)} 
                  placeholder="Enter remarks for the abscond case"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAbscondDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmAbscond}>Mark Abscond</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
