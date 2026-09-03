'use client';

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface MessMealRecord {
  id: string;
  employee_name: string;
  post_name: string;
  meal_count: number;
  per_meal_cost: number | null;
  total_charge: number | null;
}

interface MessTableProps {
  records: MessMealRecord[];
  isLoading?: boolean;
}

export function MessTable({ records, isLoading }: MessTableProps) {
  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading records...</div>;
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No meal records found for this week
      </div>
    );
  }

  const totalMeals = records.reduce((sum, r) => sum + r.meal_count, 0);
  const totalCharge = records.reduce((sum, r) => sum + (r.total_charge || 0), 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Post</TableHead>
            <TableHead className="text-center">Meals</TableHead>
            <TableHead className="text-right">Per Meal Cost</TableHead>
            <TableHead className="text-right">Total Charge</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="font-medium">{record.employee_name}</TableCell>
              <TableCell>{record.post_name}</TableCell>
              <TableCell className="text-center">
                <Badge variant="secondary">{record.meal_count}</Badge>
              </TableCell>
              <TableCell className="text-right">
                {record.per_meal_cost ? `₹${record.per_meal_cost}` : '—'}
              </TableCell>
              <TableCell className="text-right font-medium">
                {record.total_charge ? `₹${record.total_charge.toLocaleString()}` : '—'}
              </TableCell>
            </TableRow>
          ))}
          {/* Totals row */}
          <TableRow className="font-bold bg-gray-50 dark:bg-gray-900">
            <TableCell colSpan={2}>Total</TableCell>
            <TableCell className="text-center">{totalMeals}</TableCell>
            <TableCell />
            <TableCell className="text-right">
              {totalCharge > 0 ? `₹${totalCharge.toLocaleString()}` : '—'}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
