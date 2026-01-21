import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Search, Filter, Phone, Calendar, ShieldCheck, UserMinus, UserCheck, Edit, Trash2, Truck, AlertTriangle, ShieldAlert, FileText, History } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

const DriverRegistry = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [filterState, setFilterState] = useState("All");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [showSecondaryPhone, setShowSecondaryPhone] = useState(false);
    const [editingDriver, setEditingDriver] = useState<any>(null);
    const [isEmergencyDialogOpen, setIsEmergencyDialogOpen] = useState(false);
    const [emergencyReason, setEmergencyReason] = useState("");
    const [emergencyDriver, setEmergencyDriver] = useState<any>(null);
    const [newDriver, setNewDriver] = useState({
        full_name: "",
        id_number: "",
        operation_type: "Local",
        license_no: "",
        license_expiry: "",
        phone_no: "",
        phone_secondary: "",
        status: "Active",
        assigned_vehicle_id: "",
        notes: ""
    });

    // Fetch Drivers Data
    const { data: drivers, isLoading } = useQuery({
        queryKey: ["logistics-drivers"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_drivers")
                .select(`
          *,
          logistics_fleet!logistics_drivers_assigned_vehicle_id_fkey(vehicle_no, id, assignment_status, coupling_status)
        `)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        }
    });

    const isDriverOnTrip = (driver: any) => {
        if (!driver) return false;
        if (driver.status === 'In Transit') return true;
        const fleetInfo = driver.logistics_fleet;
        if (fleetInfo && (fleetInfo.assignment_status === 'On Job' || fleetInfo.assignment_status === 'In Transit')) {
            return true;
        }
        return false;
    };

    // Fetch Fleet Data for Assignment
    const { data: fleetAssignment } = useQuery({
        queryKey: ["logistics-fleet-assignment"],
        queryFn: async () => {
            const { data: fleet, error: fleetError } = await supabase
                .from("logistics_fleet")
                .select("*")
                .eq("is_active", true);
            if (fleetError) throw fleetError;

            const { data: types, error: typesError } = await supabase
                .from("logistics_asset_types")
                .select("*");
            if (typesError) throw typesError;

            const { data: couplings, error: couplingError } = await supabase
                .from("logistics_couplings")
                .select("*")
                .eq("is_active", true);
            if (couplingError) throw couplingError;

            return { fleet, types, couplings };
        }
    });

    const getAssignedUnitLabel = (driver: any) => {
        if (!driver.assigned_vehicle_id || !fleetAssignment) return null;

        const { fleet, couplings } = fleetAssignment;
        const asset = fleet.find((f: any) => f.id === driver.assigned_vehicle_id);
        if (!asset) return null;

        if (itemHasCoupling(asset)) {
            const coupling = couplings.find((c: any) => c.horse_id === asset.id || c.trailer_id === asset.id);
            const partnerId = coupling.horse_id === asset.id ? coupling.trailer_id : coupling.horse_id;
            const partner = fleet.find((f: any) => f.id === partnerId);
            if (partner) {
                return `${asset.vehicle_no || asset.horse_number} + ${partner.vehicle_no || partner.trailer_number}`;
            }
        }

        return asset.vehicle_no || asset.horse_number || asset.trailer_number;
    };

    const itemHasCoupling = (asset: any) => asset.coupling_status === 'coupled';

    const getAvailableForAssignment = () => {
        if (!fleetAssignment) return [];
        const { fleet, types, couplings } = fleetAssignment;

        return fleet.reduce((acc: any[], item: any) => {
            const typeInfo = types.find((t: any) => t.name === item.asset_type);
            const isHorse = typeInfo?.type_category === "Vehicle";
            const isTrailer = typeInfo?.type_category === "Trailer";

            if (item.coupling_status === "coupled") {
                if (isHorse) {
                    const coupling = couplings.find((c: any) => c.horse_id === item.id);
                    const trailer = fleet.find((f: any) => f.id === coupling?.trailer_id);
                    if (trailer) {
                        acc.push({
                            id: item.id,
                            label: `${item.vehicle_no || item.horse_number} + ${trailer.vehicle_no || trailer.trailer_number} (Coupled Pair)`,
                            category: item.fleet_category
                        });
                    }
                }
                // Trailers are handled via their paired Horse
            } else if (!isHorse && !isTrailer) {
                // Standalone vehicles
                acc.push({
                    id: item.id,
                    label: `${item.vehicle_no} (${item.asset_type})`,
                    category: item.fleet_category
                });
            }
            // Uncoupled Horses and Trailers are EXCLUDED
            return acc;
        }, []);
    };

    // Create Driver Mutation
    const createDriverMutation = useMutation({
        mutationFn: async (driver: typeof newDriver) => {
            const { data, error } = await supabase
                .from("logistics_drivers")
                .insert([driver])
                .select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-drivers"] });
            setIsDialogOpen(false);
            setNewDriver({
                full_name: "",
                id_number: "",
                operation_type: "Local",
                license_no: "",
                license_expiry: "",
                phone_no: "",
                phone_secondary: "",
                status: "Active",
                assigned_vehicle_id: "",
                notes: ""
            });
            setShowSecondaryPhone(false);
            toast({ title: "Driver Registered", description: "The new driver has been added to the registry." });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message });
        }
    });

    // Update Driver Mutation
    const updateDriverMutation = useMutation({
        mutationFn: async (driver: any) => {
            const { id, logistics_fleet, ...updateData } = driver;
            const { data, error } = await supabase
                .from("logistics_drivers")
                .update(updateData)
                .eq("id", id)
                .select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-drivers"] });
            setIsEditDialogOpen(false);
            setEditingDriver(null);
            toast({ title: "Driver Updated", description: "Driver details have been updated successfully." });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Update Failed", description: error.message });
        }
    });

    // Delete Driver Mutation
    const deleteDriverMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("logistics_drivers")
                .delete()
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-drivers"] });
            toast({ title: "Driver Deleted", description: "The driver has been removed from the registry." });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Delete Failed", description: error.message });
        }
    });

    const handleDelete = (id: string, name: string) => {
        if (window.confirm(`Are you sure you want to remove driver "${name}"? This cannot be undone.`)) {
            deleteDriverMutation.mutate(id);
        }
    };

    // Toggle Driver Active/Inactive Status
    const toggleDriverStatusMutation = useMutation({
        mutationFn: async ({ id, is_active }: { id: string, is_active: boolean }) => {
            const newIsActive = !is_active;
            const newStatus = newIsActive ? "Active" : "Inactive";

            const { error } = await supabase
                .from("logistics_drivers")
                .update({
                    is_active: newIsActive,
                    status: newStatus
                })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["logistics-drivers"] }),
        onError: (error: any) => toast({ variant: "destructive", title: "Error", description: error.message })
    });

    const emergencyReassignMutation = useMutation({
        mutationFn: async ({ driver, newVehicleId, reason }: { driver: any, newVehicleId: string, reason: string }) => {
            const { data: { user } } = await supabase.auth.getUser();

            // 1. Update Driver Assignment
            const { error: updateError } = await supabase
                .from("logistics_drivers")
                .update({ assigned_vehicle_id: newVehicleId === "none" ? null : newVehicleId })
                .eq("id", driver.id);

            if (updateError) throw updateError;

            // 2. Log to Audit Table
            const { error: logError } = await supabase
                .from("logistics_audit_logs")
                .insert([{
                    event_type: 'EMERGENCY_REASSIGNMENT',
                    driver_id: driver.id,
                    vehicle_id: newVehicleId === "none" ? null : newVehicleId,
                    old_values: { assigned_vehicle_id: driver.assigned_vehicle_id },
                    new_values: { assigned_vehicle_id: newVehicleId === "none" ? null : newVehicleId },
                    reason: reason,
                    performed_by: user?.id
                }]);

            if (logError) throw logError;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-drivers"] });
            setIsEmergencyDialogOpen(false);
            setEmergencyReason("");
            setEmergencyDriver(null);
            toast({ title: "Emergency Reassignment Logged", description: "The change has been applied and audited." });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Override Failed", description: error.message });
        }
    });

    const openEditDialog = (driver: any) => {
        setEditingDriver({ ...driver });
        setShowSecondaryPhone(!!driver.phone_secondary);
        setIsEditDialogOpen(true);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "Active": return <Badge className="bg-green-500 hover:bg-green-600"><UserCheck className="w-3 h-3 mr-1" /> Active</Badge>;
            case "On Leave": return <Badge className="bg-blue-500 hover:bg-blue-600"><Calendar className="w-3 h-3 mr-1" /> On Leave</Badge>;
            case "Suspended": return <Badge variant="destructive"><UserMinus className="w-3 h-3 mr-1" /> Suspended</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    const filteredDrivers = drivers?.filter(driver => {
        const matchesSearch = driver.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            driver.license_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            driver.id_number?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesFilter = filterState === "All" || driver.operation_type === filterState;

        return matchesSearch && matchesFilter;
    });

    return (
        <div className="p-4 md:p-8 space-y-8 bg-slate-50/30 min-h-screen">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="bg-primary/5 p-2.5 rounded-xl">
                        <Users className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Driver Management</h1>
                        <p className="text-sm text-slate-500 font-medium">Enroll and manage fleet drivers</p>
                    </div>
                </div>

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#1e293b] hover:bg-[#0f172a] text-white px-6 h-11 rounded-lg text-sm font-semibold shadow-sm transition-all hover:scale-[1.02]">
                            <Plus className="w-4 h-4 mr-2" /> Enroll Driver
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold text-slate-800">Enroll New Driver</DialogTitle>
                            <DialogDescription className="text-xs text-slate-500">
                                Enter the driver's details to register them in the system.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            {/* Row 1: Full Name */}
                            <div className="space-y-2">
                                <Label htmlFor="name">Full Name *</Label>
                                <Input id="name" placeholder="Enter driver's full name" value={newDriver.full_name} onChange={e => setNewDriver({ ...newDriver, full_name: e.target.value })} />
                            </div>

                            {/* Row 2: ID Number & Operation Type */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="id_number">ID Number</Label>
                                    <Input id="id_number" placeholder="National ID" value={newDriver.id_number} onChange={e => setNewDriver({ ...newDriver, id_number: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Operation Type</Label>
                                    <Select value={newDriver.operation_type} onValueChange={v => setNewDriver({ ...newDriver, operation_type: v })}>
                                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Local">Local</SelectItem>
                                            <SelectItem value="Transit">Transit</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Row 3: Phone */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="phone">Phone *</Label>
                                    {!showSecondaryPhone && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowSecondaryPhone(true)}
                                            className="h-7 px-2 text-xs font-bold text-primary hover:bg-primary/5 border border-primary/20 rounded-md"
                                        >
                                            <Plus className="w-3.5 h-3.5 mr-1" /> Add 2nd Number
                                        </Button>
                                    )}
                                </div>
                                <Input id="phone" placeholder="Enter primary contact" value={newDriver.phone_no} onChange={e => setNewDriver({ ...newDriver, phone_no: e.target.value })} />
                            </div>

                            {showSecondaryPhone && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <Label htmlFor="phone_sec" className="text-slate-500">Secondary Phone Number</Label>
                                    <Input id="phone_sec" placeholder="Backup contact" value={newDriver.phone_secondary} onChange={e => setNewDriver({ ...newDriver, phone_secondary: e.target.value })} />
                                </div>
                            )}

                            {/* Row 4: Vehicle Assignment */}
                            <div className="space-y-2">
                                <Label>Vehicle Assignment</Label>
                                <Select
                                    value={newDriver.assigned_vehicle_id || "none"}
                                    onValueChange={v => setNewDriver({ ...newDriver, assigned_vehicle_id: v === "none" ? "" : v })}
                                >
                                    <SelectTrigger className="h-11">
                                        <SelectValue placeholder="Select coupled pair or standalone vehicle" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No Assignment</SelectItem>
                                        {getAvailableForAssignment().map((unit: any) => (
                                            <SelectItem key={unit.id} value={unit.id}>
                                                {unit.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Row 4: License Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="license">License Number</Label>
                                    <Input id="license" placeholder="License number" value={newDriver.license_no} onChange={e => setNewDriver({ ...newDriver, license_no: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="expiry">License Expiry</Label>
                                    <Input id="expiry" type="date" value={newDriver.license_expiry} onChange={e => setNewDriver({ ...newDriver, license_expiry: e.target.value })} />
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                onClick={() => createDriverMutation.mutate(newDriver)}
                                disabled={createDriverMutation.isPending}
                                className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-bold text-lg"
                            >
                                {createDriverMutation.isPending ? "Enrolling..." : "Enroll Driver"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 w-fit">
                    {["All", "Local", "Transit"].map((tab) => (
                        <Button
                            key={tab}
                            variant={filterState === tab ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setFilterState(tab)}
                            className={`h-9 px-6 rounded-md text-sm font-bold transition-all ${filterState === tab ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`}
                        >
                            {tab}
                        </Button>
                    ))}
                </div>

                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search by name, code or ID..."
                        className="pl-10 h-11 border-slate-200 bg-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-slate-200 shadow-sm ml-auto">
                    <span className="text-sm font-bold text-slate-900">{filteredDrivers?.length || 0}</span>
                    <span className="text-xs text-slate-500 font-medium uppercase">drivers</span>
                </div>
            </div>

            {/* Main Table Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="w-[100px] text-xs font-bold text-slate-500 uppercase px-4 h-12">Code</TableHead>
                            <TableHead className="text-xs font-bold text-slate-500 uppercase px-4 h-12">Full Name</TableHead>
                            <TableHead className="text-xs font-bold text-slate-500 uppercase px-4 h-12">Phone(s)</TableHead>
                            <TableHead className="text-xs font-bold text-slate-500 uppercase px-4 h-12">Operation</TableHead>
                            <TableHead className="text-xs font-bold text-slate-500 uppercase px-4 h-12">Assigned Vehicle</TableHead>
                            <TableHead className="text-xs font-bold text-slate-500 uppercase px-4 h-12">License</TableHead>
                            <TableHead className="text-xs font-bold text-slate-500 uppercase px-4 h-12">Availability</TableHead>
                            <TableHead className="text-xs font-bold text-slate-500 uppercase px-4 h-12">Status</TableHead>
                            <TableHead className="text-right text-xs font-bold text-slate-500 uppercase px-4 h-12">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={8} className="h-32 text-center text-slate-400">Loading drivers...</TableCell></TableRow>
                        ) : filteredDrivers?.length === 0 ? (
                            <TableRow><TableCell colSpan={8} className="h-32 text-center text-slate-400">No drivers found.</TableCell></TableRow>
                        ) : (
                            filteredDrivers?.map((driver, index) => (
                                <TableRow key={driver.id} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell className="px-4 py-3 font-medium text-slate-500">D-{(index + 1).toString().padStart(3, '0')}</TableCell>
                                    <TableCell className="px-4 py-3">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-900">{driver.full_name}</span>
                                            <span className="text-xs text-slate-400">ID: {driver.id_number || "—"}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                                                <Phone className="w-3 h-3 text-slate-400" />
                                                {driver.phone_no}
                                            </div>
                                            {driver.phone_secondary && (
                                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                                    <Phone className="w-2.5 h-2.5 text-slate-300" />
                                                    {driver.phone_secondary}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-4 py-3">
                                        <Badge variant="outline" className="rounded-md font-medium">
                                            {driver.operation_type || "Local"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="px-4 py-3">
                                        {driver.assigned_vehicle_id ? (
                                            <div className="flex items-center gap-2 text-primary font-bold">
                                                <Truck className="w-4 h-4" />
                                                {getAssignedUnitLabel(driver) || "Assigned"}
                                            </div>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="px-4 py-3">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-slate-700">{driver.license_no}</span>
                                            <span className={`text-[10px] font-bold ${driver.license_expiry && new Date(driver.license_expiry) < new Date() ? 'text-rose-500' : 'text-slate-400'}`}>
                                                Exp: {driver.license_expiry ? new Date(driver.license_expiry).toLocaleDateString() : "—"}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={(driver as any).is_active !== false}
                                                onCheckedChange={() => toggleDriverStatusMutation.mutate({ id: driver.id, is_active: (driver as any).is_active !== false })}
                                                className="scale-90"
                                            />
                                            <span className="text-[10px] font-medium uppercase text-slate-500">
                                                {(driver as any).is_active !== false ? "Active" : "Inactive"}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-4 py-3">
                                        {getStatusBadge(driver.status || "Active")}
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-1">
                                            {isDriverOnTrip(driver) ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 px-2 text-rose-600 bg-rose-50 hover:bg-rose-100 font-bold text-[10px] uppercase gap-1"
                                                    onClick={() => {
                                                        setEmergencyDriver(driver);
                                                        setIsEmergencyDialogOpen(true);
                                                    }}
                                                >
                                                    <ShieldAlert className="h-3.5 w-3.5" />
                                                    Emergency
                                                </Button>
                                            ) : (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0 text-slate-400 hover:text-primary"
                                                        onClick={() => openEditDialog(driver)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0 text-slate-400 hover:text-rose-500"
                                                        onClick={() => handleDelete(driver.id, (driver as any).full_name)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Edit Driver Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-slate-800">Edit Driver Details</DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Update the driver's information below.
                        </DialogDescription>
                    </DialogHeader>
                    {editingDriver && (
                        <div className="grid gap-4 py-4">
                            {/* Row 1: Full Name */}
                            <div className="space-y-2">
                                <Label htmlFor="edit-name">Full Name *</Label>
                                <Input id="edit-name" placeholder="Enter driver's full name" value={editingDriver.full_name} onChange={e => setEditingDriver({ ...editingDriver, full_name: e.target.value })} />
                            </div>

                            {/* Row 2: ID Number & Operation Type */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-id_number">ID Number</Label>
                                    <Input id="edit-id_number" placeholder="National ID" value={editingDriver.id_number} onChange={e => setEditingDriver({ ...editingDriver, id_number: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Operation Type</Label>
                                    <Select value={editingDriver.operation_type} onValueChange={v => setEditingDriver({ ...editingDriver, operation_type: v })}>
                                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Local">Local</SelectItem>
                                            <SelectItem value="Transit">Transit</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Row 3: Phone */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="edit-phone">Phone *</Label>
                                    {!showSecondaryPhone && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowSecondaryPhone(true)}
                                            className="h-7 px-2 text-xs font-bold text-primary hover:bg-primary/5 border border-primary/20 rounded-md"
                                        >
                                            <Plus className="w-3.5 h-3.5 mr-1" /> Add 2nd Number
                                        </Button>
                                    )}
                                </div>
                                <Input id="edit-phone" placeholder="Enter primary contact" value={editingDriver.phone_no} onChange={e => setEditingDriver({ ...editingDriver, phone_no: e.target.value })} />
                            </div>

                            {showSecondaryPhone && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <Label htmlFor="edit-phone_sec" className="text-slate-500">Secondary Phone Number</Label>
                                    <Input id="edit-phone_sec" placeholder="Backup contact" value={editingDriver.phone_secondary} onChange={e => setEditingDriver({ ...editingDriver, phone_secondary: e.target.value })} />
                                </div>
                            )}

                            {/* Row 4: Vehicle Assignment */}
                            <div className="space-y-2">
                                <Label>Vehicle Assignment</Label>
                                <Select
                                    value={editingDriver.assigned_vehicle_id || "none"}
                                    onValueChange={v => setEditingDriver({ ...editingDriver, assigned_vehicle_id: v === "none" ? "" : v })}
                                >
                                    <SelectTrigger className="h-11">
                                        <SelectValue placeholder="Select coupled pair or standalone vehicle" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No Assignment</SelectItem>
                                        {getAvailableForAssignment().map((unit: any) => (
                                            <SelectItem key={unit.id} value={unit.id}>
                                                {unit.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Row 4: License Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="edit-license">License Number</Label>
                                    <Input id="edit-license" placeholder="License number" value={editingDriver.license_no} onChange={e => setEditingDriver({ ...editingDriver, license_no: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="edit-expiry">License Expiry</Label>
                                    <Input id="edit-expiry" type="date" value={editingDriver.license_expiry} onChange={e => setEditingDriver({ ...editingDriver, license_expiry: e.target.value })} />
                                </div>
                            </div>

                            {/* Row 5: Status */}
                            <div className="space-y-2">
                                <Label>Employment Status</Label>
                                <Select value={editingDriver.status} onValueChange={v => setEditingDriver({ ...editingDriver, status: v })}>
                                    <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Active">Active</SelectItem>
                                        <SelectItem value="On Leave">On Leave</SelectItem>
                                        <SelectItem value="Suspended">Suspended</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            onClick={() => updateDriverMutation.mutate(editingDriver)}
                            disabled={updateDriverMutation.isPending}
                            className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-bold text-lg"
                        >
                            {updateDriverMutation.isPending ? "Updating..." : "Update Driver"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Emergency Reassignment Dialog */}
            <Dialog open={isEmergencyDialogOpen} onOpenChange={setIsEmergencyDialogOpen}>
                <DialogContent className="sm:max-w-[450px] border-rose-200 shadow-2xl">
                    <DialogHeader className="border-b pb-4">
                        <DialogTitle className="text-xl font-bold text-rose-600 flex items-center gap-2">
                            <ShieldAlert className="w-6 h-6" />
                            Emergency Reassignment
                        </DialogTitle>
                        <DialogDescription className="text-rose-500 font-medium pt-1">
                            THIS ACTION BYPASSES SHIPMENT LOCKS AND WILL BE AUDITED.
                        </DialogDescription>
                    </DialogHeader>

                    {emergencyDriver && (
                        <div className="space-y-6 py-6">
                            {/* Alert Box */}
                            <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl flex gap-3 items-start">
                                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                                <div className="text-xs text-rose-700 leading-relaxed">
                                    <span className="font-bold block mb-1 uppercase tracking-wider">Operational Context:</span>
                                    Driver <span className="font-bold underline">{emergencyDriver.full_name}</span> is currently active. Standard reassignment is restricted to prevent shipment data corruption.
                                </div>
                            </div>

                            {/* Vehicle Selection */}
                            <div className="space-y-2">
                                <Label className="text-sm font-bold text-slate-700">New Vehicle Assignment *</Label>
                                <Select
                                    value={emergencyDriver.assigned_vehicle_id || "none"}
                                    onValueChange={v => setEmergencyDriver({ ...emergencyDriver, assigned_vehicle_id: v })}
                                >
                                    <SelectTrigger className="h-12 border-rose-100 focus:ring-rose-200">
                                        <SelectValue placeholder="Select new assignment" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Unassign from Vehicle</SelectItem>
                                        {getAvailableForAssignment()
                                            .filter((unit: any) => unit.id !== (emergencyDriver.logistics_fleet?.id))
                                            .map((unit: any) => (
                                                <SelectItem key={unit.id} value={unit.id}>
                                                    {unit.label}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Reason for Reassignment */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-bold text-slate-700">Reason for Emergency Override *</Label>
                                    <span className="text-[10px] uppercase font-bold text-rose-400 tracking-tighter">Required for Audit</span>
                                </div>
                                <Textarea
                                    placeholder="Explain why this change is necessary during an active trip (e.g., Driver Illness, Vehicle Breakdown, Legal Issues)..."
                                    className="min-h-[100px] border-rose-100 focus:ring-rose-200 resize-none"
                                    value={emergencyReason}
                                    onChange={e => setEmergencyReason(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter className="border-t pt-4">
                        <Button
                            variant="ghost"
                            onClick={() => setIsEmergencyDialogOpen(false)}
                            className="text-slate-500 font-bold"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={!emergencyReason || emergencyReassignMutation.isPending}
                            className="px-8 font-black uppercase text-xs tracking-widest shadow-lg"
                            onClick={() => emergencyReassignMutation.mutate({
                                driver: emergencyDriver,
                                newVehicleId: emergencyDriver.assigned_vehicle_id,
                                reason: emergencyReason
                            })}
                        >
                            {emergencyReassignMutation.isPending ? "Applying Override..." : "Confirm Override"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default DriverRegistry;
