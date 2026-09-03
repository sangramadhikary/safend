'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { TripLog } from "@/types/fleet";
import { updateTripLog } from "@/services/fleet/FleetService";
import { useToast } from "@/hooks/use-toast";

interface TripLogDetailsProps {
  tripLog: TripLog;
  onUpdate: (tripLog: TripLog) => void;
}

export function TripLogDetails({ tripLog, onUpdate }: TripLogDetailsProps) {
  const [endOdometer, setEndOdometer] = useState<number | undefined>(tripLog.endOdometer);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleCompleteTrip = async () => {
    if (!endOdometer) {
      toast({
        title: "Input Required",
        description: "End odometer reading is required to complete this trip.",
        variant: "destructive"
      });
      return;
    }
    
    if (endOdometer <= (tripLog.startOdometer || 0)) {
      toast({
        title: "Invalid Input",
        description: "End odometer must be greater than start odometer.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      const updatedTrip = await updateTripLog({
        ...tripLog,
        endOdometer,
        status: 'completed',
        endDate: new Date().toISOString(),
      });
      
      onUpdate(updatedTrip);
      
      toast({
        title: "Trip Completed",
        description: "Trip has been marked as completed."
      });
    } catch (error) {
      console.error("Error completing trip:", error);
      toast({
        title: "Error",
        description: "Failed to complete trip.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'planned':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">Planned</Badge>;
      case 'in-progress':
        return <Badge className="bg-amber-500">In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-green-500">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{tripLog.purpose}</h3>
        {getStatusBadge(tripLog.status)}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Driver:</span>
            <span>{tripLog.driver}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Start Location:</span>
            <span>{tripLog.startLocation}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Destination:</span>
            <span>{tripLog.destination}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Authorized By:</span>
            <span>{tripLog.authorizedBy}</span>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Start Date:</span>
            <span>{formatDate(tripLog.startDate)}</span>
          </div>
          {tripLog.endDate && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">End Date:</span>
              <span>{formatDate(tripLog.endDate)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Start Odometer:</span>
            <span>{tripLog.startOdometer} km</span>
          </div>
          {tripLog.endOdometer && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">End Odometer:</span>
              <span>{tripLog.endOdometer} km</span>
            </div>
          )}
          {tripLog.endOdometer && tripLog.startOdometer && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Distance Traveled:</span>
              <span>{tripLog.endOdometer - tripLog.startOdometer} km</span>
            </div>
          )}
        </div>
      </div>
      
      {tripLog.notes && (
        <div className="space-y-2">
          <span className="text-sm text-muted-foreground">Notes:</span>
          <p className="p-2 bg-gray-50 rounded-md">{tripLog.notes}</p>
        </div>
      )}
      
      {tripLog.status === 'in-progress' && (
        <>
          <Separator />
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="endOdometer">End Odometer Reading (km)</Label>
              <Input
                id="endOdometer"
                type="number"
                min={tripLog.startOdometer || 0}
                value={endOdometer || ''}
                onChange={(e) => setEndOdometer(parseInt(e.target.value) || undefined)}
                placeholder="Enter ending odometer reading"
              />
            </div>
            
            <div className="flex justify-end">
              <Button 
                onClick={handleCompleteTrip} 
                disabled={isSubmitting}
              >
                {isSubmitting ? "Completing Trip..." : "Complete Trip"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
