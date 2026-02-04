import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Plus, Settings, Edit, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function VehicleTypes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [newType, setNewType] = useState({
    id: null as string | null,
    type_name: "",
    category: "MV-PublicSeller",
    first_weigh_fee: "0",
    second_weigh_fee: "0",
    return_time_hours: "0",
    requires_two_weighs: true,
    is_time_sensitive: false,
    description: ""
  });

  const { data: vehicleTypes, isLoading } = useQuery({
    queryKey: ["vehicle-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_types")
        .select("*")
        .order("type_name");

      if (error) throw error;
      return data;
    },
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const createTypeMutation = useMutation({
    mutationFn: async () => {
      if (newType.id) {
        const { error } = await supabase
          .from("vehicle_types")
          .update({
            type_name: newType.type_name,
            category: newType.category as any,
            first_weigh_fee: parseFloat(newType.first_weigh_fee),
            second_weigh_fee: parseFloat(newType.second_weigh_fee),
            return_time_hours: parseInt(newType.return_time_hours),
            requires_two_weighs: newType.requires_two_weighs,
            is_time_sensitive: newType.is_time_sensitive,
            description: newType.description
          })
          .eq("id", newType.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vehicle_types").insert({
          type_name: newType.type_name,
          category: newType.category as any,
          first_weigh_fee: parseFloat(newType.first_weigh_fee),
          second_weigh_fee: parseFloat(newType.second_weigh_fee),
          return_time_hours: parseInt(newType.return_time_hours),
          requires_two_weighs: newType.requires_two_weighs,
          is_time_sensitive: newType.is_time_sensitive,
          description: newType.description
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-types"] });
      setIsDialogOpen(false);
      toast({ title: "Success", description: newType.id ? "Vehicle type updated successfully" : "Vehicle type added successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const deleteTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicle_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-types"] });
      toast({ title: "Success", description: "Vehicle type deleted successfully" });
      setDeleteId(null);
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  });

  const resetForm = () => {
    setNewType({
      id: null,
      type_name: "",
      category: "MV-PublicSeller",
      first_weigh_fee: "0",
      second_weigh_fee: "0",
      return_time_hours: "0",
      requires_two_weighs: true,
      is_time_sensitive: false,
      description: ""
    });
  };

  const handleEdit = (type: any) => {
    setNewType({
      id: type.id,
      type_name: type.type_name,
      category: type.category,
      first_weigh_fee: type.first_weigh_fee.toString(),
      second_weigh_fee: type.second_weigh_fee.toString(),
      return_time_hours: type.return_time_hours.toString(),
      requires_two_weighs: type.requires_two_weighs,
      is_time_sensitive: type.is_time_sensitive,
      description: type.description || ""
    });
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    if (!newType.type_name) {
      toast({ variant: "destructive", title: "Error", description: "Type Name is required" });
      return;
    }
    createTypeMutation.mutate();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Vehicle Types & Categories</h1>
          <p className="text-muted-foreground">
            Payment rules and configuration for different vehicle categories
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Vehicle Type
          </Button>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{newType.id ? "Edit Vehicle Type" : "Add New Vehicle Type"}</DialogTitle>
              <DialogDescription>Configure fees and rules for this vehicle category.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Name</Label>
                <Input id="name" value={newType.type_name} onChange={e => setNewType({ ...newType, type_name: e.target.value })} className="col-span-3" placeholder="e.g. Canter, Fuso" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="category" className="text-right">Category</Label>
                <Select value={newType.category} onValueChange={v => setNewType({ ...newType, category: v })}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MV-PublicSeller">MV-PublicSeller</SelectItem>
                    <SelectItem value="MV-Supplier">MV-Supplier</SelectItem>
                    <SelectItem value="MV-Company">MV-Company</SelectItem>
                    <SelectItem value="JV-Payment">JV-Payment</SelectItem>
                    <SelectItem value="JV-Free">JV-Free</SelectItem>
                    <SelectItem value="Transit">Transit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="first_fee" className="text-right">1st Fee</Label>
                <Input id="first_fee" type="number" value={newType.first_weigh_fee} onChange={e => setNewType({ ...newType, first_weigh_fee: e.target.value })} className="col-span-3" />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="second_fee" className="text-right">2nd Fee</Label>
                <Input id="second_fee" type="number" value={newType.second_weigh_fee} onChange={e => setNewType({ ...newType, second_weigh_fee: e.target.value })} className="col-span-3" />
              </div>



              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Time Sensitive?</Label>
                <div className="flex items-center space-x-2 col-span-3">
                  <Switch checked={newType.is_time_sensitive} onCheckedChange={c => setNewType({ ...newType, is_time_sensitive: c })} />
                  <span className="text-sm text-muted-foreground">Enable return time tracking</span>
                </div>
              </div>

              {newType.is_time_sensitive && (
                <div className="grid grid-cols-4 items-center gap-4 animate-in fade-in slide-in-from-top-2">
                  <Label htmlFor="hours" className="text-right">Hours</Label>
                  <Input id="hours" type="number" value={newType.return_time_hours} onChange={e => setNewType({ ...newType, return_time_hours: e.target.value })} className="col-span-3" placeholder="Return window in hours (e.g. 12)" />
                </div>
              )}

              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right border-t pt-4">2 Weighs?</Label>
                <div className="flex items-center space-x-2 col-span-3 border-t pt-4">
                  <Switch checked={newType.requires_two_weighs} onCheckedChange={c => setNewType({ ...newType, requires_two_weighs: c })} />
                  <span className="text-sm text-muted-foreground">Normal In/Out procedure</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createTypeMutation.isPending}>
                {createTypeMutation.isPending ? (newType.id ? "Updating..." : "Adding...") : (newType.id ? "Update Vehicle Type" : "Add Vehicle Type")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured Vehicle Types</CardTitle>
          <CardDescription>
            Each type has specific payment rules and time constraints
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>1st Fee</TableHead>
                  <TableHead>2nd Fee</TableHead>
                  <TableHead>Procedure</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicleTypes?.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell className="font-bold">{type.type_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-slate-50">{type.category}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {parseFloat(type.first_weigh_fee.toString()).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono">
                      {parseFloat(type.second_weigh_fee.toString()).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-xs">
                        {type.requires_two_weighs ? (
                          <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-50">In/Out</Badge>
                        ) : (
                          <Badge variant="outline">Single Weigh</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {type.is_time_sensitive ? (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 w-fit">
                            Time: {type.return_time_hours}h
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-tight">Static (No Limit)</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(type)}>
                          <Edit className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(type.id)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">MV-PublicSeller</p>
              <p className="text-muted-foreground">
                Pays 20,000 UGX before offloading (1st weigh) + 10,000 UGX after offloading (2nd weigh)
              </p>
            </div>
            <div>
              <p className="font-medium">MV-Supplier</p>
              <p className="text-muted-foreground">
                Pays 10,000 UGX once for both weighs
              </p>
            </div>
            <div>
              <p className="font-medium">MV-Company</p>
              <p className="text-muted-foreground">
                No payment required, but must be weighed twice for transparency
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Time-Sensitive Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">JV-Payment</p>
              <p className="text-muted-foreground">
                12 hours return time, 2 weigh chances. If exceeded → sent to cashier
              </p>
            </div>
            <div>
              <p className="font-medium">Transit</p>
              <p className="text-muted-foreground">
                24 hours return time, 2 weigh chances. If exceeded → payment required
              </p>
            </div>
            <div>
              <p className="font-medium">Other Categories</p>
              <p className="text-muted-foreground">
                No time constraints, but still require proper weighing procedures
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the vehicle type
              and remove this configuration from our records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteId && deleteTypeMutation.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
