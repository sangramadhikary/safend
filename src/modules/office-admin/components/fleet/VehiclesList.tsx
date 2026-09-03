'use client';
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Fuel, Car, Bike, Truck, Bus, Pencil, Trash2, Building2, User, Radio, MapPin, Smartphone, Calendar, Gauge, Wrench, CreditCard } from "lucide-react";
import { Vehicle } from "@/types/fleet";
import { getVehicles, deleteVehicle } from "@/services/fleet/FleetService";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VehicleDetails } from "./VehicleDetails";
import { VehicleForm } from "./VehicleForm";
import { FuelLogForm } from "./FuelLogForm";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface VehiclesListProps {
  branchId: string;
  searchQuery: string;
}

export function VehiclesList({ branchId, searchQuery }: VehiclesListProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isFuelLogOpen, setIsFuelLogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const { toast } = useToast();

  const fetchVehicles = async () => {
    if (branchId) {
      try {
        setIsLoading(true);
        const fetchedVehicles = await getVehicles(branchId);
        setVehicles(fetchedVehicles);
      } catch (error) {
        console.error("Error fetching vehicles:", error);
        toast({
          title: "Error",
          description: "Failed to load vehicles.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, [branchId]);

  // Filter vehicles based on search query
  const filteredVehicles = vehicles.filter(vehicle => 
    vehicle.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
    vehicle.registrationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    vehicle.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    vehicle.ownership.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (vehicle.assignedDriver && vehicle.assignedDriver.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (vehicle.ownerName && vehicle.ownerName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Get vehicle icon based on type
  const getVehicleIcon = (type: string, className: string) => {
    switch (type) {
      case 'motorcycle':
        return <Bike className={className} />;
      case 'truck':
        return <Truck className={className} />;
      case 'bus':
        return <Bus className={className} />;
      case 'car':
      case 'suv':
      case 'van':
      default:
        return <Car className={className} />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available':
        return <Badge className="bg-green-500">Available</Badge>;
      case 'in-use':
        return <Badge className="bg-blue-500">In Use</Badge>;
      case 'maintenance':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">Maintenance</Badge>;
      case 'out-of-service':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Out of Service</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getOwnershipBadge = (ownership: string) => {
    if (ownership === 'company-owned') {
      return (
        <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-300">
          <Building2 className="h-3 w-3 mr-1" />
          Company
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
        <User className="h-3 w-3 mr-1" />
        Employee
      </Badge>
    );
  };

  const handleViewDetails = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setIsDetailsOpen(true);
  };

  const handleEdit = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setIsEditOpen(true);
  };

  const handleLogFuel = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setIsFuelLogOpen(true);
  };

  const handleDelete = (vehicle: Vehicle) => {
    setDeleteTarget(vehicle);
  };

  const confirmDelete = async () => {
    if (deleteTarget) {
      try {
        await deleteVehicle(deleteTarget.id);
        setVehicles(vehicles.filter(v => v.id !== deleteTarget.id));
        toast({ title: "Deleted", description: `${deleteTarget.model} (${deleteTarget.registrationNumber}) removed.` });
      } catch (err) {
        toast({ title: "Error", description: "Failed to delete vehicle.", variant: "destructive" });
      }
      setDeleteTarget(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <LoadingAnimation size="md" />
      </div>
    );
  }

  if (!filteredVehicles.length) {
    return (
      <Alert className="bg-blue-50 border-blue-100 text-blue-800">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No vehicles found matching your criteria.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {filteredVehicles.map((vehicle) => {
        const hasGPS = !!vehicle.traccarDeviceId;
        const isExpired = (date?: string) => date ? new Date(date) < new Date() : false;
        
        return (
          <div 
            key={vehicle.id} 
            className="border rounded-xl bg-white hover:shadow-lg transition-all group overflow-hidden cursor-pointer"
            onClick={() => handleViewDetails(vehicle)}
          >
            {/* Card Header — Colored top band + Icon + Model */}
            <div className={`px-4 py-3 flex items-center gap-3 ${
              vehicle.ownership === 'company-owned' 
                ? 'bg-linear-to-r from-indigo-50 via-indigo-25 to-white border-b border-indigo-100' 
                : 'bg-linear-to-r from-orange-50 via-orange-25 to-white border-b border-orange-100'
            }`}>
              <div className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                vehicle.ownership === 'company-owned' ? 'bg-indigo-100' : 'bg-orange-100'
              }`}>
                {getVehicleIcon(vehicle.type, `h-5 w-5 ${
                  vehicle.ownership === 'company-owned' ? 'text-indigo-600' : 'text-orange-600'
                }`)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm truncate">{vehicle.model}</h3>
                  {getStatusBadge(vehicle.status)}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-[11px] text-muted-foreground bg-white/80 px-1.5 py-0.5 rounded border">{vehicle.registrationNumber}</span>
                  <span className="text-[11px] text-muted-foreground capitalize">{vehicle.type} · {vehicle.fuelType}</span>
                </div>
              </div>
            </div>

            {/* Card Body — Compact info grid */}
            <div className="px-4 py-3 space-y-3">
              {/* Badges + Rate row */}
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {getOwnershipBadge(vehicle.ownership)}
                  {hasGPS && (
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                      <Radio className="h-3 w-3 mr-0.5" />GPS
                    </Badge>
                  )}
                </div>
                <span className="text-sm font-bold text-green-700">₹{vehicle.ratePerKm}/km</span>
              </div>

              {/* Stats — 2 column grid */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 text-muted-foreground bg-gray-50 rounded-md px-2 py-1.5">
                  <Gauge className="h-3.5 w-3.5 text-gray-500" />
                  <span className="font-medium text-foreground">{vehicle.currentOdometer.toLocaleString('en-IN')} km</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground bg-gray-50 rounded-md px-2 py-1.5">
                  <Wrench className="h-3.5 w-3.5 text-gray-500" />
                  <span className="font-medium text-foreground">{vehicle.maintenanceInterval.toLocaleString('en-IN')} km</span>
                </div>
                {vehicle.ownership === 'employee-owned' && vehicle.ownerName ? (
                  <div className="flex items-center gap-1.5 text-muted-foreground bg-gray-50 rounded-md px-2 py-1.5 col-span-2">
                    <User className="h-3.5 w-3.5 text-gray-500" />
                    <span className="truncate">{vehicle.ownerName}</span>
                    {vehicle.department && <span className="text-[10px] capitalize ml-auto text-muted-foreground">({vehicle.department})</span>}
                  </div>
                ) : vehicle.assignedDriver ? (
                  <div className="flex items-center gap-1.5 text-muted-foreground bg-gray-50 rounded-md px-2 py-1.5 col-span-2">
                    <User className="h-3.5 w-3.5 text-gray-500" />
                    <span className="truncate">Driver: {vehicle.assignedDriver}</span>
                  </div>
                ) : null}
                {hasGPS && vehicle.traccarDeviceName && (
                  <div className="flex items-center gap-1.5 bg-blue-50 rounded-md px-2 py-1.5 col-span-2 text-blue-700">
                    <Radio className="h-3.5 w-3.5" />
                    <span className="truncate text-[11px]">{vehicle.traccarDeviceName} ({vehicle.traccarDeviceId})</span>
                  </div>
                )}
              </div>

              {/* Expiry badges row */}
              {(vehicle.insuranceExpiryDate || vehicle.pollutionCertExpiryDate || vehicle.nextMaintenanceDue) && (
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-dashed">
                  {vehicle.insuranceExpiryDate && (
                    <Badge variant="outline" className={`text-[10px] ${
                      isExpired(vehicle.insuranceExpiryDate) ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50'
                    }`}>
                      {isExpired(vehicle.insuranceExpiryDate) ? '⚠️' : '🛡️'} {new Date(vehicle.insuranceExpiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </Badge>
                  )}
                  {vehicle.pollutionCertExpiryDate && (
                    <Badge variant="outline" className={`text-[10px] ${
                      isExpired(vehicle.pollutionCertExpiryDate) ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50'
                    }`}>
                      {isExpired(vehicle.pollutionCertExpiryDate) ? '⚠️' : '📋'} {new Date(vehicle.pollutionCertExpiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </Badge>
                  )}
                  {vehicle.nextMaintenanceDue && (
                    <Badge variant="outline" className={`text-[10px] ${
                      isExpired(vehicle.nextMaintenanceDue) ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      🔧 {new Date(vehicle.nextMaintenanceDue).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Card Footer — Actions */}
            <div className="px-4 py-2 border-t bg-gray-50/50 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-7 px-2 text-xs"
                onClick={() => handleViewDetails(vehicle)}
              >
                <Smartphone className="h-3 w-3 mr-1" />
                Change Device
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-7 px-2 text-xs"
                onClick={() => handleEdit(vehicle)}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Edit
              </Button>
              {vehicle.ownership === 'company-owned' && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-7 px-2 text-xs"
                  onClick={() => handleLogFuel(vehicle)}
                >
                  <Fuel className="h-3 w-3 mr-1" />
                  Fuel
                </Button>
              )}
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto"
                onClick={() => handleDelete(vehicle)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>

      {/* Vehicle Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vehicle Details</DialogTitle>
          </DialogHeader>
          {selectedVehicle && (
            <VehicleDetails 
              vehicle={selectedVehicle} 
              onEdit={() => { setIsDetailsOpen(false); handleEdit(selectedVehicle); }}
              onDelete={() => { setIsDetailsOpen(false); handleDelete(selectedVehicle); }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Vehicle Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Vehicle</DialogTitle>
          </DialogHeader>
          {selectedVehicle && (
            <VehicleForm 
              branchId={branchId}
              editVehicle={selectedVehicle}
              onSuccess={() => { setIsEditOpen(false); fetchVehicles(); }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Fuel Log Dialog */}
      <Dialog open={isFuelLogOpen} onOpenChange={setIsFuelLogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Log Fuel Fill-Up (Company Vehicle)</DialogTitle>
          </DialogHeader>
          {selectedVehicle && (
            <FuelLogForm 
              branchId={branchId} 
              vehicle={selectedVehicle} 
              onSuccess={() => setIsFuelLogOpen(false)} 
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Vehicle</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{deleteTarget?.model} ({deleteTarget?.registrationNumber})</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
