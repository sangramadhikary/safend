'use client';

import { Vehicle, TripLog, FuelLog } from "@/types/fleet";
import { supabaseClient } from '@/integrations/supabase/client';
import { emitEvent, EVENT_TYPES } from "@/services/EventService";

// ─── Helper: Map DB row (snake_case) → Vehicle (camelCase) ──────────────────
function mapRowToVehicle(row: any): Vehicle {
  return {
    id: row.id,
    branchId: row.branch_id,
    model: row.model,
    type: row.type,
    registrationNumber: row.registration_number,
    ownership: row.ownership,
    status: row.status,
    fuelType: row.fuel_type,
    currentOdometer: Number(row.current_odometer),
    ratePerKm: Number(row.rate_per_km),
    purchaseDate: row.purchase_date || '',
    insuranceExpiryDate: row.insurance_expiry_date || '',
    pollutionCertExpiryDate: row.pollution_cert_expiry_date || '',
    assignedDriver: row.assigned_driver || undefined,
    ownerName: row.owner_name || undefined,
    ownerEmployeeId: row.owner_employee_id || undefined,
    department: row.department || undefined,
    traccarDeviceId: row.traccar_device_id || undefined,
    traccarDeviceName: row.traccar_device_name || undefined,
    dlNumber: row.dl_number || undefined,
    dlExpiryDate: row.dl_expiry_date || undefined,
    lastMaintenanceDate: row.last_maintenance_date || undefined,
    nextMaintenanceDue: row.next_maintenance_due || undefined,
    maintenanceInterval: Number(row.maintenance_interval),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Helper: Map Vehicle (camelCase) → DB row (snake_case) ──────────────────
function mapVehicleToRow(vehicle: Partial<Vehicle> & { branchId: string }) {
  const row: Record<string, any> = {};
  if (vehicle.branchId !== undefined) row.branch_id = vehicle.branchId;
  if (vehicle.model !== undefined) row.model = vehicle.model;
  if (vehicle.type !== undefined) row.type = vehicle.type;
  if (vehicle.registrationNumber !== undefined) row.registration_number = vehicle.registrationNumber;
  if (vehicle.ownership !== undefined) row.ownership = vehicle.ownership;
  if (vehicle.status !== undefined) row.status = vehicle.status;
  if (vehicle.fuelType !== undefined) row.fuel_type = vehicle.fuelType;
  if (vehicle.currentOdometer !== undefined) row.current_odometer = vehicle.currentOdometer;
  if (vehicle.ratePerKm !== undefined) row.rate_per_km = vehicle.ratePerKm;
  if (vehicle.purchaseDate !== undefined) row.purchase_date = vehicle.purchaseDate || null;
  if (vehicle.insuranceExpiryDate !== undefined) row.insurance_expiry_date = vehicle.insuranceExpiryDate || null;
  if (vehicle.pollutionCertExpiryDate !== undefined) row.pollution_cert_expiry_date = vehicle.pollutionCertExpiryDate || null;
  if (vehicle.assignedDriver !== undefined) row.assigned_driver = vehicle.assignedDriver || null;
  if (vehicle.ownerName !== undefined) row.owner_name = vehicle.ownerName || null;
  if (vehicle.ownerEmployeeId !== undefined) row.owner_employee_id = vehicle.ownerEmployeeId || null;
  if (vehicle.department !== undefined) row.department = vehicle.department || null;
  if (vehicle.traccarDeviceId !== undefined) row.traccar_device_id = vehicle.traccarDeviceId || null;
  if (vehicle.traccarDeviceName !== undefined) row.traccar_device_name = vehicle.traccarDeviceName || null;
  if (vehicle.dlNumber !== undefined) row.dl_number = vehicle.dlNumber || null;
  if (vehicle.dlExpiryDate !== undefined) row.dl_expiry_date = vehicle.dlExpiryDate || null;
  if (vehicle.lastMaintenanceDate !== undefined) row.last_maintenance_date = vehicle.lastMaintenanceDate || null;
  if (vehicle.nextMaintenanceDue !== undefined) row.next_maintenance_due = vehicle.nextMaintenanceDue || null;
  if (vehicle.maintenanceInterval !== undefined) row.maintenance_interval = vehicle.maintenanceInterval;
  return row;
}

// ─── Helper: Map DB row → TripLog ───────────────────────────────────────────
function mapRowToTripLog(row: any): TripLog {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    branchId: row.branch_id,
    startDate: row.start_date,
    endDate: row.end_date || undefined,
    startOdometer: Number(row.start_odometer),
    endOdometer: row.end_odometer ? Number(row.end_odometer) : undefined,
    purpose: row.purpose,
    driver: row.driver,
    authorizedBy: row.authorized_by,
    status: row.status,
    startLocation: row.start_location,
    destination: row.destination,
    actualRoute: row.actual_route || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Helper: Map DB row → FuelLog ───────────────────────────────────────────
function mapRowToFuelLog(row: any): FuelLog {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    branchId: row.branch_id,
    date: row.date,
    odometerReading: Number(row.odometer_reading),
    fuelAmount: Number(row.fuel_amount),
    fuelCost: Number(row.fuel_cost),
    fuelType: row.fuel_type,
    filledBy: row.filled_by,
    paymentMode: row.payment_mode,
    receiptNumber: row.receipt_number || undefined,
    billImageUrl: row.bill_image_url || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Vehicle Service Functions (async, Supabase-backed) ─────────────────────
export const getVehicles = async (branchId: string): Promise<Vehicle[]> => {
  const { data, error } = await supabaseClient
    .from('vehicles')
    .select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching vehicles:', error);
    return [];
  }
  return (data || []).map(mapRowToVehicle);
};

export const getAllVehicles = async (): Promise<Vehicle[]> => {
  const { data, error } = await supabaseClient
    .from('vehicles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching all vehicles:', error);
    return [];
  }
  return (data || []).map(mapRowToVehicle);
};

export const getVehicleById = async (vehicleId: string): Promise<Vehicle | undefined> => {
  const { data, error } = await supabaseClient
    .from('vehicles')
    .select('*')
    .eq('id', vehicleId)
    .single();

  if (error || !data) return undefined;
  return mapRowToVehicle(data);
};

export const createVehicle = async (
  vehicle: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Vehicle> => {
  const id = `VEH${Date.now().toString().slice(-6)}`;
  const now = new Date().toISOString();

  const row = {
    id,
    ...mapVehicleToRow(vehicle as any),
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabaseClient
    .from('vehicles')
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error('Error creating vehicle:', error);
    throw new Error(`Failed to create vehicle: ${error.message}`);
  }

  return mapRowToVehicle(data);
};

export const updateVehicle = async (vehicle: Vehicle): Promise<Vehicle> => {
  const now = new Date().toISOString();
  const row = {
    ...mapVehicleToRow(vehicle as any),
    updated_at: now,
  };

  const { data, error } = await supabaseClient
    .from('vehicles')
    .update(row)
    .eq('id', vehicle.id)
    .select()
    .single();

  if (error) {
    console.error('Error updating vehicle:', error);
    throw new Error(`Failed to update vehicle: ${error.message}`);
  }

  return mapRowToVehicle(data);
};

export const deleteVehicle = async (vehicleId: string): Promise<boolean> => {
  const { error } = await supabaseClient
    .from('vehicles')
    .delete()
    .eq('id', vehicleId);

  if (error) {
    console.error('Error deleting vehicle:', error);
    throw new Error(`Failed to delete vehicle: ${error.message}`);
  }
  return true;
};

export const getEmployeeOwnedVehicles = async (): Promise<Vehicle[]> => {
  const { data, error } = await supabaseClient
    .from('vehicles')
    .select('*')
    .eq('ownership', 'employee-owned');

  if (error) return [];
  return (data || []).map(mapRowToVehicle);
};

export const getCompanyOwnedVehicles = async (branchId?: string): Promise<Vehicle[]> => {
  let query = supabaseClient
    .from('vehicles')
    .select('*')
    .eq('ownership', 'company-owned');

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data || []).map(mapRowToVehicle);
};

// ─── Trip Log Service Functions ─────────────────────────────────────────────
export const getTripLogs = async (branchId: string, vehicleId?: string): Promise<TripLog[]> => {
  let query = supabaseClient
    .from('trip_logs')
    .select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });

  if (vehicleId) {
    query = query.eq('vehicle_id', vehicleId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching trip logs:', error);
    return [];
  }
  return (data || []).map(mapRowToTripLog);
};

export const createTripLog = async (
  tripLog: Omit<TripLog, 'id' | 'createdAt' | 'updatedAt'>
): Promise<TripLog> => {
  const id = `TRP${Date.now().toString().slice(-6)}`;
  const now = new Date().toISOString();

  const row = {
    id,
    vehicle_id: tripLog.vehicleId,
    branch_id: tripLog.branchId,
    start_date: tripLog.startDate,
    end_date: tripLog.endDate || null,
    start_odometer: tripLog.startOdometer,
    end_odometer: tripLog.endOdometer || null,
    purpose: tripLog.purpose,
    driver: tripLog.driver,
    authorized_by: tripLog.authorizedBy,
    status: tripLog.status,
    start_location: tripLog.startLocation,
    destination: tripLog.destination,
    actual_route: tripLog.actualRoute || null,
    notes: tripLog.notes || null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabaseClient
    .from('trip_logs')
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create trip log: ${error.message}`);
  }

  const result = mapRowToTripLog(data);

  emitEvent(EVENT_TYPES.FLEET_TRIP_LOGGED, {
    tripId: result.id,
    vehicleId: result.vehicleId,
    purpose: result.purpose,
  });

  return result;
};

export const updateTripLog = async (tripLog: TripLog): Promise<TripLog> => {
  const now = new Date().toISOString();

  const row = {
    vehicle_id: tripLog.vehicleId,
    branch_id: tripLog.branchId,
    start_date: tripLog.startDate,
    end_date: tripLog.endDate || null,
    start_odometer: tripLog.startOdometer,
    end_odometer: tripLog.endOdometer || null,
    purpose: tripLog.purpose,
    driver: tripLog.driver,
    authorized_by: tripLog.authorizedBy,
    status: tripLog.status,
    start_location: tripLog.startLocation,
    destination: tripLog.destination,
    actual_route: tripLog.actualRoute || null,
    notes: tripLog.notes || null,
    updated_at: now,
  };

  const { data, error } = await supabaseClient
    .from('trip_logs')
    .update(row)
    .eq('id', tripLog.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update trip log: ${error.message}`);
  }

  const result = mapRowToTripLog(data);

  // If trip is completed, update vehicle odometer
  if (result.status === 'completed' && result.endOdometer) {
    const { data: vehicleData } = await supabaseClient
      .from('vehicles')
      .update({ current_odometer: result.endOdometer, updated_at: now })
      .eq('id', result.vehicleId)
      .select()
      .single();

    if (vehicleData) {
      const vehicle = mapRowToVehicle(vehicleData);
      const nextMaintenanceDue = vehicle.nextMaintenanceDue ? new Date(vehicle.nextMaintenanceDue) : null;
      if (nextMaintenanceDue && new Date() >= nextMaintenanceDue) {
        emitEvent(EVENT_TYPES.FLEET_MAINTENANCE_DUE, {
          vehicleId: vehicle.id,
          vehicle: vehicle.model,
          registrationNumber: vehicle.registrationNumber,
        });
      }
    }
  }

  return result;
};

