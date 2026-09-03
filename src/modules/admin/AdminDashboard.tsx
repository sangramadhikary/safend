'use client';

import { 
  AreaChart, 
  BarChart2, 
  Clock, 
  Download, 
  Filter, 
  Grid, 
  LayoutGrid, 
  Package, 
  RefreshCw,
  Settings, 
  Users 
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toggle } from "@/components/ui/toggle";
import { StreamChart } from "@/components/charts/nivo/StreamChart";
import { SunburstChart } from "@/components/charts/nivo/SunburstChart";
import { NetworkChart } from "@/components/charts/nivo/NetworkChart";
import { SankeyChart } from "@/components/charts/nivo/SankeyChart";
import { CalendarChart } from "@/components/charts/nivo/CalendarChart";
import { ChordChart } from "@/components/charts/nivo/ChordChart";
import { RadarChart } from "@/components/charts/nivo/RadarChart";
import { TreemapChart } from "@/components/charts/nivo/TreemapChart";
import {
  generateStreamData,
  generateSunburstData,
  generateNetworkData,
  generateSankeyData,
  generateCalendarData,
  generateChordData,
  generateRadarData,
  generateTreemapData,
} from "@/data/chartDataGenerators";

const departmentData = [
  { name: "IT", employees: 52, budget: 5200000, expenses: 4150000 },
  { name: "HR", employees: 28, budget: 2100000, expenses: 1950000 },
  { name: "Sales", employees: 64, budget: 6800000, expenses: 6200000 },
  { name: "Marketing", employees: 36, budget: 4500000, expenses: 4200000 },
  { name: "Finance", employees: 22, budget: 3200000, expenses: 2800000 },
  { name: "Operations", employees: 78, budget: 8500000, expenses: 7920000 },
];

