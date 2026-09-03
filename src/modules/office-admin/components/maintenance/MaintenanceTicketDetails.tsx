'use client';

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MaintenanceTicket } from "@/types/maintenance";
import { updateMaintenanceTicket } from "@/services/maintenance/MaintenanceService";
import { useToast } from "@/hooks/use-toast";

interface MaintenanceTicketDetailsProps {
  ticket: MaintenanceTicket;
  onUpdate: (updatedTicket: MaintenanceTicket) => void;
}

export function MaintenanceTicketDetails({ ticket, onUpdate }: MaintenanceTicketDetailsProps) {
  const [status, setStatus] = useState<MaintenanceTicket['status']>(ticket.status);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleStatusChange = async () => {
    if (status === ticket.status) return;
    
    setIsSubmitting(true);
    try {
      const updatedTicket = await updateMaintenanceTicket({
        ...ticket,
        status,
        comments: ticket.comments ? [...ticket.comments, {
          id: `comment-${Date.now()}`,
          ticketId: ticket.id,
          userId: "current-user",
          userName: "Current User",
          content: `Changed status from ${ticket.status} to ${status}${comment ? `: ${comment}` : ''}`,
          createdAt: new Date().toISOString()
        }] : [{
          id: `comment-${Date.now()}`,
          ticketId: ticket.id,
          userId: "current-user",
          userName: "Current User",
          content: `Changed status from ${ticket.status} to ${status}${comment ? `: ${comment}` : ''}`,
          createdAt: new Date().toISOString()
        }]
      });
      
      onUpdate(updatedTicket);
      setComment("");
      toast({
        title: "Status Updated",
        description: `Ticket status changed to ${status}.`
      });
    } catch (error) {
      console.error("Error updating ticket status:", error);
      toast({
        title: "Error",
        description: "Failed to update ticket status.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'critical':
        return <Badge className="bg-red-500">Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-500">High</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500">Medium</Badge>;
      case 'low':
        return <Badge className="bg-green-500">Low</Badge>;
      default:
        return <Badge>{priority}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">Open</Badge>;
      case 'in-progress':
        return <Badge className="bg-amber-500">In Progress</Badge>;
      case 'on-hold':
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">On Hold</Badge>;
      case 'completed':
        return <Badge className="bg-green-500">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h3 className="font-medium text-lg">{ticket.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            {getPriorityBadge(ticket.priority)}
            {getStatusBadge(ticket.status)}
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          <div>Created: {new Date(ticket.createdAt).toLocaleString()}</div>
          {ticket.completedAt && (
            <div>Completed: {new Date(ticket.completedAt).toLocaleString()}</div>
          )}
        </div>
      </div>
      
      <Separator />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">Description</Label>
          <p className="mt-1">{ticket.description}</p>
        </div>
        <div className="space-y-2">
          <div>
            <Label className="text-xs text-muted-foreground">Category</Label>
            <p className="mt-1 capitalize">{ticket.category}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Reported By</Label>
            <p className="mt-1">{ticket.reportedBy}</p>
          </div>
          {ticket.assignedTo && (
            <div>
              <Label className="text-xs text-muted-foreground">Assigned To</Label>
              <p className="mt-1">{ticket.assignedTo}</p>
            </div>
          )}
          {ticket.locationDetails && (
            <div>
              <Label className="text-xs text-muted-foreground">Location</Label>
              <p className="mt-1">{ticket.locationDetails}</p>
            </div>
          )}
        </div>
      </div>
      
      <Separator />
      
      {ticket.status !== 'completed' && ticket.status !== 'cancelled' && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-md">
          <h4 className="font-medium">Update Status</h4>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(val) => setStatus(val as MaintenanceTicket['status'])}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="on-hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Comment</Label>
              <Textarea 
                placeholder="Add a comment about this status update..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            
            <div className="flex justify-end">
              <Button 
                onClick={handleStatusChange} 
                disabled={status === ticket.status || isSubmitting}
              >
                {isSubmitting ? "Updating..." : "Update Status"}
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {ticket.comments && ticket.comments.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium">Comments</h4>
          {ticket.comments.map((comment) => (
            <div key={comment.id} className="border rounded-md p-3 bg-gray-50">
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium text-sm">{comment.userName}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm">{comment.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
