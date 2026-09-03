'use client';

import { useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Building, Crosshair, Loader2, Pencil, Plus, Radio, Shield, Trash2 } from 'lucide-react';
import { HEAD_OFFICE, isAtOffice } from '@/lib/officeLocation';
import { useToast } from '@/hooks/use-toast';
import {
  deviceLabel,
  deviceRatePerKm,
  formatIstDateTime,
  formatRelative,
  isRecentlyActive,
} from '@/services/traccar/traccarFormat';
import type { TraccarDevice } from '@/services/traccar/traccarTypes';
import {
  useCreateGeofence,
  useDeleteDevice,
  useDeleteGeofence,
  useGeofences,
  useLivePositions,
  useUpdateDevice,
} from '../useTrackingData';
import { parseCircleArea, type TrackingScope } from '../trackingUtils';
import { PanelError } from './PanelState';

/**
 * Devices view: the control surface for tracking configuration.
 *
 * Everything here writes straight to the GPS server, so it is gated to the
 * write roles server-side. Device attributes matter beyond labelling — the
 * rate/km stored here is what the reimbursement figures are calculated from.
 */
export function DevicesPanel({ scope }: { scope: TrackingScope }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<TraccarDevice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TraccarDevice | null>(null);

  const deleteDevice = useDeleteDevice();

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDevice.mutateAsync(deleteTarget.id);
      toast({
        title: 'Device removed',
        description: `${deviceLabel(deleteTarget)} no longer exists on the GPS server.`,
      });
      setDeleteTarget(null);
    } catch (error: any) {
      toast({
        title: 'Could not remove device',
        description: error?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Radio className="h-4 w-4 text-muted-foreground" />
            Registered trackers ({scope.devices.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person / device</TableHead>
                  <TableHead>Device id</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead className="text-right">Rate/km</TableHead>
                  <TableHead>Last contact</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scope.devices.map((device) => {
                  const active = isRecentlyActive(device.lastUpdate);
                  const rate = deviceRatePerKm(device);

                  return (
                    <TableRow key={device.id} className={device.disabled ? 'opacity-60' : undefined}>
                      <TableCell className="py-2">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: scope.colors[device.id] ?? '#94A3B8' }}
                          />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium leading-tight">
                                {deviceLabel(device)}
                              </span>
                              {device.disabled && (
                                <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                  disabled
                                </Badge>
                              )}
                            </span>
                            <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                              {device.name}
                            </span>
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="py-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                          {device.uniqueId}
                        </code>
                      </TableCell>
                      <TableCell className="py-2 text-sm capitalize">
                        {device.attributes?.department || '—'}
                      </TableCell>
                      <TableCell className="py-2 text-sm">
                        {device.attributes?.vehicleNumber || '—'}
                        {device.attributes?.vehicleModel && (
                          <span className="block text-[11px] text-muted-foreground">
                            {device.attributes.vehicleModel}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-right text-sm">
                        {rate > 0 ? (
                          `₹${rate}`
                        ) : (
                          <span className="text-amber-600" title="No rate set — reimbursement will show as zero">
                            not set
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        <span
                          className={`text-xs ${active ? 'font-medium text-green-600' : 'text-muted-foreground'}`}
                        >
                          {active ? '● live' : formatRelative(device.lastUpdate)}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          {formatIstDateTime(device.lastUpdate)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setEditing(device)}
                          >
                            <Pencil className="mr-1 h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setDeleteTarget(device)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <GeofenceSection scope={scope} />

      {editing && (
        <DeviceEditDialog
          device={editing}
          onClose={() => setEditing(null)}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove tracker from the GPS server?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes <strong>{deleteTarget ? deviceLabel(deleteTarget) : ''}</strong> and its
              position history from Traccar. The vehicle record in the ERP is not touched, but it
              will stop receiving location data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteDevice.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteDevice.isPending ? 'Removing…' : 'Remove device'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Device editor ────────────────────────────────────────────────────────────

const CATEGORIES = ['person', 'car', 'motorcycle', 'truck', 'bus', 'bicycle', 'default'];

function DeviceEditDialog({ device, onClose }: { device: TraccarDevice; onClose: () => void }) {
  const { toast } = useToast();
  const updateDevice = useUpdateDevice();

  const [form, setForm] = useState({
    name: device.name ?? '',
    phone: device.phone ?? '',
    model: device.model ?? '',
    contact: device.contact ?? '',
    category: device.category || 'person',
    disabled: Boolean(device.disabled),
    employeeName: device.attributes?.employeeName ?? '',
    employeeId: device.attributes?.employeeId ?? '',
    department: device.attributes?.department ?? '',
    vehicleNumber: device.attributes?.vehicleNumber ?? '',
    vehicleModel: device.attributes?.vehicleModel ?? '',
    ratePerKm: String(device.attributes?.ratePerKm ?? ''),
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }

    const rate = Number(form.ratePerKm);
    if (form.ratePerKm !== '' && (!Number.isFinite(rate) || rate < 0)) {
      toast({ title: 'Rate per km must be a positive number', variant: 'destructive' });
      return;
    }

    try {
      await updateDevice.mutateAsync({
        id: device.id,
        // uniqueId is the phone's pairing key — changing it would break the link.
        uniqueId: device.uniqueId,
        name: form.name.trim(),
        phone: form.phone || null,
        model: form.model || null,
        contact: form.contact || null,
        category: form.category,
        disabled: form.disabled,
        attributes: {
          // Preserve anything else Traccar already holds on the device.
          ...device.attributes,
          employeeName: form.employeeName,
          employeeId: form.employeeId,
          department: form.department,
          vehicleNumber: form.vehicleNumber,
          vehicleModel: form.vehicleModel,
          ratePerKm: form.ratePerKm === '' ? 0 : rate,
        },
      });
      toast({ title: 'Device updated', description: `${form.name} saved on the GPS server.` });
      onClose();
    } catch (error: any) {
      toast({
        title: 'Could not update device',
        description: error?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Edit tracker</DialogTitle>
          <DialogDescription>
            Device id <code className="rounded bg-muted px-1">{device.uniqueId}</code> stays fixed —
            it is what the phone app pairs against.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Display name">
            <Input value={form.name} onChange={(event) => set('name', event.target.value)} />
          </Field>
          <Field label="Category">
            <Select value={form.category} onValueChange={(value) => set('category', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category} className="capitalize">
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Employee name">
            <Input
              value={form.employeeName}
              onChange={(event) => set('employeeName', event.target.value)}
              placeholder="Shown everywhere in the console"
            />
          </Field>
          <Field label="Employee id">
            <Input
              value={form.employeeId}
              onChange={(event) => set('employeeId', event.target.value)}
            />
          </Field>

          <Field label="Department">
            <Input
              value={form.department}
              onChange={(event) => set('department', event.target.value)}
            />
          </Field>
          <Field label="Contact number">
            <Input value={form.phone} onChange={(event) => set('phone', event.target.value)} />
          </Field>

          <Field label="Vehicle number">
            <Input
              value={form.vehicleNumber}
              onChange={(event) => set('vehicleNumber', event.target.value)}
            />
          </Field>
          <Field label="Vehicle model">
            <Input
              value={form.vehicleModel}
              onChange={(event) => set('vehicleModel', event.target.value)}
            />
          </Field>

          <Field label="Rate per km (₹)" hint="Drives the reimbursement figures">
            <Input
              type="number"
              min={0}
              step="0.5"
              value={form.ratePerKm}
              onChange={(event) => set('ratePerKm', event.target.value)}
            />
          </Field>
          <Field label="Phone model">
            <Input value={form.model} onChange={(event) => set('model', event.target.value)} />
          </Field>
        </div>

        <label className="flex items-center justify-between rounded-lg border p-3">
          <span>
            <span className="block text-sm font-medium">Disable tracking</span>
            <span className="block text-[11px] text-muted-foreground">
              Keeps the history but stops accepting new positions.
            </span>
          </span>
          <Switch checked={form.disabled} onCheckedChange={(value) => set('disabled', value)} />
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updateDevice.isPending}>
            {updateDevice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Geofences ────────────────────────────────────────────────────────────────

function GeofenceSection({ scope }: { scope: TrackingScope }) {
  const { toast } = useToast();
  const geofencesQuery = useGeofences();
  const createGeofence = useCreateGeofence();
  const deleteGeofence = useDeleteGeofence();
  // One-off fetch (no polling) purely to offer "use a device's last position".
  const positionsQuery = useLivePositions(0);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', latitude: '', longitude: '', radiusMeters: '200' });

  const devicesWithPosition = useMemo(
    () =>
      scope.devices
        .map((device) => ({
          device,
          position: (positionsQuery.data ?? []).find((row) => row.deviceId === device.id),
        }))
        .filter((entry) => entry.position),
    [scope.devices, positionsQuery.data]
  );

  const submit = async () => {
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    const radiusMeters = Number(form.radiusMeters);

    if (!form.name.trim()) {
      toast({ title: 'Give the geofence a name', variant: 'destructive' });
      return;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      toast({ title: 'Enter valid coordinates', variant: 'destructive' });
      return;
    }
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
      toast({ title: 'Radius must be greater than zero', variant: 'destructive' });
      return;
    }

    try {
      const created = (await createGeofence.mutateAsync({
        name: form.name.trim(),
        latitude,
        longitude,
        radiusMeters,
      })) as { linkedDevices?: number };

      toast({
        title: 'Geofence created',
        description: `${form.name} is now watched on ${created?.linkedDevices ?? 0} device(s). Enter and exit events appear from the next position each device reports.`,
      });
      setForm({ name: '', latitude: '', longitude: '', radiusMeters: '200' });
      setOpen(false);
    } catch (error: any) {
      toast({
        title: 'Could not create geofence',
        description: error?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const remove = async (id: number, name: string) => {
    try {
      await deleteGeofence.mutateAsync(id);
      toast({ title: 'Geofence removed', description: name });
    } catch (error: any) {
      toast({
        title: 'Could not remove geofence',
        description: error?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const geofences = geofencesQuery.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4 text-muted-foreground" />
          Geofences ({geofences.length})
        </CardTitle>
        <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add geofence
        </Button>
      </CardHeader>

      <CardContent>
        {geofencesQuery.isError ? (
          <PanelError error={geofencesQuery.error} onRetry={() => geofencesQuery.refetch()} />
        ) : geofences.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No geofences yet. Add one around a post or the office to get enter and exit events in the
            Events view.
          </p>
        ) : (
          <div className="divide-y">
            {geofences.map((geofence) => {
              const circle = parseCircleArea(geofence.area);
              return (
                <div key={geofence.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {geofence.name}
                      {circle && isAtOffice(circle) && (
                        <Badge
                          variant="outline"
                          className="h-4 border-blue-200 bg-blue-50 px-1 text-[9px] text-blue-700"
                        >
                          reference centre
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {circle
                        ? `${circle.latitude.toFixed(5)}, ${circle.longitude.toFixed(5)} · ${Math.round(circle.radius)} m radius`
                        : geofence.area}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-red-600 hover:bg-red-50"
                    onClick={() => remove(geofence.id, geofence.name)}
                    disabled={deleteGeofence.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>New circular geofence</DialogTitle>
            <DialogDescription>
              Traccar will raise enter and exit events whenever a tracked device crosses this
              boundary.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
                placeholder="e.g. Head office, Post 12"
              />
            </Field>

            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() =>
                setForm((c) => ({
                  ...c,
                  name: c.name || HEAD_OFFICE.name,
                  latitude: String(HEAD_OFFICE.latitude),
                  longitude: String(HEAD_OFFICE.longitude),
                  radiusMeters: String(HEAD_OFFICE.radiusMetres),
                }))
              }
            >
              <Building className="mr-2 h-3.5 w-3.5" />
              Use head office coordinates
            </Button>

            {devicesWithPosition.length > 0 && (
              <Field label="Prefill from a device's last position">
                <Select
                  onValueChange={(value) => {
                    const entry = devicesWithPosition.find(
                      (item) => String(item.device.id) === value
                    );
                    if (entry?.position) {
                      setForm((c) => ({
                        ...c,
                        latitude: String(entry.position!.latitude),
                        longitude: String(entry.position!.longitude),
                      }));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a device" />
                  </SelectTrigger>
                  <SelectContent>
                    {devicesWithPosition.map(({ device }) => (
                      <SelectItem key={device.id} value={String(device.id)}>
                        {deviceLabel(device)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <div className="grid grid-cols-3 gap-3">
              <Field label="Latitude">
                <Input
                  value={form.latitude}
                  onChange={(event) => setForm((c) => ({ ...c, latitude: event.target.value }))}
                  placeholder="20.29610"
                />
              </Field>
              <Field label="Longitude">
                <Input
                  value={form.longitude}
                  onChange={(event) => setForm((c) => ({ ...c, longitude: event.target.value }))}
                  placeholder="85.82450"
                />
              </Field>
              <Field label="Radius (m)">
                <Input
                  type="number"
                  min={1}
                  value={form.radiusMeters}
                  onChange={(event) => setForm((c) => ({ ...c, radiusMeters: event.target.value }))}
                />
              </Field>
            </div>

            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Crosshair className="h-3 w-3" />
              Coordinates are decimal degrees, the same format shown on the live map.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={createGeofence.isPending}>
              {createGeofence.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create geofence
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
