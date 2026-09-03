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
import { Switch } from "@/components/ui/switch";

interface UserPermissionsProps {
  branchFilter: string | null;
}

export function UserPermissions({ branchFilter }: UserPermissionsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>User Permissions</CardTitle>
        <CardDescription>
          {branchFilter 
            ? `Manage user permissions for this branch` 
            : 'Manage user permissions across all branches'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sales</TableHead>
              <TableHead>Operations</TableHead>
              <TableHead>HR</TableHead>
              <TableHead>Accounts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Rahul Sharma</TableCell>
              <TableCell>Branch Manager</TableCell>
              <TableCell>Main Branch (HQ)</TableCell>
              <TableCell>
                <Badge variant="outline" className="bg-green-500 text-white">Active</Badge>
              </TableCell>
              <TableCell><Switch checked /></TableCell>
              <TableCell><Switch checked /></TableCell>
              <TableCell><Switch checked /></TableCell>
              <TableCell><Switch checked /></TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Priya Patel</TableCell>
              <TableCell>HR Manager</TableCell>
              <TableCell>Main Branch (HQ)</TableCell>
              <TableCell>
                <Badge variant="outline" className="bg-green-500 text-white">Active</Badge>
              </TableCell>
              <TableCell><Switch /></TableCell>
              <TableCell><Switch /></TableCell>
              <TableCell><Switch checked /></TableCell>
              <TableCell><Switch /></TableCell>
            </TableRow>
            {!branchFilter && (
              <TableRow>
                <TableCell className="font-medium">Arun Kumar</TableCell>
                <TableCell>Branch Manager</TableCell>
                <TableCell>Mumbai Branch</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-green-500 text-white">Active</Badge>
                </TableCell>
                <TableCell><Switch checked /></TableCell>
                <TableCell><Switch checked /></TableCell>
                <TableCell><Switch /></TableCell>
                <TableCell><Switch checked /></TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
