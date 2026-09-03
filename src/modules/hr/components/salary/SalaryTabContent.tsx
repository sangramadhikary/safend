'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface SalaryData {
  id: string;
  name: string;
  designation: string;
  shifts: number;
  dutyEarnings: number;
  baseSalary: number;
  basic: number;
  hra: number;
  otherAllowances: number;
  totalAllowances: number;
  pfDeduction: number;
  esiDeduction: number;
  professionalTax: number;
  grossSalary: number;
  totalDeduction: number;
  netSalary: number;
}

interface SalaryTabContentProps {
  salaryData: SalaryData[];
  selectedMonth: string;
  onGenerateSlip: (employeeId: string) => void;
}

export function SalaryTabContent({ 
  salaryData, 
  selectedMonth,
  onGenerateSlip 
}: SalaryTabContentProps) {
  const [searchTerm, setSearchTerm] = useState("");
  
  // Filter salary data based on search term
  const filteredData = salaryData.filter(salary => 
    salary.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    salary.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    salary.designation.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <CardTitle>Employee Salaries - {selectedMonth}</CardTitle>
            <CardDescription>
              Based on confirmed duty assignments and post rates
            </CardDescription>
          </div>
          <div className="w-full md:w-64">
            <Input
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Shifts</TableHead>
              <TableHead>Duty Earnings</TableHead>
              <TableHead>Basic</TableHead>
              <TableHead>HRA</TableHead>
              <TableHead>Allowances</TableHead>
              <TableHead>Gross Salary</TableHead>
              <TableHead>Deductions</TableHead>
              <TableHead>Net Salary</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length > 0 ? (
              filteredData.map((salary) => (
                <TableRow key={salary.id}>
                  <TableCell>{salary.id}</TableCell>
                  <TableCell>{salary.name}</TableCell>
                  <TableCell>{salary.designation}</TableCell>
                  <TableCell>{salary.shifts}</TableCell>
                  <TableCell>₹{salary.dutyEarnings?.toLocaleString() || 0}</TableCell>
                  <TableCell>₹{salary.basic.toLocaleString()}</TableCell>
                  <TableCell>₹{salary.hra.toLocaleString()}</TableCell>
                  <TableCell>₹{(salary.otherAllowances + salary.totalAllowances).toLocaleString()}</TableCell>
                  <TableCell>₹{salary.grossSalary.toLocaleString()}</TableCell>
                  <TableCell>₹{salary.totalDeduction.toLocaleString()}</TableCell>
                  <TableCell className="font-bold">₹{salary.netSalary.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => onGenerateSlip(salary.id)}
                      >
                        <FileText className="h-4 w-4 mr-1" /> Slip
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-6">
                  {searchTerm ? "No employees found matching your search" : "No salary data available for the selected month"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
