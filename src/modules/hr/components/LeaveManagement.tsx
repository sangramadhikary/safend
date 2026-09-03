'use client';

import { useState, useEffect } from "react";
import { LeaveManagementProps, LeaveBalance, UninformedLeave, AbscondCase } from "./index";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  Plus,
  Search,
  XCircle,
  CalendarIcon,
  AlertTriangle,
  FileImage,
  Ban,
  Send
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LeaveBalanceTable } from "./leave/LeaveBalanceTable";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Leave requests will be fetched from Supabase
import { supabase } from "@/integrations/supabase/client";
import { applyBranchScope, onBranchScopeChange } from "@/utils/branchScope";
import { LeaveHeatMap } from "./leave/LeaveHeatMap";
import { UninformedLeaveList } from "./leave/UninformedLeaveList";
import { AbscondCaseList } from "./leave/AbscondCaseList";
import { CountUp } from "@/components/dashboard/CountUp";

// Leave application type aligned with new Operations leave types
interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: "Planned Leave" | "Sick Leave" | "Abscond";
  subType: "Paid" | "Unpaid";
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  requestedBy: string; // Operations person who submitted
  requestDate: string;
  approvedBy?: string;
  approvedOn?: string;
  rejectionReason?: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  leaveBalance: number;
  // Abscond-specific fields
  showCauseIssued?: boolean;
  showCauseDate?: string;
  terminationIssued?: boolean;
  terminationDate?: string;
}

// Leave requests fetched from Supabase
const mockLeaveBalances: LeaveBalance[] = [];

