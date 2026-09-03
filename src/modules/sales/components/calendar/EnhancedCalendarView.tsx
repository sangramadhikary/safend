'use client';
import { useState, useEffect } from "react";
import { Calendar, Views, dateFnsLocalizer } from "react-big-calendar";
import { format } from "date-fns";
import { parse } from "date-fns";
import { startOfWeek } from "date-fns";
import { getDay } from "date-fns";
import { enIN } from "date-fns/locale/en-IN";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, List, LayoutGrid, Clock } from "lucide-react";

import { subscribeToUnifiedCalendar, UnifiedCalendarEvent } from "@/services/supabase/UnifiedCalendarFirebaseService";
import { CalendarEvent } from "./CalendarEvent";
import { EventDetailDialog } from "./EventDetailDialog";
import { CreateEventDialog } from "./CreateEventDialog";

import "react-big-calendar/lib/css/react-big-calendar.css";

// Setup the localizer for react-big-calendar
const locales = {
  "en-IN": enIN,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

// Event type configurations for display
const eventTypes = {
  meeting: { color: "#4f46e5", label: "Meeting", icon: CalendarIcon },
  contract: { color: "#f59e0b", label: "Contract", icon: CalendarDays },
  compliance: { color: "#ef4444", label: "Compliance", icon: Clock },
  followup: { color: "#8b5cf6", label: "Follow-up", icon: List },
  service: { color: "#22c55e", label: "Service", icon: LayoutGrid },
};

// Filter configurations
const filterConfig = [
  { key: "all", label: "All", color: "#D71920" },
  { key: "meetings", label: "Meetings", color: "#4f46e5" },
  { key: "contracts", label: "Contracts", color: "#f59e0b" },
  { key: "compliance", label: "Compliance", color: "#ef4444" },
];

export function EnhancedCalendarView({ filter }: { filter?: string }) {
  const [view, setView] = useState<"month" | "week" | "day" | "agenda">("month");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [events, setEvents] = useState<UnifiedCalendarEvent[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");
  
  // Subscribe to calendar events from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToUnifiedCalendar((firebaseEvents) => {
      setEvents(firebaseEvents);
    });
    
    return () => unsubscribe();
  }, []);

  // Listen for custom event from hover popup click
  useEffect(() => {
    const handleOpenEventDetail = (e: CustomEvent) => {
      setSelectedEvent(e.detail);
      setIsEventModalOpen(true);
    };

    window.addEventListener('openEventDetail', handleOpenEventDetail as EventListener);
    return () => {
      window.removeEventListener('openEventDetail', handleOpenEventDetail as EventListener);
    };
  }, []);
  
  // Filter events based on active filter
  const filteredEvents = events.filter(event => {
    if (activeFilter === "all") return true;
    if (activeFilter === "meetings") return event.type === "meeting";
    if (activeFilter === "contracts") return event.type === "contract";
    if (activeFilter === "compliance") return event.type === "service" || event.type === "followup" || event.type === "compliance";
    return true;
  });

  // Count events by type
  const eventCounts = {
    all: events.length,
    meetings: events.filter(e => e.type === "meeting").length,
    contracts: events.filter(e => e.type === "contract").length,
    compliance: events.filter(e => e.type === "service" || e.type === "followup" || e.type === "compliance").length,
  };
  
  const handleViewChange = (newView: string) => {
    setView(newView as "month" | "week" | "day" | "agenda");
  };
  
  const handleNavigate = (date: Date) => {
    setSelectedDate(date);
  };

  const navigateToday = () => {
    setSelectedDate(new Date());
  };

  const navigatePrev = () => {
    const newDate = new Date(selectedDate);
    if (view === "month") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (view === "week") {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    setSelectedDate(newDate);
  };

  const navigateNext = () => {
    const newDate = new Date(selectedDate);
    if (view === "month") {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (view === "week") {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setSelectedDate(newDate);
  };
  
  const handleSelectEvent = (event: any) => {
    setSelectedEvent(event);
    setIsEventModalOpen(true);
  };
  
  const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
    setSelectedEvent({ start, end });
    setIsCreateEventOpen(true);
  };
  
  const eventStyleGetter = (event: any) => {
    const eventType = event.type || "meeting";
    const color = eventTypes[eventType as keyof typeof eventTypes]?.color || "#4f46e5";
    return {
      style: {
        backgroundColor: color,
        border: 'none',
        borderRadius: "6px",
        color: '#ffffff',
        fontSize: '11px',
        padding: '3px 6px',
        margin: '1px 2px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        cursor: 'pointer',
      },
    };
  };

  // Custom toolbar - we'll hide the default and use our own
  const CustomToolbar = () => null;
  
  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="h-7 w-7 text-[#D71920]" />
            Sales Calendar
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Client meetings, contract deadlines and compliance dates
          </p>
        </div>
        
        <Button 
          onClick={() => setIsCreateEventOpen(true)} 
          className="bg-[#D71920] hover:bg-[#b81419] text-white shadow-lg hover:shadow-xl transition-all"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Event
        </Button>
      </div>
      
      <Card className="border-0 shadow-xl bg-white dark:bg-gray-900 overflow-hidden">
        {/* Filter Tabs & Navigation */}
        <CardHeader className="border-b border-gray-100 dark:border-gray-800 bg-linear-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 pb-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            {/* Filter Pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {filterConfig.map((filterItem) => (
                <button
                  key={filterItem.key}
                  onClick={() => setActiveFilter(filterItem.key)}
                  className={`
                    px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                    ${activeFilter === filterItem.key 
                      ? 'text-white shadow-lg scale-105' 
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }
                  `}
                  style={activeFilter === filterItem.key ? { backgroundColor: filterItem.color } : {}}
                >
                  {filterItem.label}
                  <Badge 
                    variant="secondary" 
                    className={`ml-2 text-xs ${activeFilter === filterItem.key ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                  >
                    {eventCounts[filterItem.key as keyof typeof eventCounts]}
                  </Badge>
                </button>
              ))}
            </div>

            {/* Navigation & View Controls */}
            <div className="flex items-center gap-3">
              {/* Date Navigation */}
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={navigatePrev}
                  className="h-8 w-8 p-0 hover:bg-white dark:hover:bg-gray-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={navigateToday}
                  className="h-8 px-3 text-xs font-medium hover:bg-white dark:hover:bg-gray-700"
                >
                  Today
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={navigateNext}
                  className="h-8 w-8 p-0 hover:bg-white dark:hover:bg-gray-700"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Current Month/Date Display */}
              <div className="hidden md:block px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <span className="font-semibold text-gray-900 dark:text-white">
                  {format(selectedDate, "MMMM yyyy")}
                </span>
              </div>

              {/* View Selector */}
              <Select value={view} onValueChange={handleViewChange}>
                <SelectTrigger className="w-[120px] bg-gray-100 dark:bg-gray-800 border-0">
                  <SelectValue placeholder="View" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">
                    <span className="flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4" /> Month
                    </span>
                  </SelectItem>
                  <SelectItem value="week">
                    <span className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" /> Week
                    </span>
                  </SelectItem>
                  <SelectItem value="day">
                    <span className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4" /> Day
                    </span>
                  </SelectItem>
                  <SelectItem value="agenda">
                    <span className="flex items-center gap-2">
                      <List className="h-4 w-4" /> Agenda
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="h-[700px] calendar-container">
            {filteredEvents.length > 0 || true ? (
              <Calendar
                localizer={localizer}
                events={filteredEvents}
                startAccessor="start"
                endAccessor="end"
                view={view}
                onView={(newView) => handleViewChange(newView)}
                date={selectedDate}
                onNavigate={handleNavigate}
                selectable
                onSelectEvent={handleSelectEvent}
                onSelectSlot={handleSelectSlot}
                eventPropGetter={eventStyleGetter}
                components={{
                  event: CalendarEvent,
                  toolbar: CustomToolbar,
                }}
                views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
                popup
                popupOffset={30}
                style={{ height: '100%' }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <CalendarDays className="h-16 w-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                  <p className="text-lg font-medium text-gray-900 dark:text-white">No events found</p>
                  <p className="text-sm mt-2 text-gray-500 dark:text-gray-400">Create quotations, agreements, or work orders to see them here</p>
                  <Button onClick={() => setIsCreateEventOpen(true)} className="mt-4 bg-[#D71920] hover:bg-[#b81419]">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Manual Event
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>

        {/* Legend */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Legend:</span>
            {Object.entries(eventTypes).map(([key, config]) => (
              <div key={key} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full shadow-xs" 
                  style={{ backgroundColor: config.color }}
                />
                <span className="text-xs text-gray-600 dark:text-gray-300">{config.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
      
      {/* Event detail dialog */}
      <EventDetailDialog
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        event={selectedEvent}
        eventTypes={eventTypes}
      />
      
      {/* Create event dialog */}
      <CreateEventDialog
        isOpen={isCreateEventOpen}
        onClose={() => setIsCreateEventOpen(false)}
        initialEvent={selectedEvent}
        eventTypes={eventTypes}
      />

      {/* Custom Calendar Styles */}
      <style>{`
        .calendar-container .rbc-calendar {
          font-family: inherit;
          background: transparent;
        }
        
        .calendar-container .rbc-header {
          padding: 12px 8px;
          font-weight: 600;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
          border-bottom: 2px solid #e5e7eb;
          background: #f9fafb;
        }
        
        .dark .calendar-container .rbc-header {
          color: #9ca3af;
          border-bottom-color: #374151;
          background: #1f2937;
        }
        
        .calendar-container .rbc-month-view {
          border: none;
          border-radius: 0;
        }
        
        .calendar-container .rbc-month-row {
          border-color: #e5e7eb;
        }
        
        .dark .calendar-container .rbc-month-row {
          border-color: #374151;
        }
        
        .calendar-container .rbc-day-bg {
          transition: background-color 0.15s ease;
        }
        
        .calendar-container .rbc-day-bg:hover {
          background-color: #f3f4f6;
        }
        
        .dark .calendar-container .rbc-day-bg:hover {
          background-color: #1f2937;
        }
        
        .calendar-container .rbc-today {
          background-color: #fef2f2 !important;
        }
        
        .dark .calendar-container .rbc-today {
          background-color: rgba(215, 25, 32, 0.1) !important;
        }
        
        .calendar-container .rbc-off-range-bg {
          background-color: #f9fafb;
        }
        
        .dark .calendar-container .rbc-off-range-bg {
          background-color: #111827;
        }
        
        .calendar-container .rbc-date-cell {
          padding: 8px;
          text-align: right;
          font-size: 14px;
          font-weight: 500;
        }
        
        .calendar-container .rbc-date-cell.rbc-now {
          font-weight: 700;
        }
        
        .calendar-container .rbc-date-cell.rbc-now > a {
          background-color: #D71920;
          color: white;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        
        .calendar-container .rbc-event {
          border-radius: 6px !important;
          border: none !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .calendar-container .rbc-event:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 6px rgba(0,0,0,0.15);
        }
        
        .calendar-container .rbc-event-content {
          font-size: 11px;
          font-weight: 500;
        }
        
        .calendar-container .rbc-show-more {
          color: #D71920;
          font-weight: 600;
          font-size: 11px;
          background: transparent;
          padding: 2px 4px;
        }
        
        .calendar-container .rbc-show-more:hover {
          background-color: #fef2f2;
          border-radius: 4px;
        }
        
        .calendar-container .rbc-overlay {
          border-radius: 12px;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
          border: 1px solid #e5e7eb;
          padding: 12px;
          max-width: 300px;
        }
        
        .dark .calendar-container .rbc-overlay {
          background-color: #1f2937;
          border-color: #374151;
        }
        
        .calendar-container .rbc-overlay-header {
          font-weight: 600;
          font-size: 14px;
          padding-bottom: 8px;
          margin-bottom: 8px;
          border-bottom: 1px solid #e5e7eb;
        }
        
        .dark .calendar-container .rbc-overlay-header {
          border-bottom-color: #374151;
        }
        
        .calendar-container .rbc-agenda-view {
          border: none;
        }
        
        .calendar-container .rbc-agenda-table {
          border: none;
        }
        
        .calendar-container .rbc-agenda-date-cell,
        .calendar-container .rbc-agenda-time-cell {
          padding: 12px;
          font-size: 13px;
          border-color: #e5e7eb;
        }
        
        .dark .calendar-container .rbc-agenda-date-cell,
        .dark .calendar-container .rbc-agenda-time-cell {
          border-color: #374151;
        }
        
        .calendar-container .rbc-agenda-event-cell {
          padding: 12px;
          border-color: #e5e7eb;
        }
        
        .dark .calendar-container .rbc-agenda-event-cell {
          border-color: #374151;
        }
        
        .calendar-container .rbc-time-view {
          border: none;
        }
        
        .calendar-container .rbc-time-header {
          border-color: #e5e7eb;
        }
        
        .dark .calendar-container .rbc-time-header {
          border-color: #374151;
        }
        
        .calendar-container .rbc-time-content {
          border-color: #e5e7eb;
        }
        
        .dark .calendar-container .rbc-time-content {
          border-color: #374151;
        }
        
        .calendar-container .rbc-timeslot-group {
          border-color: #e5e7eb;
        }
        
        .dark .calendar-container .rbc-timeslot-group {
          border-color: #374151;
        }
        
        .calendar-container .rbc-time-slot {
          border-color: #f3f4f6;
        }
        
        .dark .calendar-container .rbc-time-slot {
          border-color: #1f2937;
        }
        
        .calendar-container .rbc-current-time-indicator {
          background-color: #D71920;
          height: 2px;
        }
        
        .calendar-container .rbc-current-time-indicator::before {
          content: '';
          position: absolute;
          left: -6px;
          top: -4px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background-color: #D71920;
        }
        
        /* Ensure tooltips and hover cards appear above calendar */
        [data-radix-popper-content-wrapper] {
          z-index: 9999 !important;
        }
        
        /* Make sure events are hoverable */
        .calendar-container .rbc-event {
          position: relative;
          z-index: 1;
        }
        
        .calendar-container .rbc-event:hover {
          z-index: 10;
        }
        
        .calendar-container .rbc-overlay {
          z-index: 100;
        }
        
        /* Ensure hover card portal renders above everything */
        [data-radix-hover-card-content] {
          z-index: 9999 !important;
        }
      `}</style>
    </div>
  );
}
