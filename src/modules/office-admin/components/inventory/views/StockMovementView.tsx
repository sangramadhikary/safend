'use client';

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, ArrowUpCircle, ArrowDownCircle, RotateCcw, Settings2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore } from "../inventoryStore";
import { format } from "date-fns";

interface Props {
  branch: string;
  searchQuery: string;
}

export function StockMovementView({ branch, searchQuery }: Props) {
  const transactions = useInventoryStore(s => s.transactions);
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = transactions.filter(t => {
    if (t.branch !== branch) return false;
    if (typeFilter !== "all" && t.transactionType !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return t.itemName.toLowerCase().includes(q) || t.reference?.toLowerCase().includes(q);
    }
    return true;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'purchase': return <ArrowUpCircle className="h-4 w-4 text-green-500" />;
      case 'issue': case 'event_allocation': return <ArrowDownCircle className="h-4 w-4 text-red-500" />;
      case 'return': case 'event_recall': return <RotateCcw className="h-4 w-4 text-blue-500" />;
      default: return <Settings2 className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const labels: Record<string, { label: string; variant: string }> = {
      purchase: { label: 'Purchase', variant: 'bg-green-100 text-green-800' },
      issue: { label: 'Issued', variant: 'bg-red-100 text-red-800' },
      return: { label: 'Return', variant: 'bg-blue-100 text-blue-800' },
      event_allocation: { label: 'Event Alloc.', variant: 'bg-purple-100 text-purple-800' },
      event_recall: { label: 'Event Recall', variant: 'bg-indigo-100 text-indigo-800' },
      adjustment: { label: 'Adjustment', variant: 'bg-gray-100 text-gray-800' },
      damage: { label: 'Damage', variant: 'bg-orange-100 text-orange-800' },
    };
    const info = labels[type] || { label: type, variant: 'bg-gray-100 text-gray-800' };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${info.variant}`}>{info.label}</span>;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Stock Movement Ledger</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="issue">Issue</SelectItem>
                <SelectItem value="return">Return</SelectItem>
                <SelectItem value="event_allocation">Event Allocation</SelectItem>
                <SelectItem value="event_recall">Event Recall</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Download className="h-3.5 w-3.5 mr-1" /> Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Before</TableHead>
                <TableHead className="text-right">After</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No transactions found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell className="text-sm">
                      {format(new Date(txn.timestamp), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{txn.itemName}</TableCell>
                    <TableCell>{getTypeBadge(txn.transactionType)}</TableCell>
                    <TableCell className={`text-right font-bold ${txn.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {txn.quantity > 0 ? `+${txn.quantity}` : txn.quantity}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{txn.previousStock}</TableCell>
                    <TableCell className="text-right font-medium">{txn.newStock}</TableCell>
                    <TableCell className="font-mono text-xs">{txn.reference || '—'}</TableCell>
                    <TableCell className="text-sm">{txn.performedBy}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
