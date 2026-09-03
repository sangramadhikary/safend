'use client';

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, MapPin, Calendar, Eye, RotateCcw, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore } from "../inventoryStore";
import { InventoryDistribution, CATEGORY_LABELS } from "../types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { format, isPast } from "date-fns";

interface Props {
  branch: string;
  searchQuery: string;
}

export function DistributionTrackingView({ branch, searchQuery }: Props) {
  const distributions = useInventoryStore(s => s.distributions);
  const returnStock = useInventoryStore(s => s.returnStock);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedDetail, setSelectedDetail] = useState<InventoryDistribution | null>(null);

  const branchDists = distributions.filter(d => d.branch === branch);

  const filtered = branchDists.filter(d => {
    if (filterType !== "all" && d.targetType !== filterType) return false;
    if (filterStatus === "active" && d.status !== "active") return false;
    if (filterStatus === "returned" && d.status !== "returned") return false;
    if (filterStatus === "overdue") {
      if (!d.expectedReturnDate || d.status !== "active") return false;
      if (!isPast(new Date(d.expectedReturnDate))) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        d.targetName.toLowerCase().includes(q) ||
        d.itemName.toLowerCase().includes(q) ||
        d.distributionCode.toLowerCase().includes(q) ||
        (d.eventName || '').toLowerCase().includes(q) ||
        (d.supervisorName || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const overdueCount = branchDists.filter(
    d => d.status === 'active' && d.expectedReturnDate && isPast(new Date(d.expectedReturnDate))
  ).length;

  const getTargetIcon = (type: string) => {
    switch (type) {
      case 'employee': return <Users className="h-3.5 w-3.5 text-blue-500" />;
      case 'post': return <MapPin className="h-3.5 w-3.5 text-green-600" />;
      case 'event': return <Calendar className="h-3.5 w-3.5 text-purple-600" />;
      default: return null;
    }
  };

  const getStatusBadge = (d: InventoryDistribution) => {
    if (d.status === 'returned') return <Badge variant="outline">Returned</Badge>;
    if (d.status === 'lost') return <Badge variant="destructive">Lost</Badge>;
    if (d.status === 'damaged') return <Badge variant="destructive">Damaged</Badge>;
    if (d.expectedReturnDate && isPast(new Date(d.expectedReturnDate))) {
      return <Badge variant="destructive">Overdue</Badge>;
    }
    return <Badge className="bg-blue-600">Active</Badge>;
  };

  const handleReturn = (dist: InventoryDistribution) => {
    returnStock(dist.id, dist.quantity, 'good', 'Admin', `Returned from ${dist.targetType}`);
  };

  return (
    <div className="space-y-4">
      {/* Overdue alert */}
      {overdueCount > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-3">
          <AlertCircle className="text-red-600 h-5 w-5 shrink-0" />
          <p className="text-red-800 text-sm font-medium">
            {overdueCount} item(s) are overdue for return. Please recall immediately.
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="text-lg">Distribution & Tracking</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="post">Post/Site</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Code</TableHead>
                  <TableHead>Issued To</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Return By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No distribution records found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.distributionCode}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {getTargetIcon(d.targetType)}
                          <div>
                            <p className="font-medium text-sm">{d.targetName}</p>
                            {d.targetType === 'post' && d.supervisorName && (
                              <p className="text-xs text-muted-foreground">Supervisor: {d.supervisorName}</p>
                            )}
                            {d.targetType === 'event' && d.eventName && (
                              <p className="text-xs text-muted-foreground">{d.eventName}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="capitalize text-xs px-1.5 py-0.5 rounded bg-muted">{d.targetType}</span>
                      </TableCell>
                      <TableCell className="text-sm">{d.itemName}</TableCell>
                      <TableCell className="text-center font-medium">{d.quantity}</TableCell>
                      <TableCell className="text-sm">{d.issuedDate}</TableCell>
                      <TableCell className="text-sm">{d.expectedReturnDate || '—'}</TableCell>
                      <TableCell>{getStatusBadge(d)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedDetail(d)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {d.status === 'active' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleReturn(d)}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Showing {filtered.length} of {branchDists.length} records
          </p>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedDetail} onOpenChange={() => setSelectedDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Distribution Details</DialogTitle>
            <DialogDescription>{selectedDetail?.distributionCode}</DialogDescription>
          </DialogHeader>
          {selectedDetail && (
            <div className="space-y-3 text-sm mt-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-muted-foreground">Item</p>
                  <p className="font-medium">{selectedDetail.itemName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Category</p>
                  <p>{CATEGORY_LABELS[selectedDetail.itemCategory]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Quantity</p>
                  <p className="font-medium">{selectedDetail.quantity}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Condition</p>
                  <p className="capitalize">{selectedDetail.condition}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Issued To</p>
                  <p className="font-medium">{selectedDetail.targetName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="capitalize">{selectedDetail.targetType}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Issued Date</p>
                  <p>{selectedDetail.issuedDate}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Issued By</p>
                  <p>{selectedDetail.issuedBy}</p>
                </div>
                {selectedDetail.supervisorName && (
                  <div>
                    <p className="text-muted-foreground">Supervisor</p>
                    <p>{selectedDetail.supervisorName}</p>
                  </div>
                )}
                {selectedDetail.eventName && (
                  <div>
                    <p className="text-muted-foreground">Event</p>
                    <p>{selectedDetail.eventName}</p>
                  </div>
                )}
                {selectedDetail.expectedReturnDate && (
                  <div>
                    <p className="text-muted-foreground">Return By</p>
                    <p>{selectedDetail.expectedReturnDate}</p>
                  </div>
                )}
                {selectedDetail.returnedDate && (
                  <div>
                    <p className="text-muted-foreground">Returned</p>
                    <p>{selectedDetail.returnedDate}</p>
                  </div>
                )}
              </div>
              {selectedDetail.notes && (
                <div>
                  <p className="text-muted-foreground">Notes</p>
                  <p>{selectedDetail.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
