'use client';

import { MaintenanceTicket, MaintenanceSchedule } from "@/types/maintenance";
import { emitEvent, EVENT_TYPES } from "@/services/EventService";

// Mock data for maintenance tickets
const mockMaintenanceTickets: MaintenanceTicket[] = [
  {
    id: "MT001",
    branchId: "branch-001",
    title: "Air Conditioner Not Cooling",
    description: "AC in the conference room is not cooling properly",
    priority: "high",
    status: "open",
    category: "hvac",
    reportedBy: "John Smith",
    locationDetails: "Conference Room A, 3rd Floor",
    createdAt: "2025-05-01T09:30:00Z",
    updatedAt: "2025-05-01T09:30:00Z",
  },
  {
    id: "MT002",
    branchId: "branch-001",
    title: "Leaking Water Pipe",
    description: "Water pipe in the men's restroom is leaking",
    priority: "medium",
    status: "in-progress",
    category: "plumbing",
    reportedBy: "Jane Doe",
    assignedTo: "Mike Plumber",
    locationDetails: "Men's Restroom, 2nd Floor",
    createdAt: "2025-05-02T14:15:00Z",
    updatedAt: "2025-05-02T16:30:00Z",
    scheduledDate: "2025-05-03T10:00:00Z",
  },
  {
    id: "MT003",
    branchId: "branch-002",
    title: "Flickering Lights",
    description: "Lights in the main hall are flickering",
    priority: "low",
    status: "completed",
    category: "electrical",
    reportedBy: "Robert Johnson",
    assignedTo: "Electric Team",
    locationDetails: "Main Hall",
    createdAt: "2025-04-28T11:45:00Z",
    updatedAt: "2025-04-29T15:20:00Z",
    completedAt: "2025-04-29T15:20:00Z",
    actualCost: 2500,
  }
];

// Mock data for maintenance schedules
const mockMaintenanceSchedules: MaintenanceSchedule[] = [
  {
    id: "MS001",
    branchId: "branch-001",
    title: "HVAC System Maintenance",
    description: "Regular maintenance of all HVAC units",
    assetName: "Central HVAC System",
    frequency: "quarterly",
    nextDueDate: "2025-06-15T00:00:00Z",
    lastCompletedDate: "2025-03-15T14:30:00Z",
    assignedTo: "HVAC Team",
    status: "upcoming",
    procedures: [
      "Clean filters",
      "Check refrigerant levels",
      "Inspect ductwork",
      "Test thermostats"
    ],
    createdAt: "2025-01-10T10:00:00Z",
    updatedAt: "2025-03-15T14:30:00Z",
  },
  {
    id: "MS002",
    branchId: "branch-001",
    title: "Fire Alarm Testing",
    description: "Mandatory testing of all fire alarms and safety equipment",
    frequency: "monthly",
    nextDueDate: "2025-05-10T00:00:00Z",
    lastCompletedDate: "2025-04-10T11:15:00Z",
    assignedTo: "Safety Officer",
    status: "upcoming",
    procedures: [
      "Test all alarms",
      "Check smoke detectors",
      "Inspect fire extinguishers",
      "Verify emergency exits"
    ],
    createdAt: "2025-01-05T09:00:00Z",
    updatedAt: "2025-04-10T11:15:00Z",
  },
  {
    id: "MS003",
    branchId: "branch-002",
    title: "Generator Maintenance",
    description: "Preventive maintenance of backup generator",
    assetName: "Backup Generator",
    frequency: "biannually",
    nextDueDate: "2025-05-05T00:00:00Z",
    lastCompletedDate: "2024-11-05T13:45:00Z",
    assignedTo: "Maintenance Team",
    status: "overdue",
    procedures: [
      "Check oil levels",
      "Replace filters",
      "Test auto-start functionality",
      "Run under load for 30 minutes"
    ],
    createdAt: "2024-05-05T08:30:00Z",
    updatedAt: "2024-11-05T13:45:00Z",
  }
];

// Maintenance Service functions
export const getMaintenanceTickets = (branchId: string): MaintenanceTicket[] => {
  return mockMaintenanceTickets.filter(ticket => ticket.branchId === branchId);
};

export const getMaintenanceTicketById = (ticketId: string): MaintenanceTicket | undefined => {
  return mockMaintenanceTickets.find(ticket => ticket.id === ticketId);
};