export function AdminDashboard() {
  const [timeFilter, setTimeFilter] = useState("monthly");
  const [showInventory, setShowInventory] = useState(true);
  const [viewMode, setViewMode] = useState("grid");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Generate chart data
  const streamData = generateStreamData();
  const sunburstData = generateSunburstData();
  const networkData = generateNetworkData();
  const sankeyData = generateSankeyData();
  const calendarData = generateCalendarData();
  const chordData = generateChordData();
  const radarData = generateRadarData();
  const treemapData = generateTreemapData();

  const handleRefresh = () => {
    setIsRefreshing(true);
    
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome to your admin dashboard. Here's what's happening today.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex gap-1">
                <Filter className="h-4 w-4" />
                <span>Filter</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="animate-tilt-in">
              <DropdownMenuLabel>Time Period</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={timeFilter} onValueChange={setTimeFilter}>
                <DropdownMenuRadioItem value="monthly">Monthly</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="quarterly">Quarterly</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Visibility</DropdownMenuLabel>
              <div className="px-2 py-1 flex items-center justify-between">
                <span className="text-sm">Inventory</span>
                <Switch
                  checked={showInventory}
                  onCheckedChange={setShowInventory}
                />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <div className="flex items-center gap-1 border rounded-md overflow-hidden">
            <Toggle
              pressed={viewMode === "grid"}
              onPressedChange={() => setViewMode("grid")}
              className="rounded-none border-0 h-8 px-2"
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Toggle>
            <Toggle
              pressed={viewMode === "list"}
              onPressedChange={() => setViewMode("list")}
              className="rounded-none border-0 h-8 px-2"
              aria-label="List view"
            >
              <Grid className="h-4 w-4" />
            </Toggle>
          </div>
          
          <Button
            size="icon"
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={isRefreshing ? "animate-spin" : ""}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          
          <Button size="icon" variant="outline">
            <Download className="h-4 w-4" />
          </Button>
          
          <Button size="icon" variant="outline">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Enhanced Statistics Section - 8 key metrics in 2 rows */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Active Personnel" 
          value={1258} 
          icon={<Users className="h-5 w-5 text-safend-red" />}
          trend={{ value: 12, isPositive: true }}
        />
        <StatCard 
          title="Attendance Rate" 
          value={95} 
          icon={<Clock className="h-5 w-5 text-safend-red" />}
          trend={{ value: 3, isPositive: true }}
          suffix="%"
        />
        <StatCard 
          title="Monthly Revenue" 
          value={8460000} 
          icon={<BarChart2 className="h-5 w-5 text-safend-red" />}
          trend={{ value: 7, isPositive: true }}
          formatter={formatCurrency}
        />
        <StatCard 
          title="Inventory Status" 
          value={78} 
          icon={<Package className="h-5 w-5 text-safend-red" />}
          trend={{ value: 5, isPositive: false }}
          suffix="%"
        />
      </div>

      {/* Second row of statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Active Contracts" 
          value={38} 
          icon={<Package className="h-5 w-5 text-safend-red" />}
          trend={{ value: 2, isPositive: true }}
        />
        <StatCard 
          title="Staff Utilization" 
          value={92} 
          icon={<Users className="h-5 w-5 text-safend-red" />}
          trend={{ value: 4, isPositive: true }}
          suffix="%"
        />
        <StatCard 
          title="Monthly Expenses" 
          value={6750000} 
          icon={<BarChart2 className="h-5 w-5 text-safend-red" />}
          trend={{ value: 2, isPositive: false }}
          formatter={formatCurrency}
        />
        <StatCard 
          title="Client Satisfaction" 
          value={87} 
          icon={<BarChart2 className="h-5 w-5 text-safend-red" />}
          trend={{ value: 3, isPositive: true }}
          suffix="%"
        />
      </div>
      
      {/* Advanced Visualizations Section */}
      <div className="space-y-6">
        {/* Stream Chart - Department Budget Flow */}
        <Card className="glass-card hover-scale overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AreaChart className="h-5 w-5 text-safend-red" />
              Department Budget Flow Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StreamChart
              data={streamData}
              keys={['IT', 'HR', 'Sales', 'Marketing', 'Finance', 'Operations']}
              height={400}
            />
          </CardContent>
        </Card>

        {/* Sunburst & Network Graph Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass-card hover-scale overflow-hidden">
            <CardHeader>
              <CardTitle>Organizational Structure</CardTitle>
            </CardHeader>
            <CardContent>
              <SunburstChart data={sunburstData} height={500} />
            </CardContent>
          </Card>

          <Card className="glass-card hover-scale overflow-hidden">
            <CardHeader>
              <CardTitle>Department Dependencies</CardTitle>
            </CardHeader>
            <CardContent>
              <NetworkChart data={networkData} height={500} />
            </CardContent>
          </Card>
        </div>

        {/* Sankey Diagram - Budget Flow */}
        <Card className="glass-card hover-scale overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-safend-red" />
              Budget Allocation & Expense Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SankeyChart data={sankeyData} height={500} />
          </CardContent>
        </Card>

        {/* Calendar Heatmap - Attendance */}
        <Card className="glass-card hover-scale overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-safend-red" />
              Annual Attendance Heatmap
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CalendarChart
              data={calendarData}
              from="2025-01-01"
              to="2025-12-31"
              height={200}
            />
          </CardContent>
        </Card>

        {/* Chord & Radar Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass-card hover-scale overflow-hidden">
            <CardHeader>
              <CardTitle>Inter-Branch Collaboration</CardTitle>
            </CardHeader>
            <CardContent>
              <ChordChart data={chordData} height={500} />
            </CardContent>
          </Card>

          <Card className="glass-card hover-scale overflow-hidden">
            <CardHeader>
              <CardTitle>Branch Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <RadarChart
                data={radarData}
                keys={['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad']}
                indexBy="branch"
                height={500}
              />
            </CardContent>
          </Card>
        </div>

        {/* Treemap - Revenue Distribution */}
        <Card className="glass-card hover-scale overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-safend-red" />
              Revenue Distribution by Branch & Service
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TreemapChart data={treemapData} height={500} />
          </CardContent>
        </Card>
      </div>

      {/* Key Metrics Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Performance Table */}
        <Card className="glass-card hover-scale overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Department Overview</CardTitle>
            <Badge variant="secondary" className="text-xs">
              Total: 6 departments
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm">Department</th>
                    <th className="px-4 py-2 text-right text-sm">Employees</th>
                    <th className="px-4 py-2 text-right text-sm">Budget</th>
                    <th className="px-4 py-2 text-right text-sm">Expenses</th>
                    <th className="px-4 py-2 text-right text-sm">Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {departmentData.map((dept) => {
                    const utilizationPercent = Math.round((dept.expenses / dept.budget) * 100);
                    return (
                      <tr key={dept.name} className="border-b hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium">{dept.name}</td>
                        <td className="px-4 py-3 text-sm text-right">{dept.employees}</td>
                        <td className="px-4 py-3 text-sm text-right">{formatCurrency(dept.budget)}</td>
                        <td className="px-4 py-3 text-sm text-right">{formatCurrency(dept.expenses)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-safend-red" 
                                style={{ width: `${utilizationPercent}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium">{utilizationPercent}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Key Performance Metrics */}
        <Card className="glass-card hover-scale overflow-hidden">
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Revenue vs Target */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Revenue vs Target</span>
                  <span className="text-sm font-medium">84%</span>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="bg-green-500 h-full" style={{ width: "84%" }} />
                </div>
              </div>
              
              {/* Cost Efficiency */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Cost Efficiency</span>
                  <span className="text-sm font-medium">76%</span>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="bg-amber-500 h-full" style={{ width: "76%" }} />
                </div>
              </div>
              
              {/* Client Retention */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Client Retention</span>
                  <span className="text-sm font-medium">92%</span>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="bg-safend-red h-full" style={{ width: "92%" }} />
                </div>
              </div>
              
              {/* Staff Turnover */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Staff Turnover</span>
                  <span className="text-sm font-medium">12%</span>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full" style={{ width: "12%" }} />
                </div>
              </div>
              
              {/* Training Compliance */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Training Compliance</span>
                  <span className="text-sm font-medium">89%</span>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="bg-purple-500 h-full" style={{ width: "89%" }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Branch Performance Stats */}
      <Card className="glass-card hover-scale overflow-hidden">
        <CardHeader>
          <CardTitle>Branch Performance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm">Branch</th>
                  <th className="px-4 py-2 text-right text-sm">Revenue</th>
                  <th className="px-4 py-2 text-right text-sm">Expenses</th>
                  <th className="px-4 py-2 text-right text-sm">Profit</th>
                  <th className="px-4 py-2 text-right text-sm">Staff</th>
                  <th className="px-4 py-2 text-right text-sm">Utilization</th>
                  <th className="px-4 py-2 text-right text-sm">Compliance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium">Mumbai</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(3240000)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(2560000)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(680000)}</td>
                  <td className="px-4 py-3 text-sm text-right">320</td>
                  <td className="px-4 py-3 text-sm text-right">94%</td>
                  <td className="px-4 py-3 text-sm text-right">98%</td>
                </tr>
                <tr className="border-b hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium">Delhi</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(2840000)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(2240000)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(600000)}</td>
                  <td className="px-4 py-3 text-sm text-right">285</td>
                  <td className="px-4 py-3 text-sm text-right">91%</td>
                  <td className="px-4 py-3 text-sm text-right">95%</td>
                </tr>
                <tr className="border-b hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium">Bangalore</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(2380000)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(1950000)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(430000)}</td>
                  <td className="px-4 py-3 text-sm text-right">260</td>
                  <td className="px-4 py-3 text-sm text-right">93%</td>
                  <td className="px-4 py-3 text-sm text-right">97%</td>
                </tr>
                <tr className="border-b hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium">Chennai</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(1840000)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(1480000)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(360000)}</td>
                  <td className="px-4 py-3 text-sm text-right">195</td>
                  <td className="px-4 py-3 text-sm text-right">90%</td>
                  <td className="px-4 py-3 text-sm text-right">94%</td>
                </tr>
                <tr className="border-b hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium">Hyderabad</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(1520000)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(1240000)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(280000)}</td>
                  <td className="px-4 py-3 text-sm text-right">175</td>
                  <td className="px-4 py-3 text-sm text-right">89%</td>
                  <td className="px-4 py-3 text-sm text-right">93%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
