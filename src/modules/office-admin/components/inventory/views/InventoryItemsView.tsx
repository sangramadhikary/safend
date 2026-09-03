'use client';

import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MoreHorizontal, Shirt, Wrench, Star, AlertTriangle,
  ChevronDown, ChevronRight, LayoutList, LayoutGrid,
  ShoppingBag, Footprints, Wind, HardHat, Layers,
  Radio, Flashlight, Zap, ScanLine, Siren, Lock,
  Sparkles, Box, Gift, Award, Package,
  ChevronsDownUp, ChevronsUpDown, Download, FilterX, Trash2, XCircle,
} from "lucide-react";
import { useInventoryStore } from "../inventoryStore";
import { InventoryMasterItem } from "../types";
import {
  exportItemsCsv, subCatLabel,
  isLowStock as isLow, isOutOfStock as isOut, isHealthyStock as isHealthy,
} from "../inventoryCsv";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EditItemDialog } from "../dialogs/EditItemDialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props { searchQuery: string; branch: string; }

/** Which stock health bucket to show. Replaces the old boolean "low stock only". */
type StockFilter = 'all' | 'in' | 'low' | 'out';

/** Ordering applied to categories in card view and rows in list view. */
type SortKey = 'problems' | 'name' | 'stock-asc' | 'stock-desc' | 'count-desc';

const SORT_LABELS: Record<SortKey, string> = {
  problems: 'Needs attention first',
  name: 'Name (A–Z)',
  'stock-asc': 'Stock: low to high',
  'stock-desc': 'Stock: high to low',
  'count-desc': 'Most items first',
};

// Stock health predicates come from ../inventoryCsv so the header count, the
// filter tabs, the per-category badges and the CSV status column share one
// definition. They used to disagree: the header counted `stock <= reorder`
// (which swallows out-of-stock) while the cards counted `stock <= reorder &&
// stock > 0`, so the banner number never matched the sum of the card badges.

function matchesStockFilter(item: InventoryMasterItem, filter: StockFilter): boolean {
  switch (filter) {
    case 'in': return isHealthy(item);
    case 'low': return isLow(item);
    case 'out': return isOut(item);
    default: return true;
  }
}

// ─── Per-subcategory icon + color config ─────────────────────────────────────
interface SubCatConfig {
  icon: React.ElementType;
  iconColor: string;
  badgeColor: string;
  headerBg: string;
}

