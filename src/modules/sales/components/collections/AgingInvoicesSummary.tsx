'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

// Mock aging buckets data
const agingBuckets = [
  { label: "Current (0-30 days)", amount: 950000, percentage: 40, color: "bg-green-500" },
  { label: "31-60 days", amount: 580000, percentage: 25, color: "bg-blue-500" },
  { label: "61-90 days", amount: 470000, percentage: 20, color: "bg-amber-500" },
  { label: "91-180 days", amount: 230000, percentage: 10, color: "bg-orange-500" },
  { label: "180+ days", amount: 115000, percentage: 5, color: "bg-red-500" }
];

export function AgingInvoicesSummary() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice Aging Summary</CardTitle>
        <CardDescription>Outstanding receivables by age</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {agingBuckets.map((bucket, index) => (
            <div key={index} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{bucket.label}</span>
                <span className="font-medium">₹{(bucket.amount/100000).toFixed(1)}L ({bucket.percentage}%)</span>
              </div>
              <Progress value={bucket.percentage} className={bucket.color} />
            </div>
          ))}
        </div>
        
        <div className="mt-6 pt-4 border-t">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Total Outstanding</span>
            <span className="text-lg font-bold">₹23.45L</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            As of {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
