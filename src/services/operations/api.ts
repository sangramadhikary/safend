'use client';

import axios from 'axios';
import { API_BASE_URL } from '@/config';
import { 
  Post, TempPost, Rota, Attendance, LeaveRequest, 
  PatrolVisit, Penalty, Contact, Branch,
  MessMeal, MessCharge, MessSummary
} from '@/types/operations';

// Create axios instance with auth headers
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth interceptor
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Add branch context for multi-tenancy
  const branchId = localStorage.getItem('selectedBranchId');
  if (branchId) {
    config.headers['X-Branch-ID'] = branchId;
  }
  
  return config;
});

// Posts API
export const postsApi = {
  getAllPosts: () => apiClient.get('/posts'),
  getPostById: (id: string) => apiClient.get(`/posts/${id}`),
  createFromWorkOrder: (data: Partial<Post>) => apiClient.post('/posts/from-wo', data),
  createTempPost: (data: Partial<TempPost>) => apiClient.post('/posts/temp', data),
  updatePost: (id: string, data: Partial<Post>) => apiClient.patch(`/posts/${id}`, data),
  deactivatePost: (id: string) => apiClient.patch(`/posts/${id}`, { status: 'inactive' }),
};

// Rota Management API
export const rotaApi = {
  generateRota: (data: {
    postId: string;
    dateRange: { start: string; end: string };
    dutyType: '8H' | '12H';
  }) => apiClient.post('/rota/generate', data),
  getRotaForPost: (postId: string, startDate: string, endDate: string) => 
    apiClient.get(`/rota?postId=${postId}&startDate=${startDate}&endDate=${endDate}`),
  updateRotaShift: (shiftId: string, data: Partial<Rota>) => 
    apiClient.patch(`/rota/shifts/${shiftId}`, data),
  publishRota: (rotaId: string) => apiClient.patch(`/rota/${rotaId}/publish`),
};

// Attendance API
export const attendanceApi = {
  getAttendanceList: (postId?: string, date?: string, shift?: string) => 
    apiClient.get('/attendance', { params: { postId, date, shift } }),
  markAttendance: (id: string, status: 'present' | 'absent' | 'half_day', data: Partial<Attendance>) => 
    apiClient.put(`/attendance/${id}`, { status, ...data }),
  undoAttendance: (id: string) => apiClient.post(`/attendance/${id}/undo`),
  getReplacementOptions: (originalEmpId: string, shiftDate: string) => 
    apiClient.get(`/employees/available`, { params: { excludeEmpId: originalEmpId, date: shiftDate } }),
  confirmReplacement: (attendanceId: string, replacementId: string) => 
    apiClient.post(`/attendance/${attendanceId}/replacement`, { replacementId }),
};

// Leave Management API
export const leaveApi = {
  applyLeave: (data: Partial<LeaveRequest>) => apiClient.post('/leave', data),
  getLeaveRequests: (status?: string, employeeId?: string) => 
    apiClient.get('/leave', { params: { status, employeeId } }),
  updateLeaveRequest: (id: string, data: Partial<LeaveRequest>) => 
    apiClient.patch(`/leave/${id}`, data),
  getLeaveStats: (employeeId?: string, year?: number) => 
    apiClient.get('/leave/stats', { params: { employeeId, year } }),
};

// Patrol & Client Feedback API
export const patrolApi = {
  createPatrol: (data: Partial<PatrolVisit>) => apiClient.post('/patrol', data),
  getPatrols: (postId?: string, startDate?: string, endDate?: string) => 
    apiClient.get('/patrol', { params: { postId, startDate, endDate } }),
  getPatrolById: (id: string) => apiClient.get(`/patrol/${id}`),
  createPenalty: (data: Partial<Penalty>) => apiClient.post('/penalty', data),
  getPenalties: (status?: string) => apiClient.get('/penalty', { params: { status } }),
  generatePatrolPdf: (patrolId: string) => apiClient.get(`/patrol/${patrolId}/pdf`, { responseType: 'blob' }),
  linkPatrolToPenalty: (patrolId: string, penaltyId: string) => 
    apiClient.post(`/patrol/${patrolId}/penalties/${penaltyId}`, {}),
  getAvailableVehicles: (date: string, timeSlot: string) => 
    apiClient.get('/office-admin/fleet/available', { params: { date, timeSlot } }),
};

