'use client';
import { useState, useEffect } from "react";
import { TDSComplianceProps } from "./index";
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
  Calendar
} from "lucide-react";
import { format, addDays } from "date-fns";

export function TDSCompliance({ filter }: TDSComplianceProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("deductions");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [tdsEntries, setTdsEntries] = useState<TaxEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchTaxData = async () => {
      setIsLoading(true);
      try {
        // TDS entries loaded from database when available
        const mockTDSEntries: TaxEntry[] = [];
        
        setTdsEntries(mockTDSEntries);
      } catch (error) {
        console.error("Error fetching TDS data:", error);
        toast({
          title: "Error",
          description: "Failed to fetch TDS compliance data. Please try again later.",
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
      const newEntryId = `tds${tdsEntries.length + 1}`;
      const newTDSEntry: TaxEntry = {
        id: newEntryId,
        type: "tds",
        period: data.period || "Jun 2023",
        dueDate: data.dueDate || addDays(new Date(), 30).toISOString(),
        amount: data.amount || 0,
        status: "due",
      };
      
      setTdsEntries([newTDSEntry, ...tdsEntries]);
      
      toast({
        title: "Success",
        description: "TDS deduction entry has been created successfully.",
      });
      setShowAddForm(false);
    } catch (error) {
      console.error("Error creating TDS entry:", error);
      toast({
        title: "Error",
        description: "Failed to create TDS entry.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAsPaid = (id: string) => {
    const today = new Date().toISOString();
    
    setTdsEntries(entries => 
      entries.map(entry => 
        entry.id === id 
          ? { 
              ...entry, 
              status: "paid", 
              filingDate: today, 
              paymentDate: today,
              referenceNumber: `TDS${entry.period.replace(' ', '').substr(0, 4)}IN${Math.floor(Math.random() * 90000) + 10000}`
            } 
          : entry
      )
    );
    
    toast({
      title: "Paid Successfully",
      description: "The TDS deduction has been marked as paid.",
    });
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'due':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">Due</Badge>;
      case 'deducted':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">Deducted</Badge>;
      case 'filed':
        return <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">Filed</Badge>;
      case 'paid':
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">Paid</Badge>;
      case 'late':
        return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">Late</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const dueTDSEntries = tdsEntries.filter(entry => entry.status === "due");
  const filteredTDSEntries = tdsEntries.filter(entry => {
    if (filter === "All TDS") return true;
    return entry.status.toLowerCase() === filter.toLowerCase();
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold">TDS Compliance</h3>
          <p className="text-muted-foreground">
            Manage TDS deductions, payments, and certificates
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="default" className="gap-2" onClick={handleOpenForm}>
            <Plus className="h-4 w-4" />
            New Deduction
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardContent className="p-0">
              <h3 className="text-lg font-semibold">Current Quarter</h3>
              <p className="text-xs text-muted-foreground">Apr-Jun 2023</p>
              <p className="text-2xl font-bold mt-2">₹77,000</p>
              <p className="text-sm text-muted-foreground">Total TDS for Q1</p>
            </CardContent>
          </CardHeader>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardContent className="p-0">
              <h3 className="text-lg font-semibold">Due This Month</h3>
              <p className="text-2xl font-bold mt-2">₹42,000</p>
              <p className="text-sm text-muted-foreground">To be paid by 7th</p>
            </CardContent>
          </CardHeader>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardContent className="p-0">
              <h3 className="text-lg font-semibold">Form 16A</h3>
              <p className="text-2xl font-bold mt-2">12</p>
              <p className="text-sm text-muted-foreground">Certificates pending</p>
            </CardContent>
          </CardHeader>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardContent className="p-0">
              <h3 className="text-lg font-semibold">Quarterly Returns</h3>
              <p className="text-2xl font-bold mt-2">30 Days</p>
              <p className="text-sm text-muted-foreground">Until next due date</p>
            </CardContent>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-6 border-b border-gray-200 dark:border-gray-800">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
            <TabsList className="h-9">
              <TabsTrigger value="deductions" className="px-3 h-8">Deductions</TabsTrigger>
              <TabsTrigger value="certificates" className="px-3 h-8">Certificates</TabsTrigger>
              <TabsTrigger value="returns" className="px-3 h-8">Returns</TabsTrigger>
              <TabsTrigger value="analysis" className="px-3 h-8">Analysis</TabsTrigger>
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
        
        <TabsContent value="deductions" className="m-0">
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
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Challan Number</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTDSEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <p className="text-muted-foreground">No TDS entries found</p>
                        <Button 
                          variant="link" 
                          className="mt-2"
                          onClick={handleOpenForm}
                        >
                          Create your first TDS deduction
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTDSEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.period}</TableCell>
                        <TableCell>{format(new Date(entry.dueDate), "dd/MM/yyyy")}</TableCell>
                        <TableCell>₹{entry.amount.toLocaleString()}</TableCell>
                        <TableCell>{getStatusBadge(entry.status)}</TableCell>
                        <TableCell>
                          {entry.paymentDate ? format(new Date(entry.paymentDate), "dd/MM/yyyy") : "-"}
                        </TableCell>
                        <TableCell>{entry.referenceNumber || "-"}</TableCell>
                        <TableCell className="text-right">
                          {entry.status === "due" ? (
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="h-8"
                              onClick={() => handleMarkAsPaid(entry.id)}
                            >
                              Mark as Paid
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

        <TabsContent value="certificates" className="m-0">
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Q4 (Jan-Mar 2023)</h3>
                    <Calendar className="h-5 w-5 text-gray-500" />
                  </div>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    Generate Form 16A for Q4 FY 2022-23
                  </p>
                  <Button variant="outline" className="w-full">Generate Certificates</Button>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Q1 (Apr-Jun 2023)</h3>
                    <Calendar className="h-5 w-5 text-gray-500" />
                  </div>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    Generate Form 16A for Q1 FY 2023-24
                  </p>
                  <Button variant="outline" className="w-full">Generate Certificates</Button>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">Annual (FY 2022-23)</h3>
                    <Calendar className="h-5 w-5 text-gray-500" />
                  </div>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    Generate annual TDS certificates
                  </p>
                  <Button variant="outline" className="w-full">Generate Certificates</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="returns" className="m-0">
          <div className="p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Form</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Filed On</TableHead>
                  <TableHead>Acknowledgment No.</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Form 26Q</TableCell>
                  <TableCell>Jan-Mar 2023 (Q4)</TableCell>
                  <TableCell>31/05/2023</TableCell>
                  <TableCell>{getStatusBadge("filed")}</TableCell>
                  <TableCell>28/05/2023</TableCell>
                  <TableCell>ABCDE1234F</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      <FileText className="h-4 w-4 mr-2" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Form 26Q</TableCell>
                  <TableCell>Apr-Jun 2023 (Q1)</TableCell>
                  <TableCell>31/07/2023</TableCell>
                  <TableCell>{getStatusBadge("due")}</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">
                      Prepare Return
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="m-0">
          <div className="p-6">
            <div className="flex flex-col items-center justify-center h-64">
              <AlertTriangle className="h-16 w-16 text-gray-300 mb-4" />
              <p className="text-muted-foreground">TDS analysis reports will be available soon</p>
              <Button variant="link">Request early access</Button>
            </div>
          </div>
        </TabsContent>
      </Card>

      {/* Add TDS Deduction Form Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>New TDS Deduction</DialogTitle>
            <DialogDescription>
              Record a new TDS deduction
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="period">Period</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
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
              <Label htmlFor="category">Category</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select TDS category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contractors">Contractors (194C)</SelectItem>
                  <SelectItem value="professional">Professional Fees (194J)</SelectItem>
                  <SelectItem value="rent">Rent (194I)</SelectItem>
                  <SelectItem value="interest">Interest (194A)</SelectItem>
                  <SelectItem value="salaries">Salaries (192)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="amount">TDS Amount (₹)</Label>
              <Input type="number" id="amount" placeholder="0.00" />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input type="date" id="dueDate" defaultValue={format(addDays(new Date(), 30), "yyyy-MM-dd")} />
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
              {isLoading ? "Processing..." : "Add Deduction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
