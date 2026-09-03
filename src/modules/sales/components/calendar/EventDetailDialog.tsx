'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, FileText, Clipboard, Phone, Users, Trash2, Edit, Share2, User } from "lucide-react";

interface EventDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  event: any;
  eventTypes: any;
}

export function EventDetailDialog({ isOpen, onClose, event, eventTypes }: EventDetailDialogProps) {
  if (!event) return null;
  
  // Select icon based on event type
  let Icon = Calendar;
  switch (event.type) {
    case "site-visit":
      Icon = MapPin;
      break;
    case "contract":
      Icon = FileText;
      break;
    case "compliance":
      Icon = Clipboard;
      break;
    case "follow-up":
      Icon = Phone;
      break;
    case "team":
      Icon = Users;
      break;
    default:
      Icon = Calendar;
  }
  
  // Format date and time
  const formatDateTime = (date: Date) => {
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Icon 
              className="mr-2 h-5 w-5" 
              style={{ color: event.type ? eventTypes[event.type]?.color : "#4f46e5" }} 
            />
            {event.title}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Event date and time */}
          <div className="flex items-start space-x-3">
            <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <div className="font-medium">Date & Time</div>
              <div className="text-sm text-muted-foreground">
                {event.start && formatDateTime(event.start)}
                {event.end && ` - ${formatDateTime(event.end)}`}
              </div>
            </div>
          </div>
          
          {/* Location */}
          {event.location && (
            <div className="flex items-start space-x-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="font-medium">Location</div>
                <div className="text-sm text-muted-foreground">{event.location}</div>
              </div>
            </div>
          )}
          
          {/* Attendees */}
          {event.attendees && event.attendees.length > 0 && (
            <div className="flex items-start space-x-3">
              <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="font-medium">Attendees</div>
                <div className="text-sm text-muted-foreground">
                  {event.attendees.join(", ")}
                </div>
              </div>
            </div>
          )}
          
          {/* Client Name */}
          {event.clientName && (
            <div className="flex items-start space-x-3">
              <User className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="font-medium">Client</div>
                <div className="text-sm text-muted-foreground">{event.clientName}</div>
              </div>
            </div>
          )}
          
          {/* Client ID */}
          {event.clientId && (
            <div className="flex items-start space-x-3">
              <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="font-medium">Client ID</div>
                <div className="text-sm text-muted-foreground">{event.clientId}</div>
              </div>
            </div>
          )}
          
          {/* Description */}
          {event.description && (
            <div className="flex items-start space-x-3">
              <Clipboard className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <div className="font-medium">Description</div>
                <div className="text-sm text-muted-foreground">{event.description}</div>
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter className="gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8">
            <Share2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 border-red-200 hover:bg-red-100 hover:text-red-500">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
