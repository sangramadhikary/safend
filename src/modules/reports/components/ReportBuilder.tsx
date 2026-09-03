'use client';

import { useState } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { 
  BarChart2, 
  PieChart, 
  LineChart, 
  TableProperties,
  Plus,
  Save,
  Play,
  Copy
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function ReportBuilder() {
  const [reportName, setReportName] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportType, setReportType] = useState("sql");
  const [dataSource, setDataSource] = useState("warehouse");
  const [reportCategory, setReportCategory] = useState("operations");
  const [visualizationType, setVisualizationType] = useState("table");
  const [query, setQuery] = useState("");
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!reportName) {
      toast({
        title: "Report name is required",
        description: "Please enter a name for your report.",
        variant: "destructive",
      });
      return;
    }
    
    toast({
      title: "Report Created",
      description: `${reportName} has been successfully created.`,
    });
  };
  
  const handlePreview = () => {
    toast({
      title: "Previewing Report",
      description: "Generating preview with sample data.",
    });
  };
  
  const handleSaveTemplate = () => {
    toast({
      title: "Template Saved",
      description: "This report template has been saved to your library.",
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>Report Builder</CardTitle>
            <CardDescription>
              Create custom reports by defining data sources, visualization types, and parameters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="report-name">Report Name</Label>
                  <Input 
                    id="report-name" 
                    placeholder="Enter report name" 
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="report-description">Description</Label>
                  <Textarea 
                    id="report-description" 
                    placeholder="Describe the purpose of this report" 
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="report-type">Report Type</Label>
                    <Select 
                      value={reportType}
                      onValueChange={setReportType}
                    >
                      <SelectTrigger id="report-type">
                        <SelectValue placeholder="Select Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sql">SQL Query</SelectItem>
                        <SelectItem value="dbt">DBT Model</SelectItem>
                        <SelectItem value="python">Python Script</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="data-source">Data Source</Label>
                    <Select 
                      value={dataSource}
                      onValueChange={setDataSource}
                    >
                      <SelectTrigger id="data-source">
                        <SelectValue placeholder="Select Source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="warehouse">Data Warehouse</SelectItem>
                        <SelectItem value="hr">HR Database</SelectItem>
                        <SelectItem value="accounts">Accounts Database</SelectItem>
                        <SelectItem value="operations">Operations Database</SelectItem>
                        <SelectItem value="sales">Sales Database</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="report-category">Category</Label>
                    <Select 
                      value={reportCategory}
                      onValueChange={setReportCategory}
                    >
                      <SelectTrigger id="report-category">
                        <SelectValue placeholder="Select Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hr">HR</SelectItem>
                        <SelectItem value="payroll">Payroll</SelectItem>
                        <SelectItem value="accounts">Accounts</SelectItem>
                        <SelectItem value="inventory">Inventory</SelectItem>
                        <SelectItem value="operations">Operations</SelectItem>
                        <SelectItem value="sales">Sales</SelectItem>
                        <SelectItem value="compliance">Compliance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="visualization-type">Visualization</Label>
                    <Select 
                      value={visualizationType}
                      onValueChange={setVisualizationType}
                    >
                      <SelectTrigger id="visualization-type">
                        <SelectValue placeholder="Select Visualization" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="table">Table</SelectItem>
                        <SelectItem value="bar">Bar Chart</SelectItem>
                        <SelectItem value="line">Line Chart</SelectItem>
                        <SelectItem value="pie">Pie Chart</SelectItem>
                        <SelectItem value="mixed">Mixed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="query">Query / Expression</Label>
                <Textarea 
                  id="query" 
                  placeholder={reportType === "sql" 
                    ? "SELECT * FROM fct_attendance WHERE branch_id = :branch_id AND date BETWEEN :start_date AND :end_date" 
                    : reportType === "dbt" 
                    ? "{{ ref('dim_employee') }}" 
                    : "# Python code\ndef process_data(df):\n  return df.groupby('branch_id').sum()"}
                  className="font-mono text-sm h-[200px]"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use parameter placeholders like :branch_id that can be filled at runtime
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Parameters</h3>
                <Button variant="outline" type="button" size="sm" className="flex items-center gap-1">
                  <Plus className="h-4 w-4" /> Add Parameter
                </Button>
              </div>
              
              <div className="border rounded-md p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="param-branch">Branch</Label>
                    <Select defaultValue="all">
                      <SelectTrigger id="param-branch">
                        <SelectValue placeholder="Branch Parameter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Branches</SelectItem>
                        <SelectItem value="required">Required Selection</SelectItem>
                        <SelectItem value="default">Default: Mumbai</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="param-date">Date Range</Label>
                    <Select defaultValue="current_month">
                      <SelectTrigger id="param-date">
                        <SelectValue placeholder="Date Parameter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current_month">Current Month</SelectItem>
                        <SelectItem value="last_month">Last Month</SelectItem>
                        <SelectItem value="quarter">Current Quarter</SelectItem>
                        <SelectItem value="year">Current Financial Year</SelectItem>
                        <SelectItem value="custom">Custom Range</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="param-custom">Custom Parameter</Label>
                    <div className="flex gap-2">
                      <Input id="param-custom" placeholder="Parameter name" defaultValue="status" />
                      <Select defaultValue="active">
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="all">All</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Tabs defaultValue="preview" className="w-full">
                <TabsList className="grid grid-cols-3 mb-2">
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="schedule">Schedule</TabsTrigger>
                  <TabsTrigger value="delivery">Delivery</TabsTrigger>
                </TabsList>
                
                <TabsContent value="preview" className="p-4 border rounded-md">
                  <div className="flex items-center justify-center h-48">
                    {visualizationType === "table" && (
                      <TableProperties className="h-12 w-12 text-muted-foreground" />
                    )}
                    {visualizationType === "bar" && (
                      <BarChart2 className="h-12 w-12 text-muted-foreground" />
                    )}
                    {visualizationType === "line" && (
                      <LineChart className="h-12 w-12 text-muted-foreground" />
                    )}
                    {visualizationType === "pie" && (
                      <PieChart className="h-12 w-12 text-muted-foreground" />
                    )}
                    <span className="ml-2 text-muted-foreground">
                      {query ? "Click Preview to view sample data" : "Enter a query to preview results"}
                    </span>
                  </div>
                </TabsContent>
                
                <TabsContent value="schedule" className="p-4 border rounded-md space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="schedule-frequency">Frequency</Label>
                      <Select defaultValue="daily">
                        <SelectTrigger id="schedule-frequency">
                          <SelectValue placeholder="Select Frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="schedule-time">Time</Label>
                      <Input id="schedule-time" type="time" defaultValue="06:00" />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="schedule-day">Day (if applicable)</Label>
                      <Select defaultValue="1">
                        <SelectTrigger id="schedule-day">
                          <SelectValue placeholder="Select Day" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1st</SelectItem>
                          <SelectItem value="2">2nd</SelectItem>
                          <SelectItem value="last">Last day</SelectItem>
                          <SelectItem value="mon">Monday</SelectItem>
                          <SelectItem value="fri">Friday</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="delivery" className="p-4 border rounded-md space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="delivery-format">Format</Label>
                      <Select defaultValue="pdf">
                        <SelectTrigger id="delivery-format">
                          <SelectValue placeholder="Select Format" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pdf">PDF</SelectItem>
                          <SelectItem value="xlsx">Excel</SelectItem>
                          <SelectItem value="csv">CSV</SelectItem>
                          <SelectItem value="json">JSON</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="delivery-method">Delivery Method</Label>
                      <Select defaultValue="email">
                        <SelectTrigger id="delivery-method">
                          <SelectValue placeholder="Select Method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="notification">Notification</SelectItem>
                          <SelectItem value="s3">S3 Storage</SelectItem>
                          <SelectItem value="api">API Endpoint</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="delivery-recipients">Email Recipients</Label>
                    <Input id="delivery-recipients" placeholder="email1@example.com, email2@example.com" />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t p-6">
            <div className="flex gap-2">
              <Button variant="outline" type="button" className="gap-1" onClick={handleSaveTemplate}>
                <Save className="h-4 w-4" /> Save Template
              </Button>
              <Button variant="outline" type="button" className="gap-1">
                <Copy className="h-4 w-4" /> Duplicate
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" type="button" className="gap-1" onClick={handlePreview}>
                <Play className="h-4 w-4" /> Preview
              </Button>
              <Button type="submit">Create Report</Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
