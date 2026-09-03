'use client';
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, X } from "lucide-react";
import { generatePostCodeFromLocation } from "@/utils/generatePostCode";

interface ServiceTypeInstance {
  id: string;
  count: number;
  rate: number;
}

interface SecurityPostFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  workOrder: any;
}

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

interface SecurityServices {
  unarmedGuards: ServiceTypeInstance[];
  armedGuards: ServiceTypeInstance[];
  supervisors: ServiceTypeInstance[];
  patrolOfficers: ServiceTypeInstance[];
}

const generateInstanceId = () => `inst-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export function SecurityPostFormModal({ 
  isOpen, 
  onClose, 
  onSubmit,
  workOrder 
}: SecurityPostFormModalProps) {
  const { toast } = useToast();
  
  // Security services state with duplicatable instances
  const [securityServices, setSecurityServices] = useState<SecurityServices>({
    unarmedGuards: [{ id: generateInstanceId(), count: 0, rate: 0 }],
    armedGuards: [{ id: generateInstanceId(), count: 0, rate: 0 }],
    supervisors: [{ id: generateInstanceId(), count: 0, rate: 0 }],
    patrolOfficers: [{ id: generateInstanceId(), count: 0, rate: 0 }],
  });

  const [formData, setFormData] = useState({
    name: "",
    code: "", // Will be auto-generated when location is filled
    type: "permanent" as "permanent" | "temporary",
    location: {
      address: "",
      city: "",
      state: "",
      pincode: "",
    },
    dutyType: "8H" as "8H" | "12H",
    requiredStaff: [
      {
        role: "Security Guard",
        count: 1,
        shift: "Day",
        startTime: "06:00",
        endTime: "14:00",
        days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as DayOfWeek[],
      }
    ]
  });

  // Auto-generate post code when location fields change
  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleLocationChange = (field: string, value: string) => {
    setFormData(prev => {
      const updatedLocation = { ...prev.location, [field]: value };
      const newCode = generatePostCodeFromLocation(1, updatedLocation);
      return {
        ...prev,
        location: updatedLocation,
        code: newCode,
      };
    });
  };

  const handleStaffChange = (index: number, field: string, value: any) => {
    setFormData(prev => {
      const updatedStaff = [...prev.requiredStaff];
      updatedStaff[index] = {
        ...updatedStaff[index],
        [field]: value
      };
      return {
        ...prev,
        requiredStaff: updatedStaff
      };
    });
  };

  const handleDayToggle = (staffIndex: number, day: DayOfWeek, checked: boolean) => {
    setFormData(prev => {
      const updatedStaff = [...prev.requiredStaff];
      const currentDays = [...updatedStaff[staffIndex].days];
      
      if (checked) {
        if (!currentDays.includes(day)) {
          updatedStaff[staffIndex].days = [...currentDays, day];
        }
      } else {
        updatedStaff[staffIndex].days = currentDays.filter(d => d !== day);
      }
      
      return {
        ...prev,
        requiredStaff: updatedStaff
      };
    });
  };

  const addStaffRequirement = () => {
    setFormData(prev => ({
      ...prev,
      requiredStaff: [
        ...prev.requiredStaff,
        {
          role: "Security Guard",
          count: 1,
          shift: "Night",
          startTime: "22:00",
          endTime: "06:00",
          days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as DayOfWeek[]
        }
      ]
    }));
  };

  const removeStaffRequirement = (index: number) => {
    if (formData.requiredStaff.length > 1) {
      setFormData(prev => {
        const updatedStaff = [...prev.requiredStaff];
        updatedStaff.splice(index, 1);
        return {
          ...prev,
          requiredStaff: updatedStaff
        };
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.location.address) {
      toast({
        title: "Validation Error",
        description: "Please fill all required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({
        title: "Success",
        description: `Post ${formData.name} created successfully`,
      });
      onSubmit(formData);
      onClose();
    } catch (error) {
      console.error("Error adding post:", error);
      toast({
        title: "Error",
        description: "Failed to add security post: " + (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const daysOfWeek: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const dayLabels = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun"
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>Add Security Post</DialogTitle>
          <DialogDescription>
            Create a new security post location for a client
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Work Order Info */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="font-semibold mb-2">Work Order Details</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Client:</span>
                <span className="ml-2 font-medium">{workOrder.client || workOrder.clientName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">WO ID:</span>
                <span className="ml-2 font-medium">{workOrder.id}</span>
              </div>
            </div>
          </div>

          {/* Post Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Post Name*</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="e.g., Main Gate, Building A"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="code">Post Code</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => handleChange("code", e.target.value)}
                placeholder="Auto-generated"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Post Type*</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => handleChange("type", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="permanent">Permanent</SelectItem>
                  <SelectItem value="temporary">Temporary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="dutyType">Duty Type*</Label>
              <Select
                value={formData.dutyType}
                onValueChange={(value) => handleChange("dutyType", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="8H">8 Hour Shifts</SelectItem>
                  <SelectItem value="12H">12 Hour Shifts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="address">Address*</Label>
            <Textarea
              id="address"
              value={formData.location.address}
              onChange={(e) => handleLocationChange("address", e.target.value)}
              placeholder="Enter full address"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.location.city}
                onChange={(e) => handleLocationChange("city", e.target.value)}
                placeholder="City"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={formData.location.state}
                onChange={(e) => handleLocationChange("state", e.target.value)}
                placeholder="State"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pincode">PIN Code</Label>
              <Input
                id="pincode"
                value={formData.location.pincode}
                onChange={(e) => handleLocationChange("pincode", e.target.value)}
                placeholder="PIN Code"
              />
            </div>
          </div>

          {/* Staff Requirements */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>Staff Requirements*</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addStaffRequirement}
              >
                Add Shift
              </Button>
            </div>

            {formData.requiredStaff.map((staff, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">Shift #{index + 1}</h4>
                  {formData.requiredStaff.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeStaffRequirement(index)}
                      className="text-red-500"
                    >
                      Remove
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Input
                      value={staff.role}
                      onChange={(e) => handleStaffChange(index, "role", e.target.value)}
                      placeholder="Security Guard"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Count</Label>
                    <Input
                      type="number"
                      min="1"
                      value={staff.count}
                      onChange={(e) => handleStaffChange(index, "count", parseInt(e.target.value))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Shift</Label>
                    <Input
                      value={staff.shift}
                      onChange={(e) => handleStaffChange(index, "shift", e.target.value)}
                      placeholder="Day/Night"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={staff.startTime}
                      onChange={(e) => handleStaffChange(index, "startTime", e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={staff.endTime}
                      onChange={(e) => handleStaffChange(index, "endTime", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Working Days</Label>
                  <div className="flex flex-wrap gap-4">
                    {daysOfWeek.map((day) => (
                      <div key={day} className="flex items-center space-x-2">
                        <Checkbox
                          id={`${day}-${index}`}
                          checked={staff.days.includes(day)}
                          onCheckedChange={(checked) => 
                            handleDayToggle(index, day, checked === true)
                          }
                        />
                        <label
                          htmlFor={`${day}-${index}`}
                          className="text-sm font-medium leading-none"
                        >
                          {dayLabels[day]}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Create Post
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
