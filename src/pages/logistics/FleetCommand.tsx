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
import { Truck, Plus, Search, Filter, MoreVertical, Edit, Trash2, AlertTriangle, CheckCircle2, Clock, Settings, XCircle, Link, Unlink, FileText, Upload, Wrench, Check, ChevronsUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
    const [openCombobox, setOpenCombobox] = useState(false);
    const [selectedVehicleForCoupling, setSelectedVehicleForCoupling] = useState<any>(null);
    const [selectedPartnerVehicle, setSelectedPartnerVehicle] = useState("");
    const [couplingNotes, setCouplingNotes] = useState("");
    const [maintenanceSubTab, setMaintenanceSubTab] = useState("all");
    const [isAssetTypesCollapsed, setIsAssetTypesCollapsed] = useState(true); // Collapsed by default

    // For Asset Types
    const [newType, setNewType] = useState({
        name: "",
        description: "",
        type_category: "Vehicle" as "Vehicle" | "Trailer",
        requires_coupling: false,
        is_active: true
    });
    const [editingType, setEditingType] = useState<any>(null); // Track which type is being edited

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
        branding_form_url: "",
        current_odometer: 0,
        last_service_odometer: 0,
        next_service_odometer: 0,
        last_service_date: ""
    });
    const [brandingFile, setBrandingFile] = useState<File | null>(null);
    const [selectedJob, setSelectedJob] = useState<any>(null);

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

    // Fetch Active Logistics Trips for Status Sync
    const { data: activeTrips } = useQuery({
        queryKey: ["active-logistics-trips-fleet"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_trips")
                .select("id, status, vehicle_id, trailer_id")
                .in("status", ["Planned", "Dispatched", "In Transit", "At Destination", "Returning"]);
            return data || [];
        }
    });

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

    // Fetch Active Garage Jobs (For Maintenance View)
    const { data: activeGarageJobs } = useQuery({
        queryKey: ["active-garage-jobs"],
        queryFn: async () => {
            // We need to fetch jobs that are NOT closed to show active maintenance
            const { data, error } = await supabase
                .from("garage_job_cards")
                .select(`
                    *,
                    vehicle:logistics_fleet(id, vehicle_no, horse_number, trailer_number, asset_type, make_model, asset_status),
                    fault_list:garage_job_faults(id, fault_type_id, status, mechanic_notes, fault_type:garage_fault_types(fault_name, category))
                `)
                .neq("status", "Closed")
                .order("opened_at", { ascending: false });

            if (error) throw error;

            // For each job, add coupling partner information
            return data?.map((job: any) => {
                const v = job.vehicle;
                const displayPlate = v?.vehicle_no || v?.horse_number || v?.trailer_number || "NO PLATE";

                // Find if this vehicle is part of a coupling
                const pair = (couplings || []).find((c: any) => c.horse_id === v?.id || c.trailer_id === v?.id);
                let partnerInfo = null;

                if (pair) {
                    // Determine which is the partner
                    const isHorse = pair.horse_id === v?.id;
                    const partnerId = isHorse ? pair.trailer_id : pair.horse_id;
                    const partner = (fleet || []).find(x => x.id === partnerId);

                    if (partner) {
                        partnerInfo = {
                            plate: partner.vehicle_no || partner.horse_number || partner.trailer_number || "Unknown",
                            status: partner.asset_status,
                            type: partner.asset_type
                        };
                    }
                }

                return {
                    ...job,
                    vehicle: { ...v, plate_number: displayPlate },
                    coupling_partner: partnerInfo
                };
            });
        }
    });

    // Fetch Pending Issues (Closed jobs with follow-up required)
    const { data: pendingIssues } = useQuery({
        queryKey: ["pending-issues"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("garage_job_cards")
                .select(`
                    *,
                    vehicle:logistics_fleet(id, vehicle_no, horse_number, trailer_number, asset_type, make_model, asset_status),
                    fault_list:garage_job_faults!inner(id, mechanic_notes, status, fault_type:garage_fault_types(fault_name))
                `)
                .eq("status", "Closed")
                .in("fault_list.status", ['Partial', 'Not Repaired'])
                .order("closed_at", { ascending: false });

            if (error) throw error;
            return data?.map((job: any) => {
                const v = job.vehicle;
                const displayPlate = v?.vehicle_no || v?.horse_number || v?.trailer_number || "NO PLATE";
                return {
                    ...job,
                    vehicle: { ...v, plate_number: displayPlate }
                };
            });
        }
    });

    const { data: garageRequisitions } = useQuery({
        queryKey: ["logistics-garage-requisitions"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("garage_requisitions")
                .select(`*, vehicle:logistics_fleet(id, vehicle_no, horse_number, trailer_number, asset_type, make_model), profiles!garage_requisitions_requested_by_fkey(full_name)`)
                .neq("is_deleted", true)
                .not("status", "in", '("Closed","Paid","Stocked","Rejected","Revoked")')
                .order("created_at", { ascending: false })
                .limit(100);
            if (error) throw error;
            return data;
        }
    });

    const [fleetDocuments, setFleetDocuments] = useState<any[]>([]);

    const handleDocumentUpload = async (file: File) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `fleet_doc_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error } = await supabase.storage.from('fleet-documents').upload(fileName, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('fleet-documents').getPublicUrl(fileName);
        return urlData.publicUrl;
    };

    const handleDeleteDocument = async (idx: number, documents: any[], setDocuments: any) => {
        const docToDelete = documents[idx];
        if (docToDelete.document_url && docToDelete.document_url !== "pending") {
            try {
                const filePath = docToDelete.document_url.split('/').pop();
                if (filePath) {
                    await supabase.storage.from('fleet-documents').remove([filePath]);
                }
            } catch (err) {
                console.error("Error deleting file from storage:", err);
            }
        }
        const updated = documents.filter((_, i) => i !== idx);
        setDocuments(updated);
    };

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
            setNewType({ name: "", description: "", type_category: "Vehicle", requires_coupling: false, is_active: true });
            toast({ title: "Type Added", description: "New asset type registered." });
        },
        onError: (error: any) => toast({ variant: "destructive", title: "Error", description: error.message })
    });

    const updateTypeMutation = useMutation({
        mutationFn: async ({ id, updates }: { id: string, updates: typeof newType }) => {
            const { data, error } = await supabase.from("logistics_asset_types").update(updates).eq("id", id).select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-asset-types"] });
            setIsTypeDialogOpen(false);
            setEditingType(null);
            setNewType({ name: "", description: "", type_category: "Vehicle", requires_coupling: false, is_active: true });
            toast({ title: "Type Updated", description: "Asset type updated successfully." });
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
        mutationFn: async ({ asset, documents }: { asset: any, documents: any[] }) => {
            // Sanitize asset payload
            const assetPayload = { ...asset };
            if (assetPayload.last_service_date === "") assetPayload.last_service_date = null;

            const { data: fleetData, error: fleetError } = await supabase
                .from("logistics_fleet")
                .insert([assetPayload])
                .select()
                .single();
            if (fleetError) throw fleetError;

            if (documents.length > 0) {
                const docsToInsert = await Promise.all(documents.map(async (doc) => {
                    let docUrl = doc.document_url || "";
                    if (doc.file) {
                        docUrl = await handleDocumentUpload(doc.file);
                    }
                    // Strip 'id' and 'file' so DB can auto-generate or reuse correctly
                    const { file, id: _id, ...rest } = doc;

                    // Sanitize document date
                    const docPayload = { ...rest, document_url: docUrl, fleet_id: fleetData.id };
                    if (docPayload.expiry_date === "") docPayload.expiry_date = null;

                    return docPayload;
                }));

                const { error: docsError } = await (supabase
                    .from("logistics_fleet_documents" as any)
                    .insert(docsToInsert) as any);
                if (docsError) throw docsError;
            }
            return fleetData;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-fleet"] });
            setIsDialogOpen(false);
            setNewAsset({
                vehicle_no: "",
                horse_number: "",
                trailer_number: "",
                make_model: "",
                asset_type: "",
                fleet_category: "Local",
                asset_status: "Active",
                notes: "",
                branding_form_url: "",
                current_odometer: 0,
                last_service_odometer: 0,
                next_service_odometer: 0,
                last_service_date: ""
            });
            setFleetDocuments([]);
            setBrandingFile(null);
            toast({ title: "Vehicle Registered", description: "The vehicle and its credentials have been saved." });
        },
        onError: (error: any) => {
            if (error.message?.includes("409") || (error.code === "23505")) {
                toast({ variant: "destructive", title: "Registration Failed", description: "A vehicle with this Plate Number already exists." });
            } else {
                toast({ variant: "destructive", title: "Error", description: error.message });
            }
        }
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
        mutationFn: async ({ id, updates, documents }: { id: string, updates: any, documents: any[] }) => {
            // Sanitize updates
            const updatePayload = { ...updates };
            if (updatePayload.last_service_date === "") updatePayload.last_service_date = null;

            const { data: fleetData, error: fleetError } = await supabase
                .from("logistics_fleet")
                .update(updatePayload)
                .eq("id", id)
                .select()
                .single();
            if (fleetError) throw fleetError;

            // Update documents: delete old and insert new for consistency
            if (documents.length > 0) {
                await (supabase.from("logistics_fleet_documents" as any).delete().eq("fleet_id", id) as any);

                const docsToInsert = await Promise.all(documents.map(async (doc) => {
                    let docUrl = doc.document_url || "";
                    if (doc.file) {
                        docUrl = await handleDocumentUpload(doc.file);
                    }
                    // Strip 'id' and 'file' to let DB generate fresh IDs upon re-insertion
                    const { file, id: _id, ...rest } = doc;
                    const docPayload = {
                        ...rest,
                        document_url: docUrl,
                        fleet_id: id
                    };
                    // Sanitize document date
                    if (docPayload.expiry_date === "") docPayload.expiry_date = null;
                    return docPayload;
                }));

                const { error: docsError } = await (supabase
                    .from("logistics_fleet_documents" as any)
                    .insert(docsToInsert) as any);
                if (docsError) throw docsError;
            } else {
                // If no documents left, clear them from the DB
                await (supabase.from("logistics_fleet_documents" as any).delete().eq("fleet_id", id) as any);
            }
            return fleetData;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-fleet"] });
            setIsDialogOpen(false);
            setEditingAsset(null);
            setNewAsset({
                vehicle_no: "",
                horse_number: "",
                trailer_number: "",
                make_model: "",
                asset_type: "",
                fleet_category: "Local",
                asset_status: "Active",
                notes: "",
                branding_form_url: "",
                current_odometer: 0,
                last_service_odometer: 0,
                next_service_odometer: 0,
                last_service_date: ""
            });
            setFleetDocuments([]);
            toast({ title: "Vehicle Updated", description: "The vehicle and its credentials have been synchronized." });
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
            branding_form_url: asset.branding_form_url || "",
            current_odometer: asset.current_odometer || 0,
            last_service_odometer: asset.last_service_odometer || 0,
            next_service_odometer: asset.next_service_odometer || 0,
            last_service_date: asset.last_service_date || ""
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

        // Auto-capitalize text fields
        const finalAsset = {
            ...newAsset,
            vehicle_no: newAsset.vehicle_no?.toUpperCase() || "",
            horse_number: newAsset.horse_number?.toUpperCase() || "",
            trailer_number: newAsset.trailer_number?.toUpperCase() || "",
            make_model: newAsset.make_model?.toUpperCase() || "",
            notes: newAsset.notes || ""
        };

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
        // CRITICAL FIX: vehicle_no is UNIQUE NOT NULL in DB - must ALWAYS be the plate number
        if (activeRegTab === "Vehicle") {
            finalAsset.horse_number = finalAsset.vehicle_no;
            finalAsset.trailer_number = "";
        } else {
            finalAsset.trailer_number = finalAsset.vehicle_no;
            finalAsset.horse_number = "";
        }

        if (editingAsset) {
            updateAssetMutation.mutate({ id: editingAsset.id, updates: finalAsset, documents: fleetDocuments });
        } else {
            createAssetMutation.mutate({ asset: finalAsset, documents: fleetDocuments });
        }
    };

    const getStatusBadge = (asset: any) => {
        const activeTrip = activeTrips?.find(t => t.vehicle_id === asset.id || t.trailer_id === asset.id);

        if (activeTrip) {
            return <Badge className="bg-indigo-600 hover:bg-indigo-700 animate-pulse"><Truck className="w-3 h-3 mr-1" /> On Trip ({activeTrip.status})</Badge>;
        }

        switch (asset.asset_status) {
            case "Active": return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" /> Active</Badge>;
            case "Maintenance": return <Badge className="bg-amber-500 hover:bg-amber-600"><Clock className="w-3 h-3 mr-1" /> Maintenance</Badge>;
            case "Breakdown": return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" /> Breakdown</Badge>;
            default: return <Badge variant="outline">{asset.asset_status}</Badge>;
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

    // Check if an asset can be coupled (trailers + vehicles with requires_coupling flag)
    const canBeCoupled = (asset: any) => {
        const typeInfo = assetTypes?.find((t) => t.name === asset.asset_type);
        if (!typeInfo) return false;

        // Always allow trailers to be coupled
        if (typeInfo.type_category === "Trailer") return true;

        // For vehicles, check the requires_coupling flag
        if (typeInfo.type_category === "Vehicle") {
            return typeInfo.requires_coupling === true;
        }

        return false;
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
            const normalizedSearch = searchTerm.replace(/\s+/g, "").toLowerCase();
            const matchesSearch = (item.vehicle_no || "").replace(/\s+/g, "").toLowerCase().includes(normalizedSearch) ||
                (item.horse_number || "").replace(/\s+/g, "").toLowerCase().includes(normalizedSearch) ||
                (item.trailer_number || "").replace(/\s+/g, "").toLowerCase().includes(normalizedSearch);

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
                            if (!editingType) {
                                // Only reset for new types, not when editing
                                setNewType(prev => ({ ...prev, type_category: activeTypeTab }));
                            }
                        } else {
                            // Reset when closing
                            setEditingType(null);
                            setNewType({ name: "", description: "", type_category: "Vehicle", requires_coupling: false, is_active: true });
                        }
                    }}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="h-8 gap-1">
                                <Plus className="w-4 h-4" /> Add Type
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[400px]">
                            <DialogHeader>
                                <DialogTitle>{editingType ? "Edit Asset Type" : "Add Asset Type"}</DialogTitle>
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
                                <div className="flex items-center justify-between p-2 bg-slate-50 rounded border">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm">Requires Coupling?</Label>
                                        <p className="text-[10px] text-muted-foreground">Check if this asset MUST be linked to another (e.g. Horse/Trailer)</p>
                                    </div>
                                    <Switch
                                        checked={newType.requires_coupling}
                                        onCheckedChange={(checked) => setNewType({ ...newType, requires_coupling: checked })}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button
                                    className="w-full bg-primary"
                                    onClick={() => {
                                        if (editingType) {
                                            // Update existing type
                                            updateTypeMutation.mutate({ id: editingType.id, updates: newType });
                                        } else {
                                            // Create new type
                                            createTypeMutation.mutate(newType);
                                        }
                                    }}
                                >
                                    {editingType ? "Update Type" : "Add Type"}
                                </Button>
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
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader className="bg-slate-50/50">
                                                <TableRow>
                                                    <TableHead className="pl-6">Name</TableHead>
                                                    <TableHead>Requires Coupling</TableHead>
                                                    <TableHead>Active</TableHead>
                                                    <TableHead className="text-right pr-6">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {assetTypes?.filter((t) => (t.type_category || 'Vehicle') === category).map((type) => (
                                                    <TableRow key={type.id}>
                                                        <TableCell className="font-medium pl-6">
                                                            <div>{type.name}</div>
                                                            <div className="text-[10px] text-muted-foreground">{type.description || "No description"}</div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant={(type as any).requires_coupling ? "default" : "secondary"} className="text-[10px]">
                                                                {(type as any).requires_coupling ? "Yes" : "No"}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Switch
                                                                checked={type.is_active}
                                                                onCheckedChange={() => toggleTypeMutation.mutate({ id: type.id, is_active: type.is_active })}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-right pr-6">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="text-primary h-8 w-8"
                                                                    onClick={() => {
                                                                        setEditingType(type);
                                                                        setNewType({
                                                                            name: type.name,
                                                                            description: type.description || "",
                                                                            type_category: type.type_category || "Vehicle",
                                                                            requires_coupling: (type as any).requires_coupling || false,
                                                                            is_active: type.is_active
                                                                        });
                                                                        setIsTypeDialogOpen(true);
                                                                    }}
                                                                >
                                                                    <Edit className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="text-destructive h-8 w-8"
                                                                    onClick={() => deleteTypeMutation.mutate(type.id)}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
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
                                    </div>
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
                        setNewAsset({
                            vehicle_no: "",
                            horse_number: "",
                            trailer_number: "",
                            make_model: "",
                            asset_type: "",
                            fleet_category: "Local",
                            asset_status: "Active",
                            notes: "",
                            branding_form_url: "",
                            current_odometer: 0,
                            last_service_odometer: 0,
                            next_service_odometer: 0,
                            last_service_date: ""
                        });
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
                        <ScrollArea className="max-h-[80vh] px-1">
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

                                {/* Manual Maintenance Section */}
                                <div className="space-y-4 border-t pt-4">
                                    <Label className="text-sm font-bold flex items-center gap-2 text-slate-700">
                                        <Settings className="w-4 h-4" />
                                        Maintenance & Odometer Tracking
                                    </Label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-sm font-semibold">Current Mileage (KM)</Label>
                                            <Input
                                                type="number"
                                                placeholder="0"
                                                value={newAsset.current_odometer}
                                                onChange={e => setNewAsset({ ...newAsset, current_odometer: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-sm font-semibold">Next Service Target (KM) <span className="text-rose-500">*</span></Label>
                                            <Input
                                                type="number"
                                                placeholder="Target KM"
                                                value={newAsset.next_service_odometer}
                                                onChange={e => setNewAsset({ ...newAsset, next_service_odometer: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-sm font-semibold">Last Service Odo (KM)</Label>
                                            <Input
                                                type="number"
                                                placeholder="KM at service"
                                                value={newAsset.last_service_odometer}
                                                onChange={e => setNewAsset({ ...newAsset, last_service_odometer: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-sm font-semibold">Last Service Date</Label>
                                            <Input
                                                type="date"
                                                value={newAsset.last_service_date}
                                                onChange={e => setNewAsset({ ...newAsset, last_service_date: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground italic">
                                        The system will alert when the Current Mileage reaches the Next Service Target.
                                    </p>
                                </div>

                                {/* Dynamic Document Management Section */}
                                <div className="space-y-4 border-t pt-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-bold text-slate-700">Vehicle Documents & Permits</Label>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 text-[10px] font-bold uppercase gap-1 border-primary/20 bg-primary/5 text-primary"
                                            onClick={() => setFleetDocuments([...fleetDocuments, {
                                                document_type: (docTypes as any[])?.find((t: any) => t.category === (activeRegTab === 'Vehicle' ? 'Vehicle' : 'Trailer'))?.name || "Insurance",
                                                expiry_date: "",
                                                is_mandatory: true,
                                                document_url: "pending"
                                            }])}
                                        >
                                            <Plus className="w-3 h-3" /> Add Document
                                        </Button>
                                    </div>

                                    {fleetDocuments.map((doc, idx) => (
                                        <div key={idx} className="p-3 border rounded-lg bg-slate-50 space-y-3 relative">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="absolute top-1 right-1 h-6 w-6 text-slate-400 hover:text-rose-500"
                                                onClick={() => handleDeleteDocument(idx, fleetDocuments, setFleetDocuments)}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <Label className="text-[10px]">Type</Label>
                                                        <Select
                                                            value={doc.document_type}
                                                            onValueChange={(v) => {
                                                                const updated = [...fleetDocuments];
                                                                updated[idx].document_type = v;
                                                                // Truck Cards are permanent - clear expiry
                                                                if (v.toLowerCase().includes("truck card")) {
                                                                    updated[idx].expiry_date = "";
                                                                }
                                                                setFleetDocuments(updated);
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {(docTypes as any[])?.filter((t: any) => t.category === activeRegTab || t.category === 'General').map((type: any) => (
                                                                    <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                                                                ))}
                                                                <SelectItem value="Custom">Custom / Other...</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-[10px]">Expiry Date</Label>
                                                        {doc.document_type?.toLowerCase().includes("truck card") ? (
                                                            <div className="h-8 flex items-center px-3 bg-green-50 border border-green-100 rounded text-[9px] font-bold text-green-700 uppercase">
                                                                Permanent Document
                                                            </div>
                                                        ) : (
                                                            <Input
                                                                type="date"
                                                                className="h-8 text-xs"
                                                                value={doc.expiry_date}
                                                                onChange={(e) => {
                                                                    const updated = [...fleetDocuments];
                                                                    updated[idx].expiry_date = e.target.value;
                                                                    setFleetDocuments(updated);
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-white border rounded text-xs text-slate-500 relative overflow-hidden group">
                                                    <FileText className="w-3.5 h-3.5" />
                                                    <span className="truncate max-w-[150px] font-medium text-slate-700">
                                                        {doc.file ? doc.file.name : (doc.document_url !== "pending" && doc.document_url ? "File Attached" : "Upload Document (PDF/Image)")}
                                                    </span>
                                                    <Input
                                                        type="file"
                                                        accept=".pdf,image/*"
                                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                const updated = [...fleetDocuments];
                                                                updated[idx].file = file;
                                                                setFleetDocuments(updated);
                                                            }
                                                        }}
                                                    />
                                                    <Button size="sm" variant="ghost" className="ml-auto h-6 px-1.5 text-[10px] text-primary bg-primary/5 hover:bg-primary/10 relative z-0">Browse</Button>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch
                                                        checked={doc.is_mandatory}
                                                        onCheckedChange={(v) => {
                                                            const updated = [...fleetDocuments];
                                                            updated[idx].is_mandatory = v;
                                                            setFleetDocuments(updated);
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
                                        <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    aria-expanded={openCombobox}
                                                    className="w-full justify-between"
                                                >
                                                    {selectedPartnerVehicle
                                                        ? getAvailableForCoupling(selectedVehicleForCoupling).find((vehicle: any) => vehicle.id === selectedPartnerVehicle)?.vehicle_no ||
                                                        getAvailableForCoupling(selectedVehicleForCoupling).find((vehicle: any) => vehicle.id === selectedPartnerVehicle)?.horse_number ||
                                                        getAvailableForCoupling(selectedVehicleForCoupling).find((vehicle: any) => vehicle.id === selectedPartnerVehicle)?.trailer_number
                                                        : `Select ${isHorse(selectedVehicleForCoupling) ? "trailer" : "horse"}...`}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[400px] p-0">
                                                <Command>
                                                    <CommandInput placeholder={`Search ${isHorse(selectedVehicleForCoupling) ? "trailer" : "horse"}...`} />
                                                    <CommandList>
                                                        <CommandEmpty>No vehicle found.</CommandEmpty>
                                                        <CommandGroup>
                                                            {getAvailableForCoupling(selectedVehicleForCoupling).map((vehicle: any) => (
                                                                <CommandItem
                                                                    key={vehicle.id}
                                                                    value={vehicle.vehicle_no || vehicle.horse_number || vehicle.trailer_number}
                                                                    onSelect={() => {
                                                                        setSelectedPartnerVehicle(vehicle.id === selectedPartnerVehicle ? "" : vehicle.id);
                                                                        setOpenCombobox(false);
                                                                    }}
                                                                >
                                                                    <Check
                                                                        className={cn(
                                                                            "mr-2 h-4 w-4",
                                                                            selectedPartnerVehicle === vehicle.id ? "opacity-100" : "opacity-0"
                                                                        )}
                                                                    />
                                                                    {vehicle.vehicle_no || vehicle.horse_number || vehicle.trailer_number} - {vehicle.asset_type}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
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
            </div >

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
                                    <TabsTrigger value="maintenance" className="data-[state=active]:bg-white shadow-sm px-4 gap-2">
                                        <Wrench className="w-4 h-4" />
                                        Maintenance
                                        {activeGarageJobs && activeGarageJobs.length > 0 && (
                                            <Badge variant="destructive" className="ml-1 px-1 py-0 h-4 text-[10px]">{activeGarageJobs.length}</Badge>
                                        )}
                                    </TabsTrigger>
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
                    {activeTab === 'maintenance' ? (
                        <Tabs defaultValue="all" value={maintenanceSubTab} onValueChange={setMaintenanceSubTab} className="w-full">
                            <div className="px-6 pt-4">
                                <TabsList className="grid w-full max-w-[600px] grid-cols-3">
                                    <TabsTrigger value="all">All Maintenance ({activeGarageJobs?.length || 0})</TabsTrigger>
                                    <TabsTrigger value="pending" className="relative">
                                        Pending Issues
                                        {pendingIssues && pendingIssues.length > 0 && (
                                            <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center bg-amber-500 text-white rounded-full text-[10px]">
                                                {pendingIssues.length}
                                            </Badge>
                                        )}
                                    </TabsTrigger>
                                    <TabsTrigger value="requisitions">Garage Requisitions</TabsTrigger>
                                </TabsList>
                            </div>
                            
                            <TabsContent value="all" className="mt-0">
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-amber-50/50">
                                            <TableRow>
                                                <TableHead>Job ID</TableHead>
                                                <TableHead>Vehicle Details</TableHead>
                                                <TableHead>Coupling Info</TableHead>
                                                <TableHead>Fault Details</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Garage Duration</TableHead>
                                                <TableHead>Priority</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {activeGarageJobs && activeGarageJobs.length > 0 ? (
                                                activeGarageJobs.map((job: any) => {
                                                    const start = new Date(job.opened_at).getTime();
                                                    const now = new Date().getTime();
                                                    const diffHours = Math.floor((now - start) / (1000 * 60 * 60));
                                                    const days = Math.floor(diffHours / 24);
                                                    const hours = diffHours % 24;

                                                    return (
                                                        <TableRow key={job.id} className="hover:bg-amber-50/20">
                                                            <TableCell className="font-medium text-xs text-slate-500">#{job.job_number}</TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-slate-800">{job.vehicle?.plate_number}</span>
                                                                    <span className="text-xs text-slate-500">{job.vehicle?.make_model} - {job.vehicle?.asset_type}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                {job.coupling_partner ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <Link className="w-3 h-3 text-blue-500" />
                                                                        <div className="flex flex-col">
                                                                            <span className="text-xs font-medium text-slate-700">{job.coupling_partner.plate}</span>
                                                                            <div className="flex items-center gap-1">
                                                                                {job.coupling_partner.status === 'Active' ? (
                                                                                    <Badge className="h-4 text-[9px] bg-green-100 text-green-700 hover:bg-green-100">✓ Active</Badge>
                                                                                ) : job.coupling_partner.status === 'Maintenance' ? (
                                                                                    <Badge className="h-4 text-[9px] bg-amber-100 text-amber-700 hover:bg-amber-100">🔧 In Garage</Badge>
                                                                                ) : (
                                                                                    <Badge variant="outline" className="h-4 text-[9px]">{job.coupling_partner.status}</Badge>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-xs text-slate-400">—</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col">
                                                                    {job.fault_list && job.fault_list.length > 0 ? (
                                                                        <>
                                                                            <span className="font-semibold text-slate-700">
                                                                                {job.fault_list[0].mechanic_notes || job.fault_list[0].fault_type?.fault_name}
                                                                                {job.fault_list.length > 1 && (
                                                                                    <span className="text-indigo-600 ml-1 font-bold">+{job.fault_list.length - 1} more</span>
                                                                                )}
                                                                            </span>
                                                                            <span className="text-[10px] text-slate-500 uppercase tracking-tight">{job.fault_list[0].fault_type?.category}</span>
                                                                        </>
                                                                    ) : (
                                                                        <span className="text-xs text-slate-400 italic">No tasks logged</span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                                                                    {job.status}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex items-center gap-2 font-mono text-sm font-bold text-slate-700">
                                                                    <Clock className="w-3 h-3 text-slate-400" />
                                                                    {days}d {hours}h
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge className={
                                                                    job.priority === 'Critical' ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                                                                        job.priority === 'Urgent' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' :
                                                                            'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                                                }>
                                                                    {job.priority}
                                                                </Badge>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                                        <div className="flex flex-col items-center justify-center gap-2">
                                                            <CheckCircle2 className="w-8 h-8 text-green-500 opacity-20" />
                                                            <p>All fleet units are operational.</p>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </TabsContent>
                               <TabsContent value="pending" className="mt-0">
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-amber-50/50">
                                            <TableRow>
                                                <TableHead>Vehicle</TableHead>
                                                <TableHead>Issues Breakdown</TableHead>
                                                <TableHead>Head Mechanic Approval</TableHead>
                                                <TableHead>Released</TableHead>
                                                <TableHead>Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {pendingIssues && pendingIssues.length > 0 ? (
                                                pendingIssues.map((job: any) => {
                                                    const releasedDate = new Date(job.closed_at);
                                                    const daysAgo = Math.floor((new Date().getTime() - releasedDate.getTime()) / (1000 * 60 * 60 * 24));

                                                    return (
                                                        <TableRow key={job.id} className="hover:bg-amber-50/20">
                                                            <TableCell>
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold text-slate-800">{job.vehicle?.plate_number}</span>
                                                                    <span className="text-xs text-slate-500">{job.vehicle?.asset_type}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex items-center gap-1">
                                                                    {job.fault_list?.filter((f: any) => f.status === 'Partial').length > 0 && (
                                                                        <Badge className="h-5 text-[9px] bg-amber-100 text-amber-700 hover:bg-amber-100 border border-amber-200 gap-1">
                                                                            ⚠️ {job.fault_list.filter((f: any) => f.status === 'Partial').length} Partial
                                                                        </Badge>
                                                                    )}
                                                                    {job.fault_list?.filter((f: any) => f.status === 'Not Repaired').length > 0 && (
                                                                        <Badge className="h-5 text-[9px] bg-red-100 text-red-700 hover:bg-red-100 border border-red-200 gap-1">
                                                                            ❌ {job.fault_list.filter((f: any) => f.status === 'Not Repaired').length} Not Repaired
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="max-w-md">
                                                                    {job.head_mechanic_approval ? (
                                                                        <>
                                                                            <p className="text-sm italic text-slate-700 border-l-2 border-amber-300 pl-2 my-1">
                                                                                "{job.head_mechanic_approval}"
                                                                            </p>
                                                                            <p className="text-[10px] text-slate-500 font-medium">
                                                                                — Approved by Head Mechanic
                                                                            </p>
                                                                        </>
                                                                    ) : (
                                                                        <span className="text-xs text-slate-400 italic">No approval note recorded</span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col gap-1.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <Badge className={`h-5 text-[10px] font-bold border ${daysAgo >= 15 ? 'bg-red-50 text-red-700 border-red-200' :
                                                                            daysAgo >= 8 ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                                                daysAgo >= 4 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                                    'bg-green-50 text-green-700 border-green-200'
                                                                            }`}>
                                                                            {daysAgo}d old
                                                                        </Badge>
                                                                        <span className="text-xs font-medium text-slate-700">{releasedDate.toLocaleDateString()}</span>
                                                                    </div>
                                                                    <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">Maintenance Debt Aging</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedJob(job)}>View Details</Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                                        <div className="flex flex-col items-center justify-center gap-2">
                                                            <CheckCircle2 className="w-8 h-8 text-green-500 opacity-20" />
                                                            <p>No vehicles with pending issues.</p>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </TabsContent>

                            <TabsContent value="requisitions" className="mt-0">
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-slate-50">
                                            <TableRow>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Vehicle</TableHead>
                                                <TableHead>Item Name</TableHead>
                                                <TableHead className="text-center">Qty</TableHead>
                                                <TableHead>Requested By</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {garageRequisitions && garageRequisitions.length > 0 ? (
                                                garageRequisitions.map((req: any) => (
                                                    <TableRow key={req.id}>
                                                        <TableCell className="text-xs text-slate-500 font-medium">
                                                            {new Date(req.created_at).toLocaleDateString()}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-slate-700">
                                                                    {req.vehicle?.vehicle_no || req.vehicle?.horse_number || req.vehicle?.trailer_number || 'STOO (General)'}
                                                                </span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-sm font-medium text-slate-700">
                                                            {req.item_name}
                                                        </TableCell>
                                                        <TableCell className="text-center font-mono">
                                                            {req.quantity_requested}
                                                        </TableCell>
                                                        <TableCell className="text-xs text-slate-600">
                                                            {req.profiles?.full_name || 'System'}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-tight ${
                                                                req.status === 'Waiting Review' || req.status === 'Pending' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                                                req.status === 'Reviewed & Pending' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                                                req.status === 'Awaiting Approval' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                                                                req.status === 'Approved' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' :
                                                                req.status === 'Closed' || req.status === 'Paid' || req.status === 'Stocked' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                                                                ['Revoked', 'Rejected'].includes(req.status) ? 'bg-rose-50 text-rose-600 border border-rose-200' :
                                                                'bg-slate-50 text-slate-600 border border-slate-200'
                                                            }`}>{req.status === 'Pending' ? 'Waiting Review' : req.status}</Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                                        No garage requisitions found.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </TabsContent>
                        </Tabs>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                                    <TableRow>
                                        <TableHead>Identifier Info</TableHead>
                                        <TableHead>Operation Type</TableHead>
                                        <TableHead>Asset Type</TableHead>
                                        <TableHead>Make/Model</TableHead>
                                        <TableHead>Odometer / Service</TableHead>
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
                                                                    {(asset.trailer_number && asset.vehicle_no && asset.trailer_number !== asset.vehicle_no) && <span>T: {asset.trailer_number}</span>}
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
                                                        <SelectTrigger className={`h-8 w-28 text-xs font-semibold ${asset.fleet_category === 'Transit' ? 'text-indigo-600 border-indigo-200 bg-indigo-50/30' : 'text-slate-700 border-slate-200 bg-slate-50/30'}`}>
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
                                                <TableCell>
                                                    <div className="flex flex-col gap-1">
                                                        <div className="text-sm font-medium flex items-center gap-2">
                                                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                                                            {Number(asset.current_odometer || 0).toLocaleString()} KM
                                                        </div>
                                                        {asset.next_service_odometer > 0 && (
                                                            <div className="flex items-center gap-1.5">
                                                                {asset.current_odometer >= asset.next_service_odometer ? (
                                                                    <Badge variant="destructive" className="text-[9px] h-4 py-0 animate-pulse">SERVICE DUE</Badge>
                                                                ) : (asset.next_service_odometer - asset.current_odometer <= 500) ? (
                                                                    <Badge className="text-[9px] h-4 py-0 bg-orange-500 hover:bg-orange-600">DUE SOON</Badge>
                                                                ) : (
                                                                    <Badge className="text-[9px] h-4 py-0 bg-emerald-500 hover:bg-emerald-600">OK</Badge>
                                                                )}
                                                                <span className="text-[9px] text-muted-foreground">Target: {Number(asset.next_service_odometer).toLocaleString()}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>

                                                {/* Coupling Status */}
                                                <TableCell>
                                                    <div className="min-w-[130px]">
                                                        {!canBeCoupled(asset) ? (
                                                            <Badge variant="outline" className="text-slate-400 w-fit h-5 text-[10px] font-medium border-slate-200">
                                                                N/A
                                                            </Badge>
                                                        ) : asset.coupling_status === 'coupled' ? (
                                                            <div className="flex flex-col gap-1.5 items-start">
                                                                <Badge className="bg-blue-600 hover:bg-blue-700 w-full justify-center h-6 text-[10px] font-bold shadow-sm whitespace-nowrap">
                                                                    <Link className="w-3 h-3 mr-1.5" />
                                                                    COUPLED UNIT
                                                                </Badge>
                                                                <button
                                                                    className="text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50/50 px-1 py-0.5 rounded font-bold flex items-center gap-1.5 transition-colors w-full"
                                                                    onClick={() => handleUncoupleVehicle(asset)}
                                                                >
                                                                    <Unlink className="h-3 w-3" />
                                                                    UNCOUPLE PAIR
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col gap-1.5 items-start">
                                                                <Badge variant="outline" className="text-slate-500 w-fit h-5 text-[10px] font-medium border-slate-300">
                                                                    <Unlink className="w-3 h-3 mr-1" />
                                                                    SINGLE
                                                                </Badge>
                                                                {/* Only Horses can initiate coupling */}
                                                                {isHorse(asset) && assetTypes?.find((t: any) => t.name === asset.asset_type)?.requires_coupling ? (
                                                                    <button
                                                                        className="text-[10px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50/50 px-1 py-0.5 rounded font-bold flex items-center gap-1.5 transition-colors"
                                                                        onClick={() => handleOpenCouplingDialog(asset)}
                                                                    >
                                                                        <Link className="h-3 w-3" />
                                                                        COUPLE NOW
                                                                    </button>
                                                                ) : isTrailer(asset) ? (
                                                                    <span className="text-[10px] text-slate-400 italic font-medium">
                                                                        ⏳ Awaiting Horse
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        )}
                                                    </div>
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

                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        {getStatusBadge(asset)}

                                                        {/* Pending Issues Indicator (Tooltip) */}
                                                        {(asset as any).has_pending_issues && asset.asset_status === 'Active' && (
                                                            <TooltipProvider>
                                                                <Tooltip>
                                                                    <TooltipTrigger>
                                                                        <Badge className="h-5 px-1.5 bg-amber-50 text-amber-600 border border-amber-200 cursor-help hover:bg-amber-100">
                                                                            <AlertTriangle className="w-3 h-3" />
                                                                            {(asset as any).pending_issues_count > 0 && <span className="ml-1 text-[10px]">{(asset as any).pending_issues_count}</span>}
                                                                        </Badge>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent className="bg-white border-amber-200 text-slate-700 max-w-xs shadow-md p-3">
                                                                        <div className="space-y-1">
                                                                            <p className="font-bold text-xs text-amber-700 flex items-center gap-1.5">
                                                                                <AlertTriangle className="w-3 h-3" /> Pending Follow-up
                                                                            </p>
                                                                            <p className="text-xs">
                                                                                Vehicle has {(asset as any).pending_issues_count || 1} incomplete repair{(asset as any).pending_issues_count !== 1 ? 's' : ''}.
                                                                            </p>
                                                                            <p className="text-[10px] text-slate-500 italic mt-1 font-medium">
                                                                                Check Maintenance tab for Head Mechanic's approval note.
                                                                            </p>
                                                                        </div>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                        )}
                                                    </div>
                                                </TableCell>

                                                {/* Branding Form */}
                                                <TableCell>
                                                    {asset.is_merged ? (
                                                        <div className="flex flex-col gap-1">
                                                            {/* Horse Branding */}
                                                            {asset.branding_form_url ? (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-6 px-2 text-[10px] w-fit justify-start text-blue-700 hover:text-blue-800 hover:bg-blue-50"
                                                                    onClick={() => window.open(asset.branding_form_url, '_blank')}
                                                                    title="View Horse Branding"
                                                                >
                                                                    <FileText className="w-3 h-3 mr-1.5" />
                                                                    Horse PDF
                                                                </Button>
                                                            ) : (
                                                                <span className="text-[10px] text-slate-400 pl-2">No Horse PDF</span>
                                                            )}

                                                            {/* Trailer Branding */}
                                                            {asset.partner?.branding_form_url ? (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-6 px-2 text-[10px] w-fit justify-start text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                                                                    onClick={() => window.open(asset.partner.branding_form_url, '_blank')}
                                                                    title="View Trailer Branding"
                                                                >
                                                                    <FileText className="w-3 h-3 mr-1.5" />
                                                                    Trailer PDF
                                                                </Button>
                                                            ) : (
                                                                <span className="text-[10px] text-slate-400 pl-2">No Trailer PDF</span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        asset.branding_form_url ? (
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
                                                        )
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
                        </div>
                    )}
                </CardContent>
            </Card>
            {/* Job Details Dialog */}
            <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Wrench className="w-5 h-5 text-amber-500" />
                            Maintenance Job Details
                        </DialogTitle>
                    </DialogHeader>

                    {selectedJob && (
                        <div className="space-y-6">
                            {/* Header Info */}
                            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-lg border">
                                <div>
                                    <p className="text-sm font-medium text-slate-500">Vehicle</p>
                                    <p className="text-lg font-bold">{selectedJob.vehicle?.plate_number}</p>
                                    <p className="text-xs text-muted-foreground">{selectedJob.vehicle?.make_model}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-medium text-slate-500">Released On</p>
                                    <p className="font-bold">{new Date(selectedJob.closed_at).toLocaleDateString()}</p>
                                    <Badge variant="outline" className="mt-1 border-amber-200 bg-amber-50 text-amber-700">
                                        Pending Follow-up
                                    </Badge>
                                </div>
                            </div>

                            {/* Approval Note */}
                            {selectedJob.head_mechanic_approval && (
                                <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-lg">
                                    <p className="text-xs font-bold text-amber-800 uppercase mb-2 flex items-center gap-2">
                                        <AlertTriangle className="w-3 h-3" />
                                        Approved for Release with Issues
                                    </p>
                                    <p className="text-sm italic text-slate-700 border-l-2 border-amber-300 pl-3">
                                        "{selectedJob.head_mechanic_approval}"
                                    </p>
                                    <p className="text-xs text-slate-400 mt-2 font-medium">— Head Mechanic</p>
                                </div>
                            )}

                            {/* Fault List */}
                            <div>
                                <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-slate-400" />
                                    Issues Report
                                </h4>
                                <div className="space-y-2">
                                    {selectedJob.fault_list?.map((fault: any) => (
                                        <div key={fault.id} className="flex items-start justify-between p-3 border rounded-md hover:bg-slate-50">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-sm">{fault.fault_type?.fault_name}</span>
                                                    {fault.status === 'Partial' && <Badge className="h-4 text-[9px] bg-amber-100 text-amber-700 hover:bg-amber-100">Partial Fix</Badge>}
                                                    {fault.status === 'Not Repaired' && <Badge className="h-4 text-[9px] bg-red-100 text-red-700 hover:bg-red-100">Not Repaired</Badge>}
                                                    {fault.status === 'Fixed' && <Badge className="h-4 text-[9px] bg-green-100 text-green-700 hover:bg-green-100">Fixed</Badge>}
                                                </div>
                                                <p className="text-xs text-slate-600">{fault.mechanic_notes || "No mechanic notes provided."}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button onClick={() => setSelectedJob(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default FleetCommand;
