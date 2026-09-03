'use client';

import { useState, useEffect } from "react";
import { ComplianceDashboardProps, StatutoryCompliance, ComplianceDocument } from "./index";
import { ComplianceService } from "@/services/ComplianceService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Calendar } from "@/components/ui/calendar";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import {
  Calendar as CalendarIcon,
  Download,
  FileText,
  Upload,
  AlertCircle,
  CheckCircle,
  FileUp,
  Clock,
  Filter,
  Loader2,
  Calendar as CalendarIconLucide
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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Compliance data (fetched from Supabase compliance_filings table)
import { supabaseClient } from "@/integrations/supabase/client";
import { getBranchScopeFilter } from "@/utils/branchScope";
import { CountUp } from "@/components/dashboard/CountUp";

export function ComplianceDashboard({ filter, month }: ComplianceDashboardProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedMonth, setSelectedMonth] = useState(month || "2025-05");
  const [complianceData, setComplianceData] = useState<StatutoryCompliance[]>([]);
  const [complianceDocuments, setComplianceDocuments] = useState<ComplianceDocument[]>([]);
  const [isLoadingFilings, setIsLoadingFilings] = useState(true);
  
  const [isGeneratingDocument, setIsGeneratingDocument] = useState<string | null>(null);
  const [isFilingDialogOpen, setIsFilingDialogOpen] = useState(false);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [calendarDialogOpen, setCalendarDialogOpen] = useState(false);
  
  const [selectedCompliance, setSelectedCompliance] = useState<StatutoryCompliance | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>("challan");
  
  const [filingDetails, setFilingDetails] = useState({
    challanNumber: "",
    filingDate: new Date().toISOString().split("T")[0],
  });
  
  const { toast } = useToast();

  // Fetch compliance filings from DB
  const fetchComplianceFilings = async () => {
    setIsLoadingFilings(true);
    try {
      const { data, error } = await supabaseClient
        .from('compliance_filings')
        .select('*')
        .order('due_date', { ascending: false });

      if (error) throw error;

      // Map DB rows to StatutoryCompliance interface
      const mapped: StatutoryCompliance[] = (data || []).map((row: any) => ({
        id: row.id,
        name: `${row.category} - ${row.sub_type}`,
        category: row.category,
        type: row.sub_type,
        frequency: 'monthly',
        month: row.period,
        dueDate: row.due_date || '',
        amount: Number(row.amount),
        status: row.status === 'paid' || row.status === 'filed' ? 'filed' : row.status === 'overdue' ? 'overdue' : 'pending',
        filingDate: row.filing_date || undefined,
        challanNumber: row.reference_number || undefined,
        notes: row.notes || undefined,
      }));

      setComplianceData(mapped);
    } catch (err) {
      console.error('Error fetching compliance filings:', err);
    } finally {
      setIsLoadingFilings(false);
    }
  };

  useEffect(() => {
    fetchComplianceFilings();
  }, []);
  
  // Filter compliance data based on filter prop and selected month
  const filteredCompliance = filter === "All Compliance" 
    ? complianceData.filter(item => item.month === selectedMonth || item.month === `${selectedMonth.slice(0, 4)}-Q${Math.ceil(parseInt(selectedMonth.slice(5)) / 3)}`)
    : complianceData.filter(item => {
        const matchesFilter = 
          (filter === "Due" && item.status === "pending") ||
          (filter === "Completed" && item.status === "filed") ||
          (filter === "Overdue" && item.status === "overdue");
        
        return matchesFilter && (
          item.month === selectedMonth || 
          item.month === `${selectedMonth.slice(0, 4)}-Q${Math.ceil(parseInt(selectedMonth.slice(5)) / 3)}`
        );
      });
  
  const generateDocument = async (complianceType: 'pf' | 'esic' | 'pt' | 'tds', month: string) => {
    setIsGeneratingDocument(complianceType);
    
    try {
      // In a real app, this would call the API to generate the document
      const result = await ComplianceService.generateComplianceDocument(
        complianceType, 
        month,
        [] // This would be actual salary data from state or API
      );
      
      if (result.success) {
        // Update compliance status to 'generated'
        setComplianceData(prevData => 
          prevData.map(item => {
            if (item.type === complianceType && item.month === month) {
              return { ...item, status: 'generated' as any, documentUrl: result.documentUrl };
            }
            return item;
          })
        );
        
        // Add new document to documents list
        const newDocument: ComplianceDocument = {
          id: `DOC${Math.floor(Math.random() * 10000)}`,
          complianceId: `${complianceType.toUpperCase()}-${month}`,
          type: complianceType === 'pf' ? 'ecr' : 'return',
          fileName: `${complianceType.toUpperCase()}-${month}.${complianceType === 'pf' ? 'xlsx' : 'xml'}`,
          fileUrl: result.documentUrl || '',
          uploadedBy: 'Current User',
          uploadedAt: new Date().toISOString(),
          status: 'pending'
        };
        
        setComplianceDocuments(prev => [...prev, newDocument]);
        
        toast({
          title: `${complianceType.toUpperCase()} Document Generated`,
          description: result.message,
        });
      } else {
        toast({
          title: "Document Generation Failed",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Document generation error:", error);
      toast({
        title: "Error",
        description: "There was an error generating the document",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingDocument(null);
    }
  };
  
  const handleFilingDialog = (compliance: StatutoryCompliance) => {
    setSelectedCompliance(compliance);
    setIsFilingDialogOpen(true);
    
    // Pre-fill with today's date
    setFilingDetails({
      challanNumber: "",
      filingDate: new Date().toISOString().split("T")[0]
    });
  };
  
  const handleFileCompliance = () => {
    if (!selectedCompliance || !filingDetails.challanNumber) {
      toast({
        title: "Error",
        description: "Please enter a challan number",
        variant: "destructive",
      });
      return;
    }
    
    // Update compliance status to 'filed'
    const updatedComplianceData = ComplianceService.updateComplianceStatus(
      selectedCompliance.id,
      complianceData,
      'filed',
      {
        challanNumber: filingDetails.challanNumber,
        filingDate: filingDetails.filingDate,
        filedBy: "Current User"
      }
    );
    
    setComplianceData(updatedComplianceData);
    
    toast({
      title: "Compliance Filed",
      description: `${selectedCompliance.type.toUpperCase()} for ${selectedCompliance.month} has been marked as filed`,
    });
    
    setIsFilingDialogOpen(false);
    setFilingDetails({
      challanNumber: "",
      filingDate: new Date().toISOString().split("T")[0],
    });
  };
  
  const handleShowDocuments = (compliance: StatutoryCompliance) => {
    setSelectedCompliance(compliance);
    setDocumentDialogOpen(true);
  };
  
  const getComplianceProgress = () => {
    const totalCompliance = filteredCompliance.length;
    if (totalCompliance === 0) return 0;
    
    const completedCompliance = filteredCompliance.filter(
      item => item.status === 'filed' || item.status === 'verified'
    ).length;
    
    return Math.round((completedCompliance / totalCompliance) * 100);
  };
  
  const getTypeLabel = (type: string) => {
    switch (type) {
      case "pf": return "Provident Fund";
      case "esic": return "ESIC";
      case "pt": return "Professional Tax";
      case "tds": return "TDS";
      case "bonus": return "Bonus";
      case "gratuity": return "Gratuity";
      default: return type.toUpperCase();
    }
  };
  
  const getStatusBadge = (status: string, dueDate: string) => {
    const isOverdue = new Date(dueDate) < new Date() && status === "pending";
    
    if (status === "filed" || status === "verified") {
      return <Badge className="bg-green-500 hover:bg-green-600">Filed</Badge>;
    } else if (status === "generated") {
      return <Badge className="bg-blue-500 hover:bg-blue-600">Generated</Badge>;
    } else if (status === "overdue" || isOverdue) {
      return <Badge variant="destructive">Overdue</Badge>;
    } else {
      return <Badge variant="outline" className="bg-amber-100 text-amber-800 hover:bg-amber-200">Pending</Badge>;
    }
  };
  
  const getDocumentsForCompliance = (complianceId: string) => {
    return complianceDocuments.filter(doc => doc.complianceId === complianceId);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Statutory Compliance</h2>
          <p className="text-muted-foreground">
            Manage PF, ESIC, Professional Tax, and other statutory filings
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <Label htmlFor="month-select" className="mr-2">Month:</Label>
            <Input 
              id="month-select"
              type="month" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-40"
            />
          </div>
          
          <Button 
            variant="outline" 
            size="icon"
            className="h-10 w-10"
            onClick={() => setCalendarDialogOpen(true)}
          >
            <CalendarIconLucide className="h-4 w-4" />
          </Button>
          
          <Button 
            variant="outline" 
            size="icon" 
            className="h-10 w-10"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-blue-500" />
                  Compliance Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-muted-foreground">Overall Completion</span>
                      <span className="text-sm font-medium">{getComplianceProgress()}%</span>
                    </div>
                    <Progress value={getComplianceProgress()} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <div className="rounded-md bg-green-100 dark:bg-green-900/30 p-3">
                      <p className="text-xs text-muted-foreground">Filed</p>
                      <p className="text-2xl font-bold"><CountUp to={complianceData.filter(item => item.status === 'filed' || item.status === 'verified').length} duration={2} separator="," /></p>
                    </div>
                    <div className="rounded-md bg-amber-100 dark:bg-amber-900/30 p-3">
                      <p className="text-xs text-muted-foreground">Pending</p>
                      <p className="text-2xl font-bold"><CountUp to={complianceData.filter(item => item.status === 'pending').length} duration={2} separator="," /></p>
                    </div>
                    <div className="rounded-md bg-red-100 dark:bg-red-900/30 p-3">
                      <p className="text-xs text-muted-foreground">Overdue</p>
                      <p className="text-2xl font-bold"><CountUp to={complianceData.filter(item => 
                          item.status === 'overdue' || (new Date(item.dueDate) < new Date() && item.status === 'pending')
                        ).length} duration={2} separator="," /></p>
                    </div>
                    <div className="rounded-md bg-blue-100 dark:bg-blue-900/30 p-3">
                      <p className="text-xs text-muted-foreground">Upcoming</p>
                      <p className="text-2xl font-bold"><CountUp to={ComplianceService.getUpcomingDueDates(complianceData).length} duration={2} separator="," /></p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Due Dates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {complianceData
                    .filter(item => item.status === 'pending')
                    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                    .slice(0, 3)
                    .map(item => (
                      <div key={item.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                        <div>
                          <p className="font-medium">{getTypeLabel(item.type)}</p>
                          <p className="text-xs text-muted-foreground">{item.month}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{new Date(item.dueDate).toLocaleDateString()}</p>
                          <p className="text-xs text-muted-foreground">₹{item.amount.toLocaleString()}</p>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileUp className="h-4 w-4 text-green-500" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start text-sm"
                    onClick={() => generateDocument('pf', selectedMonth)}
                    disabled={!!isGeneratingDocument}
                  >
                    {isGeneratingDocument === 'pf' ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating PF ECR...</>
                    ) : (
                      <><Download className="mr-2 h-4 w-4" /> Generate PF ECR File</>
                    )}
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full justify-start text-sm"
                    onClick={() => generateDocument('esic', selectedMonth)}
                    disabled={!!isGeneratingDocument}
                  >
                    {isGeneratingDocument === 'esic' ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating ESIC XML...</>
                    ) : (
                      <><Download className="mr-2 h-4 w-4" /> Generate ESIC XML File</>
                    )}
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full justify-start text-sm"
                    onClick={() => generateDocument('pt', selectedMonth)}
                    disabled={!!isGeneratingDocument}
                  >
                    {isGeneratingDocument === 'pt' ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating PT Challan...</>
                    ) : (
                      <><Download className="mr-2 h-4 w-4" /> Generate Professional Tax Challan</>
                    )}
                  </Button>
                  
                  <Button 
                    variant="outline"
                    className="w-full justify-start text-sm"
                    onClick={() => setCalendarDialogOpen(true)}
                  >
                    <CalendarIconLucide className="mr-2 h-4 w-4" /> View Compliance Calendar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Compliance Filings</CardTitle>
              <CardDescription>
                Track and manage monthly statutory compliance filings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompliance.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{getTypeLabel(item.type)}</TableCell>
                      <TableCell>{item.month}</TableCell>
                      <TableCell>{new Date(item.dueDate).toLocaleDateString()}</TableCell>
                      <TableCell>₹{item.amount.toLocaleString()}</TableCell>
                      <TableCell>{getStatusBadge(item.status, item.dueDate)}</TableCell>
                      <TableCell>
                        {getDocumentsForCompliance(item.id).length > 0 ? (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleShowDocuments(item)}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            {getDocumentsForCompliance(item.id).length}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {item.status === 'filed' || item.status === 'verified' ? (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleShowDocuments(item)}
                          >
                            <FileText className="mr-1 h-4 w-4" />
                            View
                          </Button>
                        ) : item.status === 'generated' ? (
                          <Button
                            onClick={() => handleFilingDialog(item)}
                            variant="outline"
                            size="sm"
                          >
                            <Upload className="mr-1 h-4 w-4" />
                            File Return
                          </Button>
                        ) : (
                          <Button
                            onClick={() => generateDocument(item.type as any, item.month)}
                            variant="outline"
                            size="sm"
                            disabled={!!isGeneratingDocument}
                          >
                            {isGeneratingDocument === item.type ? (
                              <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Generating</>
                            ) : (
                              <><FileText className="mr-1 h-4 w-4" /> Generate</>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="documents" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Documents</CardTitle>
              <CardDescription>
                View and manage all compliance-related documents
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Related To</TableHead>
                    <TableHead>Uploaded On</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {complianceDocuments.map((doc) => {
                    const relatedCompliance = complianceData.find(c => c.id === doc.complianceId);
                    
                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">{doc.fileName}</TableCell>
                        <TableCell className="capitalize">{doc.type}</TableCell>
                        <TableCell>
                          {relatedCompliance ? (
                            <div>
                              <div>{getTypeLabel(relatedCompliance.type)}</div>
                              <div className="text-xs text-muted-foreground">{relatedCompliance.month}</div>
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>{new Date(doc.uploadedAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {doc.status === 'verified' ? (
                            <Badge className="bg-green-500">Verified</Badge>
                          ) : doc.status === 'pending' ? (
                            <Badge variant="outline">Pending</Badge>
                          ) : (
                            <Badge variant="destructive">Rejected</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="calendar" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Calendar</CardTitle>
              <CardDescription>
                View upcoming compliance deadlines and schedules
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center">
                <div className="bg-muted/50 rounded-lg p-4">
                  <Calendar 
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    mode="single"
                    className="border rounded-md" 
                  />
                </div>
              </div>
              
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">Upcoming Deadlines</h3>
                
                <div className="space-y-3">
                  {ComplianceService.getUpcomingDueDates(complianceData, 30)
                    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                    .map(item => (
                      <div 
                        key={item.id} 
                        className="flex justify-between items-center p-3 rounded-md border border-gray-200 dark:border-gray-800"
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-3 h-10 rounded-sm ${
                            new Date(item.dueDate).getTime() - new Date().getTime() < 7 * 24 * 60 * 60 * 1000
                              ? 'bg-red-500'
                              : 'bg-amber-500'
                          }`} />
                          <div>
                            <h4 className="font-medium">{getTypeLabel(item.type)}</h4>
                            <p className="text-sm text-muted-foreground">Due: {new Date(item.dueDate).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => generateDocument(item.type as any, item.month)}
                          >
                            Generate
                          </Button>
                        </div>
                      </div>
                    ))
                  }
                  
                  {ComplianceService.getUpcomingDueDates(complianceData, 30).length === 0 && (
                    <div className="text-center p-6 text-muted-foreground">
                      No upcoming deadlines in the next 30 days
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Filing History</CardTitle>
              <CardDescription>
                Review past compliance filings and their status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Compliance Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Filed On</TableHead>
                    <TableHead>Filed By</TableHead>
                    <TableHead>Challan/Ref Number</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {complianceData
                    .filter(item => item.status === 'filed' || item.status === 'verified')
                    .sort((a, b) => 
                      new Date(b.filingDate || "").getTime() - 
                      new Date(a.filingDate || "").getTime()
                    )
                    .map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{getTypeLabel(item.type)}</TableCell>
                        <TableCell>{item.month}</TableCell>
                        <TableCell>{item.filingDate ? new Date(item.filingDate).toLocaleDateString() : "-"}</TableCell>
                        <TableCell>{item.filedBy || "-"}</TableCell>
                        <TableCell>{item.challanNumber || "-"}</TableCell>
                        <TableCell>₹{item.amount.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleShowDocuments(item)}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  }
                  
                  {complianceData.filter(item => 
                    item.status === 'filed' || item.status === 'verified'
                  ).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                        No filing history found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Filing Dialog */}
      <Dialog open={isFilingDialogOpen} onOpenChange={setIsFilingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              File {selectedCompliance ? getTypeLabel(selectedCompliance.type) : ""} Return
            </DialogTitle>
            <DialogDescription>
              Enter filing details to mark this compliance as filed
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="challan-number" className="text-right">
                Challan Number
              </Label>
              <Input
                id="challan-number"
                value={filingDetails.challanNumber}
                onChange={(e) => setFilingDetails({...filingDetails, challanNumber: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="filing-date" className="text-right">
                Filing Date
              </Label>
              <Input
                id="filing-date"
                type="date"
                value={filingDetails.filingDate}
                onChange={(e) => setFilingDetails({...filingDetails, filingDate: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="document-type" className="text-right">
                Document Type
              </Label>
              <Select
                value={selectedDocumentType}
                onValueChange={setSelectedDocumentType}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="challan">Challan</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="certificate">Certificate</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="document" className="text-right">
                Upload Document
              </Label>
              <Input
                id="document"
                type="file"
                className="col-span-3"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFilingDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleFileCompliance}>
              Submit Filing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Document View Dialog */}
      <Dialog open={documentDialogOpen} onOpenChange={setDocumentDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedCompliance && `${getTypeLabel(selectedCompliance.type)} Documents - ${selectedCompliance.month}`}
            </DialogTitle>
            <DialogDescription>
              View and manage document files for this compliance filing
            </DialogDescription>
          </DialogHeader>
          
          {selectedCompliance && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-4 rounded-md bg-muted/50">
                  <p className="text-sm font-medium text-muted-foreground">Filing Date</p>
                  <p className="text-lg">{selectedCompliance.filingDate ? new Date(selectedCompliance.filingDate).toLocaleDateString() : "Not filed"}</p>
                </div>
                
                <div className="p-4 rounded-md bg-muted/50">
                  <p className="text-sm font-medium text-muted-foreground">Challan Number</p>
                  <p className="text-lg">{selectedCompliance.challanNumber || "Not available"}</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Associated Documents</h3>
                
                {getDocumentsForCompliance(selectedCompliance.id).length > 0 ? (
                  <div className="divide-y rounded-md border">
                    {getDocumentsForCompliance(selectedCompliance.id).map(doc => (
                      <div key={doc.id} className="flex items-center justify-between p-3">
                        <div className="flex items-center space-x-3">
                          <FileText className="h-8 w-8 text-blue-500" />
                          <div>
                            <p className="font-medium">{doc.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4 mr-1" /> Download
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-6 text-muted-foreground border rounded-md">
                    No documents available for this compliance
                  </div>
                )}
                
                <div className="pt-4">
                  <Button className="w-full">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload New Document
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Calendar Dialog */}
      <Dialog open={calendarDialogOpen} onOpenChange={setCalendarDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Compliance Calendar
            </DialogTitle>
            <DialogDescription>
              All upcoming compliance deadlines and important dates
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex justify-center">
              <Calendar 
                selected={selectedDate}
                onSelect={setSelectedDate}
                mode="single"
                className="border rounded-md" 
              />
            </div>
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Compliance Schedule</h3>
              
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                {complianceData
                  .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                  .map(item => {
                    const dueDate = new Date(item.dueDate);
                    const today = new Date();
                    const diffTime = dueDate.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    let statusColor = "bg-blue-100 dark:bg-blue-900/30";
                    let textColor = "text-blue-700 dark:text-blue-300";
                    
                    if (item.status === 'filed' || item.status === 'verified') {
                      statusColor = "bg-green-100 dark:bg-green-900/30";
                      textColor = "text-green-700 dark:text-green-300";
                    } else if (diffDays < 0) {
                      statusColor = "bg-red-100 dark:bg-red-900/30";
                      textColor = "text-red-700 dark:text-red-300";
                    } else if (diffDays < 7) {
                      statusColor = "bg-amber-100 dark:bg-amber-900/30";
                      textColor = "text-amber-700 dark:text-amber-300";
                    }
                    
                    return (
                      <div 
                        key={item.id} 
                        className={`${statusColor} p-3 rounded-md border`}
                      >
                        <div className="flex justify-between">
                          <h4 className={`font-medium ${textColor}`}>{getTypeLabel(item.type)}</h4>
                          <span className="text-sm font-medium">
                            {getStatusBadge(item.status, item.dueDate)}
                          </span>
                        </div>
                        <div className="text-sm space-y-1 mt-1">
                          <div className="flex justify-between">
                            <span>Period:</span>
                            <span className="font-medium">{item.month}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Due Date:</span>
                            <span className="font-medium">{dueDate.toLocaleDateString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Days Until Due:</span>
                            <span className="font-medium">
                              {diffDays < 0 
                                ? `${Math.abs(diffDays)} days overdue` 
                                : diffDays === 0 
                                  ? "Due today"
                                  : `${diffDays} days`
                              }
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
