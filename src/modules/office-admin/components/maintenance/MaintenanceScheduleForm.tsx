'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createMaintenanceSchedule } from "@/services/maintenance/MaintenanceService";
import { MaintenanceSchedule } from "@/types/maintenance";

interface MaintenanceScheduleFormProps {
  branchId: string;
  onSuccess: () => void;
}

export function MaintenanceScheduleForm({ branchId, onSuccess }: MaintenanceScheduleFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assetName: "",
    frequency: "monthly" as MaintenanceSchedule["frequency"],
    nextDueDate: "",
    assignedTo: "",
    procedures: ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ 
      ...prev, 
      [name]: value 
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.description || !formData.nextDueDate) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      await createMaintenanceSchedule({
        ...formData,
        branchId,
        status: 'upcoming',
        procedures: formData.procedures ? formData.procedures.split('\n').filter(Boolean) : undefined,
      });
      
      toast({
        title: "Success",
        description: "Maintenance schedule has been created"
      });
      
      onSuccess();
    } catch (error) {
      console.error("Error creating maintenance schedule:", error);
      toast({
        title: "Error",
        description: "Failed to create maintenance schedule",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
        <Input
          id="title"
          name="title"
          value={formData.title}
          onChange={handleChange}
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
        <Textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows={3}
          required
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="assetName">Asset Name</Label>
          <Input
            id="assetName"
            name="assetName"
            value={formData.assetName}
            onChange={handleChange}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="frequency">Frequency <span className="text-red-500">*</span></Label>
          <Select
            value={formData.frequency}
            onValueChange={(value) => handleSelectChange("frequency", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="biweekly">Bi-weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="biannually">Bi-annually</SelectItem>
              <SelectItem value="annually">Annually</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="nextDueDate">Next Due Date <span className="text-red-500">*</span></Label>
          <Input
            id="nextDueDate"
            name="nextDueDate"
            type="date"
            value={formData.nextDueDate}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="assignedTo">Assigned To</Label>
          <Input
            id="assignedTo"
            name="assignedTo"
            value={formData.assignedTo}
            onChange={handleChange}
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="procedures">
          Maintenance Procedures
          <span className="text-muted-foreground text-xs ml-2">(One per line)</span>
        </Label>
        <Textarea
          id="procedures"
          name="procedures"
          value={formData.procedures}
          onChange={handleChange}
          rows={4}
          placeholder="Enter each procedure on a new line"
        />
      </div>
      
      <div className="mt-6 flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create Schedule"}
        </Button>
      </div>
    </form>
  );
}
