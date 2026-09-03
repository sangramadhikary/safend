'use client';

import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Post } from "@/types/operations";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, User, Building, MapPin } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { MapPinPicker } from "@/components/ui/map-pin-picker";
import { decodeDIGIPIN } from "@/lib/digipin";

interface PostFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Post>) => void;
  editData: Post | null;
}

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export function PostForm({ isOpen, onClose, onSubmit, editData }: PostFormProps) {
  const { toast } = useToast();
  const [formTab, setFormTab] = useState("basic");
  const [formData, setFormData] = useState<Partial<Post>>({
    type: 'permanent',
    status: 'active',
    location: { latitude: 0, longitude: 0, geofenceRadius: 100 },
    requiredStaff: []
  });
  
  // Populate form if editing an existing post
  useEffect(() => {
    if (editData) {
      setFormData(editData);
    } else {
      // Reset form for new post
      setFormData({
        type: 'permanent',
        status: 'active',
        location: { latitude: 0, longitude: 0 },
        requiredStaff: []
      });
    }
  }, [editData]);
  
  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleLocationChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      location: {
        ...prev.location!,
        [field]: value
      }
    }));
  };

  const handleStaffChange = (index: number, field: string, value: any) => {
    setFormData(prev => {
      const updatedStaff = [...(prev.requiredStaff || [])];
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

  const addStaffRequirement = () => {
    setFormData(prev => ({
      ...prev,
      requiredStaff: [
        ...(prev.requiredStaff || []),
        {
          role: "",
          count: 1,
          shift: "",
          startTime: "",
          endTime: "",
          days: []
        }
      ]
    }));
  };

  const removeStaffRequirement = (index: number) => {
    setFormData(prev => {
      const updatedStaff = [...(prev.requiredStaff || [])];
      updatedStaff.splice(index, 1);
      return {
        ...prev,
        requiredStaff: updatedStaff
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name || !formData.clientName || !formData.address || !formData.startDate) {
      toast({
        title: "Validation Error",
        description: "Please fill all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate location — require a pinned coordinate (non-zero lat/lng)
    if (
      !formData.location ||
      !formData.location.latitude ||
      !formData.location.longitude ||
      (formData.location.latitude === 0 && formData.location.longitude === 0)
    ) {
      toast({
        title: "Validation Error",
        description: "Please set a valid location.",
        variant: "destructive",
      });
      return;
    }
    
    // For temporary posts, ensure end date is specified
    if (formData.type === 'temporary' && !formData.endDate) {
      toast({
        title: "Validation Error",
        description: "Temporary posts must have an end date.",
        variant: "destructive",
      });
      return;
    }
    
    // Submit form data
    onSubmit(formData);
  };

  // Days of the week array for type safety
  const daysOfWeek: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Post" : "Create New Post"}</DialogTitle>
          <DialogDescription>
            {editData 
              ? "Update the security post details below." 
              : "Enter the details for the new security post."}
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={formTab} onValueChange={setFormTab}>
          <TabsList className="grid grid-cols-4 mb-4">
            <TabsTrigger value="basic" className="flex items-center gap-2">
              <Building className="h-4 w-4" />
              <span>Basic Info</span>
            </TabsTrigger>
            <TabsTrigger value="location" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span>Location</span>
            </TabsTrigger>
            <TabsTrigger value="staff" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>Staff</span>
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>Schedule</span>
            </TabsTrigger>
          </TabsList>
          
          <ScrollArea className="max-h-[60vh]">
            <form onSubmit={handleSubmit}>
              <TabsContent value="basic" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Post Type*</Label>
                    <Select
                      value={formData.type || "permanent"} // Set a default if empty
                      onValueChange={(value) => handleChange("type", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="permanent">Permanent</SelectItem>
                        <SelectItem value="temporary">Temporary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="status">Status*</Label>
                    <Select
                      value={formData.status || "active"} // Set a default if empty
                      onValueChange={(value) => handleChange("status", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="name">Post Name*</Label>
                  <Input
                    id="name"
                    value={formData.name || ""}
                    onChange={(e) => handleChange("name", e.target.value)}
                    placeholder="Enter post name"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Post Code*</Label>
                    <Input
                      id="code"
                      value={formData.code || ""}
                      onChange={(e) => handleChange("code", e.target.value)}
                      placeholder="Enter post code"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="dutyType">Duty Type*</Label>
                    <Select
                      value={formData.dutyType || "8H"} // Set a default if empty
                      onValueChange={(value) => handleChange("dutyType", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Duty Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="8H">8 Hour Shifts</SelectItem>
                        <SelectItem value="12H">12 Hour Shifts</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="clientName">Client Name*</Label>
                  <Input
                    id="clientName"
                    value={formData.clientName || ""}
                    onChange={(e) => handleChange("clientName", e.target.value)}
                    placeholder="Enter client name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="clientId">Client ID</Label>
                  <Input
                    id="clientId"
                    value={formData.clientId || ""}
                    onChange={(e) => handleChange("clientId", e.target.value)}
                    placeholder="Enter client ID"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="workOrderId">Work Order Reference</Label>
                  <Input
                    id="workOrderId"
                    value={formData.workOrderId || ""}
                    onChange={(e) => handleChange("workOrderId", e.target.value)}
                    placeholder="Enter work order reference"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date*</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate || ""}
                      onChange={(e) => handleChange("startDate", e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date {formData.type === 'temporary' ? '*' : ''}</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate || ""}
                      onChange={(e) => handleChange("endDate", e.target.value)}
                    />
                  </div>
                </div>
                
                {formData.type === 'temporary' && (
                  <div className="space-y-2">
                    <Label htmlFor="eventName">Event Name*</Label>
                    <Input
                      id="eventName"
                      value={(formData as any).eventName || ""}
                      onChange={(e) => handleChange("eventName", e.target.value)}
                      placeholder="Enter event name"
                    />
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="location" className="space-y-4">
                {/* ── Address fields ─────────────────────────────────────── */}
                <div className="space-y-2">
                  <Label htmlFor="address">Address *</Label>
                  <Textarea
                    id="address"
                    value={formData.address || ""}
                    onChange={(e) => handleChange("address", e.target.value)}
                    placeholder="Enter full address"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      value={(formData as any).city || ""}
                      onChange={(e) => handleChange("city", e.target.value)}
                      placeholder="City"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      value={(formData as any).state || ""}
                      onChange={(e) => handleChange("state", e.target.value)}
                      placeholder="State"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pincode">Pincode *</Label>
                    <Input
                      id="pincode"
                      value={(formData as any).pincode || ""}
                      onChange={(e) => handleChange("pincode", e.target.value)}
                      placeholder="6 digits"
                      maxLength={6}
                    />
                  </div>
                </div>

                {/* ── Map pin picker ─────────────────────────────────────── */}
                <div className="space-y-2">
                  <Label>Pin Location on Map</Label>
                  <div className="h-[300px]">
                    <MapPinPicker
                      lat={formData.location?.latitude && formData.location.latitude !== 0 ? formData.location.latitude : undefined}
                      lng={formData.location?.longitude && formData.location.longitude !== 0 ? formData.location.longitude : undefined}
                      address={formData.address}
                      pincode={(formData as any).pincode}
                      district={(formData as any).city}
                      state={(formData as any).state}
                      onChange={(lat, lng) => {
                        handleLocationChange("latitude", lat);
                        handleLocationChange("longitude", lng);
                      }}
                    />
                  </div>
                  {formData.location?.latitude && formData.location.latitude !== 0 && (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-medium text-green-700">
                        <MapPin className="h-3 w-3" /> Location Pinned
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formData.location.latitude.toFixed(6)}, {formData.location.longitude?.toFixed(6)}
                      </span>
                    </div>
                  )}
                </div>

                {/* ── Manual coordinate / DIGIPIN entry ─────────────────── */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Enter Coordinates Directly
                  </p>

                  {/* Lat / Lng manual entry */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Latitude</Label>
                      <Input
                        type="number"
                        step="0.000001"
                        min="6"
                        max="37"
                        placeholder="e.g. 20.594"
                        value={formData.location?.latitude && formData.location.latitude !== 0 ? formData.location.latitude : ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v)) handleLocationChange("latitude", v);
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Longitude</Label>
                      <Input
                        type="number"
                        step="0.000001"
                        min="68"
                        max="98"
                        placeholder="e.g. 85.881"
                        value={formData.location?.longitude && formData.location.longitude !== 0 ? formData.location.longitude : ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v)) handleLocationChange("longitude", v);
                        }}
                      />
                    </div>
                  </div>

                  {/* DIGIPIN decode */}
                  <div className="space-y-1">
                    <Label className="text-xs">DIGIPIN</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g. 39J-438-TJC7"
                        maxLength={12}
                        className="font-mono uppercase"
                        onChange={(e) => e.target.value = e.target.value.toUpperCase()}
                        onBlur={(e) => {
                          const result = decodeDIGIPIN(e.target.value.trim());
                          if (result) {
                            handleLocationChange("latitude", result.lat);
                            handleLocationChange("longitude", result.lng);
                            e.target.style.borderColor = '';
                          } else if (e.target.value.trim()) {
                            e.target.style.borderColor = '#ef4444';
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const result = decodeDIGIPIN((e.target as HTMLInputElement).value.trim());
                            if (result) {
                              handleLocationChange("latitude", result.lat);
                              handleLocationChange("longitude", result.lng);
                            }
                          }
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground self-center whitespace-nowrap">
                        Press Enter or tab out to apply
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      India Post DIGIPIN uniquely identifies a ~4 m × 4 m area.
                    </p>
                  </div>
                </div>

                {/* ── Geofence radius ───────────────────────────────────── */}
                <div className="space-y-2">
                  <Label htmlFor="geofenceRadius">Geofence Radius (metres)</Label>
                  <Input
                    id="geofenceRadius"
                    type="number"
                    min={10}
                    max={5000}
                    value={formData.location?.geofenceRadius ?? 100}
                    onChange={(e) => handleLocationChange("geofenceRadius", parseInt(e.target.value) || 100)}
                    placeholder="100"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Attendance check-in is allowed within this radius from the pinned location.
                  </p>
                </div>
              </TabsContent>
              
              <TabsContent value="staff" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">Staff Requirements</h4>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addStaffRequirement}
                  >
                    Add Requirement
                  </Button>
                </div>
                
                {formData.requiredStaff && formData.requiredStaff.length > 0 ? (
                  formData.requiredStaff.map((staff, index) => (
                    <div key={index} className="border rounded-md p-4 space-y-4">
                      <div className="flex justify-between items-center">
                        <h5 className="font-medium">Requirement #{index + 1}</h5>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => removeStaffRequirement(index)}
                        >
                          Remove
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`role-${index}`}>Role*</Label>
                          <Input
                            id={`role-${index}`}
                            value={staff.role || ""}
                            onChange={(e) => handleStaffChange(index, "role", e.target.value)}
                            placeholder="Security Guard, Supervisor, etc."
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`count-${index}`}>Number of Staff*</Label>
                          <Input
                            id={`count-${index}`}
                            type="number"
                            min="1"
                            value={staff.count || 1}
                            onChange={(e) => handleStaffChange(index, "count", parseInt(e.target.value))}
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`shift-${index}`}>Shift*</Label>
                          <Input
                            id={`shift-${index}`}
                            value={staff.shift || ""}
                            onChange={(e) => handleStaffChange(index, "shift", e.target.value)}
                            placeholder="Morning, Evening, Night"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`startTime-${index}`}>Start Time*</Label>
                          <Input
                            id={`startTime-${index}`}
                            type="time"
                            value={staff.startTime || ""}
                            onChange={(e) => handleStaffChange(index, "startTime", e.target.value)}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`endTime-${index}`}>End Time*</Label>
                          <Input
                            id={`endTime-${index}`}
                            type="time"
                            value={staff.endTime || ""}
                            onChange={(e) => handleStaffChange(index, "endTime", e.target.value)}
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Days of the Week*</Label>
                        <div className="flex flex-wrap gap-4 mt-2">
                          {daysOfWeek.map((day) => (
                            <div key={day} className="flex items-center space-x-2">
                              <Checkbox
                                id={`${day}-${index}`}
                                checked={(staff.days || []).includes(day)}
                                onCheckedChange={(checked) => {
                                  const days = [...(staff.days || [])];
                                  if (checked) {
                                    if (!days.includes(day)) {
                                      days.push(day);
                                    }
                                  } else {
                                    const dayIndex = days.indexOf(day);
                                    if (dayIndex !== -1) {
                                      days.splice(dayIndex, 1);
                                    }
                                  }
                                  handleStaffChange(index, "days", days);
                                }}
                              />
                              <label
                                htmlFor={`${day}-${index}`}
                                className="text-sm font-medium leading-none capitalize"
                              >
                                {day}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="border rounded-md p-6 text-center text-muted-foreground">
                    No staff requirements added yet. Click "Add Requirement" to add staff.
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="schedule" className="space-y-4">
                <div className="h-[300px] bg-gray-100 rounded-md flex flex-col items-center justify-center">
                  <Calendar className="h-8 w-8 text-gray-400" />
                  <span className="mt-2 text-gray-500">
                    Scheduling options will be implemented here
                  </span>
                  <p className="text-sm text-gray-400 mt-2 max-w-md text-center">
                    This will include calendar views, auto-generation of rotas,
                    and staff assignment options.
                  </p>
                </div>
              </TabsContent>
            </form>
          </ScrollArea>
        </Tabs>
        
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            {editData ? "Update Post" : "Create Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
