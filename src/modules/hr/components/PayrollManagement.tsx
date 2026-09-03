'use client';
import { useState, useEffect } from "react";
import { PayrollManagementProps, SalaryPaymentRequestUI, EmployeeSalaryDetailUI, HeldSalaryUI } from "./index";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CreditCard, FileText, Send, CheckCircle, XCircle, Clock, Eye, Filter, Users, Calendar } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createSalaryPaymentRequest, submitSalaryRequestToAccounts, getAllSalaryPaymentRequests } from "@/services/PayrollService";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

// Payment requests data (loaded from database when available)
const initialPaymentRequests: SalaryPaymentRequestUI[] = [];

// Employee salary details (loaded from database when available)
const mockEmployeeDetails: EmployeeSalaryDetailUI[] = [];

// Held salaries (loaded from database when available)
const mockHeldSalaries: HeldSalaryUI[] = [];

export function PayrollManagement({ filter }: PayrollManagementProps) {
  const [isPaymentRequestDialogOpen, setIsPaymentRequestDialogOpen] = useState(false);
  const [isViewRequestDialogOpen, setIsViewRequestDialogOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [requestDescription, setRequestDescription] = useState<string>("");
  const [requestAmount, setRequestAmount] = useState<string>("");
  const [employeeCount, setEmployeeCount] = useState<string>("");
  const [paymentRequests, setPaymentRequests] = useState<SalaryPaymentRequestUI[]>(initialPaymentRequests);
  const [selectedRequest, setSelectedRequest] = useState<SalaryPaymentRequestUI | null>(null);
  const [selectedEmployeeDetails, setSelectedEmployeeDetails] = useState<EmployeeSalaryDetailUI[]>(mockEmployeeDetails);
  const [heldSalaries, setHeldSalaries] = useState<HeldSalaryUI[]>(mockHeldSalaries);
  const [activeTab, setActiveTab] = useState("payment-requests");
  const { toast } = useToast();
  
  // Filter payroll data based on the filter prop
  const filteredPaymentRequests = filter === "All Payroll" 
    ? paymentRequests 
    : paymentRequests.filter(item => {
        if (filter === "Processing") return item.status === "DRAFT" || item.status === "SENT_TO_ACCOUNTS";
        if (filter === "Completed") return item.status === "APPROVED_BY_ACCOUNTS";
        if (filter === "Holds") return item.heldCount && item.heldCount > 0;
        return true;
      });

  const handleCreatePaymentRequest = () => {
    if (!selectedDepartment || !requestDescription || !requestAmount || !employeeCount) {
      toast({
        title: "Error",
        description: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }

    const currentDate = new Date();
    const month = currentDate.toLocaleString('default', { month: 'long' });
    const year = currentDate.getFullYear().toString();

    // Create new payment request
    const newRequest = {
      departmentName: selectedDepartment,
      employeeCount: parseInt(employeeCount),
      totalAmount: parseFloat(requestAmount),
      month,
      year,
      requestDate: new Date().toISOString(),
      status: "DRAFT",
      description: requestDescription
    };

    try {
      // In a real app, this would call the actual service
      const apiRequest = createSalaryPaymentRequest({
        employeeIds: [], // In a real app, would have actual IDs
        department: selectedDepartment,
        totalAmount: parseFloat(requestAmount),
        requestedBy: "HR Manager",
        description: requestDescription,
        month,
        year
      });
      
      // Add to UI list
      const newPaymentRequest: SalaryPaymentRequestUI = {
        id: `PR${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
        ...newRequest
      };
      
      setPaymentRequests([newPaymentRequest, ...paymentRequests]);
      setIsPaymentRequestDialogOpen(false);
      
      // Reset form
      setSelectedDepartment("");
      setRequestDescription("");
      setRequestAmount("");
      setEmployeeCount("");
      
      toast({
        title: "Payment Request Created",
        description: `Salary payment request for ${selectedDepartment} has been created`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create payment request",
        variant: "destructive",
      });
    }
  };

  const handleSubmitToAccounts = (requestId: string) => {
    try {
      // In a real app, this would call the actual service
      submitSalaryRequestToAccounts(requestId);
      
      // Update UI
      setPaymentRequests(paymentRequests.map(req => 
        req.id === requestId
          ? { ...req, status: "SENT_TO_ACCOUNTS" }
          : req
      ));
      
      toast({
        title: "Request Submitted",
        description: "Payment request has been submitted to accounts for approval",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit request to accounts",
        variant: "destructive",
      });
    }
  };

  const handleViewRequest = (request: SalaryPaymentRequestUI) => {
    setSelectedRequest(request);
    setIsViewRequestDialogOpen(true);
  };

  const handleResolveHeldSalary = (employeeId: string) => {
    // Update the held salaries list
    const updatedHeldSalaries = heldSalaries.map(held => 
      held.employeeId === employeeId ? { ...held, resolved: true, resolvedOn: new Date().toISOString(), resolvedBy: "HR Manager", resolutionNotes: "Issue resolved" } : held
    );
    
    // Update the employee details list
    const updatedEmployeeDetails = selectedEmployeeDetails.map(emp =>
      emp.employeeId === employeeId ? { ...emp, status: "READY_TO_PAY" as const, holdReason: undefined } : emp
    );
    
    setHeldSalaries(updatedHeldSalaries);
    setSelectedEmployeeDetails(updatedEmployeeDetails);
    
    toast({
      title: "Hold Released",
      description: `Salary hold for employee has been resolved`,
    });
  };

  const getStatusBadge = (status: string) => {
    if (status === "DRAFT") {
      return <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">Draft</Badge>;
    } else if (status === "SENT_TO_ACCOUNTS") {
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending Accounts</Badge>;
    } else if (status === "APPROVED_BY_ACCOUNTS") {
      return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">Approved</Badge>;
    } else if (status === "REJECTED_BY_ACCOUNTS") {
      return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">Rejected</Badge>;
    } else if (status === "COMPLETED") {
      return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">Completed</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Alert className="bg-blue-50 border-blue-200">
        <AlertCircle className="h-4 w-4 text-blue-600" />
        <AlertTitle>Information</AlertTitle>
        <AlertDescription>
          All salary payments need to be requested through the Accounts department.
          Create a payment request below and submit it for approval.
        </AlertDescription>
      </Alert>
      
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Salary Payment Management</h2>
        <Button 
          onClick={() => setIsPaymentRequestDialogOpen(true)}
          className="flex items-center gap-2"
        >
          <CreditCard className="h-4 w-4" /> Create Payment Request
        </Button>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="payment-requests">Payment Requests</TabsTrigger>
          <TabsTrigger value="held-salaries">Held Salaries</TabsTrigger>
          <TabsTrigger value="payment-history">Payment History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="payment-requests" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-medium">Payment Requests</CardTitle>
                <CardDescription>
                  Track status of salary payment requests sent to accounts
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <Filter className="h-4 w-4" />
                <span>Filter</span>
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center">Employees</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPaymentRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.departmentName}</TableCell>
                      <TableCell>{`${request.month} ${request.year}`}</TableCell>
                      <TableCell className="text-right">₹{request.totalAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-center">
                        {request.employeeCount}
                        {request.heldCount && request.heldCount > 0 && (
                          <Badge variant="outline" className="ml-2 bg-red-50 text-red-500 border-red-100">
                            {request.heldCount} held
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell>{new Date(request.requestDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1"
                            onClick={() => handleViewRequest(request)}
                          >
                            <Eye className="h-4 w-4" />
                            <span>View</span>
                          </Button>
                          {request.status === "DRAFT" && (
                            <Button
                              onClick={() => handleSubmitToAccounts(request.id)}
                              variant="default"
                              size="sm"
                              className="flex items-center gap-1"
                            >
                              <Send className="h-4 w-4" />
                              <span>Submit to Accounts</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {filteredPaymentRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                        No payment requests found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="held-salaries" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-medium">Held Salaries</CardTitle>
              <CardDescription>
                Manage salaries that have been put on hold
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Held By</TableHead>
                    <TableHead>Hold Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {heldSalaries.filter(held => !held.resolved).map((held) => (
                    <TableRow key={held.employeeId}>
                      <TableCell className="font-medium">{held.employeeName}</TableCell>
                      <TableCell>₹{held.amount.toLocaleString()}</TableCell>
                      <TableCell>{held.reason}</TableCell>
                      <TableCell>{held.heldBy}</TableCell>
                      <TableCell>{new Date(held.heldOn).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
                          On Hold
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-1 text-green-600"
                          onClick={() => handleResolveHeldSalary(held.employeeId)}
                        >
                          <CheckCircle className="h-4 w-4" />
                          <span>Resolve</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {heldSalaries.filter(held => !held.resolved).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                        No salaries currently on hold
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="payment-history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-medium">Payment History</CardTitle>
              <CardDescription>
                View past salary payments and their status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Processed On</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentRequests.filter(req => req.status === "APPROVED_BY_ACCOUNTS" || req.status === "COMPLETED").map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>{`${request.month} ${request.year}`}</TableCell>
                      <TableCell>{request.departmentName}</TableCell>
                      <TableCell className="text-right">₹{request.totalAmount.toLocaleString()}</TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell>{new Date(request.requestDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-1"
                        >
                          <FileText className="h-4 w-4" />
                          <span>Details</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {paymentRequests.filter(req => req.status === "APPROVED_BY_ACCOUNTS" || req.status === "COMPLETED").length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                        No payment history found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payment Request Dialog */}
      <Dialog open={isPaymentRequestDialogOpen} onOpenChange={setIsPaymentRequestDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Salary Payment Request</DialogTitle>
            <DialogDescription>
              Create a salary payment request to be approved by the accounts department
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <div className="col-span-4">
                <label htmlFor="department" className="text-sm font-medium">Department</label>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Engineering">Engineering</SelectItem>
                    <SelectItem value="Marketing">Marketing</SelectItem>
                    <SelectItem value="Operations">Operations</SelectItem>
                    <SelectItem value="Finance">Finance</SelectItem>
                    <SelectItem value="Human Resources">Human Resources</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 items-center gap-4">
              <div>
                <label htmlFor="amount" className="text-sm font-medium">Total Amount (₹)</label>
                <Input
                  id="amount"
                  value={requestAmount}
                  onChange={(e) => setRequestAmount(e.target.value)}
                  type="number"
                  className="mt-1"
                  placeholder="Total salary amount"
                />
              </div>
              <div>
                <label htmlFor="employees" className="text-sm font-medium">Number of Employees</label>
                <Input
                  id="employees"
                  value={employeeCount}
                  onChange={(e) => setEmployeeCount(e.target.value)}
                  type="number"
                  className="mt-1"
                  placeholder="Employee count"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 items-center gap-4">
              <label htmlFor="description" className="text-sm font-medium">Description</label>
              <Input
                id="description"
                value={requestDescription}
                onChange={(e) => setRequestDescription(e.target.value)}
                className="mt-1"
                placeholder="Payment description"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentRequestDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="default"
              onClick={handleCreatePaymentRequest}
              className="flex items-center gap-1"
            >
              <CreditCard className="h-4 w-4" />
              Create Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* View Request Dialog */}
      <Dialog open={isViewRequestDialogOpen} onOpenChange={setIsViewRequestDialogOpen}>
        <DialogContent className="sm:max-w-[800px]">
          <DialogHeader>
            <DialogTitle>Payment Request Details</DialogTitle>
            <DialogDescription>
              {selectedRequest?.description}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="employees">
            <TabsList className="grid grid-cols-3 mb-4">
              <TabsTrigger value="employees">Employees</TabsTrigger>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>
            
            <TabsContent value="employees">
              <ScrollArea className="h-[400px] border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Attendance</TableHead>
                      <TableHead>Base Salary</TableHead>
                      <TableHead>Deductions</TableHead>
                      <TableHead>Net Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedEmployeeDetails.map(employee => (
                      <TableRow key={employee.employeeId} className={employee.status === 'HELD' ? 'bg-red-50' : ''}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{employee.employeeName}</p>
                            <p className="text-xs text-muted-foreground">{employee.employeeId} - {employee.designation}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {employee.attendedShifts}/{employee.totalShifts} 
                          <p className="text-xs text-muted-foreground">
                            ({Math.round((employee.attendedShifts / employee.totalShifts) * 100)}%)
                          </p>
                        </TableCell>
                        <TableCell>₹{employee.baseSalary.toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="text-xs space-y-1">
                            {employee.deductions.map((deduction, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span>{deduction.description}:</span>
                                <span>₹{deduction.amount.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">₹{employee.netSalary.toLocaleString()}</TableCell>
                        <TableCell>
                          {employee.status === 'HELD' ? (
                            <div>
                              <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 mb-1">
                                Held
                              </Badge>
                              <p className="text-xs text-red-500">{employee.holdReason}</p>
                            </div>
                          ) : employee.status === 'PAID' ? (
                            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                              Paid
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                              Ready
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              
              <div className="mt-4 flex justify-between items-center p-4 bg-gray-50 rounded">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Employees</p>
                    <p className="text-xl font-bold">{selectedEmployeeDetails.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Held</p>
                    <p className="text-xl font-bold">{selectedEmployeeDetails.filter(emp => emp.status === 'HELD').length}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                  <p className="text-xl font-bold">
                    ₹{selectedEmployeeDetails.reduce((sum, emp) => sum + emp.netSalary, 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="summary">
              <div className="space-y-4 p-4 border rounded">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-medium mb-2 flex items-center gap-2">
                      <Users className="h-4 w-4" /> Department Details
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <p className="text-muted-foreground">Department</p>
                        <p className="font-medium">{selectedRequest?.departmentName}</p>
                      </div>
                      <div className="flex justify-between">
                        <p className="text-muted-foreground">Employee Count</p>
                        <p className="font-medium">{selectedRequest?.employeeCount}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-medium mb-2 flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> Payment Period
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <p className="text-muted-foreground">Month</p>
                        <p className="font-medium">{selectedRequest?.month}</p>
                      </div>
                      <div className="flex justify-between">
                        <p className="text-muted-foreground">Year</p>
                        <p className="font-medium">{selectedRequest?.year}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 border-t">
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> Payment Details
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <p className="text-muted-foreground">Total Amount</p>
                      <p className="font-medium">₹{selectedRequest?.totalAmount.toLocaleString()}</p>
                    </div>
                    <div className="flex justify-between">
                      <p className="text-muted-foreground">Request Date</p>
                      <p className="font-medium">{selectedRequest?.requestDate && new Date(selectedRequest.requestDate).toLocaleDateString()}</p>
                    </div>
                    <div className="flex justify-between">
                      <p className="text-muted-foreground">Status</p>
                      <div>{selectedRequest && getStatusBadge(selectedRequest.status)}</div>
                    </div>
                    {selectedRequest?.paymentReference && (
                      <div className="flex justify-between">
                        <p className="text-muted-foreground">Payment Reference</p>
                        <p className="font-medium">{selectedRequest.paymentReference}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {selectedRequest?.status === "DRAFT" && (
                <div className="mt-4">
                  <Button 
                    onClick={() => {
                      if (selectedRequest) {
                        handleSubmitToAccounts(selectedRequest.id);
                        setIsViewRequestDialogOpen(false);
                      }
                    }} 
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <Send className="h-4 w-4" />
                    Submit to Accounts for Approval
                  </Button>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="timeline">
              <div className="p-4 border rounded h-[400px] overflow-auto">
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <CreditCard className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="flex-1 w-px bg-blue-100"></div>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">Payment Request Created</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedRequest?.requestDate && new Date(selectedRequest.requestDate).toLocaleString()}
                      </p>
                      <p className="text-sm mt-1">
                        Salary payment request for {selectedRequest?.departmentName} department was created.
                      </p>
                    </div>
                  </div>
                  
                  {(selectedRequest?.status === "SENT_TO_ACCOUNTS" || 
                    selectedRequest?.status === "APPROVED_BY_ACCOUNTS" || 
                    selectedRequest?.status === "REJECTED_BY_ACCOUNTS" || 
                    selectedRequest?.status === "COMPLETED") && (
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                          <Send className="h-4 w-4 text-amber-600" />
                        </div>
                        <div className="flex-1 w-px bg-amber-100"></div>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">Sent to Accounts</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(selectedRequest?.requestDate).toLocaleString()}
                        </p>
                        <p className="text-sm mt-1">
                          Payment request was submitted to the accounts department for approval.
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {(selectedRequest?.status === "APPROVED_BY_ACCOUNTS" || 
                    selectedRequest?.status === "COMPLETED") && (
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </div>
                        <div className="flex-1 w-px bg-green-100"></div>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">Approved by Accounts</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date().toLocaleString()}
                        </p>
                        <p className="text-sm mt-1">
                          Payment request was approved by the accounts department.
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {selectedRequest?.status === "REJECTED_BY_ACCOUNTS" && (
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                          <XCircle className="h-4 w-4 text-red-600" />
                        </div>
                        <div className="flex-1 w-px bg-red-100"></div>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">Rejected by Accounts</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date().toLocaleString()}
                        </p>
                        <p className="text-sm mt-1">
                          Payment request was rejected by the accounts department.
                        </p>
                        <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded text-sm">
                          <p className="font-medium mb-1">Rejection Reason:</p>
                          <p>Insufficient documentation provided. Please resubmit with complete employee attendance records.</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {selectedRequest?.status === "COMPLETED" && (
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <CheckCircle className="h-4 w-4 text-blue-600" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">Payment Processed</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date().toLocaleString()}
                        </p>
                        <p className="text-sm mt-1">
                          Salary payment was processed. Reference: {selectedRequest?.paymentReference}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewRequestDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
