'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createTripLog, getVehicles } from "@/services/fleet/FleetService";
import { Vehicle } from "@/types/fleet";

interface TripLogFormProps {
  branchId: string;
  onSuccess: () => void;
}

export function TripLogForm({ branchId, onSuccess }: TripLogFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [formData, setFormData] = useState({
    vehicleId: "",
    purpose: "",
    driver: "",
    authorizedBy: "",
    startOdometer: 0,
    startLocation: "",
    destination: "",
    notes: ""
  });

  // Fetch available vehicles
  useEffect(() => {
    const loadVehicles = async () => {
      if (branchId) {
        try {
          const allVehicles = await getVehicles(branchId);
          const availableVehicles = allVehicles.filter(
            v => v.status === 'available'
          );
          setVehicles(availableVehicles);
          
          if (availableVehicles.length > 0) {
            setFormData(prev => ({
              ...prev,
              vehicleId: availableVehicles[0].id,
              startOdometer: availableVehicles[0].currentOdometer
            }));
          }
        } catch (error) {
          console.error("Error fetching available vehicles:", error);
          toast({
            title: "Error",
            description: "Failed to load available vehicles.",
            variant: "destructive"
          });
        }
      }
    };
    loadVehicles();
  }, [branchId, toast]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'number' ? parseFloat(value) || 0 : value 
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    if (name === 'vehicleId') {
      const selectedVehicle = vehicles.find(v => v.id === value);
      if (selectedVehicle) {
        setFormData(prev => ({
          ...prev,
          vehicleId: value,
          startOdometer: selectedVehicle.currentOdometer
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          vehicleId: value
        }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.vehicleId || !formData.purpose || !formData.driver || !formData.authorizedBy) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      await createTripLog({
        ...formData,
        branchId,
        startDate: new Date().toISOString(),
        status: 'in-progress',
      });
      
      toast({
        title: "Success",
        description: "Trip has been logged successfully"
      });
      
      onSuccess();
    } catch (error) {
      console.error("Error logging trip:", error);
      toast({
        title: "Error",
        description: "Failed to log trip",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="vehicleId">Vehicle <span className="text-red-500">*</span></Label>
        <Select
          value={formData.vehicleId}
          onValueChange={(value) => handleSelectChange("vehicleId", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a vehicle" />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map(vehicle => (
              <SelectItem key={vehicle.id} value={vehicle.id}>
                {vehicle.model} - {vehicle.registrationNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {vehicles.length === 0 && (
          <p className="text-sm text-red-500 mt-1">No available vehicles. All vehicles are currently in use or under maintenance.</p>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="purpose">Purpose <span className="text-red-500">*</span></Label>
          <Input
            id="purpose"
            name="purpose"
            value={formData.purpose}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="driver">Driver <span className="text-red-500">*</span></Label>
          <Input
            id="driver"
            name="driver"
            value={formData.driver}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="authorizedBy">Authorized By <span className="text-red-500">*</span></Label>
          <Input
            id="authorizedBy"
            name="authorizedBy"
            value={formData.authorizedBy}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="startOdometer">Start Odometer (km) <span className="text-red-500">*</span></Label>
          <Input
            id="startOdometer"
            name="startOdometer"
            type="number"
            min="0"
            value={formData.startOdometer}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="startLocation">Start Location <span className="text-red-500">*</span></Label>
          <Input
            id="startLocation"
            name="startLocation"
            value={formData.startLocation}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="destination">Destination <span className="text-red-500">*</span></Label>
          <Input
            id="destination"
            name="destination"
            value={formData.destination}
            onChange={handleChange}
            required
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={3}
        />
      </div>
      
      <div className="mt-6 flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || vehicles.length === 0}>
          {isSubmitting ? "Logging Trip..." : "Log Trip"}
        </Button>
      </div>
    </form>
  );
}
