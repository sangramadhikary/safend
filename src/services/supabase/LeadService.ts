'use client';

// Frontend-only service - no Firebase integration
export interface LeadData {
  id?: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  source: string;
  status: string;
  assignedTo: string;
  securityNeeds: {
    armedGuards: boolean;
    unarmedGuards: boolean;
    supervisors: boolean;
    patrolOfficers: boolean;
    eventSecurity: boolean;
    personalSecurity: boolean;
  };
  manpowerRequirements: {
    totalGuardsNeeded: string;
    shiftType: string;
    shiftCount: string;
    femaleGuardsRequired: boolean;
    exServicemenRequired: boolean;
  };
  siteInformation: {
    siteCount: string;
    primaryLocation: string;
    locationType: string;
    siteArea: string;
    accessControlNeeded: boolean;
    cameraSystemNeeded: boolean;
  };
  budget: string;
  targetStartDate: string;
  urgency: string;
  notes: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ToastFunction {
  (options: { title: string; description: string; variant?: 'default' | 'destructive' }): void;
}

import { createLead, updateLead, getAllLeads } from './LeadFirebaseService';
import { triggerLeadsRefresh } from '@/utils/dataRefresh';

export const handleFormSubmit = async (
  formData: LeadData, 
  toast: ToastFunction
): Promise<void> => {
  try {
    if (formData.id && formData.id !== '') {
      // Update existing lead
      const result = await updateLead(formData.id, formData);
      
      if (result.success) {
        triggerLeadsRefresh();
        toast({
          title: "Success",
          description: "Lead updated successfully"
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to update lead",
          variant: "destructive"
        });
      }
    } else {
      // Create new lead
      const result = await createLead(formData);
      
      if (result.success) {
        triggerLeadsRefresh();
        toast({
          title: "Success",
          description: "Lead created successfully"
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to create lead",
          variant: "destructive"
        });
      }
    }
  } catch (error: any) {
    console.error('Error saving lead:', error);
    toast({
      title: "Error",
      description: "Failed to save lead",
      variant: "destructive"
    });
  }
};
