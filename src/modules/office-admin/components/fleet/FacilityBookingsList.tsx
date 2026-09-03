'use client';

import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building, Plus, Pencil, Trash2, MapPin, Users, IndianRupee, Upload, X, Camera, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { MapPinPicker } from "@/components/ui/map-pin-picker";
import { uploadDocument } from "@/lib/r2-storage";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RentedProperty {
  id: string;
  name: string;
  type: 'office' | 'warehouse' | 'residential' | 'shop' | 'godown' | 'other';
  location: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  floorNumber: string;
  latitude?: number;
  longitude?: number;
  numberOfRooms: number;
  totalHeadCapacity: number;
  areaSquareFt: number;
  monthlyRent: number;
  securityDeposit: number;
  leaseStartDate: string;
  leaseEndDate: string;
  landlordName: string;
  landlordPhone: string;
  electricBillAccount?: string;
  waterBillAccount?: string;
  otherBills?: string;
  status: 'active' | 'expiring-soon' | 'expired';
  notes?: string;
  agreementUrl?: string;
  agreementDate?: string;
  agreementType?: string;
  rooms?: PropertyRoom[];
  /** FK to vendors.id — must be a property_owner category vendor */
  vendorId?: string;
  /** Day of month (1-28) rent is due; used to auto-create the recurring bill */
  rentPaymentDay?: number;
  // ── Utility meters ────────────────────────────────────────────────────────
  /** Last recorded electric meter reading (kWh) — baseline for next payment */
  electricMeterReading?: number;
  /** Rate per kWh in ₹ (incl. all surcharges) */
  electricRatePerUnit?: number;
  /** Last recorded water meter reading (KL) */
  waterMeterReading?: number;
  /** Rate per KL in ₹ */
  waterRatePerUnit?: number;
  /** Last recorded piped-gas meter reading (SCM) */
  gasMeterReading?: number;
  /** Rate per SCM in ₹ */
  gasRatePerUnit?: number;
}

interface PropertyRoom {
  id: string;
  name: string;
  type: 'bedroom' | 'office-cabin' | 'meeting-room' | 'storage' | 'kitchen' | 'bathroom' | 'hall' | 'other';
  capacity: number;
  areaSqft: number;
  amenities: string[];
  photos: string[];
  notes: string;
}

interface FacilityBookingsListProps {
  branchId: string;
  searchQuery: string;
}

import { supabaseClient } from '@/integrations/supabase/client';
import { useVendorStore } from '../vendors/vendorStore';
import { useBillStore } from '../bills/billStore';
import { format, setDate, isBefore, startOfDay, addMonths } from 'date-fns';

// ─── DB mapping helpers ──────────────────────────────────────
function mapRowToProperty(row: any): RentedProperty {
  return {
    id: row.id, name: row.name, type: row.type, location: row.location,
    address: row.address || '', city: row.city || '', state: row.state || '',
    pincode: row.pincode || '', floorNumber: row.floor_number || '',
    latitude: row.latitude ? Number(row.latitude) : undefined,
    longitude: row.longitude ? Number(row.longitude) : undefined,
    numberOfRooms: row.number_of_rooms, totalHeadCapacity: row.total_head_capacity,
    areaSquareFt: Number(row.area_square_ft), monthlyRent: Number(row.monthly_rent),
    securityDeposit: Number(row.security_deposit),
    leaseStartDate: row.lease_start_date || '', leaseEndDate: row.lease_end_date || '',
    landlordName: row.landlord_name || '', landlordPhone: row.landlord_phone || '',
    electricBillAccount: row.electric_bill_account || undefined,
    waterBillAccount: row.water_bill_account || undefined,
    otherBills: row.other_bills || undefined, status: row.status,
    notes: row.notes || undefined, agreementUrl: row.agreement_url || undefined,
    agreementDate: row.agreement_date || undefined, agreementType: row.agreement_type || undefined,
    rooms: row.rooms || [],
    vendorId: row.vendor_id || undefined,
    rentPaymentDay: row.rent_payment_day ? Number(row.rent_payment_day) : undefined,
    electricMeterReading: row.electric_meter_reading != null ? Number(row.electric_meter_reading) : undefined,
    electricRatePerUnit: row.electric_rate_per_unit != null ? Number(row.electric_rate_per_unit) : undefined,
    waterMeterReading: row.water_meter_reading != null ? Number(row.water_meter_reading) : undefined,
    waterRatePerUnit: row.water_rate_per_unit != null ? Number(row.water_rate_per_unit) : undefined,
    gasMeterReading: row.gas_meter_reading != null ? Number(row.gas_meter_reading) : undefined,
    gasRatePerUnit: row.gas_rate_per_unit != null ? Number(row.gas_rate_per_unit) : undefined,
  };
}

