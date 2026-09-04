'use client';
import { useState, useEffect } from 'react';
import { format, subMonths, startOfMonth, endOfMonth, subDays, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from '@/components/ui/calendar';
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from '@/components/ui/label';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface DateRangeSelectorProps {
  onRangeChange: (range: DateRange) => void;
  defaultRange?: 'current-month' | 'prev-month' | 'quarter' | 'year' | 'custom';
  className?: string;
  showPresets?: boolean;
}

export function DateRangeSelector({
  onRangeChange,
  defaultRange = 'current-month',
  className,
  showPresets = true
}: DateRangeSelectorProps) {
  const [range, setRange] = useState<DateRange>({
    startDate: startOfMonth(new Date()),
    endDate: endOfMonth(new Date())
  });
  const [selectedPreset, setSelectedPreset] = useState<string>(defaultRange);
  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);

  useEffect(() => {
    applyPreset(defaultRange);
  }, [defaultRange]);

  const applyPreset = (preset: string) => {
    const today = new Date();
    let start: Date, end: Date;

    switch (preset) {
      case 'current-month':
        start = startOfMonth(today);
        end = endOfMonth(today);
        break;
      case 'prev-month':
        start = startOfMonth(subMonths(today, 1));
        end = endOfMonth(subMonths(today, 1));
        break;
      case 'last-30':
        start = subDays(today, 29);
        end = today;
        break;
      case 'last-90':
        start = subDays(today, 89);
        end = today;
        break;
      case 'quarter':
        start = startOfQuarter(today);
        end = endOfQuarter(today);
        break;
      case 'year':
        start = startOfYear(today);
        end = endOfYear(today);
        break;
      case 'custom':
        // Keep existing date range
        return;
      default:
        start = startOfMonth(today);
        end = endOfMonth(today);
    }

    const newRange = { startDate: start, endDate: end };
    setRange(newRange);
    setSelectedPreset(preset);
    onRangeChange(newRange);
  };

  const handleStartDateChange = (date: Date | undefined) => {
    if (!date) return;
    
    const newRange = { ...range, startDate: date };
    if (date > range.endDate) {
      newRange.endDate = date;
    }
    
    setRange(newRange);
    setSelectedPreset('custom');
    onRangeChange(newRange);
    setShowStartCalendar(false);
  };

  const handleEndDateChange = (date: Date | undefined) => {
    if (!date) return;
    
    const newRange = { ...range, endDate: date };
    if (date < range.startDate) {
      newRange.startDate = date;
    }
    
    setRange(newRange);
    setSelectedPreset('custom');
    onRangeChange(newRange);
    setShowEndCalendar(false);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {showPresets && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Label>Period:</Label>
          <Select value={selectedPreset} onValueChange={applyPreset}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current-month">Current Month</SelectItem>
              <SelectItem value="prev-month">Previous Month</SelectItem>
              <SelectItem value="last-30">Last 30 Days</SelectItem>
              <SelectItem value="last-90">Last 90 Days</SelectItem>
              <SelectItem value="quarter">Current Quarter</SelectItem>
              <SelectItem value="year">Current Year</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Start Date</Label>
          <Popover open={showStartCalendar} onOpenChange={setShowStartCalendar}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !range.startDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {range.startDate ? format(range.startDate, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={range.startDate}
                onSelect={handleStartDateChange}
                autoFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
        
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">End Date</Label>
          <Popover open={showEndCalendar} onOpenChange={setShowEndCalendar}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !range.endDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {range.endDate ? format(range.endDate, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={range.endDate}
                onSelect={handleEndDateChange}
                autoFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
