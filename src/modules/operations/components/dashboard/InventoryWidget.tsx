'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package } from "lucide-react";
import { format } from 'date-fns';

interface InventoryItem {
  id: string;
  itemName: string;
  quantity: number;
  txnType: 'issue' | 'return' | 'damage';
  employeeName?: string;
  postName?: string;
  txnDate: string;
}

interface InventoryWidgetProps {
  data: InventoryItem[];
  config?: Record<string, any>;
}

export default function InventoryWidget({ data, config }: InventoryWidgetProps) {
  const defaultConfig = {
    showIssued: true,
    showReturned: true,
    showDamaged: false,
    limit: 5,
  };

  // Combine default config with user customizations
  const widgetConfig = config ? { ...defaultConfig, ...config } : defaultConfig;

  // Filter data based on config
  const filteredData = data
    .filter(item => {
      if (item.txnType === 'issue' && !widgetConfig.showIssued) return false;
      if (item.txnType === 'return' && !widgetConfig.showReturned) return false;
      if (item.txnType === 'damage' && !widgetConfig.showDamaged) return false;
      return true;
    })
    .sort((a, b) => new Date(b.txnDate).getTime() - new Date(a.txnDate).getTime())
    .slice(0, widgetConfig.limit);

  // Format date
  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'MMM d, HH:mm');
  };

  // Get badge for transaction type
  const getTransactionBadge = (txnType: string) => {
    switch (txnType) {
      case 'issue':
        return <Badge className="bg-blue-500">Issued</Badge>;
      case 'return':
        return <Badge className="bg-green-500">Returned</Badge>;
      case 'damage':
        return <Badge className="bg-red-500">Damaged</Badge>;
      default:
        return <Badge>{txnType}</Badge>;
    }
  };

  if (data.length === 0) {
    return (
      <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground">
        <Package className="h-12 w-12 mb-2 opacity-50" />
        <p>No inventory transactions found</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[260px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Item</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredData.length > 0 ? (
            filteredData.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  <div>{item.itemName}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.employeeName || item.postName}
                  </div>
                </TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{getTransactionBadge(item.txnType)}</TableCell>
                <TableCell className="text-right">{formatDate(item.txnDate)}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                No transactions found matching your filters
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
