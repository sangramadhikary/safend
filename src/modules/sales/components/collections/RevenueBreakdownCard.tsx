'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from "recharts";

// Mock data for revenue breakdown
const revenueBreakdownData = [
  { name: "Corporate", value: 45, color: "#4f46e5" },
  { name: "Residential", value: 22, color: "#22c55e" },
  { name: "Industrial", value: 18, color: "#f59e0b" },
  { name: "Event Security", value: 10, color: "#6366f1" },
  { name: "Other", value: 5, color: "#a1a1aa" }
];

const COLORS = ["#4f46e5", "#22c55e", "#f59e0b", "#6366f1", "#a1a1aa"];

export function RevenueBreakdownCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue Breakdown</CardTitle>
        <CardDescription>By client segment</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={revenueBreakdownData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {revenueBreakdownData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${value}%`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
