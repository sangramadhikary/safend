'use client';
import { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Table, TableHeader, TableBody, TableHead, 
  TableRow, TableCell 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { 
  Download, Calendar, Filter, TrendingUp, 
  TrendingDown, IndianRupee, Users, MapPin, FileBarChart
} from 'lucide-react';
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useToastWithSound } from "@/hooks/use-toast-with-sound";
import { useReportExport } from '@/services/reports/ExportService';

export function SecurityFinancialReporting() {
  const [activeTab, setActiveTab] = useState('guard-utilization');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 2)),
    endDate: new Date()
  });
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const { toast } = useToastWithSound();
  const { exportToExcel, exportToPdf } = useReportExport();
  
  // Guard utilization data (loaded from database when available)
  const guardUtilizationData: { month: string; billed: number; deployed: number; utilization: number }[] = [];
  
  // Post profitability data (loaded from database when available)
  const postProfitabilityData: { post: string; revenue: number; expense: number; profit: number; margin: number }[] = [];
  
  // Client revenue analysis (loaded from database when available)
  const clientRevenueData: { name: string; revenue: number; growth: number }[] = [];
  
  // Branch performance (loaded from database when available)
  const branchPerformanceData: { name: string; revenue: number; expense: number; profit: number }[] = [];
  
  // Chart colors
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
  
  // Function to handle export
  const handleExport = async (format: 'excel' | 'pdf', reportType: string) => {
    try {
      if (format === 'excel') {
        await exportToExcel('security-financial', {
          reportType,
          startDate: dateRange.startDate.toISOString(),
          endDate: dateRange.endDate.toISOString(),
          branchId: selectedBranchId
        });
      } else {
        await exportToPdf('security-financial', {
          reportType,
          startDate: dateRange.startDate.toISOString(),
          endDate: dateRange.endDate.toISOString(),
          branchId: selectedBranchId
        });
      }
    } catch (error) {
      toast.error({
        title: "Export Error",
        description: "Failed to export report. Please try again.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Security Financial Reports</h2>
        <p className="text-muted-foreground">
          Analyze security operations profitability, post performance, and client revenue
        </p>
      </div>
      
      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />
          <select
            className="h-10 rounded-md border border-input bg-background px-3"
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
          >
            <option value="all">All Branches</option>
            <option value="delhi">Delhi</option>
            <option value="mumbai">Mumbai</option>
            <option value="bangalore">Bangalore</option>
            <option value="chennai">Chennai</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleExport('excel', activeTab)}>
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
          <Button variant="outline" onClick={() => handleExport('pdf', activeTab)}>
            <FileBarChart className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>
      
      <Tabs defaultValue="guard-utilization" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="guard-utilization">Guard Utilization</TabsTrigger>
          <TabsTrigger value="post-profitability">Post Profitability</TabsTrigger>
          <TabsTrigger value="client-analysis">Client Analysis</TabsTrigger>
          <TabsTrigger value="branch-performance">Branch Performance</TabsTrigger>
        </TabsList>
        
        <TabsContent value="guard-utilization" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Guard Utilization vs. Billing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={guardUtilizationData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="billed" name="Billed Guards" fill="#8884d8" />
                    <Bar yAxisId="left" dataKey="deployed" name="Deployed Guards" fill="#82ca9d" />
                    <Line yAxisId="right" type="monotone" dataKey="utilization" name="Utilization %" stroke="#ff7300" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Billed Guards</TableHead>
                    <TableHead className="text-right">Deployed Guards</TableHead>
                    <TableHead className="text-right">Utilization %</TableHead>
                    <TableHead className="text-right">Revenue Impact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guardUtilizationData.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell className="text-right">{row.billed}</TableCell>
                      <TableCell className="text-right">{row.deployed}</TableCell>
                      <TableCell className="text-right">{row.utilization}%</TableCell>
                      <TableCell className="text-right">
                        ₹{((row.billed - row.deployed) * 15000).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="post-profitability" className="space-y-4 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <Card className="md:col-span-8">
              <CardHeader>
                <CardTitle>Post Profitability Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={postProfitabilityData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="post" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="revenue" name="Revenue" fill="#8884d8" />
                      <Bar dataKey="expense" name="Expense" fill="#82ca9d" />
                      <Bar dataKey="profit" name="Profit" fill="#ffc658" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card className="md:col-span-4">
              <CardHeader>
                <CardTitle>Profit Margin</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={postProfitabilityData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="profit"
                        nameKey="post"
                      >
                        {postProfitabilityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Post</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {postProfitabilityData.map((row) => (
                    <TableRow key={row.post}>
                      <TableCell className="font-medium">{row.post}</TableCell>
                      <TableCell className="text-right">₹{row.revenue.toLocaleString()}</TableCell>
                      <TableCell className="text-right">₹{row.expense.toLocaleString()}</TableCell>
                      <TableCell className="text-right">₹{row.profit.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <span className={row.margin >= 15 ? "text-green-600" : "text-amber-600"}>
                          {row.margin.toFixed(1)}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="client-analysis" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Client Revenue Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={clientRevenueData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#8884d8" />
                    <Line yAxisId="right" type="monotone" dataKey="growth" name="Growth %" stroke="#ff7300" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">YoY Growth</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientRevenueData.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">₹{row.revenue.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <span className={row.growth >= 0 ? "text-green-600" : "text-red-600"}>
                          {row.growth > 0 ? '+' : ''}{row.growth}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {(row.revenue / clientRevenueData.reduce((a, b) => a + b.revenue, 0) * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {row.growth > 5 ? (
                          <span className="inline-flex items-center text-green-600">
                            <TrendingUp className="h-4 w-4 mr-1" /> Growing
                          </span>
                        ) : row.growth < 0 ? (
                          <span className="inline-flex items-center text-red-600">
                            <TrendingDown className="h-4 w-4 mr-1" /> Declining
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-amber-600">
                            <IndianRupee className="h-4 w-4 mr-1" /> Stable
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="branch-performance" className="space-y-4 mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {branchPerformanceData.map((branch) => (
              <Card key={branch.name}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center">
                    <MapPin className="h-4 w-4 mr-2" />
                    {branch.name} Branch
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">₹{(branch.profit / 100000).toFixed(1)}L</div>
                  <p className="text-sm text-muted-foreground">Profit</p>
                </CardContent>
                <CardFooter className="pt-0">
                  <div className="text-xs text-muted-foreground">
                    Margin: {(branch.profit / branch.revenue * 100).toFixed(1)}%
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Branch Performance Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={branchPerformanceData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="#8884d8" />
                    <Bar dataKey="expense" name="Expense" fill="#82ca9d" />
                    <Bar dataKey="profit" name="Profit" fill="#ffc658" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Guards</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branchPerformanceData.map((row, index) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">₹{row.revenue.toLocaleString()}</TableCell>
                      <TableCell className="text-right">₹{row.expense.toLocaleString()}</TableCell>
                      <TableCell className="text-right">₹{row.profit.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {(row.profit / row.revenue * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {[120, 90, 75, 60][index]}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
