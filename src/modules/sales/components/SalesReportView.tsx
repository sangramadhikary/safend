'use client';

import { Card } from "@/components/ui/card";
import { useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Mock data for reports
const monthlySalesData = [
  { name: 'Jan', value: 124500 },
  { name: 'Feb', value: 156000 },
  { name: 'Mar', value: 178900 },
  { name: 'Apr', value: 187300 },
  { name: 'May', value: 0 },
  { name: 'Jun', value: 0 },
  { name: 'Jul', value: 0 },
  { name: 'Aug', value: 0 },
  { name: 'Sep', value: 0 },
  { name: 'Oct', value: 0 },
  { name: 'Nov', value: 0 },
  { name: 'Dec', value: 0 }
];

const conversionRateData = [
  { name: 'Jan', rate: 18 },
  { name: 'Feb', rate: 22 },
  { name: 'Mar', rate: 26 },
  { name: 'Apr', rate: 25 },
];

const leadSourceData = [
  { name: 'Website', value: 35 },
  { name: 'Referral', value: 25 },
  { name: 'Direct', value: 20 },
  { name: 'LinkedIn', value: 10 },
  { name: 'Exhibition', value: 5 },
  { name: 'Cold Call', value: 5 }
];

interface SalesReportViewProps {
  filter: string;
}

export function SalesReportView({ filter }: SalesReportViewProps) {
  // Format currency values
  const formatCurrency = (value: number) => {
    return `£${value.toLocaleString()}`;
  };

  // Format percentage values
  const formatPercentage = (value: number) => {
    return `${value}%`;
  };

  return (
    <div className="space-y-6">
      {filter === "Sales Performance" || filter === "All Reports" ? (
        <Card className="p-4">
          <h3 className="text-lg font-medium mb-4">Monthly Sales Performance</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlySalesData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(value) => `£${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar dataKey="value" name="Monthly Sales" fill="#ea384c" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Card className="p-3">
              <h4 className="text-sm font-semibold">Total Sales YTD</h4>
              <p className="text-xl font-bold text-safend-red">£646,700</p>
            </Card>
            <Card className="p-3">
              <h4 className="text-sm font-semibold">Average Monthly</h4>
              <p className="text-xl font-bold text-safend-red">£161,675</p>
            </Card>
            <Card className="p-3">
              <h4 className="text-sm font-semibold">YoY Growth</h4>
              <p className="text-xl font-bold text-green-600">+18.5%</p>
            </Card>
          </div>
        </Card>
      ) : null}
      
      {filter === "Conversion Rate" || filter === "All Reports" ? (
        <Card className="p-4">
          <h3 className="text-lg font-medium mb-4">Lead to Customer Conversion Rate</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={conversionRateData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 50]} tickFormatter={(value) => `${value}%`} />
                <Tooltip formatter={(value) => formatPercentage(Number(value))} />
                <Legend />
                <Line type="monotone" dataKey="rate" name="Conversion Rate" stroke="#8884d8" activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Card className="p-3">
              <h4 className="text-sm font-semibold">Average Rate</h4>
              <p className="text-xl font-bold text-safend-red">22.8%</p>
            </Card>
            <Card className="p-3">
              <h4 className="text-sm font-semibold">Best Month</h4>
              <p className="text-xl font-bold text-green-600">Mar (26%)</p>
            </Card>
            <Card className="p-3">
              <h4 className="text-sm font-semibold">YoY Change</h4>
              <p className="text-xl font-bold text-green-600">+4.2%</p>
            </Card>
          </div>
        </Card>
      ) : null}
      
      {filter === "Pipeline Status" || filter === "All Reports" ? (
        <Card className="p-4">
          <h3 className="text-lg font-medium mb-4">Current Sales Pipeline</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-3">
              <h4 className="text-sm font-semibold">Total Pipeline Value</h4>
              <p className="text-2xl font-bold text-safend-red">£835,000</p>
              <div className="mt-2 text-sm text-muted-foreground">24 opportunities</div>
            </Card>
            <Card className="p-3">
              <h4 className="text-sm font-semibold">Average Deal Size</h4>
              <p className="text-2xl font-bold text-safend-red">£34,792</p>
              <div className="mt-2 text-sm text-muted-foreground">+12% vs last quarter</div>
            </Card>
            <Card className="p-3">
              <h4 className="text-sm font-semibold">Expected to Close (30d)</h4>
              <p className="text-2xl font-bold text-green-600">£285,000</p>
              <div className="mt-2 text-sm text-muted-foreground">8 opportunities</div>
            </Card>
          </div>
          <div className="mt-4">
            <h4 className="text-sm font-semibold mb-2">Pipeline by Stage</h4>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
              <div className="flex h-full rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full" style={{ width: '40%' }}></div>
                <div className="bg-purple-500 h-full" style={{ width: '30%' }}></div>
                <div className="bg-amber-500 h-full" style={{ width: '20%' }}></div>
                <div className="bg-green-500 h-full" style={{ width: '10%' }}></div>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 mt-2 text-sm">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span>Discovery (40%)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                <span>Proposal (30%)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                <span>Negotiation (20%)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span>Closing (10%)</span>
              </div>
            </div>
          </div>
        </Card>
      ) : null}
      
      {/* Add other report types based on filter */}
    </div>
  );
}
