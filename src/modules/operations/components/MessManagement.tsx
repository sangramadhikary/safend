'use client';

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Plus, Calendar, Utensils, IndianRupee, FileText, Calculator
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useToastWithSound } from "@/hooks/use-toast-with-sound";
import { useMessWeeks, MessWeekWithPosts } from "../hooks/useMessWeeks";
import { useMessFundRequests } from "../hooks/useMessFundRequests";
import { useMessMealRecords } from "../hooks/useMessMealRecords";
import { useOperationalPosts } from "../hooks/useOperationalPosts";
import { WeeklyMealEntry } from "./mess/WeeklyMealEntry";
import { MessTable } from "./mess/MessTable";
// Static import — avoids unhandled dynamic import errors in event handlers.
import { supabaseClient } from "@/integrations/supabase/client";

export function MessManagement() {
  const [activeTab, setActiveTab] = useState("current");
  const [showNewWeekDialog, setShowNewWeekDialog] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<{ id: string; name: string }[]>([]);
  const [requestedAmount, setRequestedAmount] = useState<string>("");
  const [selectedWeek, setSelectedWeek] = useState<MessWeekWithPosts | null>(null);

  const { messWeeks, isLoading, createMessWeek } = useMessWeeks();
  const { fundRequests } = useMessFundRequests();
  const { posts } = useOperationalPosts();
  const { toast } = useToastWithSound();

  // Get current/active week (most recent non-deducted)
  const currentWeek = messWeeks.find(w =>
    w.status !== 'deducted'
  ) || messWeeks[0] || null;

  const activeWeek = selectedWeek || currentWeek;

  const { mealRecords, calculateCharges } = useMessMealRecords(activeWeek?.id);

  // Get fund request for active week
  const activeFundRequest = fundRequests.find(
    fr => fr.mess_week_id === activeWeek?.id
  );

  // Calculate totals
  const totalMeals = mealRecords.reduce((sum, r) => sum + r.meal_count, 0);
  const perMealCost = mealRecords[0]?.per_meal_cost;

  const handleCreateWeek = async () => {
    if (selectedPosts.length === 0) {
      toast.warning({ title: "Select Posts", description: "Please select at least one post for the cycle" });
      return;
    }

    if (!requestedAmount || parseFloat(requestedAmount) <= 0) {
      toast.warning({ title: "Enter Amount", description: "Please enter the requested fund amount" });
      return;
    }

    // Monthly mess cycle: current calendar month.
    const monthStart = startOfMonth(new Date());
    const monthEnd = endOfMonth(monthStart);

    try {
      await createMessWeek.mutateAsync({
        week_start_date: format(monthStart, 'yyyy-MM-dd'),
        week_end_date: format(monthEnd, 'yyyy-MM-dd'),
        posts: selectedPosts.map(p => ({ post_id: p.id, post_name: p.name })),
        requested_amount: parseFloat(requestedAmount),
      });

      toast.success({
        title: "Mess Cycle Created",
        description: `${format(monthStart, 'MMMM yyyy')} cycle created. Fund request of ₹${parseFloat(requestedAmount).toLocaleString()} sent to Accounts.`,
      });
      setShowNewWeekDialog(false);
      setSelectedPosts([]);
      setRequestedAmount("");
    } catch (error: any) {
      toast.error({ title: "Error", description: error.message });
    }
  };

  const handleCalculateCharges = async () => {
    if (!activeWeek) return;
    try {
      const result = await calculateCharges.mutateAsync(activeWeek.id);
      toast.success({
        title: "Charges Calculated",
        description: `Per meal cost: ₹${result.perMealCost} | Total meals: ${result.totalMeals}`,
      });
    } catch (error: any) {
      toast.error({ title: "Calculation Error", description: error.message });
    }
  };

  const handleReRequest = async (messWeekId: string) => {
    try {
      // Create a new fund request for the same week
      const { error } = await supabaseClient
        .from('mess_fund_requests')
        .insert({
          mess_week_id: messWeekId,
          status: 'pending',
          requested_amount: parseFloat(requestedAmount) || null,
        });

      if (error) throw new Error(error.message);

      // Reset week status back to fund_requested
      const { error: weekError } = await supabaseClient
        .from('mess_weeks')
        .update({ status: 'fund_requested' })
        .eq('id', messWeekId);

      if (weekError) throw new Error(weekError.message);

      toast.success({ title: "Re-requested", description: "New fund request sent to Accounts." });
      // Trigger refetch
      window.location.reload();
    } catch (error: any) {
      toast.error({ title: "Error", description: error.message });
    }
  };

  const togglePost = (postId: string, postName: string) => {
    setSelectedPosts(prev => {
      const exists = prev.find(p => p.id === postId);
      if (exists) return prev.filter(p => p.id !== postId);
      return [...prev, { id: postId, name: postName }];
    });
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      fund_requested: { label: "Fund Requested", className: "bg-amber-500 hover:bg-amber-600" },
      fund_approved: { label: "Fund Approved", className: "bg-blue-500 hover:bg-blue-600" },
      meals_recorded: { label: "Meals Recorded", className: "bg-purple-500 hover:bg-purple-600" },
      calculated: { label: "Calculated", className: "bg-green-500 hover:bg-green-600" },
      deducted: { label: "Deducted", className: "bg-gray-500 hover:bg-gray-600" },
    };
    const info = map[status] || { label: status, className: "" };
    return <Badge className={info.className}>{info.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <BrandLoader size="lg" message="Loading mess data..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold">Mess Management</h3>
          <p className="text-muted-foreground">Monthly mess fund requests, meal tracking and charge calculation</p>
        </div>
        <Button onClick={() => setShowNewWeekDialog(true)} className="flex gap-2 items-center">
          <Plus className="h-4 w-4" />
          <span>+ New Cycle</span>
        </Button>
      </div>

      {/* Weekly Summary Card */}
      {activeWeek && (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-blue-600" />
                <div>
                  <h4 className="font-semibold text-lg">
                    {format(new Date(activeWeek.week_start_date), 'MMMM yyyy')} cycle
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Posts: {activeWeek.mess_week_posts?.map(p => p.post_name).join(', ') || 'None'}
                  </p>
                </div>
              </div>
              {getStatusBadge(activeWeek.status)}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <FileText className="h-5 w-5 mx-auto text-amber-500 mb-1" />
                <p className="text-xs text-muted-foreground">Fund Status</p>
                <p className={`font-semibold text-sm ${activeFundRequest?.status === 'rejected' ? 'text-red-600' : ''}`}>
                  {activeFundRequest?.status === 'approved'
                    ? `₹${activeFundRequest.approved_amount?.toLocaleString()}`
                    : activeFundRequest?.status === 'rejected'
                    ? 'Rejected'
                    : activeFundRequest?.status || 'N/A'}
                </p>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Utensils className="h-5 w-5 mx-auto text-purple-500 mb-1" />
                <p className="text-xs text-muted-foreground">Total Meals</p>
                <p className="font-semibold text-sm">{totalMeals}</p>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <IndianRupee className="h-5 w-5 mx-auto text-green-500 mb-1" />
                <p className="text-xs text-muted-foreground">Per Meal Cost</p>
                <p className="font-semibold text-sm">
                  {perMealCost ? `₹${perMealCost}` : 'Not calculated'}
                </p>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Calculator className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                <p className="text-xs text-muted-foreground">Total Charge</p>
                <p className="font-semibold text-sm">
                  {perMealCost ? `₹${(totalMeals * perMealCost).toLocaleString()}` : '—'}
                </p>
              </div>
            </div>

            {/* Calculate button when meals are recorded but not yet calculated */}
            {activeWeek.status === 'meals_recorded' && activeFundRequest?.status === 'approved' && (
              <div className="mt-4 flex justify-end">
                <Button onClick={handleCalculateCharges} disabled={calculateCharges.isPending}>
                  <Calculator className="h-4 w-4 mr-2" />
                  {calculateCharges.isPending ? 'Calculating...' : 'Calculate Charges'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Card>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            <TabsList className="h-9">
              <TabsTrigger value="current" className="px-3 h-8">
                <Utensils className="h-4 w-4 mr-2" />
                Current Cycle
              </TabsTrigger>
              <TabsTrigger value="history" className="px-3 h-8">
                <Calendar className="h-4 w-4 mr-2" />
                History
              </TabsTrigger>
              <TabsTrigger value="fund_requests" className="px-3 h-8">
                <FileText className="h-4 w-4 mr-2" />
                Fund Requests
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-6">
            <TabsContent value="current" className="m-0">
              {activeWeek ? (
                activeFundRequest?.status === 'approved' ? (
                  <WeeklyMealEntry messWeek={activeWeek} />
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    {activeFundRequest?.status === 'pending' && (
                      <p>Fund request is pending approval from Accounts. Meal entry will be available after approval.</p>
                    )}
                    {activeFundRequest?.status === 'rejected' && (
                      <div>
                        <p className="text-red-600 font-medium mb-2">Fund request was rejected by Accounts.</p>
                        {activeFundRequest.notes && <p className="text-sm">Reason: {activeFundRequest.notes}</p>}
                        <p className="text-sm mt-2">Go to "Fund Requests" tab to re-request.</p>
                      </div>
                    )}
                    {!activeFundRequest && (
                      <p>No fund request found for this cycle.</p>
                    )}
                  </div>
                )
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Utensils className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No active mess cycle. Click &quot;+ New Cycle&quot; to start one.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="m-0">
              <div className="space-y-3">
                {messWeeks.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No mess cycles found</p>
                ) : (
                  messWeeks.map(week => (
                    <div
                      key={week.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
                        selectedWeek?.id === week.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                      onClick={() => setSelectedWeek(week)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">
                            {format(new Date(week.week_start_date), 'MMMM yyyy')} cycle
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {week.mess_week_posts?.map(p => p.post_name).join(', ')}
                          </p>
                        </div>
                        {getStatusBadge(week.status)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="fund_requests" className="m-0">
              <div className="space-y-3">
                {fundRequests.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No fund requests</p>
                ) : (
                  fundRequests.map(fr => (
                    <div key={fr.id} className={`p-4 border rounded-lg ${fr.status === 'rejected' ? 'border-red-200 bg-red-50 dark:bg-red-900/10' : ''}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">
                            {fr.mess_weeks
                              ? `${format(new Date(fr.mess_weeks.week_start_date), 'dd MMM')} — ${format(new Date(fr.mess_weeks.week_end_date), 'dd MMM yyyy')}`
                              : 'Unknown week'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Posts: {fr.mess_weeks?.mess_week_posts?.map(p => p.post_name).join(', ') || 'N/A'}
                          </p>
                          {fr.requested_amount && (
                            <p className="text-sm mt-1">Requested: ₹{fr.requested_amount.toLocaleString()}</p>
                          )}
                          {fr.approved_amount && (
                            <p className="text-sm font-medium text-green-600 mt-1">
                              Approved: ₹{fr.approved_amount.toLocaleString()}
                            </p>
                          )}
                          {fr.notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {fr.status === 'rejected' ? 'Rejection reason: ' : 'Notes: '}{fr.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {fr.status === 'rejected' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReRequest(fr.mess_week_id)}
                            >
                              Re-request
                            </Button>
                          )}
                          <Badge className={
                            fr.status === 'approved' ? 'bg-green-500' :
                            fr.status === 'rejected' ? 'bg-red-500' : 'bg-amber-500'
                          }>
                            {fr.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </Card>

      {/* New Week Dialog */}
      <Dialog open={showNewWeekDialog} onOpenChange={setShowNewWeekDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start New Mess Cycle</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Cycle: {format(startOfMonth(new Date()), 'MMMM yyyy')} ({format(startOfMonth(new Date()), 'dd MMM')} — {format(endOfMonth(new Date()), 'dd MMM')})
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium">Select Posts for Mess</Label>
              <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                {posts.map(post => (
                  <div key={post.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={post.id}
                      checked={selectedPosts.some(p => p.id === post.id)}
                      onCheckedChange={() => togglePost(post.id, post.post_name)}
                    />
                    <Label htmlFor={post.id} className="text-sm cursor-pointer">
                      {post.post_name}
                    </Label>
                  </div>
                ))}
                {posts.length === 0 && (
                  <p className="text-sm text-muted-foreground">No active posts found</p>
                )}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Requested Amount (₹)*</Label>
              <Input
                type="number"
                min="1"
                placeholder="Enter amount to request from Accounts"
                value={requestedAmount}
                onChange={(e) => setRequestedAmount(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewWeekDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateWeek} disabled={createMessWeek.isPending}>
              {createMessWeek.isPending ? 'Creating...' : 'Create & Request Fund'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
