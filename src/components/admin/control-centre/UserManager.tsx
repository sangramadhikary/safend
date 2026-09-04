'use client';
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UserPlus, Upload, RefreshCw, Edit, UserMinus, CheckCircle2, ShieldAlert, Activity, Trash2, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useBranch } from "@/contexts/BranchContext";
import { useToast } from "@/hooks/use-toast";
import { UserEditForm } from "./forms/UserEditForm";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { createFirebaseUser, getAllUsers, updateFirebaseUser, deleteFirebaseUser } from "@/utils/firebaseUserManagement";
import { auditActions } from "@/utils/auditLog";
interface User {
  id: string;
  name: string;
  email: string;
  roles: string[];
  branch: string;
  branchId: string;
  status: "active" | "inactive";
  lastActive: string;
  avatar: string;
}
export function UserManager() {
  const [activeTab, setActiveTab] = useState("users");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const {
    isMainBranch,
    isMainBranchUser,
    currentBranch
  } = useBranch();
  const {
    toast
  } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load users from Firebase
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const firebaseUsers = await getAllUsers();
      const convertedUsers: User[] = firebaseUsers.map(fu => ({
        id: fu.uid,
        name: fu.name,
        email: fu.email,
        roles: fu.roles || [],
        branch: fu.branch,
        branchId: fu.branchId,
        status: fu.status,
        lastActive: fu.lastActive || 'Never',
        avatar: ''
      }));
      setUsers(convertedUsers);
    } catch (error) {
      console.error('Error loading users:', error);
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter users based on current branch if not main branch
  const filteredUsers = !isMainBranch ? users.filter(user => user.branchId === currentBranch?.id) : users;

  // Filter by status
  const statusFilteredUsers = selectedFilter === "all" ? filteredUsers : filteredUsers.filter(user => user.status === selectedFilter);

  // Search filter
  const searchFilteredUsers = searchTerm ? statusFilteredUsers.filter(user => user.name.toLowerCase().includes(searchTerm.toLowerCase()) || user.email.toLowerCase().includes(searchTerm.toLowerCase()) || user.roles.some(r => r.toLowerCase().includes(searchTerm.toLowerCase()))) : statusFilteredUsers;
  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setIsEditDialogOpen(true);
    setIsAddingUser(false);
  };
  const handleToggleUserStatus = async (user: User) => {
    const newStatus: "active" | "inactive" = user.status === "active" ? "inactive" : "active";
    const result = await updateFirebaseUser(user.id, { status: newStatus });
    if (result.success) {
      await loadUsers();
      // Deactivating an account revokes system access. This path was previously
      // unaudited entirely, so an account could be disabled or re-enabled with no
      // record of who did it.
      void auditActions.userStatusChanged(user.name, newStatus, user.status);
      toast({
        title: `User ${newStatus === "active" ? "Activated" : "Deactivated"}`,
        description: `${user.name} has been ${newStatus === "active" ? "activated" : "deactivated"}`
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to update status",
        variant: "destructive"
      });
    }
  };
  const handleDeleteUser = (userId: string) => {
    setUserToDelete(userId);
  };
  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    const userToDeleteData = users.find(u => u.id === userToDelete);
    const result = await deleteFirebaseUser(userToDelete);
    if (result.success) {
      await loadUsers();
      // Pass the whole record: once the account is gone this entry is the only
      // remaining evidence of the roles and branch it held.
      if (userToDeleteData) {
        await auditActions.userDeleted(userToDeleteData.name, userToDeleteData);
      }
      toast({
        title: "User Deleted",
        description: "User has been removed from the system"
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to delete user",
        variant: "destructive"
      });
    }
    setUserToDelete(null);
  };
  const handleAddUser = () => {
    setSelectedUser(null);
    setIsAddingUser(true);
    setIsEditDialogOpen(true);
  };
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadUsers();
    setIsRefreshing(false);
    toast({
      title: "Data refreshed",
      description: "User data has been refreshed"
    });
  };

  const handleSaveUser = async (userData: Partial<User> & { password?: string }) => {
    if (isAddingUser) {
      const result = await createFirebaseUser(
        userData.email || '',
        userData.password || 'TempPass123!',
        {
          name: userData.name || '',
          email: userData.email || '',
          roles: userData.roles && userData.roles.length > 0 ? userData.roles : ['sales'],
          branch: userData.branch || '',
          branchId: userData.branchId || '',
          status: userData.status || 'active'
        }
      );
      if (result.success) {
        await loadUsers();
        // The granted roles and branch are recorded; the password deliberately is
        // not, and would be masked by the redaction rules if it were passed.
        await auditActions.userCreated(userData.name || '', userData.email || '', {
          name: userData.name,
          email: userData.email,
          roles: userData.roles && userData.roles.length > 0 ? userData.roles : ['sales'],
          branch: userData.branch,
          status: userData.status || 'active',
        });
        toast({
          title: "User Created",
          description: `${userData.name} created. Password: ${userData.password}`
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to create user",
          variant: "destructive"
        });
      }
    } else if (selectedUser) {
      const result = await updateFirebaseUser(selectedUser.id, {
        name: userData.name,
        roles: userData.roles && userData.roles.length > 0 ? userData.roles : selectedUser.roles,
        branch: userData.branch,
        branchId: userData.branchId,
        status: userData.status
      });
      if (result.success) {
        await loadUsers();

        const nextRoles = userData.roles && userData.roles.length > 0 ? userData.roles : selectedUser.roles;

        // `selectedUser` is the record as loaded before the dialog opened, which
        // makes it the before-state — no extra read required.
        const before = {
          name: selectedUser.name,
          roles: selectedUser.roles,
          branch: selectedUser.branch,
          status: selectedUser.status,
        };
        const after = {
          name: userData.name ?? selectedUser.name,
          roles: nextRoles,
          branch: userData.branch ?? selectedUser.branch,
          status: userData.status ?? selectedUser.status,
        };

        // A privilege change is recorded under its own critical action as well as
        // in the general update, because "who granted this person admin" must be
        // answerable without reading through unrelated profile edits.
        const rolesChanged =
          [...selectedUser.roles].sort().join(',') !== [...nextRoles].sort().join(',');
        if (rolesChanged) {
          await auditActions.roleChanged(after.name, selectedUser.roles, nextRoles);
        }
        if (after.status !== before.status) {
          await auditActions.userStatusChanged(after.name, after.status, before.status);
        }

        await auditActions.userUpdated(after.name, undefined, before, after);
        toast({
          title: "User Updated",
          description: `${userData.name} updated successfully`
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to update user",
          variant: "destructive"
        });
      }
    }
    setIsEditDialogOpen(false);
    setIsAddingUser(false);
    setSelectedUser(null);
  };
  return <div className="space-y-6">
      <Tabs value="users">
        <TabsContent value="users" className="space-y-6">
          <Card className="control-centre-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-xl font-bold">User Management</CardTitle>
                <CardDescription>
                  {isMainBranch ? "Manage all users across branches" : `Manage users in ${currentBranch?.name}`}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setSelectedFilter("all")} variant={selectedFilter === "all" ? "default" : "outline"}>All</Button>
                <Button onClick={() => setSelectedFilter("active")} variant={selectedFilter === "active" ? "default" : "outline"}>Active</Button>
                <Button onClick={() => setSelectedFilter("inactive")} variant={selectedFilter === "inactive" ? "default" : "outline"}>Inactive</Button>
                <Button variant="destructive" className="gap-2" onClick={handleAddUser}>
                  <UserPlus className="h-4 w-4" />
                  Add User
                </Button>
              </div>
            </CardHeader>
            
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Loading users...</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-4">
                    <div className="relative w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search users..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
                    </div>
                    
                    <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
                      <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                  
                  <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchFilteredUsers.length === 0 ? <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                        No users found matching your criteria
                      </TableCell>
                    </TableRow> : searchFilteredUsers.map(user => <TableRow key={user.id}>
                        <TableCell className="font-medium flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          {user.name}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.roles.join(', ')}</TableCell>
                        <TableCell>{user.branch}</TableCell>
                        <TableCell>
                          <Badge variant={user.status === "active" ? "default" : "secondary"}>
                            {user.status === "active" ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>{user.lastActive}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEditUser(user)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleToggleUserStatus(user)} className={user.status === "active" ? "text-amber-600" : "text-green-600"}>
                            {user.status === "active" ? <UserMinus className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDeleteUser(user.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>)}
                </TableBody>
              </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* User Edit Form */}
      <UserEditForm user={selectedUser} isOpen={isEditDialogOpen} onClose={() => {
      setIsEditDialogOpen(false);
      setIsAddingUser(false);
      setSelectedUser(null);
    }} onSave={handleSaveUser} isNew={isAddingUser} />
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the 
              user account and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteUser} className="bg-red-600 text-white hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
}
