'use client';
import { useState } from 'react';
import { useAccountsData } from '@/hooks/accounts/useAccountsData';
import { useAccountsContext } from '@/contexts/AccountsContext';
import { 
  AccountsService, 
  Invoice,
  Payment,
  OtherIncome 
} from '@/services/accounts/AccountsService';
import { 
  Table, TableHeader, TableBody, TableHead, 
  TableRow, TableCell 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { formatIndianCurrency, formatIndianDate } from '@/utils/errorHandler';
import { 
  Search, Plus, Filter, CheckCircle, Download, 
  FileText, Mail, Receipt, IndianRupee, MoreHorizontal
} from 'lucide-react';

export interface BillingReceivablesProps {
  filter: string;
}

export function BillingReceivables({ filter }: BillingReceivablesProps) {
  const { selectedBranch } = useAccountsContext();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('invoices');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Fetch invoices data
  const { 
    data: invoices, 
    isLoading: isLoadingInvoices,
    refetch: refetchInvoices
  } = useAccountsData(
    () => AccountsService.getInvoices({ 
      branchId: selectedBranch || undefined,
      status: filter.toLowerCase()
    }),
    [selectedBranch, filter],
    [],
    "Failed to load invoices data"
  );
  
  // Fetch payments data
  const {
    data: payments,
    isLoading: isLoadingPayments,
    refetch: refetchPayments
  } = useAccountsData(
    () => AccountsService.getPayments({ 
      branchId: selectedBranch || undefined
    }),
    [selectedBranch],
    [],
    "Failed to load payments data"
  );
  
  // Fetch other income data
  const {
    data: otherIncome,
    isLoading: isLoadingOtherIncome,
    refetch: refetchOtherIncome
  } = useAccountsData(
    () => AccountsService.getOtherIncome({ 
      branchId: selectedBranch || undefined
    }),
    [selectedBranch],
    [],
    "Failed to load other income data"
  );
  
  // Handle creating a new invoice
  const handleCreateInvoice = async (data: Omit<Invoice, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => {
    try {
      await AccountsService.createInvoice(data);
      refetchInvoices();
      toast({ title: "Success", description: "Invoice created successfully" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to create invoice", variant: "destructive" });
    }
  };
  
  // Handle creating a new other income entry
  const handleCreateOtherIncome = async (data: Omit<OtherIncome, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => {
    try {
      await AccountsService.createOtherIncome(data);
      refetchOtherIncome();
      toast({ title: "Success", description: "Income entry created successfully" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to create income entry", variant: "destructive" });
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    refetchInvoices();
    refetchPayments();
    refetchOtherIncome();
  };
  
  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    let variant: "outline" | "secondary" | "destructive" | "default" = "outline";
    
    switch(status) {
      case 'draft': variant = "outline"; break;
      case 'sent': variant = "secondary"; break;
      case 'overdue': variant = "destructive"; break;
      case 'partially_paid': variant = "secondary"; break;
      case 'paid': variant = "default"; break;
      case 'cancelled': variant = "destructive"; break;
    }
    
    return (
      <Badge variant={variant} className="capitalize">
        {status.replace('_', ' ')}
      </Badge>
    );
  };
  
  // Render invoices table
  const renderInvoices = () => {
    if (isLoadingInvoices) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="h-24 text-center">
            Loading invoices data...
          </TableCell>
        </TableRow>
      );
    }
    
    if (!invoices || invoices.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="h-24 text-center">
            No invoices found for the selected filter.
          </TableCell>
        </TableRow>
      );
    }
    
    return invoices.map((invoice) => (
      <TableRow key={invoice.id}>
        <TableCell className="font-medium">
          <div className="flex items-center">
            <Receipt className="h-4 w-4 mr-2 text-blue-500" />
            <span>{invoice.invoiceNumber}</span>
          </div>
        </TableCell>
        <TableCell>{invoice.clientName}</TableCell>
        <TableCell>{formatIndianDate(invoice.issueDate)}</TableCell>
        <TableCell>{formatIndianCurrency(invoice.totalAmount)}</TableCell>
        <TableCell>
          <StatusBadge status={invoice.status} />
        </TableCell>
        <TableCell className="text-right">
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
    ));
  };
  
  // Render payments table
  const renderPayments = () => {
    if (isLoadingPayments) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="h-24 text-center">
            Loading payments data...
          </TableCell>
        </TableRow>
      );
    }
    
    if (!payments || payments.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="h-24 text-center">
            No payments found.
          </TableCell>
        </TableRow>
      );
    }
    
    return payments.map((payment) => (
      <TableRow key={payment.id}>
        <TableCell className="font-medium">
          <div className="flex items-center">
            <IndianRupee className="h-4 w-4 mr-2 text-green-500" />
            <span>{payment.description}</span>
          </div>
        </TableCell>
        <TableCell>{formatIndianCurrency(payment.amount)}</TableCell>
        <TableCell>{formatIndianDate(payment.paymentDate)}</TableCell>
        <TableCell>{payment.paymentMethod}</TableCell>
        <TableCell>{payment.referenceNumber}</TableCell>
        <TableCell className="text-right">
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
    ));
  };
  
  // Render other income table
  const renderOtherIncome = () => {
    if (isLoadingOtherIncome) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="h-24 text-center">
            Loading other income data...
          </TableCell>
        </TableRow>
      );
    }
    
    if (!otherIncome || otherIncome.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={7} className="h-24 text-center">
            No other income entries found.
          </TableCell>
        </TableRow>
      );
    }
    
    return otherIncome.map((income) => (
      <TableRow key={income.id}>
        <TableCell className="font-medium">
          <div className="flex items-center">
            <FileText className="h-4 w-4 mr-2 text-orange-500" />
            <span>{income.description}</span>
          </div>
        </TableCell>
        <TableCell>{income.source}</TableCell>
        <TableCell>{income.category}</TableCell>
        <TableCell>{formatIndianCurrency(income.amount)}</TableCell>
        <TableCell>{formatIndianDate(income.date)}</TableCell>
        <TableCell className="text-right">
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
    ));
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Billing & Receivables</h2>
          <p className="text-muted-foreground">
            Manage invoices, payments, and other income
          </p>
        </div>
      </div>
      
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <Input
            placeholder="Search invoices..."
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
            New Invoice
          </Button>
        </div>
      </div>
      
      <Tabs defaultValue="invoices" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="income">Other Income</TabsTrigger>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
        </TabsList>
        
        <TabsContent value="invoices" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-md font-medium">Invoices</CardTitle>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renderInvoices()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="payments" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-md font-medium">Payments</CardTitle>
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
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renderPayments()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="income" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-md font-medium">Other Income</CardTitle>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Entry
              </Button>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {renderOtherIncome()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="refunds" className="space-y-4 mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-md font-medium">Refunds</CardTitle>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Refund
              </Button>
            </CardHeader>
            <CardContent className="px-0 py-6">
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="rounded-full bg-muted p-3 mb-3">
                  <IndianRupee className="h-6 w-6 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium mb-1">No refunds recorded</h3>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Record customer refunds or reimbursements here
                </p>
                <Button className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Refund
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
