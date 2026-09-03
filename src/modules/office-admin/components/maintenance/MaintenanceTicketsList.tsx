'use client';

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Check, AlertTriangle, Clock, ArrowUpRight } from "lucide-react";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { MaintenanceTicket } from "@/types/maintenance";
import { getMaintenanceTickets, updateMaintenanceTicket } from "@/services/maintenance/MaintenanceService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { MaintenanceTicketDetails } from "./MaintenanceTicketDetails";

interface MaintenanceTicketsListProps {
  branchId: string;
  searchQuery: string;
}

export function MaintenanceTicketsList({ branchId, searchQuery }: MaintenanceTicketsListProps) {
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<MaintenanceTicket | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const { toast } = useToast();

  // Fetch tickets
  useEffect(() => {
    if (branchId) {
      try {
        const fetchedTickets = getMaintenanceTickets(branchId);
        setTickets(fetchedTickets);
      } catch (error) {
        console.error("Error fetching maintenance tickets:", error);
        toast({
          title: "Error",
          description: "Failed to load maintenance tickets.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    }
  }, [branchId, toast]);

  // Filter tickets based on search query
  const filteredTickets = tickets.filter(ticket => 
    ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ticket.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ticket.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ticket.reportedBy.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (ticket.assignedTo && ticket.assignedTo.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
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

  const handleUpdateStatus = async (ticketId: string, newStatus: MaintenanceTicket['status']) => {
    try {
      const ticketToUpdate = tickets.find(t => t.id === ticketId);
      if (!ticketToUpdate) return;

      const updatedTicket = await updateMaintenanceTicket({
        ...ticketToUpdate,
        status: newStatus
      });

      setTickets(tickets.map(t => t.id === ticketId ? updatedTicket : t));

      toast({
        title: "Status Updated",
        description: `Ticket ${ticketId} status changed to ${newStatus}.`
      });
    } catch (error) {
      console.error("Error updating ticket status:", error);
      toast({
        title: "Error",
        description: "Failed to update ticket status.",
        variant: "destructive"
      });
    }
  };

  const handleViewDetails = (ticket: MaintenanceTicket) => {
    setSelectedTicket(ticket);
    setIsDetailsOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <LoadingAnimation size="md" />
      </div>
    );
  }

  if (!filteredTickets.length) {
    return (
      <Alert className="bg-blue-50 border-blue-100 text-blue-800">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No maintenance tickets found matching your criteria.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {filteredTickets.map((ticket) => (
          <div 
            key={ticket.id} 
            className="border rounded-lg p-4 bg-white shadow-xs hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col md:flex-row justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-3 h-3 rounded-full ${getPriorityColor(ticket.priority)}`} />
                  <h3 className="font-medium">{ticket.title}</h3>
                  {getStatusBadge(ticket.status)}
                </div>
                
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{ticket.description}</p>
                
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>ID: {ticket.id}</span>
                  <span>Category: {ticket.category}</span>
                  <span>Reported by: {ticket.reportedBy}</span>
                  {ticket.assignedTo && <span>Assigned to: {ticket.assignedTo}</span>}
                </div>
              </div>
              
              <div className="flex items-center gap-2 md:flex-col md:items-end">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(ticket.createdAt).toLocaleDateString()}
                </div>
                
                <div className="flex gap-2">
                  {ticket.status !== 'completed' && ticket.status !== 'cancelled' && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8" 
                      onClick={() => handleUpdateStatus(ticket.id, 'completed')}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      <span>Complete</span>
                    </Button>
                  )}
                  
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-8" 
                    onClick={() => handleViewDetails(ticket)}
                  >
                    <ArrowUpRight className="h-3 w-3 mr-1" />
                    <span>Details</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Ticket Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Maintenance Ticket Details</DialogTitle>
          </DialogHeader>
          {selectedTicket && (
            <MaintenanceTicketDetails 
              ticket={selectedTicket} 
              onUpdate={(updatedTicket) => {
                setTickets(tickets.map(t => t.id === updatedTicket.id ? updatedTicket : t));
                setSelectedTicket(updatedTicket);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
