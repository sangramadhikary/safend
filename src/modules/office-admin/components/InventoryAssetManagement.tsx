'use client';

import { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Search, Download, Upload, QrCode, Printer, Package } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function InventoryAssetManagement() {
  const { inventory, assets, branches, activeBranch, isLoading } = useAppData();
  const [inventoryView, setInventoryView] = useState("items");
  const [searchQuery, setSearchQuery] = useState("");
  
  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center">
        <LoadingAnimation size="lg" />
      </div>
    );
  }

  // Filter inventory items for the active branch and search query
  const filteredInventory = inventory.filter(item => 
    item.branch === activeBranch && 
    (item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
     item.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  // Filter assets for the active branch and search query
  const filteredAssets = assets.filter(item => 
    item.branch === activeBranch && 
    (item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
     item.category.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  const activeBranchName = branches.find(b => b.id === activeBranch)?.name || 'Unknown Branch';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Inventory & Asset Management</h2>
        
        <div className="flex items-center gap-2">
          <Select value={activeBranch}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search inventory or assets..."
            className="pl-8 w-full"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex items-center gap-1">
            <Upload className="h-4 w-4" />
            <span>Import</span>
          </Button>
          <Button variant="outline" size="sm" className="flex items-center gap-1">
            <Download className="h-4 w-4" />
            <span>Export</span>
          </Button>
          <Button size="sm" className="flex items-center gap-1">
            <PlusCircle className="h-4 w-4" />
            <span>Add New</span>
          </Button>
        </div>
      </div>
      
      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="w-full md:w-auto grid grid-cols-2 mb-6">
          <TabsTrigger value="inventory">Inventory Items</TabsTrigger>
          <TabsTrigger value="assets">Fixed Assets</TabsTrigger>
        </TabsList>
        
        <TabsContent value="inventory">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                Inventory Items - {activeBranchName}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={inventoryView} onValueChange={setInventoryView}>
                <TabsList className="mb-4">
                  <TabsTrigger value="items">All Items</TabsTrigger>
                  <TabsTrigger value="low-stock">Low Stock</TabsTrigger>
                  <TabsTrigger value="stock-ledger">Stock Ledger</TabsTrigger>
                </TabsList>
                
                <TabsContent value="items">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Current Stock</TableHead>
                          <TableHead className="text-right">Reorder Level</TableHead>
                          <TableHead className="text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInventory.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-4">
                              No inventory items found
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredInventory.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              <TableCell>{item.category}</TableCell>
                              <TableCell className="text-right">
                                <span className={item.currentStock <= item.reorderLevel ? "text-red-500 font-bold" : ""}>
                                  {item.currentStock}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">{item.reorderLevel}</TableCell>
                              <TableCell className="text-center">
                                <div className="flex justify-center gap-1">
                                  <Button variant="ghost" size="icon" title="Print Barcode">
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" title="Generate QR Code">
                                    <QrCode className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
                
                <TabsContent value="low-stock">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Current Stock</TableHead>
                          <TableHead className="text-right">Reorder Level</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInventory.filter(i => i.currentStock <= i.reorderLevel).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-4">
                              No low stock items found
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredInventory
                            .filter(i => i.currentStock <= i.reorderLevel)
                            .map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell>{item.category}</TableCell>
                                <TableCell className="text-right text-red-500 font-bold">{item.currentStock}</TableCell>
                                <TableCell className="text-right">{item.reorderLevel}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="destructive">Reorder Required</Badge>
                                </TableCell>
                              </TableRow>
                            ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
                
                <TabsContent value="stock-ledger">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">Stock Movement History</h3>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-1" /> Export Ledger
                      </Button>
                    </div>
                    
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Transaction Type</TableHead>
                            <TableHead className="text-right">Quantity</TableHead>
                            <TableHead>Reference</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>2025-05-01</TableCell>
                            <TableCell>Security Badge</TableCell>
                            <TableCell>Stock In</TableCell>
                            <TableCell className="text-right">+50</TableCell>
                            <TableCell>PO-2025-042</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>2025-05-02</TableCell>
                            <TableCell>Radio Sets</TableCell>
                            <TableCell>Allocation</TableCell>
                            <TableCell className="text-right">-5</TableCell>
                            <TableCell>AL-2025-078</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>2025-05-03</TableCell>
                            <TableCell>Flashlights</TableCell>
                            <TableCell>Return</TableCell>
                            <TableCell className="text-right">+2</TableCell>
                            <TableCell>RT-2025-016</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="assets">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                Fixed Assets - {activeBranchName}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-4">
                          No assets found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAssets.map((asset) => (
                        <TableRow key={asset.id}>
                          <TableCell className="font-medium">{asset.name}</TableCell>
                          <TableCell>{asset.category}</TableCell>
                          <TableCell>
                            <Badge variant={
                              asset.status === 'active' ? 'default' : 
                              asset.status === 'maintenance' ? 'destructive' : 
                              'outline-solid'
                            }>
                              {asset.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{asset.assignedTo || '—'}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-1">
                              <Button variant="ghost" size="icon" title="Print QR Code">
                                <QrCode className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" title="Schedule Maintenance">
                                <Package className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
