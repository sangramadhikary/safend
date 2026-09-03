'use client';

import { useState, useEffect } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Vehicle } from "@/types/fleet";
import { Pencil, Trash2, Building2, User, Radio, Smartphone, Car, MapPin, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { traccarFetch, traccarMutate } from "@/services/traccar/traccarApi";

interface VehicleDetailsProps {
  vehicle: Vehicle;
  onEdit: () => void;
  onDelete: () => void;
}

const TRACCAR_SERVER_URL = 'http://187.127.154.136:5055';

export function VehicleDetails({ vehicle, onEdit, onDelete }: VehicleDetailsProps) {
  // Traccar device validation state
  const [deviceStatus, setDeviceStatus] = useState<'loading' | 'registered' | 'not_found' | 'error'>('loading');
  const [deviceInfo, setDeviceInfo] = useState<{ status: string; lastUpdate: string | null; recentPositions: string[] } | null>(null);
  const [resettingBinding, setResettingBinding] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [bindingReset, setBindingReset] = useState(false);

  const traccarDeviceId = vehicle.traccarDeviceId || vehicle.registrationNumber?.toLowerCase().replace(/\s+/g, '');

  // Validate device exists in Traccar on mount
  useEffect(() => {
    if (vehicle.ownership !== 'employee-owned' || !traccarDeviceId) {
      setDeviceStatus('not_found');
      return;
    }

    const validateDevice = async () => {
      setDeviceStatus('loading');
      try {
        const devices = await traccarFetch<any[]>('/api/traccar/devices');
        const found = devices.find((d: any) => d.uniqueId === traccarDeviceId);
        if (found) {
          setDeviceStatus('registered');

          // Fetch recent positions for last 3 timestamps
          let recentPositions: string[] = [];
          try {
            const now = new Date();
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const summaries = await traccarFetch<any[]>('/api/traccar/summary', {
              deviceId: found.id,
              from: yesterday.toISOString(),
              to: now.toISOString(),
            });
            // Use startTime/endTime from summaries as recent timestamps
            recentPositions = summaries
              .filter((s: any) => s.startTime)
              .flatMap((s: any) => [s.startTime, s.endTime].filter(Boolean))
              .slice(0, 3);
          } catch {
            // Positions fetch is optional
          }

          setDeviceInfo({ 
            status: found.status, 
            lastUpdate: found.lastUpdate,
            recentPositions,
          });
        } else {
          setDeviceStatus('not_found');
        }
      } catch {
        setDeviceStatus('error');
      }
    };

    validateDevice();
  }, [traccarDeviceId, vehicle.ownership]);

  // Reset phone binding — allows re-pairing with a new phone
  const handleResetBinding = async () => {
    setResettingBinding(true);
    try {
      // Re-create the binding with cleared fingerprint
      await traccarMutate('POST', '/api/traccar/verify-binding', {
        body: {
          deviceUniqueId: traccarDeviceId,
          vehicleId: vehicle.id,
          employeeName: vehicle.ownerName,
          employeeId: vehicle.ownerEmployeeId,
          boundBy: 'admin-reset',
        },
      });

      setBindingReset(true);
      setShowResetConfirm(false);
    } catch (err) {
      console.error('Failed to reset binding:', err);
    } finally {
      setResettingBinding(false);
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
          Company Owned
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
        <User className="h-3 w-3 mr-1" />
        Employee Owned
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-IN');
  };

  const isExpired = (dateString: string) => {
    if (!dateString) return false;
    return new Date(dateString) < new Date();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gray-100 rounded-lg">
            <Car className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">{vehicle.model}</h3>
            <p className="text-sm text-muted-foreground font-mono">{vehicle.registrationNumber}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {getStatusBadge(vehicle.status)}
          {getOwnershipBadge(vehicle.ownership)}
        </div>
      </div>

      <Separator />

      {/* Two-column details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
        {/* Left Column */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Vehicle Info</h4>
          <DetailRow label="Type" value={vehicle.type} capitalize />
          <DetailRow label="Fuel Type" value={vehicle.fuelType} capitalize />
          <DetailRow label="Odometer" value={`${vehicle.currentOdometer.toLocaleString('en-IN')} km`} />
          <DetailRow label="Rate per KM" value={`₹${vehicle.ratePerKm}/km`} valueClass="font-semibold text-green-700" />
          <DetailRow label="Service Interval" value={`${vehicle.maintenanceInterval.toLocaleString('en-IN')} km`} />
          {vehicle.assignedDriver && (
            <DetailRow label="Assigned Driver" value={vehicle.assignedDriver} />
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Compliance</h4>
          {vehicle.purchaseDate && (
            <DetailRow label="Purchase Date" value={formatDate(vehicle.purchaseDate)} />
          )}
          {vehicle.insuranceExpiryDate && (
            <DetailRow 
              label="Insurance Expiry" 
              value={formatDate(vehicle.insuranceExpiryDate)} 
              valueClass={isExpired(vehicle.insuranceExpiryDate) ? 'text-red-600 font-bold' : ''}
            />
          )}
          {vehicle.pollutionCertExpiryDate && (
            <DetailRow 
              label="Pollution Cert Expiry" 
              value={formatDate(vehicle.pollutionCertExpiryDate)} 
              valueClass={isExpired(vehicle.pollutionCertExpiryDate) ? 'text-red-600 font-bold' : ''}
            />
          )}
          {vehicle.lastMaintenanceDate && (
            <DetailRow label="Last Maintenance" value={formatDate(vehicle.lastMaintenanceDate)} />
          )}
          {vehicle.nextMaintenanceDue && (
            <DetailRow 
              label="Next Service Due" 
              value={formatDate(vehicle.nextMaintenanceDue)} 
              valueClass={isExpired(vehicle.nextMaintenanceDue) ? 'text-red-600 font-bold' : ''}
            />
          )}
        </div>
      </div>

      {/* Employee Section - for employee-owned vehicles */}
      {vehicle.ownership === 'employee-owned' && (
        <>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Employee Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              {vehicle.ownerName && (
                <DetailRow label="Employee (Owner)" value={vehicle.ownerName} valueClass="font-medium" />
              )}
              {vehicle.department && (
                <DetailRow label="Department" value={vehicle.department} capitalize />
              )}
              {vehicle.dlNumber && (
                <DetailRow label="DL Number" value={vehicle.dlNumber} />
              )}
              {vehicle.dlExpiryDate && (
                <DetailRow 
                  label="DL Expiry" 
                  value={formatDate(vehicle.dlExpiryDate)} 
                  valueClass={isExpired(vehicle.dlExpiryDate) ? 'text-red-600 font-bold' : ''}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* GPS Tracker / QR Code Section - for employee-owned vehicles */}
      {vehicle.ownership === 'employee-owned' && (
        <>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-blue-600" />
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">GPS Tracking (Traccar)</h4>
            </div>

            {/* Device Validation Status */}
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-gray-50">
              {deviceStatus === 'loading' && (
                <>
                  <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                  <span className="text-sm text-muted-foreground">Verifying device on Traccar server...</span>
                </>
              )}
              {deviceStatus === 'registered' && (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-800">Device registered on Traccar ✓</p>
                    <p className="text-xs text-muted-foreground">
                      Status: <span className={`font-medium ${deviceInfo?.status === 'online' ? 'text-green-600' : 'text-gray-500'}`}>
                        {deviceInfo?.status || 'offline'}
                      </span>
                      {deviceInfo?.lastUpdate && (
                        <> · Last seen: {new Date(deviceInfo.lastUpdate).toLocaleString('en-IN')}</>
                      )}
                    </p>
                  </div>
                  <Badge className={deviceInfo?.status === 'online' ? 'bg-green-500' : 'bg-gray-400'}>
                    {deviceInfo?.status === 'online' ? 'Online' : 'Offline'}
                  </Badge>
                </>
              )}
              {deviceStatus === 'not_found' && (
                <>
                  <XCircle className="h-5 w-5 text-red-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-700">Device NOT found on Traccar server</p>
                    <p className="text-xs text-muted-foreground">
                      Device ID <code className="bg-red-50 px-1 rounded">{traccarDeviceId}</code> does not exist. 
                      Edit this vehicle to create it, or register it manually on Traccar.
                    </p>
                  </div>
                  <Badge variant="outline" className="border-red-300 text-red-600">Not Registered</Badge>
                </>
              )}
              {deviceStatus === 'error' && (
                <>
                  <XCircle className="h-5 w-5 text-amber-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-700">Could not reach Traccar server</p>
                    <p className="text-xs text-muted-foreground">Check that the Traccar service is running.</p>
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start">
              {/* If device is registered & connected — show connection status only */}
              {deviceStatus === 'registered' && (
                <div className="space-y-3 col-span-full">
                  <div className="grid grid-cols-2 gap-4">
                    <DetailRow label="Device ID" value={traccarDeviceId} valueClass="font-mono bg-gray-100 px-2 py-0.5 rounded text-sm" />
                    <DetailRow label="Status" value={deviceInfo?.status === 'online' ? '🟢 Online' : '⚪ Offline'} valueClass="font-medium" />
                  </div>
                  {vehicle.traccarDeviceName && (
                    <DetailRow label="Device Name" value={vehicle.traccarDeviceName} />
                  )}
                  {deviceInfo?.lastUpdate && (
                    <DetailRow label="Last Connected" value={new Date(deviceInfo.lastUpdate).toLocaleString('en-IN')} />
                  )}
                  {deviceInfo?.recentPositions && deviceInfo.recentPositions.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Recent Activity:</p>
                      <div className="space-y-1">
                        {deviceInfo.recentPositions.map((ts: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                            {new Date(ts).toLocaleString('en-IN')}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Change Mobile Phone */}
                  {!bindingReset && !showResetConfirm && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={() => setShowResetConfirm(true)}
                    >
                      <Smartphone className="h-3.5 w-3.5 mr-2" />
                      Change Mobile Phone
                    </Button>
                  )}

                  {/* Confirmation */}
                  {showResetConfirm && (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-2 mt-2">
                      <p className="text-sm font-medium text-amber-800">Reset Phone Binding?</p>
                      <p className="text-xs text-amber-700">
                        This will clear the current phone fingerprint. The employee will need to scan the QR code again on their new phone. The next connection from any phone will be accepted and locked.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleResetBinding}
                          disabled={resettingBinding}
                        >
                          {resettingBinding ? 'Resetting...' : 'Yes, Reset Binding'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowResetConfirm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* After reset — show QR for new phone */}
                  {bindingReset && (
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200 space-y-3 mt-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <p className="text-sm font-medium text-green-800">Binding reset. Scan QR on new phone:</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <QRCodeSVG
                          value={`${TRACCAR_SERVER_URL}?id=${traccarDeviceId}&interval=60`}
                          size={100}
                          level="M"
                          bgColor="#ffffff"
                          fgColor="#000000"
                        />
                        <div className="text-xs text-green-700 space-y-1">
                          <p>1. Install Traccar Client on new phone</p>
                          <p>2. Scan this QR code</p>
                          <p>3. Tap Start → new phone is bound</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* If device NOT registered or error — show QR + instructions */}
              {deviceStatus !== 'registered' && (
                <>
                  <div className="space-y-3">
                    <DetailRow 
                      label="Device ID" 
                      value={traccarDeviceId} 
                      valueClass="font-mono bg-gray-100 px-2 py-0.5 rounded text-sm"
                    />
                    {vehicle.traccarDeviceName && (
                      <DetailRow label="Device Name" value={vehicle.traccarDeviceName} />
                    )}
                    
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 space-y-2">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-blue-600" />
                        <p className="text-sm font-medium text-blue-800">Setup on Employee Phone</p>
                      </div>
                      <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                        <li>Install <strong>Traccar Client</strong> from Play Store</li>
                        <li>Scan the QR code → or enter manually:</li>
                        <li>Device ID: <code className="bg-blue-100 px-1 rounded">{traccarDeviceId}</code></li>
                        <li>Server URL: <code className="bg-blue-100 px-1 rounded">{TRACCAR_SERVER_URL}</code></li>
                        <li>Frequency: <code className="bg-blue-100 px-1 rounded">60</code> seconds</li>
                        <li>Tap <strong>Start</strong> → tracking begins</li>
                      </ol>
                    </div>
                  </div>

                  {/* QR Code */}
                  <div className="flex flex-col items-center gap-2 p-4 bg-white border rounded-lg shadow-xs">
                    <QRCodeSVG
                      value={`${TRACCAR_SERVER_URL}?id=${traccarDeviceId}&interval=60`}
                      size={140}
                      level="M"
                      includeMargin={false}
                      bgColor="#ffffff"
                      fgColor="#000000"
                    />
                    <p className="text-[10px] text-muted-foreground text-center max-w-[140px]">
                      Scan with Traccar Client app to auto-configure
                    </p>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {traccarDeviceId}
                    </Badge>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Info banners */}
      {vehicle.ownership === 'company-owned' && (
        <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
          <p className="text-sm text-indigo-800">
            <strong>Company Vehicle:</strong> Fueling details with bill upload are managed here in Office Admin.
          </p>
        </div>
      )}

      {vehicle.ownership === 'employee-owned' && deviceStatus === 'not_found' && (
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-sm text-amber-800">
            <strong>Action Required:</strong> This device is not registered on Traccar. Edit this vehicle and save again to auto-register it, or create it manually via the Add Vehicle form.
          </p>
        </div>
      )}
      
      <Separator />
      
      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onEdit}>
          <Pencil className="h-4 w-4 mr-2" />
          Edit Vehicle
        </Button>
        <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={onDelete}>
          <Trash2 className="h-4 w-4 mr-2" />
          Remove
        </Button>
      </div>
    </div>
  );
}

// ─── Helper Component ─────────────────────────────────────────────────────────

function DetailRow({ 
  label, 
  value, 
  capitalize, 
  valueClass 
}: { 
  label: string; 
  value: string; 
  capitalize?: boolean; 
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-muted-foreground">{label}:</span>
      <span className={`text-sm text-right ${capitalize ? 'capitalize' : ''} ${valueClass || ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}
