'use client';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface SalaryHeaderProps {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  onCalculate: () => void;
  onShowAdjustmentDialog: () => void;
}

export function SalaryHeader({
  selectedMonth,
  setSelectedMonth,
  onCalculate,
  onShowAdjustmentDialog
}: SalaryHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
      <div>
        <h2 className="text-2xl font-bold">Salary Calculation</h2>
        <p className="text-muted-foreground">
          Calculate salaries based on duty assignments and post rates
        </p>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center">
          <Label htmlFor="month-select" className="mr-2">Month:</Label>
          <Input 
            id="month-select"
            type="month" 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-40"
          />
        </div>
        
        <Button 
          onClick={onCalculate}
          className="bg-safend-red hover:bg-safend-red/90"
        >
          Calculate Salaries
        </Button>
        
        <Button 
          variant="outline" 
          onClick={onShowAdjustmentDialog}
        >
          Add Adjustment
        </Button>
      </div>
    </div>
  );
}
