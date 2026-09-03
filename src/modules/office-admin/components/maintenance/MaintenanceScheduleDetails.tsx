'use client';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { MaintenanceSchedule } from "@/types/maintenance";
import { Calendar, CheckCircle, Clock } from "lucide-react";
import { completeScheduledMaintenance } from "@/services/maintenance/MaintenanceService";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface MaintenanceScheduleDetailsProps {
  schedule: MaintenanceSchedule;
}

export function MaintenanceScheduleDetails({ schedule }: MaintenanceScheduleDetailsProps) {
  const [currentSchedule, setCurrentSchedule] = useState(schedule);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleMarkComplete = async () => {
    setIsSubmitting(true);
    try {
      const updatedSchedule = await completeScheduledMaintenance(schedule.id);
      setCurrentSchedule(updatedSchedule);
      
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
    } finally {
      setIsSubmitting(false);
    }
  };

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

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{currentSchedule.title}</h3>
        {getStatusBadge(currentSchedule.status)}
      </div>
      
      <p className="text-gray-700">{currentSchedule.description}</p>
      
      <Separator />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Next Due Date</Label>
            <div className="flex items-center gap-2 mt-1">
              <Calendar className="h-4 w-4 text-blue-600" />
              <span>{formatDate(currentSchedule.nextDueDate)}</span>
            </div>
          </div>
          
          {currentSchedule.lastCompletedDate && (
            <div>
              <Label className="text-xs text-muted-foreground">Last Completed</Label>
              <div className="flex items-center gap-2 mt-1">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span>{formatDate(currentSchedule.lastCompletedDate)}</span>
              </div>
            </div>
          )}
          
          <div>
            <Label className="text-xs text-muted-foreground">Frequency</Label>
            <p className="mt-1 capitalize">{currentSchedule.frequency}</p>
          </div>
        </div>
        
        <div className="space-y-4">
          {currentSchedule.assetName && (
            <div>
              <Label className="text-xs text-muted-foreground">Asset</Label>
              <p className="mt-1">{currentSchedule.assetName}</p>
            </div>
          )}
          
          {currentSchedule.assignedTo && (
            <div>
              <Label className="text-xs text-muted-foreground">Assigned To</Label>
              <p className="mt-1">{currentSchedule.assignedTo}</p>
            </div>
          )}
          
          <div>
            <Label className="text-xs text-muted-foreground">Created</Label>
            <div className="flex items-center gap-2 mt-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{formatDate(currentSchedule.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>
      
      {currentSchedule.procedures && currentSchedule.procedures.length > 0 && (
        <>
          <Separator />
          
          <div>
            <h4 className="font-medium mb-2">Maintenance Procedures</h4>
            <ul className="list-disc list-inside space-y-1">
              {currentSchedule.procedures.map((procedure, index) => (
                <li key={index} className="text-gray-700">{procedure}</li>
              ))}
            </ul>
          </div>
        </>
      )}
      
      {currentSchedule.status !== 'completed' && (
        <>
          <Separator />
          
          <div className="flex justify-end">
            <Button 
              onClick={handleMarkComplete} 
              disabled={isSubmitting}
              className="flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              <span>{isSubmitting ? "Processing..." : "Mark as Completed"}</span>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
