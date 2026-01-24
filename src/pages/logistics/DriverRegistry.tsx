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
import {
    Users, Plus, Search, Filter, Phone, Calendar, ShieldCheck, UserMinus, UserCheck,
    Edit, Trash2, Truck, AlertTriangle, ShieldAlert, FileText, History,
    Camera, FileUp, Printer, AlertCircle, ChevronDown, ChevronUp
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
        notes: "",
        passport_photo_url: ""
    });

    const [driverDocuments, setDriverDocuments] = useState<any[]>([]);
    const [passportFile, setPassportFile] = useState<File | null>(null);
    const [isOverrideDialogOpen, setIsOverrideDialogOpen] = useState(false);
    const [overrideData, setOverrideData] = useState({ reason: "", driver: null as any });

    // Fetch Drivers Data
    const { data: drivers, isLoading } = useQuery({
        queryKey: ["logistics-drivers"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_drivers")
                .select(`
          *,
          logistics_fleet!logistics_drivers_assigned_vehicle_id_fkey(vehicle_no, id, assignment_status, coupling_status),
          logistics_driver_documents(*)
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

    // Fetch Document Types
    const { data: docTypes } = useQuery({
        queryKey: ["logistics-document-types"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_document_types" as any)
                .select("*")
                .order("name", { ascending: true });
            if (error) throw error;
            return data;
        }
    });

    // Calculate all currently assigned vehicle IDs to prevent double-booking
    const assignedVehicleIds = drivers?.map((d: any) => d.assigned_vehicle_id).filter(Boolean) || [];

    const getAvailableForAssignment = (includeVehicleId?: string | null) => {
        if (!fleetAssignment) return [];
        const { fleet, types, couplings } = fleetAssignment;

        return fleet.reduce((acc: any[], item: any) => {
            const typeInfo = types.find((t: any) => t.name === item.asset_type);
            const isHorse = typeInfo?.type_category === "Vehicle";
            const isTrailer = typeInfo?.type_category === "Trailer";

            // Check if this vehicle is already taken by another driver
            const isTaken = assignedVehicleIds.includes(item.id);
            // Allow if it's the specific vehicle currently assigned to the driver being edited
            const isAllowed = !isTaken || (includeVehicleId && item.id === includeVehicleId);

            if (!isAllowed) return acc;

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

    const handlePhotoUpload = async (file: File) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `passport_${Date.now()}.${fileExt}`;
        const { data, error } = await supabase.storage.from('driver-documents').upload(fileName, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('driver-documents').getPublicUrl(fileName);
        return urlData.publicUrl;
    };

    const handleDocumentUpload = async (file: File) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `doc_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error } = await supabase.storage.from('driver-documents').upload(fileName, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('driver-documents').getPublicUrl(fileName);
        return urlData.publicUrl;
    };

    const getDocumentStatus = (expiry: string) => {
        if (!expiry) return 'Normal';
        const expiryDate = new Date(expiry);
        const today = new Date();
        const threeMonthsFromNow = new Date();
        threeMonthsFromNow.setMonth(today.getMonth() + 3);

        if (expiryDate < today) return 'Expired';
        if (expiryDate < threeMonthsFromNow) return 'Expiring';
        return 'Normal';
    };

    // Create Driver Mutation
    const createDriverMutation = useMutation({
        mutationFn: async ({ driver, documents, photoFile }: { driver: any, documents: any[], photoFile: File | null }) => {
            // Start all uploads in parallel
            const photoUploadPromise = photoFile ? handlePhotoUpload(photoFile) : Promise.resolve("");

            // Prepare document upload promises
            const docUploadPromises = documents.map(doc =>
                doc.file ? handleDocumentUpload(doc.file) : Promise.resolve(doc.document_url || "")
            );

            // Wait for photo upload (needed for driver record)
            const photoUrl = await photoUploadPromise;

            // Sanitize driver payload
            const driverPayload = { ...driver, passport_photo_url: photoUrl };
            if (driverPayload.license_expiry === "") driverPayload.license_expiry = null;

            // Insert Driver
            const { data: driverData, error: driverError } = await (supabase
                .from("logistics_drivers" as any)
                .insert([driverPayload])
                .select()
                .single() as any);

            if (driverError) throw driverError;

            // Handle Documents
            if (documents.length > 0) {
                // Wait for all document uploads to complete
                const docUrls = await Promise.all(docUploadPromises);

                const docsToInsert = documents.map((doc, index) => {
                    const { file, ...rest } = doc;
                    const docPayload = {
                        ...rest,
                        document_url: docUrls[index],
                        driver_id: driverData.id
                    };
                    if (docPayload.expiry_date === "") docPayload.expiry_date = null;
                    return docPayload;
                });

                const { error: docsError } = await (supabase
                    .from("logistics_driver_documents" as any)
                    .insert(docsToInsert) as any);
                if (docsError) throw docsError;
            }

            return driverData;
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
                notes: "",
                passport_photo_url: ""
            });
            setDriverDocuments([]);
            setPassportFile(null);
            setShowSecondaryPhone(false);
            toast({ title: "Driver Registered", description: "The new driver and their credentials have been saved." });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message });
        }
    });

    // Update Driver Mutation
    const updateDriverMutation = useMutation({
        mutationFn: async ({ id, updates, documents, photoFile }: { id: string, updates: any, documents: any[], photoFile: File | null }) => {
            let photoUrl = updates.passport_photo_url;
            if (photoFile) {
                photoUrl = await handlePhotoUpload(photoFile);
            }

            // Sanitize updates to remove joined tables that don't exist as columns
            const {
                logistics_driver_documents,
                logistics_fleet,
                ...dirtyUpdates
            } = updates;

            const cleanUpdates = { ...dirtyUpdates };
            if (cleanUpdates.assigned_vehicle_id === "" || cleanUpdates.assigned_vehicle_id === "none") {
                cleanUpdates.assigned_vehicle_id = null;
            }
            if (cleanUpdates.license_expiry === "") cleanUpdates.license_expiry = null;

            const { error: driverError } = await (supabase
                .from("logistics_drivers" as any)
                .update({ ...cleanUpdates, passport_photo_url: photoUrl, updated_at: new Date().toISOString() })
                .eq("id", id) as any);

            if (driverError) throw driverError;

            // Simple logic: delete old and insert new for simplicity in this implementation
            // In a production app, we might want more granular updates
            if (documents.length > 0) {
                await (supabase.from("logistics_driver_documents" as any).delete().eq("driver_id", id) as any);

                const docsToInsert = await Promise.all(documents.map(async (doc) => {
                    let docUrl = doc.document_url || "";
                    if (doc.file) {
                        docUrl = await handleDocumentUpload(doc.file);
                    }
                    const { file, ...rest } = doc;
                    return {
                        ...rest,
                        document_url: docUrl,
                        driver_id: id
                    };
                }));

                const { error: docsError } = await (supabase
                    .from("logistics_driver_documents" as any)
                    .insert(docsToInsert) as any);
                if (docsError) throw docsError;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-drivers"] });
            setIsEditDialogOpen(false);
            setEditingDriver(null);
            setDriverDocuments([]);
            setPassportFile(null);
            toast({ title: "Driver Updated", description: "Driver credentials have been synchronized." });
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

    // Compliance Override Mutation
    const complianceOverrideMutation = useMutation({
        mutationFn: async ({ id, reason, flagged }: { id: string, reason: string, flagged: boolean }) => {
            const { data: { user } } = await supabase.auth.getUser();

            const { error: updateError } = await (supabase
                .from("logistics_drivers" as any)
                .update({
                    compliance_flagged: flagged,
                    compliance_override_reason: reason,
                    compliance_override_at: new Date().toISOString()
                })
                .eq("id", id) as any);

            if (updateError) throw updateError;

            // Log the override in audit logs
            const { error: logError } = await (supabase
                .from("logistics_audit_logs" as any)
                .insert([{
                    event_type: flagged ? 'COMPLIANCE_BLOCKED' : 'COMPLIANCE_OVERRIDE',
                    driver_id: id,
                    reason: reason,
                    performed_by: user?.id,
                    new_values: { compliance_flagged: flagged }
                }]) as any);

            if (logError) throw logError;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-drivers"] });
            setIsOverrideDialogOpen(false);
            setOverrideData({ reason: "", driver: null });
            toast({ title: "Compliance Updated", description: "The driver's status has been updated and audited." });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Override Failed", description: error.message });
        }
    });

    const handleDeleteDocument = async (idx: number, documents: any[], setDocuments: any) => {
        const docToDelete = documents[idx];
        if (docToDelete.document_url && docToDelete.document_url !== "pending") {
            try {
                // Extract file path from URL
                const filePath = docToDelete.document_url.split('/').pop();
                if (filePath) {
                    await supabase.storage.from('driver-documents').remove([filePath]);
                }
            } catch (err) {
                console.error("Error deleting file from storage:", err);
            }
        }
        const updated = documents.filter((_, i) => i !== idx);
        setDocuments(updated);
    };

    const openEditDialog = (driver: any) => {
        setEditingDriver({ ...driver });
        setDriverDocuments(driver.logistics_driver_documents || []);
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

    const filteredDrivers = (drivers as any[])?.filter(driver => {
        const matchesSearch = driver.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
                        <ScrollArea className="max-h-[80vh] px-4">
                            <div className="grid gap-4 py-4 pr-1">
                                {/* Photo Upload Section */}
                                <div className="flex flex-col items-center gap-3 p-4 border-2 border-dashed rounded-xl bg-slate-50/50">
                                    <div className="relative group">
                                        <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden border-2 border-white shadow-md">
                                            {passportFile ? (
                                                <img src={URL.createObjectURL(passportFile)} className="w-full h-full object-cover" alt="Passport" />
                                            ) : (
                                                <Camera className="w-8 h-8 text-slate-400" />
                                            )}
                                        </div>
                                        <Label htmlFor="photo-upload" className="absolute bottom-0 right-0 bg-primary text-white p-1.5 rounded-full cursor-pointer shadow-lg hover:scale-110 transition-transform">
                                            <FileUp className="w-3.5 h-3.5" />
                                            <Input
                                                id="photo-upload"
                                                type="file"
                                                className="hidden"
                                                accept="image/*"
                                                onChange={(e) => setPassportFile(e.target.files?.[0] || null)}
                                            />
                                        </Label>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm font-bold text-slate-700">Passport Photo</p>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-tight">Required for identification</p>
                                    </div>
                                </div>

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

                                {/* Document Management Section */}
                                <div className="space-y-4 border-t pt-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-bold text-slate-700">Licenses & Documents</Label>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-[10px] font-bold uppercase gap-1 border-primary/20 bg-primary/5 text-primary"
                                            onClick={() => setDriverDocuments([...driverDocuments, {
                                                document_type: (docTypes as any)?.find((t: any) => t.category === 'Driver')?.name || "Driving License",
                                                expiry_date: "",
                                                is_mandatory: true,
                                                document_url: "pending"
                                            }])}
                                        >
                                            <Plus className="w-3 h-3" /> Add License
                                        </Button>
                                    </div>

                                    {(driverDocuments || []).map((doc: any, idx: number) => (
                                        <div key={idx} className="p-3 border rounded-lg bg-slate-50 space-y-3 relative">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="absolute top-1 right-1 h-6 w-6 text-slate-400 hover:text-rose-500"
                                                onClick={() => handleDeleteDocument(idx, driverDocuments, setDriverDocuments)}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <Label className="text-[10px]">Type</Label>
                                                    <Select
                                                        value={doc.document_type}
                                                        onValueChange={(v) => {
                                                            const updated = [...driverDocuments];
                                                            updated[idx].document_type = v;
                                                            setDriverDocuments(updated);
                                                        }}
                                                    >
                                                        <SelectTrigger className="h-8 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {(docTypes as any[])?.filter((t: any) => t.category === 'Driver' || t.category === 'General').map((type: any) => (
                                                                <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                                                            ))}
                                                            <SelectItem value="Custom">Custom / Other...</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[10px]">Expiry Date</Label>
                                                    <Input
                                                        type="date"
                                                        className="h-8 text-xs"
                                                        value={doc.expiry_date}
                                                        onChange={(e) => {
                                                            const updated = [...driverDocuments];
                                                            updated[idx].expiry_date = e.target.value;
                                                            setDriverDocuments(updated);
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-white border rounded text-xs text-slate-500 relative overflow-hidden group">
                                                    <FileText className="w-3.5 h-3.5" />
                                                    <span className="truncate max-w-[150px] font-medium text-slate-700">
                                                        {doc.file ? doc.file.name : (doc.document_url ? "File Attached" : "Upload Document (PDF/Image)")}
                                                    </span>
                                                    <Input
                                                        type="file"
                                                        accept=".pdf,image/*"
                                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                const updated = [...driverDocuments];
                                                                updated[idx].file = file;
                                                                setDriverDocuments(updated);
                                                            }
                                                        }}
                                                    />
                                                    <Button size="sm" variant="ghost" className="ml-auto h-6 px-1.5 text-[10px] text-primary bg-primary/5 hover:bg-primary/10 relative z-0">Browse</Button>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch
                                                        checked={doc.is_mandatory}
                                                        onCheckedChange={(v) => {
                                                            const updated = [...driverDocuments];
                                                            updated[idx].is_mandatory = v;
                                                            setDriverDocuments(updated);
                                                        }}
                                                        className="scale-75"
                                                    />
                                                    <span className="text-[9px] uppercase font-bold text-slate-500">Mandatory</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </ScrollArea>
                        <DialogFooter className="bg-slate-50 p-4 -mx-6 -mb-6 border-t rounded-b-lg">
                            <Button
                                onClick={() => createDriverMutation.mutate({ driver: newDriver, documents: driverDocuments, photoFile: passportFile })}
                                disabled={createDriverMutation.isPending}
                                className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-bold text-lg shadow-lg"
                            >
                                {createDriverMutation.isPending ? "Validating Credentials..." : "Enroll Driver & Sync Docs"}
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
                            (filteredDrivers as any[])?.map((driver: any, index: number) => (
                                <TableRow key={driver.id} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell className="px-4 py-3 font-medium text-slate-500">D-{(index + 1).toString().padStart(3, '0')}</TableCell>
                                    <TableCell className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 border overflow-hidden shrink-0">
                                                {driver.passport_photo_url ? (
                                                    <img src={driver.passport_photo_url} className="w-full h-full object-cover" alt={driver.full_name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                        <Users className="w-5 h-5" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-900">{driver.full_name}</span>
                                                    {driver.compliance_flagged && (
                                                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 fill-rose-50" />
                                                    )}
                                                </div>
                                                <span className="text-xs text-slate-400">ID: {driver.id_number || "—"}</span>
                                            </div>
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
                                        <div className="flex flex-col gap-1.5">
                                            {driver.logistics_driver_documents?.length > 0 ? (
                                                driver.logistics_driver_documents.map((doc: any, i: number) => {
                                                    const status = getDocumentStatus(doc.expiry_date);
                                                    return (
                                                        <div key={i} className="flex flex-col">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[10px] font-bold text-slate-600 truncate max-w-[80px]">{doc.document_type}</span>
                                                                <div className={`w-1.5 h-1.5 rounded-full ${status === 'Expired' ? 'bg-rose-500 animate-pulse' : status === 'Expiring' ? 'bg-amber-500' : 'bg-green-500'}`} />
                                                            </div>
                                                            <span className={`text-[9px] font-medium ${status === 'Expired' ? 'text-rose-600 font-bold' : status === 'Expiring' ? 'text-amber-600' : 'text-slate-400'}`}>
                                                                Exp: {doc.expiry_date}
                                                            </span>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-slate-700">{driver.license_no}</span>
                                                    <span className={`text-[10px] font-bold ${driver.license_expiry && new Date(driver.license_expiry) < new Date() ? 'text-rose-500' : 'text-slate-400'}`}>
                                                        Exp: {driver.license_expiry ? new Date(driver.license_expiry).toLocaleDateString() : "—"}
                                                    </span>
                                                </div>
                                            )}
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
                                        {driver.compliance_flagged ? (
                                            <Badge variant="destructive" className="bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-200">
                                                <ShieldAlert className="w-3 h-3 mr-1" /> Blocked
                                            </Badge>
                                        ) : (
                                            getStatusBadge(driver.status || "Active")
                                        )}
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-1">
                                            {driver.compliance_flagged ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 px-2 text-primary bg-primary/5 hover:bg-primary/10 font-bold text-[10px] uppercase gap-1"
                                                    onClick={() => {
                                                        setOverrideData({ reason: "", driver: driver });
                                                        setIsOverrideDialogOpen(true);
                                                    }}
                                                >
                                                    <ShieldCheck className="h-3.5 w-3.5" />
                                                    Re-Enable
                                                </Button>
                                            ) : isDriverOnTrip(driver) ? (
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
                        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                            {/* Photo Upload Section */}
                            <div className="flex flex-col items-center gap-3 p-4 border-2 border-dashed rounded-xl bg-slate-50/50">
                                <div className="relative group">
                                    <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden border-2 border-white shadow-md">
                                        {passportFile ? (
                                            <img src={URL.createObjectURL(passportFile)} className="w-full h-full object-cover" alt="Passport" />
                                        ) : editingDriver.passport_photo_url ? (
                                            <img src={editingDriver.passport_photo_url} className="w-full h-full object-cover" alt="Passport" />
                                        ) : (
                                            <Camera className="w-8 h-8 text-slate-400" />
                                        )}
                                    </div>
                                    <Label htmlFor="edit-photo-upload" className="absolute bottom-0 right-0 bg-primary text-white p-1.5 rounded-full cursor-pointer shadow-lg hover:scale-110 transition-transform">
                                        <FileUp className="w-3.5 h-3.5" />
                                        <Input
                                            id="edit-photo-upload"
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => setPassportFile(e.target.files?.[0] || null)}
                                        />
                                    </Label>
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-bold text-slate-700">Update Passport Photo</p>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-tight">Identification & Security</p>
                                </div>
                            </div>

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
                                        <SelectValue placeholder="Select unit" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No Assignment</SelectItem>
                                        {getAvailableForAssignment(editingDriver.assigned_vehicle_id).map((unit: any) => (
                                            <SelectItem key={unit.id} value={unit.id}>
                                                {unit.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Document Management Section */}
                            <div className="space-y-4 border-t pt-4">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-bold text-slate-700">Licenses & Credentials</Label>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-[10px] font-bold uppercase gap-1 border-primary/20 bg-primary/5 text-primary"
                                        onClick={() => setDriverDocuments([...driverDocuments, {
                                            document_type: (docTypes as any)?.find((t: any) => t.category === 'Driver')?.name || "Driving License",
                                            expiry_date: "",
                                            is_mandatory: true,
                                            document_url: "pending"
                                        }])}
                                    >
                                        <Plus className="w-3 h-3" /> Add Credential
                                    </Button>
                                </div>

                                {(driverDocuments || []).map((doc: any, idx: number) => (
                                    <div key={idx} className="p-3 border rounded-lg bg-slate-50 space-y-3 relative">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="absolute top-1 right-1 h-6 w-6 text-slate-400 hover:text-rose-500"
                                            onClick={() => handleDeleteDocument(idx, driverDocuments, setDriverDocuments)}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-[10px]">Type</Label>
                                                <Select
                                                    value={doc.document_type}
                                                    onValueChange={(v) => {
                                                        const updated = [...driverDocuments];
                                                        updated[idx].document_type = v;
                                                        setDriverDocuments(updated);
                                                    }}
                                                >
                                                    <SelectTrigger className="h-8 text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {(docTypes as any[])?.filter((t: any) => t.category === 'Driver' || t.category === 'General').map((type: any) => (
                                                            <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                                                        ))}
                                                        <SelectItem value="Custom">Custom / Other...</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px]">Expiry Date</Label>
                                                <Input
                                                    type="date"
                                                    className="h-8 text-xs"
                                                    value={doc.expiry_date}
                                                    onChange={(e) => {
                                                        const updated = [...driverDocuments];
                                                        updated[idx].expiry_date = e.target.value;
                                                        setDriverDocuments(updated);
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-white border rounded text-xs text-slate-500">
                                                <FileText className="w-3.5 h-3.5" />
                                                <span>{doc.document_url !== "pending" ? "File Attached" : "Browse for PDF"}</span>
                                                <Button size="sm" variant="ghost" className="ml-auto h-6 px-1.5 text-[10px] text-primary">Browse</Button>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={doc.is_mandatory}
                                                    onCheckedChange={(v) => {
                                                        const updated = [...driverDocuments];
                                                        updated[idx].is_mandatory = v;
                                                        setDriverDocuments(updated);
                                                    }}
                                                    className="scale-75"
                                                />
                                                <span className="text-[9px] uppercase font-bold text-slate-500">Mandatory</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <DialogFooter className="bg-slate-50 p-4 -mx-6 -mb-6 border-t rounded-b-lg">
                        <Button
                            onClick={() => updateDriverMutation.mutate({
                                id: editingDriver.id,
                                updates: editingDriver,
                                documents: driverDocuments,
                                photoFile: passportFile
                            })}
                            disabled={updateDriverMutation.isPending}
                            className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-bold text-lg shadow-lg"
                        >
                            {updateDriverMutation.isPending ? "Synchronizing..." : "Update Driver & Credentials"}
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
                                        {getAvailableForAssignment(null)
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
            {/* Compliance Override Dialog */}
            <Dialog open={isOverrideDialogOpen} onOpenChange={setIsOverrideDialogOpen}>
                <DialogContent className="sm:max-w-[450px] border-primary/20 shadow-2xl">
                    <DialogHeader className="border-b pb-4">
                        <DialogTitle className="text-xl font-bold text-primary flex items-center gap-2">
                            <ShieldCheck className="w-6 h-6" />
                            Logistics Compliance Management
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 font-medium pt-1">
                            Manual override of document compliance status.
                        </DialogDescription>
                    </DialogHeader>

                    {overrideData.driver && (
                        <div className="space-y-6 py-6">
                            <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3 items-start">
                                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                <div className="text-xs text-amber-700 leading-relaxed">
                                    <span className="font-bold block mb-1 uppercase tracking-wider">Driver Status:</span>
                                    {overrideData.driver.full_name} is currently flagged as non-compliant. By re-enabling, you assume responsibility for their dispatch.
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-bold text-slate-700">Genuine Reason for Override *</Label>
                                    <span className="text-[10px] uppercase font-bold text-primary tracking-tighter">Required for Audit</span>
                                </div>
                                <Textarea
                                    placeholder="Explain why this driver is allowed to proceed (e.g., Renewal in progress, Office error)..."
                                    className="min-h-[100px] border-slate-200 focus:ring-primary/20 resize-none"
                                    value={overrideData.reason}
                                    onChange={e => setOverrideData({ ...overrideData, reason: e.target.value })}
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter className="border-t pt-4">
                        <Button
                            variant="ghost"
                            onClick={() => setIsOverrideDialogOpen(false)}
                            className="text-slate-500 font-bold"
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={!overrideData.reason || complianceOverrideMutation.isPending}
                            className="px-8 font-black uppercase text-xs tracking-widest shadow-lg bg-primary"
                            onClick={() => complianceOverrideMutation.mutate({
                                id: overrideData.driver.id,
                                reason: overrideData.reason,
                                flagged: false
                            })}
                        >
                            {complianceOverrideMutation.isPending ? "Applying..." : "Grant Clearance"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default DriverRegistry;
