'use client';

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Plus, Pencil, Fuel, Car, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getVehicles, getEmployeeOwnedVehicles } from "@/services/fleet/FleetService";
import { Vehicle } from "@/types/fleet";
import { LoadingAnimation } from "@/components/ui/loading-animation";

interface PetrolLogEntry {
  id: string;
  log_date: string;
  vehicle_number: string;
  vehicle_type: string;
  driver_name: string;
  opening_km: number;
  closing_km: number;
  km_travelled: number;
  fuel_litres: number;
  fuel_cost: number;
  reimbursement: number;
  fuel_station: string;
  receipt_number: string;
  purpose: string;
  created_at: string;
}

interface TripLogsListProps {
  branchId: string;
  searchQuery: string;
}

export function TripLogsList({ branchId, searchQuery }: TripLogsListProps) {
  const [petrolLogs, setPetrolLogs] = useState<PetrolLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingLog, setEditingLog] = useState<PetrolLogEntry | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchPetrolLogs();
    loadVehicles();
  }, [branchId]);

  const loadVehicles = async () => {
    try {
      const empVehicles = await getEmployeeOwnedVehicles();
      const branchVehicles = await getVehicles(branchId);
      // Combine and deduplicate
      const allVehicles = [...branchVehicles];
      empVehicles.forEach(v => {
        if (!allVehicles.find(bv => bv.id === v.id)) {
          allVehicles.push(v);
        }
      });
      setVehicles(allVehicles);
    } catch (err) {
      console.error("Error loading vehicles:", err);
    }
  };

  const fetchPetrolLogs = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('petrol_logs')
        .select('*')
        .order('log_date', { ascending: false });

      if (error) throw error;
      setPetrolLogs(data || []);
    } catch (err) {
      console.error('Error fetching petrol logs:', err);
      setPetrolLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter logs
  const filteredLogs = petrolLogs.filter(log => {
    const matchesSearch = !searchQuery ||
      log.vehicle_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.driver_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.purpose?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesVehicle = selectedVehicleFilter === "all" ||
      log.vehicle_number?.toUpperCase() === selectedVehicleFilter.toUpperCase();

    return matchesSearch && matchesVehicle;
  });

  // Stats
  const totalKm = filteredLogs.reduce((sum, l) => sum + (l.km_travelled || 0), 0);
  const totalFuelCost = filteredLogs.reduce((sum, l) => sum + (l.fuel_cost || 0), 0);
  const totalReimbursement = filteredLogs.reduce((sum, l) => sum + (l.reimbursement || 0), 0);

  // Get unique vehicle numbers from logs
  const uniqueVehicleNumbers = [...new Set(petrolLogs.map(l => l.vehicle_number?.toUpperCase()).filter(Boolean))];

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <LoadingAnimation size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs text-muted-foreground">Total KM</p>
                <p className="text-lg font-bold">{totalKm.toLocaleString('en-IN')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <Fuel className="h-4 w-4 text-amber-600" />
              <div>
                <p className="text-xs text-muted-foreground">Fuel Cost</p>
                <p className="text-lg font-bold">₹{totalFuelCost.toLocaleString('en-IN')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full bg-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Reimbursement</p>
                <p className="text-lg font-bold text-green-700">₹{totalReimbursement.toLocaleString('en-IN')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Actions */}
      <div className="flex flex-col md:flex-row justify-between gap-3">
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedVehicleFilter} onValueChange={setSelectedVehicleFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filter by vehicle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vehicles</SelectItem>
              {uniqueVehicleNumbers.map(vn => (
                <SelectItem key={vn} value={vn}>{vn}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filteredLogs.length} entries</span>
        </div>
        <Button size="sm" onClick={() => { setEditingLog(null); setShowAddForm(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          Add Entry
        </Button>
      </div>

      {/* Table */}
      {filteredLogs.length === 0 ? (
        <Alert className="bg-blue-50 border-blue-100 text-blue-800">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No petrol/trip log entries found. Entries are created by Operations team via the Petrol module.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Opening KM</TableHead>
                  <TableHead>Closing KM</TableHead>
                  <TableHead>KM Run</TableHead>
                  <TableHead>Fuel (L)</TableHead>
                  <TableHead>Cost (₹)</TableHead>
                  <TableHead>Reimbursement</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">{log.log_date}</TableCell>
                    <TableCell className="font-mono text-xs">{log.vehicle_number}</TableCell>
                    <TableCell>{log.driver_name || '—'}</TableCell>
                    <TableCell>{log.opening_km?.toLocaleString('en-IN')}</TableCell>
                    <TableCell>{log.closing_km?.toLocaleString('en-IN')}</TableCell>
                    <TableCell className="font-medium">{log.km_travelled?.toLocaleString('en-IN')}</TableCell>
                    <TableCell>{log.fuel_litres || '—'}</TableCell>
                    <TableCell>₹{log.fuel_cost?.toLocaleString('en-IN')}</TableCell>
                    <TableCell className="font-medium text-green-700">₹{(log.reimbursement || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell>{log.purpose || '—'}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => { setEditingLog(log); setShowAddForm(true); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Add/Edit Form Dialog */}
      {showAddForm && (
        <PetrolLogFormDialog
          open={showAddForm}
          onClose={() => { setShowAddForm(false); setEditingLog(null); }}
          onSuccess={() => { setShowAddForm(false); setEditingLog(null); fetchPetrolLogs(); }}
          editLog={editingLog}
          vehicles={vehicles}
        />
      )}
    </div>
  );
}

// Add/Edit Petrol Log Form
function PetrolLogFormDialog({
  open,
  onClose,
  onSuccess,
  editLog,
  vehicles,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editLog: PetrolLogEntry | null;
  vehicles: Vehicle[];
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const isEditMode = !!editLog;

  const [form, setForm] = useState({
    log_date: editLog?.log_date || new Date().toISOString().split('T')[0],
    vehicle_number: editLog?.vehicle_number || '',
    vehicle_type: editLog?.vehicle_type || 'car',
    driver_name: editLog?.driver_name || '',
    opening_km: editLog?.opening_km?.toString() || '',
    closing_km: editLog?.closing_km?.toString() || '',
    fuel_litres: editLog?.fuel_litres?.toString() || '',
    fuel_cost: editLog?.fuel_cost?.toString() || '',
    fuel_station: editLog?.fuel_station || '',
    receipt_number: editLog?.receipt_number || '',
    purpose: editLog?.purpose || 'Patrol Duty',
  });

  const kmTravelled = (Number(form.closing_km) || 0) - (Number(form.opening_km) || 0);

  // Find matching vehicle to get rate
  const matchedVehicle = vehicles.find(v =>
    v.registrationNumber.replace(/\s/g, '').toUpperCase() === form.vehicle_number.replace(/\s/g, '').toUpperCase()
  );
  const ratePerKm = matchedVehicle?.ratePerKm || 0;
  const reimbursement = kmTravelled > 0 && ratePerKm > 0 ? kmTravelled * ratePerKm : 0;

  const handleVehicleSelect = (regNumber: string) => {
    const vehicle = vehicles.find(v => v.registrationNumber === regNumber);
    if (vehicle) {
      setForm(f => ({
        ...f,
        vehicle_number: vehicle.registrationNumber,
        vehicle_type: vehicle.type,
        opening_km: String(vehicle.currentOdometer),
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicle_number) {
      toast({ title: "Required", description: "Vehicle number is required.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        log_date: form.log_date,
        vehicle_number: form.vehicle_number.toUpperCase(),
        vehicle_type: form.vehicle_type,
        driver_name: form.driver_name,
        opening_km: Number(form.opening_km) || 0,
        closing_km: Number(form.closing_km) || 0,
        km_travelled: kmTravelled > 0 ? kmTravelled : 0,
        fuel_litres: Number(form.fuel_litres) || 0,
        fuel_cost: Number(form.fuel_cost) || 0,
        reimbursement: reimbursement,
        fuel_station: form.fuel_station,
        receipt_number: form.receipt_number,
        purpose: form.purpose,
      };

      if (isEditMode && editLog) {
        const { error } = await supabase
          .from('petrol_logs')
          .update(payload)
          .eq('id', editLog.id);
        if (error) throw error;
        toast({ title: "Updated", description: "Petrol log entry updated successfully." });
      } else {
        const { error } = await supabase.from('petrol_logs').insert(payload);
        if (error) throw error;
        toast({ title: "Added", description: "Petrol log entry added successfully." });
      }

      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to save entry.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Petrol Log Entry' : 'Add Petrol Log Entry'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date*</Label>
              <Input type="date" value={form.log_date} onChange={e => setForm(f => ({ ...f, log_date: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Select Vehicle</Label>
              <Select onValueChange={handleVehicleSelect} value={form.vehicle_number || undefined}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose vehicle..." />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => (
                    <SelectItem key={v.id} value={v.registrationNumber}>
                      {v.registrationNumber} — {v.model} {v.ownership === 'employee-owned' ? `(₹${v.ratePerKm}/km)` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vehicle Number*</Label>
              <Input
                value={form.vehicle_number}
                onChange={e => setForm(f => ({ ...f, vehicle_number: e.target.value }))}
                placeholder="e.g. DL01AB1234"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Driver Name</Label>
              <Input value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} placeholder="e.g. Rajesh Kumar" />
            </div>
          </div>

          {matchedVehicle && (
            <div className="p-2 bg-blue-50 rounded border border-blue-200 text-sm text-blue-800">
              {matchedVehicle.model} · {matchedVehicle.ownership === 'employee-owned' ? `Employee: ${matchedVehicle.ownerName}` : 'Company'} · Rate: ₹{matchedVehicle.ratePerKm}/km
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Opening KM</Label>
              <Input type="number" value={form.opening_km} onChange={e => setForm(f => ({ ...f, opening_km: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Closing KM</Label>
              <Input type="number" value={form.closing_km} onChange={e => setForm(f => ({ ...f, closing_km: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>KM Travelled</Label>
              <Input value={kmTravelled > 0 ? kmTravelled : '—'} readOnly className="bg-muted" />
            </div>
          </div>

          {reimbursement > 0 && (
            <div className="p-2 bg-green-50 rounded border border-green-200 text-sm font-medium text-green-800">
              Reimbursement: ₹{reimbursement.toLocaleString('en-IN')} ({kmTravelled} km × ₹{ratePerKm}/km)
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fuel Filled (Litres)</Label>
              <Input type="number" step="0.1" value={form.fuel_litres} onChange={e => setForm(f => ({ ...f, fuel_litres: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Fuel Cost (₹)</Label>
              <Input type="number" value={form.fuel_cost} onChange={e => setForm(f => ({ ...f, fuel_cost: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fuel Station</Label>
              <Input value={form.fuel_station} onChange={e => setForm(f => ({ ...f, fuel_station: e.target.value }))} placeholder="e.g. Indian Oil" />
            </div>
            <div className="space-y-2">
              <Label>Receipt Number</Label>
              <Input value={form.receipt_number} onChange={e => setForm(f => ({ ...f, receipt_number: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Purpose</Label>
            <Select value={form.purpose} onValueChange={v => setForm(f => ({ ...f, purpose: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Patrol Duty">Patrol Duty</SelectItem>
                <SelectItem value="Site Visit">Site Visit</SelectItem>
                <SelectItem value="Client Meeting">Client Meeting</SelectItem>
                <SelectItem value="Office Work">Office Work</SelectItem>
                <SelectItem value="Emergency">Emergency</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : isEditMode ? 'Update Entry' : 'Add Entry'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
