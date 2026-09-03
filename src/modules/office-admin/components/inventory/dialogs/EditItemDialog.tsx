'use client';

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore } from "../inventoryStore";
import { InventoryMasterItem, SUB_CATEGORY_LABELS, COLOR_OPTIONS, getUniformSizeOptions } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryMasterItem | null;
}

export function EditItemDialog({ open, onOpenChange, item }: Props) {
  const updateItem = useInventoryStore(s => s.updateItem);

  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [reorderLevel, setReorderLevel] = useState(3);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [location, setLocation] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('pcs');
  const [submitting, setSubmitting] = useState(false);

  // Populate form when item changes
  useEffect(() => {
    if (item) {
      setName(item.name);
      setSize(item.size || '');
      setColor(item.color || '');
      setBrand(item.brand || '');
      setModel(item.model || '');
      setReorderLevel(item.reorderLevel);
      setPurchasePrice(item.purchasePrice || 0);
      setLocation(item.location || '');
      setUnitOfMeasure(item.unitOfMeasure || 'pcs');
    }
  }, [item]);

  const isFormValid = () => {
    if (!name.trim()) return false;
    if (item?.category === 'uniforms' && (!size || !color)) return false;
    if (item?.category === 'tools' && !brand.trim()) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (!item || !isFormValid() || submitting) return;
    setSubmitting(true);
    const result = await updateItem(item.id, {
      name: name.trim(),
      size: size as any || undefined,
      color: color as any || undefined,
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      reorderLevel: Math.max(0, reorderLevel),
      purchasePrice: Math.max(0, purchasePrice) || undefined,
      location: location.trim() || undefined,
      unitOfMeasure,
    });
    setSubmitting(false);
    if (result.success) {
      onOpenChange(false);
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Item</DialogTitle>
          <DialogDescription>
            {item.itemCode} · {SUB_CATEGORY_LABELS[item.subCategory] || item.subCategory}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label>Item Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Item name" />
          </div>

          {/* Uniform size + color */}
          {item.category === 'uniforms' && (
            <div className="grid grid-cols-2 gap-3 p-3 border rounded-lg bg-blue-50/50 dark:bg-blue-950/10">
              <div className="space-y-2">
                <Label>Size *</Label>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                  <SelectContent>
                    {getUniformSizeOptions(item.subCategory).map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Color *</Label>
                <Select value={color} onValueChange={setColor}>
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
          )}

          {/* Tool brand + model */}
          {item.category === 'tools' && (
            <div className="grid grid-cols-2 gap-3 p-3 border rounded-lg bg-orange-50/50 dark:bg-orange-950/10">
              <div className="space-y-2">
                <Label>Brand *</Label>
                <Input value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Motorola" />
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. GP328" />
              </div>
            </div>
          )}

          {/* Reorder, Price, Unit, Location */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Reorder Level</Label>
              <Input
                type="number" min={0}
                value={reorderLevel}
                onChange={e => setReorderLevel(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-2">
              <Label>Purchase Price (₹)</Label>
              <Input
                type="number" min={0}
                value={purchasePrice}
                onChange={e => setPurchasePrice(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-2">
              <Label>Storage Location</Label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Rack A1" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isFormValid() || submitting}>
            {submitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
