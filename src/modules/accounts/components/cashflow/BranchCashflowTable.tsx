'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from "@/components/ui/badge";
import { BuildingIcon } from 'lucide-react';

export function BranchCashflowTable() {
  // Branch cash flow data (loaded from database when available)
  const branches: { id: string; name: string; pending: number; settled: number; overdue: number }[] = [];
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Branch Cash Flow Status</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">Pending Advances</TableHead>
              <TableHead className="text-right">Settled Amount</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((branch) => (
              <TableRow key={branch.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center">
                    <BuildingIcon className="h-4 w-4 mr-2" />
                    {branch.name}
                  </div>
                </TableCell>
                <TableCell className="text-right">₹{branch.pending.toLocaleString()}</TableCell>
                <TableCell className="text-right">₹{branch.settled.toLocaleString()}</TableCell>
                <TableCell className="text-right">₹{branch.overdue.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  {branch.overdue > 0 ? (
                    <Badge variant="secondary" className="bg-amber-500 text-white">
                      Attention Needed
                    </Badge>
                  ) : (
                    <Badge variant="default" className="bg-green-500">
                      Good Standing
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
