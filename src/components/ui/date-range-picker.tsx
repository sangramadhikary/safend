'use client';

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  value: {
    startDate: Date;
    endDate: Date;
  };
  onChange: (value: { startDate: Date; endDate: Date }) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [startDate, setStartDate] = React.useState<Date | undefined>(value.startDate);
  const [endDate, setEndDate] = React.useState<Date | undefined>(value.endDate);

  // Update local state when props change
  React.useEffect(() => {
    setStartDate(value.startDate);
    setEndDate(value.endDate);
  }, [value.startDate, value.endDate]);

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;

    if (!startDate || (startDate && endDate)) {
      setStartDate(date);
      setEndDate(undefined);
    } else if (!endDate && date >= startDate) {
      setEndDate(date);
    } else {
      setStartDate(date);
      setEndDate(undefined);
    }
  };

  // Apply changes when both dates are selected
  React.useEffect(() => {
    if (startDate && endDate) {
      onChange({ startDate, endDate });
      setIsOpen(false);
    }
  }, [startDate, endDate, onChange]);

  const formattedRange = startDate && endDate 
    ? `${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")}`
    : "Select date range";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[250px] justify-start text-left font-normal">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {formattedRange}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={{
            from: startDate,
            to: endDate,
          }}
          onSelect={(range) => {
            if (!range) return;
            setStartDate(range.from);
            setEndDate(range.to);
            if (range.from && range.to) {
              onChange({ startDate: range.from, endDate: range.to });
              setIsOpen(false);
            }
          }}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}