export function LeaveManagement({ filter }: LeaveManagementProps) {
  const [activeTab, setActiveTab] = useState("applications");
  const [searchTerm, setSearchTerm] = useState("");
  const [showLeaveDetailsDialog, setShowLeaveDetailsDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showAbscondActionDialog, setShowAbscondActionDialog] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [processingLeaveId, setProcessingLeaveId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const [branch, setBranch] = useState<string>("all");
  const [uninformedLeaves, setUninformedLeaves] = useState<UninformedLeave[]>([]);
  const [abscondCases, setAbscondCases] = useState<AbscondCase[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  

  // Fetch leave requests from Supabase
  useEffect(() => {
    const fetchLeaveRequests = async () => {
      try {
        let query = supabase
          .from('leave_requests')
          .select('*, employees!leave_requests_employee_id_fkey(name)')
          .order('created_at', { ascending: false });
        query = applyBranchScope(query);
        const { data, error } = await query;

        if (error) {
          // Fallback without join
          let fbQuery = supabase
            .from('leave_requests')
            .select('*')
            .order('created_at', { ascending: false });
          fbQuery = applyBranchScope(fbQuery);
          const { data: fallback, error: fbErr } = await fbQuery;
          if (fbErr) throw fbErr;
          
          const mapped = (fallback || []).map((r: any) => mapToLeaveRequest(r, null));
          setLeaveRequests(mapped);
        } else {
          const mapped = (data || []).map((r: any) => mapToLeaveRequest(r, r.employees?.name));
          setLeaveRequests(mapped);
        }
      } catch (err) {
        console.error('Error fetching leave requests:', err);
      }
    };

    fetchLeaveRequests();
    const off = onBranchScopeChange(() => fetchLeaveRequests());
    return () => off();
  }, []);

  function mapToLeaveRequest(r: any, employeeName: string | null): LeaveRequest {
    const leaveTypeParts = (r.leave_type || '').split(' - ');
    const type = (leaveTypeParts[0] || 'Planned Leave') as LeaveRequest['leaveType'];
    const subType = (leaveTypeParts[1] || 'Unpaid') as LeaveRequest['subType'];
    const fromDate = r.from_date || '';
    const toDate = r.to_date || '';
    let days = 0;
    if (fromDate && toDate) {
      days = Math.ceil((new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }

    return {
      id: r.leave_id || r.id,
      employeeId: r.employee_id || '',
      employeeName: employeeName || r.employee_id || 'Unknown',
      leaveType: type,
      subType,
      fromDate,
      toDate,
      days: days > 0 ? days : 0,
      reason: r.reason || '',
      status: (r.status === 'Pending' || r.status === 'Approved' || r.status === 'Rejected') ? r.status : 'Pending',
      requestedBy: 'Operations',
      requestDate: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
      approvedBy: r.approved_by || undefined,
      approvedOn: r.approved_at ? new Date(r.approved_at).toISOString().split('T')[0] : undefined,
      attachmentUrl: null,
      attachmentName: null,
      leaveBalance: 0,
    };
  }
  const { toast } = useToast();
  
  // Filter leave requests based on filter prop and search
  const filteredLeaveRequests = leaveRequests.filter(leave => {
    // Status filter
    if (filter && filter !== "All" && filter !== "All Leaves") {
      if (filter.toLowerCase() !== leave.status.toLowerCase()) return false;
    }
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        leave.employeeName.toLowerCase().includes(term) ||
        leave.leaveType.toLowerCase().includes(term) ||
        leave.reason.toLowerCase().includes(term) ||
        leave.id.toLowerCase().includes(term)
      );
    }
    return true;
  });
  
  // Filter based on selected branch for uninformed leaves
  const filteredUninformedLeaves = branch === "all" 
    ? uninformedLeaves 
    : uninformedLeaves.filter(leave => leave.branchId === branch);
  
  const handleViewLeaveDetails = (leave: LeaveRequest) => {
    setSelectedLeave(leave);
    setShowLeaveDetailsDialog(true);
  };
  
  const handleApproveLeave = async (leaveId: string) => {
    setProcessingLeaveId(leaveId);
    
    try {
      // Find the leave request to determine if balance deduction is needed
      const leave = leaveRequests.find(l => l.id === leaveId);
      
      // Update status in Supabase
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: 'Approved',
          approved_by: 'HR',
          approved_at: new Date().toISOString(),
        })
        .eq('leave_id', leaveId);
      
      if (error) throw error;
      
      // If it's a paid leave, deduct from leave balance (best-effort, don't block approval)
      if (leave && leave.subType === 'Paid' && leave.employeeId && leave.days > 0) {
        try {
          const { data: empData } = await supabase
            .from('hr_employees')
            .select('casual_leave, sick_leave')
            .eq('employee_id', leave.employeeId)
            .single();
          
          if (empData) {
            const currentCasual = empData.casual_leave || 0;
            if (currentCasual >= leave.days) {
              await supabase
                .from('hr_employees')
                .update({ casual_leave: currentCasual - leave.days })
                .eq('employee_id', leave.employeeId);
            } else {
              const remaining = leave.days - currentCasual;
              const currentSick = empData.sick_leave || 0;
              await supabase
                .from('hr_employees')
                .update({
                  casual_leave: 0,
                  sick_leave: Math.max(0, currentSick - remaining),
                })
                .eq('employee_id', leave.employeeId);
            }
          }
        } catch (balanceErr) {
          console.warn('Leave balance deduction failed (non-blocking):', balanceErr);
        }
      }
      
      // Update local state
      setLeaveRequests(prev =>
        prev.map(l =>
          l.id === leaveId
            ? { ...l, status: 'Approved' as const, approvedBy: 'HR', approvedOn: new Date().toISOString().split('T')[0] }
            : l
        )
      );
      
      toast({
        title: "Leave Approved",
        description: `Leave request ${leaveId} has been approved.`,
      });
    } catch (err: any) {
      console.error('Error approving leave:', err);
      toast({
        title: "Error",
        description: err?.message || "Failed to approve leave request.",
        variant: "destructive",
      });
    } finally {
      setProcessingLeaveId(null);
      setShowLeaveDetailsDialog(false);
    }
  };
  
  const handleRejectLeave = async (leaveId: string) => {
    if (!rejectionReason.trim()) {
      toast({
        title: "Rejection Reason Required",
        description: "Please provide a reason for rejecting this leave request.",
        variant: "destructive",
      });
      return;
    }
    
    setProcessingLeaveId(leaveId);
    
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: 'Rejected',
          approved_by: 'HR',
          approved_at: new Date().toISOString(),
        })
        .eq('leave_id', leaveId);
      
      if (error) throw error;
      
      // Update local state
      setLeaveRequests(prev =>
        prev.map(l =>
          l.id === leaveId
            ? { ...l, status: 'Rejected' as const, rejectionReason: rejectionReason.trim() }
            : l
        )
      );
      
      toast({
        title: "Leave Rejected",
        description: `Leave request ${leaveId} has been rejected.`,
        variant: "destructive",
      });
    } catch (err: any) {
      console.error('Error rejecting leave:', err);
      toast({
        title: "Error",
        description: err?.message || "Failed to reject leave request.",
        variant: "destructive",
      });
    } finally {
      setProcessingLeaveId(null);
      setShowRejectDialog(false);
      setShowLeaveDetailsDialog(false);
      setRejectionReason("");
    }
  };

  // Abscond actions
  const handleIssueShowCause = async (leaveId: string) => {
    setProcessingLeaveId(leaveId);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    toast({
      title: "Show Cause Notice Issued",
      description: "Show cause notice has been issued to the employee.",
    });
    
    setProcessingLeaveId(null);
    setShowAbscondActionDialog(false);
  };

  const handleTerminate = async (leaveId: string) => {
    setProcessingLeaveId(leaveId);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    toast({
      title: "Termination Processed",
      description: "Employee has been terminated without salary as per abscond policy.",
      variant: "destructive",
    });
    
    setProcessingLeaveId(null);
    setShowAbscondActionDialog(false);
  };
  
  // Handle resolving uninformed leave
  const handleResolveUninformedLeave = (leaveId: string, resolution: 'Regularized' | 'Converted' | 'Marked Abscond') => {
    setUninformedLeaves(leaves => 
      leaves.map(leave => 
        leave.id === leaveId 
          ? { ...leave, resolution, resolvedBy: "HR Manager" } 
          : leave
      )
    );
    
    toast({
      title: "Leave Updated",
      description: `Leave has been ${resolution.toLowerCase()}`,
    });
    
    if (resolution === 'Marked Abscond') {
      const leave = uninformedLeaves.find(l => l.id === leaveId);
      if (leave) {
        const newAbscondCase: AbscondCase = {
          id: `ABS${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
          employeeId: leave.employeeId,
          employeeName: leave.employeeName,
          startDate: leave.date,
          lastContact: new Date(new Date(leave.date).getTime() - 86400000).toISOString().split('T')[0],
          status: "PENDING",
          remarks: "Created from uninformed leave.",
          createdAt: new Date().toISOString(),
          salaryCut: true
        };
        
        setAbscondCases([...abscondCases, newAbscondCase]);
        toast({
          title: "Abscond Case Created",
          description: `Employee ${leave.employeeName} marked as abscond`,
          variant: "destructive"
        });
      }
    }
  };

  const handleCloseAbscondCase = (caseId: string, remarks: string) => {
    setAbscondCases(cases => 
      cases.map(c => 
        c.id === caseId 
          ? { 
              ...c, 
              status: "CLOSED", 
              closedAt: new Date().toISOString(),
              closedBy: "HR Manager",
              remarks: remarks
            } 
          : c
      )
    );
    
    toast({
      title: "Case Closed",
      description: "Abscond case has been closed",
    });
  };
  
  const getLeaveTypeBadge = (leaveType: string, subType?: string) => {
    switch (leaveType) {
      case "Planned Leave":
        return (
          <div className="flex flex-col gap-1">
            <Badge className="bg-blue-500 hover:bg-blue-600">Planned</Badge>
            {subType && (
              <Badge variant="outline" className={subType === "Paid" ? "text-green-700 border-green-300 text-xs" : "text-amber-700 border-amber-300 text-xs"}>
                {subType}
              </Badge>
            )}
          </div>
        );
      case "Sick Leave":
        return (
          <div className="flex flex-col gap-1">
            <Badge className="bg-orange-500 hover:bg-orange-600">Sick Leave</Badge>
            <Badge variant="outline" className="text-amber-700 border-amber-300 text-xs">Unpaid</Badge>
          </div>
        );
      case "Abscond":
        return <Badge variant="destructive">Abscond</Badge>;
      default:
        return <Badge>{leaveType}</Badge>;
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Approved":
        return <Badge className="bg-green-500 hover:bg-green-600">Approved</Badge>;
      case "Rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "Pending":
        return <Badge variant="outline" className="bg-amber-100 text-amber-800 hover:bg-amber-200">Pending Approval</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  // Generate months for dropdown
  const generateMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      // Use day 1 to avoid overflow when current day > 28 (e.g. Feb)
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      options.push({ value, label });
    }
    return options;
  };
  
  // Stats
  const pendingCount = leaveRequests.filter(l => l.status === "Pending").length;
  const approvedCount = leaveRequests.filter(l => l.status === "Approved").length;
  const abscondCount = leaveRequests.filter(l => l.leaveType === "Abscond" && l.status === "Pending").length;
  const uninformedCount = uninformedLeaves.filter(l => !l.resolution).length;
  const rejectedCount = leaveRequests.filter(l => l.status === "Rejected").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Leave Management</h2>
          <p className="text-muted-foreground">
            Review and approve/reject leave requests submitted by Operations
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              <Select
                value={selectedMonth}
                onValueChange={setSelectedMonth}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select Month" />
                </SelectTrigger>
                <SelectContent>
                  {generateMonthOptions().map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                <SelectItem value="BR001">Main Branch</SelectItem>
                <SelectItem value="BR002">North Branch</SelectItem>
                <SelectItem value="BR003">East Branch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search leaves..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-[200px] md:w-[300px]"
            />
          </div>
          
          <Button variant="outline" size="icon" className="h-10 w-10">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600"><CountUp to={pendingCount} duration={2} separator="," /></div>
            <p className="text-sm text-muted-foreground">Awaiting HR approval</p>
          </CardContent>
        </Card>
        
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600"><CountUp to={approvedCount} duration={2} separator="," /></div>
            <p className="text-sm text-muted-foreground">Leaves approved</p>
          </CardContent>
        </Card>
        
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Abscond Cases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600"><CountUp to={abscondCount} duration={2} separator="," /></div>
            <p className="text-sm text-muted-foreground">Pending action</p>
          </CardContent>
        </Card>
        
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Uninformed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600"><CountUp to={uninformedCount} duration={2} separator="," /></div>
            <p className="text-sm text-muted-foreground">Unplanned absences</p>
          </CardContent>
        </Card>
        
        <Card className="bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Rejected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rejectedCount}</div>
            <p className="text-sm text-muted-foreground">Denied leaves</p>
          </CardContent>
        </Card>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="applications">Leave Requests</TabsTrigger>
          <TabsTrigger value="balances">Leave Balances</TabsTrigger>
          <TabsTrigger value="uninformed">Uninformed Leaves</TabsTrigger>
          <TabsTrigger value="abscond">Abscond Cases</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>
        
        {/* Leave Requests Tab - HR Approval */}
        <TabsContent value="applications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Leave Requests from Operations</CardTitle>
              <CardDescription>
                Review and approve/reject leave requests. You are the final approver.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Attachment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeaveRequests.length > 0 ? (
                    filteredLeaveRequests.map((leave) => (
                      <TableRow key={leave.id}>
                        <TableCell className="font-medium">{leave.id}</TableCell>
                        <TableCell>{leave.employeeName}</TableCell>
                        <TableCell>{getLeaveTypeBadge(leave.leaveType, leave.subType)}</TableCell>
                        <TableCell>{leave.fromDate ? new Date(leave.fromDate).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>{leave.toDate ? new Date(leave.toDate).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>{leave.leaveType === "Abscond" ? "—" : leave.days}</TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{leave.requestedBy}</span>
                        </TableCell>
                        <TableCell>
                          {leave.attachmentUrl ? (
                            <Button variant="ghost" size="sm" className="text-blue-600 h-7" asChild>
                              <a href={leave.attachmentUrl} target="_blank" rel="noopener noreferrer">
                                <FileImage className="h-4 w-4 mr-1" />
                                <span className="text-xs">View</span>
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(leave.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewLeaveDetails(leave)}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            
                            {leave.status === "Pending" && leave.leaveType !== "Abscond" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-500 hover:text-green-600"
                                  onClick={() => handleApproveLeave(leave.id)}
                                  disabled={processingLeaveId === leave.id}
                                >
                                  {processingLeaveId === leave.id ? (
                                    <Clock className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4" />
                                  )}
                                </Button>
                                
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-500 hover:text-red-600"
                                  onClick={() => {
                                    setSelectedLeave(leave);
                                    setShowRejectDialog(true);
                                  }}
                                  disabled={processingLeaveId === leave.id}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}

                            {leave.status === "Pending" && leave.leaveType === "Abscond" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-600"
                                onClick={() => {
                                  setSelectedLeave(leave);
                                  setShowAbscondActionDialog(true);
                                }}
                              >
                                <AlertTriangle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        No leave requests found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Leave Balances Tab */}
        <TabsContent value="balances" className="mt-4">
          <LeaveBalanceTable />
        </TabsContent>
        
        {/* Uninformed Leaves Tab */}
        <TabsContent value="uninformed" className="mt-4">
          <UninformedLeaveList 
            leaves={filteredUninformedLeaves} 
            onResolve={handleResolveUninformedLeave}
          />
        </TabsContent>
        
        {/* Abscond Cases Tab */}
        <TabsContent value="abscond" className="mt-4">
          <AbscondCaseList 
            cases={abscondCases} 
            onClose={handleCloseAbscondCase}
          />
        </TabsContent>
        
        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Leave Heat Map</CardTitle>
              <CardDescription>
                Visualize leave patterns and identify potential issues
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LeaveHeatMap month={selectedMonth} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Leave Details Dialog */}
      <Dialog open={showLeaveDetailsDialog} onOpenChange={setShowLeaveDetailsDialog}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
            <DialogDescription>
              Review the leave request submitted by Operations
            </DialogDescription>
          </DialogHeader>
          
          {selectedLeave && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Employee</p>
                  <p className="font-medium">{selectedLeave.employeeName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Employee ID</p>
                  <p className="font-medium">{selectedLeave.employeeId}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Leave Type</p>
                  <div className="mt-1">{getLeaveTypeBadge(selectedLeave.leaveType, selectedLeave.subType)}</div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedLeave.status)}</div>
                </div>
                {selectedLeave.leaveType !== "Abscond" && (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground">From Date</p>
                      <p className="font-medium">{new Date(selectedLeave.fromDate).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">To Date</p>
                      <p className="font-medium">{new Date(selectedLeave.toDate).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Days</p>
                      <p className="font-medium">{selectedLeave.days}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Leave Balance</p>
                      <p className="font-medium">{selectedLeave.leaveBalance} days</p>
                    </div>
                  </>
                )}
                {selectedLeave.leaveType === "Abscond" && (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground">Last Present</p>
                      <p className="font-medium">{new Date(selectedLeave.fromDate).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Show Cause Issued</p>
                      <p className="font-medium">{selectedLeave.showCauseIssued ? "Yes" : "No"}</p>
                    </div>
                  </>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Requested By (Ops)</p>
                  <p className="font-medium">{selectedLeave.requestedBy}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Request Date</p>
                  <p className="font-medium">{new Date(selectedLeave.requestDate).toLocaleDateString()}</p>
                </div>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground">Reason</p>
                <p className="font-medium">{selectedLeave.reason}</p>
              </div>

              {selectedLeave.attachmentUrl && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Handwritten Application</p>
                  <Button variant="outline" size="sm" asChild>
                    <a href={selectedLeave.attachmentUrl} target="_blank" rel="noopener noreferrer">
                      <FileImage className="h-4 w-4 mr-2" />
                      View Attachment
                    </a>
                  </Button>
                </div>
              )}
              
              {selectedLeave.status === "Approved" && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">Approved By</p>
                    <p className="font-medium">{selectedLeave.approvedBy}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Approved On</p>
                    <p className="font-medium">{selectedLeave.approvedOn ? new Date(selectedLeave.approvedOn).toLocaleDateString() : "—"}</p>
                  </div>
                </div>
              )}

              {selectedLeave.status === "Rejected" && selectedLeave.rejectionReason && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">Rejection Reason</p>
                  <p className="font-medium text-red-600">{selectedLeave.rejectionReason}</p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDetailsDialog(false)}>Close</Button>
            {selectedLeave && selectedLeave.status === "Pending" && selectedLeave.leaveType !== "Abscond" && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="text-red-500 border-red-500 hover:bg-red-50"
                  onClick={() => {
                    setShowRejectDialog(true);
                  }}
                >
                  Reject
                </Button>
                <Button
                  onClick={() => handleApproveLeave(selectedLeave.id)}
                  disabled={processingLeaveId === selectedLeave.id}
                >
                  {processingLeaveId === selectedLeave.id ? "Processing..." : "Approve"}
                </Button>
              </div>
            )}
            {selectedLeave && selectedLeave.status === "Pending" && selectedLeave.leaveType === "Abscond" && (
              <Button
                variant="destructive"
                onClick={() => {
                  setShowAbscondActionDialog(true);
                  setShowLeaveDetailsDialog(false);
                }}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Take Action
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this leave request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rejection Reason*</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRejectDialog(false); setRejectionReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedLeave && handleRejectLeave(selectedLeave.id)}
              disabled={!rejectionReason.trim() || processingLeaveId === selectedLeave?.id}
            >
              {processingLeaveId === selectedLeave?.id ? "Processing..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Abscond Action Dialog */}
      <Dialog open={showAbscondActionDialog} onOpenChange={setShowAbscondActionDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Abscond Case Action
            </DialogTitle>
            <DialogDescription>
              Employee has been absent 24+ hours without intimation. Choose an action.
            </DialogDescription>
          </DialogHeader>
          
          {selectedLeave && (
            <div className="space-y-4">
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm font-medium text-red-800">Employee: {selectedLeave.employeeName}</p>
                <p className="text-sm text-red-700">Last Present: {selectedLeave.fromDate ? new Date(selectedLeave.fromDate).toLocaleDateString() : "—"}</p>
                <p className="text-sm text-red-700">Reason: {selectedLeave.reason}</p>
              </div>

              <div className="space-y-3">
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  onClick={() => handleIssueShowCause(selectedLeave.id)}
                  disabled={processingLeaveId === selectedLeave.id}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Issue Show Cause Notice
                </Button>
                
                <Button
                  className="w-full justify-start"
                  variant="destructive"
                  onClick={() => handleTerminate(selectedLeave.id)}
                  disabled={processingLeaveId === selectedLeave.id}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Terminate Without Salary
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Note: Termination will stop all salary payments and mark the employee as terminated in the system.
              </p>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAbscondActionDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
