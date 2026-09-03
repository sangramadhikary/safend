'use client';

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Eye, RotateCcw } from "lucide-react";
import { useInventoryStore } from "../inventoryStore";
import { InventoryDistribution, SUB_CATEGORY_LABELS, CATEGORY_LABELS } from "../types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";

interface Props {
  branch: string;
  searchQuery: string;
}

export function EmployeeTrackingView({ branch, searchQuery }: Props) {
  const distributions = useInventoryStore(s => s.distributions);
  const returnStock = useInventoryStore(s => s.returnStock);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

  // Get employee distributions
  const employeeDists = distributions.filter(
    d => d.branch === branch && d.targetType === 'employee'
  );

  // Group by employee
  const employeeMap = new Map<string, { name: string; items: InventoryDistribution[] }>();
  employeeDists.forEach(d => {
    if (!employeeMap.has(d.targetId)) {
      employeeMap.set(d.targetId, { name: d.targetName, items: [] });
    }
    employeeMap.get(d.targetId)!.items.push(d);
  });

  const employees = Array.from(employeeMap.entries()).filter(([_, data]) => {
    if (!searchQuery) return true;
    return data.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const selectedEmpData = selectedEmployee ? employeeMap.get(selectedEmployee) : null;

  const handleReturn = (distId: string) => {
    returnStock(distId, 1, 'good', 'Admin', 'Returned by employee');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            Employee Inventory Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Track all inventory items issued to individual employees. View their complete kit and manage returns.
          </p>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-center">Active Items</TableHead>
                  <TableHead className="text-center">Returned</TableHead>
                  <TableHead className="text-center">Lost/Damaged</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No employee distributions found
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map(([empId, data]) => {
                    const active = data.items.filter(i => i.status === 'active').length;
                    const returned = data.items.filter(i => i.status === 'returned').length;
                    const lost = data.items.filter(i => i.status === 'lost' || i.status === 'damaged').length;
                    return (
                      <TableRow key={empId}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{data.name}</p>
                            <p className="text-xs text-muted-foreground">{empId}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="default" className="bg-blue-600">{active}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{returned}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {lost > 0 ? <Badge variant="destructive">{lost}</Badge> : <span className="text-muted-foreground">0</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedEmployee(empId)}>
                            <Eye className="h-4 w-4 mr-1" /> View Kit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Employee Detail Dialog */}
      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Employee Kit - {selectedEmpData?.name}</DialogTitle>
            <DialogDescription>All inventory items assigned to this employee</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead>Issued Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedEmpData?.items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.itemName}</TableCell>
                    <TableCell className="text-sm">{CATEGORY_LABELS[item.itemCategory]}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-sm">{item.issuedDate}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === 'active' ? 'default' : 'outline-solid'}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.status === 'active' && (
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => handleReturn(item.id)}>
                          <RotateCcw className="h-3 w-3 mr-1" /> Return
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