const SUBCAT_CONFIG: Record<string, SubCatConfig> = {
  shirt:           { icon: Shirt,       iconColor: "text-sky-500",     badgeColor: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",           headerBg: "bg-sky-50/60 dark:bg-sky-950/20" },
  pant:            { icon: Layers,      iconColor: "text-indigo-500",  badgeColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300", headerBg: "bg-indigo-50/60 dark:bg-indigo-950/20" },
  safari:          { icon: Shirt,       iconColor: "text-teal-500",    badgeColor: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",         headerBg: "bg-teal-50/60 dark:bg-teal-950/20" },
  "t-shirt":       { icon: Shirt,       iconColor: "text-cyan-500",    badgeColor: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",         headerBg: "bg-cyan-50/60 dark:bg-cyan-950/20" },
  sweater:         { icon: Wind,        iconColor: "text-blue-400",    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",         headerBg: "bg-blue-50/60 dark:bg-blue-950/20" },
  jacket:          { icon: Wind,        iconColor: "text-blue-600",    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",         headerBg: "bg-blue-50/60 dark:bg-blue-950/20" },
  raincoat:        { icon: Wind,        iconColor: "text-blue-700",    badgeColor: "bg-blue-200 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",         headerBg: "bg-blue-100/40 dark:bg-blue-950/20" },
  cap:             { icon: HardHat,     iconColor: "text-amber-500",   badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",     headerBg: "bg-amber-50/60 dark:bg-amber-950/20" },
  shoes:           { icon: Footprints,  iconColor: "text-stone-500",   badgeColor: "bg-stone-100 text-stone-700 dark:bg-stone-900/40 dark:text-stone-300",     headerBg: "bg-stone-50/60 dark:bg-stone-950/20" },
  belt:            { icon: ShoppingBag, iconColor: "text-yellow-600",  badgeColor: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300", headerBg: "bg-yellow-50/60 dark:bg-yellow-950/20" },
  whistle:         { icon: Siren,       iconColor: "text-red-400",     badgeColor: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",             headerBg: "bg-red-50/60 dark:bg-red-950/20" },
  lanyard:         { icon: ShoppingBag, iconColor: "text-violet-500",  badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300", headerBg: "bg-violet-50/60 dark:bg-violet-950/20" },
  id_card_holder:  { icon: Gift,        iconColor: "text-pink-500",    badgeColor: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",         headerBg: "bg-pink-50/60 dark:bg-pink-950/20" },
  id_card_lanyard: { icon: ShoppingBag, iconColor: "text-fuchsia-500", badgeColor: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300", headerBg: "bg-fuchsia-50/60 dark:bg-fuchsia-950/20" },
  walkie_talkie:   { icon: Radio,       iconColor: "text-green-500",   badgeColor: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",     headerBg: "bg-green-50/60 dark:bg-green-950/20" },
  torch:           { icon: Flashlight,  iconColor: "text-yellow-500",  badgeColor: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300", headerBg: "bg-yellow-50/60 dark:bg-yellow-950/20" },
  lathi:           { icon: Zap,         iconColor: "text-orange-500",  badgeColor: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", headerBg: "bg-orange-50/60 dark:bg-orange-950/20" },
  pepper_spray:    { icon: Zap,         iconColor: "text-red-500",     badgeColor: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",             headerBg: "bg-red-50/60 dark:bg-red-950/20" },
  metal_detector:  { icon: ScanLine,    iconColor: "text-slate-500",   badgeColor: "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",     headerBg: "bg-slate-50/60 dark:bg-slate-950/20" },
  uvs:             { icon: ScanLine,    iconColor: "text-purple-500",  badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", headerBg: "bg-purple-50/60 dark:bg-purple-950/20" },
  baton:           { icon: Zap,         iconColor: "text-orange-600",  badgeColor: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200", headerBg: "bg-orange-100/40 dark:bg-orange-950/20" },
  handcuffs:       { icon: Lock,        iconColor: "text-zinc-500",    badgeColor: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300",         headerBg: "bg-zinc-50/60 dark:bg-zinc-950/20" },
  other_tool:      { icon: Wrench,      iconColor: "text-gray-500",    badgeColor: "bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300",         headerBg: "bg-gray-50/60 dark:bg-gray-950/20" },
  event_uniform:   { icon: Sparkles,    iconColor: "text-fuchsia-500", badgeColor: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300", headerBg: "bg-fuchsia-50/60 dark:bg-fuchsia-950/20" },
  decoration_kit:  { icon: Gift,        iconColor: "text-rose-500",    badgeColor: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",         headerBg: "bg-rose-50/60 dark:bg-rose-950/20" },
  event_kit:       { icon: Box,         iconColor: "text-indigo-400",  badgeColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300", headerBg: "bg-indigo-50/60 dark:bg-indigo-950/20" },
  ceremonial_item: { icon: Award,       iconColor: "text-amber-600",   badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",     headerBg: "bg-amber-50/60 dark:bg-amber-950/20" },
  other_special:   { icon: Star,        iconColor: "text-violet-500",  badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300", headerBg: "bg-violet-50/60 dark:bg-violet-950/20" },
};

const DEFAULT_CONFIG: SubCatConfig = {
  icon: Package, iconColor: "text-muted-foreground",
  badgeColor: "bg-muted text-muted-foreground", headerBg: "",
};

function getSubCatConfig(s: string): SubCatConfig { return SUBCAT_CONFIG[s] ?? DEFAULT_CONFIG; }

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ item }: { item: InventoryMasterItem }) {
  if (isOut(item)) return <Badge variant="destructive">Out of Stock</Badge>;
  if (isLow(item)) return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Low Stock</Badge>;
  return <Badge className="bg-green-600 hover:bg-green-600">In Stock</Badge>;
}

// ─── Actions dropdown (shared by both views) ──────────────────────────────────
function ItemActions({ item, onEdit, onDelete }: {
  item: InventoryMasterItem;
  onEdit: (i: InventoryMasterItem) => void;
  onDelete: (i: InventoryMasterItem) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${item.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(item)}>Edit Item</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600 focus:text-white focus:bg-red-600"
          onSelect={() => onDelete(item)}
        >Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Shared item rows (used inside a category card) ──────────────────────────
function ItemRows({ items, selectedIds, onToggleSelect, onEdit, onDelete }: {
  items: InventoryMasterItem[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onEdit: (i: InventoryMasterItem) => void;
  onDelete: (i: InventoryMasterItem) => void;
}) {
  return (
    <>
      {items.map(item => (
        <TableRow
          key={item.id}
          data-state={selectedIds.has(item.id) ? 'selected' : undefined}
          className={cn("text-sm", isOut(item) && "bg-red-50/40 dark:bg-red-950/10")}
        >
          <TableCell className="w-[40px]">
            <Checkbox
              checked={selectedIds.has(item.id)}
              onCheckedChange={() => onToggleSelect(item.id)}
              aria-label={`Select ${item.name}`}
            />
          </TableCell>
          <TableCell className="font-mono text-xs text-muted-foreground">{item.itemCode}</TableCell>
          <TableCell>
            <div className="flex items-center gap-1.5">
              <span className="font-medium">{item.name}</span>
              {item.capitalize && (
                <Badge variant="outline" className="text-[10px] border-green-400 text-green-700 dark:text-green-400" title="Recorded in the fixed-asset register for depreciation">
                  Fixed Asset
                </Badge>
              )}
            </div>
          </TableCell>
          <TableCell className="text-sm">{item.size || item.model || '—'}</TableCell>
          <TableCell className="text-sm capitalize">{item.color?.replace('_', ' ') || '—'}</TableCell>
          <TableCell className="text-right">
            <span className={cn(
              "font-medium tabular-nums",
              isOut(item) && "text-red-600 font-bold",
              isLow(item) && "text-amber-600 font-bold",
            )}>{item.currentStock}</span>
          </TableCell>
          <TableCell className="text-right text-muted-foreground tabular-nums">{item.reorderLevel}</TableCell>
          <TableCell><StatusBadge item={item} /></TableCell>
          <TableCell className="text-sm text-muted-foreground">{item.location || '—'}</TableCell>
          <TableCell className="text-center"><ItemActions item={item} onEdit={onEdit} onDelete={onDelete} /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

function ItemTableHead({ allSelected, someSelected, onToggleAll }: {
  allSelected: boolean; someSelected: boolean; onToggleAll: () => void;
}) {
  return (
    <TableHeader>
      <TableRow className="bg-muted/30">
        <TableHead className="w-[40px]">
          <Checkbox
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={onToggleAll}
            aria-label="Select all visible items"
          />
        </TableHead>
        <TableHead className="w-[110px] text-xs">Code</TableHead>
        <TableHead className="text-xs">Item Name</TableHead>
        <TableHead className="text-xs">Size/Model</TableHead>
        <TableHead className="text-xs">Color</TableHead>
        <TableHead className="text-right text-xs">Stock</TableHead>
        <TableHead className="text-right text-xs">Reorder</TableHead>
        <TableHead className="text-xs">Status</TableHead>
        <TableHead className="text-xs">Location</TableHead>
        <TableHead className="text-center w-[56px] text-xs">Actions</TableHead>
      </TableRow>
    </TableHeader>
  );
}

// ─── CARD VIEW: collapsible group card ───────────────────────────────────────
// `open` is now owned by the parent. It used to be local state seeded from
// `defaultOpen` and nudged by a `forceOpen` effect, which meant Expand All
// silently desynced from whatever the user had toggled by hand.
interface GroupCardProps {
  subCategory: string;
  items: InventoryMasterItem[];
  open: boolean;
  onToggle: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectMany: (ids: string[], select: boolean) => void;
  onEdit: (i: InventoryMasterItem) => void;
  onDelete: (i: InventoryMasterItem) => void;
}

function GroupCard({
  subCategory, items, open, onToggle,
  selectedIds, onToggleSelect, onToggleSelectMany, onEdit, onDelete,
}: GroupCardProps) {
  const cfg = getSubCatConfig(subCategory);
  const Icon = cfg.icon;

  const lowCount = items.filter(isLow).length;
  const outCount = items.filter(isOut).length;
  const totalStock = items.reduce((s, i) => s + i.currentStock, 0);
  const groupValue = items.reduce((s, i) => s + i.currentStock * (i.purchasePrice || 0), 0);

  const ids = items.map(i => i.id);
  const selectedHere = ids.filter(id => selectedIds.has(id)).length;
  const allSelected = selectedHere === ids.length && ids.length > 0;
  const someSelected = selectedHere > 0 && !allSelected;

  return (
    <Card className={cn(
      "overflow-hidden self-start w-full transition-shadow",
      open && "ring-1 ring-border shadow-xs",
      outCount > 0 && "border-red-200 dark:border-red-900/50",
    )}>
      <CardHeader className={cn("p-0", cfg.headerBg)}>
        {/* Real button so the card is keyboard reachable and announces its state */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="w-full text-left px-4 py-3 flex items-center justify-between gap-2 hover:bg-background/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn("p-1.5 rounded-md bg-background/70 shrink-0", cfg.iconColor)}>
              <Icon className="h-4 w-4" />
            </div>
            <span className="font-semibold text-sm truncate">{subCatLabel(subCategory)}</span>
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium shrink-0", cfg.badgeColor)}>
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Stock summary stays visible at every width — it used to be
                hidden below the sm breakpoint, which is exactly the context
                where the collapsed card had nothing else to say. */}
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Stock <strong className="text-foreground tabular-nums">{totalStock}</strong>
            </span>
            {lowCount > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-[10px] px-1.5 py-0">
                {lowCount} low
              </Badge>
            )}
            {outCount > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{outCount} out</Badge>
            )}
            {open
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>
      </CardHeader>

      {open && (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <ItemTableHead
                allSelected={allSelected}
                someSelected={someSelected}
                onToggleAll={() => onToggleSelectMany(ids, !allSelected)}
              />
              <TableBody>
                <ItemRows
                  items={items}
                  selectedIds={selectedIds}
                  onToggleSelect={onToggleSelect}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </TableBody>
            </Table>
          </div>
          {groupValue > 0 && (
            <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground flex justify-end">
              Category stock value:{' '}
              <strong className="text-foreground ml-1 tabular-nums">₹{Math.round(groupValue).toLocaleString('en-IN')}</strong>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── LIST VIEW: flat table ────────────────────────────────────────────────────
function ListView({ items, selectedIds, onToggleSelect, onToggleSelectMany, onEdit, onDelete }: {
  items: InventoryMasterItem[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectMany: (ids: string[], select: boolean) => void;
  onEdit: (i: InventoryMasterItem) => void;
  onDelete: (i: InventoryMasterItem) => void;
}) {
  const ids = items.map(i => i.id);
  const selectedHere = ids.filter(id => selectedIds.has(id)).length;
  const allSelected = selectedHere === ids.length && ids.length > 0;
  const someSelected = selectedHere > 0 && !allSelected;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="rounded-md overflow-x-auto">
          <Table>
            <ItemTableHead
              allSelected={allSelected}
              someSelected={someSelected}
              onToggleAll={() => onToggleSelectMany(ids, !allSelected)}
            />
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No inventory items found
                  </TableCell>
                </TableRow>
              ) : (
                <ItemRows
                  items={items}
                  selectedIds={selectedIds}
                  onToggleSelect={onToggleSelect}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────
export function InventoryItemsView({ searchQuery, branch }: Props) {
  const items = useInventoryStore(s => s.items);
  const deleteItem = useInventoryStore(s => s.deleteItem);

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('problems');
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editItem, setEditItem] = useState<InventoryMasterItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryMasterItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const branchItems = useMemo(() => items.filter(i => i.branch === branch), [items, branch]);

  // Branch-wide health counts — the single source for every badge on screen.
  const health = useMemo(() => ({
    low: branchItems.filter(isLow).length,
    out: branchItems.filter(isOut).length,
    inStock: branchItems.filter(isHealthy).length,
  }), [branchItems]);

  const trimmedQuery = searchQuery.trim().toLowerCase();

  const filteredItems = useMemo(() => branchItems.filter(item => {
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (!matchesStockFilter(item, stockFilter)) return false;
    if (!trimmedQuery) return true;
    // Widened from name/code/subCategory/brand — searching a size, colour or
    // shelf location is how stock actually gets looked up on the floor.
    return [
      item.name, item.itemCode, item.subCategory, subCatLabel(item.subCategory),
      item.brand, item.model, item.size, item.color?.replace('_', ' '),
      item.location, item.description,
    ].some(f => (f || '').toString().toLowerCase().includes(trimmedQuery));
  }), [branchItems, categoryFilter, stockFilter, trimmedQuery]);

  const sortItems = useCallback((list: InventoryMasterItem[]) => {
    const arr = [...list];
    switch (sortKey) {
      case 'name': return arr.sort((a, b) => a.name.localeCompare(b.name));
      case 'stock-asc': return arr.sort((a, b) => a.currentStock - b.currentStock);
      case 'stock-desc': return arr.sort((a, b) => b.currentStock - a.currentStock);
      case 'problems':
        // Out of stock, then low, then healthy; ties broken by name.
        return arr.sort((a, b) => {
          const rank = (i: InventoryMasterItem) => isOut(i) ? 0 : isLow(i) ? 1 : 2;
          return rank(a) - rank(b) || a.name.localeCompare(b.name);
        });
      default: return arr.sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [sortKey]);

  // Group into categories, sort items inside each, then order the groups.
  const groupEntries = useMemo(() => {
    const groups = filteredItems.reduce<Record<string, InventoryMasterItem[]>>((acc, item) => {
      (acc[item.subCategory] ||= []).push(item);
      return acc;
    }, {});

    const entries = Object.entries(groups).map(([k, v]) => [k, sortItems(v)] as [string, InventoryMasterItem[]]);

    const groupRank = (v: InventoryMasterItem[]) =>
      v.some(isOut) ? 0 : v.some(isLow) ? 1 : 2;

    switch (sortKey) {
      case 'count-desc':
        return entries.sort((a, b) => b[1].length - a[1].length || subCatLabel(a[0]).localeCompare(subCatLabel(b[0])));
      case 'stock-asc':
        return entries.sort((a, b) =>
          a[1].reduce((s, i) => s + i.currentStock, 0) - b[1].reduce((s, i) => s + i.currentStock, 0));
      case 'stock-desc':
        return entries.sort((a, b) =>
          b[1].reduce((s, i) => s + i.currentStock, 0) - a[1].reduce((s, i) => s + i.currentStock, 0));
      case 'problems':
        return entries.sort((a, b) => groupRank(a[1]) - groupRank(b[1]) || subCatLabel(a[0]).localeCompare(subCatLabel(b[0])));
      default:
        return entries.sort((a, b) => subCatLabel(a[0]).localeCompare(subCatLabel(b[0])));
    }
  }, [filteredItems, sortKey, sortItems]);

  const sortedFlatItems = useMemo(() => sortItems(filteredItems), [filteredItems, sortItems]);

  // A searching user wants to see the hits, not hunt for which card to open.
  // Groups auto-open while a query is active; manual toggles still win.
  const isSearching = trimmedQuery.length > 0;
  const isGroupOpen = useCallback((subCat: string) => {
    if (isSearching) return !manuallyExpanded.has(`closed:${subCat}`);
    return manuallyExpanded.has(subCat);
  }, [isSearching, manuallyExpanded]);

  const toggleGroup = useCallback((subCat: string) => {
    setManuallyExpanded(prev => {
      const next = new Set(prev);
      if (isSearching) {
        const closedKey = `closed:${subCat}`;
        next.has(closedKey) ? next.delete(closedKey) : next.add(closedKey);
      } else {
        next.has(subCat) ? next.delete(subCat) : next.add(subCat);
      }
      return next;
    });
  }, [isSearching]);

  const expandAll = () => setManuallyExpanded(new Set(groupEntries.map(([k]) => k)));
  const collapseAll = () => setManuallyExpanded(
    isSearching ? new Set(groupEntries.map(([k]) => `closed:${k}`)) : new Set()
  );
  const openCount = groupEntries.filter(([k]) => isGroupOpen(k)).length;
  const allOpen = groupEntries.length > 0 && openCount === groupEntries.length;

  // ─── Selection ───
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleSelectMany = useCallback((ids: string[], select: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => select ? next.add(id) : next.delete(id));
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedIds(new Set());

  const selectedItems = useMemo(
    () => filteredItems.filter(i => selectedIds.has(i.id)),
    [filteredItems, selectedIds]
  );

  // ─── Delete flows ───
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteItem(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (result.success) {
      toast({ title: 'Item deleted', description: `${deleteTarget.name} has been removed.` });
    } else {
      toast({ title: 'Delete failed', description: result.error || 'Could not delete item.', variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    const targets = [...selectedItems];
    const results = await Promise.all(targets.map(i => deleteItem(i.id)));
    setDeleting(false);
    setBulkDeleteOpen(false);
    const failed = results.filter(r => !r.success).length;
    const ok = results.length - failed;
    clearSelection();
    toast({
      title: failed ? 'Partially deleted' : 'Items deleted',
      description: failed
        ? `${ok} deleted, ${failed} failed.`
        : `${ok} item${ok === 1 ? '' : 's'} removed.`,
      variant: failed ? 'destructive' : undefined,
    });
  };

  const filtersActive = categoryFilter !== 'all' || stockFilter !== 'all' || isSearching;
  const clearFilters = () => { setCategoryFilter('all'); setStockFilter('all'); };

  return (
    <div className="space-y-3">
      {/* ── Filter + controls bar ── */}
      <Card className="sticky top-0 z-20 shadow-xs">
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Category */}
            <Tabs value={categoryFilter} onValueChange={v => { setCategoryFilter(v); clearSelection(); }}>
              <TabsList>
                <TabsTrigger value="all">All ({branchItems.length})</TabsTrigger>
                <TabsTrigger value="uniforms" className="flex items-center gap-1">
                  <Shirt className="h-3.5 w-3.5" /> Uniforms
                </TabsTrigger>
                <TabsTrigger value="tools" className="flex items-center gap-1">
                  <Wrench className="h-3.5 w-3.5" /> Tools
                </TabsTrigger>
                <TabsTrigger value="special_items" className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5" /> Special
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Stock health — replaces the single ambiguous "Low Stock Only"
                  switch with the three states people actually triage by. */}
              <Tabs value={stockFilter} onValueChange={v => setStockFilter(v as StockFilter)}>
                <TabsList className="h-9">
                  <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                  <TabsTrigger value="in" className="text-xs">
                    In stock <span className="ml-1 tabular-nums text-muted-foreground">{health.inStock}</span>
                  </TabsTrigger>
                  <TabsTrigger value="low" className="text-xs gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    Low <span className="tabular-nums text-muted-foreground">{health.low}</span>
                  </TabsTrigger>
                  <TabsTrigger value="out" className="text-xs gap-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    Out <span className="tabular-nums text-muted-foreground">{health.out}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Sort */}
              <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
                <SelectTrigger className="h-9 w-[185px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                    <SelectItem key={k} value={k} className="text-xs">{SORT_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Expand / collapse — an explicit action pair. The old switch
                  read as unlabeled and could not represent "some open". */}
              {viewMode === 'card' && groupEntries.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs"
                  onClick={allOpen ? collapseAll : expandAll}
                >
                  {allOpen
                    ? <><ChevronsDownUp className="h-3.5 w-3.5 mr-1" /> Collapse all</>
                    : <><ChevronsUpDown className="h-3.5 w-3.5 mr-1" /> Expand all</>}
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                onClick={() => exportItemsCsv(sortedFlatItems, branch)}
                disabled={sortedFlatItems.length === 0}
                title="Download the rows currently in view as CSV"
              >
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>

              {filtersActive && (
                <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={clearFilters}>
                  <FilterX className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              )}

              {/* View mode */}
              <div className="flex items-center rounded-md border overflow-hidden">
                <Button
                  variant="ghost" size="icon"
                  className={cn("h-9 w-9 rounded-none", viewMode === 'card' && "bg-muted")}
                  onClick={() => setViewMode('card')}
                  aria-pressed={viewMode === 'card'}
                  title="Grouped by category"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className={cn("h-9 w-9 rounded-none border-l", viewMode === 'list' && "bg-muted")}
                  onClick={() => setViewMode('list')}
                  aria-pressed={viewMode === 'list'}
                  title="Flat list"
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Bulk action bar — only present when there is a selection */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
              <span className="text-xs font-medium">
                {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'} selected
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm" className="h-8 text-xs"
                  onClick={() => exportItemsCsv(selectedItems, branch)}
                >
                  <Download className="h-3.5 w-3.5 mr-1" /> Export selected
                </Button>
                <Button
                  variant="destructive" size="sm" className="h-8 text-xs"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelection}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Content ── */}
      {filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Package className="h-8 w-8 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground">
              {filtersActive ? 'No items match the current filters.' : 'No inventory items yet.'}
            </p>
            {filtersActive && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <FilterX className="h-4 w-4 mr-1" /> Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        <ListView
          items={sortedFlatItems}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectMany={toggleSelectMany}
          onEdit={setEditItem}
          onDelete={setDeleteTarget}
        />
      ) : (
        // items-start stops an expanded card from stretching the collapsed
        // card beside it, which is what produced the ragged rows.
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start auto-rows-min">
          {groupEntries.map(([subCat, groupItems]) => (
            <GroupCard
              key={subCat}
              subCategory={subCat}
              items={groupItems}
              open={isGroupOpen(subCat)}
              onToggle={() => toggleGroup(subCat)}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectMany={toggleSelectMany}
              onEdit={setEditItem}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground flex-wrap">
        <p>
          Showing <strong className="text-foreground">{filteredItems.length}</strong> of {branchItems.length} items
          {viewMode === 'card' && groupEntries.length > 0 &&
            ` across ${groupEntries.length} ${groupEntries.length === 1 ? 'category' : 'categories'}`}
        </p>
        {(health.low > 0 || health.out > 0) && stockFilter === 'all' && (
          <p className="flex items-center gap-2">
            {health.out > 0 && (
              <button onClick={() => setStockFilter('out')} className="text-red-600 hover:underline font-medium">
                {health.out} out of stock
              </button>
            )}
            {health.low > 0 && (
              <button onClick={() => setStockFilter('low')} className="text-amber-600 hover:underline font-medium">
                {health.low} low
              </button>
            )}
          </p>
        )}
      </div>

      <EditItemDialog open={!!editItem} onOpenChange={o => { if (!o) setEditItem(null); }} item={editItem} />

      {/* Single delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong> ({deleteTarget?.itemCode}) and all associated stock records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the selected items and all their stock records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs space-y-1">
            {selectedItems.map(i => (
              <div key={i.id} className="flex justify-between gap-2">
                <span className="truncate">{i.name}</span>
                <span className="font-mono text-muted-foreground shrink-0">{i.itemCode}</span>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleBulkDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : `Delete ${selectedItems.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
