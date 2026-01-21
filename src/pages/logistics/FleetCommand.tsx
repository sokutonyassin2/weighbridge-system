import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Plus, Search, Filter, MoreVertical, Edit, Trash2, AlertTriangle, CheckCircle2, Clock, Settings, XCircle, Link, Unlink, FileText, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

const FleetCommand = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("all");
    const [activeTypeTab, setActiveTypeTab] = useState<"Vehicle" | "Trailer">("Vehicle");
    const [activeRegTab, setActiveRegTab] = useState<"Vehicle" | "Trailer">("Vehicle");
    const [isCouplingDialogOpen, setIsCouplingDialogOpen] = useState(false);
    const [selectedVehicleForCoupling, setSelectedVehicleForCoupling] = useState<any>(null);
    const [selectedPartnerVehicle, setSelectedPartnerVehicle] = useState("");
    const [couplingNotes, setCouplingNotes] = useState("");
    const [isAssetTypesCollapsed, setIsAssetTypesCollapsed] = useState(true); // Collapsed by default

    // For Asset Types
    const [newType, setNewType] = useState({
        name: "",
        description: "",
        type_category: "Vehicle" as "Vehicle" | "Trailer",
        is_active: true
    });

    // For Registered Assets
    const [newAsset, setNewAsset] = useState({
        vehicle_no: "",
        horse_number: "",
        trailer_number: "",
        make_model: "",
        asset_type: "",
        fleet_category: "Local",
        asset_status: "Active",
        notes: "",
        branding_form_url: ""
    });
    const [brandingFile, setBrandingFile] = useState<File | null>(null);

    // Fetch Fleet Data
    const { data: fleet, isLoading } = useQuery({
        queryKey: ["logistics-fleet"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_fleet")
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        }
    });

    // Fetch Dynamic Asset Types (Show both active and inactive)
    const { data: assetTypes } = useQuery({
        queryKey: ["logistics-asset-types"],
        queryFn: async () => {
            const { data, error } = await supabase.from("logistics_asset_types")
                .select("*")
                .order("name", { ascending: true });
            if (error) throw error;
            return data;
        }
    });

    // Fetch Active Couplings
    const { data: couplings } = useQuery({
        queryKey: ["logistics-couplings"],
        queryFn: async () => {
            const { data, error } = await supabase.from("logistics_couplings")
                .select("*")
                .eq("is_active", true);
            if (error) throw error;
            return data;
        }
    });

    // Asset Type Mutations
    const createTypeMutation = useMutation({
        mutationFn: async (type: typeof newType) => {
            const { data, error } = await supabase.from("logistics_asset_types").insert([type]).select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-asset-types"] });
            setIsTypeDialogOpen(false);
            setNewType({ name: "", description: "", type_category: "Vehicle", is_active: true });
            toast({ title: "Type Added", description: "New asset type registered." });
        },
        onError: (error: any) => toast({ variant: "destructive", title: "Error", description: error.message })
    });

    const toggleTypeMutation = useMutation({
        mutationFn: async ({ id, is_active }: { id: string, is_active: boolean }) => {
            const { error } = await supabase.from("logistics_asset_types").update({ is_active: !is_active }).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["logistics-asset-types"] }),
        onError: (error: any) => toast({ variant: "destructive", title: "Error", description: error.message })
    });

    const deleteTypeMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("logistics_asset_types").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-asset-types"] });
            toast({ title: "Type Deleted", description: "Asset type removed." });
        }
    });

    const createAssetMutation = useMutation({
        mutationFn: async (asset: any) => {
            const { data, error } = await supabase.from("logistics_fleet").insert([asset]).select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-fleet"] });
            setIsDialogOpen(false);
            setNewAsset({ vehicle_no: "", horse_number: "", trailer_number: "", make_model: "", asset_type: "", fleet_category: "Local", asset_status: "Active", notes: "", branding_form_url: "" });
            setBrandingFile(null);
            toast({ title: "Vehicle Registered", description: "The vehicle has been added to the registry." });
        },
        onError: (error: any) => toast({ variant: "destructive", title: "Error", description: error.message })
    });

    const deleteAssetMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("logistics_fleet").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-fleet"] });
            toast({ title: "Vehicle Deleted", description: "Vehicle removed from registry." });
        },
        onError: (error: any) => toast({ variant: "destructive", title: "Error", description: error.message })
    });

    // Coupling Mutations
    const coupleMutation = useMutation({
        mutationFn: async ({ horseId, trailerId, notes }: { horseId: string, trailerId: string, notes?: string }) => {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase.from("logistics_couplings").insert([{
                horse_id: horseId,
                trailer_id: trailerId,
                coupled_by: user?.id,
                notes: notes || null
            }]);
            if (error) throw error;

            // Update coupling status for both vehicles
            await supabase.from("logistics_fleet").update({ coupling_status: "coupled" }).eq("id", horseId);
            await supabase.from("logistics_fleet").update({ coupling_status: "coupled" }).eq("id", trailerId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-fleet"] });
            queryClient.invalidateQueries({ queryKey: ["logistics-couplings"] });
            setIsCouplingDialogOpen(false);
            setSelectedVehicleForCoupling(null);
            setSelectedPartnerVehicle("");
            setCouplingNotes("");
            toast({ title: "Vehicles Coupled", description: "The vehicles have been successfully coupled." });
        },
        onError: (error: any) => toast({ variant: "destructive", title: "Coupling Failed", description: error.message })
    });

    const uncoupleMutation = useMutation({
        mutationFn: async (couplingId: string) => {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: coupling, error: fetchError } = await supabase.from("logistics_couplings")
                .select("*")
                .eq("id", couplingId)
                .single();
            if (fetchError) throw fetchError;

            const { error } = await supabase.from("logistics_couplings")
                .update({ is_active: false, uncoupled_at: new Date().toISOString(), uncoupled_by: user?.id })
                .eq("id", couplingId);
            if (error) throw error;

            // Update coupling status for both vehicles
            await supabase.from("logistics_fleet").update({ coupling_status: "uncoupled" }).eq("id", coupling.horse_id);
            await supabase.from("logistics_fleet").update({ coupling_status: "uncoupled" }).eq("id", coupling.trailer_id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-fleet"] });
            queryClient.invalidateQueries({ queryKey: ["logistics-couplings"] });
            toast({ title: "Vehicles Uncoupled", description: "The vehicles have been successfully uncoupled." });
        },
        onError: (error: any) => toast({ variant: "destructive", title: "Uncoupling Failed", description: error.message })
    });

    // Operation Type Switching Mutation
    const switchOperationMutation = useMutation({
        mutationFn: async ({ id, newOperation }: { id: string, newOperation: string }) => {
            const { error } = await supabase.from("logistics_fleet")
                .update({ fleet_category: newOperation })
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-fleet"] });
            toast({ title: "Operation Switched", description: "Vehicle operation type has been updated." });
        },
        onError: (error: any) => toast({ variant: "destructive", title: "Switch Failed", description: error.message })
    });

    const deleteAssetMutation_old = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("logistics_fleet").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-fleet"] });
            toast({ title: "Vehicle Deleted", description: "Vehicle removed from registry." });
        },
        onError: (error: any) => toast({ variant: "destructive", title: "Error", description: error.message })
    });

    const updateAssetMutation = useMutation({
        mutationFn: async (asset: any) => {
            const { id, ...updateData } = asset;
            const { data, error } = await supabase.from("logistics_fleet").update(updateData).eq("id", id).select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-fleet"] });
            setIsDialogOpen(false);
            setEditingAsset(null);
            toast({ title: "Vehicle Updated", description: "The vehicle details have been updated." });
        },
        onError: (error: any) => toast({ variant: "destructive", title: "Error", description: error.message })
    });

    const toggleAssetStatusMutation = useMutation({
        mutationFn: async ({ id, is_active }: { id: string, is_active: boolean }) => {
            // Toggle is_active and sync asset_status
            const newIsActive = !is_active;
            const newAssetStatus = newIsActive ? "Active" : "Inactive";

            const { error } = await supabase.from("logistics_fleet").update({
                is_active: newIsActive,
                asset_status: newAssetStatus
            }).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["logistics-fleet"] }),
        onError: (error: any) => toast({ variant: "destructive", title: "Error", description: error.message })
    });

    const [editingAsset, setEditingAsset] = useState<any>(null);

    const handleEditAsset = (asset: any) => {
        // Block editing if active
        if (asset.assignment_status === "On Job" || asset.assignment_status === "In Transit") {
            toast({
                variant: "destructive",
                title: "Editing Restricted",
                description: `This vehicle is currently ${asset.assignment_status === "On Job" ? "on an active job" : "in transit"}. Please use the Driver Management emergency override for reassignment.`
            });
            return;
        }

        setEditingAsset(asset);

        // Determine category based on asset type
        const typeInfo = assetTypes?.find((t) => t.name === asset.asset_type);
        const category = typeInfo?.type_category || (asset.trailer_number && !asset.vehicle_no ? "Trailer" : "Vehicle");
        setActiveRegTab(category as "Vehicle" | "Trailer");

        setNewAsset({
            vehicle_no: asset.vehicle_no || asset.horse_number || asset.trailer_number || "",
            horse_number: asset.horse_number || "",
            trailer_number: asset.trailer_number || "",
            make_model: asset.make_model || "",
            asset_type: asset.asset_type || "",
            fleet_category: asset.fleet_category || "Local",
            asset_status: asset.asset_status || "Active",
            notes: asset.notes || "",
            branding_form_url: asset.branding_form_url || ""
        });
        setIsDialogOpen(true);
    };

    const handleRegisterOrUpdate = async () => {
        console.log("=== REGISTRATION VALIDATION START ===");
        console.log("Active Tab:", activeRegTab);
        console.log("Vehicle No:", newAsset.vehicle_no);
        console.log("Asset Type:", newAsset.asset_type);

        // Comprehensive Security & Validation Check
        if (!newAsset.vehicle_no) {
            console.log("❌ VALIDATION FAILED: Missing vehicle_no");
            toast({
                variant: "destructive",
                title: "Missing ID",
                description: `Please enter a ${activeRegTab === 'Vehicle' ? 'Plate Number' : 'Trailer Number'}.`
            });
            return;
        }

        if (!newAsset.asset_type) {
            console.log("❌ VALIDATION FAILED: Missing asset_type");
            toast({
                variant: "destructive",
                title: "Selection Required",
                description: `You cannot register a ${activeRegTab.toLowerCase()} without choosing a ${activeRegTab} Type first.`
            });
            return;
        }

        console.log("✅ VALIDATION PASSED - Proceeding with registration");
        const finalAsset = { ...newAsset };

        // Upload branding form if provided
        if (brandingFile) {
            try {
                const fileExt = brandingFile.name.split('.').pop();
                const fileName = `${newAsset.vehicle_no.replace(/\s+/g, '_')}_${Date.now()}.${fileExt}`;

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('branding-forms')
                    .upload(fileName, brandingFile, {
                        contentType: brandingFile.type,
                        upsert: false
                    });

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage
                    .from('branding-forms')
                    .getPublicUrl(fileName);

                finalAsset.branding_form_url = urlData.publicUrl;
            } catch (error: any) {
                toast({
                    variant: "destructive",
                    title: "Upload Failed",
                    description: `Failed to upload branding form: ${error.message}`
                });
                return;
            }
        }

        // Map plate to correct columns based on category
        if (activeRegTab === "Vehicle") {
            finalAsset.horse_number = newAsset.vehicle_no;
            finalAsset.trailer_number = "";
        } else {
            finalAsset.trailer_number = newAsset.vehicle_no;
            finalAsset.vehicle_no = "";
            finalAsset.horse_number = "";
        }

        if (editingAsset) {
            updateAssetMutation.mutate({ id: editingAsset.id, ...finalAsset });
        } else {
            createAssetMutation.mutate(finalAsset as any);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "Active": return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" /> Active</Badge>;
            case "Maintenance": return <Badge className="bg-amber-500 hover:bg-amber-600"><Clock className="w-3 h-3 mr-1" /> Maintenance</Badge>;
            case "Breakdown": return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" /> Breakdown</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    // ========== COUPLING HELPER FUNCTIONS ==========

    // Get the coupled partner vehicle for a given asset
    const getCoupledPartner = (assetId: string) => {
        if (!couplings || !fleet) return null;

        const coupling = couplings.find((c: any) =>
            c.horse_id === assetId || c.trailer_id === assetId
        );

        if (!coupling) return null;

        const partnerId = coupling.horse_id === assetId ? coupling.trailer_id : coupling.horse_id;
        return fleet.find((a: any) => a.id === partnerId);
    };

    // Check if an asset is a horse (based on asset type category)
    const isHorse = (asset: any) => {
        const typeInfo = assetTypes?.find((t) => t.name === asset.asset_type);
        return typeInfo?.type_category === "Vehicle";
    };

    // Check if an asset is a trailer
    const isTrailer = (asset: any) => {
        const typeInfo = assetTypes?.find((t) => t.name === asset.asset_type);
        return typeInfo?.type_category === "Trailer";
    };

    // Check if an asset can be coupled (only horses and trailers)
    const canBeCoupled = (asset: any) => {
        const typeInfo = assetTypes?.find((t) => t.name === asset.asset_type);
        if (!typeInfo) return false;

        // Always allow trailers to be coupled
        if (typeInfo.type_category === "Trailer") return true;

        // For vehicles, only allow specific types that can pull trailers
        // Exclude standalone vehicles like Pickup, Tanker, Tricycle Motorcycle, etc.
        const couplableVehicleTypes = ["Horse", "Truck", "Tractor"]; // Add more as needed
        return typeInfo.type_category === "Vehicle" && couplableVehicleTypes.includes(typeInfo.name);
    };

    // Get available vehicles for coupling with the selected vehicle
    const getAvailableForCoupling = (selectedVehicle: any) => {
        if (!fleet || !assetTypes) return [];

        const isSelectedHorse = isHorse(selectedVehicle);

        return fleet.filter((asset: any) => {
            // Don't show the selected vehicle itself
            if (asset.id === selectedVehicle.id) return false;

            // Only show uncoupled vehicles
            if (asset.coupling_status === "coupled") return false;

            // If selected is a horse, show only trailers
            if (isSelectedHorse) return isTrailer(asset);

            // If selected is a trailer, show only horses
            return isHorse(asset);
        });
    };

    // Handle opening the coupling dialog
    const handleOpenCouplingDialog = (vehicle: any) => {
        setSelectedVehicleForCoupling(vehicle);
        setSelectedPartnerVehicle("");
        setCouplingNotes("");
        setIsCouplingDialogOpen(true);
    };

    // Handle coupling submission
    const handleCoupleVehicles = () => {
        if (!selectedVehicleForCoupling || !selectedPartnerVehicle) {
            toast({
                variant: "destructive",
                title: "Selection Required",
                description: "Please select a vehicle to couple with."
            });
            return;
        }

        const horseId = isHorse(selectedVehicleForCoupling) ? selectedVehicleForCoupling.id : selectedPartnerVehicle;
        const trailerId = isTrailer(selectedVehicleForCoupling) ? selectedVehicleForCoupling.id : selectedPartnerVehicle;

        coupleMutation.mutate({ horseId, trailerId, notes: couplingNotes });
    };

    // Handle uncoupling
    const handleUncoupleVehicle = (asset: any) => {
        // Block uncoupling if active
        if (asset.assignment_status === "On Job" || asset.assignment_status === "In Transit") {
            toast({
                variant: "destructive",
                title: "Uncoupling Restricted",
                description: "Cannot uncouple vehicles while they are on an active job or in transit."
            });
            return;
        }

        const coupling = couplings?.find((c: any) =>
            c.horse_id === asset.id || c.trailer_id === asset.id
        );

        if (coupling) {
            uncoupleMutation.mutate(coupling.id);
        }
    };

    // Handle operation type switching
    const handleSwitchOperation = (asset: any, newOperation: string) => {
        // Check if vehicle is on job or in transit
        if (asset.assignment_status === "On Job" || asset.assignment_status === "In Transit") {
            toast({
                variant: "destructive",
                title: "Cannot Switch Operation",
                description: `This vehicle is currently ${asset.assignment_status === "On Job" ? "on an active job" : "in transit"} and cannot be switched.`
            });
            return;
        }

        // If vehicle is coupled, ask if user wants to switch both
        if (asset.coupling_status === "coupled") {
            const partner = getCoupledPartner(asset.id);
            if (partner) {
                // For now, just switch the single vehicle
                // TODO: Add confirmation dialog for switching both
                switchOperationMutation.mutate({ id: asset.id, newOperation });
            }
        } else {
            switchOperationMutation.mutate({ id: asset.id, newOperation });
        }
    };

    const displayFleet = (() => {
        if (!fleet) return [];

        const baseFiltered = fleet.filter(item => {
            const matchesSearch = (item.vehicle_no || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.horse_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.trailer_number || "").toLowerCase().includes(searchTerm.toLowerCase());

            if (activeTab === "all") return matchesSearch;
            return matchesSearch && (item.fleet_category || "").toLowerCase() === activeTab.toLowerCase();
        });

        const merged: any[] = [];
        const processedIds = new Set();

        baseFiltered.forEach(item => {
            if (processedIds.has(item.id)) return;

            if (item.coupling_status === 'coupled') {
                const partner = getCoupledPartner(item.id);
                if (partner) {
                    const horse = isHorse(item) ? item : partner;
                    const trailer = isTrailer(item) ? item : partner;

                    merged.push({
                        ...horse,
                        is_merged: true,
                        partner: trailer,
                        display_id: `${horse.vehicle_no || horse.horse_number || '—'} + ${trailer.vehicle_no || trailer.trailer_number || '—'}`,
                        display_type: `${horse.asset_type} + ${trailer.asset_type}`,
                        display_make: horse.make_model === trailer.make_model ? horse.make_model : `${horse.make_model || '—'} / ${trailer.make_model || '—'}`
                    });

                    processedIds.add(horse.id);
                    processedIds.add(trailer.id);
                } else {
                    merged.push(item);
                    processedIds.add(item.id);
                }
            } else {
                merged.push(item);
                processedIds.add(item.id);
            }
        });

        return merged;
    })();

    return (
        <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-fade-in">
            {/* Header - Unified with Weighbridge style */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <img
                        src="/images/energy-feeds-logo.jpg"
                        alt="Energy Feeds"
                        className="h-8 md:h-10 object-contain"
                    />
                    <div>
                        <h1 className="text-xl md:text-3xl font-bold">Fleet Command</h1>
                        <p className="text-xs md:text-sm text-muted-foreground">Manage company vehicles and heavy equipment</p>
                    </div>
                </div>
            </div>

            {/* 1. Vehicle Types Management Section */}
            <Card className="border-primary">
                <CardHeader className="p-3 md:p-6 pb-3 border-b flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-base md:text-xl font-bold flex items-center gap-2">
                            <Settings className="w-5 h-5 text-primary" />
                            Asset Types (Admin Only)
                        </CardTitle>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsAssetTypesCollapsed(!isAssetTypesCollapsed)}
                            className="h-8 w-8 p-0"
                        >
                            {isAssetTypesCollapsed ? <Plus className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </Button>
                    </div>
                    <Dialog open={isTypeDialogOpen} onOpenChange={(open) => {
                        setIsTypeDialogOpen(open);
                        if (open) {
                            setNewType(prev => ({ ...prev, type_category: activeTypeTab }));
                        }
                    }}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="h-8 gap-1">
                                <Plus className="w-4 h-4" /> Add Type
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[400px]">
                            <DialogHeader>
                                <DialogTitle>Add Asset Type</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label>Name (English) *</Label>
                                    <Input placeholder="e.g., Horse" value={newType.name} onChange={e => setNewType({ ...newType, name: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Type Category *</Label>
                                    <Select
                                        value={newType.type_category}
                                        onValueChange={(v: "Vehicle" | "Trailer") => setNewType({ ...newType, type_category: v })}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Vehicle">Vehicle</SelectItem>
                                            <SelectItem value="Trailer">Trailer</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Description</Label>
                                    <Input placeholder="Brief description" value={newType.description} onChange={e => setNewType({ ...newType, description: e.target.value })} />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button className="w-full bg-primary" onClick={() => createTypeMutation.mutate(newType)}>Add Type</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </CardHeader>
                {!isAssetTypesCollapsed && (
                    <CardContent className="p-0">
                        <Tabs value={activeTypeTab} onValueChange={(v: any) => setActiveTypeTab(v)} className="w-full">
                            <TabsList className="w-full justify-start rounded-none border-b bg-slate-50/50 p-0 h-10">
                                <TabsTrigger value="Vehicle" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-white h-10 px-6">Vehicle Types</TabsTrigger>
                                <TabsTrigger value="Trailer" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-white h-10 px-6">Trailer Types</TabsTrigger>
                            </TabsList>

                            {["Vehicle", "Trailer"].map((category) => (
                                <TabsContent key={category} value={category} className="m-0">
                                    <Table>
                                        <TableHeader className="bg-slate-50/50">
                                            <TableRow>
                                                <TableHead className="pl-6">Name</TableHead>
                                                <TableHead>Description</TableHead>
                                                <TableHead>Active</TableHead>
                                                <TableHead className="text-right pr-6">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {assetTypes?.filter((t) => (t.type_category || 'Vehicle') === category).map((type) => (
                                                <TableRow key={type.id}>
                                                    <TableCell className="font-medium pl-6">{type.name}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{type.description || "—"}</TableCell>
                                                    <TableCell>
                                                        <Switch
                                                            checked={type.is_active}
                                                            onCheckedChange={() => toggleTypeMutation.mutate({ id: type.id, is_active: type.is_active })}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => deleteTypeMutation.mutate(type.id)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {assetTypes?.filter((t: any) => (t.type_category || 'Vehicle') === category).length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground text-xs italic">
                                                        No {category.toLowerCase()} types defined.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </TabsContent>
                            ))}
                        </Tabs>
                    </CardContent>
                )}
            </Card>

            {/* Registration Dialog */}
            <div className="flex justify-end pt-4">
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) {
                        setEditingAsset(null);
                        setActiveRegTab("Vehicle"); // Reset to Vehicle category
                        setNewAsset({ vehicle_no: "", horse_number: "", trailer_number: "", make_model: "", asset_type: "", fleet_category: "Local", asset_status: "Active", notes: "", branding_form_url: "" });
                        setBrandingFile(null);
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-slate-800 hover:bg-slate-900 shadow-md">
                            <Plus className="w-4 h-4 mr-2" /> Register Vehicle
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[450px]">
                        <DialogHeader>
                            <DialogTitle>{editingAsset ? "Edit Vehicle Details" : "Register New Vehicle"}</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-6 py-4">
                            {/* Integrated Category & Type Selection */}
                            <div className="space-y-4">
                                <Label className="text-sm font-semibold">Select Asset Category & Type *</Label>
                                <Tabs
                                    value={activeRegTab}
                                    onValueChange={(v: any) => {
                                        setActiveRegTab(v);
                                        setNewAsset({ ...newAsset, asset_type: "" });
                                    }}
                                    className="w-full"
                                >
                                    <TabsList className="grid w-full grid-cols-2 mb-4">
                                        <TabsTrigger value="Vehicle" className="flex items-center gap-2">
                                            <Truck className="w-4 h-4" /> Vehicle
                                        </TabsTrigger>
                                        <TabsTrigger value="Trailer" className="flex items-center gap-2">
                                            <Truck className="w-4 h-4 rotate-180" /> Trailer
                                        </TabsTrigger>
                                    </TabsList>

                                    {["Vehicle", "Trailer"].map((cat) => (
                                        <TabsContent key={cat} value={cat} className="space-y-3 mt-0 border-t pt-4">
                                            <div className="space-y-2">
                                                <Label className="text-sm font-semibold">{cat} Type *</Label>
                                                <Select
                                                    value={newAsset.asset_type}
                                                    onValueChange={v => setNewAsset({ ...newAsset, asset_type: v })}
                                                >
                                                    <SelectTrigger className="bg-white border-2 h-11 focus:ring-primary">
                                                        <SelectValue placeholder={`Select ${cat.toLowerCase()} type`} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {assetTypes?.filter((t) =>
                                                            ((t.type_category || 'Vehicle') === cat) &&
                                                            (t.is_active || t.name === newAsset.asset_type)
                                                        ).map((t) => (
                                                            <SelectItem key={t.id} value={t.name}>
                                                                {t.name} {!t.is_active && "(Inactive)"}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </TabsContent>
                                    ))}
                                </Tabs>
                            </div>

                            {/* Make/Model Section */}
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Make / Model</Label>
                                <Input
                                    placeholder="e.g., Scania R500"
                                    className="bg-slate-50/50"
                                    value={newAsset.make_model}
                                    onChange={e => setNewAsset({ ...newAsset, make_model: e.target.value })}
                                />
                            </div>

                            {/* Simplified Identification */}
                            <div className="space-y-2 bg-slate-900/5 p-4 rounded-xl border border-slate-900/10">
                                <Label className="text-sm font-semibold">Plate Number / Identifier *</Label>
                                <Input
                                    placeholder="e.g., T 123 ABC"
                                    className="bg-white border-2 focus-visible:ring-primary h-12 text-lg font-bold tracking-wider"
                                    value={newAsset.vehicle_no}
                                    onChange={e => setNewAsset({ ...newAsset, vehicle_no: e.target.value })}
                                />
                                <p className="text-[10px] text-muted-foreground italic">Enter the primary identification number for this {activeRegTab.toLowerCase()}</p>
                            </div>

                            {/* Branding Form Upload Section */}
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold flex items-center gap-2">
                                    <FileText className="w-4 h-4" />
                                    Branding Form (PDF)
                                </Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="file"
                                        accept=".pdf"
                                        onChange={(e) => setBrandingFile(e.target.files?.[0] || null)}
                                        className="bg-slate-50/50"
                                    />
                                    {newAsset.branding_form_url && !brandingFile && (
                                        <>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => window.open(newAsset.branding_form_url, '_blank')}
                                            >
                                                <FileText className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="text-destructive hover:bg-destructive hover:text-white"
                                                onClick={() => {
                                                    if (confirm("Remove this branding form? You can upload a new one.")) {
                                                        setNewAsset({ ...newAsset, branding_form_url: "" });
                                                    }
                                                }}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                                {brandingFile && (
                                    <p className="text-xs text-muted-foreground">
                                        Selected: {brandingFile.name}
                                    </p>
                                )}
                                {newAsset.branding_form_url && !brandingFile && (
                                    <p className="text-xs text-green-600">
                                        ✓ Form already uploaded
                                    </p>
                                )}
                            </div>

                            {/* Operation Type Section */}
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Operation Type</Label>
                                <Select value={newAsset.fleet_category} onValueChange={v => setNewAsset({ ...newAsset, fleet_category: v })}>
                                    <SelectTrigger className="bg-slate-50/50"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Local">Local</SelectItem>
                                        <SelectItem value="Transit">Transit</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                className="w-full font-bold h-12 bg-primary hover:bg-primary/90 text-white shadow-lg transition-all duration-300"
                                onClick={handleRegisterOrUpdate}
                            >
                                {editingAsset ? "Update Registry" : "Register Now"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* ========== COUPLING DIALOG ========== */}
                <Dialog open={isCouplingDialogOpen} onOpenChange={setIsCouplingDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Link className="w-5 h-5 text-primary" />
                                Couple Vehicles
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4">
                            {selectedVehicleForCoupling && (
                                <>
                                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                        <Label className="text-xs text-muted-foreground">
                                            {isHorse(selectedVehicleForCoupling) ? "Horse" : "Trailer"}
                                        </Label>
                                        <p className="font-semibold">
                                            {selectedVehicleForCoupling.vehicle_no ||
                                                selectedVehicleForCoupling.horse_number ||
                                                selectedVehicleForCoupling.trailer_number}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {selectedVehicleForCoupling.asset_type} • {selectedVehicleForCoupling.make_model}
                                        </p>
                                    </div>

                                    <div>
                                        <Label>
                                            Select {isHorse(selectedVehicleForCoupling) ? "Trailer" : "Horse"} to Couple *
                                        </Label>
                                        <Select value={selectedPartnerVehicle} onValueChange={setSelectedPartnerVehicle}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={`Choose a ${isHorse(selectedVehicleForCoupling) ? "trailer" : "horse"}...`} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {getAvailableForCoupling(selectedVehicleForCoupling).map((vehicle: any) => (
                                                    <SelectItem key={vehicle.id} value={vehicle.id}>
                                                        {vehicle.vehicle_no || vehicle.horse_number || vehicle.trailer_number} - {vehicle.asset_type}
                                                    </SelectItem>
                                                ))}
                                                {getAvailableForCoupling(selectedVehicleForCoupling).length === 0 && (
                                                    <SelectItem value="none" disabled>
                                                        No available {isHorse(selectedVehicleForCoupling) ? "trailers" : "horses"}
                                                    </SelectItem>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div>
                                        <Label>Notes (Optional)</Label>
                                        <Input
                                            placeholder="Add any notes about this coupling..."
                                            value={couplingNotes}
                                            onChange={(e) => setCouplingNotes(e.target.value)}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCouplingDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleCoupleVehicles} className="bg-primary">
                                <Link className="w-4 h-4 mr-2" />
                                Couple Now
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="border-primary">
                <CardHeader className="p-3 md:p-6 pb-3 border-b">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <CardTitle className="text-base md:text-xl font-bold flex items-center gap-2">
                            <Truck className="w-5 h-5 text-primary" />
                            Fleet Registry
                        </CardTitle>

                        <div className="flex items-center gap-4">
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
                                <TabsList className="bg-slate-100 p-1">
                                    <TabsTrigger value="all" className="data-[state=active]:bg-white shadow-sm px-4">All</TabsTrigger>
                                    <TabsTrigger value="Local" className="data-[state=active]:bg-white shadow-sm px-4">Local</TabsTrigger>
                                    <TabsTrigger value="Transit" className="data-[state=active]:bg-white shadow-sm px-4">Transit</TabsTrigger>
                                </TabsList>
                            </Tabs>

                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by plate, code, or number..."
                                    className="pl-9 w-[200px] md:w-[300px] h-10 text-sm shadow-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="text-sm font-medium text-slate-500 whitespace-nowrap">
                                {displayFleet.length} units
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                            <TableRow>
                                <TableHead>Identifier Info</TableHead>
                                <TableHead>Operation Type</TableHead>
                                <TableHead>Asset Type</TableHead>
                                <TableHead>Make/Model</TableHead>
                                <TableHead>Coupling Status</TableHead>
                                <TableHead>Paired With</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Branding</TableHead>
                                <TableHead>System Access</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                        Loading fleet data...
                                    </TableCell>
                                </TableRow>
                            ) : displayFleet.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                                        No fleet assets found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                displayFleet.map((asset: any) => (
                                    <TableRow key={asset.id} className={`transition-colors ${asset.is_merged ? 'bg-blue-50/30 hover:bg-blue-50/50' : 'hover:bg-slate-50/50'}`}>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <div className="font-semibold text-slate-900 flex items-center gap-2">
                                                    {asset.is_merged ? (
                                                        <>
                                                            <Truck className="w-4 h-4 text-blue-600" />
                                                            <span className="text-blue-700">{asset.display_id}</span>
                                                        </>
                                                    ) : (
                                                        asset.vehicle_no || asset.trailer_number || asset.horse_number || "—"
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-tight font-medium">
                                                    {asset.is_merged ? (
                                                        <span className="bg-blue-100 text-blue-700 px-1 rounded">HORSE + TRAILER</span>
                                                    ) : (
                                                        <>
                                                            {(asset.horse_number && asset.vehicle_no && asset.horse_number !== asset.vehicle_no) && <span>H: {asset.horse_number}</span>}
                                                            {(asset.trailer_number && asset.vehicle_no) && <span>T: {asset.trailer_number}</span>}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Select
                                                value={asset.fleet_category}
                                                onValueChange={(val) => handleSwitchOperation(asset, val)}
                                            >
                                                <SelectTrigger className={`h-8 w-28 text-xs font-semibold ${asset.fleet_category === 'Transit' ? 'text-indigo-600 border-indigo-200 bg-indigo-50/30' : 'text-emerald-600 border-emerald-200 bg-emerald-50/30'}`}>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Local">Local</SelectItem>
                                                    <SelectItem value="Transit">Transit</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-bold ${asset.is_merged ? 'text-blue-700' : ''}`}>
                                                    {asset.is_merged ? asset.display_type : asset.asset_type}
                                                </span>
                                                {(!asset.is_merged && ((asset.trailer_number && !asset.horse_number && !asset.vehicle_no) || (assetTypes?.find((t: any) => t.name === asset.asset_type)?.type_category === 'Trailer'))) ? (
                                                    <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[9px] h-4 px-1 uppercase tracking-tighter border-none">Trailer</Badge>
                                                ) : null}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {asset.is_merged ? asset.display_make : (asset.make_model || "—")}
                                        </TableCell>

                                        {/* Coupling Status */}
                                        <TableCell>
                                            {!canBeCoupled(asset) ? (
                                                <Badge variant="outline" className="text-slate-400 w-fit h-5 text-[10px] font-medium border-slate-200">
                                                    N/A
                                                </Badge>
                                            ) : asset.coupling_status === 'coupled' ? (
                                                <div className="flex flex-col gap-1">
                                                    <Badge className="bg-blue-600 hover:bg-blue-700 w-fit h-5 text-[10px] font-bold">
                                                        <Link className="w-3 h-3 mr-1" />
                                                        COUPLED UNIT
                                                    </Badge>
                                                    <button
                                                        className="text-[10px] text-red-600 hover:text-red-800 font-extrabold flex items-center gap-1 transition-colors text-left"
                                                        onClick={() => handleUncoupleVehicle(asset)}
                                                    >
                                                        <Unlink className="h-2.5 w-2.5" />
                                                        UNCOUPLE PAIR
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-1">
                                                    <Badge variant="outline" className="text-slate-500 w-fit h-5 text-[10px] font-medium border-slate-300">
                                                        <Unlink className="w-3 h-3 mr-1" />
                                                        SINGLE
                                                    </Badge>
                                                    <button
                                                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 transition-colors text-left"
                                                        onClick={() => handleOpenCouplingDialog(asset)}
                                                    >
                                                        <Link className="h-2.5 w-2.5" />
                                                        COUPLE NOW
                                                    </button>
                                                </div>
                                            )}
                                        </TableCell>

                                        {/* Paired With / Details */}
                                        <TableCell>
                                            {asset.is_merged ? (
                                                <div className="flex flex-col">
                                                    <div className="text-[10px] font-bold text-slate-500 uppercase">Unit Details</div>
                                                    <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                                                        {asset.notes || asset.partner?.notes || "No notes"}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">—</span>
                                            )}
                                        </TableCell>

                                        <TableCell>{getStatusBadge((asset as any).asset_status)}</TableCell>

                                        {/* Branding Form */}
                                        <TableCell>
                                            {asset.branding_form_url ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2 text-xs"
                                                    onClick={() => window.open(asset.branding_form_url, '_blank')}
                                                >
                                                    <FileText className="w-4 h-4 mr-1" />
                                                    View PDF
                                                </Button>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                        </TableCell>

                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={(asset as any).is_active !== false}
                                                    onCheckedChange={() => toggleAssetStatusMutation.mutate({ id: asset.id, is_active: (asset as any).is_active !== false })}
                                                />
                                                <span className="text-[10px] font-medium uppercase text-slate-500">
                                                    {(asset as any).is_active !== false ? "Active" : "Inactive"}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => handleEditAsset(asset)}>
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => {
                                                    if (confirm("Are you sure you want to delete this vehicle?")) {
                                                        deleteAssetMutation.mutate(asset.id);
                                                    }
                                                }}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
};

export default FleetCommand;
