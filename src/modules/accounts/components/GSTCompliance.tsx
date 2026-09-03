'use client';

import { useState, useEffect } from "react";
import { GSTComplianceProps } from "./index";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { AccountsService, TaxEntry } from "@/services/accounts/AccountsService";
import { 
  Search, 
  Plus, 
  Download, 
  Filter, 
  FileText,
  AlertTriangle,
  Calendar,
  RefreshCcw
} from "lucide-react";
import { format, addDays } from "date-fns";

export function GSTCompliance({ filter }: GSTComplianceProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("filings");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [gstEntries, setGstEntries] = useState<TaxEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchTaxData = async () => {
      setIsLoading(true);
      try {
        // GST entries loaded from database when available
        const mockGSTEntries: TaxEntry[] = [];
        
        setGstEntries(mockGSTEntries);
      } catch (error) {
        console.error("Error fetching GST data:", error);
        toast({
          title: "Error",
          description: "Failed to fetch GST compliance data. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTaxData();
  }, [toast]);

  const handleOpenForm = () => {
    setShowAddForm(true);
  };

  const handleFormSubmit = async (data: any) => {
    setIsLoading(true);
    try {
      // In a real app, this would call the API service
      const newEntryId = `gst${gstEntries.length + 1}`;
      const newGSTEntry: TaxEntry = {
        id: newEntryId,
        type: "gst",
        period: data.period || "Jun 2023",
        dueDate: data.dueDate || addDays(new Date(), 30).toISOString(),
        amount: data.amount || 0,
        status: "due",
      };
      
      setGstEntries([newGSTEntry, ...gstEntries]);
      
      toast({
        title: "Success",
        description: "GST filing entry has been created successfully.",
      });
      setShowAddForm(false);
    } catch (error) {
      console.error("Error creating GST entry:", error);
      toast({
        title: "Error",
        description: "Failed to create GST entry.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsFiled = (id: string) => {
    const today = new Date().toISOString();
    
    setGstEntries(entries => 
      entries.map(entry => 
        entry.id === id 
          ? { 
              ...entry, 
              status: "filed", 
              filingDate: today, 
              paymentDate: today,
              referenceNumber: `GST${entry.period.replace(' ', '').substr(0, 4)}IN${Math.floor(Math.random() * 90000) + 10000}`
            } 
          : entry
      )
    );
    
    toast({
      title: "Filed Successfully",
      description: "The GST return has been marked as filed and paid.",
    });
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'due':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">Due</Badge>;
      case 'filed':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">Filed</Badge>;
      case 'paid':
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">Paid</Badge>;
      case 'late':
        return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">Late</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const dueGSTEntries = gstEntries.filter(entry => entry.status === "due");
  const filteredGSTEntries = gstEntries.filter(entry => {
    if (filter === "All GST") return true;
    return entry.status.toLowerCase() === filter.toLowerCase();
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold">GST Compliance</h3>
          <p className="text-muted-foreground">
            Manage GST filings, payments, and notices
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="default" className="gap-2" onClick={handleOpenForm}>
            <Plus className="h-4 w-4" />
            New Filing
          </Button>
        </div>
      </div>

      {dueGSTEntries.length > 0 && (
        <Card className="bg-yellow-50 border border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-1" />
              <div>
                <h4 className="font-semibold text-yellow-800">Due Soon</h4>
                <p className="text-yellow-700 text-sm">
                  You have {dueGSTEntries.length} GST {dueGSTEntries.length === 1 ? 'return' : 'returns'} due within the next 30 days.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="p-6 border-b border-gray-200 dark:border-gray-800">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
            <TabsList className="h-9">
              <TabsTrigger value="filings" className="px-3 h-8">Filings</TabsTrigger>
              <TabsTrigger value="reports" className="px-3 h-8">Reports</TabsTrigger>
              <TabsTrigger value="notices" className="px-3 h-8">Notices</TabsTrigger>
              <TabsTrigger value="settings" className="px-3 h-8">Settings</TabsTrigger>
            </TabsList>
          </Tabs>
          
          <div className="flex mt-4 gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input 
                placeholder={`Search ${activeTab}...`}
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <TabsContent value="filings" className="m-0">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <p>Loading...</p>
            </div>
          ) : (
            <div className="p-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Filing Date</TableHead>
                    <TableHead>Reference Number</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGSTEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <p className="text-muted-foreground">No GST filings found</p>
                        <Button 
                          variant="link" 
                          className="mt-2"
                          onClick={handleOpenForm}
                        >
                          Create your first GST filing
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredGSTEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.period}</TableCell>
                        <TableCell>{format(new Date(entry.dueDate), "dd/MM/yyyy")}</TableCell>
                        <TableCell>₹{entry.amount.toLocaleString()}</TableCell>
                        <TableCell>{getStatusBadge(entry.status)}</TableCell>
                        <TableCell>
                          {entry.filingDate ? format(new Date(entry.filingDate), "dd/MM/yyyy") : "-"}
                        </TableCell>
                        <TableCell>{entry.referenceNumber || "-"}</TableCell>
                        <TableCell className="text-right">
                          {entry.status === "due" ? (
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="h-8"
                              onClick={() => handleMarkAsFiled(entry.id)}
                            >
                              Mark as Filed
                            </Button>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-8"
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              View
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports" className="m-0">
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Monthly Summary Report</h3>
                    <Calendar className="h-5 w-5 text-gray-500" />
                  </div>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    Generate monthly GST summary reports
                  </p>
                  <Button variant="outline" className="w-full">Generate Report</Button>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Quarterly Analysis</h3>
                    <Calendar className="h-5 w-5 text-gray-500" />
                  </div>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    Compare GST payments across quarters
                  </p>
                  <Button variant="outline" className="w-full">Generate Report</Button>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Annual GST Return</h3>
                    <Calendar className="h-5 w-5 text-gray-500" />
                  </div>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    Prepare your annual GST return data
                  </p>
                  <Button variant="outline" className="w-full">Generate Report</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notices" className="m-0">
          <div className="p-6">
            <div className="flex flex-col items-center justify-center h-64">
              <FileText className="h-16 w-16 text-gray-300 mb-4" />
              <p className="text-muted-foreground">No GST notices received</p>
              <p className="text-sm text-muted-foreground mt-1">
                Any notices from tax authorities will appear here
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="m-0">
          <div className="p-6">
            <div className="space-y-6 max-w-2xl">
              <div className="space-y-2">
                <Label>GST Registration Number</Label>
                <Input placeholder="Enter GSTIN" defaultValue="27AABCS1429B1ZY" />
              </div>
              
              <div className="space-y-2">
                <Label>Filing Frequency</Label>
                <Select defaultValue="monthly">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Email Notifications</Label>
                <Select defaultValue="enabled">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Receive email notifications for upcoming GST due dates
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>Reminder Days</Label>
                <Input type="number" defaultValue="7" />
                <p className="text-xs text-muted-foreground mt-1">
                  Days before due date to send a reminder
                </p>
              </div>
              
              <Button className="mt-4">Save Settings</Button>
            </div>
          </div>
        </TabsContent>
      </Card>

      {/* Add GST Filing Form Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>New GST Filing</DialogTitle>
            <DialogDescription>
              Add a new GST filing period
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="period">Period</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jun_2023">June 2023</SelectItem>
                  <SelectItem value="jul_2023">July 2023</SelectItem>
                  <SelectItem value="aug_2023">August 2023</SelectItem>
                  <SelectItem value="sep_2023">September 2023</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input type="date" id="dueDate" defaultValue={format(addDays(new Date(), 30), "yyyy-MM-dd")} />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input type="number" id="amount" placeholder="0.00" />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" placeholder="Any additional notes" />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddForm(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={() => handleFormSubmit({})} disabled={isLoading}>
              {isLoading ? "Processing..." : "Add Filing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
