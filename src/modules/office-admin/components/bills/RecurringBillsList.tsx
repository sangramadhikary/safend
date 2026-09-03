'use client';

import { useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MoreVertical, Edit, Trash2, Pause, Play, Receipt,
  Calendar, IndianRupee,
} from "lucide-react";
import { useBillStore } from "./billStore";
import {
  RecurringBill, BILL_CATEGORY_LABELS, BILL_FREQUENCY_LABELS,
  BillCategory, BillStatus,
} from "./types";
import { useToast } from "@/hooks/use-toast";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { format } from "date-fns";

interface RecurringBillsListProps {
  searchQuery: string;
  onEdit: (billId: string) => void;
}

export function RecurringBillsList({ searchQuery, onEdit }: RecurringBillsListProps) {
  const { bills, isLoadingBills, deleteBill, toggleBillStatus } = useBillStore();
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredBills = bills.filter(bill =>
    bill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bill.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bill.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bill.bill_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    const result = await deleteBill(deleteId);
    setIsDeleting(false);
    setDeleteId(null);

    if (result.success) {
      toast({ title: "Bill Deleted", description: "Recurring bill has been removed." });
    } else {
      toast({ title: "Error", description: result.error || "Failed to delete", variant: "destructive" });
    }
  };

  const handleToggleStatus = async (bill: RecurringBill) => {
    const newStatus: BillStatus = bill.status === 'active' ? 'paused' : 'active';
    const result = await toggleBillStatus(bill.id, newStatus);
    if (result.success) {
      toast({
        title: newStatus === 'paused' ? "Bill Paused" : "Bill Resumed",
        description: `${bill.name} is now ${newStatus}.`,
      });
    } else {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  };

  const getStatusBadge = (status: BillStatus) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80">Active</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100/80">Paused</Badge>;
      case 'expired':
        return <Badge variant="secondary">Expired</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getFrequencyBadge = (frequency: string) => {
    const colors: Record<string, string> = {
      monthly: 'bg-blue-50 text-blue-700',
      quarterly: 'bg-purple-50 text-purple-700',
      half_yearly: 'bg-indigo-50 text-indigo-700',
      yearly: 'bg-teal-50 text-teal-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[frequency] || ''}`}>
        {BILL_FREQUENCY_LABELS[frequency as keyof typeof BILL_FREQUENCY_LABELS] || frequency}
      </span>
    );
  };

  if (isLoadingBills) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingAnimation size="md" />
      </div>
    );
  }

  if (bills.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Recurring Bills</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Add your first recurring bill to track rent, utilities, subscriptions, and other periodic expenses.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Bill</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Next Due</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No bills match your search
                  </TableCell>
                </TableRow>
              ) : (
                filteredBills.map((bill) => (
                  <TableRow key={bill.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-medium">{bill.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{bill.bill_code}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm capitalize">
                        {BILL_CATEGORY_LABELS[bill.category]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{bill.vendor_name}</span>
                    </TableCell>
                    <TableCell>
                      {getFrequencyBadge(bill.frequency)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {format(new Date(bill.next_due_date), 'dd MMM yyyy')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-semibold">{bill.total_amount.toLocaleString()}</span>
                      </div>
                      {bill.tax_percentage > 0 && (
                        <div className="text-xs text-muted-foreground">
                          incl. {bill.tax_percentage}% tax
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(bill.status)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(bill.id)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Bill
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleStatus(bill)}>
                            {bill.status === 'active' ? (
                              <><Pause className="h-4 w-4 mr-2" /> Pause Bill</>
                            ) : (
                              <><Play className="h-4 w-4 mr-2" /> Resume Bill</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteId(bill.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Bill
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recurring Bill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this bill and all its payment history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
