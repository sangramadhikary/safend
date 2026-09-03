'use client';

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { RevenueBreakdownCard } from "./RevenueBreakdownCard";
import { AgingInvoicesSummary } from "./AgingInvoicesSummary";
import { InvoiceStatusCards } from "./InvoiceStatusCards";
import { ClientPaymentPerformance } from "./ClientPaymentPerformance";

// Collection overview data for charts
const invoiceStatusData = [
  { name: "Paid", value: 65, color: "#22c55e" },
  { name: "Overdue", value: 18, color: "#ef4444" },
  { name: "Pending", value: 17, color: "#f59e0b" }
];

const monthlyCollectionData = [
  { month: "Jan", collected: 540000, target: 600000 },
  { month: "Feb", collected: 580000, target: 600000 },
  { month: "Mar", collected: 610000, target: 600000 },
  { month: "Apr", collected: 590000, target: 620000 },
  { month: "May", collected: 640000, target: 620000 },
  { month: "Jun", collected: 580000, target: 640000 }
];

const COLORS = ["#22c55e", "#ef4444", "#f59e0b"];

export function CollectionsDashboard() {
  const [timeframe, setTimeframe] = useState("monthly");
  
  // Financial metrics calculations
  const totalOutstanding = 2345000;
  const totalCollected = 9750000;
  const totalBilled = 12095000;
  const collectionEfficiency = (totalCollected / totalBilled * 100).toFixed(1);
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Collections Dashboard</h2>
          <p className="text-muted-foreground">
            Monitor and manage invoice collections and payment status
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Tabs defaultValue="monthly" value={timeframe} onValueChange={setTimeframe}>
            <TabsList>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
              <TabsTrigger value="yearly">Yearly</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
      
      {/* Key Metrics */}
      <InvoiceStatusCards 
        totalOutstanding={totalOutstanding} 
        totalCollected={totalCollected} 
        totalBilled={totalBilled} 
        collectionEfficiency={collectionEfficiency} 
      />
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Invoice Status Distribution */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Invoice Status</CardTitle>
            <CardDescription>Distribution by status</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={invoiceStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {invoiceStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        {/* Monthly Collections vs Target */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Collections vs Target</CardTitle>
            <CardDescription>Monthly collection performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyCollectionData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(value) => `₹${(value/1000)}k`} />
                  <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                  <Legend />
                  <Bar name="Collected" dataKey="collected" fill="#4f46e5" />
                  <Bar name="Target" dataKey="target" fill="#e11d48" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Additional report components */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AgingInvoicesSummary />
        <RevenueBreakdownCard />
      </div>
      
      <ClientPaymentPerformance />
    </div>
  );
}
