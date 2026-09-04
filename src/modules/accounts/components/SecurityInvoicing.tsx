'use client';
import { useState } from 'react';
import { useAccountsData } from '@/hooks/accounts/useAccountsData';
import { useAccountsContext } from '@/contexts/AccountsContext';
import { 
  SecurityInvoice, 
  getSecurityInvoices,
  sendSecurityInvoice,
  recordPaymentForInvoice
} from '@/services/security/SecurityInvoiceService';
import { 
  Table, TableHeader, TableBody, TableHead, 
  TableRow, TableCell 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Search, Filter, Plus, Mail, IndianRupee, Calendar, 
  MoreHorizontal, Send, Download, FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

export function SecurityInvoicing() {
  const { selectedBranch } = useAccountsContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch invoices data
  const { 
    data: invoices, 
    isLoading, 
    refetch 
  } = useAccountsData(
    () => getSecurityInvoices(),
    [selectedBranch],
    [],
    "Failed to load security invoices data"
  );
  
  // Get selected invoice details
  const selectedInvoice = invoices?.find(invoice => invoice.id === selectedInvoiceId) || null;
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    refetch();
  };
  
  const handleSendInvoice = async (invoiceId: string) => {
    try {
      const result = await sendSecurityInvoice(invoiceId);
      
      if (result) {
        toast({
          title: "Invoice Sent",
          description: `Invoice ${result.invoiceNumber} has been sent to ${result.clientName}`,
        });
        refetch();
      } else {
        toast({
          title: "Error",
          description: "Failed to send invoice. It may already be sent or cancelled.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred while sending the invoice.",
        variant: "destructive",
      });
    }
  };
  
  const handleRecordPayment = async (invoiceId: string, amount: number) => {
    try {
      const result = await recordPaymentForInvoice(invoiceId, {
        amount,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'bank_transfer',
      });
      
      if (result) {
        toast({
          title: "Payment Recorded",
          description: `Payment of ₹${amount.toLocaleString()} recorded for invoice ${result.invoiceNumber}`,
        });
        refetch();
      } else {
        toast({
          title: "Error",
          description: "Failed to record payment. The invoice may not exist or is cancelled.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred while recording the payment.",
        variant: "destructive",
      });
    }
  };

  const renderInvoiceList = () => {
    if (isLoading) {
      return (
        <TableRow>
          <TableCell colSpan={6} className="h-24 text-center">
            Loading security invoices...
          </TableCell>
        </TableRow>
      );
    }
    
    if (!invoices || invoices.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={6} className="h-24 text-center">
            No security invoices found.
          </TableCell>
        </TableRow>
      );
    }
    
    return invoices.map((invoice) => (
      <TableRow 
        key={invoice.id}
        className={`cursor-pointer hover:bg-muted/50 ${selectedInvoiceId === invoice.id ? 'bg-muted' : ''}`}
        onClick={() => setSelectedInvoiceId(invoice.id)}
      >
        <TableCell className="font-medium">
          {invoice.invoiceNumber}
        </TableCell>
        <TableCell>{invoice.clientName}</TableCell>
        <TableCell>{format(new Date(invoice.issueDate), "dd/MM/yyyy")}</TableCell>
        <TableCell>₹{invoice.totalAmount.toLocaleString()}</TableCell>
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
  
  const renderInvoiceDetails = () => {
    if (!selectedInvoice) {
      return (
        <div className="flex flex-col items-center justify-center py-10">
          <FileText className="h-12 w-12 text-gray-400 mb-2" />
          <h3 className="text-lg font-medium">No Invoice Selected</h3>
          <p className="text-sm text-muted-foreground">Select an invoice to view details</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-medium">{selectedInvoice.invoiceNumber}</h3>
            <p className="text-sm text-muted-foreground">
              {selectedInvoice.month} {selectedInvoice.year}
            </p>
          </div>
          <StatusBadge status={selectedInvoice.status} />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium">Client</p>
            <p>{selectedInvoice.clientName}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Amount</p>
            <p>₹{selectedInvoice.totalAmount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Issue Date</p>
            <p>{format(new Date(selectedInvoice.issueDate), "dd/MM/yyyy")}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Due Date</p>
            <p>{format(new Date(selectedInvoice.dueDate), "dd/MM/yyyy")}</p>
          </div>
          <div>
            <p className="text-sm font-medium">GST</p>
            <p>{selectedInvoice.gstApplicable ? 
                `₹${selectedInvoice.gstAmount?.toLocaleString()} (${selectedInvoice.gstPercentage}%)` : 
                'Not Applicable'}</p>
          </div>
          <div>
            <p className="text-sm font-medium">E-Invoice</p>
            <p>{selectedInvoice.eInvoiceApplicable ? 
                (selectedInvoice.eInvoiceRef || 'Not Generated') : 
                'Not Applicable'}</p>
          </div>
        </div>
        
        <div>
          <p className="text-sm font-medium mb-2">Invoice Items</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Post</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedInvoice.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.postName}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">₹{item.unitPrice.toLocaleString()}</TableCell>
                  <TableCell className="text-right">₹{item.amount.toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {selectedInvoice.gstApplicable && selectedInvoice.gstAmount && (
                <TableRow>
                  <TableCell colSpan={3}></TableCell>
                  <TableCell className="text-right font-medium">GST ({selectedInvoice.gstPercentage}%)</TableCell>
                  <TableCell className="text-right">₹{selectedInvoice.gstAmount.toLocaleString()}</TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell colSpan={3}></TableCell>
                <TableCell className="text-right font-medium">Total</TableCell>
                <TableCell className="text-right font-bold">₹{selectedInvoice.totalAmount.toLocaleString()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        
        <div className="pt-4 flex flex-wrap gap-2">
          {selectedInvoice.status === 'draft' && (
            <Button onClick={() => handleSendInvoice(selectedInvoice.id)}>
              <Send className="h-4 w-4 mr-2" />
              Send Invoice
            </Button>
          )}
          
          {(selectedInvoice.status === 'sent' || selectedInvoice.status === 'overdue' || selectedInvoice.status === 'partial') && (
            <Button onClick={() => handleRecordPayment(selectedInvoice.id, selectedInvoice.totalAmount - (selectedInvoice.paidAmount || 0))}>
              <IndianRupee className="h-4 w-4 mr-2" />
              {selectedInvoice.paidAmount ? 'Record Remaining Payment' : 'Record Full Payment'}
            </Button>
          )}
          
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          
          {selectedInvoice.eInvoiceApplicable && !selectedInvoice.eInvoiceRef && (
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Generate E-Invoice
            </Button>
          )}
          
          {selectedInvoice.status === 'sent' && new Date(selectedInvoice.dueDate) < new Date() && (
            <Button variant="outline">
              <Mail className="h-4 w-4 mr-2" />
              Send Reminder
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Security Invoicing</h2>
        <p className="text-muted-foreground">
          Manage security service invoices including guard services, patrol, and special duties
        </p>
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
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Invoice
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-lg">Security Invoices</CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renderInvoiceList()}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="border-t px-6 py-4 flex justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {invoices?.length || 0} invoices
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled>Previous</Button>
              <Button variant="outline" size="sm" disabled>Next</Button>
            </div>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader className="px-6 py-4">
            <CardTitle className="text-lg">Invoice Details</CardTitle>
          </CardHeader>
          <CardContent>
            {renderInvoiceDetails()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  let variant: "outline" | "secondary" | "destructive" | "default" = "outline";
  
  switch(status) {
    case 'draft': variant = "outline"; break;
    case 'sent': variant = "secondary"; break;
    case 'partial': variant = "secondary"; break;
    case 'overdue': variant = "destructive"; break;
    case 'paid': variant = "default"; break;
    case 'cancelled': variant = "destructive"; break;
  }
  
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  );
};
