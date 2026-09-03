'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, MessageCircle, User, Clock } from "lucide-react";
import { SupportTicket, TicketComment } from "@/types/helpdesk";
import { updateTicket, addTicketComment, assignTicket, resolveTicket } from "@/services/helpdesk/HelpdeskService";

interface TicketDetailsProps {
  ticket: SupportTicket;
  onTicketUpdate: (updatedTicket: SupportTicket) => void;
}

export function TicketDetails({ ticket, onTicketUpdate }: TicketDetailsProps) {
  const [comment, setComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<"new" | "assigned" | "in-progress" | "on-hold" | "resolved" | "closed">(ticket.status);
  const [resolution, setResolution] = useState("");
  const [assignedTo, setAssignedTo] = useState(ticket.assignedTo || "");
  
  // Currently logged in user (mock)
  const currentUser = "System Admin";
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };
  
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'low':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">Low</Badge>;
      case 'medium':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">Medium</Badge>;
      case 'high':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">High</Badge>;
      case 'critical':
        return <Badge className="bg-red-500">Critical</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':
        return <Badge className="bg-blue-500">New</Badge>;
      case 'assigned':
        return <Badge className="bg-purple-500">Assigned</Badge>;
      case 'in-progress':
        return <Badge className="bg-amber-500">In Progress</Badge>;
      case 'on-hold':
        return <Badge variant="outline" className="bg-gray-100 text-gray-700">On Hold</Badge>;
      case 'resolved':
        return <Badge className="bg-green-500">Resolved</Badge>;
      case 'closed':
        return <Badge variant="outline" className="bg-gray-100 text-gray-700">Closed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!comment.trim()) return;
    
    setIsSubmittingComment(true);
    
    try {
      // Add comment to the ticket
      const newComment = addTicketComment(ticket.id, {
        content: comment,
        createdBy: currentUser
      });
      
      // Update the ticket in the parent component
      onTicketUpdate({
        ...ticket,
        comments: [...ticket.comments, newComment]
      });
      
      // Clear the comment field
      setComment("");
    } catch (error) {
      console.error("Error adding comment:", error);
    } finally {
      setIsSubmittingComment(false);
    }
  };
  
  const handleAssign = () => {
    if (!assignedTo) return;
    
    try {
      // Assign the ticket
      const updatedTicket = assignTicket(ticket.id, assignedTo);
      onTicketUpdate(updatedTicket);
    } catch (error) {
      console.error("Error assigning ticket:", error);
    }
  };
  
  const handleResolve = () => {
    if (!resolution) return;
    
    try {
      // Resolve the ticket
      const updatedTicket = resolveTicket(ticket.id, currentUser, resolution);
      onTicketUpdate(updatedTicket);
      setSelectedStatus("resolved");
    } catch (error) {
      console.error("Error resolving ticket:", error);
    }
  };
  
  const handleStatusChange = (status: string) => {
    // Convert the string status to the appropriate type
    const typedStatus = status as "new" | "assigned" | "in-progress" | "on-hold" | "resolved" | "closed";
    setSelectedStatus(typedStatus);
    
    try {
      // Update ticket status
      const updatedTicket = updateTicket(ticket.id, { status: typedStatus });
      onTicketUpdate(updatedTicket);
    } catch (error) {
      console.error("Error updating ticket status:", error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{ticket.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            {getPriorityBadge(ticket.priority)}
            {getStatusBadge(ticket.status)}
            <span className="text-xs text-muted-foreground">#{ticket.id}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Label htmlFor="status" className="sr-only">Status</Label>
          <Select value={selectedStatus} onValueChange={handleStatusChange} disabled={ticket.status === 'closed' || ticket.status === 'resolved'}>
            <SelectTrigger id="status" className="w-[180px]">
              <SelectValue placeholder="Update Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="in-progress">In Progress</SelectItem>
              <SelectItem value="on-hold">On Hold</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="bg-gray-50 p-3 rounded-md text-sm">
        <p>{ticket.description}</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Created By</p>
          <p className="font-medium flex items-center">
            <User className="h-3 w-3 mr-1" />
            {ticket.createdBy}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Created On</p>
          <p className="font-medium flex items-center">
            <Calendar className="h-3 w-3 mr-1" />
            {formatDate(ticket.createdAt)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Category</p>
          <p className="font-medium capitalize">{ticket.category}</p>
        </div>
        {ticket.assignedTo && (
          <div>
            <p className="text-muted-foreground">Assigned To</p>
            <p className="font-medium">{ticket.assignedTo}</p>
          </div>
        )}
        {ticket.dueDate && (
          <div>
            <p className="text-muted-foreground">Due Date</p>
            <p className="font-medium flex items-center">
              <Clock className="h-3 w-3 mr-1" />
              {formatDate(ticket.dueDate)}
            </p>
          </div>
        )}
        {ticket.resolvedAt && (
          <>
            <div>
              <p className="text-muted-foreground">Resolved By</p>
              <p className="font-medium">{ticket.resolvedBy}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Resolved On</p>
              <p className="font-medium">{formatDate(ticket.resolvedAt)}</p>
            </div>
          </>
        )}
      </div>
      
      {ticket.resolution && (
        <>
          <Separator />
          <div>
            <h4 className="font-medium mb-1">Resolution</h4>
            <p className="text-sm bg-green-50 p-3 rounded-md border border-green-100">{ticket.resolution}</p>
          </div>
        </>
      )}
      
      <Separator />
      
      {/* Action Panels */}
      {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
        <div className="space-y-4">
          {/* Assign Panel */}
          {!ticket.assignedTo && (
            <div className="bg-gray-50 p-3 rounded-md space-y-2">
              <h4 className="font-medium">Assign Ticket</h4>
              <div className="flex gap-2">
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IT Support">IT Support</SelectItem>
                    <SelectItem value="Maintenance Team">Maintenance Team</SelectItem>
                    <SelectItem value="HR Department">HR Department</SelectItem>
                    <SelectItem value="Finance Team">Finance Team</SelectItem>
                    <SelectItem value="Operations Team">Operations Team</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleAssign} disabled={!assignedTo}>Assign</Button>
              </div>
            </div>
          )}
          
          {/* Resolve Panel */}
          {ticket.status !== 'new' && (
            <div className="bg-gray-50 p-3 rounded-md space-y-2">
              <h4 className="font-medium">Resolve Ticket</h4>
              <div className="space-y-2">
                <Textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  placeholder="Enter resolution details"
                  rows={2}
                />
                <div className="flex justify-end">
                  <Button onClick={handleResolve} disabled={!resolution}>Resolve</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Comments Section */}
      <div>
        <h4 className="font-medium flex items-center">
          <MessageCircle className="h-4 w-4 mr-1" />
          Comments ({ticket.comments.length})
        </h4>
        
        <div className="mt-2 space-y-3">
          {ticket.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No comments yet.</p>
          ) : (
            ticket.comments.map((comment: TicketComment) => (
              <div key={comment.id} className="bg-gray-50 p-3 rounded-md">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{comment.createdBy}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(comment.createdAt)}</span>
                </div>
                <p className="text-sm">{comment.content}</p>
              </div>
            ))
          )}
        </div>
        
        {/* Add Comment Form */}
        {(ticket.status !== 'closed') && (
          <form onSubmit={handleAddComment} className="mt-3">
            <div className="space-y-2">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment..."
                rows={2}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmittingComment || !comment.trim()}>
                  {isSubmittingComment ? "Adding..." : "Add Comment"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
