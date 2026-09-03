
export interface Vehicle {
  id: string;
  branchId: string;
  model: string;
  type: 'car' | 'suv' | 'van' | 'truck' | 'bus' | 'motorcycle' | 'other';
  registrationNumber: string;
  ownership: 'company-owned' | 'employee-owned';
  status: 'available' | 'in-use' | 'maintenance' | 'out-of-service';
  fuelType: 'petrol' | 'diesel' | 'cng' | 'electric' | 'hybrid';
  currentOdometer: number;
  ratePerKm: number; // ₹/km reimbursement rate for this vehicle
  purchaseDate: string;
  insuranceExpiryDate: string;
  pollutionCertExpiryDate: string;
  assignedDriver?: string;
  ownerName?: string; // Employee name if employee-owned
  ownerEmployeeId?: string; // Employee ID reference
  department?: 'operations' | 'sales' | 'marketing' | 'other'; // Department for employee-owned vehicles
  traccarDeviceId?: string; // Linked Traccar GPS device unique ID (e.g. "marketing-01")
  traccarDeviceName?: string; // Display name in Traccar
  dlNumber?: string; // Driving License number
  dlExpiryDate?: string; // DL expiry date
  lastMaintenanceDate?: string;
  nextMaintenanceDue?: string;
  maintenanceInterval: number; // in kilometers
  createdAt: string;
  updatedAt: string;
}

export interface TripLog {
  id: string;
  vehicleId: string;
  branchId: string;
  startDate: string;
  endDate?: string;
  startOdometer: number;
  endOdometer?: number;
  purpose: string;
  driver: string;
  authorizedBy: string;
  status: 'planned' | 'in-progress' | 'completed';
  startLocation: string;
  destination: string;
  actualRoute?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FuelLog {
  id: string;
  vehicleId: string;
  branchId: string;
  date: string;
  odometerReading: number;
  fuelAmount: number; // in liters
  fuelCost: number;
  fuelType: 'petrol' | 'diesel' | 'cng' | 'electric';
  filledBy: string;
  paymentMode: 'cash' | 'card' | 'account';
  receiptNumber?: string;
  billImageUrl?: string; // uploaded bill/receipt image URL
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

