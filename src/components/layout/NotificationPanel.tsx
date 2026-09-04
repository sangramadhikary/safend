'use client';
import { useState, useEffect } from "react";
import { Bell, Trash2, CheckCircle, XCircle, AlertTriangle, Clock, Upload } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  subscribeToDeletionRequests,
  approveDeletionRequest,
  rejectDeletionRequest,
  DeletionRequest,
} from "@/services/supabase/DeletionRequestService";
import {
  subscribeToUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  sendDeletionApprovalNotification,
  addNotification,
  UserNotification,
} from "@/services/supabase/NotificationService";
import {
  subscribeToInvoiceDeleteRequests,
  approveInvoiceDeleteRequest,
  rejectInvoiceDeleteRequest,
  invoiceRequestLabel,
  InvoiceDeleteRequest,
} from "@/services/supabase/InvoiceDeleteRequestService";
import {
  subscribeToPendingTasks,
  PendingTask,
  calculateDaysRemaining,
  deletePendingTask,
} from "@/services/supabase/PendingTaskService";
import { deleteLead } from "@/services/supabase/LeadFirebaseService";
import { deleteQuotation, updateQuotation } from "@/services/supabase/QuotationFirebaseService";
import { deleteAgreement } from "@/services/supabase/AgreementFirebaseService";
import { deleteFollowup } from "@/services/supabase/FollowupFirebaseService";
import { deleteWorkOrder, getWorkOrders, updateWorkOrder } from "@/services/supabase/WorkOrderFirebaseService";
import { cascadeDeleteWorkOrder } from "@/services/supabase/WorkOrderCascadeDeleteService";

type Notification = {
  id: string;
  title: string;
  message: string;
  /**
   * Kept as a Date, not a pre-formatted string. Formatting at subscribe time
   * froze the relative label, so an open panel showed "Just now" indefinitely.
   */
  createdAt: Date;
  read: boolean;
  type?: "info" | "success" | "warning" | "error";
};

const itemTypeLabels: Record<string, string> = {
  lead: 'Lead',
  quotation: 'Quotation',
  agreement: 'Agreement',
  followup: 'Follow-up',
  workorder: 'Work Order',
  contract: 'Contract'
};

