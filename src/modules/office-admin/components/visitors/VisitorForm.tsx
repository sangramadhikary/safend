'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { checkInVisitor } from "@/services/visitors/VisitorService";
import { useToast } from "@/hooks/use-toast";

interface VisitorFormProps {
  branchId: string;
  onSuccess: () => void;
}

export function VisitorForm({ branchId, onSuccess }: VisitorFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    company: "",
    idType: "aadhar" as "aadhar" | "pan" | "driving_license" | "voter_id" | "passport" | "other",
    idNumber: "",
    purpose: "",
    hostEmployeeId: "",
    hostName: "",
    agreementSigned: false
  });
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ 
      ...prev, 
      [name]: value as "aadhar" | "pan" | "driving_license" | "voter_id" | "passport" | "other" 
    }));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.phone || !formData.idNumber || !formData.purpose || !formData.hostName) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      await checkInVisitor({
        ...formData,
        branchId,
        agreementSigned: true, // For demo purposes, assuming agreement is always signed
      });
      
      toast({
        title: "Success",
        description: "Visitor has been checked in successfully"
      });
      
      onSuccess();
    } catch (error) {
      console.error("Error checking in visitor:", error);
      toast({
        title: "Error",
        description: "Failed to check in visitor",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name <span className="text-red-500">*</span></Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="phone">Phone <span className="text-red-500">*</span></Label>
          <Input
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="company">Company</Label>
          <Input
            id="company"
            name="company"
            value={formData.company}
            onChange={handleChange}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="idType">ID Type <span className="text-red-500">*</span></Label>
          <Select
            value={formData.idType}
            onValueChange={(value) => handleSelectChange("idType", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="aadhar">Aadhar Card</SelectItem>
              <SelectItem value="pan">PAN Card</SelectItem>
              <SelectItem value="driving_license">Driving License</SelectItem>
              <SelectItem value="voter_id">Voter ID</SelectItem>
              <SelectItem value="passport">Passport</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="idNumber">ID Number <span className="text-red-500">*</span></Label>
          <Input
            id="idNumber"
            name="idNumber"
            value={formData.idNumber}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="hostName">Host Name <span className="text-red-500">*</span></Label>
          <Input
            id="hostName"
            name="hostName"
            value={formData.hostName}
            onChange={handleChange}
            required
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="hostEmployeeId">Host Employee ID</Label>
          <Input
            id="hostEmployeeId"
            name="hostEmployeeId"
            value={formData.hostEmployeeId}
            onChange={handleChange}
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="purpose">Purpose <span className="text-red-500">*</span></Label>
        <Textarea
          id="purpose"
          name="purpose"
          value={formData.purpose}
          onChange={handleChange}
          required
        />
      </div>
      
      <div className="mt-6 flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Checking in..." : "Check In Visitor"}
        </Button>
      </div>
    </form>
  );
}
