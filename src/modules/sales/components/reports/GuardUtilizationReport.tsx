'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";

// Mock guard utilization data
const guardUtilizationData = [
  { segment: "Corporate", utilized: 85, authorized: 92, idle: 7 },
  { segment: "Residential", utilized: 42, authorized: 45, idle: 3 },
  { segment: "Industrial", utilized: 38, authorized: 40, idle: 2 },
  { segment: "Event", utilized: 22, authorized: 25, idle: 3 },
  { segment: "Retail", utilized: 28, authorized: 30, idle: 2 }
];

const monthlyUtilizationData = [
  { month: "Jan", utilization: 92, overtime: 8 },
  { month: "Feb", utilization: 88, overtime: 9 },
  { month: "Mar", utilization: 94, overtime: 12 },
  { month: "Apr", utilization: 91, overtime: 10 },
  { month: "May", utilization: 89, overtime: 7 },
  { month: "Jun", utilization: 93, overtime: 11 }
];

interface GuardUtilizationReportProps {
  period: string;
}

export function GuardUtilizationReport({ period }: GuardUtilizationReportProps) {
  // Calculate key metrics
  const totalAuthorized = guardUtilizationData.reduce((sum, item) => sum + item.authorized, 0);
  const totalUtilized = guardUtilizationData.reduce((sum, item) => sum + item.utilized, 0);
  const totalIdle = guardUtilizationData.reduce((sum, item) => sum + item.idle, 0);
  const utilizationRate = ((totalUtilized / totalAuthorized) * 100).toFixed(1);
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Utilization Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{utilizationRate}%</div>
            <p className="text-xs text-muted-foreground">
              Target: 95%
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Guards Deployed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUtilized}</div>
            <p className="text-xs text-muted-foreground">
              Out of {totalAuthorized} authorized
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Idle Guards</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalIdle}</div>
            <p className="text-xs text-muted-foreground">
              {((totalIdle / totalAuthorized) * 100).toFixed(1)}% of workforce
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg. Overtime Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">9.5</div>
            <p className="text-xs text-muted-foreground">
              Per guard per month
            </p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Guard Utilization by Segment</CardTitle>
            <CardDescription>Authorized vs. actually deployed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={guardUtilizationData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="segment" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar name="Authorized" dataKey="authorized" fill="#4f46e5" />
                  <Bar name="Utilized" dataKey="utilized" fill="#22c55e" />
                  <Bar name="Idle" dataKey="idle" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Monthly Utilization Trend</CardTitle>
            <CardDescription>Utilization rate and overtime</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={monthlyUtilizationData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" name="Utilization %" dataKey="utilization" stroke="#4f46e5" activeDot={{ r: 8 }} />
                  <Line yAxisId="right" type="monotone" name="Overtime %" dataKey="overtime" stroke="#f59e0b" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Key Observations</CardTitle>
          <CardDescription>Analysis and recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-2">
            <li>Current utilization rate is {utilizationRate}%, which is slightly below the target rate of 95%.</li>
            <li>The Corporate sector shows highest utilization efficiency with 92.4% of authorized guards deployed.</li>
            <li>Event security segment has the highest idle capacity at 12% - consider reallocating resources to high-demand areas.</li>
            <li>Overtime has increased by 3.5% compared to the previous quarter, primarily in the industrial segment.</li>
            <li>Recommended action: Optimize resource allocation between segments to improve overall utilization rate.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