// ─── Fuel Log Service Functions ─────────────────────────────────────────────
export const getFuelLogs = async (branchId: string, vehicleId?: string): Promise<FuelLog[]> => {
  let query = supabaseClient
    .from('fuel_logs')
    .select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });

  if (vehicleId) {
    query = query.eq('vehicle_id', vehicleId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching fuel logs:', error);
    return [];
  }
  return (data || []).map(mapRowToFuelLog);
};

export const createFuelLog = async (
  fuelLog: Omit<FuelLog, 'id' | 'createdAt' | 'updatedAt'>
): Promise<FuelLog> => {
  const id = `FUEL${Date.now().toString().slice(-6)}`;
  const now = new Date().toISOString();

  const row = {
    id,
    vehicle_id: fuelLog.vehicleId,
    branch_id: fuelLog.branchId,
    date: fuelLog.date,
    odometer_reading: fuelLog.odometerReading,
    fuel_amount: fuelLog.fuelAmount,
    fuel_cost: fuelLog.fuelCost,
    fuel_type: fuelLog.fuelType,
    filled_by: fuelLog.filledBy,
    payment_mode: fuelLog.paymentMode,
    receipt_number: fuelLog.receiptNumber || null,
    bill_image_url: fuelLog.billImageUrl || null,
    notes: fuelLog.notes || null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabaseClient
    .from('fuel_logs')
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create fuel log: ${error.message}`);
  }

  return mapRowToFuelLog(data);
};

export const updateFuelLog = async (fuelLog: FuelLog): Promise<FuelLog> => {
  const now = new Date().toISOString();

  const row = {
    vehicle_id: fuelLog.vehicleId,
    branch_id: fuelLog.branchId,
    date: fuelLog.date,
    odometer_reading: fuelLog.odometerReading,
    fuel_amount: fuelLog.fuelAmount,
    fuel_cost: fuelLog.fuelCost,
    fuel_type: fuelLog.fuelType,
    filled_by: fuelLog.filledBy,
    payment_mode: fuelLog.paymentMode,
    receipt_number: fuelLog.receiptNumber || null,
    bill_image_url: fuelLog.billImageUrl || null,
    notes: fuelLog.notes || null,
    updated_at: now,
  };

  const { data, error } = await supabaseClient
    .from('fuel_logs')
    .update(row)
    .eq('id', fuelLog.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update fuel log: ${error.message}`);
  }

  return mapRowToFuelLog(data);
};

// ─── Maintenance Helpers ────────────────────────────────────────────────────
export const checkMaintenanceDue = async (vehicleId: string): Promise<boolean> => {
  const vehicle = await getVehicleById(vehicleId);
  if (!vehicle) throw new Error(`Vehicle with ID ${vehicleId} not found`);
  if (!vehicle.nextMaintenanceDue) return false;
  return new Date() >= new Date(vehicle.nextMaintenanceDue);
};

export const scheduleMaintenance = async (
  vehicleId: string,
  maintenanceDate: string,
  details: string
): Promise<void> => {
  const now = new Date().toISOString();

  const { error } = await supabaseClient
    .from('vehicles')
    .update({ status: 'maintenance', updated_at: now })
    .eq('id', vehicleId);

  if (error) {
    throw new Error(`Failed to schedule maintenance: ${error.message}`);
  }
};
