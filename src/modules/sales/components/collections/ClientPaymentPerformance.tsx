'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// Mock client payment performance data
const clientPaymentData = [
  { 
    id: "CLI-001", 
    name: "Apex Corporate Solutions", 
    totalBilled: 450000, 
    collected: 428000, 
    outstanding: 22000,
    avgDaysToPayment: 12,
    status: "Excellent"
  },
  { 
    id: "CLI-015", 
    name: "Metro Residential Society", 
    totalBilled: 325000, 
    collected: 285000, 
    outstanding: 40000,
    avgDaysToPayment: 25,
    status: "Good" 
  },
  { 
    id: "CLI-008", 
    name: "Industrial Park Ltd", 
    totalBilled: 560000, 
    collected: 420000, 
    outstanding: 140000,
    avgDaysToPayment: 45,
    status: "Average" 
  },
  { 
    id: "CLI-022", 
    name: "Westside Mall", 
    totalBilled: 280000, 
    collected: 180000, 
    outstanding: 100000,
    avgDaysToPayment: 62,
    status: "Poor" 
  },
  { 
    id: "CLI-019", 
    name: "Grand Hotel Chain", 
    totalBilled: 175000, 
    collected: 120000, 
    outstanding: 55000,
    avgDaysToPayment: 35,
    status: "Average" 
  }
];

// Function to get badge color based on payment status
const getStatusBadge = (status: string) => {
  switch (status) {
    case "Excellent":
      return "bg-green-500 hover:bg-green-600";
    case "Good":
      return "bg-blue-500 hover:bg-blue-600";
    case "Average":
      return "bg-amber-500 hover:bg-amber-600";
    case "Poor":
      return "bg-red-500 hover:bg-red-600";
    default:
      return "";
  }
};

export function ClientPaymentPerformance() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Client Payment Performance</CardTitle>
        <CardDescription>Payment behavior of key clients</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead className="text-right">Billed (₹)</TableHead>
              <TableHead className="text-right">Collected (₹)</TableHead>
              <TableHead className="text-right">Outstanding (₹)</TableHead>
              <TableHead className="text-center">Avg. Days</TableHead>
              <TableHead className="text-center">Payment Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientPaymentData.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="font-medium">{client.name}</TableCell>
                <TableCell className="text-right">{(client.totalBilled/100000).toFixed(1)}L</TableCell>
                <TableCell className="text-right">{(client.collected/100000).toFixed(1)}L</TableCell>
                <TableCell className="text-right">{(client.outstanding/100000).toFixed(1)}L</TableCell>
                <TableCell className="text-center">{client.avgDaysToPayment}</TableCell>
                <TableCell className="text-center">
                  <Badge className={getStatusBadge(client.status)}>{client.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
