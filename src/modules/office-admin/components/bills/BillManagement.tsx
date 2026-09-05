'use client';

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search, Plus, Receipt, CalendarClock, AlertTriangle,
  IndianRupee, Pause, Activity,
} from "lucide-react";
import { useAppData } from "@/contexts/AppDataContext";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useBillStore } from "./billStore";
import { RecurringBillsList } from "./RecurringBillsList";
import { PaymentsList } from "./PaymentsList";
import { BillForm } from "./BillForm";
import { PaymentDialog } from "./PaymentDialog";
import { RecurringBill, BillPayment } from "./types";
import { CountUp } from "@/components/dashboard/CountUp";
import { formatINR, formatINRShort } from "@/lib/format";

export function BillManagement() {
  const { activeBranch, branches, isLoading } = useAppData();
  const {
    fetchBills, fetchPayments, generateUpcomingPayments, getBillStats,
  } = useBillStore();

  const [activeTab, setActiveTab] = useState("recurring");
  const [searchQuery, setSearchQuery] = useState("");
  const [showBillForm, setShowBillForm] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [paymentToPay, setPaymentToPay] = useState<BillPayment | null>(null);

  // Fetch data when branch changes
  useEffect(() => {
    if (activeBranch) {
      fetchBills(activeBranch);
      fetchPayments(activeBranch);
    }
  }, [activeBranch, fetchBills, fetchPayments]);

  // Auto-generate upcoming payments after bills load
  useEffect(() => {
    if (activeBranch) {
      generateUpcomingPayments(activeBranch);
    }
  }, [activeBranch, generateUpcomingPayments]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <BrandLoader size="lg" />
      </div>
    );
  }

  const activeBranchName = branches.find(b => b.id === activeBranch)?.name || 'Unknown Branch';
  const stats = getBillStats();

  const handleBillFormSuccess = () => {
    setShowBillForm(false);
    setEditingBillId(null);
    fetchBills(activeBranch);
    generateUpcomingPayments(activeBranch);
  };

  const handleEditBill = (billId: string) => {
    setEditingBillId(billId);
    setShowBillForm(true);
  };

  const handlePaymentSuccess = () => {
    setPaymentToPay(null);
    fetchPayments(activeBranch);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Bills & Subscriptions</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage recurring bills, track payments, and monitor due dates — {activeBranchName}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <Activity className="h-4 w-4 text-green-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Bills</p>
              <p className="text-xl font-bold"><CountUp to={stats.active} duration={2} separator="," /></p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100">
              <Pause className="h-4 w-4 text-yellow-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Paused</p>
              <p className="text-xl font-bold"><CountUp to={stats.paused} duration={2} separator="," /></p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <IndianRupee className="h-4 w-4 text-blue-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Monthly Avg</p>
              <p className="text-xl font-bold" title={formatINR(Math.round(stats.totalMonthly))}><CountUp to={Math.round(stats.totalMonthly)} duration={2} formatter={formatINRShort} /></p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100">
              <AlertTriangle className="h-4 w-4 text-red-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="text-xl font-bold text-red-600"><CountUp to={stats.overdue} duration={2} separator="," /></p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100">
              <CalendarClock className="h-4 w-4 text-orange-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Due This Week</p>
              <p className="text-xl font-bold">{stats.dueThisWeek}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="recurring" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Recurring Bills
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Payments & Due
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={activeTab === "recurring" ? "Search bills..." : "Search payments..."}
                className="pl-8"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            {activeTab === "recurring" && (
              <Button size="sm" onClick={() => setShowBillForm(true)} className="whitespace-nowrap">
                <Plus className="h-4 w-4 mr-1" />
                Add Bill
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="recurring" className="mt-6">
          <RecurringBillsList
            searchQuery={searchQuery}
            onEdit={handleEditBill}
          />
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <PaymentsList
            searchQuery={searchQuery}
            onMarkPaid={(payment) => setPaymentToPay(payment)}
          />
        </TabsContent>
      </Tabs>

      {/* Bill Form Dialog */}
      <Dialog open={showBillForm} onOpenChange={(open) => {
        if (!open) { setShowBillForm(false); setEditingBillId(null); }
      }}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBillId ? 'Edit Bill' : 'Add Recurring Bill'}</DialogTitle>
          </DialogHeader>
          <BillForm
            billId={editingBillId}
            branchId={activeBranch}
            onSuccess={handleBillFormSuccess}
            onCancel={() => { setShowBillForm(false); setEditingBillId(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Payment Dialog — wide enough for the 3-column meter reading grids */}
      <Dialog open={!!paymentToPay} onOpenChange={() => setPaymentToPay(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {paymentToPay && (
            <PaymentDialog
              payment={paymentToPay}
              onSuccess={handlePaymentSuccess}
              onCancel={() => setPaymentToPay(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
