'use client';

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, RotateCcw, AlertCircle, Eye } from "lucide-react";
import { useInventoryStore } from "../inventoryStore";
import { InventoryDistribution, CATEGORY_LABELS } from "../types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { format, isPast, differenceInDays } from "date-fns";

interface Props {
  branch: string;
}

export function EventKitsView({ branch }: Props) {
  const distributions = useInventoryStore(s => s.distributions);
  const returnStock = useInventoryStore(s => s.returnStock);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  // Get event distributions
  const eventDists = distributions.filter(
    d => d.branch === branch && d.targetType === 'event'
  );

  // Group by event
  const eventMap = new Map<string, {
    eventName: string; employeeName: string; startDate: string;
    endDate: string; items: InventoryDistribution[]
  }>();
  eventDists.forEach(d => {
    const key = `${d.eventName}-${d.targetId}`;
    if (!eventMap.has(key)) {
      eventMap.set(key, {
        eventName: d.eventName || 'Unknown Event',
        employeeName: d.targetName,
        startDate: d.eventStartDate || '',
        endDate: d.eventEndDate || '',
        items: []
      });
    }
    eventMap.get(key)!.items.push(d);
  });

  const events = Array.from(eventMap.entries());
  const selectedEventData = selectedEvent ? eventMap.get(selectedEvent) : null;

  const handleRecallAll = (eventKey: string) => {
    const data = eventMap.get(eventKey);
    if (!data) return;
    data.items.filter(i => i.status === 'active').forEach(item => {
      returnStock(item.id, item.quantity, 'good', 'Admin', `Event recall: ${data.eventName}`);
    });
  };

  const getEventStatus = (endDate: string, items: InventoryDistribution[]) => {
    const allReturned = items.every(i => i.status === 'returned');
    if (allReturned) return { label: 'Completed', variant: 'bg-green-100 text-green-800' };
    if (endDate && isPast(new Date(endDate))) {
      return { label: 'Overdue Recall', variant: 'bg-red-100 text-red-800' };
    }
    return { label: 'Active', variant: 'bg-blue-100 text-blue-800' };
  };

  return (
    <div className="space-y-4">
      {/* Overdue alert */}
      {events.some(([_, data]) => data.endDate && isPast(new Date(data.endDate)) && data.items.some(i => i.status === 'active')) && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md flex items-start gap-3">
          <AlertCircle className="text-red-600 mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h3 className="font-semibold text-red-800">Overdue Event Kit Returns</h3>
            <p className="text-red-700 text-sm">
              Some event kits have passed their return date. Please recall them immediately.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-purple-600" />
            Event Kit Allocations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Track special items (uniforms, decoration kits, etc.) allocated for events. Items must be recalled after the event ends.
          </p>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event Name</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Event Period</TableHead>
                  <TableHead className="text-center">Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No event kit allocations found
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map(([key, data]) => {
                    const status = getEventStatus(data.endDate, data.items);
                    const activeCount = data.items.filter(i => i.status === 'active').length;
                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <p className="font-medium">{data.eventName}</p>
                        </TableCell>
                        <TableCell>{data.employeeName}</TableCell>
                        <TableCell className="text-sm">
                          {data.startDate && format(new Date(data.startDate), 'dd MMM')} - {data.endDate && format(new Date(data.endDate), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{data.items.length} items</Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.variant}`}>
                            {status.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(key)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {activeCount > 0 && (
                              <Button variant="outline" size="sm" className="text-xs" onClick={() => handleRecallAll(key)}>
                                <RotateCcw className="h-3 w-3 mr-1" /> Recall
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Event Kit Details - {selectedEventData?.eventName}</DialogTitle>
            <DialogDescription>
              Assigned to: {selectedEventData?.employeeName} | Period: {selectedEventData?.startDate} to {selectedEventData?.endDate}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Return Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedEventData?.items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.itemName}</TableCell>
                    <TableCell className="text-sm">{CATEGORY_LABELS[item.itemCategory]}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === 'active' ? 'default' : item.status === 'returned' ? 'outline' : 'destructive'}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{item.returnedDate || item.expectedReturnDate || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
