'use client';

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { MaintenanceSchedule } from "@/types/maintenance";
import { getMaintenanceSchedules, completeScheduledMaintenance } from "@/services/maintenance/MaintenanceService";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MaintenanceScheduleDetails } from "./MaintenanceScheduleDetails";

interface MaintenanceSchedulesListProps {
  branchId: string;
  searchQuery: string;
}

export function MaintenanceSchedulesList({ branchId, searchQuery }: MaintenanceSchedulesListProps) {
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSchedule, setSelectedSchedule] = useState<MaintenanceSchedule | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const { toast } = useToast();

  // Fetch schedules
  useEffect(() => {
    if (branchId) {
      try {
        const fetchedSchedules = getMaintenanceSchedules(branchId);
        setSchedules(fetchedSchedules);
      } catch (error) {
        console.error("Error fetching maintenance schedules:", error);
        toast({
          title: "Error",
          description: "Failed to load maintenance schedules.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    }
  }, [branchId, toast]);

  // Filter schedules based on search query
  const filteredSchedules = schedules.filter(schedule => 
    schedule.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    schedule.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (schedule.assetName && schedule.assetName.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (schedule.assignedTo && schedule.assignedTo.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'upcoming':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">Upcoming</Badge>;
      case 'overdue':
        return <Badge className="bg-red-500">Overdue</Badge>;
      case 'in-progress':
        return <Badge className="bg-amber-500">In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-green-500">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleMarkComplete = async (scheduleId: string) => {
    try {
      const updatedSchedule = await completeScheduledMaintenance(scheduleId);
      setSchedules(schedules.map(s => s.id === scheduleId ? updatedSchedule : s));
      
      toast({
        title: "Maintenance Completed",
        description: "Maintenance has been marked as completed."
      });
    } catch (error) {
      console.error("Error completing maintenance:", error);
      toast({
        title: "Error",
        description: "Failed to complete maintenance.",
        variant: "destructive"
      });
    }
  };

  const handleViewDetails = (schedule: MaintenanceSchedule) => {
    setSelectedSchedule(schedule);
    setIsDetailsOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <LoadingAnimation size="md" />
      </div>
    );
  }

  if (!filteredSchedules.length) {
    return (
      <Alert className="bg-blue-50 border-blue-100 text-blue-800">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No maintenance schedules found matching your criteria.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {filteredSchedules.map((schedule) => (
          <div 
            key={schedule.id} 
            className="border rounded-lg p-4 bg-white shadow-xs hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col md:flex-row justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <h3 className="font-medium">{schedule.title}</h3>
                  {getStatusBadge(schedule.status)}
                </div>
                
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{schedule.description}</p>
                
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>Next Due: {new Date(schedule.nextDueDate).toLocaleDateString()}</span>
                  <span>Frequency: {schedule.frequency}</span>
                  {schedule.assetName && <span>Asset: {schedule.assetName}</span>}
                  {schedule.assignedTo && <span>Assigned to: {schedule.assignedTo}</span>}
                </div>
              </div>
              
              <div className="flex items-center gap-2 md:flex-col md:items-end">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {schedule.lastCompletedDate ? (
                    `Last completed: ${new Date(schedule.lastCompletedDate).toLocaleDateString()}`
                  ) : (
                    "Never completed"
                  )}
                </div>
                
                <div className="flex gap-2">
                  {schedule.status !== 'completed' && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-8" 
                      onClick={() => handleMarkComplete(schedule.id)}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      <span>Complete</span>
                    </Button>
                  )}
                  
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-8" 
                    onClick={() => handleViewDetails(schedule)}
                  >
                    <span>Details</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Schedule Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Maintenance Schedule Details</DialogTitle>
          </DialogHeader>
          {selectedSchedule && (
            <MaintenanceScheduleDetails schedule={selectedSchedule} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
