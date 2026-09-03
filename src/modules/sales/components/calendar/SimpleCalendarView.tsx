'use client';
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, isSameDay } from "date-fns";
import { Clock, MapPin, Users } from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: string;
  location?: string;
  attendees?: string[];
  description?: string;
}

interface SimpleCalendarViewProps {
  events: CalendarEvent[];
  onEventSelect?: (event: CalendarEvent) => void;
}

export function SimpleCalendarView({ events, onEventSelect }: SimpleCalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  // Get events for selected date
  const selectedDateEvents = selectedDate 
    ? events.filter(event => isSameDay(event.start, selectedDate))
    : [];

  // Get dates that have events for highlighting
  const eventDates = events.map(event => event.start);

  const getEventTypeColor = (type: string) => {
    const colors = {
      meeting: "bg-blue-100 text-blue-800 hover:bg-blue-200",
      "site-visit": "bg-green-100 text-green-800 hover:bg-green-200",
      contract: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
      compliance: "bg-red-100 text-red-800 hover:bg-red-200",
      "follow-up": "bg-purple-100 text-purple-800 hover:bg-purple-200",
      "sales-meeting": "bg-blue-100 text-blue-800 hover:bg-blue-200",
      "hr-interview": "bg-orange-100 text-orange-800 hover:bg-orange-200",
      "operations-planning": "bg-indigo-100 text-indigo-800 hover:bg-indigo-200",
      "office-admin": "bg-gray-100 text-gray-800 hover:bg-gray-200",
    };
    return colors[type as keyof typeof colors] || "bg-gray-100 text-gray-800 hover:bg-gray-200";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calendar Section */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            className="rounded-md border"
            modifiers={{
              eventDay: eventDates,
            }}
            modifiersClassNames={{
              eventDay: "bg-primary/20 text-primary font-semibold",
            }}
          />
        </CardContent>
      </Card>

      {/* Events List Section */}
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "Select a date"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedDateEvents.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No events scheduled for this date
            </p>
          ) : (
            <div className="space-y-4">
              {selectedDateEvents.map((event) => (
                <div
                  key={event.id}
                  className="p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => onEventSelect?.(event)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-sm">{event.title}</h3>
                    <Badge 
                      variant="secondary" 
                      className={getEventTypeColor(event.type)}
                    >
                      {event.type.replace("-", " ")}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>
                        {format(event.start, "h:mm a")} - {format(event.end, "h:mm a")}
                      </span>
                    </div>
                    
                    {event.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        <span>{event.location}</span>
                      </div>
                    )}
                    
                    {event.attendees && event.attendees.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span>{event.attendees.join(", ")}</span>
                      </div>
                    )}
                    
                    {event.description && (
                      <p className="text-xs mt-2">{event.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
