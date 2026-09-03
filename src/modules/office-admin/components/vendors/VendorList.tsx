'use client';

import { useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  StarIcon, Phone, Mail, MoreVertical, Edit, Trash2, Building2,
  Globe, Package, Home, Wrench, Truck, MapPin, Store,
} from "lucide-react";
import { useVendorStore } from "./vendorStore";
import { Vendor, VENDOR_CATEGORY_LABELS, VendorCategory } from "./types";
import { useToast } from "@/hooks/use-toast";
import { LoadingAnimation } from "@/components/ui/loading-animation";

interface VendorListProps {
  searchQuery: string;
  onEdit: (vendorId: string) => void;
}

const CATEGORY_ICONS: Record<VendorCategory, React.ReactNode> = {
  digital_services: <Globe className="h-4 w-4" />,
  inventory_restock: <Package className="h-4 w-4" />,
  property_owner: <Home className="h-4 w-4" />,
  equipment_supplier: <Package className="h-4 w-4" />,
  uniform_supplier: <Package className="h-4 w-4" />,
  maintenance_services: <Wrench className="h-4 w-4" />,
  transport: <Truck className="h-4 w-4" />,
  food_catering: <Building2 className="h-4 w-4" />,
  stationery: <Package className="h-4 w-4" />,
  utilities: <Building2 className="h-4 w-4" />,
  other: <Building2 className="h-4 w-4" />,
};

export function VendorList({ searchQuery, onEdit }: VendorListProps) {
  const { vendors, isLoadingVendors, deleteVendor } = useVendorStore();
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredVendors = vendors.filter(vendor =>
    vendor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    vendor.contact_person.toLowerCase().includes(searchQuery.toLowerCase()) ||
    vendor.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (vendor.city || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    vendor.vendor_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Property owners are surfaced in the dedicated card section above the table.
  // Keeping them in the table too creates a confusing double-listing, so the
  // table shows only non-property-owner vendors.
  const tableVendors = filteredVendors.filter(v => v.category !== 'property_owner');

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    const result = await deleteVendor(deleteId);
    setIsDeleting(false);
    setDeleteId(null);

    if (result.success) {
      toast({ title: "Vendor Deleted", description: "Vendor has been removed successfully." });
    } else {
      toast({ title: "Error", description: result.error || "Failed to delete vendor", variant: "destructive" });
    }
  };

  const renderRating = (rating: number) => {
    const stars = [];
    for (let i = 0; i < 5; i++) {
      stars.push(
        <StarIcon
          key={i}
          className={`h-3.5 w-3.5 ${i < Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
        />
      );
    }
    return <div className="flex gap-0.5">{stars}</div>;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100/80">Active</Badge>;
      case 'inactive':
        return <Badge variant="secondary">Inactive</Badge>;
      case 'blacklisted':
        return <Badge variant="destructive">Blacklisted</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoadingVendors) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingAnimation size="md" />
      </div>
    );
  }

  if (vendors.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Store className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Vendors Yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Add your first vendor to start managing suppliers, service providers, and property owners.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* ── Property Owners quick-reference section ───────────────────────────
          When property_owner vendors exist, surface them here so the team can
          see all landlords at a glance without scrolling the full vendor table.
          Each card links to the full vendor entry via the onEdit callback.     */}
      {filteredVendors.some(v => v.category === 'property_owner') && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50/40">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-3">
              <Home className="h-4 w-4 text-emerald-700" />
              <span className="text-sm font-semibold text-emerald-800">Property Owners</span>
              <span className="text-xs text-emerald-600 ml-1">
                ({filteredVendors.filter(v => v.category === 'property_owner').length})
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredVendors
                .filter(v => v.category === 'property_owner')
                .map(vendor => (
                  <div
                    key={vendor.id}
                    className="rounded-lg border border-emerald-200 bg-white px-3 py-2.5 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium leading-tight">{vendor.name}</p>
                        <p className="text-xs text-muted-foreground">{vendor.contact_person}</p>
                      </div>
                      {getStatusBadge(vendor.status)}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />{vendor.phone}
                    </div>
                    {(vendor.rent_amount != null && vendor.rent_amount > 0) && (
                      <p className="text-xs text-emerald-700 font-medium">
                        ₹{vendor.rent_amount.toLocaleString('en-IN')}/month
                        {vendor.property_type ? ` · ${vendor.property_type}` : ''}
                      </p>
                    )}
                    {(vendor.lease_start || vendor.lease_end) && (
                      <p className="text-xs text-muted-foreground">
                        Lease: {vendor.lease_start || '?'} → {vendor.lease_end || 'open'}
                      </p>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2 text-blue-600 hover:text-blue-700 -ml-2"
                      onClick={() => onEdit(vendor.id)}
                    >
                      Edit vendor →
                    </Button>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[200px]">Vendor</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-center">Rating</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableVendors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No vendors match your search
                    </TableCell>
                  </TableRow>
                ) : (
                  tableVendors.map((vendor) => (
                    <TableRow key={vendor.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="font-medium">{vendor.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{vendor.vendor_code}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            {CATEGORY_ICONS[vendor.category]}
                          </span>
                          <span className="text-sm">{VENDOR_CATEGORY_LABELS[vendor.category]}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm font-medium">{vendor.contact_person}</div>
                          <div className="flex items-center text-xs text-muted-foreground gap-1">
                            <Phone className="h-3 w-3" />
                            {vendor.phone}
                          </div>
                          {vendor.email && (
                            <div className="flex items-center text-xs text-muted-foreground gap-1">
                              <Mail className="h-3 w-3" />
                              {vendor.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {vendor.city ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {vendor.city}{vendor.state ? `, ${vendor.state}` : ''}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {renderRating(vendor.rating)}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(vendor.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEdit(vendor.id)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Vendor
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setDeleteId(vendor.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Vendor
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the vendor
              and remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


