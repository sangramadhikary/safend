'use client';
import { useState } from 'react';
import { useAccountsData } from '@/hooks/accounts/useAccountsData';
import { useAccountsContext } from '@/contexts/AccountsContext';
import { AccountsService, PaymentRequest, Expense } from '@/services/accounts/AccountsService';
import { 
  Table, TableHeader, TableBody, TableHead, 
  TableRow, TableCell 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatIndianCurrency, formatIndianDate } from '@/utils/errorHandler';
import { 
  Search, Plus, Filter, CheckCircle, XCircle, 
  FileText, CreditCard, IndianRupee, Download,
  Mail, MoreHorizontal, Banknote, Loader2, ShoppingCart, Clock,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { listAdvances, type EmployeeAdvance } from '@/services/supabase/EmployeeAdvancesService';
import { useVendorStore } from '@/modules/office-admin/components/vendors/vendorStore';
import { PO_STATUS_LABELS } from '@/modules/office-admin/components/vendors/types';
import { format } from 'date-fns';

export interface AccountsPayableProps {
  filter: string;
}

export function AccountsPayable({ filter }: AccountsPayableProps) {
  const { selectedBranch } = useAccountsContext();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('bills');
  const [searchQuery, setSearchQuery] = useState('');

  // PO approvals — pull POs awaiting accounts action
  const { purchaseOrders, fetchPurchaseOrders, updatePOStatus } = useVendorStore();
  const pendingPOs = purchaseOrders.filter(po => ['submitted', 'pending_approval', 'approved', 'slip_generated'].includes(po.status));
  const [processingPO, setProcessingPO] = useState<string | null>(null);

  const handleApprovePO = async (id: string) => {
    setProcessingPO(id);
    const result = await updatePOStatus(id, 'approved', { approved_by: 'accounts' });
    setProcessingPO(null);
    if (result.success) toast({ title: 'PO Approved', description: 'The purchase order has been approved.' });
    else toast({ title: 'Error', description: result.error, variant: 'destructive' });
  };

  const handleRejectPO = async (id: string) => {
    setProcessingPO(id);
    const result = await updatePOStatus(id, 'rejected', { rejection_reason: 'Rejected by Accounts', approved_by: 'accounts' });
    setProcessingPO(null);
    if (result.success) toast({ title: 'PO Rejected' });
    else toast({ title: 'Error', description: result.error, variant: 'destructive' });
  };

  const handleMarkFunded = async (id: string) => {
    setProcessingPO(id);
    const result = await updatePOStatus(id, 'funded');
    setProcessingPO(null);
    if (result.success) toast({ title: 'Marked as Funded', description: 'Payment has been recorded.' });
    else toast({ title: 'Error', description: result.error, variant: 'destructive' });
  };

  // Fetch expenses data
  const { 
    data: expenses, 
    isLoading: isLoadingExpenses,
    refetch: refetchExpenses
  } = useAccountsData(
    () => AccountsService.getExpenses({ 
      branchId: selectedBranch || undefined,
      status: filter.toLowerCase()
    }),
    [selectedBranch, filter],
    [],
    "Failed to load expenses data"
  );
  
  // Fetch payment requests
  const {
    data: paymentRequests,
    isLoading: isLoadingPaymentRequests,
    refetch: refetchPaymentRequests
  } = useAccountsData(
    () => AccountsService.getPaymentRequests(),
    [selectedBranch],
    [],
    "Failed to load payment requests"
  );

  // Fetch approved salary advances (status = 'active', advance_type = 'SALARY_ADVANCE')
  const {
    data: salaryAdvances = [],
    isLoading: isLoadingSalaryAdvances,
  } = useQuery({
    queryKey: ['salary-advances-payable'],
    queryFn: () => listAdvances({ status: 'active', type: 'SALARY_ADVANCE' }),
  });
  
  // Handle creating a new expense
  const handleCreateExpense = async (data: Omit<Expense, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => {
    try {
      await AccountsService.createExpense(data);
      refetchExpenses();
      toast({ title: "Success", description: "Expense created successfully" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to create expense", variant: "destructive" });
    }
  };
  
  // Handle creating a payment request - fixed to include requestedDate
  const handleCreatePaymentRequest = async (data: Omit<PaymentRequest, 'id' | 'status' | 'approvedBy' | 'approvedDate' | 'paidDate'>) => {
    try {
      // Add the current date as requestedDate
      const requestData = {
        ...data,
        requestedDate: new Date().toISOString()
      };
      await AccountsService.createPaymentRequest(requestData);
      refetchPaymentRequests();
      toast({ title: "Success", description: "Payment request created successfully" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to create payment request", variant: "destructive" });
    }
  };
  
  // Approve a payment request
  const handleApproveRequest = async (requestId: string) => {
    try {
      await AccountsService.updatePaymentRequestStatus(requestId, "approved");
      refetchPaymentRequests();
      toast({ title: "Success", description: "Payment request approved" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to approve payment request", variant: "destructive" });
    }
  };
  
  // Reject a payment request
  const handleRejectRequest = async (requestId: string) => {
    try {
      await AccountsService.updatePaymentRequestStatus(requestId, "rejected");
      refetchPaymentRequests();
      toast({ title: "Success", description: "Payment request rejected" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to reject payment request", variant: "destructive" });
    }
  };
  
  // Mark a payment request as paid
  const handleMarkAsPaid = async (requestId: string) => {
    try {
      await AccountsService.updatePaymentRequestStatus(requestId, "paid");
      refetchPaymentRequests();
      toast({ title: "Success", description: "Payment request marked as paid" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to update payment request", variant: "destructive" });
    }
  };
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    refetchExpenses();
    refetchPaymentRequests();
  };
  
  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    let variant: "outline" | "secondary" | "destructive" | "default" = "outline-solid";
    
    switch(status) {
      case 'pending': variant = "outline"; break;
      case 'approved': variant = "secondary"; break;
      case 'paid': variant = "default"; break;
      case 'rejected': variant = "destructive"; break;
      case 'completed': variant = "default"; break;
    }
    
    return (
      <Badge variant={variant} className="capitalize">
        {status}
      </Badge>
    );
  };

  // Render payment requests table
  const renderPaymentRequests = () => {
    if (isLoadingPaymentRequests) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="h-24 text-center">
            Loading payment requests...
          </TableCell>
        </TableRow>
      );
    }
    
    if (!paymentRequests || paymentRequests.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="h-24 text-center">
            No payment requests found.
          </TableCell>
        </TableRow>
      );
    }
    
    return paymentRequests.map((request) => (
      <TableRow key={request.id}>
        <TableCell className="font-medium">
          <div className="flex items-center">
            <FileText className="h-4 w-4 mr-2 text-blue-500" />
            <span>{request.purpose}</span>
          </div>
        </TableCell>
        <TableCell>{formatIndianCurrency(request.amount)}</TableCell>
        <TableCell>
          <StatusBadge status={request.status} />
        </TableCell>
        <TableCell className="text-right">
          {request.status === 'pending' && (
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleApproveRequest(request.id)}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="text-red-500 border-red-200 hover:bg-red-50"
                onClick={() => handleRejectRequest(request.id)}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
            </div>
          )}
          {request.status === 'approved' && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleMarkAsPaid(request.id)}
            >
              <IndianRupee className="h-4 w-4 mr-1" />
              Mark as Paid
            </Button>
          )}
          {(request.status === 'paid' || request.status === 'rejected') && (
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          )}
        </TableCell>
      </TableRow>
    ));
  };
  
  // Render expenses table
  const renderExpenses = () => {
    if (isLoadingExpenses) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="h-24 text-center">
            Loading expenses data...
          </TableCell>
        </TableRow>
      );
    }
    
    if (!expenses || expenses.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="h-24 text-center">
            No expenses found for the selected filter.
          </TableCell>
        </TableRow>
      );
    }
    
    return expenses.map((expense) => (
      <TableRow key={expense.id}>
        <TableCell className="font-medium">
          <div className="flex items-center">
            <CreditCard className="h-4 w-4 mr-2 text-blue-500" />
            <span>{expense.description}</span>
          </div>
        </TableCell>
        <TableCell>{expense.employeeName || 'N/A'}</TableCell>
        <TableCell>{expense.branchName || selectedBranch}</TableCell>
        <TableCell>{expense.category}</TableCell>
        <TableCell>{formatIndianDate(expense.date)}</TableCell>
        <TableCell>{formatIndianCurrency(expense.amount)}</TableCell>
        <TableCell>
          <StatusBadge status={expense.status} />
        </TableCell>
        <TableCell className="text-right">
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
    ));
  };
  
  // Render payment requests table for approval tab
  const renderPaymentRequestsForApproval = () => {
    const pendingRequests = paymentRequests?.filter(req => req.status === 'pending') || [];
    
    if (isLoadingPaymentRequests) {
      return (
        <TableRow>
          <TableCell colSpan={6} className="h-24 text-center">
            Loading payment requests...
          </TableCell>
        </TableRow>
      );
    }
    
    if (pendingRequests.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={6} className="h-24 text-center">
            No pending payment requests found.
          </TableCell>
        </TableRow>
      );
    }
    
    return pendingRequests.map((request) => (
      <TableRow key={request.id}>
        <TableCell className="font-medium">PR-{request.id.substring(0, 6)}</TableCell>
        <TableCell>{request.department || 'N/A'}</TableCell>
        <TableCell>{request.purpose || 'N/A'}</TableCell>
        <TableCell>{formatIndianCurrency(request.amount)}</TableCell>
        <TableCell>{request.requestedDate ? formatIndianDate(request.requestedDate) : 'N/A'}</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleApproveRequest(request.id)}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              className="text-red-500 border-red-200 hover:bg-red-50"
              onClick={() => handleRejectRequest(request.id)}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
          </div>
        </TableCell>
      </TableRow>
    ));
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Accounts Payable</h2>
          <p className="text-muted-foreground">
            Manage expenses, bills, and payment requests
          </p>
        </div>
      </div>
      
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <Input
            placeholder="Search payables..."
            className="max-w-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button type="submit" variant="default">
            <Search className="h-4 w-4 mr-2" />
            Search
          </Button>
        </form>
        
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Expense
          </Button>
        </div>
      </div>
      
      <Tabs defaultValue="bills" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="bills">Bills & Expenses</TabsTrigger>
          <TabsTrigger value="requests">Payment Requests</TabsTrigger>
          <TabsTrigger value="salary-advances">Salary Advances</TabsTrigger>
          <TabsTrigger value="approval">For Approval</TabsTrigger>
          <TabsTrigger value="po-approvals" className="flex items-center gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5" />
            PO Approvals
            {pendingPOs.filter(p => ['submitted','pending_approval'].includes(p.status)).length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                {pendingPOs.filter(p => ['submitted','pending_approval'].includes(p.status)).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled Payments</TabsTrigger>
        </TabsList>
        
        <TabsContent value="bills" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-md font-medium">Expenses & Bills</CardTitle>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renderExpenses()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="requests" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-md font-medium">Payment Requests</CardTitle>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Request
              </Button>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renderPaymentRequests()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="salary-advances" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-md font-medium">Salary Advances — Pending Disbursement</CardTitle>
              <Badge variant="outline" className="text-xs">
                {salaryAdvances.length} advance{salaryAdvances.length !== 1 ? 's' : ''}
              </Badge>
            </CardHeader>
            <CardContent className="px-0">
              {isLoadingSalaryAdvances ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : salaryAdvances.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="rounded-full bg-muted p-3 mb-3">
                    <Banknote className="h-6 w-6 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium mb-1">No pending salary advances</h3>
                  <p className="text-muted-foreground text-sm max-w-sm">
                    Approved salary advance requests awaiting disbursement will appear here
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Amount (Principal)</TableHead>
                      <TableHead>Approval Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salaryAdvances.map((advance) => (
                      <TableRow key={advance.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center">
                            <Banknote className="h-4 w-4 mr-2 text-green-600" />
                            <div>
                              <span>{advance.employee_name || 'N/A'}</span>
                              {advance.employee_code && (
                                <p className="text-xs text-muted-foreground">{advance.employee_code}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{formatIndianCurrency(advance.principal)}</TableCell>
                        <TableCell>
                          {advance.approved_at
                            ? formatIndianDate(advance.approved_at)
                            : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            Approved — Disburse
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="approval" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-md font-medium">Pending Approval</CardTitle>
              <Button variant="outline" size="sm">
                <Mail className="h-4 w-4 mr-2" />
                Send Reminders
              </Button>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request #</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renderPaymentRequestsForApproval()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="po-approvals" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-md font-medium">Purchase Order Approvals & Payment</CardTitle>
              <Badge variant="outline">{pendingPOs.length} active</Badge>
            </CardHeader>
            <CardContent className="px-0">
              {pendingPOs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="rounded-full bg-muted p-3 mb-3"><ShoppingCart className="h-6 w-6 text-muted-foreground" /></div>
                  <h3 className="text-lg font-medium mb-1">No pending POs</h3>
                  <p className="text-muted-foreground text-sm">Purchase orders submitted for approval will appear here.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Grand Total</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingPOs.map(po => (
                      <TableRow key={po.id}>
                        <TableCell className="font-mono text-xs font-medium">{po.po_number}</TableCell>
                        <TableCell className="text-sm">{po.vendor_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{po.items?.length ?? 0} items</TableCell>
                        <TableCell className="text-right font-semibold">₹{po.grand_total.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{po.priority}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1 text-xs font-medium">
                            <Clock className="h-3 w-3 text-amber-500" />
                            {PO_STATUS_LABELS[po.status]}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {po.submitted_at ? format(new Date(po.submitted_at), 'dd MMM yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {['submitted', 'pending_approval'].includes(po.status) && (
                              <>
                                <Button size="sm" variant="outline" disabled={processingPO === po.id}
                                  onClick={() => handleApprovePO(po.id)}>
                                  <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                                </Button>
                                <Button size="sm" variant="outline"
                                  className="text-red-600 border-red-200 hover:bg-red-50"
                                  disabled={processingPO === po.id}
                                  onClick={() => handleRejectPO(po.id)}>
                                  <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                                </Button>
                              </>
                            )}
                            {po.status === 'approved' && (
                              <Button size="sm" variant="outline" disabled={processingPO === po.id}
                                onClick={() => handleMarkFunded(po.id)}>
                                <Banknote className="h-3.5 w-3.5 mr-1" /> Mark Paid
                              </Button>
                            )}
                            {po.status === 'slip_generated' && (
                              <Button size="sm" variant="outline" disabled={processingPO === po.id}
                                onClick={() => handleMarkFunded(po.id)}>
                                <Banknote className="h-3.5 w-3.5 mr-1" /> Confirm Payment
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scheduled" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-md font-medium">Scheduled Payments</CardTitle>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Schedule Payment
              </Button>
            </CardHeader>
            <CardContent className="px-0 py-6">
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="rounded-full bg-muted p-3 mb-3">
                  <IndianRupee className="h-6 w-6 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium mb-1">No scheduled payments</h3>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Schedule recurring payments or future dated transactions to appear here
                </p>
                <Button className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Schedule
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
