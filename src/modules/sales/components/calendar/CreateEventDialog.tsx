'use client';

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { addCalendarEvent } from "@/services/supabase/CalendarEventFirebaseService";

interface CreateEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialEvent?: any;
  eventTypes: any;
}

export function CreateEventDialog({ isOpen, onClose, initialEvent, eventTypes }: CreateEventDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    title: "",
    type: "meeting",
    date: initialEvent?.start ? new Date(initialEvent.start) : new Date(),
    startTime: initialEvent?.start ? format(new Date(initialEvent.start), "HH:mm") : "09:00",
    endTime: initialEvent?.end ? format(new Date(initialEvent.end), "HH:mm") : "10:00",
    location: "",
    attendees: "",
    clientId: "",
    description: "",
  });
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSelectChange = (value: string, name: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setFormData(prev => ({ ...prev, date }));
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.title) {
      toast({
        title: "Error",
        description: "Please enter an event title.",
        variant: "destructive",
      });
      return;
    }
    
    // Parse start and end times
    const [startHour, startMinute] = formData.startTime.split(':').map(Number);
    const [endHour, endMinute] = formData.endTime.split(':').map(Number);
    
    const startDate = new Date(formData.date);
    startDate.setHours(startHour, startMinute, 0, 0);
    
    const endDate = new Date(formData.date);
    endDate.setHours(endHour, endMinute, 0, 0);
    
    // Create event object
    const eventData = {
      title: formData.title,
      start: startDate,
      end: endDate,
      type: formData.type as 'meeting' | 'contract' | 'compliance' | 'followup' | 'service',
      location: formData.location,
      attendees: formData.attendees ? formData.attendees.split(',').map(a => a.trim()) : [],
      description: formData.description,
      relatedId: formData.clientId || undefined
    };
    
    // Save to Firebase
    const result = await addCalendarEvent(eventData);
    
    if (result.success) {
      toast({
        title: "Event Created",
        description: "The calendar event has been created successfully.",
      });
      onClose();
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to create event",
        variant: "destructive",
      });
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>Create Calendar Event</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Event Title *</Label>
            <Input 
              id="title" 
              name="title" 
              value={formData.title} 
              onChange={handleChange} 
              placeholder="Enter event title"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="type">Event Type</Label>
            <Select 
              value={formData.type} 
              onValueChange={(value) => handleSelectChange(value, "type")}
            >
              <SelectTrigger id="type">
                <SelectValue placeholder="Select event type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="compliance">Compliance</SelectItem>
                <SelectItem value="followup">Follow-up</SelectItem>
                <SelectItem value="service">Service</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.date ? format(formData.date, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.date}
                    onSelect={handleDateChange}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time</Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="startTime" 
                    name="startTime" 
                    type="time"
                    value={formData.startTime} 
                    onChange={handleChange} 
                    className="pl-9"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="endTime">End Time</Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="endTime" 
                    name="endTime" 
                    type="time"
                    value={formData.endTime} 
                    onChange={handleChange} 
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input 
              id="location" 
              name="location" 
              value={formData.location} 
              onChange={handleChange} 
              placeholder="Enter location"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="attendees">Attendees</Label>
              <Input 
                id="attendees" 
                name="attendees" 
                value={formData.attendees} 
                onChange={handleChange} 
                placeholder="Enter attendees (comma separated)"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="clientId">Client ID</Label>
              <Input 
                id="clientId" 
                name="clientId" 
                value={formData.clientId} 
                onChange={handleChange} 
                placeholder="Enter client ID if applicable"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea 
              id="description" 
              name="description" 
              value={formData.description} 
              onChange={handleChange} 
              placeholder="Enter event description"
              rows={3}
            />
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Create Event
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
