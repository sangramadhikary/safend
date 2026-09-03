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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Play, 
  Download, 
  Save, 
  Database,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  Clock,
  Lightbulb
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandLoader } from "@/components/ui/brand-loader";

// Sample data removed - query results will come from real database
const sampleData: any[] = [];

const sampleSchemas = [
  { 
    name: "dim_employee", 
    columns: [
      { name: "employee_id", type: "INTEGER", primary: true },
      { name: "emp_code", type: "VARCHAR(20)", primary: false },
      { name: "first_name", type: "VARCHAR(100)", primary: false },
      { name: "last_name", type: "VARCHAR(100)", primary: false },
      { name: "branch_id", type: "INTEGER", primary: false },
      { name: "department", type: "VARCHAR(50)", primary: false },
      { name: "designation", type: "VARCHAR(100)", primary: false },
      { name: "join_date", type: "DATE", primary: false },
      { name: "status", type: "VARCHAR(20)", primary: false },
    ]
  },
  { 
    name: "fct_attendance", 
    columns: [
      { name: "attendance_id", type: "INTEGER", primary: true },
      { name: "employee_id", type: "INTEGER", primary: false },
      { name: "date", type: "DATE", primary: false },
      { name: "shift_id", type: "INTEGER", primary: false },
      { name: "time_in", type: "TIMESTAMP", primary: false },
      { name: "time_out", type: "TIMESTAMP", primary: false },
      { name: "status", type: "VARCHAR(20)", primary: false },
      { name: "overtime_hours", type: "DECIMAL(5,2)", primary: false },
    ]
  },
  { 
    name: "fct_invoice", 
    columns: [
      { name: "invoice_id", type: "INTEGER", primary: true },
      { name: "invoice_number", type: "VARCHAR(50)", primary: false },
      { name: "client_id", type: "INTEGER", primary: false },
      { name: "branch_id", type: "INTEGER", primary: false },
      { name: "invoice_date", type: "DATE", primary: false },
      { name: "due_date", type: "DATE", primary: false },
      { name: "amount", type: "DECIMAL(12,2)", primary: false },
      { name: "tax_amount", type: "DECIMAL(12,2)", primary: false },
      { name: "total_amount", type: "DECIMAL(12,2)", primary: false },
      { name: "status", type: "VARCHAR(20)", primary: false },
    ]
  },
];

const sampleQueryTemplates = [
  {
    name: "Monthly Revenue by Branch",
    query: "SELECT\n  b.branch_name,\n  DATE_TRUNC('month', i.invoice_date) as month,\n  SUM(i.total_amount) as revenue\nFROM fct_invoice i\nJOIN dim_branch b ON i.branch_id = b.branch_id\nWHERE i.invoice_date BETWEEN :start_date AND :end_date\nGROUP BY b.branch_name, DATE_TRUNC('month', i.invoice_date)\nORDER BY month, revenue DESC"
  },
  {
    name: "Employee Attendance Summary",
    query: "SELECT\n  e.first_name || ' ' || e.last_name as employee_name,\n  COUNT(a.attendance_id) as days_present,\n  SUM(a.overtime_hours) as total_overtime\nFROM fct_attendance a\nJOIN dim_employee e ON a.employee_id = e.employee_id\nWHERE a.date BETWEEN :start_date AND :end_date\n  AND a.status = 'Present'\nGROUP BY e.employee_id, employee_name\nORDER BY days_present DESC"
  },
  {
    name: "Contract Profitability",
    query: "SELECT\n  c.client_name,\n  c.contract_name,\n  SUM(i.total_amount) as revenue,\n  SUM(e.amount) as expenses,\n  SUM(i.total_amount) - SUM(e.amount) as profit,\n  (SUM(i.total_amount) - SUM(e.amount)) / SUM(i.total_amount) * 100 as margin\nFROM fct_invoice i\nJOIN dim_contract c ON i.contract_id = c.contract_id\nJOIN fct_expense e ON e.contract_id = c.contract_id AND e.expense_date BETWEEN :start_date AND :end_date\nWHERE i.invoice_date BETWEEN :start_date AND :end_date\nGROUP BY c.client_name, c.contract_name\nORDER BY margin DESC"
  }
];

