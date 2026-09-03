'use client';
import { useState, useRef } from "react";
import { Calendar, MapPin, FileText, Clipboard, Phone, Users, Clock, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { createPortal } from "react-dom";

interface CalendarEventProps {
  event: {
    id?: string;
    title: string;
    type: string;
    start?: Date;
    end?: Date;
    description?: string;
    location?: string;
    clientName?: string;
    attendees?: string[];
    relatedId?: string;
  };
}

// Event type configurations
const eventTypeConfig: Record<string, { color: string; label: string }> = {
  meeting: { color: "#4f46e5", label: "Meeting" },
  contract: { color: "#f59e0b", label: "Contract" },
  compliance: { color: "#ef4444", label: "Compliance" },
  followup: { color: "#8b5cf6", label: "Follow-up" },
  service: { color: "#22c55e", label: "Service" },
};

export function CalendarEvent({ event }: CalendarEventProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    case "followup":
      Icon = Phone;
      break;
    case "team":
      Icon = Users;
      break;
    case "service":
      Icon = Clipboard;
      break;
    default:
      Icon = Calendar;
  }

  const config = eventTypeConfig[event.type] || eventTypeConfig.meeting;

  const formatEventTime = (date?: Date) => {
    if (!date) return "";
    return format(date, "MMM d, yyyy 'at' h:mm a");
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    const rect = e.currentTarget.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const popupWidth = 320;
    
    // Position to the right by default, but flip to left if not enough space
    let x = rect.right + 10;
    if (x + popupWidth > viewportWidth - 20) {
      x = rect.left - popupWidth - 10;
    }
    
    // Keep within viewport vertically
    let y = rect.top;
    const popupHeight = 300;
    if (y + popupHeight > window.innerHeight - 20) {
      y = window.innerHeight - popupHeight - 20;
    }
    if (y < 20) y = 20;
    
    setPosition({ x, y });
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 150);
  };

  const handlePopupMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  const handlePopupMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <>
      <div 
        ref={triggerRef}
        className="flex items-center truncate w-full cursor-pointer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Icon className="h-3 w-3 mr-1 shrink-0 opacity-80" />
        <span className="truncate text-xs font-medium leading-tight">{event.title}</span>
      </div>

      {isHovered && createPortal(
        <div 
          className="fixed z-99999 animate-in fade-in-0 zoom-in-95 duration-150"
          style={{ 
            left: position.x, 
            top: position.y,
            pointerEvents: 'auto'
          }}
          onMouseEnter={handlePopupMouseEnter}
          onMouseLeave={handlePopupMouseLeave}
        >
          <div className="w-[320px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl rounded-xl overflow-hidden">
            {/* Header */}
            <div 
              className="px-4 py-3 border-b border-gray-100 dark:border-gray-800"
              style={{ backgroundColor: `${config.color}15` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Badge 
                  className="text-xs font-medium px-2 py-0.5"
                  style={{ backgroundColor: config.color, color: 'white' }}
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {config.label}
                </Badge>
              </div>
              <h4 className="font-semibold text-sm text-gray-900 dark:text-white leading-tight">
                {event.title}
              </h4>
            </div>

            {/* Details */}
            <div className="px-4 py-3 space-y-3 max-h-[250px] overflow-y-auto">
              {event.start && (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                    <Clock className="h-3.5 w-3.5 text-gray-500" />
                  </div>
                  <div className="text-sm pt-0.5">
                    <div className="text-gray-900 dark:text-white font-medium">{formatEventTime(event.start)}</div>
                    {event.end && event.end.getTime() !== event.start.getTime() && (
                      <div className="text-gray-500 text-xs mt-0.5">to {formatEventTime(event.end)}</div>
                    )}
                  </div>
                </div>
              )}

              {event.clientName && (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                    <User className="h-3.5 w-3.5 text-gray-500" />
                  </div>
                  <div className="text-sm pt-0.5 text-gray-900 dark:text-white">{event.clientName}</div>
                </div>
              )}

              {event.location && (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                    <MapPin className="h-3.5 w-3.5 text-gray-500" />
                  </div>
                  <div className="text-sm pt-0.5 text-gray-700 dark:text-gray-300 line-clamp-2">{event.location}</div>
                </div>
              )}

              {event.attendees && event.attendees.length > 0 && (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                    <Users className="h-3.5 w-3.5 text-gray-500" />
                  </div>
                  <div className="text-sm pt-0.5 text-gray-700 dark:text-gray-300">{event.attendees.join(", ")}</div>
                </div>
              )}

              {event.description && (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                    <FileText className="h-3.5 w-3.5 text-gray-500" />
                  </div>
                  <div className="text-sm pt-0.5 text-gray-600 dark:text-gray-400 line-clamp-2">{event.description}</div>
                </div>
              )}
            </div>

            {/* Footer - Clickable */}
            <div 
              className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsHovered(false);
                // Dispatch custom event to open the detail dialog
                window.dispatchEvent(new CustomEvent('openEventDetail', { detail: event }));
              }}
            >
              <span className="text-xs text-[#D71920] font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D71920]"></span>
                Click for full details →
              </span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
