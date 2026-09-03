'use client';
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StaffRequirementsForm } from "./StaffRequirementsForm";

interface PostLocation {
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
}

interface StaffRequirement {
  role: string;
  count: number;
  shift: string;
  startTime: string;
  endTime: string;
  days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
}

interface Post {
  name: string;
  code: string;
  type: 'permanent' | 'temporary';
  location: PostLocation;
  dutyType: '8H' | '12H';
  requiredStaff: StaffRequirement[];
}

interface SecurityPostFormProps {
  post: Post;
  postIndex: number;
  onPostChange: (index: number, field: string, value: string | boolean) => void;
  onRemovePost: (index: number) => void;
  onStaffChange: (postIndex: number, staffIndex: number, field: string, value: string | number | string[]) => void;
  onAddStaffRequirement: (postIndex: number) => void;
  onRemoveStaffRequirement: (postIndex: number, staffIndex: number) => void;
  onDayToggle: (postIndex: number, staffIndex: number, day: string, isSelected: boolean) => void;
  allowRemove: boolean;
}

export function SecurityPostForm({
  post,
  postIndex,
  onPostChange,
  onRemovePost,
  onStaffChange,
  onAddStaffRequirement,
  onRemoveStaffRequirement,
  onDayToggle,
  allowRemove
}: SecurityPostFormProps) {
  return (
    <div className="border rounded-md p-4 mb-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="font-medium text-base">Post {postIndex + 1}</h4>
          <p className="text-sm text-muted-foreground">Code: {post.code}</p>
        </div>
        
        {allowRemove && (
          <Button 
            type="button" 
            variant="ghost" 
            size="sm" 
            className="text-red-500 hover:text-red-700 h-8"
            onClick={() => onRemovePost(postIndex)}
          >
            Remove
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Post Name *</Label>
          <Input 
            value={post.name} 
            onChange={(e) => onPostChange(postIndex, 'name', e.target.value)}
            placeholder="Post name" 
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label>Post Type</Label>
          <Select 
            value={post.type} 
            onValueChange={(value) => onPostChange(postIndex, 'type', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select post type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="permanent">Permanent</SelectItem>
              <SelectItem value="temporary">Temporary</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="space-y-2 mt-4">
        <Label>Post Address *</Label>
        <Input 
          value={post.location.address} 
          onChange={(e) => onPostChange(postIndex, 'location.address', e.target.value)}
          placeholder="Post address" 
          required
        />
      </div>
      
      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="space-y-2">
          <Label>City</Label>
          <Input 
            value={post.location.city || ''} 
            onChange={(e) => onPostChange(postIndex, 'location.city', e.target.value)}
            placeholder="City" 
          />
        </div>
        <div className="space-y-2">
          <Label>State</Label>
          <Input 
            value={post.location.state || ''} 
            onChange={(e) => onPostChange(postIndex, 'location.state', e.target.value)}
            placeholder="State" 
          />
        </div>
        <div className="space-y-2">
          <Label>PIN Code</Label>
          <Input 
            value={post.location.pincode || ''} 
            onChange={(e) => onPostChange(postIndex, 'location.pincode', e.target.value)}
            placeholder="PIN Code" 
          />
        </div>
      </div>
      
      <div className="space-y-2 mt-4">
        <Label>Duty Type</Label>
        <Select 
          value={post.dutyType} 
          onValueChange={(value) => onPostChange(postIndex, 'dutyType', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select duty type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="8H">8-Hour Shift</SelectItem>
            <SelectItem value="12H">12-Hour Shift</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <StaffRequirementsForm 
        postIndex={postIndex}
        staffRequirements={post.requiredStaff}
        dutyType={post.dutyType}
        onStaffChange={onStaffChange}
        onAddStaffRequirement={onAddStaffRequirement}
        onRemoveStaffRequirement={onRemoveStaffRequirement}
        onDayToggle={onDayToggle}
      />
    </div>
  );
}