function mapPropertyToRow(prop: RentedProperty, branchId: string) {
  return {
    id: prop.id, branch_id: branchId, name: prop.name, type: prop.type,
    location: prop.location, address: prop.address || null, city: prop.city || null,
    state: prop.state || null, pincode: prop.pincode || null,
    floor_number: prop.floorNumber || null, latitude: prop.latitude ?? null,
    longitude: prop.longitude ?? null, number_of_rooms: prop.numberOfRooms,
    total_head_capacity: prop.totalHeadCapacity, area_square_ft: prop.areaSquareFt,
    monthly_rent: prop.monthlyRent, security_deposit: prop.securityDeposit,
    lease_start_date: prop.leaseStartDate || null, lease_end_date: prop.leaseEndDate || null,
    landlord_name: prop.landlordName || null, landlord_phone: prop.landlordPhone || null,
    electric_bill_account: prop.electricBillAccount || null,
    water_bill_account: prop.waterBillAccount || null, other_bills: prop.otherBills || null,
    status: prop.status, notes: prop.notes || null,
    agreement_url: prop.agreementUrl || null, agreement_date: prop.agreementDate || null,
    agreement_type: prop.agreementType || null, rooms: prop.rooms || [],
    vendor_id: prop.vendorId || null,
    rent_payment_day: prop.rentPaymentDay ?? null,
    electric_meter_reading: prop.electricMeterReading ?? null,
    electric_rate_per_unit: prop.electricRatePerUnit ?? null,
    water_meter_reading: prop.waterMeterReading ?? null,
    water_rate_per_unit: prop.waterRatePerUnit ?? null,
    gas_meter_reading: prop.gasMeterReading ?? null,
    gas_rate_per_unit: prop.gasRatePerUnit ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function FacilityBookingsList({ branchId, searchQuery }: FacilityBookingsListProps) {
  const [properties, setProperties] = useState<RentedProperty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProperty, setEditingProperty] = useState<RentedProperty | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RentedProperty | null>(null);
  const { toast } = useToast();

  // Vendor store — provides property_owner vendor list for the form
  const { vendors, fetchVendors } = useVendorStore();
  const propertyOwnerVendors = vendors.filter(v => v.category === 'property_owner' && v.status === 'active');

  // Bill store — for auto-creating and looking up rent bills
  const { bills, addBill, fetchBills } = useBillStore();

  useEffect(() => {
    if (branchId) fetchVendors(branchId);
  }, [branchId, fetchVendors]);

  useEffect(() => {
    if (branchId) fetchBills(branchId);
  }, [branchId, fetchBills]);

  const fetchProperties = async () => {
    if (!branchId) return;
    try {
      setIsLoading(true);
      const { data, error } = await supabaseClient.from('rented_properties').select('*').eq('branch_id', branchId).order('created_at', { ascending: false });
      if (error) throw error;
      setProperties((data || []).map(mapRowToProperty));
    } catch (err) {
      console.error('Error fetching properties:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchProperties(); }, [branchId]);

  const filteredProperties = properties.filter(p =>
    !searchQuery ||
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.landlordName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalRent = properties.reduce((sum, p) => sum + p.monthlyRent, 0);

  const handleAdd = () => { setEditingProperty(null); setShowForm(true); };
  const handleEdit = (prop: RentedProperty) => { setEditingProperty(prop); setShowForm(true); };

  const handleDelete = async () => {
    if (deleteTarget) {
      try {
        const { error } = await supabaseClient.from('rented_properties').delete().eq('id', deleteTarget.id);
        if (error) throw error;
        setProperties(prev => prev.filter(p => p.id !== deleteTarget.id));
        toast({ title: "Removed", description: `${deleteTarget.name} has been removed.` });
      } catch (err) {
        toast({ title: "Error", description: "Failed to remove property.", variant: "destructive" });
      }
      setDeleteTarget(null);
    }
  };

  const handleFormSuccess = async (property: RentedProperty) => {
    try {
      const row = mapPropertyToRow(property, branchId);
      if (editingProperty) {
        const { error } = await supabaseClient.from('rented_properties').update(row).eq('id', property.id);
        if (error) throw error;
        setProperties(prev => prev.map(p => p.id === property.id ? property : p));
      } else {
        const { error } = await supabaseClient.from('rented_properties').insert({ ...row, created_at: new Date().toISOString() });
        if (error) throw error;
        setProperties(prev => [property, ...prev]);
      }

      // ── Auto-create / refresh the recurring rent bill ────────────────
      // Conditions: property has a vendor linked AND a rent payment day set.
      // On first save, create the bill. On edit, update it if the amount or
      // vendor changed. The bill is keyed by a stable notes marker so we
      // don't create duplicates on every edit.
      if (property.vendorId && property.rentPaymentDay && property.monthlyRent > 0) {
        const vendor = vendors.find(v => v.id === property.vendorId);
        const vendorName = vendor?.name || property.landlordName || 'Landlord';

        // Build the next due date: same day-of-month as rentPaymentDay, in the
        // current or next month (whichever is still in the future).
        const today = startOfDay(new Date());
        const thisMonthDue = setDate(today, property.rentPaymentDay);
        const nextDue = isBefore(thisMonthDue, today)
          ? format(addMonths(thisMonthDue, 1), 'yyyy-MM-dd')
          : format(thisMonthDue, 'yyyy-MM-dd');

        const billName = `Rent — ${property.name}`;
        const markerNote = `[property_id:${property.id}]`;

        // Look for an existing bill for this property (match by notes marker).
        const existingBill = bills.find(b =>
          b.category === 'rent' &&
          b.notes?.includes(markerNote)
        );

        if (!existingBill) {
          await addBill({
            name: billName,
            description: `Monthly house rent for ${property.name} at ${property.location}.`,
            category: 'rent',
            vendor_id: property.vendorId,
            vendor_name: vendorName,
            frequency: 'monthly',
            amount: property.monthlyRent,
            tax_percentage: 0,  // rent is typically not subject to GST for residential; adjust if needed
            total_amount: property.monthlyRent,
            currency: 'INR',
            billing_day: property.rentPaymentDay,
            start_date: property.leaseStartDate || format(today, 'yyyy-MM-dd'),
            end_date: property.leaseEndDate || undefined,
            next_due_date: nextDue,
            payment_method: undefined,
            account_head: 'House Rent',
            status: 'active',
            auto_remind: true,
            remind_days_before: 7,
            notes: `Auto-created from Rented Properties. ${markerNote}`,
            branch_id: branchId,
            created_by: 'system',
          });
          toast({
            title: 'Recurring bill created',
            description: `Monthly rent bill of ₹${property.monthlyRent.toLocaleString('en-IN')} created in Recurring Bills for ${property.name}.`,
          });
        } else {
          // Update if amount or vendor changed
          const needsUpdate =
            existingBill.amount !== property.monthlyRent ||
            existingBill.vendor_id !== property.vendorId ||
            existingBill.billing_day !== property.rentPaymentDay;
          if (needsUpdate) {
            const { updateBill } = useBillStore.getState();
            await updateBill(existingBill.id, {
              amount: property.monthlyRent,
              total_amount: property.monthlyRent,
              vendor_id: property.vendorId,
              vendor_name: vendorName,
              billing_day: property.rentPaymentDay,
              next_due_date: nextDue,
            });
            toast({ title: 'Rent bill updated', description: `Recurring bill for ${property.name} has been updated.` });
          }
        }
        // Refresh the bill store so the card badge reflects the new state
        await fetchBills(branchId);
      }

      setShowForm(false);
      setEditingProperty(null);
    } catch (err) {
      console.error('Error saving property:', err);
      toast({ title: "Error", description: "Failed to save property.", variant: "destructive" });
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      office: "bg-blue-100 text-blue-800",
      warehouse: "bg-amber-100 text-amber-800",
      residential: "bg-green-100 text-green-800",
      shop: "bg-purple-100 text-purple-800",
      godown: "bg-orange-100 text-orange-800",
      other: "bg-gray-100 text-gray-800",
    };
    return <Badge className={colors[type] || colors.other}>{type}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    if (status === 'active') return <Badge className="bg-green-500">Active</Badge>;
    if (status === 'expiring-soon') return <Badge className="bg-amber-500">Expiring Soon</Badge>;
    return <Badge variant="outline" className="text-red-700 border-red-300">Expired</Badge>;
  };

  if (isLoading) {
    return <div className="flex justify-center p-8"><LoadingAnimation size="md" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{properties.length}</span> properties
          </div>
          <div className="text-sm text-muted-foreground">
            Total Rent: <span className="font-medium text-foreground">₹{totalRent.toLocaleString('en-IN')}/month</span>
          </div>
        </div>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add Property
        </Button>
      </div>

      {filteredProperties.length === 0 ? (
        <Alert className="bg-blue-50 border-blue-100 text-blue-800">
          <Building className="h-4 w-4" />
          <AlertDescription>No rented properties found. Click "Add Property" to add one.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4">
          {filteredProperties.map((prop) => (
            <Card key={prop.id} className="p-4">
              <div className="flex flex-col md:flex-row justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Building className="h-4 w-4 text-gray-600" />
                    <h4 className="font-medium text-base">{prop.name}</h4>
                    {getTypeBadge(prop.type)}
                    {getStatusBadge(prop.status)}
                    {prop.floorNumber && <Badge variant="outline" className="text-xs">Floor: {prop.floorNumber}</Badge>}
                    {prop.agreementUrl && <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Agreement ✓</Badge>}
                    {prop.latitude && prop.longitude && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                        <MapPin className="h-2.5 w-2.5 mr-0.5" /> Pinned
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {prop.location}
                    </span>
                    {(prop.city || prop.state || prop.pincode) && (
                      <span className="text-muted-foreground">
                        {[prop.city, prop.state, prop.pincode].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs mt-2">
                    <div>
                      <span className="block text-muted-foreground">Rooms</span>
                      <span className="font-medium text-foreground">{prop.rooms?.length || prop.numberOfRooms}</span>
                    </div>
                    <div>
                      <span className="block text-muted-foreground">Capacity</span>
                      <span className="font-medium text-foreground">{prop.totalHeadCapacity} heads</span>
                    </div>
                    <div>
                      <span className="block text-muted-foreground">Area</span>
                      <span className="font-medium text-foreground">{prop.areaSquareFt.toLocaleString('en-IN')} sq.ft</span>
                    </div>
                    <div>
                      <span className="block text-muted-foreground">Monthly Rent</span>
                      <span className="font-medium text-green-700">₹{prop.monthlyRent.toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="block text-muted-foreground">Deposit</span>
                      <span className="font-medium text-foreground">₹{(prop.securityDeposit || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="block text-muted-foreground">Lease</span>
                      <span className="font-medium text-foreground">
                        {prop.leaseStartDate && prop.leaseEndDate
                          ? `${prop.leaseStartDate} → ${prop.leaseEndDate}`
                          : prop.leaseStartDate || prop.leaseEndDate || '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                    {prop.landlordName && <span>Landlord: {prop.landlordName}{prop.landlordPhone ? ` (${prop.landlordPhone})` : ''}</span>}
                    {prop.vendorId && (
                      <span className="text-blue-700 font-medium">
                        Vendor: {vendors.find(v => v.id === prop.vendorId)?.name ?? prop.landlordName}
                      </span>
                    )}
                    {prop.rentPaymentDay && (
                      <span className="text-emerald-700 font-medium">Rent due: {prop.rentPaymentDay}{
                        prop.rentPaymentDay === 1 ? 'st' :
                        prop.rentPaymentDay === 2 ? 'nd' :
                        prop.rentPaymentDay === 3 ? 'rd' : 'th'
                      } of month</span>
                    )}
                    {prop.electricBillAccount && <span>Electric: {prop.electricBillAccount}</span>}
                    {prop.waterBillAccount && <span>Water: {prop.waterBillAccount}</span>}
                    {prop.otherBills && <span>Other: {prop.otherBills}</span>}
                    {prop.rooms && prop.rooms.length > 0 && (
                      <span>Amenities: {[...new Set(prop.rooms.flatMap(r => r.amenities))].slice(0, 5).join(', ')}{[...new Set(prop.rooms.flatMap(r => r.amenities))].length > 5 ? '...' : ''}</span>
                    )}
                  </div>
                  {/* Rent bill status badge */}
                  {(() => {
                    const marker = `[property_id:${prop.id}]`;
                    const rentBill = bills.find(b => b.category === 'rent' && b.notes?.includes(marker));
                    if (rentBill) {
                      return (
                        <div className="mt-1">
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                            ✓ Recurring rent bill active — ₹{rentBill.amount.toLocaleString('en-IN')}/mo · due {rentBill.next_due_date}
                          </Badge>
                        </div>
                      );
                    }
                    if (prop.vendorId && prop.rentPaymentDay && prop.monthlyRent > 0) {
                      return (
                        <div className="mt-1">
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                            No recurring bill yet — save the property to auto-create one
                          </Badge>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="flex md:flex-col gap-2 items-start">
                  <Button size="sm" variant="outline" className="h-8" onClick={() => handleEdit(prop)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-300 hover:bg-red-50" onClick={() => setDeleteTarget(prop)}>
                    <Trash2 className="h-3 w-3 mr-1" /> Remove
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <PropertyFormDialog
          open={showForm}
          onClose={() => { setShowForm(false); setEditingProperty(null); }}
          onSuccess={handleFormSuccess}
          editProperty={editingProperty}
          propertyOwnerVendors={propertyOwnerVendors}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Property</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Property Add/Edit Form
function PropertyFormDialog({
  open, onClose, onSuccess, editProperty, propertyOwnerVendors,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (property: RentedProperty) => void;
  editProperty: RentedProperty | null;
  propertyOwnerVendors: Array<{ id: string; name: string; phone?: string; contact_person?: string; rent_amount?: number; lease_start?: string; lease_end?: string }>;
}) {
  const { toast } = useToast();
  const isEdit = !!editProperty;
  const [activeTab, setActiveTab] = useState("details");
  const [form, setForm] = useState({
    name: editProperty?.name || '',
    type: editProperty?.type || 'office' as RentedProperty['type'],
    location: editProperty?.location || '',
    address: editProperty?.address || '',
    city: editProperty?.city || '',
    state: editProperty?.state || '',
    pincode: editProperty?.pincode || '',
    floorNumber: editProperty?.floorNumber || '',
    latitude: editProperty?.latitude ?? undefined as number | undefined,
    longitude: editProperty?.longitude ?? undefined as number | undefined,
    numberOfRooms: editProperty?.numberOfRooms || 1,
    totalHeadCapacity: editProperty?.totalHeadCapacity || 10,
    areaSquareFt: editProperty?.areaSquareFt || 0,
    monthlyRent: editProperty?.monthlyRent || 0,
    securityDeposit: editProperty?.securityDeposit || 0,
    leaseStartDate: editProperty?.leaseStartDate || '',
    leaseEndDate: editProperty?.leaseEndDate || '',
    landlordName: editProperty?.landlordName || '',
    landlordPhone: editProperty?.landlordPhone || '',
    electricBillAccount: editProperty?.electricBillAccount || '',
    waterBillAccount: editProperty?.waterBillAccount || '',
    otherBills: editProperty?.otherBills || '',
    notes: editProperty?.notes || '',
    agreementUrl: editProperty?.agreementUrl || '',
    agreementDate: editProperty?.agreementDate || '',
    agreementType: editProperty?.agreementType || 'rent',
    vendorId: editProperty?.vendorId || '',
    rentPaymentDay: editProperty?.rentPaymentDay || 1,
    electricMeterReading: editProperty?.electricMeterReading ?? '',
    electricRatePerUnit: editProperty?.electricRatePerUnit ?? '',
    waterMeterReading: editProperty?.waterMeterReading ?? '',
    waterRatePerUnit: editProperty?.waterRatePerUnit ?? '',
    gasMeterReading: editProperty?.gasMeterReading ?? '',
    gasRatePerUnit: editProperty?.gasRatePerUnit ?? '',
  });

  const [rooms, setRooms] = useState<PropertyRoom[]>(editProperty?.rooms || []);
  const [uploadingAgreement, setUploadingAgreement] = useState(false);

  const AMENITIES_OPTIONS = [
    'AC', 'Fan', 'WiFi', 'CCTV', 'Fire Extinguisher', 'Water Purifier',
    'Furniture', 'Parking', 'Power Backup', 'Washroom Attached', 'Printer',
    'Projector', 'Whiteboard', 'Locker', 'Pantry', 'Intercom',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.location || !form.monthlyRent) {
      toast({ title: "Required", description: "Name, location, and rent are required.", variant: "destructive" });
      return;
    }

    const now = new Date().toISOString();
    let status: RentedProperty['status'] = 'active';
    if (form.leaseEndDate) {
      const endDate = new Date(form.leaseEndDate);
      const daysLeft = (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysLeft < 0) status = 'expired';
      else if (daysLeft < 90) status = 'expiring-soon';
    }

    const property: RentedProperty = {
      id: editProperty?.id || `prop-${Date.now()}`,
      ...form,
      type: form.type as RentedProperty['type'],
      status,
      rooms,
      vendorId: form.vendorId || undefined,
      rentPaymentDay: form.rentPaymentDay > 0 ? form.rentPaymentDay : undefined,
      electricMeterReading: form.electricMeterReading !== '' ? Number(form.electricMeterReading) : undefined,
      electricRatePerUnit: form.electricRatePerUnit !== '' ? Number(form.electricRatePerUnit) : undefined,
      waterMeterReading: form.waterMeterReading !== '' ? Number(form.waterMeterReading) : undefined,
      waterRatePerUnit: form.waterRatePerUnit !== '' ? Number(form.waterRatePerUnit) : undefined,
      gasMeterReading: form.gasMeterReading !== '' ? Number(form.gasMeterReading) : undefined,
      gasRatePerUnit: form.gasRatePerUnit !== '' ? Number(form.gasRatePerUnit) : undefined,
    };

    toast({ title: isEdit ? "Updated" : "Added", description: `${property.name} saved successfully.` });
    onSuccess(property);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'number' ? Number(value) || 0 : value }));
  };

  const handleAgreementUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setUploadingAgreement(true);
      try {
        const result = await uploadDocument(file, 'property-agreements', form.name || 'property');
        if (result.success && result.url) {
          setForm(prev => ({ ...prev, agreementUrl: result.url! }));
          toast({ title: "Uploaded", description: `${file.name} uploaded successfully.` });
        } else {
          throw new Error(result.error || 'Upload failed');
        }
      } catch (err: any) {
        toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
      } finally {
        setUploadingAgreement(false);
      }
    };
    input.click();
  };

  // Room management
  const addRoom = () => {
    setRooms(prev => [...prev, {
      id: `room-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: `Room ${prev.length + 1}`,
      type: 'office-cabin',
      capacity: 2,
      areaSqft: 0,
      amenities: [],
      photos: [],
      notes: '',
    }]);
  };

  const updateRoom = (idx: number, field: string, value: any) => {
    setRooms(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const removeRoom = (idx: number) => {
    setRooms(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleRoomAmenity = (roomIdx: number, amenity: string) => {
    setRooms(prev => prev.map((r, i) => {
      if (i !== roomIdx) return r;
      const has = r.amenities.includes(amenity);
      return { ...r, amenities: has ? r.amenities.filter(a => a !== amenity) : [...r.amenities, amenity] };
    }));
  };

  const handleRoomPhotoUpload = async (roomIdx: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      for (let i = 0; i < files.length; i++) {
        try {
          const result = await uploadDocument(files[i], 'property-room-photos', `${form.name}-room-${roomIdx}`);
          if (result.success && result.url) {
            setRooms(prev => prev.map((r, idx) => idx === roomIdx ? { ...r, photos: [...r.photos, result.url!] } : r));
          }
        } catch {
          // silently skip failed uploads
        }
      }
      toast({ title: "Photos Uploaded", description: `${files.length} photo(s) added.` });
    };
    input.click();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1100px] max-h-[90vh] overflow-hidden p-0" preventOutsideClose={true}>
        <div className="px-6 pt-6 pb-3 border-b">
          <DialogHeader>
            <DialogTitle className="text-xl">{isEdit ? 'Edit Property' : 'Add Rented Property'}</DialogTitle>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col h-[calc(90vh-130px)]">
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-5 h-11 gap-2 p-1">
                <TabsTrigger value="details" className="px-5 text-sm">Property Details</TabsTrigger>
                <TabsTrigger value="location" className="px-5 text-sm">Location & Map</TabsTrigger>
                <TabsTrigger value="lease" className="px-5 text-sm">Lease & Agreement</TabsTrigger>
                <TabsTrigger value="rooms" className="px-5 text-sm">Rooms ({rooms.length})</TabsTrigger>
              </TabsList>

              {/* ── Property Details Tab ── */}
              <TabsContent value="details" className="space-y-4 mt-2">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label>Property Name *</Label>
                    <Input name="name" value={form.name} onChange={handleChange} placeholder="e.g. Sector 15 Branch Office" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Type *</Label>
                    <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as RentedProperty['type'] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="office">Office</SelectItem>
                        <SelectItem value="warehouse">Warehouse</SelectItem>
                        <SelectItem value="residential">Residential / Quarters</SelectItem>
                        <SelectItem value="shop">Shop</SelectItem>
                        <SelectItem value="godown">Godown / Storage</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Floor Number</Label>
                    <Input name="floorNumber" value={form.floorNumber} onChange={handleChange} placeholder="e.g. Ground, 1st, 2nd" />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Area (sq.ft)</Label>
                    <Input name="areaSquareFt" type="number" min="0" value={form.areaSquareFt} onChange={handleChange} />
                  </div>
                  <div className="space-y-2">
                    <Label>Head Capacity</Label>
                    <Input name="totalHeadCapacity" type="number" min="1" value={form.totalHeadCapacity} onChange={handleChange} />
                  </div>
                  <div className="space-y-2">
                    <Label>No. of Rooms</Label>
                    <Input name="numberOfRooms" type="number" min="1" value={form.numberOfRooms} onChange={handleChange} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Monthly Rent (₹) *</Label>
                    <Input name="monthlyRent" type="number" min="0" value={form.monthlyRent} onChange={handleChange} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Security Deposit (₹)</Label>
                    <Input name="securityDeposit" type="number" min="0" value={form.securityDeposit} onChange={handleChange} />
                  </div>
                  <div className="space-y-2">
                    <Label>Other Bills / Charges</Label>
                    <Input name="otherBills" value={form.otherBills} onChange={handleChange} placeholder="e.g. Maintenance ₹5,000/month" />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">Bills & Accounts</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Electric Bill Account No.</Label>
                      <Input name="electricBillAccount" value={form.electricBillAccount} onChange={handleChange} placeholder="e.g. DHBVN-4521789" />
                    </div>
                    <div className="space-y-2">
                      <Label>Water Bill Account No.</Label>
                      <Input name="waterBillAccount" value={form.waterBillAccount} onChange={handleChange} placeholder="e.g. GMDA-WS-78901" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Any additional notes..." rows={2} />
                </div>

                {/* ── Utility Meters ── */}
                <div className="border-t pt-4 space-y-3">
                  <div>
                    <p className="text-sm font-medium">Utility Meters</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Enter the current meter reading and rate per unit. These become the
                      baseline for the next payment so the Pay modal can auto-calculate usage cost.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Electric */}
                    <div className="rounded-lg border p-3 space-y-2 bg-amber-50/40">
                      <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">⚡ Electric</p>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Current Reading (kWh)</Label>
                        <Input
                          name="electricMeterReading"
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.electricMeterReading}
                          onChange={handleChange}
                          placeholder="e.g. 12450.50"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Rate per kWh (₹)</Label>
                        <Input
                          name="electricRatePerUnit"
                          type="number"
                          min="0"
                          step="0.0001"
                          value={form.electricRatePerUnit}
                          onChange={handleChange}
                          placeholder="e.g. 8.50"
                        />
                      </div>
                    </div>
                    {/* Water */}
                    <div className="rounded-lg border p-3 space-y-2 bg-blue-50/40">
                      <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">💧 Water</p>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Current Reading (KL)</Label>
                        <Input
                          name="waterMeterReading"
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.waterMeterReading}
                          onChange={handleChange}
                          placeholder="e.g. 345.00"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Rate per KL (₹)</Label>
                        <Input
                          name="waterRatePerUnit"
                          type="number"
                          min="0"
                          step="0.0001"
                          value={form.waterRatePerUnit}
                          onChange={handleChange}
                          placeholder="e.g. 12.00"
                        />
                      </div>
                    </div>
                    {/* Gas */}
                    <div className="rounded-lg border p-3 space-y-2 bg-orange-50/40">
                      <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide">🔥 Piped Gas</p>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Current Reading (SCM)</Label>
                        <Input
                          name="gasMeterReading"
                          type="number"
                          min="0"
                          step="0.001"
                          value={form.gasMeterReading}
                          onChange={handleChange}
                          placeholder="e.g. 89.250"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Rate per SCM (₹)</Label>
                        <Input
                          name="gasRatePerUnit"
                          type="number"
                          min="0"
                          step="0.0001"
                          value={form.gasRatePerUnit}
                          onChange={handleChange}
                          placeholder="e.g. 55.00"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ── Location & Map Tab ── */}
              <TabsContent value="location" className="space-y-4 mt-2">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Address Fields */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Location / Landmark *</Label>
                      <Input name="location" value={form.location} onChange={handleChange} placeholder="e.g. Sector 15, Gurugram" required />
                    </div>
                    <div className="space-y-2">
                      <Label>Full Address</Label>
                      <Textarea name="address" value={form.address} onChange={handleChange} placeholder="Street address, building name, etc." rows={2} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>City</Label>
                        <Input name="city" value={form.city} onChange={handleChange} placeholder="e.g. Gurugram" />
                      </div>
                      <div className="space-y-2">
                        <Label>State</Label>
                        <Input name="state" value={form.state} onChange={handleChange} placeholder="e.g. Haryana" />
                      </div>
                      <div className="space-y-2">
                        <Label>PIN Code</Label>
                        <Input name="pincode" value={form.pincode} onChange={handleChange} placeholder="6 digits" maxLength={6} />
                      </div>
                    </div>
                    {form.latitude && form.longitude && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          <MapPin className="h-3 w-3 mr-1" />
                          Location Pinned
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                          {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Map Pin Picker */}
                  <div className="space-y-2">
                    <Label>Pin Location on Map</Label>
                    <div className="h-[280px]">
                      <MapPinPicker
                        lat={form.latitude}
                        lng={form.longitude}
                        address={form.address || form.location}
                        pincode={form.pincode}
                        district={form.city}
                        state={form.state}
                        onChange={(lat, lng) => setForm(prev => ({ ...prev, latitude: lat, longitude: lng }))}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ── Lease & Agreement Tab ── */}
              <TabsContent value="lease" className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-6">
                  {/* Lease Details */}
                  <div className="space-y-4">
                    <h4 className="font-semibold text-sm">Lease Details</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Lease Start Date</Label>
                        <Input name="leaseStartDate" type="date" value={form.leaseStartDate} onChange={handleChange} />
                      </div>
                      <div className="space-y-2">
                        <Label>Lease End Date</Label>
                        <Input name="leaseEndDate" type="date" value={form.leaseEndDate} onChange={handleChange} />
                      </div>
                    </div>

                    {/* Vendor Link — links the property to a property_owner vendor */}
                    <div className="space-y-2">
                      <Label>Link to Vendor (Property Owner)</Label>
                      <Select
                        value={form.vendorId || '__none__'}
                        onValueChange={v => {
                          const vid = v === '__none__' ? '' : v;
                          const vendor = propertyOwnerVendors.find(pv => pv.id === vid);
                          setForm(f => ({
                            ...f,
                            vendorId: vid,
                            // Auto-fill landlord name/phone from vendor if not already set
                            landlordName: f.landlordName || vendor?.contact_person || vendor?.name || f.landlordName,
                            landlordPhone: f.landlordPhone || vendor?.phone || f.landlordPhone,
                            monthlyRent: f.monthlyRent || vendor?.rent_amount || f.monthlyRent,
                            leaseStartDate: f.leaseStartDate || vendor?.lease_start || f.leaseStartDate,
                            leaseEndDate: f.leaseEndDate || vendor?.lease_end || f.leaseEndDate,
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select property owner vendor (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Not linked —</SelectItem>
                          {propertyOwnerVendors.map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Linking a vendor enables auto-creation of a recurring rent bill.
                        Add property owners in Procurement &rarr; Vendors.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Rent Payment Day <span className="text-muted-foreground font-normal">(day of month, 1–28)</span></Label>
                      <Input
                        name="rentPaymentDay"
                        type="number"
                        min="1"
                        max="28"
                        value={form.rentPaymentDay || ''}
                        onChange={e => setForm(f => ({ ...f, rentPaymentDay: Math.min(28, Math.max(1, parseInt(e.target.value) || 1)) }))}
                        placeholder="e.g. 1 for 1st of each month"
                      />
                      <p className="text-xs text-muted-foreground">
                        When set alongside a linked vendor, a monthly recurring bill will be
                        auto-created (or updated) each time you save this property.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Landlord Name</Label>
                        <Input name="landlordName" value={form.landlordName} onChange={handleChange} placeholder="e.g. Suresh Gupta" />
                      </div>
                      <div className="space-y-2">
                        <Label>Landlord Phone</Label>
                        <Input name="landlordPhone" value={form.landlordPhone} onChange={handleChange} placeholder="e.g. 9876543210" />
                      </div>
                    </div>
                  </div>

                  {/* Agreement Upload */}
                  <div className="space-y-4">
                    <h4 className="font-semibold text-sm">Rent Agreement</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Agreement Type</Label>
                        <Select value={form.agreementType} onValueChange={v => setForm(f => ({ ...f, agreementType: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rent">Rent Agreement</SelectItem>
                            <SelectItem value="lease">Lease Deed</SelectItem>
                            <SelectItem value="license">Leave & License</SelectItem>
                            <SelectItem value="sublease">Sub-Lease</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Agreement Date</Label>
                        <Input name="agreementDate" type="date" value={form.agreementDate} onChange={handleChange} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Upload Agreement Document</Label>
                      {form.agreementUrl ? (
                        <div className="flex items-center gap-2 p-3 rounded-lg border bg-green-50 border-green-200">
                          <FileIcon className="h-4 w-4 text-green-600" />
                          <span className="text-sm text-green-700 flex-1 truncate">Agreement uploaded</span>
                          <a href={form.agreementUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View</a>
                          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setForm(f => ({ ...f, agreementUrl: '' }))}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button type="button" variant="outline" className="w-full" onClick={handleAgreementUpload} disabled={uploadingAgreement}>
                          <Upload className="h-4 w-4 mr-2" />
                          {uploadingAgreement ? 'Uploading...' : 'Upload Agreement (PDF/Image)'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ── Rooms Tab ── */}
              <TabsContent value="rooms" className="space-y-4 mt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-sm">Rooms & Spaces</h4>
                    <p className="text-xs text-muted-foreground">Add individual rooms with amenities and photos</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addRoom}>
                    <Plus className="h-4 w-4 mr-1" /> Add Room
                  </Button>
                </div>

                {rooms.length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed p-8 text-center">
                    <Building className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No rooms added yet. Click "Add Room" to define individual spaces.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                    {rooms.map((room, idx) => (
                      <RoomCard
                        key={room.id}
                        room={room}
                        index={idx}
                        amenitiesOptions={AMENITIES_OPTIONS}
                        onUpdate={(field, value) => updateRoom(idx, field, value)}
                        onToggleAmenity={(amenity) => toggleRoomAmenity(idx, amenity)}
                        onUploadPhotos={() => handleRoomPhotoUpload(idx)}
                        onRemovePhoto={(photoIdx) => {
                          setRooms(prev => prev.map((r, i) => i === idx ? { ...r, photos: r.photos.filter((_, pi) => pi !== photoIdx) } : r));
                        }}
                        onRemove={() => removeRoom(idx)}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Fixed Footer */}
          <div className="border-t px-6 py-3 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{isEdit ? 'Update Property' : 'Add Property'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// File icon helper
function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}

// Room Card Component
function RoomCard({
  room, index, amenitiesOptions, onUpdate, onToggleAmenity, onUploadPhotos, onRemovePhoto, onRemove,
}: {
  room: PropertyRoom;
  index: number;
  amenitiesOptions: string[];
  onUpdate: (field: string, value: any) => void;
  onToggleAmenity: (amenity: string) => void;
  onUploadPhotos: () => void;
  onRemovePhoto: (photoIdx: number) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Room Header */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${expanded ? 'bg-blue-50 border-b' : 'bg-gray-50 hover:bg-gray-100'}`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-blue-600">#{index + 1}</span>
          <span className="text-sm font-medium">{room.name || `Room ${index + 1}`}</span>
          <Badge variant="outline" className="text-[10px]">{room.type}</Badge>
          {room.amenities.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{room.amenities.length} amenities</span>
          )}
          {room.photos.length > 0 && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Camera className="h-3 w-3" /> {room.photos.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Room Body */}
      {expanded && (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Room Name</Label>
              <Input value={room.name} onChange={(e) => onUpdate('name', e.target.value)} placeholder="e.g. Conference Room A" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={room.type} onValueChange={(v) => onUpdate('type', v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bedroom">Bedroom</SelectItem>
                  <SelectItem value="office-cabin">Office Cabin</SelectItem>
                  <SelectItem value="meeting-room">Meeting Room</SelectItem>
                  <SelectItem value="storage">Storage</SelectItem>
                  <SelectItem value="kitchen">Kitchen</SelectItem>
                  <SelectItem value="bathroom">Bathroom</SelectItem>
                  <SelectItem value="hall">Hall</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Capacity</Label>
              <Input type="number" min="0" value={room.capacity} onChange={(e) => onUpdate('capacity', Number(e.target.value) || 0)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Area (sq.ft)</Label>
              <Input type="number" min="0" value={room.areaSqft} onChange={(e) => onUpdate('areaSqft', Number(e.target.value) || 0)} className="h-8 text-sm" />
            </div>
          </div>

          {/* Amenities */}
          <div className="space-y-1.5">
            <Label className="text-xs">Amenities</Label>
            <div className="flex flex-wrap gap-2">
              {amenitiesOptions.map((amenity) => (
                <label key={amenity} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={room.amenities.includes(amenity)}
                    onCheckedChange={() => onToggleAmenity(amenity)}
                  />
                  <span className="text-xs">{amenity}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Photos */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Room Photos</Label>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={onUploadPhotos}>
                <Camera className="h-3 w-3 mr-1" /> Add Photos
              </Button>
            </div>
            {room.photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {room.photos.map((url, photoIdx) => (
                  <div key={photoIdx} className="relative group w-16 h-16 rounded-md overflow-hidden border">
                    <img src={url} alt={`Room photo ${photoIdx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full h-4 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onRemovePhoto(photoIdx)}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Room Notes */}
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Input value={room.notes} onChange={(e) => onUpdate('notes', e.target.value)} placeholder="Any specific notes about this room..." className="h-8 text-sm" />
          </div>
        </div>
      )}
    </div>
  );
}
