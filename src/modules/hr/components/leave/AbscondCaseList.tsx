'use client';

import { useState } from "react";
import { AbscondCase } from "../index";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, History, Phone } from "lucide-react";

interface AbscondCaseListProps {
  cases: AbscondCase[];
  onClose: (id: string, remarks: string) => void;
}

export function AbscondCaseList({ cases, onClose }: AbscondCaseListProps) {
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<AbscondCase | null>(null);
  const [remarks, setRemarks] = useState("");
  
  const handleViewDetails = (abscondCase: AbscondCase) => {
    setSelectedCase(abscondCase);
    setIsDetailsDialogOpen(true);
  };
  
  const handleCloseCase = (abscondCase: AbscondCase) => {
    setSelectedCase(abscondCase);
    setRemarks("");
    setIsCloseDialogOpen(true);
  };
  
  const confirmCloseCase = () => {
    if (selectedCase) {
      onClose(selectedCase.id, remarks);
    }
    setIsCloseDialogOpen(false);
  };
  
  // Calculate days since start
  const getDaysSinceStart = (startDate: string) => {
    const start = new Date(startDate);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Filter to only show active cases by default
  const activeCases = cases.filter(c => c.status === "PENDING");
  const closedCases = cases.filter(c => c.status === "CLOSED");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Abscond Cases</CardTitle>
        <CardDescription>
          Track and manage employees who have absconded
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <h3 className="text-lg font-medium">Active Cases ({activeCases.length})</h3>
        </div>
        
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>Days Since</TableHead>
              <TableHead>Last Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeCases.length > 0 ? (
              activeCases.map((abscondCase) => (
                <TableRow key={abscondCase.id}>
                  <TableCell className="font-medium">{abscondCase.employeeName}</TableCell>
                  <TableCell>{new Date(abscondCase.startDate).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant="destructive">
                      {getDaysSinceStart(abscondCase.startDate)} days
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(abscondCase.lastContact).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
                      {abscondCase.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleViewDetails(abscondCase)}
                      >
                        <History className="h-4 w-4 mr-1" /> Details
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                      >
                        <Phone className="h-4 w-4 mr-1" /> Attempt Contact
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleCloseCase(abscondCase)}
                      >
                        Close Case
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6">
                  No active abscond cases to display
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        
        {closedCases.length > 0 && (
          <>
            <div className="mt-8 mb-4">
              <h3 className="text-lg font-medium">Closed Cases ({closedCases.length})</h3>
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Closed By</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closedCases.map((abscondCase) => (
                  <TableRow key={abscondCase.id}>
                    <TableCell className="font-medium">{abscondCase.employeeName}</TableCell>
                    <TableCell>{new Date(abscondCase.startDate).toLocaleDateString()}</TableCell>
                    <TableCell>{abscondCase.closedAt ? new Date(abscondCase.closedAt).toLocaleDateString() : 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-gray-50">
                        {abscondCase.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{abscondCase.closedBy || 'N/A'}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleViewDetails(abscondCase)}
                      >
                        <History className="h-4 w-4 mr-1" /> Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        
        {/* Case Details Dialog */}
        <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Abscond Case Details</DialogTitle>
              <DialogDescription>
                Details for case {selectedCase?.id}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Employee</Label>
                <div className="col-span-3 font-medium">{selectedCase?.employeeName}</div>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Start Date</Label>
                <div className="col-span-3">{selectedCase?.startDate}</div>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Last Contact</Label>
                <div className="col-span-3">{selectedCase?.lastContact}</div>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Status</Label>
                <div className="col-span-3">
                  <Badge variant={selectedCase?.status === 'PENDING' ? 'destructive' : 'outline'}>
                    {selectedCase?.status}
                  </Badge>
                </div>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Salary Cut</Label>
                <div className="col-span-3">
                  {selectedCase?.salaryCut ? 'Yes' : 'No'}
                </div>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Remarks</Label>
                <div className="col-span-3">{selectedCase?.remarks}</div>
              </div>
              
              {selectedCase?.status === 'CLOSED' && (
                <>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Closed By</Label>
                    <div className="col-span-3">{selectedCase.closedBy}</div>
                  </div>
                  
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Closed On</Label>
                    <div className="col-span-3">
                      {selectedCase.closedAt ? new Date(selectedCase.closedAt).toLocaleString() : 'N/A'}
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <DialogFooter>
              <Button onClick={() => setIsDetailsDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Close Case Dialog */}
        <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Close Abscond Case</DialogTitle>
              <DialogDescription>
                Enter the resolution details for the abscond case for {selectedCase?.employeeName}.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="closeRemarks">Resolution Remarks</Label>
                <Textarea 
                  id="closeRemarks" 
                  value={remarks} 
                  onChange={(e) => setRemarks(e.target.value)} 
                  placeholder="Enter resolution details"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCloseDialogOpen(false)}>Cancel</Button>
              <Button onClick={confirmCloseCase}>Close Case</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
