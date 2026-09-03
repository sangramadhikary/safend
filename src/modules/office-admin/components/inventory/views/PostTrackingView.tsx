'use client';

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Eye, RotateCcw } from "lucide-react";
import { useInventoryStore } from "../inventoryStore";
import { InventoryDistribution, CATEGORY_LABELS } from "../types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";

interface Props {
  branch: string;
  searchQuery: string;
}

export function PostTrackingView({ branch, searchQuery }: Props) {
  const distributions = useInventoryStore(s => s.distributions);
  const returnStock = useInventoryStore(s => s.returnStock);
  const [selectedPost, setSelectedPost] = useState<string | null>(null);

  // Get post distributions
  const postDists = distributions.filter(
    d => d.branch === branch && d.targetType === 'post'
  );

  // Group by post
  const postMap = new Map<string, {
    name: string; supervisorName: string; items: InventoryDistribution[]
  }>();
  postDists.forEach(d => {
    if (!postMap.has(d.targetId)) {
      postMap.set(d.targetId, {
        name: d.targetName,
        supervisorName: d.supervisorName || 'N/A',
        items: []
      });
    }
    postMap.get(d.targetId)!.items.push(d);
  });

  const posts = Array.from(postMap.entries()).filter(([_, data]) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return data.name.toLowerCase().includes(q) || data.supervisorName.toLowerCase().includes(q);
  });

  const selectedPostData = selectedPost ? postMap.get(selectedPost) : null;

  const handleReturn = (distId: string) => {
    returnStock(distId, 1, 'good', 'Admin', 'Returned from post');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5 text-green-600" />
            Post/Site Inventory Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Track inventory assigned to security posts/sites. The supervisor of each post is responsible for these items.
          </p>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Post/Site Name</TableHead>
                  <TableHead>Supervisor</TableHead>
                  <TableHead className="text-center">Active Items</TableHead>
                  <TableHead className="text-center">Total Qty</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No post distributions found
                    </TableCell>
                  </TableRow>
                ) : (
                  posts.map(([postId, data]) => {
                    const activeItems = data.items.filter(i => i.status === 'active');
                    const totalQty = activeItems.reduce((sum, i) => sum + i.quantity, 0);
                    return (
                      <TableRow key={postId}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{data.name}</p>
                            <p className="text-xs text-muted-foreground">{postId}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {data.supervisorName}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="default" className="bg-green-600">{activeItems.length}</Badge>
                        </TableCell>
                        <TableCell className="text-center font-medium">{totalQty}</TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedPost(postId)}>
                            <Eye className="h-4 w-4 mr-1" /> View Items
                          </Button>
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

      {/* Post Detail Dialog */}
      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Post Inventory - {selectedPostData?.name}</DialogTitle>
            <DialogDescription>
              Supervisor: {selectedPostData?.supervisorName} (responsible for all items)
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Issued Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedPostData?.items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.itemName}</TableCell>
                    <TableCell className="text-sm">{CATEGORY_LABELS[item.itemCategory]}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="capitalize text-sm">{item.condition}</TableCell>
                    <TableCell className="text-sm">{item.issuedDate}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === 'active' ? 'default' : 'outline-solid'}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.status === 'active' && (
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => handleReturn(item.id)}>
                          <RotateCcw className="h-3 w-3 mr-1" /> Return
                        </Button>
                      )}
                    </TableCell>
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
