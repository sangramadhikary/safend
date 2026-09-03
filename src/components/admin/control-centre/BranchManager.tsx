'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Plus, Building2, Crown, GitBranch } from "lucide-react";
import { Branch } from "@/types/branch";
import { useBranch } from "@/contexts/BranchContext";
import { useToast } from "@/hooks/use-toast";
import { BranchEditForm } from "./forms/BranchEditForm";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface BranchManagerProps {
  searchTerm: string;
}

export function BranchManager({ searchTerm }: BranchManagerProps) {
  const { toast } = useToast();
  const { allBranches, isMainBranchUser, currentBranch, loading, createBranch, updateBranch, deleteBranch } = useBranch();
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [isAddingBranch, setIsAddingBranch] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Filter branches based on search and user access
  const visibleBranches = isMainBranchUser
    ? allBranches
    : allBranches.filter(b => b.id === currentBranch?.id);

  const filteredBranches = visibleBranches.filter(branch => {
    if (!searchTerm) return true;
    return branch.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      branch.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      branch.city.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleEditBranch = (branch: Branch) => {
    setSelectedBranch(branch);
    setIsEditDialogOpen(true);
  };

  const handleDeleteBranch = (branchId: string) => {
    const branch = allBranches.find(b => b.id === branchId);
    if (branch?.type === 'main') {
      toast({
        title: "Cannot Delete",
        description: "Main branch cannot be deleted",
        variant: "destructive"
      });
      return;
    }
    setBranchToDelete(branchId);
  };

  const confirmDeleteBranch = async () => {
    const targetId = branchToDelete;
    if (!targetId) return;
    setBranchToDelete(null);

    setIsSaving(true);
    const result = await deleteBranch(targetId);

    if (result.success) {
      toast({
        title: "Branch Deleted",
        description: "Branch has been removed from the system"
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to delete branch",
        variant: "destructive"
      });
    }

    setIsSaving(false);
  };

  const handleAddBranch = () => {
    setSelectedBranch(null);
    setIsAddingBranch(true);
    setIsEditDialogOpen(true);
  };

  const handleSaveBranch = async (branchData: Partial<Branch>) => {
    setIsSaving(true);

    if (isAddingBranch) {
      const result = await createBranch(branchData);
      if (result.success) {
        toast({
          title: "Branch Created",
          description: `${branchData.name} has been created successfully`
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to create branch",
          variant: "destructive"
        });
      }
    } else if (selectedBranch) {
      const result = await updateBranch(selectedBranch.id, branchData);
      if (result.success) {
        toast({
          title: "Branch Updated",
          description: `${branchData.name} has been updated successfully`
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to update branch",
          variant: "destructive"
        });
      }
    }

    setIsEditDialogOpen(false);
    setIsAddingBranch(false);
    setSelectedBranch(null);
    setIsSaving(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="control-centre-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Building2 className="h-5 w-5 text-red-600" />
              Branch Manager
            </CardTitle>
            <CardDescription>
              {isMainBranchUser
                ? 'Manage all branches — create sub-branches and assign managers'
                : `Viewing your branch: ${currentBranch?.name}`}
            </CardDescription>
          </div>
          {isMainBranchUser && (
            <Button onClick={handleAddBranch} className="gap-2" disabled={isSaving}>
              <Plus className="h-4 w-4" />
              Add Sub-Branch
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {filteredBranches.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No branches found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBranches.map(branch => (
                  <TableRow key={branch.id}>
                    <TableCell className="font-medium">{branch.name}</TableCell>
                    <TableCell className="text-muted-foreground">{branch.code}</TableCell>
                    <TableCell>
                      <Badge variant={branch.type === 'main' ? 'default' : 'outline-solid'} className="gap-1">
                        {branch.type === 'main' ? <Crown className="h-3 w-3" /> : <GitBranch className="h-3 w-3" />}
                        {branch.type === 'main' ? 'Main' : 'Sub'}
                      </Badge>
                    </TableCell>
                    <TableCell>{branch.city}{branch.state ? `, ${branch.state}` : ''}</TableCell>
                    <TableCell>{branch.managerName || <span className="text-muted-foreground italic">Unassigned</span>}</TableCell>
                    <TableCell>
                      <Badge variant={branch.status === "active" ? "default" : "secondary"}>
                        {branch.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {(isMainBranchUser || currentBranch?.id === branch.id) && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleEditBranch(branch)} disabled={isSaving}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          {isMainBranchUser && branch.type !== 'main' && (
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteBranch(branch.id)} className="text-red-600" disabled={isSaving}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Branch Edit Form */}
      <BranchEditForm
        branch={selectedBranch}
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setIsAddingBranch(false);
          setSelectedBranch(null);
        }}
        onSave={handleSaveBranch}
        isNew={isAddingBranch}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!branchToDelete} onOpenChange={(open) => { if (!open) setBranchToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this branch. Users assigned to this branch will need to be reassigned. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDeleteBranch(); }}
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={isSaving}
            >
              {isSaving ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