// Contacts API
export const contactsApi = {
  getContacts: (clientId?: string, postId?: string) => 
    apiClient.get('/contacts', { params: { clientId, postId } }),
  createContact: (data: Partial<Contact>) => apiClient.post('/contacts', data),
  updateContact: (id: string, data: Partial<Contact>) => apiClient.patch(`/contacts/${id}`, data),
  deleteContact: (id: string) => apiClient.delete(`/contacts/${id}`),
};

// Reports API
export const reportsApi = {
  getRotaCoverage: (startDate: string, endDate: string, postId?: string) => 
    apiClient.get('/reports/rota-coverage', { 
      params: { startDate, endDate, postId },
      responseType: 'blob'
    }),
  getAttendanceSummary: (startDate: string, endDate: string, postId?: string) => 
    apiClient.get('/reports/attendance-summary', { 
      params: { startDate, endDate, postId },
      responseType: 'blob'
    }),
  getPatrolReport: (startDate: string, endDate: string, postId?: string) => 
    apiClient.get('/reports/patrol', { 
      params: { startDate, endDate, postId },
      responseType: 'blob'
    }),
  getPenaltyReport: (startDate: string, endDate: string, status?: string) => 
    apiClient.get('/reports/penalty', { 
      params: { startDate, endDate, status },
      responseType: 'blob'
    }),
  getMessReport: (startDate: string, endDate: string, postId?: string) => 
    apiClient.get('/reports/mess', { 
      params: { startDate, endDate, postId },
      responseType: 'blob'
    }),
};

// Dashboard API
export const dashboardApi = {
  getDashboardWidgets: () => apiClient.get('/dashboard/widgets'),
  saveWidgetConfiguration: (id: string, config: Record<string, any>) => 
    apiClient.patch(`/dashboard/widgets/${id}`, { config }),
  getActivePosts: () => apiClient.get('/dashboard/active-posts'),
  getRotaGaps: (date: string) => apiClient.get(`/dashboard/rota-gaps?date=${date}`),
  getInventorySummary: () => apiClient.get('/dashboard/inventory-summary'),
  getMessSummary: () => apiClient.get('/dashboard/mess-summary'),
  getSalaryAdvances: () => apiClient.get('/dashboard/salary-advances'),
};

// Branch API
export const branchApi = {
  getBranches: () => apiClient.get('/branches'),
  getBranchById: (id: string) => apiClient.get(`/branches/${id}`),
};

// New Mess Management API
export const messApi = {
  // Meal consumption tracking
  getMeals: (params: { 
    postId?: string; 
    employeeId?: string; 
    startDate?: string; 
    endDate?: string; 
    mealType?: string;
  }) => apiClient.get('/mess/meals', { params }),
  
  createMeal: (data: Partial<MessMeal>) => apiClient.post('/mess/meals', data),
  updateMeal: (id: string, data: Partial<MessMeal>) => apiClient.patch(`/mess/meals/${id}`, data),
  deleteMeal: (id: string) => apiClient.delete(`/mess/meals/${id}`),
  
  // Mess charges
  getCharges: (params: { 
    employeeId?: string; 
    month?: string; 
    year?: string; 
    status?: string;
  }) => apiClient.get('/mess/charges', { params }),
  
  createCharge: (data: Partial<MessCharge>) => apiClient.post('/mess/charges', data),
  updateCharge: (id: string, data: Partial<MessCharge>) => apiClient.patch(`/mess/charges/${id}`, data),
  processCharge: (id: string) => apiClient.post(`/mess/charges/${id}/process`, {}),
  cancelCharge: (id: string) => apiClient.post(`/mess/charges/${id}/cancel`, {}),
  
  // Mess summary
  getMessSummary: (params: { 
    postId?: string; 
    startDate?: string; 
    endDate?: string;
  }) => apiClient.get('/mess/summary', { params }),
  
  // Mess by post
  getPostMessSummary: (postId: string, month?: string, year?: string) => 
    apiClient.get(`/mess/posts/${postId}/summary`, { params: { month, year } }),
  
  // Employee-specific mess data
  getEmployeeMessSummary: (employeeId: string, month?: string, year?: string) => 
    apiClient.get(`/mess/employees/${employeeId}/summary`, { params: { month, year } }),
};
