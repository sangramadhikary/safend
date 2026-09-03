'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function MonthlyCashRequirementsTable() {
  // Monthly cash requirements (loaded from database when available)
  const monthlyCashRequirements: { month: string; patrol: number; fuel: number; equipment: number; other: number; total: number }[] = [];
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Monthly Cash Requirements</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Patrol</TableHead>
              <TableHead className="text-right">Fuel</TableHead>
              <TableHead className="text-right">Equipment</TableHead>
              <TableHead className="text-right">Other</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthlyCashRequirements.map((month) => (
              <TableRow key={month.month}>
                <TableCell className="font-medium">{month.month}</TableCell>
                <TableCell className="text-right">₹{month.patrol.toLocaleString()}</TableCell>
                <TableCell className="text-right">₹{month.fuel.toLocaleString()}</TableCell>
                <TableCell className="text-right">₹{month.equipment.toLocaleString()}</TableCell>
                <TableCell className="text-right">₹{month.other.toLocaleString()}</TableCell>
                <TableCell className="text-right font-bold">₹{month.total.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
