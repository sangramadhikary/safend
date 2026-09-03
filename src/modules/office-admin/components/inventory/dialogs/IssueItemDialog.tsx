'use client';

import { useState, useMemo, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, AlertTriangle, Search, UserPlus, MapPin, Info } from "lucide-react";
import { useInventoryStore } from "../inventoryStore";
import { DistributionTarget, SUB_CATEGORY_LABELS, CATEGORY_LABELS, COLOR_OPTIONS } from "../types";
import { subscribeToHREmployees, type HREmployee } from "@/services/supabase/HREmployeeService";
import { useOperationalPosts } from "@/modules/operations/hooks/useOperationalPosts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: string;
}

interface LineItem {
  id: string;
  itemId: string;
  quantity: number;
}

// ─── Employee Picker (same pattern as Deployments page) ──────────────────────

function calcAge(dob?: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function EmployeePicker({ employees, selectedId, onSelect, label, distributions }: {
  employees: HREmployee[];
  selectedId: string;
  onSelect: (empId: string) => void;
  label: string;
  distributions: any[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [hoveredEmpId, setHoveredEmpId] = useState<string | null>(null);

  const selected = employees.find(e => e.id === selectedId);

  // 500ms debounce — don't filter until user stops typing
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Pre-compute distribution history per employee for fast lookup
  const empDistributionMap = useMemo(() => {
    const map: Record<string, { count: number; lastDate: string; activeCount: number }> = {};
    for (const d of distributions) {
      if (d.targetType !== 'employee') continue;
      const entry = map[d.targetId] || { count: 0, lastDate: '', activeCount: 0 };
      entry.count++;
      if (d.status === 'active') entry.activeCount++;
      if (!entry.lastDate || d.issuedDate > entry.lastDate) entry.lastDate = d.issuedDate;
      map[d.targetId] = entry;
    }
    return map;
  }, [distributions]);

  // Only show results when user has typed something (don't render all 500+ on open)
  const filtered = useMemo(() => {
    const active = employees.filter(e => e.status === 'Active');
    if (!debouncedSearch.trim()) return []; // Show nothing until search
    const s = debouncedSearch.toLowerCase();
    return active.filter(emp =>
      emp.name.toLowerCase().includes(s) ||
      emp.employeeId.toLowerCase().includes(s) ||
      (emp.phone || '').includes(s) ||
      (emp.designation || '').toLowerCase().includes(s)
    ).slice(0, 20); // Cap at 20 results for performance
  }, [employees, debouncedSearch]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label} *</Label>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-start h-9 font-normal">
            {selected ? (
              <div className="flex items-center gap-2 truncate">
                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0 overflow-hidden flex items-center justify-center">
                  {selected.photoUrl ? (
                    <img src={selected.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-semibold text-muted-foreground">{selected.name.charAt(0)}</span>
                  )}
                </div>
                <span className="truncate text-sm">{selected.name}</span>
                <span className="text-xs text-muted-foreground font-mono">{selected.employeeId}</span>
              </div>
            ) : (
              <span className="text-muted-foreground flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5" /> Select {label.toLowerCase()}...
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0 z-201!" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name, ID, phone, designation..."
                className="h-8 pl-7 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <ScrollArea className="max-h-[320px]">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {debouncedSearch.trim()
                  ? 'No employees found'
                  : 'Type to search employees by name, ID, or phone'}
              </div>
            ) : (
              <div className="p-1">
                {filtered.map(emp => {
                  const age = calcAge(emp.dateOfBirth);
                  return (
                    <div
                      key={emp.id}
                      className="relative group flex items-start rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      onMouseEnter={() => setHoveredEmpId(emp.id || null)}
                      onMouseLeave={() => setHoveredEmpId(null)}
                    >
                      <button
                        className="flex-1 text-left px-2 py-2 flex items-start gap-2.5"
                        onClick={() => { onSelect(emp.id || ''); setOpen(false); setSearch(''); }}
                      >
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0 overflow-hidden flex items-center justify-center">
                          {emp.photoUrl ? (
                            <img src={emp.photoUrl} alt={emp.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-sm font-semibold text-muted-foreground dark:text-gray-400">
                              {emp.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-xs truncate">{emp.name}</span>
                            {emp.gender && (
                              <span className="text-[10px] text-muted-foreground">{emp.gender === 'male' ? '♂' : emp.gender === 'female' ? '♀' : '⚧'}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            <span className="font-mono">{emp.employeeId}</span>
                            {emp.designation && <span>· {emp.designation}</span>}
                            {age && <span>· {age}yr</span>}
                          </div>
                          {/* Previous issuance history */}
                          {empDistributionMap[emp.id || ''] && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-[9px] font-medium text-amber-700 dark:text-amber-400">
                                {empDistributionMap[emp.id || ''].activeCount > 0
                                  ? `${empDistributionMap[emp.id || ''].activeCount} active`
                                  : `${empDistributionMap[emp.id || ''].count} issued`}
                              </span>
                              <span className="text-[9px] text-muted-foreground">
                                Last: {new Date(empDistributionMap[emp.id || ''].lastDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Hover detail card */}
                      {hoveredEmpId === emp.id && (
                        <div className="absolute left-full top-0 ml-2 z-100 w-56 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border rounded-xl shadow-2xl p-3 text-xs pointer-events-none">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex items-center justify-center shrink-0">
                              {emp.photoUrl
                                ? <img src={emp.photoUrl} alt="" className="w-full h-full object-cover" />
                                : <span className="text-base font-bold text-muted-foreground">{emp.name.charAt(0)}</span>
                              }
                            </div>
                            <div>
                              <p className="font-bold text-sm leading-tight">{emp.name}</p>
                              <p className="text-muted-foreground font-mono">{emp.employeeId}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <div><p className="text-muted-foreground">Designation</p><p className="font-medium">{emp.designation || '—'}</p></div>
                            <div><p className="text-muted-foreground">Gender</p><p className="font-medium capitalize">{emp.gender || '—'}</p></div>
                            <div><p className="text-muted-foreground">Age</p><p className="font-medium">{age ? `${age} yr` : '—'}</p></div>
                            <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{emp.phone || '—'}</p></div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Post Picker ─────────────────────────────────────────────────────────────

function PostPicker({ posts, selectedId, onSelect, loading }: {
  posts: { id: string; post_name: string }[];
  selectedId: string;
  onSelect: (postId: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = posts.find(p => p.id === selectedId);

  const filtered = useMemo(() => {
    if (!search.trim()) return posts;
    const s = search.toLowerCase();
    return posts.filter(p => p.post_name.toLowerCase().includes(s));
  }, [posts, search]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Select Post/Site *</Label>
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-start h-9 font-normal">
            {selected ? (
              <span className="flex items-center gap-1.5 truncate">
                <MapPin className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <span className="truncate text-sm">{selected.post_name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Select post/site...
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[380px] p-0 z-201!" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search post name..."
                className="h-8 pl-7 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <ScrollArea className="max-h-[280px]">
            {loading ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Loading posts...</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">No posts found</div>
            ) : (
              <div className="p-1">
                {filtered.map(post => (
                  <button
                    key={post.id}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
                    onClick={() => { onSelect(post.id); setOpen(false); setSearch(''); }}
                  >
                    <MapPin className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    <span className="text-sm">{post.post_name}</span>
                    {selectedId === post.id && <Badge variant="outline" className="ml-auto text-[10px]">Selected</Badge>}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Main Dialog ─────────────────────────────────────────────────────────────

export function IssueItemDialog({ open, onOpenChange, branch }: Props) {
  const items = useInventoryStore(s => s.items);
  const distributions = useInventoryStore(s => s.distributions);
  const issueStock = useInventoryStore(s => s.issueStock);

  // Employees & Posts
  const [employees, setEmployees] = useState<HREmployee[]>([]);
  const { posts, isLoading: loadingPosts } = useOperationalPosts();

  // Target selection
  const [targetType, setTargetType] = useState<DistributionTarget>('employee');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedPostId, setSelectedPostId] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [eventEmployeeId, setEventEmployeeId] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');

  // Items
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [notes, setNotes] = useState('');

  const availableItems = items.filter(i => i.branch === branch && i.currentStock > 0);

  // Subscribe to employees
  useEffect(() => {
    if (!open) return;
    const unsub = subscribeToHREmployees((hr) => setEmployees(hr));
    return () => unsub();
  }, [open]);

  // Derived
  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);
  const selectedPost = posts.find(p => p.id === selectedPostId);
  const supervisorEmployee = employees.find(e => e.id === supervisorId);
  const eventEmployee = employees.find(e => e.id === eventEmployeeId);

  const targetName = useMemo(() => {
    if (targetType === 'employee') return selectedEmployee?.name || '';
    if (targetType === 'post') return selectedPost?.post_name || '';
    if (targetType === 'event') return eventEmployee?.name || '';
    return '';
  }, [targetType, selectedEmployee, selectedPost, eventEmployee]);

  const targetId = useMemo(() => {
    if (targetType === 'employee') return selectedEmployeeId;
    if (targetType === 'post') return selectedPostId;
    if (targetType === 'event') return eventEmployeeId;
    return '';
  }, [targetType, selectedEmployeeId, selectedPostId, eventEmployeeId]);

  // Previously distributed items to this target
  const previouslyDistributed = useMemo(() => {
    if (!targetId) return new Set<string>();
    return new Set(
      distributions
        .filter(d => d.branch === branch && d.targetType === targetType && d.status === 'active' && d.targetId === targetId)
        .map(d => d.itemId)
    );
  }, [distributions, branch, targetType, targetId]);

  const addLineItem = () => {
    setLineItems(prev => [...prev, { id: crypto.randomUUID(), itemId: '', quantity: 1 }]);
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => prev.map(li => li.id === id ? { ...li, [field]: value } : li));
  };

  const removeLineItem = (id: string) => {
    setLineItems(prev => prev.filter(li => li.id !== id));
  };

  const getItemStock = (itemId: string) => items.find(i => i.id === itemId)?.currentStock || 0;

  const isTargetValid = () => {
    if (targetType === 'employee') return !!selectedEmployeeId;
    if (targetType === 'post') return !!selectedPostId && !!supervisorId;
    if (targetType === 'event') return !!eventEmployeeId && !!eventName;
    return false;
  };

  const canSubmit = () => {
    if (!isTargetValid()) return false;
    if (lineItems.length === 0) return false;
    return lineItems.every(li => li.itemId && li.quantity > 0 && li.quantity <= getItemStock(li.itemId));
  };

  const handleSubmit = () => {
    if (!canSubmit()) return;
    lineItems.forEach(li => {
      issueStock(li.itemId, li.quantity, {
        type: targetType,
        id: targetId,
        name: targetName,
        supervisorId: supervisorId || undefined,
        supervisorName: supervisorEmployee?.name || undefined,
        eventName: eventName || undefined,
        eventStartDate: eventStartDate || undefined,
        eventEndDate: eventEndDate || undefined,
      }, 'Admin', notes || undefined);
    });
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setTargetType('employee'); setSelectedEmployeeId(''); setSelectedPostId('');
    setSupervisorId(''); setEventEmployeeId('');
    setEventName(''); setEventStartDate(''); setEventEndDate('');
    setLineItems([]); setNotes('');
  };

  // Build item display label with size/color/type details
  const getItemLabel = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return '';
    let label = item.name;
    const details: string[] = [];
    if (item.size) details.push(`Size: ${item.size}`);
    if (item.color) details.push(COLOR_OPTIONS.find(c => c.value === item.color)?.label || item.color.replace('_', ' '));
    if (item.brand) details.push(item.brand);
    if (item.model) details.push(item.model);
    return details.length > 0 ? `${label} [${details.join(' | ')}]` : label;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Issue Inventory Items</DialogTitle>
          <DialogDescription>
            Select who to issue to, then add items with their specific size/color/type.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ─── SECTION 1: Target ─── */}
          <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
            <h3 className="text-sm font-semibold">1. Issue To</h3>

            <div className="space-y-1.5">
              <Label className="text-xs">Type *</Label>
              <Select value={targetType} onValueChange={v => { setTargetType(v as DistributionTarget); setSelectedEmployeeId(''); setSelectedPostId(''); setSupervisorId(''); setEventEmployeeId(''); }}>
                <SelectTrigger className="h-9 w-full md:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="post">Post / Site</SelectItem>
                  <SelectItem value="event">Event (Temporary)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Employee */}
            {targetType === 'employee' && (
              <EmployeePicker employees={employees} selectedId={selectedEmployeeId} onSelect={setSelectedEmployeeId} label="Employee" distributions={distributions} />
            )}

            {/* Post */}
            {targetType === 'post' && (
              <div className="space-y-3">
                <PostPicker posts={posts} selectedId={selectedPostId} onSelect={setSelectedPostId} loading={loadingPosts} />
                <EmployeePicker employees={employees} selectedId={supervisorId} onSelect={setSupervisorId} label="Supervisor (Responsible)" distributions={distributions} />
              </div>
            )}

            {/* Event */}
            {targetType === 'event' && (
              <div className="space-y-3">
                <EmployeePicker employees={employees} selectedId={eventEmployeeId} onSelect={setEventEmployeeId} label="Assign To (Employee)" distributions={distributions} />
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Event Name *</Label>
                    <Input className="h-9" value={eventName} onChange={e => setEventName(e.target.value)} placeholder="Corporate Annual Day" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Start Date</Label>
                    <Input className="h-9" type="date" value={eventStartDate} onChange={e => setEventStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">End Date (Return By)</Label>
                    <Input className="h-9" type="date" value={eventEndDate} onChange={e => setEventEndDate(e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── SECTION 2: Items ─── */}
          <div className="space-y-3 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">2. Items to Issue</h3>
              <Button variant="outline" size="sm" onClick={addLineItem} disabled={!isTargetValid()}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
              </Button>
            </div>

            {!isTargetValid() && (
              <p className="text-xs text-muted-foreground">Complete the target selection above first.</p>
            )}

            {lineItems.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50%]">Item (with Size / Color / Type)</TableHead>
                      <TableHead className="w-[10%] text-center">Stock</TableHead>
                      <TableHead className="w-[12%] text-center">Qty</TableHead>
                      <TableHead className="w-[18%]">Status</TableHead>
                      <TableHead className="w-[10%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((li) => {
                      const selectedItem = items.find(i => i.id === li.itemId);
                      const alreadyIssued = li.itemId && previouslyDistributed.has(li.itemId);
                      return (
                        <TableRow key={li.id} className={alreadyIssued ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                          <TableCell>
                            <Select value={li.itemId} onValueChange={v => updateLineItem(li.id, 'itemId', v)}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Select item..." />
                              </SelectTrigger>
                              <SelectContent className="max-h-[300px]">
                                {/* Group by category */}
                                {(['uniforms', 'tools', 'special_items'] as const).map(cat => {
                                  const catItems = availableItems.filter(i => i.category === cat);
                                  if (catItems.length === 0) return null;
                                  return (
                                    <div key={cat}>
                                      <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50">
                                        {CATEGORY_LABELS[cat]}
                                      </div>
                                      {catItems.map(item => (
                                        <SelectItem key={item.id} value={item.id}>
                                          <div className="flex items-center gap-2">
                                            <span className="font-medium">{item.name}</span>
                                            <span className="text-muted-foreground text-[10px]">
                                              {[
                                                item.size && `Size:${item.size}`,
                                                item.color && COLOR_OPTIONS.find(c => c.value === item.color)?.label,
                                                item.brand,
                                              ].filter(Boolean).join(' · ')}
                                            </span>
                                            <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1">
                                              {item.currentStock} {item.unitOfMeasure}
                                            </Badge>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </div>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            {/* Show item details below */}
                            {selectedItem && (
                              <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                                <span>{SUB_CATEGORY_LABELS[selectedItem.subCategory]}</span>
                                {selectedItem.size && <Badge variant="outline" className="h-4 px-1 text-[9px]">Size: {selectedItem.size}</Badge>}
                                {selectedItem.color && <Badge variant="outline" className="h-4 px-1 text-[9px] capitalize">{selectedItem.color.replace('_', ' ')}</Badge>}
                                {selectedItem.brand && <span>· {selectedItem.brand} {selectedItem.model || ''}</span>}
                              </div>
                            )}
                            {alreadyIssued && (
                              <div className="flex items-center gap-1 mt-1">
                                <AlertTriangle className="h-3 w-3 text-amber-600" />
                                <span className="text-[10px] text-amber-700 font-medium">Already issued to this {targetType}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {selectedItem ? selectedItem.currentStock : '—'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number" className="h-8 w-16 mx-auto text-center text-xs"
                              value={li.quantity}
                              onChange={e => updateLineItem(li.id, 'quantity', Number(e.target.value) || 1)}
                              min={1} max={selectedItem?.currentStock || 1}
                            />
                          </TableCell>
                          <TableCell>
                            {alreadyIssued ? (
                              <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">Duplicate</Badge>
                            ) : li.itemId ? (
                              <Badge variant="outline" className="text-[10px] border-green-400 text-green-700">New</Badge>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLineItem(li.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {lineItems.length === 0 && isTargetValid() && (
              <div className="text-center py-6 text-muted-foreground text-sm border rounded-md border-dashed">
                Click "Add Item" to start adding inventory items to issue
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any additional notes..." className="resize-none" rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit()}>
            Issue {lineItems.length > 0 ? `${lineItems.length} Item(s)` : 'Items'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
