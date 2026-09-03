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
import { Button } from "@/components/ui/button";
import { PenLine, Plus, Trash2 } from "lucide-react";

interface RoleManagementProps {
  branchFilter: string | null;
}

export function RoleManagement({ branchFilter }: RoleManagementProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>Role Management</CardTitle>
          <CardDescription>
            {branchFilter 
              ? `Manage roles for this branch` 
              : 'Create and manage user roles across all branches'}
          </CardDescription>
        </div>
        <Button size="sm" className="gap-1">
          <Plus className="h-4 w-4" />
          New Role
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Branch Admin</TableCell>
              <TableCell>Full control over branch operations</TableCell>
              <TableCell>2</TableCell>
              <TableCell>
                <Badge variant="outline" className="bg-green-500 text-white">Active</Badge>
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <PenLine className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">HR Manager</TableCell>
              <TableCell>Full access to HR module</TableCell>
              <TableCell>3</TableCell>
              <TableCell>
                <Badge variant="outline" className="bg-green-500 text-white">Active</Badge>
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <PenLine className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Sales Executive</TableCell>
              <TableCell>Sales module with limited rights</TableCell>
              <TableCell>5</TableCell>
              <TableCell>
                <Badge variant="outline" className="bg-green-500 text-white">Active</Badge>
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <PenLine className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
