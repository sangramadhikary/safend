'use client';

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Calendar, User, MessageCircle } from "lucide-react";
import { SupportTicket } from "@/types/helpdesk";
import { getTickets } from "@/services/helpdesk/HelpdeskService";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { TicketForm } from "./TicketForm";
import { TicketDetails } from "./TicketDetails";
import { LoadingAnimation } from "@/components/ui/loading-animation";

interface HelpdeskTicketsListProps {
  branchId: string;
  category?: string;
  status?: string;
  searchQuery?: string;
}

export function HelpdeskTicketsList({ branchId, category, status, searchQuery }: HelpdeskTicketsListProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [isTicketDialogOpen, setIsTicketDialogOpen] = useState(false);
  const [isNewTicketDialogOpen, setIsNewTicketDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    try {
      setIsLoading(true);
      // Get tickets from service
      const fetchedTickets = getTickets(branchId);
      
      // Apply filters
      let filteredTickets = fetchedTickets;
      
      if (category) {
        filteredTickets = filteredTickets.filter(ticket => ticket.category === category);
      }
      
      if (status) {
        filteredTickets = filteredTickets.filter(ticket => ticket.status === status);
      }
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredTickets = filteredTickets.filter(ticket => 
          ticket.title.toLowerCase().includes(query) || 
          ticket.description.toLowerCase().includes(query) ||
          ticket.createdBy.toLowerCase().includes(query) ||
          (ticket.assignedTo && ticket.assignedTo.toLowerCase().includes(query))
        );
      }
      
      setTickets(filteredTickets);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load support tickets.",
        variant: "destructive"
      });
      console.error("Error fetching tickets:", error);
    } finally {
      setIsLoading(false);
    }
  }, [branchId, category, status, searchQuery, toast]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
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
  
  const handleViewTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setIsTicketDialogOpen(true);
  };
  
  const handleTicketCreated = (newTicket: SupportTicket) => {
    setIsNewTicketDialogOpen(false);
    setTickets([newTicket, ...tickets]);
    toast({
      title: "Ticket Created",
      description: "Support ticket has been created successfully.",
    });
  };
  
  const handleTicketUpdated = (updatedTicket: SupportTicket) => {
    setTickets(tickets.map(ticket => 
      ticket.id === updatedTicket.id ? updatedTicket : ticket
    ));
    toast({
      title: "Ticket Updated",
      description: "Support ticket has been updated successfully.",
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <LoadingAnimation size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">Support Tickets</h3>
        <Button onClick={() => setIsNewTicketDialogOpen(true)}>
          <Ticket className="h-4 w-4 mr-2" />
          New Ticket
        </Button>
      </div>
      
      {!tickets.length ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <Ticket className="h-12 w-12 mx-auto text-gray-400" />
          <h3 className="mt-2 text-lg font-medium text-foreground">No Tickets Found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {`No support tickets found${searchQuery ? ' matching your search' : ''}`}
          </p>
          <div className="mt-6">
            <Button onClick={() => setIsNewTicketDialogOpen(true)}>
              Create New Ticket
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="p-4">
              <div className="flex flex-col md:flex-row justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Ticket className="h-4 w-4 text-muted-foreground" />
                    <h4 className="font-medium">{ticket.title}</h4>
                    {getPriorityBadge(ticket.priority)}
                    {getStatusBadge(ticket.status)}
                  </div>
                  
                  <p className="text-sm text-gray-600 line-clamp-2">{ticket.description}</p>
                  
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      Created: {formatDate(ticket.createdAt)}
                    </span>
                    <span className="flex items-center">
                      <User className="h-3 w-3 mr-1" />
                      By: {ticket.createdBy}
                    </span>
                    {ticket.assignedTo && (
                      <span className="flex items-center">
                        <User className="h-3 w-3 mr-1" />
                        Assigned to: {ticket.assignedTo}
                      </span>
                    )}
                    {ticket.comments.length > 0 && (
                      <span className="flex items-center">
                        <MessageCircle className="h-3 w-3 mr-1" />
                        Comments: {ticket.comments.length}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2 mt-4 md:mt-0">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleViewTicket(ticket)}
                  >
                    View Details
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      
      {/* New Ticket Dialog */}
      <Dialog open={isNewTicketDialogOpen} onOpenChange={setIsNewTicketDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create New Support Ticket</DialogTitle>
          </DialogHeader>
          <TicketForm 
            branchId={branchId}
            onSuccess={handleTicketCreated}
          />
        </DialogContent>
      </Dialog>
      
      {/* Ticket Details Dialog */}
      <Dialog open={isTicketDialogOpen} onOpenChange={setIsTicketDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Ticket Details</DialogTitle>
          </DialogHeader>
          {selectedTicket && (
            <TicketDetails 
              ticket={selectedTicket}
              onTicketUpdate={handleTicketUpdated}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