export function AdHocQuery() {
  const [query, setQuery] = useState("");
  const [dataSource, setDataSource] = useState("warehouse");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [activeTab, setActiveTab] = useState("query");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const runQuery = () => {
    if (!query.trim()) {
      toast({
        title: "Empty Query",
        description: "Please enter a SQL query to execute.",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    setResults(null);
    
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      setResults(sampleData);
      toast({
        title: "Query Executed",
        description: "Query completed successfully.",
      });
    }, 1500);
  };
  
  const saveQuery = () => {
    toast({
      title: "Query Saved",
      description: "Your query has been saved to your library.",
    });
  };
  
  const downloadResults = (format: string) => {
    toast({
      title: "Download Started",
      description: `Downloading results in ${format.toUpperCase()} format.`,
    });
  };

  const loadTemplate = (template: string) => {
    const selectedTemplate = sampleQueryTemplates.find(t => t.name === template);
    if (selectedTemplate) {
      setQuery(selectedTemplate.query);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ad-hoc Query</CardTitle>
          <CardDescription>
            Write and execute SQL queries against the data warehouse
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs 
            value={activeTab} 
            onValueChange={setActiveTab}
            className="space-y-4"
          >
            <TabsList className="grid grid-cols-3 w-[400px]">
              <TabsTrigger value="query">Query</TabsTrigger>
              <TabsTrigger value="schema">Schema Explorer</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
            </TabsList>
            
            <TabsContent value="query" className="space-y-4">
              <div className="flex gap-2 items-center">
                <Select
                  value={dataSource}
                  onValueChange={setDataSource}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select Data Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">Data Warehouse</SelectItem>
                    <SelectItem value="operational">Operational DB</SelectItem>
                    <SelectItem value="raw">Raw Data Lake</SelectItem>
                  </SelectContent>
                </Select>
                
                <p className="text-sm text-muted-foreground flex items-center">
                  <Clock className="h-4 w-4 mr-1" /> Query timeout: 60 seconds
                </p>
              </div>
              
              <Textarea 
                placeholder="Enter your SQL query here..." 
                className="font-mono text-sm h-[200px] resize-y"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              
              <div className="flex gap-2">
                <Button 
                  onClick={runQuery} 
                  disabled={isLoading}
                  className="gap-1"
                >
                  <Play className="h-4 w-4" /> 
                  {isLoading ? "Running..." : "Run Query"}
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={saveQuery}
                  className="gap-1"
                >
                  <Save className="h-4 w-4" /> 
                  Save Query
                </Button>
              </div>
              
              {query && (
                <div className="border p-3 rounded-md bg-muted/50">
                  <div className="flex gap-1 items-start">
                    <Lightbulb className="h-4 w-4 text-amber-500 mt-1" />
                    <div className="text-sm">
                      <p className="font-medium">Query Tips</p>
                      <ul className="list-disc pl-5 text-muted-foreground text-xs space-y-1 mt-1">
                        <li>Use parameterized values with colon prefix (e.g., <code>:start_date</code>)</li>
                        <li>Limit result sets to avoid timeout (e.g., <code>LIMIT 1000</code>)</li>
                        <li>Use <code>EXPLAIN ANALYZE</code> to check query performance</li>
                        <li>For large date ranges, consider using partitioned tables</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="schema" className="space-y-4">
              <div className="border rounded-md">
                <div className="p-4 border-b">
                  <h3 className="font-medium">Schema Explorer</h3>
                  <p className="text-sm text-muted-foreground">Browse available tables and columns</p>
                </div>
                
                {sampleSchemas.map((schema) => (
                  <div key={schema.name} className="border-b p-4">
                    <div className="flex items-center">
                      <Database className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span className="font-mono text-sm">{schema.name}</span>
                    </div>
                    
                    <div className="mt-2 pl-6 grid gap-1">
                      {schema.columns.map((column) => (
                        <div key={column.name} className="text-sm flex items-center justify-between">
                          <div>
                            <span className="font-mono">{column.name}</span>
                            {column.primary && (
                              <Badge variant="outline" className="ml-2 text-[10px] px-1">PK</Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">{column.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="templates" className="space-y-4">
              <p className="text-sm text-muted-foreground">Select a template to use as a starting point for your query</p>
              
              <Select
                value={selectedTemplate}
                onValueChange={(value) => {
                  setSelectedTemplate(value);
                  loadTemplate(value);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {sampleQueryTemplates.map((template) => (
                    <SelectItem key={template.name} value={template.name}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedTemplate && (
                <Button 
                  variant="outline" 
                  onClick={() => setActiveTab("query")}
                  className="w-full"
                >
                  Use This Template
                </Button>
              )}
            </TabsContent>
          </Tabs>
          
          {isLoading && (
            <div className="flex items-center justify-center p-8 border rounded-md bg-white dark:bg-gray-950">
              <BrandLoader size="md" message="Executing query..." />
            </div>
          )}
          
          {results && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Query Results</h3>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-1"
                    onClick={() => downloadResults("csv")}
                  >
                    <Download className="h-4 w-4" /> CSV
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-1"
                    onClick={() => downloadResults("xlsx")}
                  >
                    <FileSpreadsheet className="h-4 w-4" /> Excel
                  </Button>
                </div>
              </div>
              
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(results[0]).map((key) => (
                        <TableHead key={key}>
                          {key.charAt(0).toUpperCase() + key.slice(1)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((row, i) => (
                      <TableRow key={i}>
                        {Object.values(row).map((value: any, j) => (
                          <TableCell key={j}>
                            {typeof value === 'number' && !Number.isInteger(value)
                              ? value.toFixed(2)
                              : value}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{results.length} rows returned</span>
                <span>Query completed in 1.2s</span>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <div className="flex items-center text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />
            All queries are logged for security and auditing purposes
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
