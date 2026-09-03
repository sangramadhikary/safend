'use client';

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Eye, FileText, Clock, CheckCircle, XCircle, AlertTriangle,
  ShoppingCart, ArrowRight,
} from "lucide-react";
import { useVendorStore } from "./vendorStore";
import { PurchaseOrder, POStatus, PO_STATUS_LABELS } from "./types";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { formatDistanceToNow } from "date-fns";

interface PurchaseOrderListProps {
  searchQuery: string;
  onView: (po: PurchaseOrder) => void;
  onCreateNew: () => void;
}

const STATUS_CONFIG: Record<POStatus, { color: string; icon: React.ReactNode }> = {
  draft: { color: 'bg-gray-100 text-gray-700', icon: <FileText className="h-3 w-3" /> },
  submitted: { color: 'bg-blue-100 text-blue-700', icon: <ArrowRight className="h-3 w-3" /> },
  pending_approval: { color: 'bg-yellow-100 text-yellow-700', icon: <Clock className="h-3 w-3" /> },
  approved: { color: 'bg-green-100 text-green-700', icon: <CheckCircle className="h-3 w-3" /> },
  slip_generated: { color: 'bg-indigo-100 text-indigo-700', icon: <FileText className="h-3 w-3" /> },
  funded: { color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle className="h-3 w-3" /> },
  ordered: { color: 'bg-purple-100 text-purple-700', icon: <ShoppingCart className="h-3 w-3" /> },
  partially_received: { color: 'bg-orange-100 text-orange-700', icon: <AlertTriangle className="h-3 w-3" /> },
  received: { color: 'bg-teal-100 text-teal-700', icon: <CheckCircle className="h-3 w-3" /> },
  completed: { color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3 w-3" /> },
  rejected: { color: 'bg-red-100 text-red-700', icon: <XCircle className="h-3 w-3" /> },
  cancelled: { color: 'bg-gray-100 text-muted-foreground', icon: <XCircle className="h-3 w-3" /> },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  normal: 'bg-blue-50 text-blue-600',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export function PurchaseOrderList({ searchQuery, onView, onCreateNew }: PurchaseOrderListProps) {
  const { purchaseOrders, isLoadingPOs } = useVendorStore();

  const filteredPOs = purchaseOrders.filter(po =>
    po.po_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    po.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    po.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    po.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoadingPOs) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingAnimation size="md" />
      </div>
    );
  }

  if (purchaseOrders.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Purchase Orders</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
            Create your first purchase order to start the procurement workflow.
            POs go through approval, slip generation, and fund collection.
          </p>
          <Button onClick={onCreateNew}>Create First PO</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="rounded-md border-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>PO Number</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPOs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No purchase orders match your search
                  </TableCell>
                </TableRow>
              ) : (
                filteredPOs.map((po) => {
                  const statusConfig = STATUS_CONFIG[po.status];
                  return (
                    <TableRow key={po.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => onView(po)}>
                      <TableCell>
                        <span className="font-mono text-xs font-medium">{po.po_number}</span>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{po.title}</div>
                        {po.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {po.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{po.vendor_name}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-semibold text-sm">₹{po.grand_total.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">
                          {po.items?.length || 0} items
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[po.priority]}`}>
                          {po.priority.charAt(0).toUpperCase() + po.priority.slice(1)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                          {statusConfig.icon}
                          {PO_STATUS_LABELS[po.status]}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(po.created_at), { addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => { e.stopPropagation(); onView(po); }}
                        >
                          <Eye className="h-4 w-4" />
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
  );
}
