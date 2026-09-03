'use client';

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Wrench, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInventoryStore } from "../inventoryStore";
import { SUB_CATEGORY_LABELS } from "../types";
import {
  CAPITALIZATION_THRESHOLD,
  shouldPromptCapitalization,
  capitalizeInventoryItemAsAsset,
} from "@/services/inventory/capitalizeAsset";

interface Props {
  branch: string;
  searchQuery: string;
}

/**
 * Asset Reconciliation — bridges Office-Admin inventory with the Accounts
 * fixed-asset register. Lists durable tools above the ₹5,000 capitalization
 * threshold and flags any that have NOT yet been capitalized, so nothing of
 * capital value is silently expensed. High-value items can be capitalized
 * retroactively from here.
 */
export function AssetReconciliationView({ branch, searchQuery }: Props) {
  const { toast } = useToast();
  const items = useInventoryStore(s => s.items);
  const updateItem = useInventoryStore(s => s.updateItem);
  const [capitalizingId, setCapitalizingId] = useState<string | null>(null);

  // Durable tools above the unit-price threshold that qualify for capitalization.
  const eligible = useMemo(() => {
    return items.filter(i =>
      i.branch === branch &&
      shouldPromptCapitalization(i.category, i.purchasePrice || 0) &&
      (!searchQuery ||
        i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (i.brand || '').toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [items, branch, searchQuery]);

  const capitalized = eligible.filter(i => i.capitalize && i.linkedAssetId);
  const pending = eligible.filter(i => !(i.capitalize && i.linkedAssetId));

  const pendingValue = pending.reduce((s, i) => s + (i.purchasePrice || 0) * Math.max(1, i.currentStock), 0);

  const handleCapitalize = async (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    setCapitalizingId(itemId);
    const assetId = await capitalizeInventoryItemAsAsset({
      name: item.name,
      unitPrice: item.purchasePrice || 0,
      quantity: item.currentStock || 1,
      branchId: item.branch,
      brand: item.brand,
      model: item.model,
    });
    if (assetId) {
      updateItem(itemId, { capitalize: true, linkedAssetId: assetId });
      toast({ title: "Capitalized", description: `${item.name} added to the fixed-asset register.` });
    } else {
      toast({ title: "Capitalization Failed", description: "Could not create the asset. Check the asset register is available.", variant: "destructive" });
    }
    setCapitalizingId(null);
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Awaiting Capitalization</p>
            <p className="text-2xl font-bold text-amber-600">{pending.length}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">₹{pendingValue.toLocaleString('en-IN')} of capital value not yet in the asset register</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Capitalized</p>
            <p className="text-2xl font-bold text-green-600">{capitalized.length}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Linked to the fixed-asset register</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Threshold</p>
            <p className="text-2xl font-bold">₹{CAPITALIZATION_THRESHOLD.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Tools above this unit price are capital assets</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending capitalization */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            High-Value Tools Awaiting Capitalization
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500 opacity-60" />
              <p className="text-sm">All high-value tools are capitalized. Nothing to reconcile.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Capital Value</TableHead>
                  <TableHead className="text-center w-[140px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map(item => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-orange-500" />
                        <span className="font-medium">{item.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{SUB_CATEGORY_LABELS[item.subCategory] || item.subCategory}</TableCell>
                    <TableCell className="text-right">₹{(item.purchasePrice || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-right">{item.currentStock}</TableCell>
                    <TableCell className="text-right font-semibold">₹{((item.purchasePrice || 0) * Math.max(1, item.currentStock)).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={capitalizingId === item.id}
                        onClick={() => handleCapitalize(item.id)}
                      >
                        {capitalizingId === item.id
                          ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Working</>
                          : 'Capitalize'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Already capitalized */}
      {capitalized.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Capitalized Items
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Capital Value</TableHead>
                  <TableHead>Asset Register</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {capitalized.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-sm">{SUB_CATEGORY_LABELS[item.subCategory] || item.subCategory}</TableCell>
                    <TableCell className="text-right font-semibold">₹{((item.purchasePrice || 0) * Math.max(1, item.currentStock)).toLocaleString('en-IN')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] border-green-400 text-green-700 dark:text-green-400">
                        Linked · {item.linkedAssetId?.slice(0, 8)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
