'use client';

import { useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle, Clock, AlertTriangle, CalendarClock, IndianRupee, Receipt,
} from "lucide-react";
import { useBillStore } from "./billStore";
import { BillPayment, PaymentStatus, PAYMENT_STATUS_LABELS } from "./types";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { format, isBefore, startOfDay, addDays } from "date-fns";

interface PaymentsListProps {
  searchQuery: string;
  onMarkPaid: (payment: BillPayment) => void;
}

export function PaymentsList({ searchQuery, onMarkPaid }: PaymentsListProps) {
  const { payments, bills, isLoadingPayments } = useBillStore();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Enrich payments with bill info
  const enrichedPayments = payments.map(payment => {
    const bill = bills.find(b => b.id === payment.bill_id);
    return {
      ...payment,
      bill_name: bill?.name || 'Unknown',
      bill_category: bill?.category || 'other',
      vendor_name: bill?.vendor_name || 'Unknown',
    };
  });

  // Determine real-time status (overdue detection)
  const today = startOfDay(new Date());
  const paymentsWithStatus = enrichedPayments.map(p => {
    if ((p.status === 'upcoming' || p.status === 'due') && isBefore(new Date(p.due_date), today)) {
      return { ...p, status: 'overdue' as PaymentStatus };
    }
    return p;
  });

  // Filter
  let filtered = paymentsWithStatus;
  if (statusFilter !== 'all') {
    filtered = filtered.filter(p => p.status === statusFilter);
  }
  if (searchQuery) {
    filtered = filtered.filter(p =>
      p.bill_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.vendor_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.period_label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.payment_code.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  // Sort: overdue first, then by due date
  filtered.sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1;
    if (b.status === 'overdue' && a.status !== 'overdue') return 1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  const getStatusBadge = (status: PaymentStatus) => {
    switch (status) {
      case 'upcoming':
        return <Badge variant="outline" className="text-blue-600 border-blue-300">Upcoming</Badge>;
      case 'due':
        return <Badge className="bg-yellow-100 text-yellow-800">Due</Badge>;
      case 'overdue':
        return <Badge variant="destructive">Overdue</Badge>;
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80">Paid</Badge>;
      case 'partially_paid':
        return <Badge className="bg-orange-100 text-orange-800">Partial</Badge>;
      case 'waived':
        return <Badge variant="secondary">Waived</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoadingPayments) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingAnimation size="md" />
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <CalendarClock className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Payments Yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Payments will appear here once you add recurring bills. Each billing cycle generates a payment entry automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="due">Due Now</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partially_paid">Partially Paid</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {filtered.length} payment{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Bill</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No payments match your filter
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((payment) => {
                  const isOverdue = payment.status === 'overdue';
                  return (
                    <TableRow
                      key={payment.id}
                      className={`hover:bg-muted/30 ${isOverdue ? 'bg-red-50/50' : ''}`}
                    >
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="font-medium text-sm">{payment.bill_name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{payment.payment_code}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">{payment.period_label}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{payment.vendor_name}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {isOverdue && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                          <span className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                            {format(new Date(payment.due_date), 'dd MMM yyyy')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-semibold">{payment.total_amount.toLocaleString()}</span>
                        </div>
                        {payment.paid_amount > 0 && payment.status !== 'paid' && (
                          <div className="text-xs text-green-600">
                            Paid: ₹{payment.paid_amount.toLocaleString()}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(payment.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        {(payment.status === 'upcoming' || payment.status === 'due' || payment.status === 'overdue' || payment.status === 'partially_paid') ? (
                          <Button
                            size="sm"
                            variant={isOverdue ? "destructive" : "outline-solid"}
                            onClick={() => onMarkPaid(payment)}
                            className="text-xs"
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                            Pay
                          </Button>
                        ) : payment.status === 'paid' ? (
                          <div className="flex items-center justify-end gap-1 text-xs text-green-600">
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span>{payment.payment_date ? format(new Date(payment.payment_date), 'dd MMM') : 'Paid'}</span>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
