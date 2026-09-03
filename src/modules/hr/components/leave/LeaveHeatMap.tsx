'use client';

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface LeaveHeatMapProps {
  month: string;
}

interface CalendarDay {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  leaves: {
    planned: number;
    unplanned: number;
    uninformed: number;
    abscond: number;
  }
}

export function LeaveHeatMap({ month }: LeaveHeatMapProps) {
  const [calendar, setCalendar] = useState<CalendarDay[][]>([]);
  
  useEffect(() => {
    // Generate calendar data
    const [year, monthNum] = month.split('-').map(Number);
    const currentDate = new Date(year, monthNum - 1);
    const firstDay = new Date(year, monthNum - 1, 1).getDay();
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    
    // Leave data - returns empty until connected to real attendance data
    const generateMockLeaves = (_day: number) => {
      return {
        planned: 0,
        unplanned: 0,
        uninformed: 0,
        abscond: 0
      };
    };
    
    const weeks: CalendarDay[][] = [];
    let days: CalendarDay[] = [];
    
    // Add days from previous month
    const prevMonthDays = new Date(year, monthNum - 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) {
      const dayNumber = prevMonthDays - firstDay + i + 1;
      days.push({
        date: `${year}-${String(monthNum - 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`,
        day: dayNumber,
        isCurrentMonth: false,
        leaves: { planned: 0, unplanned: 0, uninformed: 0, abscond: 0 }
      });
    }
    
    // Add days from current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: `${year}-${String(monthNum).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
        day: i,
        isCurrentMonth: true,
        leaves: generateMockLeaves(i)
      });
      
      if ((firstDay + i) % 7 === 0 || i === daysInMonth) {
        weeks.push(days);
        days = [];
      }
    }
    
    // Add days from next month to fill the last row
    if (days.length > 0) {
      const daysToAdd = 7 - days.length;
      for (let i = 1; i <= daysToAdd; i++) {
        days.push({
          date: `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
          day: i,
          isCurrentMonth: false,
          leaves: { planned: 0, unplanned: 0, uninformed: 0, abscond: 0 }
        });
      }
      weeks.push(days);
    }
    
    setCalendar(weeks);
  }, [month]);
  
  // Calculate intensity for heatmap color
  const getHeatColor = (day: CalendarDay) => {
    const totalLeaves = day.leaves.planned + day.leaves.unplanned + day.leaves.uninformed + day.leaves.abscond;
    
    // Prioritize abscond and uninformed
    if (day.leaves.abscond > 0) {
      return 'bg-red-100 dark:bg-red-900/30';
    }
    
    if (day.leaves.uninformed > 0) {
      return 'bg-amber-100 dark:bg-amber-900/30';
    }
    
    // Then scale by total leaves
    if (totalLeaves === 0) return '';
    if (totalLeaves === 1) return 'bg-blue-50 dark:bg-blue-900/20';
    if (totalLeaves === 2) return 'bg-blue-100 dark:bg-blue-900/30';
    if (totalLeaves === 3) return 'bg-blue-200 dark:bg-blue-900/40';
    return 'bg-blue-300 dark:bg-blue-900/50';
  };
  
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  return (
    <div>
      <div className="mb-6 flex justify-center space-x-4">
        <div className="flex items-center">
          <div className="h-3 w-3 rounded-sm bg-blue-200 mr-2"></div>
          <span className="text-xs">Planned</span>
        </div>
        <div className="flex items-center">
          <div className="h-3 w-3 rounded-sm bg-purple-200 mr-2"></div>
          <span className="text-xs">Unplanned</span>
        </div>
        <div className="flex items-center">
          <div className="h-3 w-3 rounded-sm bg-amber-200 mr-2"></div>
          <span className="text-xs">Uninformed</span>
        </div>
        <div className="flex items-center">
          <div className="h-3 w-3 rounded-sm bg-red-200 mr-2"></div>
          <span className="text-xs">Abscond</span>
        </div>
      </div>
    
      <div className="grid grid-cols-7 gap-1">
        {weekdays.map(day => (
          <div key={day} className="text-center text-sm font-medium py-1">
            {day}
          </div>
        ))}
        
        {calendar.map((week, weekIndex) => (
          week.map((day, dayIndex) => (
            <div 
              key={`${weekIndex}-${dayIndex}`} 
              className={`
                h-20 p-1 border rounded-md relative
                ${day.isCurrentMonth ? '' : 'opacity-40'}
                ${getHeatColor(day)}
              `}
            >
              <div className="text-xs absolute top-1 left-1">{day.day}</div>
              <div className="mt-3 flex flex-col gap-1">
                {day.leaves.planned > 0 && (
                  <Badge variant="outline" className="bg-blue-100 border-blue-200 text-xs text-blue-700 w-full justify-center">
                    {day.leaves.planned} Planned
                  </Badge>
                )}
                {day.leaves.unplanned > 0 && (
                  <Badge variant="outline" className="bg-purple-100 border-purple-200 text-xs text-purple-700 w-full justify-center">
                    {day.leaves.unplanned} Unplanned
                  </Badge>
                )}
                {day.leaves.uninformed > 0 && (
                  <Badge variant="outline" className="bg-amber-100 border-amber-200 text-xs text-amber-700 w-full justify-center">
                    {day.leaves.uninformed} Uninformed
                  </Badge>
                )}
                {day.leaves.abscond > 0 && (
                  <Badge variant="outline" className="bg-red-100 border-red-200 text-xs text-red-700 w-full justify-center">
                    {day.leaves.abscond} Abscond
                  </Badge>
                )}
              </div>
            </div>
          ))
        ))}
      </div>
    </div>
  );
}
