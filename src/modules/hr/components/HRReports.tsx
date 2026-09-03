'use client';

import { useState, useEffect } from "react";
import { HRReportsProps } from "./index";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3,
  Download,
  FileDown,
  FileText,
  Filter,
  PieChart,
  Search,
  Users,
  Calendar,
  Printer,
  Mail,
  RefreshCcw
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { supabaseClient } from "@/integrations/supabase/client";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Line, LineChart, Pie, PieChart as RechartsPieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";

export function HRReports({ filter }: HRReportsProps) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("pdf");
  const [exportEmail, setExportEmail] = useState("");
  const [selectedReport, setSelectedReport] = useState<any>(null);

  // Real data state
  const [departmentData, setDepartmentData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [activeEmployees, setActiveEmployees] = useState(0);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const reportsData: any[] = [];

  // Derived arrays for chart compatibility (empty until more data is available)
  const headcountData: { month: string; total: number }[] = [];
  const attritionData: { month: string; exits: number; rate: number }[] = [];
  const statutoryDuesData: { name: string; current: number; overdue: number }[] = [];

  useEffect(() => {
    fetchHRStats();
  }, []);

  const fetchHRStats = async () => {
    setIsLoadingStats(true);
    try {
      const { data: employees, error } = await supabaseClient
        .from('employees')
        .select('status, department, created_at');
      if (error) throw error;
      const all = employees || [];
      setTotalEmployees(all.length);
      setActiveEmployees(all.filter(e => e.status?.toLowerCase() === 'active').length);

      // Department distribution
      const deptMap: Record<string, number> = {};
      const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'];
      all.filter(e => e.status?.toLowerCase() === 'active').forEach(e => {
        const dept = e.department || 'Other';
        deptMap[dept] = (deptMap[dept] || 0) + 1;
      });
      setDepartmentData(
        Object.entries(deptMap).map(([name, value], idx) => ({
          name, value, color: colors[idx % colors.length],
        }))
      );
    } catch (err) {
      console.error('Error fetching HR stats:', err);
    } finally {
      setIsLoadingStats(false);
    }
  };
  
  const { toast } = useToast();
  
  // Filter reports data based on filter prop
  const filteredReports = filter === "All Reports" 
    ? reportsData 
    : reportsData.filter(report => report.category === filter);
  
  // Filter reports based on search term
  const searchFilteredReports = searchTerm
    ? filteredReports.filter(report => 
        report.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.category.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : filteredReports;
  
  const handleGenerateReport = (report: any) => {
    toast({
      title: "Generating Report",
      description: `${report.name} is being generated`,
    });
    
    // In a real app, this would trigger a report generation process
  };
  
  const handleExportDialog = (report: any) => {
    setSelectedReport(report);
    setIsExportDialogOpen(true);
  };
  
  const handleExportReport = () => {
    if (!selectedReport) return;
    
    if (exportFormat === "email" && !exportEmail) {
      toast({
        title: "Email Required",
        description: "Please enter an email address for sending the report",
        variant: "destructive"
      });
      return;
    }
    
    // In a real app, this would trigger the export process
    toast({
      title: "Report Exported",
      description: exportFormat === "email" 
        ? `${selectedReport.name} has been sent to ${exportEmail}`
        : `${selectedReport.name} has been exported as ${exportFormat.toUpperCase()}`,
    });
    
    setIsExportDialogOpen(false);
    setExportEmail("");
    setExportFormat("pdf");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">HR Reports & Analytics</h2>
          <p className="text-muted-foreground">
            Comprehensive view of HR metrics and reports
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
          
          <Button variant="outline" size="icon" className="h-10 w-10">
            <Filter className="h-4 w-4" />
          </Button>
          
          <Button 
            onClick={() => {
              toast({
                title: "Refreshing Data",
                description: "Analytics are being updated",
              });
            }}
            className="flex gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh Data
          </Button>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="dashboard">HR Dashboard</TabsTrigger>
          <TabsTrigger value="reports">Reports Library</TabsTrigger>
          <TabsTrigger value="compliance">Compliance Status</TabsTrigger>
        </TabsList>
        
        <TabsContent value="dashboard" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Headcount Trends */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-500" />
                  Headcount Trends
                </CardTitle>
                <CardDescription>
                  Employee count over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={headcountData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Area 
                        type="monotone" 
                        dataKey="total" 
                        stroke="#8884d8"
                        fill="#8884d8"
                        fillOpacity={0.3} 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            {/* Attrition Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-orange-500" />
                  Attrition Analysis
                </CardTitle>
                <CardDescription>
                  Employee exits and attrition rate
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={attritionData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                      <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="exits" fill="#8884d8" name="Exits" />
                      <Line yAxisId="right" type="monotone" dataKey="rate" stroke="#82ca9d" name="Rate (%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            {/* Department Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5 text-green-500" />
                  Department Distribution
                </CardTitle>
                <CardDescription>
                  Employee count by department
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={departmentData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                        label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {departmentData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            {/* Statutory Dues */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-red-500" />
                  Statutory Dues
                </CardTitle>
                <CardDescription>
                  Current and overdue statutory payments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statutoryDuesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="current" fill="#8884d8" name="Current" />
                      <Bar dataKey="overdue" fill="#ff0000" name="Overdue" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="reports" className="mt-4">
          <Card>
            <CardHeader className="flex flex-col md:flex-row justify-between items-start md:items-center">
              <div>
                <CardTitle>Reports Library</CardTitle>
                <CardDescription>
                  Available reports for HR analysis
                </CardDescription>
              </div>
              
              <div className="flex items-center gap-4 mt-4 md:mt-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search reports..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-[200px] md:w-[300px]"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Last Generated</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchFilteredReports.length > 0 ? (
                    searchFilteredReports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell className="font-medium">{report.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{report.category}</Badge>
                        </TableCell>
                        <TableCell>{new Date(report.lastGenerated).toLocaleDateString()}</TableCell>
                        <TableCell>{report.format}</TableCell>
                        <TableCell>
                          <Badge className="bg-green-500 hover:bg-green-600">{report.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8"
                              onClick={() => handleGenerateReport(report)}
                            >
                              <RefreshCcw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 text-blue-500"
                              onClick={() => handleExportDialog(report)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        No reports found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="compliance" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  PF Compliance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">100%</div>
                <p className="text-sm text-muted-foreground">All requirements met</p>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div className="bg-green-600 h-2.5 rounded-full w-full"></div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-amber-500" />
                  ESIC Compliance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">95%</div>
                <p className="text-sm text-muted-foreground">1 pending filing</p>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div className="bg-amber-500 h-2.5 rounded-full" style={{ width: "95%" }}></div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-green-500" />
                  PT Compliance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">100%</div>
                <p className="text-sm text-muted-foreground">All requirements met</p>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div className="bg-green-600 h-2.5 rounded-full w-full"></div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Compliance Filing History</CardTitle>
              <CardDescription>
                Recent statutory compliance filings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Filing Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>PF</TableCell>
                    <TableCell>April 2025</TableCell>
                    <TableCell>May 14, 2025</TableCell>
                    <TableCell>May 15, 2025</TableCell>
                    <TableCell>₹120,000</TableCell>
                    <TableCell>
                      <Badge className="bg-green-500 hover:bg-green-600">Filed</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <FileText className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>ESIC</TableCell>
                    <TableCell>April 2025</TableCell>
                    <TableCell>May 18, 2025</TableCell>
                    <TableCell>May 21, 2025</TableCell>
                    <TableCell>₹37,000</TableCell>
                    <TableCell>
                      <Badge className="bg-green-500 hover:bg-green-600">Filed</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <FileText className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>PT</TableCell>
                    <TableCell>April 2025</TableCell>
                    <TableCell>May 25, 2025</TableCell>
                    <TableCell>May 31, 2025</TableCell>
                    <TableCell>₹14,000</TableCell>
                    <TableCell>
                      <Badge className="bg-green-500 hover:bg-green-600">Filed</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <FileText className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>PF</TableCell>
                    <TableCell>March 2025</TableCell>
                    <TableCell>April 12, 2025</TableCell>
                    <TableCell>April 15, 2025</TableCell>
                    <TableCell>₹118,000</TableCell>
                    <TableCell>
                      <Badge className="bg-green-500 hover:bg-green-600">Filed</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <FileText className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Export Report Dialog */}
      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Export Report</DialogTitle>
            <DialogDescription>
              Choose a format to export {selectedReport?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="export-format" className="text-right">
                Format
              </Label>
              <Select
                value={exportFormat}
                onValueChange={setExportFormat}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF Document</SelectItem>
                  <SelectItem value="xlsx">Excel Spreadsheet</SelectItem>
                  <SelectItem value="csv">CSV File</SelectItem>
                  <SelectItem value="email">Send via Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {exportFormat === "email" && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="export-email" className="text-right">
                  Email
                </Label>
                <Input
                  id="export-email"
                  value={exportEmail}
                  onChange={(e) => setExportEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  className="col-span-3"
                  type="email"
                />
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExportReport} className="flex gap-2">
              {exportFormat === "email" ? (
                <>
                  <Mail className="h-4 w-4" />
                  Send Report
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" />
                  Export Report
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
