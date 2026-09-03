'use client';

import React, { useState, useEffect, useMemo } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Users, Building2, Search, Crown, GitBranch, RefreshCw } from "lucide-react";
import { useBranch } from "@/contexts/BranchContext";
import { getAllUsers, FirebaseUser } from "@/utils/firebaseUserManagement";
import type { Branch } from "@/types/branch";

interface BranchUserAssignmentProps {
  branches?: Branch[];
  searchTerm?: string;
}

export function BranchUserAssignment({ searchTerm = "" }: BranchUserAssignmentProps) {
  const { allBranches, isMainBranchUser, currentBranch } = useBranch();
  const { toast } = useToast();
  const [users, setUsers] = useState<FirebaseUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("all");
  const [localSearch, setLocalSearch] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const allUsers = await getAllUsers();
      setUsers(allUsers);
    } catch (error) {
      console.error('Error loading users:', error);
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Visible branches based on user access
  const visibleBranches = isMainBranchUser
    ? allBranches
    : allBranches.filter(b => b.id === currentBranch?.id);

  // Filter users by branch and search
  const filteredUsers = useMemo(() => {
    let filtered = users;

    // Branch filter
    if (!isMainBranchUser) {
      filtered = filtered.filter(u => u.branchId === currentBranch?.id);
    } else if (selectedBranchFilter !== "all") {
      filtered = filtered.filter(u => u.branchId === selectedBranchFilter);
    }

    // Search filter
    const search = (searchTerm || localSearch).toLowerCase();
    if (search) {
      filtered = filtered.filter(u =>
        u.name.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search) ||
        u.roles.some(r => r.toLowerCase().includes(search))
      );
    }

    return filtered;
  }, [users, selectedBranchFilter, searchTerm, localSearch, isMainBranchUser, currentBranch]);

  // Group users by branch for summary
  const branchUserCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach(u => {
      if (u.branchId) {
        counts[u.branchId] = (counts[u.branchId] || 0) + 1;
      }
    });
    return counts;
  }, [users]);

  const getBranchName = (branchId: string) => {
    const branch = allBranches.find(b => b.id === branchId);
    return branch?.name || 'Unassigned';
  };

  const getBranchType = (branchId: string) => {
    const branch = allBranches.find(b => b.id === branchId);
    return branch?.type || 'sub';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-red-600" />
              Branch User Assignments
            </CardTitle>
            <CardDescription>
              {isMainBranchUser
                ? "View user assignments across all branches"
                : `Users assigned to ${currentBranch?.name}`}
            </CardDescription>
          </div>
          <Button variant="outline" size="icon" onClick={loadUsers}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {/* Branch summary cards */}
          {isMainBranchUser && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {visibleBranches.map(branch => (
                <div
                  key={branch.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedBranchFilter === branch.id
                      ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                      : 'hover:border-muted-foreground/30'
                  }`}
                  onClick={() => setSelectedBranchFilter(
                    selectedBranchFilter === branch.id ? "all" : branch.id
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {branch.type === 'main' ? (
                      <Crown className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                      <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium truncate">{branch.name}</span>
                  </div>
                  <p className="text-2xl font-bold">{branchUserCounts[branch.id] || 0}</p>
                  <p className="text-xs text-muted-foreground">users</p>
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users by name, email, or role..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Users table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Role(s)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No users found matching your criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map(user => (
                    <TableRow key={user.uid}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-xs">
                              {user.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{user.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{user.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {getBranchType(user.branchId) === 'main' ? (
                            <Crown className="h-3 w-3 text-amber-500" />
                          ) : (
                            <GitBranch className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className="text-sm">{getBranchName(user.branchId)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map(role => (
                            <Badge key={role} variant="outline" className="text-xs capitalize">
                              {role}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                          {user.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Summary */}
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>
              Showing {filteredUsers.length} of {users.length} users
              {selectedBranchFilter !== "all" && ` in ${getBranchName(selectedBranchFilter)}`}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