export const createMaintenanceTicket = (ticket: Omit<MaintenanceTicket, 'id' | 'createdAt' | 'updatedAt'>): MaintenanceTicket => {
  const newTicket: MaintenanceTicket = {
    ...ticket,
    id: `MT${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  mockMaintenanceTickets.push(newTicket);
  
  emitEvent(EVENT_TYPES.MAINTENANCE_CREATED, {
    ticketId: newTicket.id,
    title: newTicket.title,
    priority: newTicket.priority,
  });
  
  return newTicket;
};

export const updateMaintenanceTicket = (ticket: MaintenanceTicket): MaintenanceTicket => {
  const index = mockMaintenanceTickets.findIndex(t => t.id === ticket.id);
  
  if (index !== -1) {
    const updatedTicket = {
      ...ticket,
      updatedAt: new Date().toISOString(),
    };
    
    mockMaintenanceTickets[index] = updatedTicket;
    
    if (updatedTicket.status === 'completed' && !updatedTicket.completedAt) {
      updatedTicket.completedAt = new Date().toISOString();
      
      emitEvent(EVENT_TYPES.MAINTENANCE_COMPLETED, {
        ticketId: updatedTicket.id,
        title: updatedTicket.title,
      });
    }
    
    return updatedTicket;
  }
  
  throw new Error(`Maintenance ticket with ID ${ticket.id} not found`);
};

export const getMaintenanceSchedules = (branchId: string): MaintenanceSchedule[] => {
  return mockMaintenanceSchedules.filter(schedule => schedule.branchId === branchId);
};

export const getMaintenanceScheduleById = (scheduleId: string): MaintenanceSchedule | undefined => {
  return mockMaintenanceSchedules.find(schedule => schedule.id === scheduleId);
};

export const createMaintenanceSchedule = (schedule: Omit<MaintenanceSchedule, 'id' | 'createdAt' | 'updatedAt'>): MaintenanceSchedule => {
  const newSchedule: MaintenanceSchedule = {
    ...schedule,
    id: `MS${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  mockMaintenanceSchedules.push(newSchedule);
  
  return newSchedule;
};

export const updateMaintenanceSchedule = (schedule: MaintenanceSchedule): MaintenanceSchedule => {
  const index = mockMaintenanceSchedules.findIndex(s => s.id === schedule.id);
  
  if (index !== -1) {
    const updatedSchedule = {
      ...schedule,
      updatedAt: new Date().toISOString(),
    };
    
    mockMaintenanceSchedules[index] = updatedSchedule;
    return updatedSchedule;
  }
  
  throw new Error(`Maintenance schedule with ID ${schedule.id} not found`);
};

export const completeScheduledMaintenance = (scheduleId: string): MaintenanceSchedule => {
  const schedule = mockMaintenanceSchedules.find(s => s.id === scheduleId);
  
  if (!schedule) {
    throw new Error(`Maintenance schedule with ID ${scheduleId} not found`);
  }
  
  // Calculate next due date based on frequency
  const lastCompleted = new Date();
  let nextDue = new Date(lastCompleted);
  
  switch (schedule.frequency) {
    case 'daily':
      nextDue.setDate(nextDue.getDate() + 1);
      break;
    case 'weekly':
      nextDue.setDate(nextDue.getDate() + 7);
      break;
    case 'biweekly':
      nextDue.setDate(nextDue.getDate() + 14);
      break;
    case 'monthly':
      nextDue.setMonth(nextDue.getMonth() + 1);
      break;
    case 'quarterly':
      nextDue.setMonth(nextDue.getMonth() + 3);
      break;
    case 'biannually':
      nextDue.setMonth(nextDue.getMonth() + 6);
      break;
    case 'annually':
      nextDue.setFullYear(nextDue.getFullYear() + 1);
      break;
    default:
      nextDue.setMonth(nextDue.getMonth() + 1);
  }
  
  const updatedSchedule: MaintenanceSchedule = {
    ...schedule,
    lastCompletedDate: lastCompleted.toISOString(),
    nextDueDate: nextDue.toISOString(),
    status: 'upcoming',
    updatedAt: new Date().toISOString(),
  };
  
  const index = mockMaintenanceSchedules.findIndex(s => s.id === scheduleId);
  mockMaintenanceSchedules[index] = updatedSchedule;
  
  return updatedSchedule;
};
