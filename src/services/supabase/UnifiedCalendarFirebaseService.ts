'use client';

import { subscribeToQuotations } from './QuotationFirebaseService';
import { subscribeToAgreements } from './AgreementFirebaseService';
import { subscribeToWorkOrders } from './WorkOrderFirebaseService';
import { subscribeToCalendarEvents } from './CalendarEventFirebaseService';
import { subscribeToFollowups } from './FollowupFirebaseService';
import { subscribeToLeads } from './LeadFirebaseService';

export interface UnifiedCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: 'meeting' | 'contract' | 'compliance' | 'followup' | 'service';
  location?: string;
  attendees?: string[];
  description?: string;
  relatedId?: string;
  clientName?: string;
}

/**
 * Subscribe to all calendar events from multiple sources
 * Merges leads, quotations, agreements, work orders, followups, and manual calendar events
 */
export const subscribeToUnifiedCalendar = (callback: (events: UnifiedCalendarEvent[]) => void) => {
  let leads: any[] = [];
  let quotations: any[] = [];
  let agreements: any[] = [];
  let workOrders: any[] = [];
  let calendarEvents: any[] = [];
  let followups: any[] = [];
  
  const mergeAndCallback = () => {
    const allEvents: UnifiedCalendarEvent[] = [];
    
    // Process Leads - Target start dates
    leads.forEach(lead => {
      if (lead.targetStartDate) {
        const targetDate = new Date(lead.targetStartDate);
        if (!isNaN(targetDate.getTime())) {
          allEvents.push({
            id: `lead-${lead.id}`,
            title: `Lead Target Start: ${lead.name || lead.companyName}`,
            start: targetDate,
            end: targetDate,
            type: 'meeting',
            description: `Target start date for ${lead.companyName}. Status: ${lead.status}`,
            relatedId: lead.id,
            clientName: lead.name || lead.companyName
          });
        }
      }
    });
    
    // Process Quotations - Follow-up dates and validity dates
    quotations.forEach(quotation => {
      // Add follow-up event if validUntil exists
      if (quotation.validUntil) {
        const validDate = new Date(quotation.validUntil);
        if (!isNaN(validDate.getTime())) {
          allEvents.push({
            id: `quotation-${quotation.id}`,
            title: `Quotation Deadline: ${quotation.client || 'Unknown Client'}`,
            start: validDate,
            end: validDate,
            type: 'followup',
            description: `Quotation valid until ${quotation.validUntil}`,
            relatedId: quotation.id,
            clientName: quotation.client
          });
        }
      }
    });
    
    // Process Agreements - Signing deadlines
    agreements.forEach(agreement => {
      // Add agreement signing event
      if (agreement.createdAt) {
        const createdDate = agreement.createdAt instanceof Date 
          ? agreement.createdAt 
          : agreement.createdAt.toDate?.() || new Date(agreement.createdAt);
        
        allEvents.push({
          id: `agreement-${agreement.id}`,
          title: `Agreement: ${agreement.clientName || 'Unknown Client'}`,
          start: createdDate,
          end: createdDate,
          type: 'contract',
          description: `Agreement status: ${agreement.status}`,
          relatedId: agreement.id,
          clientName: agreement.clientName
        });
      }
    });
    
    // Process Work Orders - Service delivery periods
    workOrders.forEach(workOrder => {
      const startDate = workOrder.startDate 
        ? (workOrder.startDate instanceof Date 
            ? workOrder.startDate 
            : workOrder.startDate.toDate?.() || new Date(workOrder.startDate))
        : workOrder.createdAt instanceof Date
          ? workOrder.createdAt
          : workOrder.createdAt?.toDate?.() || new Date();
      
      const endDate = workOrder.completionDate
        ? (workOrder.completionDate instanceof Date
            ? workOrder.completionDate
            : workOrder.completionDate.toDate?.() || new Date(workOrder.completionDate))
        : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000); // Default 30 days
      
      allEvents.push({
        id: `workorder-${workOrder.id}`,
        title: `Service: ${workOrder.clientName || 'Unknown Client'}`,
        start: startDate,
        end: endDate,
        type: 'service',
        description: `Work Order status: ${workOrder.status}`,
        relatedId: workOrder.id,
        clientName: workOrder.clientName
      });
    });
    
    // Process Followups - Scheduled meetings and calls
    followups.forEach(followup => {
      if (followup.dateTime) {
        const followupDate = new Date(followup.dateTime);
        if (!isNaN(followupDate.getTime())) {
          const followupEndDate = new Date(followupDate.getTime() + 60 * 60 * 1000); // 1 hour duration
          
          allEvents.push({
            id: `followup-direct-${followup.id}`,
            title: `${followup.type || 'Follow-up'}: ${followup.contact}`,
            start: followupDate,
            end: followupEndDate,
            type: 'followup',
            description: followup.subject,
            relatedId: followup.id,
            clientName: followup.contact,
            attendees: [followup.contact]
          });
        }
      }
    });
    
    // Process Manual Calendar Events
    calendarEvents.forEach(event => {
      allEvents.push({
        id: event.id || `event-${Date.now()}`,
        title: event.title,
        start: event.start instanceof Date ? event.start : event.start.toDate?.() || new Date(event.start),
        end: event.end instanceof Date ? event.end : event.end.toDate?.() || new Date(event.end),
        type: event.type || 'meeting',
        location: event.location,
        attendees: event.attendees,
        description: event.description,
        relatedId: event.relatedId
      });
    });
    
    // Sort by start date
    allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
    
    callback(allEvents);
  };
  
  // Subscribe to all sources
  const unsubscribeQuotations = subscribeToQuotations((data) => {
    quotations = data;
    mergeAndCallback();
  });
  
  const unsubscribeAgreements = subscribeToAgreements((data) => {
    agreements = data;
    mergeAndCallback();
  });
  
  const unsubscribeWorkOrders = subscribeToWorkOrders((data) => {
    workOrders = data;
    mergeAndCallback();
  });
  
  const unsubscribeCalendarEvents = subscribeToCalendarEvents((data) => {
    calendarEvents = data;
    mergeAndCallback();
  });
  
  const unsubscribeFollowups = subscribeToFollowups((data) => {
    followups = data;
    mergeAndCallback();
  });
  
  const unsubscribeLeads = subscribeToLeads((data) => {
    leads = data;
    mergeAndCallback();
  });
  
  // Return combined unsubscribe function
  return () => {
    unsubscribeLeads();
    unsubscribeQuotations();
    unsubscribeAgreements();
    unsubscribeWorkOrders();
    unsubscribeCalendarEvents();
    unsubscribeFollowups();
  };
};
