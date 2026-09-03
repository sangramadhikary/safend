'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText } from "lucide-react";

interface ContractRenewalReportProps {
  period: string;
}

// Mock contract renewal data
const renewalPredictionData = [
  { status: "Very Likely", percentage: 65, color: "#22c55e" },
  { status: "Likely", percentage: 20, color: "#3b82f6" },
  { status: "At Risk", percentage: 10, color: "#f59e0b" },
  { status: "Unlikely", percentage: 5, color: "#ef4444" },
];

const upcomingRenewals = [
  { 
    id: "CONT-1245",
    client: "Apex Corporate Solutions", 
    expiryDate: "2023-06-15", 
    revenue: 450000,
    renewalProbability: 95,
    renewalStatus: "Very Likely"
  },
  { 
    id: "CONT-1192",
    client: "Metro Residential Society", 
    expiryDate: "2023-06-30", 
    revenue: 325000,
    renewalProbability: 85,
    renewalStatus: "Very Likely"
  },
  { 
    id: "CONT-1208",
    client: "Industrial Park Ltd", 
    expiryDate: "2023-07-10", 
    revenue: 560000,
    renewalProbability: 70,
    renewalStatus: "Likely"
  },
  { 
    id: "CONT-1275",
    client: "Westside Mall", 
    expiryDate: "2023-07-15", 
    revenue: 280000,
    renewalProbability: 40,
    renewalStatus: "At Risk"
  },
  { 
    id: "CONT-1187",
    client: "Grand Hotel Chain", 
    expiryDate: "2023-07-22", 
    revenue: 175000,
    renewalProbability: 60,
    renewalStatus: "Likely"
  },
];

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

export function ContractRenewalReport({ period }: ContractRenewalReportProps) {
  // Create pie chart data
  const pieData = renewalPredictionData.map(item => ({
    name: item.status,
    value: item.percentage,
    color: item.color
  }));
  
  // Calculate total revenue at risk
  const totalRevenueAtRisk = upcomingRenewals
    .filter(renewal => renewal.renewalStatus === "At Risk" || renewal.renewalStatus === "Unlikely")
    .reduce((sum, renewal) => sum + renewal.revenue, 0);
  
  // Get badge color based on renewal status
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "Very Likely": return "bg-green-500 hover:bg-green-600";
      case "Likely": return "bg-blue-500 hover:bg-blue-600";
      case "At Risk": return "bg-amber-500 hover:bg-amber-600";
      case "Unlikely": return "bg-red-500 hover:bg-red-600";
      default: return "";
    }
  };
  
  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Renewal Rate Prediction</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">85%</div>
            <p className="text-xs text-muted-foreground">
              For contracts expiring this quarter
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Contracts Expiring</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">
              In the next 90 days
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue at Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{(totalRevenueAtRisk/100000).toFixed(1)}L</div>
            <p className="text-xs text-muted-foreground">
              From at-risk contracts
            </p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Renewal Prediction Distribution</CardTitle>
            <CardDescription>Based on client satisfaction and history</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Contract Renewals</CardTitle>
            <CardDescription>Contracts expiring in next 90 days</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Probability</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingRenewals.map((renewal, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{renewal.client}</TableCell>
                    <TableCell>{formatDate(renewal.expiryDate)}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <span className="w-8 text-sm">{renewal.renewalProbability}%</span>
                        <Progress value={renewal.renewalProbability} className="h-2 ml-2" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusBadgeColor(renewal.renewalStatus)}>
                        {renewal.renewalStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Recommended Actions</CardTitle>
          <CardDescription>For contracts at risk of non-renewal</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-1">Westside Mall (At Risk)</h4>
              <ul className="list-disc pl-5 space-y-1">
                <li>Schedule client meeting by June 20th to address concerns about guard punctuality</li>
                <li>Prepare service improvement plan with focus on their specific requirements</li>
                <li>Consider offering 5% loyalty discount for renewal</li>
                <li>
                  <Button variant="link" className="h-auto p-0 text-sm" asChild>
                    <a href="#"><FileText className="h-3 w-3 mr-1 inline" /> View client history report</a>
                  </Button>
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium mb-1">Grand Hotel Chain (Likely)</h4>
              <ul className="list-disc pl-5 space-y-1">
                <li>Conduct satisfaction survey to identify improvement areas</li>
                <li>Prepare early renewal offer with additional value-added services</li>
                <li>Schedule site visit to assess changing security needs</li>
              </ul>
            </div>
            
            <div className="pt-2">
              <Button size="sm" className="mr-2">
                <ExternalLink className="h-4 w-4 mr-2" /> Generate Detailed Report
              </Button>
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-2" /> Export Action Plan
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
