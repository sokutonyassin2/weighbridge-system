import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Users, Eye, EyeOff, Key, Lock, ShieldAlert, Pencil, Trash2, Power, UserCheck, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function UserManagement() {
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    fullName: "",
    role: "operator" as any,
  });

  const [showPassword, setShowPassword] = useState(false);

  // Password Reset State
  const [resettingUser, setResettingUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Edit/Delete State
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showEditUser, setShowEditUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Redirect non-super-admins
  if (userRole !== "super_admin") {
    navigate("/");
    return null;
  }

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, username, created_at, is_active")
        .order('created_at', { ascending: false });

      if (profilesError) {
        // Fallback if is_active column doesn't exist yet
        if (profilesError.message.includes("is_active")) {
          const { data: profilesFallback, error: fallbackError } = await supabase
            .from("profiles")
            .select("id, full_name, username, created_at")
            .order('created_at', { ascending: false });
          if (fallbackError) throw fallbackError;
          return profilesFallback.map(p => ({ ...p, is_active: true }));
        }
        throw profilesError;
      }

      const profilesList = profiles as any[];
      const usersWithRoles = await Promise.all(
        profilesList.map(async (profile) => {
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", profile.id)
            .maybeSingle();

          return {
            ...profile,
            role: roleData?.role || "operator",
          };
        })
      );

      return usersWithRoles;
    },
    staleTime: 30000,
  });

  const createUserMutation = useMutation({
    mutationFn: async () => {
      // Validate username format
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(newUser.username)) {
        throw new Error("Username must be 3-20 characters (letters, numbers, underscore only)");
      }

      // Convert username to email format
      const email = `${newUser.username.toLowerCase()}@weighbridge.local`;

      // Call edge function to create user (uses service role key)
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email,
          password: newUser.password,
          fullName: newUser.fullName,
          username: newUser.username.toLowerCase(),
          role: newUser.role,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User created successfully",
      });
      setNewUser({ username: "", password: "", fullName: "", role: "operator" });
      queryClient.invalidateQueries({ queryKey: ["all-users"], refetchType: 'all' });
    },
    onError: (error: any) => {
      console.error("Create User Error:", error);
      toast({
        variant: "destructive",
        title: "Registration Error",
        description: `Backend error: ${error.message || "Unknown"}. (Targeting: ${import.meta.env.VITE_SUPABASE_URL})`,
      });
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate full name
    if (!newUser.fullName || newUser.fullName.trim().length < 2) {
      toast({
        variant: "destructive",
        title: "Invalid Full Name",
        description: "Please enter a full name (at least 2 characters)",
      });
      return;
    }

    // Validate password
    if (!newUser.password || newUser.password.length < 4) {
      toast({
        variant: "destructive",
        title: "Invalid Password",
        description: "Password must be at least 4 characters",
      });
      return;
    }

    createUserMutation.mutate();
  };

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      if (!resettingUser || !newPassword || newPassword.length < 4) {
        throw new Error("Invalid password");
      }

      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          action: 'reset-password',
          userId: resettingUser.id,
          password: newPassword,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `Password for ${resettingUser?.username} reset successfully`,
      });
      setResettingUser(null);
      setNewPassword("");
      setShowResetPassword(false);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          action: 'toggle-active',
          userId: id,
          isActive: isActive,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      toast({
        title: "Status Updated",
        description: "User status has been changed successfully",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          action: 'delete-user',
          userId: id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      setShowDeleteConfirm(false);
      setDeletingUser(null);
      toast({
        title: "User Deleted",
        description: "User account has been safely removed",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async () => {
      if (!editingUser) return;

      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          action: 'update-user',
          userId: editingUser.id,
          fullName: editingUser.full_name,
          role: editingUser.role,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users"] });
      setShowEditUser(false);
      setEditingUser(null);
      toast({
        title: "User Updated",
        description: "User details have been updated successfully",
      });
    },
    onError: (error: any) => {
      console.error("Update User Error:", error);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message || "Failed to update user. Please try again.",
      });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground">Create and manage system users</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Create New User
          </CardTitle>
          <CardDescription>Add a new operator or admin to the system</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  placeholder="e.g., jdoe"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  pattern="[a-zA-Z0-9_]{3,20}"
                  title="3-20 characters: letters, numbers, underscore only"
                  required
                />
                <p className="text-xs text-muted-foreground">3-20 chars (letters, numbers, _ only)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name <span className="text-destructive">*</span></Label>
                <Input
                  id="fullName"
                  placeholder="e.g., John Doe"
                  value={newUser.fullName}
                  onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground">Required (min 2 characters)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(value) => setNewUser({ ...newUser, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">Super Admin (IT/System)</SelectItem>
                    <SelectItem value="admin">Operations Manager</SelectItem>
                    <SelectItem value="finance">Finance / Accounts</SelectItem>
                    <SelectItem value="procurement_officer">Procurement Officer</SelectItem>
                    <SelectItem value="garage_manager">Garage Manager (Head)</SelectItem>
                    <SelectItem value="storekeeper">Storekeeper (Inventory)</SelectItem>
                    <SelectItem value="mechanic">Mechanic / Technical</SelectItem>
                    <SelectItem value="logistics_admin">Logistics Admin</SelectItem>
                    <SelectItem value="logistics_manager">Logistics Manager</SelectItem>
                    <SelectItem value="operator">Weighbridge Operator</SelectItem>
                    <SelectItem value="observer">Camera Observer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" disabled={createUserMutation.isPending}>
              {createUserMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Users
          </CardTitle>
          <CardDescription>System users and their roles</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground">No users found</p>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user: any) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-mono font-medium">{user.username || 'N/A'}</TableCell>
                      <TableCell>{user.full_name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={user.role === "admin" ? "default" : user.role === "super_admin" ? "outline" : "secondary"}
                          className={
                            user.role === "super_admin" ? "bg-indigo-900 text-white hover:bg-black" :
                              user.role === "admin" ? "bg-blue-600 text-white hover:bg-blue-700" :
                                user.role === "finance" ? "bg-emerald-600 text-white hover:bg-emerald-700" :
                                  user.role === "procurement_officer" ? "bg-amber-600 text-white hover:bg-amber-700" :
                                    user.role === "garage_manager" ? "bg-slate-800 text-white hover:bg-black" :
                                      user.role === "storekeeper" ? "bg-orange-600 text-white hover:bg-orange-700" :
                                        user.role === "observer" ? "bg-purple-600 text-white hover:bg-purple-700" :
                                          user.role === "operator" ? "bg-slate-500 text-white hover:bg-slate-600" :
                                            user.role?.includes("logistics") ? "bg-cyan-600 text-white hover:bg-cyan-700" :
                                              ""
                          }
                        >
                          {user.role?.replace("_", " ").toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={user.is_active !== false}
                            onCheckedChange={(checked) =>
                              toggleActiveMutation.mutate({ id: user.id, isActive: checked })
                            }
                            disabled={toggleActiveMutation.isPending}
                          />
                          <span className={`text-xs font-medium ${user.is_active !== false ? 'text-green-600' : 'text-red-600'}`}>
                            {user.is_active !== false ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit User"
                            onClick={() => {
                              setEditingUser(user);
                              setShowEditUser(true);
                            }}
                          >
                            <Pencil className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Reset Password"
                            onClick={() => {
                              setResettingUser(user);
                              setShowResetPassword(true);
                            }}
                          >
                            <Key className="h-4 w-4 text-amber-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete User"
                            className="hover:bg-red-50"
                            onClick={() => {
                              setDeletingUser(user);
                              setShowDeleteConfirm(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600" />
              Reset Password
            </DialogTitle>
            <DialogDescription>
              Set a new password for <strong>{resettingUser?.full_name} (@{resettingUser?.username})</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter new password..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <ShieldAlert className="h-3 w-3 mt-0.5" />
                This will take effect immediately. The user must use the new password to log in.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPassword(false)}>Cancel</Button>
            <Button
              onClick={() => resetPasswordMutation.mutate()}
              disabled={resetPasswordMutation.isPending || newPassword.length < 4}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {resetPasswordMutation.isPending ? "Resetting..." : "Confirm Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditUser} onOpenChange={setShowEditUser}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              Edit User Profile
            </DialogTitle>
            <DialogDescription>
              Update information for <strong>@{editingUser?.username}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-fullname">Full Name</Label>
              <Input
                id="edit-fullname"
                value={editingUser?.full_name || ""}
                onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={editingUser?.role}
                onValueChange={(value) => setEditingUser({ ...editingUser, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin (IT/System)</SelectItem>
                  <SelectItem value="admin">Operations Manager</SelectItem>
                  <SelectItem value="finance">Finance / Accounts</SelectItem>
                  <SelectItem value="procurement_officer">Procurement Officer</SelectItem>
                  <SelectItem value="garage_manager">Garage Manager (Head)</SelectItem>
                  <SelectItem value="storekeeper">Storekeeper (Inventory)</SelectItem>
                  <SelectItem value="mechanic">Mechanic / Technical</SelectItem>
                  <SelectItem value="logistics_admin">Logistics Admin</SelectItem>
                  <SelectItem value="logistics_manager">Logistics Manager</SelectItem>
                  <SelectItem value="operator">Weighbridge Operator</SelectItem>
                  <SelectItem value="observer">Camera Observer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditUser(false)}>Cancel</Button>
            <Button
              onClick={() => updateUserMutation.mutate()}
              disabled={updateUserMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Are you absolutely sure?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the account for <strong>{deletingUser?.full_name} (@{deletingUser?.username})</strong>.
              <br /><br />
              <span className="font-semibold text-foreground">Company history is safe:</span> All weighing records performed by this user will remain in the system for accounting purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUserMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteUserMutation.mutate(deletingUser?.id);
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Permanently Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
