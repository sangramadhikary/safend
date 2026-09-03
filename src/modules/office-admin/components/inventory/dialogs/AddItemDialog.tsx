'use client';

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useInventoryStore } from "../inventoryStore";
import {
  InventoryCategory, ToolType, SpecialItemType,
  UNIFORM_TYPES, getUniformSizeOptions, SUB_CATEGORY_LABELS, COLOR_OPTIONS,
} from "../types";
import {
  shouldPromptCapitalization,
  capitalizeInventoryItemAsAsset,
  CAPITALIZATION_THRESHOLD,
} from "@/services/inventory/capitalizeAsset";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: string;
}

const TOOL_TYPES: ToolType[] = [
  'walkie_talkie', 'torch', 'lathi', 'pepper_spray', 'metal_detector', 'uvs', 'baton', 'handcuffs', 'other_tool'
];
const SPECIAL_TYPES: SpecialItemType[] = [
  'event_uniform', 'decoration_kit', 'event_kit', 'ceremonial_item', 'other_special'
];

export function AddItemDialog({ open, onOpenChange, branch }: Props) {
  const addItem = useInventoryStore(s => s.addItem);
  const items = useInventoryStore(s => s.items);
  const [category, setCategory] = useState<InventoryCategory>('uniforms');
  const [subCategory, setSubCategory] = useState('');
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [currentStock, setCurrentStock] = useState(0);
  const [reorderLevel, setReorderLevel] = useState(3);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [location, setLocation] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('pcs');
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [capitalize, setCapitalize] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Whether this item qualifies for capitalization (durable tool over threshold)
  const canCapitalize = shouldPromptCapitalization(category, purchasePrice);

  // Reset form when dialog closes (fixes Bug 2: stale state on cancel)
  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const getSubCategories = () => {
    switch (category) {
      case 'uniforms': return UNIFORM_TYPES;
      case 'tools': return TOOL_TYPES;
      case 'special_items': return SPECIAL_TYPES;
    }
  };

  // Category change: clear ALL category-specific fields (fixes Bug 3)
  const handleCategoryChange = (v: string) => {
    setCategory(v as InventoryCategory);
    setSubCategory('');
    setSize('');
    setColor('');
    setBrand('');
    setModel('');
    setDuplicateWarning('');
  };

  // Duplicate detection (fixes Bug 6)
  const checkDuplicate = (newSubCat?: string, newSize?: string, newColor?: string) => {
    const sc = newSubCat ?? subCategory;
    const sz = newSize ?? size;
    const cl = newColor ?? color;

    if (!sc) { setDuplicateWarning(''); return; }

    const existing = items.find(item =>
      item.category === category &&
      item.subCategory === sc &&
      (category === 'uniforms' ? (item.size === sz && item.color === cl) : true) &&
      item.branch === branch
    );

    if (existing) {
      setDuplicateWarning(`An item with this combination already exists (Stock: ${existing.currentStock})`);
    } else {
      setDuplicateWarning('');
    }
  };

  // Validate all required fields per category (fixes Bug 1 & Bug 4)
  const isFormValid = (): boolean => {
    if (!name.trim() || !subCategory) return false;

    if (category === 'uniforms') {
      if (!size || !color) return false;
    }

    if (category === 'tools') {
      if (!brand.trim()) return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!isFormValid() || submitting) return;
    setSubmitting(true);

    // Enforce non-negative values (fixes Bug 5)
    const safeStock = Math.max(0, currentStock);
    const safeReorder = Math.max(0, reorderLevel);
    const safePrice = Math.max(0, purchasePrice);

    // Capitalize durable high-value tools into the Accounts fixed-asset register.
    let linkedAssetId: string | undefined;
    const willCapitalize = canCapitalize && capitalize;
    if (willCapitalize) {
      const assetId = await capitalizeInventoryItemAsAsset({
        name: name.trim(),
        unitPrice: safePrice,
        quantity: safeStock || 1,
        branchId: branch,
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
      });
      linkedAssetId = assetId || undefined;
    }

    addItem({
      name: name.trim(),
      category,
      subCategory: subCategory as any,
      size: size as any || undefined,
      color: color as any || undefined,
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      unitOfMeasure,
      currentStock: safeStock,
      reorderLevel: safeReorder,
      purchasePrice: safePrice || undefined,
      branch,
      location: location.trim() || undefined,
      capitalize: willCapitalize,
      linkedAssetId,
    });
    setSubmitting(false);
    onOpenChange(false);
  };

  const resetForm = () => {
    setCategory('uniforms');
    setName(''); setSubCategory(''); setSize(''); setColor('');
    setBrand(''); setModel(''); setCurrentStock(0); setReorderLevel(3);
    setPurchasePrice(0); setLocation(''); setUnitOfMeasure('pcs');
    setDuplicateWarning('');
    setCapitalize(true); setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Inventory Item</DialogTitle>
          <DialogDescription>
            Each unique combination of type + size + color is tracked as a separate item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Category */}
          <div className="space-y-2">
            <Label>Category *</Label>
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="uniforms">Uniforms</SelectItem>
                <SelectItem value="tools">Tools & Equipment</SelectItem>
                <SelectItem value="special_items">Special Items</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sub Category */}
          <div className="space-y-2">
            <Label>Type *</Label>
            <Select value={subCategory} onValueChange={(v) => { setSubCategory(v); setSize(''); checkDuplicate(v); }}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {getSubCategories().map(sc => (
                  <SelectItem key={sc} value={sc}>{SUB_CATEGORY_LABELS[sc]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label>Item Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Security Shirt - White L" />
          </div>

          {/* Dynamic type-specific fields */}
          {category === 'uniforms' && subCategory && (
            <div className="p-3 border rounded-lg bg-blue-50/50 dark:bg-blue-950/10 space-y-3">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                ⚡ Size & Color define a unique inventory item (e.g. Shirt White L ≠ Shirt White XL)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Size *</Label>
                  <Select value={size} onValueChange={(v) => { setSize(v); checkDuplicate(undefined, v); }}>
                    <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                    <SelectContent>
                      {getUniformSizeOptions(subCategory).map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Color *</Label>
                  <Select value={color} onValueChange={(v) => { setColor(v); checkDuplicate(undefined, undefined, v); }}>
                    <SelectTrigger><SelectValue placeholder="Select color" /></SelectTrigger>
                    <SelectContent>
                      {COLOR_OPTIONS.map(c => (
                        <SelectItem key={c.value} value={c.value}>
                          <span className="flex items-center gap-2">
                            <span aria-hidden className="h-3.5 w-3.5 rounded-full border shadow-sm" style={{ backgroundColor: c.hex }} />
                            {c.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {color && (() => {
                    const selected = COLOR_OPTIONS.find(option => option.value === color);
                    return selected ? (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span aria-hidden className="h-3 w-3 rounded-full border" style={{ backgroundColor: selected.hex }} />
                        Selected: {selected.label}
                      </p>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Tool-specific fields */}
          {category === 'tools' && (
            <div className="p-3 border rounded-lg bg-orange-50/50 dark:bg-orange-950/10 space-y-3">
              <p className="text-xs font-medium text-orange-700 dark:text-orange-400">
                ⚡ Brand & Model help identify specific equipment for tracking
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Brand *</Label>
                  <Input value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Motorola, Garrett" />
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. GP328, SuperScanner" />
                </div>
              </div>
            </div>
          )}

          {/* Duplicate warning */}
          {duplicateWarning && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                ⚠️ {duplicateWarning}
              </p>
            </div>
          )}

          {/* Stock info */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Current Stock</Label>
              <Input
                type="number"
                value={currentStock}
                onChange={e => setCurrentStock(Math.max(0, Number(e.target.value) || 0))}
                min={0}
              />
              <p className="text-[10px] text-muted-foreground">How many you have now</p>
            </div>
            <div className="space-y-2">
              <Label>Reorder Level</Label>
              <Input
                type="number"
                value={reorderLevel}
                onChange={e => setReorderLevel(Math.max(0, Number(e.target.value) || 0))}
                min={0}
              />
              <p className="text-[10px] text-muted-foreground">Alert when stock drops to this</p>
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={unitOfMeasure} onValueChange={setUnitOfMeasure}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pcs">Pieces</SelectItem>
                  <SelectItem value="pairs">Pairs</SelectItem>
                  <SelectItem value="sets">Sets</SelectItem>
                  <SelectItem value="kits">Kits</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Price & Location */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Purchase Price (₹)</Label>
              <Input
                type="number"
                value={purchasePrice}
                onChange={e => setPurchasePrice(Math.max(0, Number(e.target.value) || 0))}
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label>Storage Location</Label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Rack A1" />
            </div>
          </div>

          {/* Capitalization prompt — durable tools above the ₹5,000 unit threshold */}
          {canCapitalize && (
            <div className="p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/60 dark:bg-green-950/10 space-y-2">
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="capitalize"
                  checked={capitalize}
                  onCheckedChange={(v) => setCapitalize(v === true)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <Label htmlFor="capitalize" className="text-sm font-medium cursor-pointer">
                    Capitalize as Fixed Asset
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    This tool&apos;s unit price (₹{purchasePrice.toLocaleString('en-IN')}) exceeds the ₹{CAPITALIZATION_THRESHOLD.toLocaleString('en-IN')} threshold. It will also be recorded in the Accounts fixed-asset register (Plant &amp; Machinery, 15% WDV) for depreciation. Total capitalized: ₹{(purchasePrice * Math.max(1, currentStock)).toLocaleString('en-IN')}.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!isFormValid() || submitting}>
            {submitting ? 'Saving...' : (canCapitalize && capitalize ? 'Add & Capitalize' : 'Add Item')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
