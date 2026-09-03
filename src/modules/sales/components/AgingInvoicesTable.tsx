'use client';

import { useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Edit, Trash2, Mail, Phone, Send, CheckCircle2, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  fetchCollectionTasks,
  updateCollectionTaskStatus,
  checkAndAssignOverdueCollections,
  refreshOverdueDays,
  type CollectionTask,
} from '@/services/collections/OverdueCollectionService';

const getStatusBadge = (status: CollectionTask['status']) => {
  switch (status) {
    case "pending":
      return <Badge className="bg-amber-500 hover:bg-amber-600">Pending</Badge>;
    case "in_progress":
      return <Badge className="bg-blue-500 hover:bg-blue-600">In Progress</Badge>;
    case "follow_up":
      return <Badge className="bg-purple-500 hover:bg-purple-600">Follow Up</Badge>;
    case "resolved":
      return <Badge className="bg-green-500 hover:bg-green-600">Resolved</Badge>;
    case "escalated":
      return <Badge className="bg-red-500 hover:bg-red-600">Escalated</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

const getPriorityBadge = (priority: CollectionTask['priority']) => {
  switch (priority) {
    case "low":
      return <Badge variant="outline" className="border-blue-300 text-blue-600">Low</Badge>;
    case "medium":
      return <Badge variant="outline" className="border-amber-300 text-amber-600">Medium</Badge>;
    case "high":
      return <Badge variant="outline" className="border-orange-300 text-orange-600">High</Badge>;
    case "critical":
      return <Badge variant="outline" className="border-red-400 text-red-600 font-bold">Critical</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
};

const getAgingClass = (days: number) => {
  if (days <= 30) return "text-blue-600 dark:text-blue-400";
  if (days <= 60) return "text-amber-600 dark:text-amber-400";
  if (days <= 90) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400 font-bold";
};

interface AgingInvoicesTableProps {
  filter: string;
  searchTerm: string;
  onEdit: (invoice: any) => void;
}

export function AgingInvoicesTable({ filter, searchTerm, onEdit }: AgingInvoicesTableProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // On mount: check for new overdue items and refresh days
  useEffect(() => {
    checkAndAssignOverdueCollections().then((result) => {
      if (result.tasksCreated > 0) {
        queryClient.invalidateQueries({ queryKey: ['collection_tasks'] });
      }
    });
    refreshOverdueDays();
  }, []);

  // Fetch collection tasks from Supabase
  const { data: collectionTasks = [], isLoading } = useQuery<CollectionTask[]>({
    queryKey: ['collection_tasks', filter],
    queryFn: () => {
      // Map filter to status or priority
      const filters: any = {};
      if (filter === '0-30 Days' || filter === '31-60 Days' || filter === '61-90 Days' || filter === '90+ Days') {
        // We'll filter client-side by days
      } else if (filter && filter !== 'All Invoices') {
        filters.status = filter.toLowerCase().replace(' ', '_');
      }
      return fetchCollectionTasks(filters);
    },
  });

  // Client-side filtering by aging range and search
  const filteredTasks = collectionTasks.filter(task => {
    // Filter by aging range
    if (filter === "0-30 Days" && (task.days_overdue < 0 || task.days_overdue > 30)) return false;
    if (filter === "31-60 Days" && (task.days_overdue < 31 || task.days_overdue > 60)) return false;
    if (filter === "61-90 Days" && (task.days_overdue < 61 || task.days_overdue > 90)) return false;
    if (filter === "90+ Days" && task.days_overdue <= 90) return false;

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const searchable = [
        task.client_name,
        task.invoice_description,
        task.amount?.toString(),
        task.status,
        task.priority,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!searchable.includes(term)) return false;
    }

    return true;
  });

  // Mutation to update task status
  const updateStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: CollectionTask['status'] }) =>
      updateCollectionTaskStatus(taskId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection_tasks'] });
      toast({ title: 'Task Updated', description: 'Collection task status updated.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update task.', variant: 'destructive' });
    },
  });

  const handleMarkResolved = (taskId: string) => {
    updateStatus.mutate({ taskId, status: 'resolved' });
  };

  const handleStartProgress = (taskId: string) => {
    updateStatus.mutate({ taskId, status: 'in_progress' });
  };

  const handleSendEmail = (task: CollectionTask) => {
    const subject = encodeURIComponent(`Payment Reminder — ${task.invoice_description || 'Invoice'}`);
    const body = encodeURIComponent(
      `Dear ${task.client_name || 'Sir/Madam'},\n\n` +
      `This is a reminder regarding the outstanding payment of ₹${task.amount?.toLocaleString('en-IN')} ` +
      `which was due on ${task.due_date ? new Date(task.due_date).toLocaleDateString('en-IN') : 'N/A'}.\n\n` +
      `The payment is now ${task.days_overdue} days overdue. Kindly arrange the payment at your earliest convenience.\n\n` +
      `Bank Details:\nA/c No: 921020000544081\nIFSC: UTIB0000091\nA/c Name: Safend Secure Solutions Private Limited\n\n` +
      `Thank you,\nSafend Secure Solutions Private Limited`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading collection tasks...</span>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm">
      <Table>
        <TableCaption>
          {filteredTasks.length > 0
            ? `${filteredTasks.length} overdue invoice(s) requiring collection`
            : 'No overdue invoices — all payments are on track'}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="hidden md:table-cell">Amount</TableHead>
            <TableHead className="hidden lg:table-cell">Due Date</TableHead>
            <TableHead>Aging</TableHead>
            <TableHead className="hidden md:table-cell">Priority</TableHead>
            <TableHead className="hidden md:table-cell">Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredTasks.length > 0 ? (
            filteredTasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-medium text-sm">
                  {task.invoice_description || '—'}
                </TableCell>
                <TableCell>{task.client_name || 'Unknown'}</TableCell>
                <TableCell className="hidden md:table-cell">
                  ₹{task.amount?.toLocaleString('en-IN') || '0'}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {task.due_date ? new Date(task.due_date).toLocaleDateString('en-IN') : '—'}
                </TableCell>
                <TableCell>
                  <span className={getAgingClass(task.days_overdue)}>
                    {task.days_overdue} days
                  </span>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {getPriorityBadge(task.priority)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {getStatusBadge(task.status)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="View details"
                      onClick={() => onEdit(task)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      title="Send payment reminder email"
                      onClick={() => handleSendEmail(task)}
                    >
                      <Mail className="h-4 w-4" />
                    </Button>

                    {task.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Start working on this"
                        className="text-blue-500 hover:text-blue-600"
                        onClick={() => handleStartProgress(task.id)}
                      >
                        <Phone className="h-4 w-4" />
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      title="Mark as resolved (payment collected)"
                      className="text-green-500 hover:text-green-600"
                      onClick={() => handleMarkResolved(task.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit task"
                      onClick={() => onEdit(task)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                No overdue invoices found matching your criteria
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
