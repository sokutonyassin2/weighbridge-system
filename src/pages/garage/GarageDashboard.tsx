import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Wrench, Plus, AlertTriangle, FileText, CheckCircle2, Clock, Filter, Truck, Link, Trash2, Loader2, Printer, XCircle, ShoppingCart, Package, History as HistoryIcon, TrendingUp, ClipboardCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

const GarageDashboard = () => {
    const sb = supabase as any;
    const { toast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [inventorySearch, setInventorySearch] = useState("");
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isLogFaultOpen, setIsLogFaultOpen] = useState(false);
    const [selectedJobForTasks, setSelectedJobForTasks] = useState<any>(null);
    const [isManageTasksOpen, setIsManageTasksOpen] = useState(false);
    const [activeStoreTab, setActiveStoreTab] = useState("requisitions");
    const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
    const [approvalNotes, setApprovalNotes] = useState("");
    const [releaseNotes, setReleaseNotes] = useState("");
    const [jobToRelease, setJobToRelease] = useState<any>(null);
    const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
    const [isQualityCheckOpen, setIsQualityCheckOpen] = useState(false);
    const [qualityCheckAnswers, setQualityCheckAnswers] = useState<Record<string, boolean>>({});

    // Initial state based on URL
    const [activeTab, setActiveTab] = useState<"jobs" | "inventory" | "logs">(
        location.pathname === "/garage/store" ? "inventory" :
            location.pathname === "/garage/logs" ? "logs" : "jobs"
    );

    // Sync tab with URL changes
    useEffect(() => {
        if (location.pathname === "/garage/store") {
            setActiveTab("inventory");
        } else if (location.pathname === "/garage/logs") {
            setActiveTab("logs");
        } else if (location.pathname === "/garage") {
            setActiveTab("jobs");
        }
    }, [location.pathname]);
    const [isRequisitionDialogOpen, setIsRequisitionDialogOpen] = useState(false);
    const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
    const [isUsageDialogOpen, setIsUsageDialogOpen] = useState(false);
    const [isSingleRestock, setIsSingleRestock] = useState(false);
    const [requisitionItems, setRequisitionItems] = useState<{ item_name: string; quantity: number; item_id?: string }[]>([{ item_name: "", quantity: 1 }]);
    const [usageForm, setUsageForm] = useState({
        item_id: "",
        item_name: "",
        quantity: 1,
        issued_to: "",
        vehicle_id: "",
        notes: ""
    });
    const [reqType, setReqType] = useState<"Job" | "General" | "Emergency">("General");
    const [reqTargetVehicleId, setReqTargetVehicleId] = useState<string | null>(null);
    const [reqTargetJobId, setReqTargetJobId] = useState<string | null>(null);
    const [isUpdateQtyOpen, setIsUpdateQtyOpen] = useState(false);
    const [selectedInventoryItem, setSelectedInventoryItem] = useState<any>(null);
    const [updateQtyDetails, setUpdateQtyDetails] = useState({
        quantity: 0
    });

    // New Product State
    const [newProduct, setNewProduct] = useState({
        item_name: "",
        category: "Parts",
        quantity: 0,
        unit_measure: "pcs",
        min_threshold: 5
    });

    // Log Fault State
    // Faults State (Arrays for Multi-Fault support)
    const [selectedVehicleId, setSelectedVehicleId] = useState("");
    const [horseFaults, setHorseFaults] = useState([{ description: "" }]);
    const [partnerFaults, setPartnerFaults] = useState([{ description: "" }]);

    // Suggestion management state
    const [activeSuggestion, setActiveSuggestion] = useState<{
        type: 'category',
        unit: 'horse' | 'partner',
        index: number
    } | null>(null);

    const [faultPriority, setFaultPriority] = useState("Routine");
    const [odometer, setOdometer] = useState("");
    const [affectedUnit, setAffectedUnit] = useState<"Horse" | "Trailer" | "Both">("Horse");

    // Fetch Vehicles
    const { data: vehicles, isLoading: isLoadingVehicles } = useQuery({
        queryKey: ["garage-vehicles"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_fleet")
                .select("id, vehicle_no, asset_type, asset_status, odometer_reading, horse_number, trailer_number, coupling_status")
                .order("vehicle_no");
            if (error) throw error;
            return data?.map(v => ({
                ...v,
                // Universal Plate Resolution for Search & Display
                plate_number: v.vehicle_no || v.horse_number || v.trailer_number || "NO PLATE",
                status: v.asset_status,
                is_coupled_db: v.coupling_status?.toLowerCase() === 'coupled'
            }));
        }
    });

    // Fetch Fault Types
    const { data: faultTypes, isLoading: isLoadingFaults } = useQuery({
        queryKey: ["garage-fault-types"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_fault_types").select("*").order("category");
            if (error) throw error;
            return data;
        }
    });

    // Fetch Personnel for Mechanic Allocation
    const { data: personnel } = useQuery({
        queryKey: ["garage-personnel"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_personnel").select("*").eq("is_active", true).order("name");
            if (error) throw error;
            return data;
        }
    });

    // Fetch Service Packages for PPM
    const { data: servicePackages } = useQuery({
        queryKey: ["garage-service-packages"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_service_packages").select("*").order("package_name");
            if (error) throw error;
            return data;
        }
    });

    // Fetch Quality Check Definitions
    const { data: qualityDefinitions } = useQuery({
        queryKey: ["garage-quality-definitions"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_quality_check_definitions").select("*").eq("is_active", true).order("display_order");
            if (error) throw error;
            return data;
        }
    });

    // Fetch Active Job Cards
    const { data: jobCards, isLoading: isLoadingJobs } = useQuery({
        queryKey: ["garage-job-cards"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_job_cards")
                .select(`
                    *, 
                    vehicle:logistics_fleet(id, vehicle_no, horse_number, trailer_number, asset_type), 
                    fault_list:garage_job_faults(id, fault_type_id, status, mechanic_notes, mechanic_id, fault_type:garage_fault_types(fault_name, category))
                `)
                .order("opened_at", { ascending: false });
            if (error) throw error;
            return data?.map((job: any) => {
                const v = job.vehicle;
                // Identify if this vehicle is part of a coupling
                const pair = (couplings || []).find((c: any) => c.horse_id === v?.id || c.trailer_id === v?.id);
                let displayPlate = v?.vehicle_no || v?.horse_number || v?.trailer_number || "NO PLATE";

                if (pair) {
                    const horse = (vehicles || []).find(x => x.id === pair.horse_id);
                    const trailer = (vehicles || []).find(x => x.id === pair.trailer_id);
                    const hP = horse?.plate_number || horse?.vehicle_no || "---";
                    const tP = trailer?.plate_number || trailer?.trailer_number || "---";
                    displayPlate = `${hP} + ${tP}`;
                }

                return {
                    ...job,
                    vehicle: { ...v, plate_number: displayPlate }
                };
            });
        }
    });

    // Fetch Active Couplings
    const { data: couplings, isLoading: isLoadingCouplings } = useQuery({
        queryKey: ["garage-couplings"],
        queryFn: async () => {
            const { data, error } = await sb.from("logistics_couplings").select("*").eq("is_active", true);
            if (error) throw error;
            return data || [];
        }
    });

    const { data: inventory, isLoading: isLoadingInventory } = useQuery({
        queryKey: ["garage-inventory"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_inventory").select("*").order("item_name");
            if (error) throw error;
            return data;
        },
        refetchInterval: 5000
    });

    const { data: requisitions, isLoading: isLoadingRequisitions } = useQuery({
        queryKey: ["garage-requisitions"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_requisitions").select("*, vehicle:logistics_fleet(vehicle_no, horse_number, trailer_number)").order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        }
    });

    const addProductMutation = useMutation({
        mutationFn: async (product: any) => {
            const { data, error } = await sb.from("garage_inventory").insert([product]).select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-inventory"] });
            toast({ title: "Product Added", description: "The item has been added to the general store." });
            setIsAddProductDialogOpen(false);
            setNewProduct({
                item_name: "",
                category: "Parts",
                quantity: 0,
                unit_measure: "pcs",
                min_threshold: 5
            });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Add Failed", description: err.message })
    });

    const updateQuantityMutation = useMutation({
        mutationFn: async ({ id, qty }: { id: string, qty: number }) => {
            const { error } = await sb.from("garage_inventory").update({
                quantity: qty
            }).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-inventory"] });
            queryClient.invalidateQueries({ queryKey: ["procurement-inventory"] });
            toast({ title: "Quantity Updated", description: "Storage records saved." });
            setIsUpdateQtyOpen(false);
        }
    });

    // Record Usage Mutation
    const recordUsageMutation = useMutation({
        mutationFn: async (usageData: any) => {
            const { error } = await sb.from("garage_inventory_usage").insert({
                item_id: usageData.item_id,
                item_name: usageData.item_name,
                quantity_used: usageData.quantity,
                issued_to: usageData.issued_to,
                vehicle_id: usageData.vehicle_id || null,
                notes: usageData.notes
            });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-inventory"] });
            queryClient.invalidateQueries({ queryKey: ["garage-usage"] });
            setIsUsageDialogOpen(false);
            setUsageForm({ item_id: "", item_name: "", quantity: 1, issued_to: "", vehicle_id: "", notes: "" });
            toast({ title: "Equipment Issued", description: "Store activity has been recorded." });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Usage Error", description: err.message })
    });

    // Fetch Usage Logs
    const { data: usageLogs } = useQuery({
        queryKey: ["garage-usage"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_inventory_usage").select("*, vehicle:logistics_fleet(vehicle_no, horse_number, trailer_number)").order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        }
    });

    const createRequisitionMutation = useMutation({
        mutationFn: async (payloads: any[]) => {
            const { data, error } = await sb.from("garage_requisitions").insert(
                payloads.map(p => ({
                    ...p,
                    target_company: 'SudEnergy Logistics'
                }))
            ).select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-requisitions"] });
            queryClient.invalidateQueries({ queryKey: ["procurement-requisitions"] });
            toast({ title: "Requisition Sent", description: "Your part request has been logged successfully." });
            setIsRequisitionDialogOpen(false);
            setRequisitionItems([{ item_name: "", quantity: 1 }]);
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Submission Error", description: err.message })
    });

    const logFaultMutation = useMutation({
        mutationFn: async () => {
            const vehicle = (vehicles || []).find(v => v.id === selectedVehicleId);
            if (!vehicle) throw new Error("Vehicle not found");
            const vehicleUpdates: string[] = [];

            const activeCoupling = (couplings || []).find((c: any) => c.horse_id === selectedVehicleId || c.trailer_id === selectedVehicleId);

            const resolveFaultId = async (cat: string, name: string) => {
                const existing = (faultTypes || []).find(f =>
                    (f.category || "").toLowerCase() === (cat || "").toLowerCase() &&
                    (f.fault_name || "").toLowerCase() === (name || "").toLowerCase()
                );
                if (existing) return existing.id;
                const { data: b, error: e } = await sb.from("garage_fault_types").insert([{ category: cat.trim(), fault_name: name.trim() }]).select().single();
                if (e) throw e;
                return b.id;
            };

            const handleFaultInsertion = async (jobId: string, faults: any[]) => {
                for (const f of faults) {
                    const faultTypeId = await resolveFaultId("General", f.description);
                    const { error: fe } = await sb.from("garage_job_faults").insert([{
                        job_id: jobId,
                        fault_type_id: faultTypeId,
                        mechanic_notes: f.description,
                        status: 'Pending'
                    }]);
                    if (fe) throw fe;
                }
            };

            // NEW: Check for existing active jobs first to prevent duplicates
            if (activeCoupling && affectedUnit === 'Both') {
                const existingHorseJob = await sb.from("garage_job_cards").select("id").eq("vehicle_id", activeCoupling.horse_id).neq("status", "Closed").maybeSingle();
                const existingPartnerJob = await sb.from("garage_job_cards").select("id").eq("vehicle_id", activeCoupling.trailer_id).neq("status", "Closed").maybeSingle();

                if (existingHorseJob.data || existingPartnerJob.data) {
                    throw new Error("One or both units already have an active job card. Please finish the existing job before logging a new one.");
                }
            } else {
                const targetId = (activeCoupling && affectedUnit === 'Trailer') ? activeCoupling.trailer_id : selectedVehicleId;
                const existingJob = await sb.from("garage_job_cards").select("id").eq("vehicle_id", targetId).neq("status", "Closed").maybeSingle();

                if (existingJob.data) {
                    throw new Error("This vehicle already has an active job card. Please add faults to the existing job instead.");
                }
            }

            if (activeCoupling && affectedUnit === 'Both') {
                const horseExists = (vehicles || []).some(v => v.id === activeCoupling.horse_id);
                const trailerExists = (vehicles || []).some(v => v.id === activeCoupling.trailer_id);
                if (!horseExists || !trailerExists) throw new Error(`Data mismatch: One of the units not found.`);

                // Horse Job
                const { data: hJob, error: hE } = await sb.from("garage_job_cards").insert([{
                    vehicle_id: activeCoupling.horse_id,
                    priority: faultPriority,
                    odometer_at_fault: odometer ? parseFloat(odometer) : null,
                    status: 'Open',
                    // NEW: Record package name if used
                    description: selectedPackageId ? `PPM: ${servicePackages?.find(p => p.id === selectedPackageId)?.package_name}` : null
                }]).select().single();
                if (hE) throw hE;
                await handleFaultInsertion(hJob.id, horseFaults);

                // Partner Job
                const { data: pJob, error: pE } = await sb.from("garage_job_cards").insert([{
                    vehicle_id: activeCoupling.trailer_id,
                    priority: faultPriority,
                    odometer_at_fault: odometer ? parseFloat(odometer) : null,
                    status: 'Open',
                    description: selectedPackageId ? `PPM: ${servicePackages?.find(p => p.id === selectedPackageId)?.package_name} (Trailer)` : null
                }]).select().single();
                if (pE) throw pE;
                await handleFaultInsertion(pJob.id, partnerFaults);

                vehicleUpdates.push(activeCoupling.horse_id, activeCoupling.trailer_id);
            } else {
                const targetId = (activeCoupling && affectedUnit === 'Trailer') ? activeCoupling.trailer_id : selectedVehicleId;
                const { data: job, error: je } = await sb.from("garage_job_cards").insert([{
                    vehicle_id: targetId,
                    priority: faultPriority,
                    odometer_at_fault: odometer ? parseFloat(odometer) : null,
                    status: 'Open',
                    description: selectedPackageId ? `PPM: ${servicePackages?.find(p => p.id === selectedPackageId)?.package_name}` : null
                }]).select().single();
                if (je) throw je;
                await handleFaultInsertion(job.id, horseFaults);
                vehicleUpdates.push(targetId);
            }

            for (const vid of vehicleUpdates) {
                const { error: vehicleError } = await sb.from("logistics_fleet").update({ asset_status: 'Maintenance' }).eq("id", vid);
                if (vehicleError) throw vehicleError;
            }
        },
        onSuccess: () => {
            toast({ title: "Fault Logged", description: "Vehicle status updated to 'In Garage'." });
            setIsLogFaultOpen(false);
            resetForm();
            queryClient.invalidateQueries({ queryKey: ["garage-job-cards"] });
            queryClient.invalidateQueries({ queryKey: ["garage-vehicles"] });
        },
        onError: (error: any) => toast({ variant: "destructive", title: "Cannot Log Fault", description: error.message })
    });

    const resetForm = () => {
        setSelectedVehicleId("");
        setHorseFaults([{ description: "" }]);
        setPartnerFaults([{ description: "" }]);
        setFaultPriority("Routine");
        setOdometer("");
        setAffectedUnit("Horse");
        setActiveSuggestion(null);
        setRequisitionItems([{ item_name: "", quantity: 1 }]);
        setSelectedPackageId(null);
        setQualityCheckAnswers({});
    };

    const deleteJobMutation = useMutation({
        mutationFn: async ({ jobId, vehicleId }: { jobId: string, vehicleId: string }) => {
            const { error: de } = await sb.from("garage_job_cards").delete().eq("id", jobId);
            if (de) throw de;
            const { error: ve } = await sb.from("logistics_fleet").update({ asset_status: 'Active' }).eq("id", vehicleId);
            if (ve) throw ve;
        },
        onSuccess: () => {
            toast({ title: "Job Deleted", description: "Maintenance record removed and vehicle status reset." });
            queryClient.invalidateQueries({ queryKey: ["garage-job-cards"] });
            queryClient.invalidateQueries({ queryKey: ["garage-vehicles"] });
        }
    });

    const updateJobStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string, status: string }) => {
            const { error } = await sb.from("garage_job_cards").update({ status }).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-job-cards"] });
            toast({ title: "Status Updated" });
        }
    });

    const updateFaultStatusMutation = useMutation({
        mutationFn: async ({ faultId, status, mechanicId }: { faultId: string, status?: string, mechanicId?: string }) => {
            const updates: any = {};
            if (status) updates.status = status;
            if (mechanicId) updates.mechanic_id = mechanicId;

            const { error, data } = await sb.from("garage_job_faults").update(updates).eq("id", faultId).select();
            if (error) {
                console.error("Database error updating fault status:", error);
                throw error;
            }
            return { faultId, status };
        },
        onMutate: async ({ faultId, status, mechanicId }) => {
            // Cancel outgoing refetches to avoid race conditions
            await queryClient.cancelQueries({ queryKey: ["garage-job-cards"] });

            // Snapshot the previous values
            const previousJobs = queryClient.getQueryData(["garage-job-cards"]);
            const previousSelectedJob = selectedJobForTasks;

            // Optimistically update to the new value
            queryClient.setQueryData(["garage-job-cards"], (old: any) => {
                if (!old) return old;
                return old.map((job: any) => ({
                    ...job,
                    fault_list: job.fault_list?.map((f: any) =>
                        f.id === faultId ? { ...f, ...(status ? { status } : {}), ...(mechanicId ? { mechanic_id: mechanicId } : {}) } : f
                    )
                }));
            });

            // CRITICAL: Also update selectedJobForTasks for immediate UI update
            if (selectedJobForTasks) {
                setSelectedJobForTasks({
                    ...selectedJobForTasks,
                    fault_list: selectedJobForTasks.fault_list?.map((f: any) =>
                        f.id === faultId ? { ...f, ...(status ? { status } : {}), ...(mechanicId ? { mechanic_id: mechanicId } : {}) } : f
                    )
                });
            }

            return { previousJobs, previousSelectedJob };
        },
        onError: (err: any, variables, context: any) => {
            console.error("Error updating fault status:", err);
            // Rollback on error
            if (context?.previousJobs) {
                queryClient.setQueryData(["garage-job-cards"], context.previousJobs);
            }
            if (context?.previousSelectedJob) {
                setSelectedJobForTasks(context.previousSelectedJob);
            }
            const errorMsg = err?.message || err?.error_description || "Failed to update status";
            toast({ variant: "destructive", title: "Error", description: errorMsg });
        },
        onSettled: () => {
            // Always refetch after error or success to ensure consistency
            queryClient.invalidateQueries({ queryKey: ["garage-job-cards"] });
        },
        onSuccess: () => {
            toast({ title: "Task Status Updated" });
        }
    });

    const releaseVehicleMutation = useMutation({
        mutationFn: async ({ jobId, vehicleId, approvalNote, releaseNote, qualityCheck }: {
            jobId: string,
            vehicleId: string,
            approvalNote?: string,
            releaseNote?: string,
            qualityCheck?: any
        }) => {
            const { data: { user } } = await supabase.auth.getUser();

            // Get fault statuses to determine if follow-up is needed
            const { data: faults } = await sb.from("garage_job_faults")
                .select("status")
                .eq("job_id", jobId);

            const hasPendingIssues = faults?.some((f: any) => ['Partial', 'Not Repaired'].includes(f.status));

            // Update job card with all tracking data
            const { error: je } = await sb.from("garage_job_cards").update({
                status: 'Closed',
                closed_at: new Date().toISOString(),
                released_by: user?.id,
                requires_followup: hasPendingIssues,
                head_mechanic_approval: approvalNote || null,
                release_notes: releaseNote || null,
                approved_by: hasPendingIssues ? user?.id : null,
                approved_at: hasPendingIssues ? new Date().toISOString() : null,
                // NEW: Quality Check tracking
                quality_check: qualityCheck || {},
                verified_by: user?.id,
                verified_at: new Date().toISOString()
            }).eq("id", jobId);

            if (je) throw je;

            // Vehicle status is updated by database trigger
            // But we'll also update it here for immediate feedback
            const { error: ve } = await sb.from("logistics_fleet")
                .update({ asset_status: 'Active' })
                .eq("id", vehicleId);

            if (ve) throw ve;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-job-cards"] });
            queryClient.invalidateQueries({ queryKey: ["garage-vehicles"] });
            setIsManageTasksOpen(false);
            setIsApprovalDialogOpen(false);
            setApprovalNotes("");
            setReleaseNotes("");
            setJobToRelease(null);
            setQualityCheckAnswers({});
            setIsQualityCheckOpen(false);
            toast({ title: "Vehicle Released", description: "Maintenance record closed successfully" });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Release Failed", description: error.message });
        }
    });

    const forceReleaseMutation = useMutation({
        mutationFn: async (vehicleId: string) => {
            const { error } = await sb.from("logistics_fleet").update({ asset_status: 'Active' }).eq("id", vehicleId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-vehicles"] });
            toast({ title: "Status Reset", description: "Vehicle is now Active." });
        }
    });

    const addFaultRow = (unit: 'horse' | 'partner') => {
        const set = unit === 'horse' ? setHorseFaults : setPartnerFaults;
        set(prev => [...prev, { description: "" }]);
    };

    const removeFaultRow = (unit: 'horse' | 'partner', index: number) => {
        const set = unit === 'horse' ? setHorseFaults : setPartnerFaults;
        set(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
    };

    const updateFaultRow = (unit: 'horse' | 'partner', index: number, field: string, value: string) => {
        const set = unit === 'horse' ? setHorseFaults : setPartnerFaults;
        set(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
    };

    const handleLogFault = () => {
        const isBoth = affectedUnit === 'Both' && isCoupled;
        const mainIncomplete = !selectedVehicleId || horseFaults.some(f => !f.description);
        const partnerIncomplete = isBoth && partnerFaults.some(f => !f.description);

        if (mainIncomplete || partnerIncomplete) {
            toast({ variant: "destructive", title: "Missing Fields", description: "Please enter the fault description(s)." });
            return;
        }

        if (!window.confirm("Are you sure you want to log these faults? Once logged, the job card cannot be deleted for accountability purposes.")) {
            return;
        }

        logFaultMutation.mutate();
    };

    const handlePrintJob = (job: any) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        // Use the aggregate display faults if available, otherwise fallback to current job faults
        const faultsToPrint = job._displayFaults || (job.fault_list || []).map((f: any) => ({ ...f, _unitPlate: getVehicleSpecificPlate(job.vehicle) }));

        // Group faults by Unit Plate
        const groupedFaults: Record<string, any[]> = {};
        faultsToPrint.forEach((f: any) => {
            const plate = f._unitPlate || 'Main Vehicle';
            if (!groupedFaults[plate]) groupedFaults[plate] = [];
            groupedFaults[plate].push(f);
        });

        const faultsHtml = Object.entries(groupedFaults).map(([plate, faults]) => `
            <tr>
                <td colspan="2" style="background: #f1f5f9; padding: 10px; font-weight: bold; font-size: 13px; color: #475569; border-top: 1px solid #e2e8f0;">
                    UNIT: ${plate}
                </td>
            </tr>
            ${faults.map((f: any) => `
                <tr>
                    <td style="padding: 10px 15px; border-bottom: 1px solid #eee;">${f.mechanic_notes || f.fault_type?.fault_name}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-transform: uppercase; font-weight: bold; font-size: 10px; color: ${f.status === 'Completed' ? '#10b981' : f.status === 'Partial' ? '#f59e0b' : '#ef4444'}">${f.status}</td>
                </tr>
            `).join('')}
        `).join('') || '<tr><td colspan="2">No faults logged</td></tr>';

        printWindow.document.write(`
            <html>
                <head>
                    <title>Job Card #${job.job_number}</title>
                    <style>
                        body { font-family: sans-serif; padding: 20px; color: #333; }
                        .header { border-bottom: 2px solid #4f46e5; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
                        .plate { font-size: 24px; font-weight: bold; color: #1e293b; }
                        .details { margin-bottom: 30px; display: grid; grid-template-cols: 1fr 1fr; gap: 20px; }
                        table { width: 100%; border-collapse: collapse; }
                        th { text-align: left; background: #f8fafc; padding: 8px; border-bottom: 1px solid #cbd5e1; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <h1 style="margin:0; font-size: 18px; color: #4f46e5;">GARAGE JOB CARD</h1>
                            <div class="plate">${job.vehicle?.plate_number}</div>
                        </div>
                        <div style="text-align: right">
                            <div style="font-weight: bold;">Job #${job.job_number}</div>
                            <div style="font-size: 12px; color: #666;">Opened: ${new Date(job.opened_at).toLocaleString()}</div>
                        </div>
                    </div>
                    <div class="details">
                        <div>
                            <strong>Priority:</strong> ${job.priority}<br>
                            <strong>Status:</strong> ${job.status}
                        </div>
                        <div>
                            <strong>Odometer at Entry:</strong> ${job.odometer_at_fault || 'N/A'} KM
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Fault Description</th>
                                <th>Current Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${faultsHtml}
                        </tbody>
                    </table>
                    <div style="margin-top: 50px; border-top: 1px dashed #ccc; padding-top: 20px; font-size: 12px; font-style: italic;">
                        Generated by Weighbridge System - Garage Module
                    </div>
                    <script>window.onload = () => { window.print(); window.close(); };</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const selectedVehicleData = (vehicles || []).find(v => v.id === selectedVehicleId);
    const filteredVehicles = (vehicles || []).filter(v =>
        (v.plate_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.vehicle_no || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.horse_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.trailer_number || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
    const isCoupled = !!(couplings || []).find(c => c.horse_id === selectedVehicleId || c.trailer_id === selectedVehicleId);

    const getVehicleSpecificPlate = (v: any) => v?.vehicle_no || v?.horse_number || v?.trailer_number || "Unknown";

    // Logic to Combine Faults for Coupled Vehicles in "Manage Tasks"
    const activeJobCoupling = selectedJobForTasks ? (couplings || []).find(c => c.horse_id === selectedJobForTasks.vehicle_id || c.trailer_id === selectedJobForTasks.vehicle_id) : null;
    const partnerJobId = activeJobCoupling ? (activeJobCoupling.horse_id === selectedJobForTasks.vehicle_id ? activeJobCoupling.trailer_id : activeJobCoupling.horse_id) : null;
    const partnerJob = partnerJobId ? (jobCards || []).find(j => j.vehicle_id === partnerJobId && j.status !== 'Closed') : null;



    const handleReleaseClick = () => {
        if (!selectedJobForTasks) return;

        // Check for ANY incomplete tasks across horse, partner, or debt
        const issues = allTaskFaults.filter((f: any) => ['Partial', 'Not Repaired', 'Pending'].includes(f.status));
        const hasPending = issues.some(i => i.status === 'Pending');

        if (hasPending) {
            toast({ variant: "destructive", title: "Cannot Release", description: "Some tasks are still 'Pending'. Please set them to Completed, Partial, or Not Repaired." });
            return;
        }

        const isPartial = issues.length > 0;
        if (isPartial) {
            setJobToRelease(selectedJobForTasks);
            setIsApprovalDialogOpen(true);
        } else {
            // All completed - Go to Quality Check first
            setIsQualityCheckOpen(true);
        }
    };

    // NEW: Fetch persistent maintenance debt (unresolved faults from previous visits)
    const { data: maintenanceDebt } = useQuery({
        queryKey: ["maintenance-debt", selectedJobForTasks?.vehicle_id, partnerJob?.vehicle_id],
        enabled: !!selectedJobForTasks,
        queryFn: async () => {
            // Pull debt for BOTH vehicles if coupled
            const activeCoupling = (couplings || []).find(c => c.horse_id === selectedJobForTasks.vehicle_id || c.trailer_id === selectedJobForTasks.vehicle_id);
            const vids = [selectedJobForTasks.vehicle_id];
            if (activeCoupling) {
                const partnerId = activeCoupling.horse_id === selectedJobForTasks.vehicle_id ? activeCoupling.trailer_id : activeCoupling.horse_id;
                vids.push(partnerId);
            }

            const { data, error } = await sb
                .from("garage_job_faults")
                .select(`
                    *,
                    job:garage_job_cards!inner(id, opened_at, vehicle_id, vehicle:logistics_fleet(vehicle_no, horse_number, trailer_number))
                `)
                .in("job.vehicle_id", vids)
                .neq("status", "Completed")
                .neq("job_id", selectedJobForTasks.id)
                .order("created_at", { ascending: true });

            if (error) throw error;
            return data;
        }
    });

    // Helper: Calculate age in days
    const getFaultAge = (date: string) => {
        const days = Math.floor((new Date().getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
        return days;
    };

    // Helper: Aging Color
    const getAgeColor = (days: number) => {
        if (days >= 15) return "bg-red-100 text-red-700 border-red-200";
        if (days >= 8) return "bg-orange-100 text-orange-700 border-orange-200";
        if (days >= 4) return "bg-amber-100 text-amber-700 border-amber-200";
        return "bg-green-100 text-green-700 border-green-200";
    };

    const allTaskFaults = selectedJobForTasks ? [
        ...(selectedJobForTasks.fault_list || []).map((f: any) => ({ ...f, _plate: getVehicleSpecificPlate(selectedJobForTasks.vehicle) })),
        ...(partnerJob?.fault_list || []).map((f: any) => ({ ...f, _plate: getVehicleSpecificPlate(partnerJob?.vehicle) })),
        ...(maintenanceDebt || []).map((f: any) => ({ ...f, _plate: f.job?.vehicle?.plate_number || "Carry-over" }))
    ] : [];

    return (
        <div className="space-y-6 p-6 animate-fade-in">
            {/* Conditional Header: Only show for Repairs tab */}
            {activeTab === 'jobs' && (
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Garage Command</h1>
                        <p className="text-muted-foreground mt-1">Manage maintenance, log faults, and track repairs.</p>
                    </div>
                    <Button onClick={() => setIsLogFaultOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
                        <Wrench className="w-4 h-4 mr-2" />
                        Log New Fault
                    </Button>
                </div>
            )}

            {/* Content Area Rendering based on state (controlled by URL in useEffect) */}

            {activeTab === 'jobs' ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="border-none shadow-sm bg-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Vehicles In Garage</CardTitle>
                                <Truck className="h-4 w-4 text-indigo-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-slate-900">{jobCards?.filter(j => j.status !== 'Closed').length || 0}</div>
                            </CardContent>
                        </Card>
                        <Card className="border-none shadow-sm bg-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Critical Jobs</CardTitle>
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-slate-900">{jobCards?.filter(j => j.priority === 'Critical' && j.status !== 'Closed').length || 0}</div>
                            </CardContent>
                        </Card>
                        <Card className="border-none shadow-sm bg-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Pending Issues</CardTitle>
                                <Clock className="h-4 w-4 text-amber-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-slate-900">
                                    {(() => {
                                        const pendingJobs = jobCards?.filter(j =>
                                            j.status === 'Closed' &&
                                            (j.requires_followup || j.fault_list?.some((f: any) => ['Partial', 'Not Repaired'].includes(f.status)))
                                        ) || [];
                                        const uniqueVehicles = new Set(pendingJobs.map(j => j.vehicle_id));
                                        return uniqueVehicles.size;
                                    })()}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1 font-medium italic">Vehicles need follow-up</p>
                            </CardContent>
                        </Card>

                        {/* Recent Activity Feed for Accountability */}
                        <Card className="border-none shadow-sm bg-white md:row-span-2 lg:row-span-1">
                            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b border-slate-50 bg-slate-50/50">
                                <CardTitle className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                    <HistoryIcon className="h-3.5 w-3.5 text-indigo-500" />
                                    Accountability Feed
                                </CardTitle>
                                <Badge variant="outline" className="text-[9px] bg-white">Live</Badge>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="h-[120px] px-4 py-2">
                                    <div className="space-y-3">
                                        {(usageLogs || []).slice(0, 10).map((log: any) => (
                                            <div key={log.id} className="flex gap-3 items-start border-l-2 border-indigo-100 pl-3 py-0.5">
                                                <div className="flex flex-col flex-1">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[11px] font-bold text-slate-700">{log.issued_to || "Staff"}</span>
                                                        <span className="text-[9px] text-slate-400">
                                                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 leading-tight">
                                                        Took <span className="text-indigo-600 font-medium">{log.quantity_used} {log.item_name}</span> for <span className="text-slate-700 font-medium">{log.vehicle?.vehicle_no || log.vehicle?.horse_number || "General"}</span>
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                        {(!usageLogs || usageLogs.length === 0) && (
                                            <p className="text-[10px] text-slate-400 italic text-center py-4">No recent activity logged</p>
                                        )}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>

                        {/* Status Recovery Card - Only shows if vehicles are stuck */}
                        {(() => {
                            const stuckVehicles = (vehicles || []).filter(v =>
                                v.status === 'Maintenance' &&
                                !(jobCards || []).some(j => j.vehicle_id === v.id && j.status !== 'Closed')
                            );
                            if (stuckVehicles.length === 0) return null;
                            return (
                                <Card className="border-indigo-200 shadow-sm bg-indigo-50/30 md:col-span-2 lg:col-span-4">
                                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                                        <CardTitle className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-2">
                                            <AlertTriangle className="h-3 w-3" /> Status Recovery Needed
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="px-4 pb-4">
                                        <div className="space-y-2">
                                            {stuckVehicles.map(v => (
                                                <div key={v.id} className="flex items-center justify-between p-2 bg-white border border-indigo-100 rounded-lg">
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-bold text-slate-800">{v.plate_number}</span>
                                                        <span className="text-[11px] text-slate-500">Stuck in 'Maintenance' with no job card</span>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-[10px] border-indigo-200 text-indigo-600 hover:bg-indigo-600 hover:text-white"
                                                        onClick={() => forceReleaseMutation.mutate(v.id)}
                                                        disabled={forceReleaseMutation.isPending}
                                                    >
                                                        {forceReleaseMutation.isPending ? "Fixing..." : "Unlock Unit"}
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })()}
                    </div>

                    <Card className="border-none shadow-lg bg-white">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">Active Job Cards</CardTitle>
                                <div className="flex w-full max-w-sm items-center space-x-2">
                                    <Input
                                        placeholder="Search jobs..."
                                        className="h-8 w-[150px] lg:w-[250px]"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4">Job ID</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4">Vehicle</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4">Fault</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4">Status Breakdown</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4">Priority</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4">Status</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4">Opened</TableHead>
                                        <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {jobCards && jobCards.length > 0 ? (
                                        (() => {
                                            const processedIds = new Set();
                                            const rows = [];

                                            const filteredJobs = (jobCards || []).filter((j: any) =>
                                                String(j.job_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                                                (j.vehicle?.plate_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                                                (j.fault_list || []).some((f: any) => (f.mechanic_notes || "").toLowerCase().includes(searchTerm.toLowerCase()))
                                            );

                                            for (const job of filteredJobs) {
                                                if (processedIds.has(job.id)) continue;

                                                // Find partner job in the current list
                                                const pair = (couplings || []).find(c => c.horse_id === job.vehicle_id || c.trailer_id === job.vehicle_id);
                                                let partner = null;
                                                if (pair) {
                                                    const pId = pair.horse_id === job.vehicle_id ? pair.trailer_id : pair.horse_id;
                                                    partner = jobCards.find((j: any) => j.vehicle_id === pId && j.id !== job.id);
                                                }

                                                if (partner) {
                                                    if (processedIds.has(partner.id)) continue;
                                                    processedIds.add(partner.id);
                                                }
                                                processedIds.add(job.id);

                                                // Determine effective display data - Tag faults with unit plates for clear identification
                                                const displayFaults = [
                                                    ...(job.fault_list || []).map((f: any) => ({ ...f, _unitPlate: getVehicleSpecificPlate(job.vehicle) })),
                                                    ...(partner?.fault_list || []).map((f: any) => ({ ...f, _unitPlate: getVehicleSpecificPlate(partner.vehicle) }))
                                                ];

                                                // If either is open, show as Open/Active
                                                const isActive = job.status !== 'Closed' || (partner && partner.status !== 'Closed');
                                                const displayStatus = isActive ? (job.status === 'Open' || partner?.status === 'Open' ? 'Open' : 'In Progress') : 'Closed';

                                                // Priority: Critical wins
                                                const displayPriority = (job.priority === 'Critical' || partner?.priority === 'Critical') ? 'Critical' :
                                                    (job.priority === 'Urgent' || partner?.priority === 'Urgent') ? 'Urgent' : job.priority;

                                                rows.push({
                                                    ...job,
                                                    _displayFaults: displayFaults,
                                                    _displayStatus: displayStatus,
                                                    _displayPriority: displayPriority
                                                });
                                            }

                                            return rows.map((job: any) => (
                                                <TableRow key={job.id} className="hover:bg-slate-50/50">
                                                    <TableCell className="text-[13px] font-medium text-slate-700">{job.job_number}</TableCell>
                                                    <TableCell className="text-[13px] font-medium text-slate-700">{job.vehicle?.plate_number}</TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            {job._displayFaults && job._displayFaults.length > 0 ? (
                                                                <>
                                                                    <span className="text-[13px] text-slate-600">
                                                                        {job._displayFaults[0].mechanic_notes || job._displayFaults[0].fault_type?.fault_name}
                                                                        {job._displayFaults.length > 1 && (
                                                                            <span className="text-indigo-600 ml-1 font-medium">+{job._displayFaults.length - 1} more</span>
                                                                        )}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <span className="text-[11px] text-slate-400 italic">No tasks logged</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {job._displayFaults && job._displayFaults.length > 0 ? (
                                                            <div className="flex items-center gap-1">
                                                                {job._displayFaults.filter((f: any) => f.status === 'Completed').length > 0 && (
                                                                    <Badge className="h-5 text-[9px] bg-green-100 text-green-700 hover:bg-green-100">
                                                                        ✓ {job._displayFaults.filter((f: any) => f.status === 'Completed').length}
                                                                    </Badge>
                                                                )}
                                                                {job._displayFaults.filter((f: any) => f.status === 'Partial').length > 0 && (
                                                                    <Badge className="h-5 text-[9px] bg-amber-100 text-amber-700 hover:bg-amber-100">
                                                                        ⚠ {job._displayFaults.filter((f: any) => f.status === 'Partial').length}
                                                                    </Badge>
                                                                )}
                                                                {job._displayFaults.filter((f: any) => f.status === 'Not Repaired').length > 0 && (
                                                                    <Badge className="h-5 text-[9px] bg-red-100 text-red-700 hover:bg-red-100">
                                                                        ❌ {job._displayFaults.filter((f: any) => f.status === 'Not Repaired').length}
                                                                    </Badge>
                                                                )}
                                                                {job._displayFaults.filter((f: any) => ['Pending', 'In Progress'].includes(f.status)).length > 0 && (
                                                                    <Badge className="h-5 text-[9px] bg-slate-100 text-slate-600 hover:bg-slate-100">
                                                                        ⏳ {job._displayFaults.filter((f: any) => ['Pending', 'In Progress'].includes(f.status)).length}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[11px] text-slate-400">—</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={job._displayPriority === 'Critical' ? 'bg-red-50 text-red-600 border-red-200' : job._displayPriority === 'Urgent' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-blue-50 text-blue-600 border-blue-200'}>{job._displayPriority}</Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge className={job._displayStatus === 'Open' ? 'bg-slate-100 text-slate-600' : job._displayStatus === 'In Progress' ? 'bg-indigo-100 text-indigo-600' : 'bg-green-100 text-green-600'}>{job._displayStatus}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-slate-500 text-xs">{new Date(job.opened_at).toLocaleDateString()}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className={`h-8 w-8 p-0 ${job._displayStatus === 'Open' ? 'text-indigo-600' : 'text-slate-400'}`}
                                                                onClick={() => {
                                                                    setSelectedJobForTasks(job);
                                                                    setIsManageTasksOpen(true);
                                                                }}
                                                                title="Manage Tasks"
                                                            >
                                                                <FileText className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-8 w-8 p-0 text-slate-600 hover:text-indigo-600"
                                                                onClick={() => handlePrintJob(job)}
                                                                title="Print Job Card"
                                                            >
                                                                <Printer className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ));
                                        })()
                                    ) : (
                                        <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No active maintenance jobs found.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </>
            ) : activeTab === 'inventory' ? (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <h1 className="text-2xl font-semibold tracking-tight text-slate-800 flex items-center gap-2">
                                <Package className="w-6 h-6 text-indigo-500" />
                                Garage Inventory Store
                            </h1>
                            <p className="text-sm text-slate-500 mt-1 font-medium tracking-tight">Manage stock levels and request part restocks</p>
                        </div>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 font-medium"
                            onClick={() => setIsAddProductDialogOpen(true)}
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add New Product
                        </Button>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search store by product name or category..."
                            value={inventorySearch}
                            onChange={(e) => setInventorySearch(e.target.value)}
                            className="pl-10 h-11 bg-white border-slate-200 shadow-sm focus:border-indigo-400 transition-all rounded-xl"
                        />
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        <Card className="border-none shadow-sm bg-white hover:shadow-md transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[11px] font-medium text-slate-500 uppercase tracking-widest">Catalog Items</CardTitle>
                                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                    <Package className="h-4 w-4" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-semibold text-slate-900">{inventory?.length || 0}</div>
                                <p className="text-sm text-slate-500 mt-1 font-medium tracking-tight">Unique products registered</p>
                            </CardContent>
                        </Card>
                        <Card className="border-none shadow-sm bg-white hover:shadow-md transition-shadow border-l-4 border-l-red-400">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-[11px] font-medium text-red-500 uppercase tracking-widest">Low Stock Alerts</CardTitle>
                                <div className="p-2 bg-red-50 rounded-lg text-red-600">
                                    <AlertTriangle className="h-4 w-4" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-semibold text-slate-900">
                                    {(inventory || []).filter((i: any) => (i.quantity || 0) <= (i.min_threshold || 0)).length}
                                </div>
                                <p className="text-sm text-slate-500 mt-1 font-medium tracking-tight">Items below threshold</p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(inventory || [])
                            .filter((item: any) =>
                                item.item_name.toLowerCase().includes(inventorySearch.toLowerCase()) ||
                                item.category.toLowerCase().includes(inventorySearch.toLowerCase())
                            )
                            .map((item: any) => {
                                const isLow = (item.quantity || 0) <= (item.min_threshold || 0);
                                return (
                                    <div key={item.id} className={`p-5 rounded-2xl bg-white shadow-sm border-2 transition-all ${isLow ? 'border-red-100 bg-red-50/10' : 'border-slate-50 hover:border-indigo-100'} flex flex-col justify-between h-[210px]`}>
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-1">
                                                <h4 className="font-medium text-slate-700 text-lg leading-tight tracking-tight">{item.item_name}</h4>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-400 font-medium uppercase tracking-widest bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">{item.category}</span>
                                                </div>
                                            </div>
                                            <Badge className={`px-2.5 py-1 text-xs font-semibold ${isLow ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-green-500 hover:bg-green-600'}`}>
                                                {item.quantity} {item.unit_measure}
                                            </Badge>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 mt-4">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-xs font-semibold border-amber-200 text-amber-600 hover:bg-amber-50 hover:border-amber-300 rounded-lg group"
                                                onClick={() => {
                                                    setUsageForm({
                                                        item_id: item.id,
                                                        item_name: item.item_name,
                                                        quantity: 1,
                                                        issued_to: "",
                                                        vehicle_id: "",
                                                        notes: ""
                                                    });
                                                    setIsUsageDialogOpen(true);
                                                }}
                                            >
                                                <ShoppingCart className="w-3 h-3 mr-1" />
                                                Issue
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-xs font-semibold border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 rounded-lg group"
                                                onClick={() => {
                                                    setReqType("General");
                                                    setReqTargetVehicleId(null);
                                                    setReqTargetJobId(null);
                                                    setIsSingleRestock(true);
                                                    setRequisitionItems([{ item_name: item.item_name, quantity: 5, item_id: item.id }]);
                                                    setIsRequisitionDialogOpen(true);
                                                }}
                                            >
                                                <TrendingUp className="w-3 h-3 mr-1" />
                                                Restock
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="col-span-2 h-8 text-xs font-medium uppercase tracking-wider border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200 rounded-lg"
                                                onClick={() => {
                                                    setSelectedInventoryItem(item);
                                                    setUpdateQtyDetails({ quantity: item.quantity || 0 });
                                                    setIsUpdateQtyOpen(true);
                                                }}
                                            >
                                                Update Physical count
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            ) : activeTab === 'logs' ? (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2 font-medium">
                                <HistoryIcon className="w-6 h-6 text-indigo-500" />
                                Store Hub Activity
                            </h1>
                            <p className="text-sm text-slate-500 font-medium tracking-tight">Accountability & Stock Consumption Monitoring</p>
                        </div>

                        <div className="flex items-center gap-3">
                            <Select value={selectedMonth.toString()} onValueChange={(val) => setSelectedMonth(parseInt(val))}>
                                <SelectTrigger className="w-[140px] h-10 bg-white border-slate-200">
                                    <SelectValue placeholder="Month" />
                                </SelectTrigger>
                                <SelectContent>
                                    {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (
                                        <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
                                <SelectTrigger className="w-[100px] h-10 bg-white border-slate-200">
                                    <SelectValue placeholder="Year" />
                                </SelectTrigger>
                                <SelectContent>
                                    {[2024, 2025, 2026].map(y => (
                                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Monthly Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <Card className="border-none shadow-sm bg-indigo-600 text-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-medium uppercase tracking-widest opacity-80">Monthly Items Issued</CardTitle>
                                <ShoppingCart className="h-4 w-4 opacity-80" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-semibold">
                                    {(usageLogs || []).filter((l: any) => {
                                        const d = new Date(l.created_at);
                                        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
                                    }).reduce((sum: number, l: any) => sum + (l.quantity_used || 0), 0)}
                                </div>
                                <p className="text-xs opacity-70 mt-1">Total physical units moved this month</p>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-sm bg-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-widest">Active Requests</CardTitle>
                                <ClipboardCheck className="h-4 w-4 text-indigo-400" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-semibold text-slate-900">
                                    {(requisitions || []).filter((r: any) => r.status === 'Pending').length}
                                </div>
                                <p className="text-xs text-slate-400 mt-1 italic">Pending Store Room restocks</p>
                            </CardContent>
                        </Card>
                    </div>

                    <Tabs value={activeStoreTab} onValueChange={setActiveStoreTab} className="w-full">
                        <TabsList className="bg-slate-100/50 p-1 mb-6">
                            <TabsTrigger value="requisitions" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-6 py-2 text-xs font-semibold uppercase tracking-wider">
                                <HistoryIcon className="w-4 h-4 mr-2" /> Requisitions History
                            </TabsTrigger>
                            <TabsTrigger value="issued" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-6 py-2 text-xs font-semibold uppercase tracking-wider">
                                <ShoppingCart className="w-4 h-4 mr-2" /> Issued Items Report
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="requisitions" className="space-y-6">
                            <Card className="border-none shadow-lg bg-white overflow-hidden">
                                <CardHeader className="bg-slate-50/50 border-b">
                                    <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <HistoryIcon className="w-4 h-4 text-slate-400" />
                                        Part Requisitions History
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50/30">
                                                <TableHead className="text-xs font-medium uppercase tracking-widest text-slate-400">Sent Date</TableHead>
                                                <TableHead className="text-xs font-medium uppercase tracking-widest text-slate-400">Type</TableHead>
                                                <TableHead className="text-xs font-medium uppercase tracking-widest text-slate-400">Item Requested</TableHead>
                                                <TableHead className="text-xs font-medium uppercase tracking-widest text-slate-400">Qty</TableHead>
                                                <TableHead className="text-xs font-medium uppercase tracking-widest text-slate-400">Lead Time</TableHead>
                                                <TableHead className="text-right text-xs font-medium uppercase tracking-widest text-slate-400">Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(requisitions || []).map((req: any) => {
                                                const created = new Date(req.created_at);
                                                const now = new Date();
                                                const hours = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60));
                                                const minutes = Math.floor((now.getTime() - created.getTime()) / (1000 * 60)) % 60;

                                                return (
                                                    <TableRow key={req.id} className="hover:bg-slate-50/50 border-b border-slate-100 last:border-0 border-transparent transition-colors">
                                                        <TableCell className="text-xs text-slate-500 font-medium">
                                                            <div className="flex flex-col">
                                                                <span>{created.toLocaleDateString()}</span>
                                                                <span className="font-mono text-[11px] text-indigo-400">{created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell><Badge variant="outline" className="text-[10px] uppercase font-medium py-0 h-5 border-slate-200 text-slate-400 tracking-tighter">{req.request_type}</Badge></TableCell>
                                                        <TableCell className="font-medium text-slate-700 text-sm tracking-tight">{req.item_name}</TableCell>
                                                        <TableCell className="text-sm font-mono font-semibold text-slate-600">{req.quantity_requested}</TableCell>
                                                        <TableCell className="text-sm font-medium text-slate-400 italic">
                                                            {['Stocked', 'Approved', 'Rejected'].includes(req.status) ? (
                                                                <span className="text-slate-500 font-semibold not-italic">Closed</span>
                                                            ) : `${hours}h ${minutes}m`}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Badge className={`text-sm font-semibold px-2 py-0.5 rounded-full ${req.status === 'Pending' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                                                req.status === 'Approved' || req.status === 'Stocked' ? 'bg-green-50 text-green-600 border border-green-100' :
                                                                    req.status === 'Rejected' ? 'bg-red-50 text-red-600 border border-red-100' :
                                                                        'bg-indigo-50 text-indigo-600 border border-indigo-100'
                                                                }`}>{req.status}</Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="issued" className="space-y-6">
                            <Card className="border-none shadow-lg bg-white overflow-hidden">
                                <CardHeader className="bg-slate-50/50 border-b">
                                    <CardTitle className="text-xs font-semibold text-amber-600 uppercase tracking-widest flex items-center gap-2">
                                        <ShoppingCart className="w-4 h-4 text-amber-400" />
                                        {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][selectedMonth]} {selectedYear} Issued Items Report
                                    </CardTitle>
                                    <p className="text-sm text-slate-500 mt-1 font-medium tracking-tight">Accountability & Stock Consumption Monitoring</p>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50/20">
                                                <TableHead className="text-xs font-medium uppercase tracking-widest text-slate-400">Date & Time</TableHead>
                                                <TableHead className="text-xs font-medium uppercase tracking-widest text-slate-400">Issued To</TableHead>
                                                <TableHead className="text-xs font-medium uppercase tracking-widest text-slate-400">Item Taken</TableHead>
                                                <TableHead className="text-xs font-medium uppercase tracking-widest text-slate-400 text-center">Qty</TableHead>
                                                <TableHead className="text-xs font-medium uppercase tracking-widest text-slate-400">Used On Vehicle</TableHead>
                                                <TableHead className="text-right text-xs font-medium uppercase tracking-widest text-slate-400">Notes</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(usageLogs || [])
                                                .filter((log: any) => {
                                                    const d = new Date(log.created_at);
                                                    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
                                                })
                                                .map((log: any) => {
                                                    const created = new Date(log.created_at);
                                                    return (
                                                        <TableRow key={log.id} className="hover:bg-amber-50/30 border-b border-slate-50 transition-colors">
                                                            <TableCell className="text-xs text-slate-500 font-medium">
                                                                <div className="flex flex-col">
                                                                    <span>{created.toLocaleDateString()}</span>
                                                                    <span className="font-mono text-[11px] text-amber-500">{created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="font-medium text-slate-700 text-sm">{log.issued_to}</TableCell>
                                                            <TableCell className="font-medium text-slate-700 text-sm">{log.item_name}</TableCell>
                                                            <TableCell className="text-sm font-mono font-semibold text-red-500 text-center">-{log.quantity_used}</TableCell>
                                                            <TableCell>
                                                                {log.vehicle ? (
                                                                    <Badge variant="outline" className="text-xs font-mono font-medium bg-slate-50 text-slate-600">
                                                                        {log.vehicle.vehicle_no || log.vehicle.horse_number}
                                                                    </Badge>
                                                                ) : <span className="text-xs text-slate-400 italic">General Use</span>}
                                                            </TableCell>
                                                            <TableCell className="text-right text-xs text-slate-500 italic max-w-[150px] truncate">
                                                                {log.notes || '---'}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            {(usageLogs || []).filter((log: any) => {
                                                const d = new Date(log.created_at);
                                                return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
                                            }).length === 0 && (
                                                    <TableRow>
                                                        <TableCell colSpan={6} className="h-24 text-center text-sm text-slate-400 italic">No usage recorded for this period.</TableCell>
                                                    </TableRow>
                                                )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            ) : null
            }

            {/* Requisition Dialog */}
            <Dialog open={isRequisitionDialogOpen} onOpenChange={setIsRequisitionDialogOpen}>
                <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-semibold text-slate-700">
                            <Plus className="w-5 h-5 text-indigo-500" />
                            {isSingleRestock ? "Request Part Restock" : "Create Batch Requisition"}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {requisitionItems.map((item, idx) => (
                            <div key={idx} className="space-y-3 p-3 border rounded-lg bg-slate-50/50 relative group">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Item ${idx + 1}</Label>
                                    <Input
                                        placeholder="What is needed? (e.g. Brake Pads)"
                                        value={item.item_name}
                                        onChange={(e) => {
                                            const newItems = [...requisitionItems];
                                            newItems[idx].item_name = e.target.value;
                                            setRequisitionItems(newItems);
                                        }}
                                        className="h-9 bg-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quantity</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={item.quantity}
                                        onChange={(e) => {
                                            const newItems = [...requisitionItems];
                                            newItems[idx].quantity = parseInt(e.target.value) || 1;
                                            setRequisitionItems(newItems);
                                        }}
                                        className="h-9 bg-white"
                                    />
                                </div>
                                {requisitionItems.length > 1 && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white border shadow-sm text-slate-400 hover:text-red-500 hover:bg-red-50"
                                        onClick={() => setRequisitionItems(requisitionItems.filter((_, i) => i !== idx))}
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </Button>
                                )}
                            </div>
                        ))}

                        {!isSingleRestock && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full border-dashed border-slate-300 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 h-9"
                                onClick={() => setRequisitionItems([...requisitionItems, { item_name: "", quantity: 1 }])}
                            >
                                <Plus className="w-3 h-3 mr-1.5" /> Add Another Item
                            </Button>
                        )}

                        {reqType === 'Job' && (
                            <div className="p-3 bg-indigo-50/30 rounded-lg border border-indigo-100 text-xs flex items-center gap-2">
                                <Truck className="w-4 h-4 text-indigo-500" />
                                <span className="text-slate-600">Requisition linked to: <strong className="text-indigo-900">{reqTargetVehicleId ? (vehicles as any[])?.find(v => v.id === reqTargetVehicleId)?.plate_number : "Loading..."}</strong></span>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRequisitionDialogOpen(false)} className="h-10">Cancel</Button>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700 h-10"
                            onClick={() => {
                                const validItems = requisitionItems.filter(i => i.item_name.trim());
                                if (validItems.length === 0) {
                                    toast({ variant: "destructive", title: "Missing Items", description: "Please enter at least one item name." });
                                    return;
                                }

                                const payloads = validItems.map(item => ({
                                    request_type: reqType,
                                    vehicle_id: reqTargetVehicleId,
                                    job_id: reqTargetJobId,
                                    item_id: item.item_id,
                                    item_name: item.item_name,
                                    quantity_requested: item.quantity,
                                    status: 'Pending'
                                }));

                                createRequisitionMutation.mutate(payloads);
                            }}
                            disabled={createRequisitionMutation.isPending}
                        >
                            {createRequisitionMutation.isPending ? "Sending..." : `Submit ${requisitionItems.length > 1 ? requisitionItems.length + ' ' : ''}Requisition${requisitionItems.length > 1 ? 's' : ''}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Daily Usage / Issuance Dialog */}
            <Dialog open={isUsageDialogOpen} onOpenChange={setIsUsageDialogOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-semibold text-slate-700">
                            <ShoppingCart className="w-5 h-5 text-amber-500" />
                            Issue Stock: {usageForm.item_name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-500 uppercase">Quantity To Issue</Label>
                            <Input
                                type="number"
                                min={1}
                                value={usageForm.quantity}
                                onChange={(e) => setUsageForm({ ...usageForm, quantity: parseInt(e.target.value) || 1 })}
                                className="h-10 text-lg font-mono font-bold text-red-500"
                            />
                            <p className="text-xs text-slate-400 italic font-medium">This quantity will be subtracted from current stock immediately.</p>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-500 uppercase">Issued To (Personnel)</Label>
                            <Input
                                placeholder="Who is taking this item? (e.g. Mechanic Juma)"
                                value={usageForm.issued_to}
                                onChange={(e) => setUsageForm({ ...usageForm, issued_to: e.target.value })}
                                className="h-10"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-500 uppercase">Target Vehicle (Optional)</Label>
                            <Select value={usageForm.vehicle_id} onValueChange={(val) => setUsageForm({ ...usageForm, vehicle_id: val })}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Select vehicle if applicable" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(vehicles || []).map((v: any) => (
                                        <SelectItem key={v.id} value={v.id} className="text-xs font-mono">
                                            {v.plate_number}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-500 uppercase">Usage Notes</Label>
                            <Textarea
                                placeholder="Brief reason or task details..."
                                value={usageForm.notes}
                                onChange={(e) => setUsageForm({ ...usageForm, notes: e.target.value })}
                                className="min-h-[80px]"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsUsageDialogOpen(false)} className="h-10">Cancel</Button>
                        <Button
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-10"
                            disabled={!usageForm.issued_to.trim() || recordUsageMutation.isPending}
                            onClick={() => recordUsageMutation.mutate(usageForm)}
                        >
                            {recordUsageMutation.isPending ? "Recording..." : "Confirm & Record Usage"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Product Dialog */}
            <Dialog open={isAddProductDialogOpen} onOpenChange={setIsAddProductDialogOpen}>
                <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="w-5 h-5 text-indigo-500" />
                            Add New Product to Store
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-bold text-slate-500 uppercase">Product Name</Label>
                                <Input
                                    placeholder="e.g. Engine Oil"
                                    value={newProduct.item_name}
                                    onChange={(e) => setNewProduct({ ...newProduct, item_name: e.target.value })}
                                    className="h-10"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-bold text-slate-500 uppercase">Category</Label>
                                <Select value={newProduct.category} onValueChange={(val) => setNewProduct({ ...newProduct, category: val })}>
                                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Parts">Parts</SelectItem>
                                        <SelectItem value="Fluids">Fluids</SelectItem>
                                        <SelectItem value="Tools">Tools</SelectItem>
                                        <SelectItem value="General">General</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-bold text-slate-500 uppercase">Initial Stock</Label>
                                <Input
                                    type="number"
                                    value={newProduct.quantity}
                                    onChange={(e) => setNewProduct({ ...newProduct, quantity: parseInt(e.target.value) || 0 })}
                                    className="h-10"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-bold text-slate-500 uppercase">Unit measure</Label>
                                <Input
                                    placeholder="pcs, Liters, Sets..."
                                    value={newProduct.unit_measure}
                                    onChange={(e) => setNewProduct({ ...newProduct, unit_measure: e.target.value })}
                                    className="h-10"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-bold text-slate-500 uppercase">Min Threshold (Alarm)</Label>
                                <div className="relative">
                                    <AlertTriangle className="absolute left-3 top-3 h-4 w-4 text-amber-500" />
                                    <Input
                                        type="number"
                                        value={newProduct.min_threshold}
                                        onChange={(e) => setNewProduct({ ...newProduct, min_threshold: parseInt(e.target.value) || 0 })}
                                        className="h-10 pl-10"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddProductDialogOpen(false)} className="h-10">Cancel</Button>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700 h-10 font-bold"
                            disabled={!newProduct.item_name || addProductMutation.isPending}
                            onClick={() => addProductMutation.mutate(newProduct)}
                        >
                            {addProductMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Registry Product"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Update Quantity Dialog */}
            <Dialog open={isUpdateQtyOpen} onOpenChange={setIsUpdateQtyOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Package className="w-5 h-5 text-indigo-500" />
                            Update Physical Stock
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="p-3 bg-slate-50 rounded border text-center">
                            <Label className="text-xs uppercase font-bold text-slate-500">Selected Item</Label>
                            <p className="font-bold text-slate-900">{selectedInventoryItem?.item_name}</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-500 uppercase">New Physical Quantity</Label>
                            <Input
                                type="number"
                                value={updateQtyDetails.quantity}
                                onChange={(e) => setUpdateQtyDetails({ quantity: parseInt(e.target.value) || 0 })}
                                className="h-12 text-2xl font-mono font-bold text-indigo-600"
                            />
                            <p className="text-[10px] text-slate-400 italic">Enter the actual count from the physical store.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsUpdateQtyOpen(false)} className="h-10">Cancel</Button>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700 h-10 font-bold"
                            disabled={updateQuantityMutation.isPending}
                            onClick={() => updateQuantityMutation.mutate({
                                id: selectedInventoryItem?.id,
                                qty: updateQtyDetails.quantity
                            })}
                        >
                            {updateQuantityMutation.isPending ? "Saving..." : "Save Count"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isLogFaultOpen} onOpenChange={setIsLogFaultOpen}>
                <DialogContent className={affectedUnit === 'Both' && isCoupled ? "sm:max-w-[900px] duration-300" : "sm:max-w-[500px] duration-300"}>
                    <DialogHeader><DialogTitle>Log New Fault</DialogTitle></DialogHeader>
                    <div className="max-h-[75vh] overflow-y-auto pr-2 px-1 py-4 -mr-1">
                        <div className="space-y-6">
                            <Label>Select Vehicle</Label>
                            <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                                <SelectTrigger><SelectValue placeholder="Search plate number..." /></SelectTrigger>
                                <SelectContent>
                                    <div className="p-2"><Input placeholder="Filter..." className="h-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
                                    <ScrollArea className="h-[200px]">
                                        {filteredVehicles.length > 0 ? (
                                            filteredVehicles.map((v: any) => {
                                                const pair = (couplings || []).find((c: any) => c.horse_id === v.id || c.trailer_id === v.id);
                                                let pPlate = null;
                                                if (pair) {
                                                    const pId = pair.horse_id === v.id ? pair.trailer_id : pair.horse_id;
                                                    pPlate = (vehicles as any[])?.find(x => x.id === pId)?.vehicle_no;
                                                }
                                                return (
                                                    <SelectItem key={v.id} value={v.id}>
                                                        <div className="flex flex-col py-1">
                                                            <span className="font-normal text-slate-900 text-[11px]">{v.plate_number}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[11px] text-slate-400 font-normal">{v.asset_type}</span>
                                                                {pPlate && (
                                                                    <span className="text-[10px] text-indigo-600 font-normal">
                                                                        Linked: {v.asset_type === 'Horse' ? `${v.plate_number} + ${pPlate}` : `${pPlate} + ${v.plate_number}`} 🔗
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </SelectItem>
                                                );
                                            })
                                        ) : (<div className="p-2 text-sm text-center text-muted-foreground italic">No vehicles found.</div>)}
                                    </ScrollArea>
                                </SelectContent>
                            </Select>

                            {/* NEW: Service Package Selector (PPM) */}
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-2">
                                    <HistoryIcon className="w-3 h-3 text-indigo-500" />
                                    Service Package (Preventative Maintenance)
                                </Label>
                                <Select
                                    value={selectedPackageId || "none"}
                                    onValueChange={(val) => {
                                        if (val === "none") {
                                            setSelectedPackageId(null);
                                            return;
                                        }
                                        const pkg = servicePackages?.find(p => p.id === val);
                                        if (pkg) {
                                            setSelectedPackageId(val);
                                            const items = pkg.base_items as string[];
                                            if (items && items.length > 0) {
                                                setHorseFaults(items.map(desc => ({ description: desc })));
                                                setPartnerFaults(items.map(desc => ({ description: desc })));
                                            }
                                        }
                                    }}
                                >
                                    <SelectTrigger className="h-10 border-indigo-100 bg-indigo-50/10">
                                        <SelectValue placeholder="Select a maintenance package..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none" className="text-slate-400 italic">No Package (Custom Repair)</SelectItem>
                                        {(servicePackages || []).map((pkg: any) => (
                                            <SelectItem key={pkg.id} value={pkg.id}>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{pkg.package_name}</span>
                                                    <span className="text-[10px] text-slate-400">{pkg.category} • {pkg.recommended_interval}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {isCoupled && (
                                <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                                    <Label className="text-indigo-900 font-bold flex items-center gap-2 mb-3 text-sm"><Link className="w-4 h-4 text-indigo-500" />Unit Isolation (Coupled Vehicle)</Label>
                                    {(() => {
                                        const vList = (vehicles || []) as any[];
                                        const pair = (couplings || []).find(c => c.horse_id === selectedVehicleId || c.trailer_id === selectedVehicleId);

                                        // Specific lookup based on Fleet Registry's Source of Truth
                                        const horse = vList.find(v => v.id === pair?.horse_id);
                                        const trailer = vList.find(v => v.id === pair?.trailer_id);

                                        // Horse: vehicle_no OR horse_number
                                        // Trailer: trailer_number
                                        const hPlate = horse?.vehicle_no || horse?.horse_number || "Horse Plate";
                                        const tPlate = trailer?.trailer_number || trailer?.vehicle_no || "Trailer Plate";

                                        // Dynamic Type Label
                                        const tType = trailer?.asset_type?.toUpperCase() || "UNIT";

                                        return (
                                            <div className="grid grid-cols-3 gap-3">
                                                <label className={`flex flex-col items-center gap-1 p-3 rounded-lg border cursor-pointer transition-all ${affectedUnit === 'Horse' ? 'bg-white border-indigo-400 shadow-sm' : 'bg-white/50 border-slate-200 hover:bg-white'}`}>
                                                    <input type="radio" className="sr-only" name="affectedUnit" checked={affectedUnit === 'Horse'} onChange={() => setAffectedUnit('Horse')} />
                                                    <span className="text-sm uppercase font-normal text-slate-500 tracking-tight">HORSE UNIT</span>
                                                    <span className="text-sm font-normal text-slate-900">{hPlate}</span>
                                                </label>
                                                <label className={`flex flex-col items-center gap-1 p-3 rounded-lg border cursor-pointer transition-all ${affectedUnit === 'Trailer' ? 'bg-white border-indigo-400 shadow-sm' : 'bg-white/50 border-slate-200 hover:bg-white'}`}>
                                                    <input type="radio" className="sr-only" name="affectedUnit" checked={affectedUnit === 'Trailer'} onChange={() => setAffectedUnit('Trailer')} />
                                                    <span className="text-sm uppercase font-normal text-slate-500 tracking-tight">{tType} UNIT</span>
                                                    <span className="text-sm font-normal text-slate-900">{tPlate}</span>
                                                </label>
                                                <label className={`flex flex-col items-center gap-1 p-3 rounded-lg border cursor-pointer transition-all ${affectedUnit === 'Both' ? 'bg-white border-indigo-400 shadow-sm' : 'bg-white/50 border-slate-200 hover:bg-white'}`}>
                                                    <input type="radio" className="sr-only" name="affectedUnit" checked={affectedUnit === 'Both'} onChange={() => setAffectedUnit('Both')} />
                                                    <span className="text-sm uppercase font-normal text-slate-500 tracking-tight">BOTH UNITS</span>
                                                    <span className="text-[10px] font-normal text-slate-700 truncate w-full text-center">{hPlate} + {tPlate}</span>
                                                </label>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Fault Entry Area */}
                            <div>
                                <div className={`grid gap-6 ${affectedUnit === 'Both' && isCoupled ? 'md:grid-cols-2 bg-slate-50 p-4 rounded-xl border border-slate-200' : ''}`}>
                                    {/* Horse/Main Section */}
                                    <div className="space-y-4">
                                        {affectedUnit === 'Both' && isCoupled && (
                                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2 px-2 bg-white py-2 rounded border shadow-sm">
                                                <Truck className="w-3 h-3" /> HORSE UNIT: <span className="text-slate-900 ml-1">{(() => {
                                                    const vList = (vehicles || []) as any[];
                                                    const pair = (couplings || []).find(c => c.horse_id === selectedVehicleId || c.trailer_id === selectedVehicleId);
                                                    const horse = vList.find(v => v.id === pair?.horse_id);
                                                    return horse?.vehicle_no || horse?.horse_number || "---";
                                                })()}</span>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            {horseFaults.map((fault, idx) => (
                                                <div key={idx} className="flex gap-3 items-center group">
                                                    <span className="text-xs font-mono text-slate-400 w-4 pt-1 text-right">{idx + 1}.</span>
                                                    <div className="flex-1">
                                                        <Input
                                                            placeholder={!selectedVehicleId ? "Select a vehicle..." : "Describe the issue (e.g. Oil leak)..."}
                                                            value={fault.description}
                                                            onChange={(e) => updateFaultRow('horse', idx, 'description', e.target.value)}
                                                            className="h-9 bg-white border-slate-200 focus:border-indigo-400 focus:ring-indigo-100 placeholder:text-slate-400"
                                                            disabled={!selectedVehicleId}
                                                        />
                                                    </div>
                                                    <Button variant="ghost" size="icon" onClick={() => removeFaultRow('horse', idx)} className={`flex-shrink-0 h-8 w-8 text-slate-300 hover:text-red-500 hover:bg-red-50 ${horseFaults.length === 1 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                            <div className="pl-7">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 h-7 px-2"
                                                    onClick={() => addFaultRow('horse')}
                                                    disabled={!selectedVehicleId}
                                                >
                                                    <Plus className="w-3 h-3 mr-1.5" /> Add Another Fault
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Partner Section */}
                                    {affectedUnit === 'Both' && isCoupled && (
                                        <div className="space-y-4 border-l pl-6 border-slate-200">
                                            <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2 flex items-center justify-between px-2 bg-indigo-50 py-2 rounded border border-indigo-100 shadow-sm">
                                                <div className="flex items-center gap-2">
                                                    <Link className="w-3 h-3" /> {(() => {
                                                        const vList = (vehicles || []) as any[];
                                                        const pair = (couplings || []).find(c => c.horse_id === selectedVehicleId || c.trailer_id === selectedVehicleId);
                                                        const trailer = vList.find(v => v.id === pair?.trailer_id);
                                                        return trailer?.asset_type?.toUpperCase() || "PARTNER";
                                                    })()} UNIT: <span className="text-indigo-900 ml-1">{(() => {
                                                        const vList = (vehicles || []) as any[];
                                                        const pair = (couplings || []).find(c => c.horse_id === selectedVehicleId || c.trailer_id === selectedVehicleId);
                                                        const trailer = vList.find(v => v.id === pair?.trailer_id);
                                                        return trailer?.trailer_number || trailer?.vehicle_no || "---";
                                                    })()}</span>
                                                </div>
                                                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-slate-400 hover:text-indigo-600" onClick={() => setPartnerFaults(JSON.parse(JSON.stringify(horseFaults)))}>Copy From Horse</Button>
                                            </div>

                                            <div className="space-y-2">
                                                {partnerFaults.map((fault, idx) => (
                                                    <div key={idx} className="flex gap-3 items-center group">
                                                        <span className="text-xs font-mono text-indigo-300 w-4 pt-1 text-right">{idx + 1}.</span>
                                                        <div className="flex-1">
                                                            <Input
                                                                placeholder="Describe partner issue..."
                                                                value={fault.description}
                                                                onChange={(e) => updateFaultRow('partner', idx, 'description', e.target.value)}
                                                                className="h-9 bg-white border-indigo-100 focus:border-indigo-400 focus:ring-indigo-100 placeholder:text-indigo-300/50"
                                                                disabled={!selectedVehicleId}
                                                            />
                                                        </div>
                                                        <Button variant="ghost" size="icon" onClick={() => removeFaultRow('partner', idx)} className={`flex-shrink-0 h-8 w-8 text-slate-300 hover:text-red-500 hover:bg-red-50 ${partnerFaults.length === 1 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                ))}
                                                <div className="pl-7">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 h-7 px-2"
                                                        onClick={() => addFaultRow('partner')}
                                                        disabled={!selectedVehicleId}
                                                    >
                                                        <Plus className="w-3 h-3 mr-1.5" /> Add Partner Fault
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-4">
                                <div className="space-y-2">
                                    <Label>Overall Priority</Label>
                                    <Select value={faultPriority} onValueChange={setFaultPriority}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Routine">Routine (Scheduled)</SelectItem>
                                            <SelectItem value="Urgent">Urgent (Affects Operation)</SelectItem>
                                            <SelectItem value="Critical">Critical (Safety Hazard)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Current Odometer (Optional)</Label>
                                    <Input type="number" placeholder="0" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsLogFaultOpen(false)}>Cancel</Button>
                        <Button onClick={handleLogFault} disabled={logFaultMutation.isPending || !selectedVehicleId} className="bg-red-600 hover:bg-red-700 hover:text-white text-white transition-colors">{logFaultMutation.isPending ? "Logging..." : "Log Fault & Down Vehicle"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Manage Tasks Dialog */}
            <Dialog open={isManageTasksOpen} onOpenChange={setIsManageTasksOpen}>
                <DialogContent className={`${maintenanceDebt && maintenanceDebt.length > 0 ? 'sm:max-w-[1000px]' : 'sm:max-w-[600px]'} w-[95vw] transition-all duration-300`}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-lg">
                            <Wrench className="w-6 h-6 text-indigo-600" />
                            Manage Tasks: <span className="text-slate-800 border-b border-slate-100 px-1 font-medium">{selectedJobForTasks?.vehicle?.plate_number}</span>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="py-2 space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                            <div className="p-3 bg-slate-50 rounded-lg border">
                                <span className="text-slate-500 block mb-1 uppercase tracking-wider font-bold">Opened On</span>
                                <span className="text-slate-900">{selectedJobForTasks && new Date(selectedJobForTasks.opened_at).toLocaleDateString()}</span>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-lg border">
                                <span className="text-slate-500 block mb-1 uppercase tracking-wider font-bold">Priority</span>
                                <Badge variant="outline" className={selectedJobForTasks?.priority === 'Critical' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                                    {selectedJobForTasks?.priority}
                                </Badge>
                            </div>
                            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 col-span-2">
                                <span className="text-indigo-600 block mb-1 uppercase tracking-wider font-bold flex items-center gap-2">
                                    <TrendingUp className="w-3 h-3" /> Total Parts Investment
                                </span>
                                <span className="text-lg font-bold text-indigo-900">
                                    TZS {selectedJobForTasks?.total_parts_investment?.toLocaleString() || "0"}
                                </span>
                            </div>
                        </div>

                        {/* Conditional 2-Column Workspace */}
                        <div className={`grid ${maintenanceDebt && maintenanceDebt.length > 0 ? 'md:grid-cols-2 gap-6' : 'grid-cols-1'} h-[500px]`}>
                            {/* Left Column: Current Job Faults */}
                            <div className="flex flex-col gap-3">
                                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 px-1">
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    Active Job Tasks
                                </h3>
                                <div className="flex-1 overflow-y-auto border rounded-xl bg-slate-50/30 p-2 space-y-4">
                                    {/* Main Vehicle */}
                                    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                                        <div className="bg-slate-50 px-3 py-1.5 border-b flex items-center gap-2">
                                            <Badge variant="outline" className="bg-white text-slate-700 border-slate-200 font-mono text-[13px] h-7 px-2.5">
                                                {getVehicleSpecificPlate(selectedJobForTasks?.vehicle)}
                                            </Badge>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-[10px] text-indigo-600 ml-auto border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300 font-bold uppercase tracking-wider"
                                                onClick={() => {
                                                    setReqType("Job");
                                                    setReqTargetVehicleId(selectedJobForTasks.vehicle_id);
                                                    setReqTargetJobId(selectedJobForTasks.id);
                                                    setIsRequisitionDialogOpen(true);
                                                }}
                                            >
                                                <ShoppingCart className="w-3 h-3 mr-1.5" /> Request Item
                                            </Button>
                                        </div>
                                        <div className="divide-y">
                                            {selectedJobForTasks?.fault_list?.length > 0 ? selectedJobForTasks.fault_list.map((f: any) => (
                                                <div key={f.id} className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors">
                                                    <span className={`text-sm font-medium ${f.status === 'Completed' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                                        {f.mechanic_notes || f.fault_type?.fault_name}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <Select value={f.mechanic_id || "unassigned"} onValueChange={(val) => updateFaultStatusMutation.mutate({ faultId: f.id, mechanicId: val })}>
                                                            <SelectTrigger className="h-7 text-[10px] w-36 border-slate-200 bg-white">
                                                                <SelectValue placeholder="Assign Mechanic" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="unassigned" className="text-slate-400 italic">Unassigned</SelectItem>
                                                                {(personnel || []).map((p: any) => (
                                                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <Select value={f.status} onValueChange={(val) => updateFaultStatusMutation.mutate({ faultId: f.id, status: val })}>
                                                            <SelectTrigger className={`h-7 text-[10px] w-32 font-bold ${f.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' : f.status === 'Partial' ? 'bg-amber-50 text-amber-700 border-amber-200' : f.status === 'Not Repaired' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="Pending">Pending</SelectItem>
                                                                <SelectItem value="In Progress">In Progress</SelectItem>
                                                                <SelectItem value="Partial">Partial Repair</SelectItem>
                                                                <SelectItem value="Not Repaired">Not Repaired</SelectItem>
                                                                <SelectItem value="Completed">Completed</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                            )) : <div className="p-4 text-center text-xs text-muted-foreground italic">No faults logged</div>}
                                        </div>
                                    </div>

                                    {/* Partner Vehicle */}
                                    {partnerJob && (
                                        <div className="bg-white rounded-lg border shadow-sm overflow-hidden border-indigo-100">
                                            <div className="bg-indigo-50/50 px-3 py-1.5 border-b flex items-center gap-2">
                                                <Badge variant="outline" className="bg-white text-indigo-600 border-indigo-100 font-mono text-[13px] h-7 px-2.5">
                                                    {getVehicleSpecificPlate(partnerJob.vehicle)}
                                                </Badge>
                                                <span className="text-[10px] text-indigo-500 font-medium uppercase tracking-wider">Coupled Unit</span>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-[10px] text-indigo-600 ml-auto border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300 font-bold uppercase tracking-wider"
                                                    onClick={() => {
                                                        setReqType("Job");
                                                        setReqTargetVehicleId(partnerJob.vehicle_id);
                                                        setReqTargetJobId(partnerJob.id);
                                                        setIsRequisitionDialogOpen(true);
                                                    }}
                                                >
                                                    <ShoppingCart className="w-3 h-3 mr-1.5" /> Request Item
                                                </Button>
                                            </div>
                                            <div className="divide-y">
                                                {partnerJob.fault_list?.length > 0 ? partnerJob.fault_list.map((f: any) => (
                                                    <div key={f.id} className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors">
                                                        <span className={`text-sm font-medium ${f.status === 'Completed' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                                            {f.mechanic_notes || f.fault_type?.fault_name}
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            <Select value={f.mechanic_id || "unassigned"} onValueChange={(val) => updateFaultStatusMutation.mutate({ faultId: f.id, mechanicId: val })}>
                                                                <SelectTrigger className="h-7 text-[10px] w-36 border-indigo-100 bg-white">
                                                                    <SelectValue placeholder="Assign Mechanic" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="unassigned" className="text-slate-400 italic">Unassigned</SelectItem>
                                                                    {(personnel || []).map((p: any) => (
                                                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            <Select value={f.status} onValueChange={(val) => updateFaultStatusMutation.mutate({ faultId: f.id, status: val })}>
                                                                <SelectTrigger className={`h-7 text-[10px] w-32 font-bold ${f.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' : f.status === 'Partial' ? 'bg-amber-50 text-amber-700 border-amber-200' : f.status === 'Not Repaired' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="Pending">Pending</SelectItem>
                                                                    <SelectItem value="In Progress">In Progress</SelectItem>
                                                                    <SelectItem value="Partial">Partial Repair</SelectItem>
                                                                    <SelectItem value="Not Repaired">Not Repaired</SelectItem>
                                                                    <SelectItem value="Completed">Completed</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                )) : <div className="p-4 text-center text-xs text-muted-foreground italic">No faults logged</div>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Column: Carry-over Repairs (Conditional) */}
                            {maintenanceDebt && maintenanceDebt.length > 0 && (
                                <div className="flex flex-col gap-3">
                                    <h3 className="text-sm font-bold text-amber-700 flex items-center gap-2 px-1 underline decoration-amber-200 underline-offset-4">
                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                        Carry-over Repairs (Prior Visits)
                                    </h3>
                                    <div className="flex-1 overflow-y-auto border border-amber-100 rounded-xl bg-amber-50/20 p-2 space-y-3">
                                        {maintenanceDebt.map((f: any) => {
                                            const age = getFaultAge(f.created_at);
                                            return (
                                                <div key={f.id} className="bg-white border border-amber-100 rounded-lg shadow-sm p-3 flex items-center justify-between hover:border-amber-300 transition-colors">
                                                    <div className="flex flex-col gap-1 flex-1 mr-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-medium text-amber-900 leading-tight">
                                                                {f.mechanic_notes}
                                                            </span>
                                                            <Badge variant="outline" className={`text-[10px] h-5 px-1.5 border font-medium ${getAgeColor(age)}`}>
                                                                {age}d old
                                                            </Badge>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] text-amber-600 font-medium">
                                                            <Truck className="w-3 h-3" />
                                                            <span>{f.job?.vehicle?.vehicle_no || f.job?.vehicle?.horse_number || f.job?.vehicle?.trailer_number}</span>
                                                            <span className="opacity-50">•</span>
                                                            <span>Logged {new Date(f.created_at).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                    <Select value={f.status} onValueChange={(val) => updateFaultStatusMutation.mutate({ faultId: f.id, status: val })}>
                                                        <SelectTrigger className={`h-8 text-[10px] w-32 font-bold ${f.status === 'Partial' ? 'bg-amber-50 text-amber-700 border-amber-200' : f.status === 'Not Repaired' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="Partial">Partial Repair</SelectItem>
                                                            <SelectItem value="Not Repaired">Not Repaired</SelectItem>
                                                            <SelectItem value="Completed">Completed</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="bg-slate-50 -mx-6 -mb-6 p-6 rounded-b-lg border-t gap-2 sm:justify-between items-center">
                        <div className="flex items-center gap-2">
                            {allTaskFaults.every((f: any) => ['Completed', 'Partial', 'Not Repaired'].includes(f.status)) ? (
                                <span className="text-xs font-bold text-green-600 flex items-center gap-1">
                                    <CheckCircle2 className="w-4 h-4" /> READY FOR RELEASE
                                </span>
                            ) : (
                                <span className="text-xs font-bold text-slate-400">
                                    {allTaskFaults.filter((f: any) => ['Completed', 'Partial', 'Not Repaired'].includes(f.status)).length} / {allTaskFaults.length} TASKS DONE
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setIsManageTasksOpen(false)}>Close</Button>
                            <Button
                                disabled={!allTaskFaults.every((f: any) => ['Completed', 'Partial', 'Not Repaired'].includes(f.status)) || releaseVehicleMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-medium"
                                onClick={handleReleaseClick}
                            >
                                {releaseVehicleMutation.isPending ? "Releasing..." : <><Truck className="w-4 h-4" /> Release Vehicle</>}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Approval Dialog for Partial Releases */}
            <Dialog open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-700">
                            <AlertTriangle className="w-5 h-5" />
                            Partial Release - Approval Required
                        </DialogTitle>
                    </DialogHeader>

                    <div className="py-4 space-y-6">
                        {/* Release Summary */}
                        <div className="bg-slate-50 p-4 rounded-lg border">
                            <h3 className="text-sm font-bold text-slate-700 mb-3">Release Summary: {jobToRelease?.vehicle?.plate_number}</h3>
                            <div className="space-y-2">
                                {jobToRelease?.fault_list?.map((f: any) => (
                                    <div key={f.id} className="flex items-center gap-2 text-sm">
                                        {f.status === 'Completed' ? (
                                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                                        ) : f.status === 'Partial' ? (
                                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                                        ) : (
                                            <XCircle className="w-4 h-4 text-red-600" />
                                        )}
                                        <span className={f.status === 'Completed' ? 'text-slate-500 line-through' : 'font-medium'}>
                                            {f.mechanic_notes || f.fault_type?.fault_name}
                                        </span>
                                        <span className={`ml-auto text-xs font-bold ${f.status === 'Completed' ? 'text-green-600' :
                                            f.status === 'Partial' ? 'text-amber-600' :
                                                'text-red-600'
                                            }`}>
                                            {f.status === 'Partial' ? 'Partial Repair' : f.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 pt-4 border-t">
                                <div className="text-sm font-bold text-slate-700">
                                    Status: {jobToRelease?.fault_list?.filter((f: any) => f.status === 'Completed').length} Completed,{' '}
                                    {jobToRelease?.fault_list?.filter((f: any) => f.status === 'Partial').length} Partial,{' '}
                                    {jobToRelease?.fault_list?.filter((f: any) => f.status === 'Not Repaired').length} Not Repaired
                                </div>
                            </div>
                        </div>

                        {/* Warning Message */}
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                                <div className="flex-1">
                                    <h4 className="font-bold text-amber-900 mb-1">Partial Release Requires Approval</h4>
                                    <p className="text-sm text-amber-800">
                                        This vehicle has pending repairs. Head of Mechanics approval is REQUIRED to release with incomplete work.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Approval Note - MANDATORY */}
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700 flex items-center gap-1">
                                Head of Mechanics Approval Note <span className="text-red-600">*</span>
                            </Label>
                            <Textarea
                                placeholder="Explain why vehicle is being released with pending repairs. Include follow-up plan, parts status, safety assessment, etc."
                                value={approvalNotes}
                                onChange={(e) => setApprovalNotes(e.target.value)}
                                className="min-h-[100px]"
                                required
                            />
                            <p className="text-xs text-slate-500">This note will be visible to the Logistics team and recorded in vehicle history.</p>
                        </div>

                        {/* Release Notes - Optional */}
                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Release Notes (Optional)</Label>
                            <Textarea
                                placeholder="Additional notes about the release, operational limitations, etc."
                                value={releaseNotes}
                                onChange={(e) => setReleaseNotes(e.target.value)}
                                className="min-h-[60px]"
                            />
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => {
                            setIsApprovalDialogOpen(false);
                            setApprovalNotes("");
                            setReleaseNotes("");
                            setJobToRelease(null);
                        }}>
                            Cancel
                        </Button>
                        <Button
                            disabled={!approvalNotes.trim() || releaseVehicleMutation.isPending}
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => {
                                releaseVehicleMutation.mutate({
                                    jobId: jobToRelease.id,
                                    vehicleId: jobToRelease.vehicle_id,
                                    approvalNote: approvalNotes,
                                    releaseNote: releaseNotes,
                                    qualityCheck: { type: 'partial_approved', note: approvalNotes }
                                });
                            }}
                        >
                            {releaseVehicleMutation.isPending ? "Releasing..." : "Approve & Release Vehicle"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* NEW: Digital Quality Check Dialog */}
            <Dialog open={isQualityCheckOpen} onOpenChange={setIsQualityCheckOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-green-700">
                            <ClipboardCheck className="w-5 h-5" />
                            Digital Quality Verification
                        </DialogTitle>
                    </DialogHeader>

                    <div className="py-4 space-y-6">
                        <div className="p-4 bg-green-50 border border-green-100 rounded-lg text-sm text-green-800">
                            <strong>Verification Required:</strong> Please confirm that the following quality checks have been performed before releasing vehicle <strong>{selectedJobForTasks?.vehicle?.plate_number}</strong>.
                        </div>

                        <div className="space-y-4">
                            {(qualityDefinitions || []).map((def: any) => (
                                <div
                                    key={def.id}
                                    className="flex items-start gap-3 p-3 border rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                                    onClick={() => setQualityCheckAnswers(prev => ({ ...prev, [def.check_key]: !prev[def.check_key] }))}
                                >
                                    <div className={`mt-0.5 h-5 w-5 rounded border flex items-center justify-center transition-colors ${qualityCheckAnswers[def.check_key] ? 'bg-green-600 border-green-600' : 'bg-white border-slate-300'}`}>
                                        {qualityCheckAnswers[def.check_key] && <CheckCircle2 className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className="text-sm font-medium text-slate-700">{def.label}</span>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-bold text-slate-700">Additional Verification Notes (Optional)</Label>
                            <Textarea
                                placeholder="Any final remarks from the supervisor..."
                                value={releaseNotes}
                                onChange={(e) => setReleaseNotes(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsQualityCheckOpen(false)}>Back</Button>
                        <Button
                            disabled={
                                !(qualityDefinitions || []).every(def => qualityCheckAnswers[def.check_key] === true) ||
                                releaseVehicleMutation.isPending
                            }
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => {
                                releaseVehicleMutation.mutate({
                                    jobId: selectedJobForTasks.id,
                                    vehicleId: selectedJobForTasks.vehicle_id,
                                    releaseNote: releaseNotes,
                                    qualityCheck: qualityCheckAnswers
                                });
                                setIsQualityCheckOpen(false);
                            }}
                        >
                            {releaseVehicleMutation.isPending ? "Processing..." : "Verify & Release Vehicle"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};

export default GarageDashboard;