export function NotificationPanel() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("notifications");
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>(
    []
  );
  const [invoiceDeleteRequests, setInvoiceDeleteRequests] = useState<
    InvoiceDeleteRequest[]
  >([]);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Check if user is admin (SSR-safe)
  const [userRole, setUserRole] = useState("");
  const [userName, setUserName] = useState("User");
  const [userId, setUserId] = useState<string | null>(null);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUserRole(localStorage.getItem("userRole") || "");
      setUserName(localStorage.getItem("userName") || "User");
    }
    
    // Get the actual user ID from Supabase session
    const getUserId = async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const result = await supabase.auth.getSession() as { data: { session: { user: any } | null }, error: any };
      const { data: { session } } = result;
      if (session?.user?.id) {
        setUserId(session.user.id);
      }
    };
    getUserId();
  }, []);
  
  const isAdmin = userRole === "admin";

  const [notifications, setNotifications] = useState<Notification[]>([]);

  /**
   * Re-render clock for relative timestamps.
   *
   * Relative labels are computed during render, so they need something to
   * invalidate them; without this a panel left open keeps showing the label that
   * was correct when the data arrived.
   */
  // Seeded at 0 rather than Date.now(): reading the clock during render makes the
  // value unstable across a prerender, which Next 16 blocks. The real time is set
  // in the effect below, which only runs on the client.
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    setNowTick(Date.now());
    const interval = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Format time ago helper
  const formatTimeAgo = (date: Date, now: number = nowTick) => {
    // Before the effect runs, nowTick is 0. Fall back to the timestamp itself so
    // the first paint shows "Just now" rather than a date decades in the future.
    const effectiveNow = now > 0 ? now : date.getTime();
    const diffMs = effectiveNow - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  };

  // Subscribe to user notifications from Firebase
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = subscribeToUserNotifications(
      userId,
      (firebaseNotifications: UserNotification[]) => {
        const formattedNotifications: Notification[] =
          firebaseNotifications.map((n) => ({
            id: n.id || "",
            title: n.title,
            message: n.message,
            createdAt: n.createdAt as Date,
            read: n.read,
            type: n.type,
          }));
        setNotifications(formattedNotifications);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Subscribe to deletion requests (only for admin)
  useEffect(() => {
    if (!isAdmin) return;

    const unsubscribe = subscribeToDeletionRequests((requests) => {
      setDeletionRequests(requests);
    });
    return () => unsubscribe();
  }, [isAdmin]);

  // Subscribe to invoice delete requests (only for admin).
  // Separate queue from `deletion_requests` above: different table, different
  // approval side effect (deleting a receivable rather than a sales record).
  useEffect(() => {
    if (!isAdmin) return;

    const unsubscribe = subscribeToInvoiceDeleteRequests((requests) => {
      setInvoiceDeleteRequests(requests);
    });
    return () => unsubscribe();
  }, [isAdmin]);

  // Subscribe to pending tasks for the current user
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = subscribeToPendingTasks(userId, async (tasks) => {
      // Filter out orphaned tasks (agreement no longer exists) and auto-delete them
      const { getAgreements } = await import("@/services/supabase/AgreementFirebaseService");
      const agreementsResult = await getAgreements();
      const existingAgreementIds = new Set(
        agreementsResult.success ? agreementsResult.data.map((a: any) => a.id) : []
      );

      const validTasks: PendingTask[] = [];
      for (const task of tasks) {
        if (existingAgreementIds.has(task.agreementId)) {
          validTasks.push(task);
        } else {
          // Agreement was deleted — clean up the orphaned task
          if (task.id) deletePendingTask(task.id);
        }
      }
      setPendingTasks(validTasks);
    });
    return () => unsubscribe();
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const pendingSalesDeletions = isAdmin
    ? deletionRequests.filter((r) => r.status === "pending")
    : [];
  const pendingInvoiceDeletions = isAdmin
    ? invoiceDeleteRequests.filter((r) => r.status === "pending")
    : [];
  const pendingDeletionCount =
    pendingSalesDeletions.length + pendingInvoiceDeletions.length;
  const pendingTasksCount = pendingTasks.length;
  const totalBadgeCount = unreadCount + pendingDeletionCount + pendingTasksCount;

  const markAllAsRead = async () => {
    if (!userId) return;
    await markAllNotificationsAsRead(userId);
  };

  const handleMarkAsRead = async (id: string) => {
    await markNotificationAsRead(id);
  };

  // Handle approve deletion
  const handleApproveDeletion = async (request: DeletionRequest) => {
    if (!request.id) return;

    setProcessingId(request.id);

    // First, perform the actual deletion based on item type
    let deleteResult: { success: boolean; error?: string } = { success: false, error: "" };

    switch (request.itemType) {
      case "lead":
        deleteResult = await deleteLead(request.itemId);
        break;
      case "quotation":
        // Unlink any work orders referencing this quotation before deleting
        try {
          const { supabaseClient } = await import("@/integrations/supabase/client");
          const { data: quotData } = await supabaseClient
            .from('quotations')
            .select('id, quotation_id')
            .eq('id', request.itemId)
            .maybeSingle();
          
          if (quotData) {
            // Nullify the FK reference in work_orders
            await supabaseClient
              .from('work_orders')
              .update({ quotation_id: null })
              .eq('quotation_id', quotData.id);
            
            // Also try by display quotation_id in case the FK uses that
            if (quotData.quotation_id) {
              await supabaseClient
                .from('work_orders')
                .update({ quotation_id: null })
                .eq('quotation_id', quotData.quotation_id);
            }
          }
        } catch (e) {
          console.error("Failed to unlink work orders from quotation:", e);
        }
        deleteResult = await deleteQuotation(request.itemId);
        break;
      case "agreement":
        deleteResult = await deleteAgreement(request.itemId);
        break;
      case "followup":
        deleteResult = await deleteFollowup(request.itemId);
        break;
      case "workorder":
        deleteResult = await cascadeDeleteWorkOrder(request.itemId);
        break;
      default:
        deleteResult = { success: false, error: "Unknown item type" };
    }

    if (deleteResult.success) {
      // Revert previous step to its natural state
      if (request.itemType === "workorder") {
        // Work order deleted → revert linked quotation back to Draft
        try {
          const woResult = await getWorkOrders();
          // The work order is already deleted, but we stored the quotation_id
          // Use the request's additional info or find by itemId
          // Since the WO is deleted, we need to find the quotation via the request data
          // The quotation_id is stored in the work_orders table as the display ID
          // We'll update any quotation that was "Accepted" and linked to this work order
          const { getQuotations } = await import("@/services/supabase/QuotationFirebaseService");
          const quotResult = await getQuotations();
          if (quotResult.success) {
            // Find quotations in "Accepted" status — revert them to "Draft"
            const acceptedQuotations = quotResult.data.filter(q => q.status === "Accepted");
            for (const q of acceptedQuotations) {
              // Check if this quotation has no remaining work order linked to it
              const hasWorkOrder = woResult.success && woResult.data.some(wo => wo.linkedQuoteId === q.quotationId);
              if (!hasWorkOrder && q.id) {
                await updateQuotation(q.id, { status: "Draft" });
              }
            }
          }
        } catch (e) {
          console.error("Failed to revert quotation status:", e);
        }
      } else if (request.itemType === "agreement") {
        // Agreement deleted → revert linked work order back to Completed (remove agreement link)
        try {
          const woResult = await getWorkOrders();
          if (woResult.success) {
            const linkedWOs = woResult.data.filter(wo => wo.linkedAgreementId === request.itemId);
            for (const wo of linkedWOs) {
              if (wo.id) {
                await updateWorkOrder(wo.id, { linkedAgreementId: '' });
              }
            }
          }
        } catch (e) {
          console.error("Failed to revert work order link:", e);
        }
      }

      // Mark the request as approved
      const approveResult = await approveDeletionRequest(request.id, "Admin");

      if (approveResult.success) {
        // Send notification to the employee who requested deletion
        await sendDeletionApprovalNotification(
          request.requestedBy,
          itemTypeLabels[request.itemType],
          request.clientName,
          true // approved
        );

        toast({
          title: "Deletion Approved",
          description: `${itemTypeLabels[request.itemType]} "${request.clientName}" has been deleted.`,
        });
      }
    } else {
      toast({
        title: "Error",
        description: deleteResult.error || "Failed to delete the item",
        variant: "destructive",
      });
    }

    setProcessingId(null);
  };

  // Handle reject deletion
  const handleRejectDeletion = async (request: DeletionRequest) => {
    if (!request.id) return;

    setProcessingId(request.id);

    const result = await rejectDeletionRequest(request.id, "Admin");

    if (result.success) {
      // Send notification to the employee who requested deletion
      await sendDeletionApprovalNotification(
        request.requestedBy,
        itemTypeLabels[request.itemType],
        request.clientName,
        false // rejected
      );

      toast({
        title: "Request Rejected",
        description: `Deletion request for "${request.clientName}" has been rejected.`,
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to reject request",
        variant: "destructive",
      });
    }

    setProcessingId(null);
  };

  // Handle approve invoice deletion — deletes the receivable, then closes the request
  const handleApproveInvoiceDeletion = async (request: InvoiceDeleteRequest) => {
    if (!request.id) return;

    setProcessingId(request.id);

    const label = invoiceRequestLabel(request);
    const result = await approveInvoiceDeleteRequest(request, userName || "Admin");

    if (result.success) {
      // Drop it locally rather than waiting for the realtime event, so the queue
      // still clears if this table is not in the realtime publication.
      setInvoiceDeleteRequests((prev) =>
        prev.filter((r) => r.receivableId !== request.receivableId)
      );

      // `requestedBy` is already an auth user id, so it can be notified directly
      // rather than resolved from a display name.
      await addNotification({
        userId: request.requestedBy,
        title: "Deletion Approved",
        message: `Your request to delete Invoice #${label} (${request.clientName || "Unknown"}, ₹${request.amount.toLocaleString("en-IN")}) has been approved. The invoice has been deleted.`,
        type: "success",
        relatedItemType: "accounts",
        relatedItemId: request.receivableId,
      });

      toast({
        title: "Deletion Approved",
        description: `Invoice #${label} has been deleted.`,
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to delete the invoice",
        variant: "destructive",
      });
    }

    setProcessingId(null);
  };

  // Handle reject invoice deletion — the invoice is left untouched
  const handleRejectInvoiceDeletion = async (request: InvoiceDeleteRequest) => {
    if (!request.id) return;

    setProcessingId(request.id);

    const label = invoiceRequestLabel(request);
    const result = await rejectInvoiceDeleteRequest(request, userName || "Admin");

    if (result.success) {
      // See the approve handler: clear locally so the queue updates without
      // depending on a realtime event arriving.
      setInvoiceDeleteRequests((prev) =>
        prev.filter((r) => r.id !== request.id)
      );

      await addNotification({
        userId: request.requestedBy,
        title: "Deletion Rejected",
        message: `Your request to delete Invoice #${label} (${request.clientName || "Unknown"}, ₹${request.amount.toLocaleString("en-IN")}) has been rejected. The invoice remains active.`,
        type: "error",
        relatedItemType: "accounts",
        relatedItemId: request.receivableId,
      });

      toast({
        title: "Request Rejected",
        description: `The delete request for Invoice #${label} has been rejected.`,
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to reject request",
        variant: "destructive",
      });
    }

    setProcessingId(null);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {totalBadgeCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-safend-red text-[10px] font-medium text-white animate-pulse-red">
              {totalBadgeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0 animate-tilt-in overflow-hidden" align="end" sideOffset={8}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="border-b px-3 pt-3">
            <TabsList className={cn("grid w-full h-9", isAdmin ? "grid-cols-3" : "grid-cols-2")}>
              <TabsTrigger value="notifications" className="text-xs relative">
                Notifications
                {unreadCount > 0 && (
                  <Badge className="ml-1 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] bg-blue-500 text-white rounded-full">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="tasks" className="text-xs relative">
                Pending Tasks
                {pendingTasksCount > 0 && (
                  <Badge className="ml-1 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] bg-red-500 text-white rounded-full animate-pulse">
                    {pendingTasksCount}
                  </Badge>
                )}
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="deletions" className="text-xs relative">
                  Deletions
                  {pendingDeletionCount > 0 && (
                    <Badge className="ml-1 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] bg-red-500 text-white rounded-full">
                      {pendingDeletionCount}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Regular Notifications Tab */}
          <TabsContent value="notifications" className="m-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h4 className="font-semibold text-sm">Notifications</h4>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-safend-red hover:text-safend-red/80 h-7 px-2"
                  onClick={markAllAsRead}
                >
                  Mark all as read
                </Button>
              )}
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                  <Bell className="h-8 w-8 text-gray-300 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No notifications yet
                  </p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      "border-b last:border-0 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50",
                      notification.read ? "bg-transparent" : "bg-blue-50/50 dark:bg-blue-950/20 border-l-2 border-l-safend-red"
                    )}
                    onClick={() => handleMarkAsRead(notification.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <h5 className="font-semibold text-sm leading-tight">{notification.title}</h5>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                          {formatTimeAgo(notification.createdAt)}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="h-2.5 w-2.5 rounded-full bg-safend-red mt-1.5 shrink-0 ring-2 ring-safend-red/20"></div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          {/* Pending Tasks Tab */}
          <TabsContent value="tasks" className="m-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-red-500" />
                Pending Tasks
              </h4>
              {pendingTasksCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {pendingTasksCount} pending
                </Badge>
              )}
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {pendingTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                  <CheckCircle className="h-8 w-8 text-green-300 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No pending tasks
                  </p>
                </div>
              ) : (
                pendingTasks.map((task) => {
                  const daysRemaining = calculateDaysRemaining(task.dueDate as Date);
                  const isOverdue = daysRemaining <= 0;
                  const isUrgent = daysRemaining <= 2 && daysRemaining > 0;
                  
                  return (
                    <div
                      key={task.id}
                      className={cn(
                        "border-b last:border-0 px-4 py-3",
                        isOverdue ? "bg-red-50/80 dark:bg-red-900/20" : 
                        isUrgent ? "bg-orange-50/80 dark:bg-orange-900/20" : 
                        "bg-yellow-50/50 dark:bg-yellow-900/10"
                      )}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-[10px] px-1.5 py-0",
                                  isOverdue ? "bg-red-100 text-red-700 border-red-300" :
                                  isUrgent ? "bg-orange-100 text-orange-700 border-orange-300" :
                                  "bg-yellow-100 text-yellow-700 border-yellow-300"
                                )}
                              >
                                <Upload className="h-3 w-3 mr-1" />
                                Agreement Upload
                              </Badge>
                            </div>
                            <h5 className="font-medium text-sm truncate">{task.clientName}</h5>
                            <p className="text-xs text-muted-foreground">Value: {task.value}</p>
                          </div>
                          
                          {/* Countdown Badge - constrained width */}
                          <div className={cn(
                            "flex flex-col items-center justify-center px-2.5 py-1.5 rounded-lg shrink-0",
                            isOverdue ? "bg-red-500 text-white" :
                            isUrgent ? "bg-orange-500 text-white" :
                            "bg-yellow-500 text-white"
                          )}>
                            <span className="text-base font-bold leading-none">
                              {isOverdue ? Math.abs(daysRemaining) : daysRemaining}
                            </span>
                            <span className="text-[9px] uppercase mt-0.5">
                              {isOverdue ? "Overdue" : daysRemaining === 1 ? "Day" : "Days"}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>TAT: {task.tatDays} days</span>
                          <span>Due: {(task.dueDate as Date).toLocaleDateString('en-IN')}</span>
                        </div>
                        
                        {isOverdue && (
                          <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            <span>This task is overdue! Please upload immediately.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>

          {/* Deletion Requests Tab - Admin Only */}
          {isAdmin && (
            <TabsContent value="deletions" className="m-0">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Deletion Requests
                </h4>
                {pendingDeletionCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {pendingDeletionCount} pending
                  </Badge>
                )}
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {pendingDeletionCount === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                    <Trash2 className="h-8 w-8 text-gray-300 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No pending deletion requests
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Invoice delete requests (Accounts → receivables).
                        Approving hard-deletes a tax invoice, so it is confirmed
                        before it runs and labelled distinctly from sales items. */}
                    {pendingInvoiceDeletions.map((request) => (
                      <div
                        key={request.id}
                        className="border-b last:border-0 px-4 py-3 bg-red-50/50 dark:bg-red-900/10"
                      >
                        <div className="space-y-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 border-amber-200 shrink-0">
                                Invoice
                              </Badge>
                              <span className="text-[10px] font-mono text-gray-500 truncate">
                                #{invoiceRequestLabel(request)}
                              </span>
                            </div>
                            <h5 className="font-medium text-sm mt-1 truncate">
                              {request.clientName || "Unknown client"}
                            </h5>
                            <p className="text-xs text-muted-foreground">
                              ₹{request.amount.toLocaleString("en-IN")}
                            </p>
                          </div>

                          <div className="bg-white dark:bg-gray-800 rounded p-2 border">
                            <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                              <span className="font-medium">Reason:</span> {request.reason}
                            </p>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="text-[11px] text-muted-foreground truncate mr-2">
                              <span>By: {request.requestedByName || request.requestedBy}</span>
                              <span className="mx-1">•</span>
                              <span>{formatTimeAgo(request.requestedAt as Date)}</span>
                            </div>

                            <div className="flex gap-1 shrink-0">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Permanently delete Invoice #${invoiceRequestLabel(request)} (${request.clientName || "Unknown"}, ₹${request.amount.toLocaleString("en-IN")})? This cannot be undone.`
                                    )
                                  ) {
                                    handleApproveInvoiceDeletion(request);
                                  }
                                }}
                                disabled={processingId === request.id}
                              >
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleRejectInvoiceDeletion(request)}
                                disabled={processingId === request.id}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Sales pipeline deletion requests (leads, quotations, agreements, work orders) */}
                    {pendingSalesDeletions.map((request) => (
                      <div
                        key={request.id}
                        className="border-b last:border-0 px-4 py-3 bg-red-50/50 dark:bg-red-900/10"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border-red-200 shrink-0">
                                  {itemTypeLabels[request.itemType]}
                                </Badge>
                                <span className="text-[10px] font-mono text-gray-500 truncate">
                                  {request.itemId}
                                </span>
                              </div>
                              <h5 className="font-medium text-sm mt-1 truncate">{request.clientName}</h5>
                              <p className="text-xs text-muted-foreground truncate">{request.contactDetails}</p>
                            </div>
                          </div>
                          
                          <div className="bg-white dark:bg-gray-800 rounded p-2 border">
                            <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                              <span className="font-medium">Reason:</span> {request.reason}
                            </p>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] text-muted-foreground truncate mr-2">
                              <span>By: {request.requestedBy}</span>
                              <span className="mx-1">•</span>
                              <span>{formatTimeAgo(request.requestedAt as Date)}</span>
                            </div>
                            
                            <div className="flex gap-1 shrink-0">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => handleApproveDeletion(request)}
                                disabled={processingId === request.id}
                              >
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleRejectDeletion(request)}
                                disabled={processingId === request.id}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
