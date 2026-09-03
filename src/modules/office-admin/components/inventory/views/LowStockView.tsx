'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { useInventoryStore } from "../inventoryStore";
import { SUB_CATEGORY_LABELS } from "../types";

interface Props {
  branch: string;
}

export function LowStockView({ branch }: Props) {
  const getLowStockItems = useInventoryStore(s => s.getLowStockItems);
  const lowStockItems = getLowStockItems(branch);

  return (
    <div className="space-y-4">
      {lowStockItems.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-3">
          <AlertTriangle className="text-amber-600 mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h3 className="font-semibold text-amber-800">Restock Required</h3>
            <p className="text-amber-700 text-sm">
              {lowStockItems.length} item(s) are at or below reorder level. Create purchase orders to restock.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Low Stock & Out of Stock Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Reorder Level</TableHead>
                  <TableHead className="text-right">Deficit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      All items are well stocked 🎉
                    </TableCell>
                  </TableRow>
                ) : (
                  lowStockItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.itemCode}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-sm">{SUB_CATEGORY_LABELS[item.subCategory]}</TableCell>
                      <TableCell className="text-right text-red-600 font-bold">{item.currentStock}</TableCell>
                      <TableCell className="text-right">{item.reorderLevel}</TableCell>
                      <TableCell className="text-right font-medium text-red-600">
                        -{item.reorderLevel - item.currentStock}
                      </TableCell>
                      <TableCell>
                        {item.currentStock === 0 ? (
                          <Badge variant="destructive">Out of Stock</Badge>
                        ) : (
                          <Badge variant="destructive" className="bg-amber-500">Low Stock</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" className="text-xs">
                          <ShoppingCart className="h-3 w-3 mr-1" /> Create PO
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
