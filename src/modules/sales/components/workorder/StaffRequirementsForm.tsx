'use client';

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StaffRequirement {
  role: string;
  count: number;
  shift: string;
  startTime: string;
  endTime: string;
  days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
}

interface StaffRequirementsFormProps {
  postIndex: number;
  staffRequirements: StaffRequirement[];
  dutyType: '8H' | '12H';
  onStaffChange: (postIndex: number, staffIndex: number, field: string, value: string | number | string[]) => void;
  onAddStaffRequirement: (postIndex: number) => void;
  onRemoveStaffRequirement: (postIndex: number, staffIndex: number) => void;
  onDayToggle: (postIndex: number, staffIndex: number, day: string, isSelected: boolean) => void;
}

export function StaffRequirementsForm({
  postIndex,
  staffRequirements,
  dutyType,
  onStaffChange,
  onAddStaffRequirement,
  onRemoveStaffRequirement,
  onDayToggle
}: StaffRequirementsFormProps) {
  return (
    <div className="mt-6 mb-2">
      <div className="flex justify-between items-center">
        <h5 className="font-medium">Required Staff</h5>
        <Button 
          type="button" 
          variant="outline" 
          size="sm"
          onClick={() => onAddStaffRequirement(postIndex)}
        >
          Add Staff Type
        </Button>
      </div>
      
      {staffRequirements.map((staff, staffIndex) => (
        <div key={staffIndex} className="border-t mt-4 pt-4">
          <div className="flex justify-between items-center mb-3">
            <h6 className="text-sm font-medium">Staff Type {staffIndex + 1}</h6>
            
            {staffRequirements.length > 1 && (
              <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                className="text-red-500 hover:text-red-700 h-7 text-xs"
                onClick={() => onRemoveStaffRequirement(postIndex, staffIndex)}
              >
                Remove
              </Button>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select 
                value={staff.role} 
                onValueChange={(value) => onStaffChange(postIndex, staffIndex, 'role', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Security Guard">Security Guard</SelectItem>
                  <SelectItem value="Armed Guard">Armed Guard</SelectItem>
                  <SelectItem value="Supervisor">Supervisor</SelectItem>
                  <SelectItem value="Patrol Officer">Patrol Officer</SelectItem>
                  <SelectItem value="PSO">PSO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Count</Label>
              <Input 
                type="number" 
                min="1" 
                value={staff.count} 
                onChange={(e) => onStaffChange(postIndex, staffIndex, 'count', e.target.value)}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div className="space-y-2">
              <Label>Shift</Label>
              <Select 
                value={staff.shift} 
                onValueChange={(value) => onStaffChange(postIndex, staffIndex, 'shift', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {dutyType === '12H' ? (
                    <>
                      <SelectItem value="Morning">Morning</SelectItem>
                      <SelectItem value="Night">Night</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="Day">Day</SelectItem>
                      <SelectItem value="Night">Night</SelectItem>
                      <SelectItem value="Evening">Evening</SelectItem>
                      <SelectItem value="Morning">Morning</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              {dutyType === '12H' && (
                <p className="text-xs text-muted-foreground">12-hour shifts: Morning or Night only</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input 
                type="time" 
                value={staff.startTime} 
                onChange={(e) => onStaffChange(postIndex, staffIndex, 'startTime', e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input 
                type="time" 
                value={staff.endTime} 
                onChange={(e) => onStaffChange(postIndex, staffIndex, 'endTime', e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2 mb-2">
            <Label>Working Days</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => (
                <div key={day} className="flex items-center space-x-1">
                  <Checkbox 
                    id={`${postIndex}-${staffIndex}-${day}`}
                    checked={staff.days.includes(day as any)}
                    onCheckedChange={(checked) => 
                      onDayToggle(postIndex, staffIndex, day, checked === true)
                    }
                  />
                  <Label htmlFor={`${postIndex}-${staffIndex}-${day}`} className="text-sm capitalize">
                    {day}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
