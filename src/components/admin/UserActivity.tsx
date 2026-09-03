'use client';

import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface UserActivityProps {
  branchFilter: string | null;
}

export function UserActivity({ branchFilter }: UserActivityProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>User Activity</CardTitle>
        <CardDescription>
          {branchFilter 
            ? `View user activity for this branch`
            : 'Monitor user activity across all branches'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Activity</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Date & Time</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Rahul Sharma</TableCell>
              <TableCell>Added new employee</TableCell>
              <TableCell>HR</TableCell>
              <TableCell>{branchFilter ? "Current Branch" : "Main Branch (HQ)"}</TableCell>
              <TableCell>Today, 10:30 AM</TableCell>
              <TableCell><Badge className="bg-green-500">Completed</Badge></TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Priya Patel</TableCell>
              <TableCell>Updated leave policy</TableCell>
              <TableCell>HR</TableCell>
              <TableCell>{branchFilter ? "Current Branch" : "Main Branch (HQ)"}</TableCell>
              <TableCell>Today, 09:15 AM</TableCell>
              <TableCell><Badge className="bg-green-500">Completed</Badge></TableCell>
            </TableRow>
            {!branchFilter && (
              <TableRow>
                <TableCell className="font-medium">Arun Kumar</TableCell>
                <TableCell>Created new sales order</TableCell>
                <TableCell>Sales</TableCell>
                <TableCell>Mumbai Branch</TableCell>
                <TableCell>Yesterday, 4:45 PM</TableCell>
                <TableCell><Badge className="bg-green-500">Completed</Badge></TableCell>
              </TableRow>
            )}
            <TableRow>
              <TableCell className="font-medium">Vikram Singh</TableCell>
              <TableCell>Generated payroll report</TableCell>
              <TableCell>Accounts</TableCell>
              <TableCell>{branchFilter ? "Current Branch" : "Main Branch (HQ)"}</TableCell>
              <TableCell>Yesterday, 2:30 PM</TableCell>
              <TableCell><Badge className="bg-green-500">Completed</Badge></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
