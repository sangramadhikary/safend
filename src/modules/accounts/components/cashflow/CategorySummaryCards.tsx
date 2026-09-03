'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, CreditCard, FileCheck, Calendar, ArrowRightLeft } from 'lucide-react';

interface CategorySummaryProps {
  categorySummary: Record<string, { 
    count?: number; 
    totalAmount?: number; 
    settledAmount?: number; 
    outstandingAmount?: number;
  }>;
}

export function CategorySummaryCards({ categorySummary }: CategorySummaryProps) {
  if (!categorySummary || Object.keys(categorySummary).length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        No summary data available
      </div>
    );
  }
  
  return Object.entries(categorySummary).map(([category, data]) => (
    <Card key={category} className="overflow-hidden">
      <CardHeader className="bg-muted pb-2">
        <CardTitle className="text-sm font-medium flex items-center">
          {category === 'PATROL' && <MapPin className="h-4 w-4 mr-2" />}
          {category === 'FUEL' && <CreditCard className="h-4 w-4 mr-2" />}
          {category === 'EQUIPMENT' && <FileCheck className="h-4 w-4 mr-2" />}
          {category === 'TRAINING' && <Calendar className="h-4 w-4 mr-2" />}
          {category === 'OTHER' && <ArrowRightLeft className="h-4 w-4 mr-2" />}
          {category}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="text-2xl font-bold">₹{data.totalAmount?.toLocaleString() || 0}</div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Total Advances</span>
          <span>{data.count || 0} requests</span>
        </div>
        <div className="mt-2 pt-2 border-t">
          <div className="flex justify-between text-sm">
            <span>Settled</span>
            <span>₹{data.settledAmount?.toLocaleString() || 0}</span>
          </div>
          <div className="flex justify-between text-sm font-medium">
            <span>Outstanding</span>
            <span>₹{data.outstandingAmount?.toLocaleString() || 0}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  ));
}
