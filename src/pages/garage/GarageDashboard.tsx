import React, { useState, useMemo, useEffect, Fragment } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Wrench, Plus, Minus, AlertTriangle, FileText, CheckCircle2, CheckCircle, Clock, Filter, Truck, Link, Trash2, Loader2, Printer, XCircle, ShoppingCart, Package, History as HistoryIcon, TrendingUp, ClipboardCheck, RefreshCw, ChevronsUpDown, Check, Edit2, Lock, LayoutGrid, List, Settings, PackagePlus, PackageCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import VehicleEquipment from "./VehicleEquipment";
import VehicleLifecycle from "./VehicleLifecycle";

const translations = {
    en: {
        garage_title: "Garage & Maintenance Command Center",
        garage_subtitle: "Real-time fleet health, active repairs, and inventory management",
        repairs: "Repairs",
        inventory: "Inventory",
        store_logs: "Store Logs",
        deleted: "Deleted",
        dashboard_overview: "Dashboard Overview",
        active_jobs: "Active Repair Jobs",
        critical_faults: "Critical Faults",
        pending_issues: "Pending Issues",
        issuance_approvals: "Issuance Approvals",
        log_new_fault: "Log New Fault",
        refresh: "Refresh Data",
        search_vehicles: "Search vehicles...",
        search_inventory: "Search inventory...",
        search_pn: "Search PN...",
        add_product: "Add Product",
        requisitions: "Requisitions",
        issued_items: "Issued Items",
        approvals: "Approvals",
        approve: "Approve",
        reject: "Reject",
        edit_qty: "Edit Qty",
        view_only: "View Only",
        available_stock: "Available Stock",
        item_usage: "Item Usage",
        mechanic: "Mechanic",
        driver: "Driver",
        vehicle: "Vehicle",
        actions: "Actions"
    },
    sw: {
        garage_title: "Kituo cha Amri ya Karakana na Matengenezo",
        garage_subtitle: "Hali ya magari, matengenezo yanayoendelea, na usimamizi wa stoo",
        repairs: "Matengenezo",
        inventory: "Stoo/Vifaa",
        store_logs: "Kumbukumbu za Stoo",
        deleted: "Vilivyofutwa",
        dashboard_overview: "Muhtasari wa Dashibodi",
        active_jobs: "Kazi za Matengenezo",
        critical_faults: "Hitilafu Muhimu",
        pending_issues: "Masuala Yanayosubiri",
        issuance_approvals: "Idhini za Kutolewa",
        log_new_fault: "Sajili Hitilafu Mpya",
        refresh: "Sasisha Data",
        search_vehicles: "Tafuta magari...",
        search_inventory: "Tafuta vifaa...",
        search_pn: "Tafuta PN...",
        add_product: "Ongeza Kifaa",
        requisitions: "Maombi ya Vifaa",
        issued_items: "Vifaa Vilivyotolewa",
        approvals: "Idhini",
        approve: "Idhinisha",
        reject: "Kataa",
        edit_qty: "Badili Idadi",
        view_only: "Angalia tu",
        available_stock: "Vifaa Vilivyopo",
        item_usage: "Matumizi ya Vifaa",
        mechanic: "Mekanika",
        driver: "Dereva",
        vehicle: "Gari",
        actions: "Vitendo"
    }
};

const errorTranslations: Record<string, string> = {
    "One or both units already have an active job card. Please finish the existing job before logging a new one.": "Moja au vitengo vyote viwili tayari vina kadi ya kazi. Tafadhali kamilisha kazi iliyopo kabla ya kusajili mpya.",
    "This vehicle already has an active job card. Please add faults to the existing job instead.": "Gari hili tayari lina kadi ya kazi. Tafadhali ongeza hitilafu kwenye kazi iliyopo badala yake.",
    "Cannot delete job card: Associated requisitions have already been approved or paid.": "Huwezi kufuta kadi ya kazi: Maombi ya vifaa yaliyohusishwa tayari yameidhinishwa au kulipwa.",
    "Cannot delete: This requisition is no longer pending and has been picked up by Procurement.": "Huwezi kufuta: Ombi hili halisubiri tena na limeshachukuliwa na Idara ya Ununuzi.",
    "Cannot edit: This requisition is no longer pending and has been picked up by Procurement.": "Huwezi kuhariri: Ombi hili halisubiri tena na limeshachukuliwa na Idara ya Ununuzi.",
    "Description is required": "Maelezo yanahitajika",
    "Vehicle not found": "Gari halijapatikana",
    "Data mismatch: One of the units not found.": "Hitilafu ya data: Kimoja cha vitengo hakijapatikana."
};

const getLocalizedError = (msg: string, lang: string) => {
    if (lang === 'sw' && msg && errorTranslations[msg]) {
        return errorTranslations[msg];
    }
    return msg || "Unknown error";
};

const GarageDashboard = () => {
    const sb = supabase as any;
    const { toast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const { userRole, user } = useAuth();
    const [searchTerm, setSearchTerm] = useState("");
    const [inventorySearch, setInventorySearch] = useState("");
    const [partNumberSearch, setPartNumberSearch] = useState("");
    const [arrivalsSearchTerm, setArrivalsSearchTerm] = useState("");
    const [reqSearchTerm, setReqSearchTerm] = useState("");
    const [usageSearchQuery, setUsageSearchQuery] = useState("");
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isLogFaultOpen, setIsLogFaultOpen] = useState(false);
    const [selectedJobForTasks, setSelectedJobForTasks] = useState<any>(null);
    const [isManageTasksOpen, setIsManageTasksOpen] = useState(false);
    const [activeStoreTab, setActiveStoreTab] = useState("requisitions");
    const [activeReqStatusTab, setActiveReqStatusTab] = useState("active");
    const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
    const [approvalNotes, setApprovalNotes] = useState("");
    const [releaseNotes, setReleaseNotes] = useState("");
    const [jobToRelease, setJobToRelease] = useState<any>(null);
    const [isAddExtraFaultOpen, setIsAddExtraFaultOpen] = useState(false);
    const [extraFaultDescription, setExtraFaultDescription] = useState("");
    const [extraFaultTargetJobId, setExtraFaultTargetJobId] = useState<string | null>(null);
    const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
    const [isQualityCheckOpen, setIsQualityCheckOpen] = useState(false);
    const [qualityCheckAnswers, setQualityCheckAnswers] = useState<Record<string, boolean>>({});
    const [isRejectionDialogOpen, setIsRejectionDialogOpen] = useState(false);
    const [rejectionNotes, setRejectionNotes] = useState("");
    const [isAdjustQtyOpen, setIsAdjustQtyOpen] = useState(false);
    const [adjustedQty, setAdjustedQty] = useState(1);
    const [selectedUsageToApprove, setSelectedUsageToApprove] = useState<any>(null);
    const [isVehiclePopoverOpen, setIsVehiclePopoverOpen] = useState(false);
    const { language, setLanguage } = useLanguage();
    const [inventoryViewMode, setInventoryViewMode] = useState<"list" | "grid">("list");
    const [jobViewTab, setJobViewTab] = useState<'active' | 'closed'>('active');


    const t = (key: keyof typeof translations.en) => translations[language][key] || key;

    // Initial state based on URL
    const [activeTab, setActiveTab] = useState<"jobs" | "inventory" | "logs" | "deleted" | "equipment" | "lifecycle">(
        location.pathname === "/garage/store" ? "inventory" :
            location.pathname === "/garage/logs" ? "logs" :
                location.pathname === "/garage/deleted" ? "deleted" :
                    location.pathname === "/garage/equipment" ? "equipment" :
                        location.pathname === "/garage/lifecycle" ? "lifecycle" :
                            (userRole === "storekeeper") ? "inventory" : "jobs"
    );

    // Sync tab with URL changes
    useEffect(() => {
        if (location.pathname === "/garage/store") {
            setActiveTab("inventory");
        } else if (location.pathname === "/garage/logs") {
            setActiveTab("logs");
        } else if (location.pathname === "/garage/deleted") {
            setActiveTab("deleted");
        } else if (location.pathname === "/garage/equipment") {
            setActiveTab("equipment");
        } else if (location.pathname === "/garage/lifecycle") {
            setActiveTab("lifecycle");
        } else if (location.pathname === "/garage") {
            setActiveTab("jobs");
        }
    }, [location.pathname]);

    const [isRequisitionDialogOpen, setIsRequisitionDialogOpen] = useState(false);
    const [isEditReqOpen, setIsEditReqOpen] = useState(false);
    const [editingReqItem, setEditingReqItem] = useState<{ id: string; item_name: string; quantity: number; vehicle_id?: string; requirement_category?: string } | null>(null);
    const [isEditVehiclePopoverOpen, setIsEditVehiclePopoverOpen] = useState(false);
    const [isAddProductDialogOpen, setIsAddProductDialogOpen] = useState(false);
    const [isEditProductDialogOpen, setIsEditProductDialogOpen] = useState(false);
    const [editProduct, setEditProduct] = useState({ id: "", item_name: "", part_number: "", category: "Parts", quantity: 0, unit_measure: "pcs", min_threshold: 5 });
    const [isUpdateQtyOpen, setIsUpdateQtyOpen] = useState(false);
    const [updateQtyDetails, setUpdateQtyDetails] = useState({ quantity: 0 });
    const [isUsageDialogOpen, setIsUsageDialogOpen] = useState(false);
    const [isSingleRestock, setIsSingleRestock] = useState(false);
    const [requisitionItems, setRequisitionItems] = useState<{ item_name: string; quantity: number; item_id?: string; category?: string }[]>(() => {
        try {
            const saved = localStorage.getItem('draftReqItems');
            return saved ? JSON.parse(saved) : [{ item_name: "", quantity: 1, category: "Uncategorized" }];
        } catch { return [{ item_name: "", quantity: 1, category: "Uncategorized" }]; }
    });
    const [reqCategories, setReqCategories] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('draftReqCategories');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [expandedReqGroups, setExpandedReqGroups] = useState<string[]>([]);
    const [usageForm, setUsageForm] = useState({
        item_id: "",
        item_name: "",
        quantity: 1,
        issued_to: "",
        vehicle_id: "",
        notes: ""
    });
    const [reqType, setReqType] = useState<"Job" | "General" | "Emergency">(() => {
        return (localStorage.getItem('draftReqType') as any) || "General";
    });
    const [reqTargetVehicleId, setReqTargetVehicleId] = useState<string | null>(() => {
        return localStorage.getItem('draftReqVehicleId') || null;
    });

    useEffect(() => { localStorage.setItem('draftReqItems', JSON.stringify(requisitionItems)); }, [requisitionItems]);
    useEffect(() => { localStorage.setItem('draftReqCategories', JSON.stringify(reqCategories)); }, [reqCategories]);
    useEffect(() => { localStorage.setItem('draftReqType', reqType); }, [reqType]);
    useEffect(() => { if (reqTargetVehicleId) localStorage.setItem('draftReqVehicleId', reqTargetVehicleId); else localStorage.removeItem('draftReqVehicleId'); }, [reqTargetVehicleId]);
    const [isReqVehiclePopoverOpen, setIsReqVehiclePopoverOpen] = useState(false);
    const [reqTargetJobId, setReqTargetJobId] = useState<string | null>(null);
    const [selectedInventoryItem, setSelectedInventoryItem] = useState<any>(null);
    const [isStockInDialogOpen, setIsStockInDialogOpen] = useState(false);
    const [stockInForm, setStockInForm] = useState({ item_id: "", item_name: "", quantity: 1, notes: "", current_qty: 0 });
    // New Product State
    const [newProduct, setNewProduct] = useState({
        item_name: "",
        part_number: "",
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
                .select("id, vehicle_no, asset_type, asset_status, odometer_reading, horse_number, trailer_number, coupling_status, make_model")
                .order("vehicle_no");
            if (error) throw error;
            return data?.map(v => ({
                ...v,
                // Universal Plate Resolution for Search & Display
                plate_number: v.vehicle_no || v.horse_number || v.trailer_number || "NO PLATE",
                model: v.make_model || v.asset_type || "Unknown",
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
                    vehicle:logistics_fleet(id, vehicle_no, horse_number, trailer_number, asset_type, make_model), 
                    fault_list:garage_job_faults(id, fault_type_id, status, mechanic_notes, mechanic_id, fault_type:garage_fault_types(fault_name, category))
                `)
                .eq("is_deleted", false)
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
            const { data, error } = await sb
                .from("garage_inventory")
                .select("*")
                .order("item_name");
            if (error) throw error;
            return data;
        },
        refetchInterval: 60000 // Optimized refresh
    });

    const filteredInventory = useMemo(() => {
        return (inventory || []).filter((item: any) => {
            const matchesNamCat = item.item_name.toLowerCase().includes(inventorySearch.toLowerCase()) ||
                item.category.toLowerCase().includes(inventorySearch.toLowerCase());
            const matchesPN = (item.part_number || "").toLowerCase().includes(partNumberSearch.toLowerCase());
            return matchesNamCat && matchesPN;
        });
    }, [inventory, inventorySearch, partNumberSearch]);

    const { data: requisitions, isLoading: isLoadingRequisitions } = useQuery({
        queryKey: ["garage-requisitions"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_requisitions")
                .select("*, vehicle:logistics_fleet(id, vehicle_no, horse_number, trailer_number, make_model, asset_type), profiles!requested_by(full_name), garage_inventory(item_name)")
                .eq("is_deleted", false)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        },
        refetchInterval: 10000 // Real-time updates for status changes
    });

    const { data: garageArrivals, isLoading: isLoadingArrivals } = useQuery({
        queryKey: ["garage-arrivals"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_requisitions")
                .select("*, vehicle:logistics_fleet(id, vehicle_no, horse_number, trailer_number, make_model, asset_type), profiles!requested_by(full_name), garage_suppliers(name), garage_inventory(item_name)")
                .eq("status", "Closed")
                .eq("store_acknowledged", false)
                .eq("is_deleted", false)
                .order("status_updated_at", { ascending: false });
            if (error) throw error;
            return data;
        },
        refetchInterval: 10000
    });

    const acknowledgeArrivalMutation = useMutation({
        mutationFn: async (arr: any) => {
            const id = typeof arr === 'string' ? arr : arr.id;
            
            // 1. Acknowledge the requisition
            const { error } = await sb.from("garage_requisitions")
                .update({ store_acknowledged: true })
                .eq("id", id);
            if (error) throw error;

            // 2. Automatically update store stock if inventory item is linked
            if (typeof arr === 'object' && arr.inventory_item_id) {
                const qtyToAdd = parseFloat(arr.quantity_approved || arr.quantity_requested || "0");
                if (qtyToAdd > 0) {
                    const { data: invData, error: invFetchErr } = await sb.from("garage_inventory")
                        .select("quantity")
                        .eq("id", arr.inventory_item_id)
                        .single();
                        
                    if (!invFetchErr && invData) {
                        const newQty = (parseFloat(invData.quantity || "0") + qtyToAdd).toString();
                        await sb.from("garage_inventory")
                            .update({ quantity: newQty })
                            .eq("id", arr.inventory_item_id);
                    }
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-arrivals"] });
            queryClient.invalidateQueries({ queryKey: ["garage-inventory"] }); // Also refresh inventory
            toast({ title: "Receipt Acknowledged", description: "Item arrival has been acknowledged and stock updated." });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message })
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
                part_number: "",
                category: "Parts",
                quantity: 0,
                unit_measure: "pcs",
                min_threshold: 5
            });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Add Failed", description: getLocalizedError(err.message, language) })
    });

    const editProductMutation = useMutation({
        mutationFn: async (product: any) => {
            const { id, ...updates } = product;
            const { error } = await sb.from("garage_inventory").update(updates).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-inventory"] });
            toast({ title: "Product Updated", description: "The item has been updated." });
            setIsEditProductDialogOpen(false);
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Update Failed", description: getLocalizedError(err.message, language) })
    });

    const deleteProductMutation = useMutation({
        mutationFn: async (id: string) => {
            // Delete associated usage logs to satisfy foreign key constraints
            await sb.from("garage_inventory_usage").delete().eq("item_id", id);
            
            // Delete associated requisitions to satisfy foreign key constraints
            await sb.from("garage_requisitions").delete().eq("item_id", id);
            
            // Finally delete the inventory item
            const { error } = await sb.from("garage_inventory").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-inventory"] });
            toast({ title: "Product Deleted", description: "The item has been removed." });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Delete Failed", description: getLocalizedError(err.message, language) })
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

    // Stock In Mutation - adds received quantity to current stock
    const stockInMutation = useMutation({
        mutationFn: async (data: { item_id: string; item_name: string; quantity: number; notes: string; current_qty: number }) => {
            const newQty = data.current_qty + data.quantity;
            const { error: updateError } = await sb.from("garage_inventory").update({
                quantity: newQty
            }).eq("id", data.item_id);
            if (updateError) throw updateError;

            // Log this stock-in as a usage record with negative quantity (stock in)
            const { data: { user } } = await supabase.auth.getUser();
            const { error: logError } = await sb.from("garage_inventory_usage").insert({
                item_id: data.item_id,
                item_name: data.item_name,
                quantity_used: -data.quantity,
                issued_to: "Stock Received",
                notes: data.notes || `Stock in: +${data.quantity} units received`,
                status: 'Approved'
            });
            if (logError) throw logError;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-inventory"] });
            queryClient.invalidateQueries({ queryKey: ["procurement-inventory"] });
            queryClient.invalidateQueries({ queryKey: ["garage-usage"] });
            setIsStockInDialogOpen(false);
            setStockInForm({ item_id: "", item_name: "", quantity: 1, notes: "", current_qty: 0 });
            toast({ title: language === 'en' ? "Stock Updated" : "Hifadhi Imesasishwa", description: language === 'en' ? "Items have been received into store." : "Vifaa vimepokelewa ghalani." });
        },
        onError: (err: any) => toast({ variant: "destructive", title: language === 'en' ? "Stock In Failed" : "Imeshindikana", description: getLocalizedError(err.message, language) })
    });

    // Record Usage Mutation
    const recordUsageMutation = useMutation({
        mutationFn: async (usageData: any) => {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await sb.from("garage_inventory_usage").insert({
                item_id: usageData.item_id,
                item_name: usageData.item_name,
                quantity_used: usageData.quantity,
                issued_to: usageData.issued_to,
                vehicle_id: usageData.vehicle_id || null,
                notes: usageData.notes,
                status: 'Pending'
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
        onError: (err: any) => toast({ variant: "destructive", title: "Usage Error", description: getLocalizedError(err.message, language) })
    });

    // Fetch Usage Logs
    const { data: usageLogs } = useQuery({
        queryKey: ["garage-usage"],
        queryFn: async () => {
            const { data, error } = await sb.from("garage_inventory_usage")
                .select("*, vehicle:logistics_fleet(vehicle_no, horse_number, trailer_number, make_model), approved_by_profile:profiles!garage_inventory_usage_approved_by_fkey(full_name), garage_inventory(item_name)")
                .eq("is_deleted", false)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        },
        refetchInterval: 10000
    });

    const approveIssuanceMutation = useMutation({
        mutationFn: async ({ id, status, notes, quantity }: { id: string, status: 'Approved' | 'Rejected', notes?: string, quantity?: number }) => {
            const { data: { user } } = await supabase.auth.getUser();
            const updates: any = {
                status,
                approved_by: user?.id,
                approved_at: new Date().toISOString()
            };
            if (notes) updates.notes = notes;
            if (quantity !== undefined) updates.quantity_used = quantity;

            const { error } = await sb.from("garage_inventory_usage")
                .update(updates)
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["garage-inventory"] });
            queryClient.invalidateQueries({ queryKey: ["garage-usage"] });
            toast({
                title: variables.status === 'Approved' ? "Issuance Approved" : "Issuance Rejected",
                description: variables.status === 'Approved' ? "Inventory has been updated." : "Request removed."
            });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Action Failed", description: getLocalizedError(err.message, language) })
    });

    const createRequisitionMutation = useMutation({
        mutationFn: async (payloads: any[]) => {
            const { data, error } = await sb.from("garage_requisitions").insert(
                payloads.map(p => ({
                    ...p,
                    target_company: 'GARAGE',
                    requested_by: user?.id
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
        onError: (err: any) => toast({ variant: "destructive", title: "Submission Error", description: getLocalizedError(err.message, language) })
    });

    const editRequisitionMutation = useMutation({
        mutationFn: async ({ id, item_name, quantity, vehicle_id, requirement_category }: { id: string, item_name: string, quantity: number, vehicle_id?: string, requirement_category?: string }) => {
            const updates: any = { 
                item_name, 
                quantity_requested: quantity, 
                vehicle_id: vehicle_id || null 
            };
            if (requirement_category) {
                updates.requirement_category = requirement_category;
            }
            const { data, error } = await sb.from("garage_requisitions")
                .update(updates)
                .eq("id", id)
                .eq("status", "Waiting Review")
                .select();
                
            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error("Cannot edit: This requisition is no longer pending and has been picked up by Procurement.");
            }
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-requisitions"] });
            toast({ title: "Requisition Updated", description: "Changes have been saved." });
            setIsEditReqOpen(false);
            setEditingReqItem(null);
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Update Error", description: getLocalizedError(err.message, language) })
    });

    const deleteRequisitionMutation = useMutation({
        mutationFn: async (id: string) => {
            const { data, error } = await sb.from("garage_requisitions")
                .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                .eq("id", id)
                .eq("status", "Waiting Review")
                .select();
                
            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error("Cannot delete: This requisition is no longer pending and has been picked up by Procurement.");
            }
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-requisitions"] });
            toast({ title: "Requisition Deleted", description: "The request has been removed." });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Delete Error", description: getLocalizedError(err.message, language) })
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

            const carryOverFaults = async (vId: string, newJobId: string) => {
                const { data: oldJob } = await sb.from("garage_job_cards")
                    .select("id")
                    .eq("vehicle_id", vId)
                    .eq("status", "Closed")
                    .eq("requires_followup", true)
                    .order("closed_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (oldJob) {
                    const { data: oldFaults } = await sb.from("garage_job_faults")
                        .select("*")
                        .eq("job_id", oldJob.id)
                        .in("status", ["Partial", "Not Repaired"]);

                    if (oldFaults && oldFaults.length > 0) {
                        const carryOverInserts = oldFaults.map((f: any) => ({
                            job_id: newJobId,
                            fault_type_id: f.fault_type_id,
                            mechanic_notes: f.mechanic_notes.includes("(Carried Over)") ? f.mechanic_notes : `${f.mechanic_notes} (Carried Over)`,
                            status: 'Pending'
                        }));
                        await sb.from("garage_job_faults").insert(carryOverInserts);
                    }
                    await sb.from("garage_job_cards").update({ requires_followup: false }).eq("id", oldJob.id);
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
                await carryOverFaults(activeCoupling.horse_id, hJob.id);

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
                await carryOverFaults(activeCoupling.trailer_id, pJob.id);

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
                await carryOverFaults(targetId, job.id);
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
        onError: (error: any) => toast({ variant: "destructive", title: "Cannot Log Fault", description: getLocalizedError(error.message, language) })
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
        setNewProduct({
            item_name: "",
            part_number: "",
            category: "Parts",
            quantity: 0,
            unit_measure: "pcs",
            min_threshold: 5
        });
    };

    const deleteJobMutation = useMutation({
        mutationFn: async ({ jobId, vehicleId }: { jobId: string, vehicleId: string }) => {
            // 0. Check for approved requisitions - cannot delete if procurement has started
            const { data: linkedReqs, error: checkError } = await sb
                .from("garage_requisitions")
                .select("status")
                .eq("job_id", jobId)
                .in("status", ["Approved", "Paid", "Purchased", "Delivered"]);

            if (checkError) throw checkError;
            if (linkedReqs && linkedReqs.length > 0) {
                throw new Error("Cannot delete job card: Associated requisitions have already been approved or paid.");
            }

            const now = new Date().toISOString();
            // 1. Soft delete the job card
            const { error: de } = await sb.from("garage_job_cards").update({
                is_deleted: true,
                deleted_at: now
            }).eq("id", jobId);
            if (de) throw de;

            // 2. Soft delete associated faults
            const { error: fe } = await sb.from("garage_job_faults").update({
                is_deleted: true,
                deleted_at: now
            }).eq("job_id", jobId);
            if (fe) console.warn("Some faults could not be soft-deleted", fe);

            // 3. Soft delete associated requisitions
            const { error: re } = await sb.from("garage_requisitions").update({
                is_deleted: true,
                deleted_at: now
            }).eq("job_id", jobId);
            if (re) console.warn("Some requisitions could not be soft-deleted", re);

            // 4. Soft delete associated inventory usage
            const { error: ue } = await sb.from("garage_inventory_usage").update({
                is_deleted: true,
                deleted_at: now
            }).eq("vehicle_id", vehicleId).gte("created_at", now.split('T')[0]); // Fallback matching if job_id missing
            if (ue) console.warn("Some inventory logs could not be soft-deleted", ue);

            // 5. Reset vehicle status to Active
            const { error: ve } = await sb.from("logistics_fleet").update({ asset_status: 'Active' }).eq("id", vehicleId);
            if (ve) throw ve;
        },
        onSuccess: () => {
            toast({ title: "Job Moved to Dustbin", description: "Maintenance record hidden and vehicle status reset." });
            queryClient.invalidateQueries({ queryKey: ["garage-job-cards"] });
            queryClient.invalidateQueries({ queryKey: ["garage-job-cards-deleted"] });
            queryClient.invalidateQueries({ queryKey: ["garage-vehicles"] });
            queryClient.invalidateQueries({ queryKey: ["garage-requisitions"] });
            queryClient.invalidateQueries({ queryKey: ["garage-usage"] });
        },
        onError: (error: any) => {
            toast({
                variant: "destructive",
                title: "Action Blocked",
                description: getLocalizedError(error.message, language) || "Failed to move job to Dustbin."
            });
        }
    });

    const restoreJobMutation = useMutation({
        mutationFn: async ({ jobId, vehicleId }: { jobId: string, vehicleId: string }) => {
            // 1. Restore the job card
            const { error: re } = await sb.from("garage_job_cards").update({
                is_deleted: false,
                deleted_at: null
            }).eq("id", jobId);
            if (re) throw re;

            // 2. Restore associated faults
            await sb.from("garage_job_faults").update({ is_deleted: false, deleted_at: null }).eq("job_id", jobId);

            // 3. Restore associated requisitions
            await sb.from("garage_requisitions").update({ is_deleted: false, deleted_at: null }).eq("job_id", jobId);

            // 4. Update vehicle status back to Maintenance
            await sb.from("logistics_fleet").update({ asset_status: 'Maintenance' }).eq("id", vehicleId);
        },
        onSuccess: () => {
            toast({ title: "Job Restored", description: "Maintenance record has been recovered." });
            queryClient.invalidateQueries({ queryKey: ["garage-job-cards"] });
            queryClient.invalidateQueries({ queryKey: ["garage-job-cards-deleted"] });
            queryClient.invalidateQueries({ queryKey: ["garage-vehicles"] });
            queryClient.invalidateQueries({ queryKey: ["garage-requisitions"] });
        }
    });

    const addExtraFaultMutation = useMutation({
        mutationFn: async () => {
            if (!extraFaultTargetJobId || !extraFaultDescription.trim()) throw new Error("Description is required");
            
            const cat = "General";
            const name = extraFaultDescription.trim();
            let faultTypeId;
            
            const existing = (faultTypes || []).find((f: any) =>
                (f.category || "").toLowerCase() === cat.toLowerCase() &&
                (f.fault_name || "").toLowerCase() === name.toLowerCase()
            );
            
            if (existing) {
                faultTypeId = existing.id;
            } else {
                const { data: b, error: e } = await sb.from("garage_fault_types").insert([{ category: cat, fault_name: name }]).select().single();
                if (e) throw e;
                faultTypeId = b.id;
            }

            const { error: fe } = await sb.from("garage_job_faults").insert([{
                job_id: extraFaultTargetJobId,
                fault_type_id: faultTypeId,
                mechanic_notes: name,
                status: 'Pending'
            }]);
            
            if (fe) throw fe;
        },
        onSuccess: () => {
            toast({ title: "Task Added", description: "The new fault has been added to the job card." });
            setIsAddExtraFaultOpen(false);
            setExtraFaultDescription("");
            setExtraFaultTargetJobId(null);
            queryClient.invalidateQueries({ queryKey: ["garage-job-cards"] });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Add Failed", description: getLocalizedError(err.message, language) })
    });

    const { data: deletedJobCards, isLoading: isLoadingDeletedJobs } = useQuery({
        queryKey: ["garage-job-cards-deleted"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_job_cards")
                .select(`
                    *, 
                    vehicle:logistics_fleet(id, vehicle_no, horse_number, trailer_number, asset_type, make_model), 
                    fault_list:garage_job_faults(id, fault_type_id, status, mechanic_notes, mechanic_id, fault_type:garage_fault_types(fault_name, category))
                `)
                .eq("is_deleted", true)
                .order("deleted_at", { ascending: false });
            if (error) throw error;
            return data;
        },
        enabled: activeTab === 'deleted'
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
            if (mechanicId) updates.mechanic_id = mechanicId === "unassigned" ? null : mechanicId;

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
            toast({ variant: "destructive", title: "Error", description: getLocalizedError(errorMsg, language) });
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
            toast({ variant: "destructive", title: "Release Failed", description: getLocalizedError(error.message, language) });
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
                            <h1 style="margin:0; font-size: 22px; color: #dc2626; font-weight: 800;">SUDENERGY <span style="color: #1e3a8a;">LOGISTICS</span></h1>
                            <div style="font-size: 11px; color: #64748b; font-weight: 600; margin-top: 2px;">Garage & Maintenance Division</div>
                            <div class="plate" style="margin-top: 8px;">${job.vehicle?.plate_number}</div>
                        </div>
                        <div style="text-align: right">
                            <div style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600;">Job Card</div>
                            <div style="font-weight: bold; font-size: 18px; color: #1e293b;">#${job.job_number}</div>
                            <div style="font-size: 11px; color: #666; margin-top: 4px;">Opened: ${new Date(job.opened_at).toLocaleString()}</div>
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
                    <div style="margin-top: 50px; border-top: 1px dashed #ccc; padding-top: 20px; font-size: 11px; color: #94a3b8; text-align: center;">
                        Generated by SudEnergy Logistics Platform - Garage & Maintenance Division
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
                    job:garage_job_cards!inner(id, opened_at, vehicle_id, vehicle:logistics_fleet(vehicle_no, horse_number, trailer_number, make_model))
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
        <div className="space-y-6 p-6 animate-fade-in text-slate-900 font-dashboard">
            {/* Conditional Header: Only show for Repairs tab */}
            {activeTab === 'jobs' && (
                <div className="flex items-center justify-between border-b pb-6 border-slate-100">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                            <Wrench className="w-8 h-8 text-indigo-600" />
                            <div className="flex flex-col">
                                <span className="text-slate-700 leading-tight">{t('garage_title')}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mt-0.5">{t('garage_subtitle')}</span>
                            </div>
                        </h1>


                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-full border border-slate-100 shadow-sm">
                            <Label htmlFor="language-toggle" className="text-[10px] font-semibold uppercase tracking-tighter text-slate-500">English</Label>
                            <Switch
                                id="language-toggle"
                                checked={language === 'sw'}
                                onCheckedChange={(checked) => setLanguage(checked ? 'sw' : 'en')}
                                className="data-[state=checked]:bg-indigo-600"
                            />
                            <Label htmlFor="language-toggle" className="text-[10px] font-semibold uppercase tracking-tighter text-slate-500">Swahili</Label>
                        </div>
                        <Button onClick={() => setIsLogFaultOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 font-semibold uppercase tracking-wider text-xs h-11 px-6">
                            <Plus className="w-4 h-4 mr-2" />
                            {t('log_new_fault')}
                        </Button>

                    </div>
                </div>
            )}

            {/* Language toggle for storekeeper-accessible tabs: Equipment, Lifecycle, Inventory */}
            {(activeTab === 'equipment' || activeTab === 'lifecycle' || activeTab === 'inventory') && (
                <div className="flex items-center justify-end pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-full border border-slate-100 shadow-sm">
                        <Label htmlFor="language-toggle-alt" className="text-[10px] font-semibold uppercase tracking-tighter text-slate-500">English</Label>
                        <Switch
                            id="language-toggle-alt"
                            checked={language === 'sw'}
                            onCheckedChange={(checked) => setLanguage(checked ? 'sw' : 'en')}
                            className="data-[state=checked]:bg-indigo-600"
                        />
                        <Label htmlFor="language-toggle-alt" className="text-[10px] font-semibold uppercase tracking-tighter text-slate-500">Swahili</Label>
                    </div>
                </div>
            )}

            {/* Dashboard Stats */}
            {activeTab === 'jobs' ? (
                <>
                    {/* TOP ROW: Metrics */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                        {/* 1. Active Jobs */}
                        <Card className="border border-slate-100 shadow-sm bg-white hover:shadow-md transition-all">
                            <CardContent className="p-4 flex flex-col justify-between h-full">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase">{t('active_jobs')}</span>
                                    <div className="h-6 w-6 rounded-full bg-indigo-50 flex items-center justify-center">
                                        <Truck className="h-3.5 w-3.5 text-indigo-500" />
                                    </div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-slate-800 leading-none">
                                        {(() => {
                                            const activeJobs = jobCards?.filter(j => j.status !== 'Closed') || [];
                                            const uniqueVehicles = new Set(activeJobs.map(j => j.vehicle_id));
                                            return uniqueVehicles.size;
                                        })()}
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1 font-medium">{language === 'en' ? 'Live on the floor' : 'Gerezani sasa'}</p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 2. Critical Faults */}
                        <Card className="border border-red-100 shadow-sm bg-white hover:shadow-md transition-all border-l-4 border-l-red-500">
                            <CardContent className="p-4 flex flex-col justify-between h-full">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] font-bold text-red-500 uppercase">{t('critical_faults')}</span>
                                    <div className="h-6 w-6 rounded-full bg-red-50 flex items-center justify-center">
                                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                                    </div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-red-600 leading-none">
                                        {(() => {
                                            const criticalJobs = jobCards?.filter(j => j.priority === 'Critical' && j.status !== 'Closed') || [];
                                            const uniqueVehicles = new Set(criticalJobs.map(j => j.vehicle_id));
                                            return uniqueVehicles.size;
                                        })()}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 3. Pending Issues */}
                        <Card className="border border-slate-100 shadow-sm bg-white hover:shadow-md transition-all">
                            <CardContent className="p-4 flex flex-col justify-between h-full">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase">{t('pending_issues')}</span>
                                    <div className="h-6 w-6 rounded-full bg-amber-50 flex items-center justify-center">
                                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                                    </div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-slate-800 leading-none">
                                        {(() => {
                                            const pendingJobs = jobCards?.filter(j =>
                                                j.status === 'Closed' &&
                                                (j.requires_followup || j.fault_list?.some((f: any) => ['Partial', 'Not Repaired'].includes(f.status)))
                                            ) || [];
                                            const uniqueVehicles = new Set(pendingJobs.map(j => j.vehicle_id));
                                            return uniqueVehicles.size;
                                        })()}
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1 font-medium">{language === 'en' ? 'Needs follow-up' : 'Yanahitaji ufuatiliaji'}</p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 4. Manager Issuance Approvals */}
                        {(['admin', 'super_admin', 'garage_manager'].includes(userRole)) ? (
                            <Card
                                className={`border shadow-sm transition-all cursor-pointer hover:shadow-md ${((usageLogs || []).filter((l: any) => l.status === 'Pending').length > 0)
                                    ? "bg-indigo-600 text-white border-indigo-600"
                                    : "bg-white text-slate-900 border-slate-100"
                                    }`}
                                onClick={() => {
                                    setActiveTab('logs');
                                    setActiveStoreTab('approvals');
                                }}
                            >
                                <CardContent className="p-4 flex flex-col justify-between h-full">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className={`text-[11px] font-bold uppercase ${((usageLogs || []).filter((l: any) => l.status === 'Pending').length > 0) ? "text-indigo-100" : "text-slate-500"}`}>
                                            {language === 'en' ? 'Issuance Approvals' : 'Idhini za Matoleo'}
                                        </span>
                                        <div className={`h-6 w-6 rounded-full flex items-center justify-center ${((usageLogs || []).filter((l: any) => l.status === 'Pending').length > 0) ? "bg-indigo-500/50" : "bg-slate-50"}`}>
                                            <ClipboardCheck className={`h-3.5 w-3.5 ${((usageLogs || []).filter((l: any) => l.status === 'Pending').length > 0) ? "text-white" : "text-slate-400"}`} />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-2xl font-bold leading-none">
                                            {(usageLogs || []).filter((l: any) => l.status === 'Pending').length}
                                        </div>
                                        <p className={`text-[10px] mt-1 font-medium ${((usageLogs || []).filter((l: any) => l.status === 'Pending').length > 0) ? "text-indigo-100/80" : "text-slate-400"}`}>
                                            {language === 'en' ? 'Requires manager review' : 'Inahitaji uhakiki wa meneja'}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="hidden lg:block"></div>
                        )}
                    </div>

                    {/* BOTTOM ROW: Feeds & Alerts */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
                        {/* Accountability Feed */}
                        <Card className="border border-slate-100 shadow-sm bg-white lg:col-span-1 h-full">
                            <CardHeader className="py-2.5 px-4 flex flex-row items-center justify-between border-b border-slate-50">
                                <CardTitle className="text-[11px] font-bold text-slate-600 uppercase flex items-center gap-2">
                                    <HistoryIcon className="h-3.5 w-3.5 text-indigo-500" />
                                    {language === 'en' ? 'Accountability Feed' : 'Mlisho wa Uwajibikaji'}
                                </CardTitle>
                                <Badge variant="outline" className="text-[9px] font-semibold text-indigo-600 border-indigo-200 bg-indigo-50 px-1.5 py-0">Live</Badge>
                            </CardHeader>
                            <CardContent className="p-0">
                                <ScrollArea className="h-[140px] px-4 py-2">
                                    <div className="space-y-2.5">
                                        {(usageLogs || []).slice(0, 10).map((log: any) => (
                                            <div key={log.id} className="flex gap-2 items-start border-l-2 border-indigo-100 pl-2 py-0.5">
                                                <div className="flex flex-col flex-1">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] font-bold text-slate-700">{log.issued_to || (language === 'en' ? "Staff" : "Mfanyakazi")}</span>
                                                        <span className="text-[9px] text-slate-400 font-medium">
                                                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                                                        Took <span className="text-indigo-600 font-semibold">{log.quantity_used} {log.garage_inventory?.item_name || log.item_name}</span> for <span className="text-slate-700 font-bold">{log.vehicle?.vehicle_no || log.vehicle?.horse_number || "General"}</span>
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                        {(!usageLogs || usageLogs.length === 0) && (
                                            <p className="text-[10px] text-slate-400 italic text-center py-4">No recent activity</p>
                                        )}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>

                        {/* Status Recovery Card */}
                        {(() => {
                            const stuckVehicles = (vehicles || []).filter(v =>
                                v.status === 'Maintenance' &&
                                !(jobCards || []).some(j => j.vehicle_id === v.id && j.status !== 'Closed')
                            );
                            if (stuckVehicles.length === 0) return null;
                            return (
                                <Card className="border border-amber-200 shadow-sm bg-amber-50/50 lg:col-span-2 h-full">
                                    <CardHeader className="py-2.5 px-4 flex flex-row items-center justify-between border-b border-amber-100/50">
                                        <CardTitle className="text-[11px] font-bold text-amber-700 uppercase flex items-center gap-2">
                                            <AlertTriangle className="h-3.5 w-3.5" /> {language === 'en' ? 'Status Recovery Needed' : 'Urejeshaji wa Hali Unahitajika'}
                                        </CardTitle>
                                    </CardHeader>

                                    <CardContent className="p-3">
                                        <ScrollArea className="h-[128px]">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pr-3">
                                                {stuckVehicles.map(v => (
                                                    <div key={v.id} className="flex items-center justify-between p-2 bg-white border border-amber-100 rounded-md shadow-sm">
                                                        <div className="flex flex-col">
                                                            <span className="text-[11px] font-bold text-slate-800">{v.plate_number}</span>
                                                            <span className="text-[9px] text-slate-500 font-medium">Stuck without active job</span>
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-6 px-2 text-[9px] font-semibold border-amber-200 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                                                            onClick={() => forceReleaseMutation.mutate(v.id)}
                                                            disabled={forceReleaseMutation.isPending}
                                                        >
                                                            {forceReleaseMutation.isPending ? "Fixing..." : "Unlock"}
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    </CardContent>
                                </Card>
                            );
                        })()}
                    </div>

                    <Card className="border-none shadow-lg bg-white">
                        <CardHeader>
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <CardTitle className="text-sm font-bold text-slate-700 uppercase tracking-[0.15em] flex items-center gap-2">{language === 'en' ? 'Job Cards' : 'Kadi za Kazi'}</CardTitle>

                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <div className="flex bg-slate-100 p-1 rounded-md">
                                        <button
                                            onClick={() => setJobViewTab('active')}
                                            className={`px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded transition-all ${jobViewTab === 'active' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            {language === 'en' ? 'Active Jobs' : 'Kazi Amilifu'}
                                        </button>
                                        <button
                                            onClick={() => setJobViewTab('closed')}
                                            className={`px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded transition-all ${jobViewTab === 'closed' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            {language === 'en' ? 'Closed History' : 'Historia Zilizofungwa'}
                                        </button>
                                    </div>

                                    <div className="flex w-full max-w-sm items-center">
                                        <Input
                                            placeholder={language === 'en' ? "Search jobs..." : "Tafuta kazi..."}
                                            className="h-9 w-[150px] lg:w-[250px]"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/50">
                                        <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Job No' : 'Namba ya Kazi'}</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{t('vehicle')}</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Primary Issue' : 'Tatizo Kuu'}</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Task Progress' : 'Maendeleo ya Kazi'}</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Priority' : 'Kipaumbele'}</TableHead>
                                        <TableHead className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.15em]">Status</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Open Date' : 'Tarehe iliyofunguliwa'}</TableHead>
                                        <TableHead className="text-right text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{t('actions')}</TableHead>
                                    </TableRow>

                                </TableHeader>

                                <TableBody>
                                    {jobCards && jobCards.length > 0 ? (
                                        (() => {
                                            const processedIds = new Set();
                                            const rows = [];

                                            const filteredJobs = (jobCards || []).filter((j: any) => {
                                                const pair = (couplings || []).find((c: any) => c.horse_id === j.vehicle_id || c.trailer_id === j.vehicle_id);
                                                let partner = null;
                                                if (pair) {
                                                    const pId = pair.horse_id === j.vehicle_id ? pair.trailer_id : pair.horse_id;
                                                    partner = jobCards?.find((p: any) => p.vehicle_id === pId && p.id !== j.id);
                                                }
                                                const isActive = j.status !== 'Closed' || (partner && partner.status !== 'Closed');
                                                
                                                if (jobViewTab === 'active' && !isActive) return false;
                                                if (jobViewTab === 'closed' && isActive) return false;

                                                return String(j.job_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                                                    (j.vehicle?.plate_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                                                    (j.fault_list || []).some((f: any) => (f.mechanic_notes || "").toLowerCase().includes(searchTerm.toLowerCase()));
                                            });

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

                                            let currentMonth = "";
                                            return rows.flatMap((job: any) => {
                                                const elements = [];
                                                const jobMonth = new Date(job.opened_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                                                const isNewMonth = jobViewTab === 'closed' && jobMonth !== currentMonth;
                                                
                                                if (isNewMonth) {
                                                    currentMonth = jobMonth;
                                                    elements.push(
                                                        <TableRow key={`month-${jobMonth}`} className="bg-indigo-50/50 hover:bg-indigo-50/50 border-y border-indigo-100">
                                                            <TableCell colSpan={8} className="py-3 text-xs font-bold text-indigo-800 uppercase tracking-widest pl-4">
                                                                {jobMonth}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                }

                                                elements.push(
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
                                                                            <span className="text-indigo-600 ml-1 font-medium">+{job._displayFaults.length - 1} {language === 'en' ? 'more' : 'zaidi'}</span>
                                                                        )}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                <span className="text-[11px] text-slate-400 italic">{language === 'en' ? 'No tasks logged' : 'Hakuna kazi zilizoandikwa'}</span>
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
                                                        <Badge variant="outline" className={job._displayPriority === 'Critical' ? 'bg-red-50 text-red-600 border-red-200' : job._displayPriority === 'Urgent' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-blue-50 text-blue-600 border-blue-200'}>
                                                            {language === 'en' ? job._displayPriority : (job._displayPriority === 'Critical' ? 'Hatari' : job._displayPriority === 'Urgent' ? 'Haraka' : 'Kawaida')}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge className={job._displayStatus === 'Open' ? 'bg-slate-100 text-slate-600' : job._displayStatus === 'In Progress' ? 'bg-indigo-100 text-indigo-600' : 'bg-green-100 text-green-600'}>
                                                            {language === 'en' ? job._displayStatus : (job._displayStatus === 'Open' ? 'Wazi' : job._displayStatus === 'In Progress' ? 'Inaendelea' : 'Imefungwa')}
                                                        </Badge>
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
                                                                title={language === 'en' ? "Manage Tasks" : "Simamia Kazi"}
                                                            >
                                                                <FileText className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-8 w-8 p-0 text-slate-600 hover:text-indigo-600"
                                                                onClick={() => handlePrintJob(job)}
                                                                title={language === 'en' ? "Print Job Card" : "Chapisha Kadi"}
                                                            >
                                                                <Printer className="h-4 w-4" />
                                                            </Button>
                                                            {(userRole === 'admin' || userRole === 'garage_manager' || userRole === 'super_admin') && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                                                    onClick={() => {
                                                                        if (window.confirm(language === 'en' ? `Are you sure you want to move Job ${job.job_number} to the Dustbin? This will reset the vehicle status to Active.` : `Una uhakika unataka kuhamishia Kazi ${job.job_number} kwenye Pipa? Hii itarudisha hali ya gari kuwa Inafanya kazi.`)) {
                                                                            deleteJobMutation.mutate({ jobId: job.id, vehicleId: job.vehicle_id });
                                                                        }
                                                                    }}
                                                                    title={language === 'en' ? "Move to Dustbin" : "Hamisha kwenye Pipa"}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                                );
                                                return elements;
                                            });
                                        })()
                                    ) : (
                                        <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">{language === 'en' ? "No job cards found." : "Hakuna kadi za kazi zilizopatikana."}</TableCell></TableRow>
                                    )}

                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </>
            ) : activeTab === 'inventory' ? (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                                <Package className="w-6 h-6 text-indigo-500" />
                                {t('inventory')}
                            </h1>


                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
                                <Button
                                    variant={inventoryViewMode === 'grid' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    className={`h-8 w-8 p-0 ${inventoryViewMode === 'grid' ? 'bg-white shadow-sm' : ''} transition-all`}
                                    onClick={() => setInventoryViewMode('grid')}
                                    title="Grid View"
                                >
                                    <LayoutGrid className="h-4 w-4 text-slate-600" />
                                </Button>
                                <Button
                                    variant={inventoryViewMode === 'list' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    className={`h-8 w-8 p-0 ${inventoryViewMode === 'list' ? 'bg-white shadow-sm' : ''} transition-all`}
                                    onClick={() => setInventoryViewMode('list')}
                                    title="List View"
                                >
                                    <List className="h-4 w-4 text-slate-600" />
                                </Button>
                            </div>

                            <Button
                                className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 font-bold uppercase tracking-wider text-xs h-11 px-6"
                                onClick={() => setIsAddProductDialogOpen(true)}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                {t('add_product')}
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder={t('search_inventory')}
                                value={inventorySearch}
                                onChange={(e) => setInventorySearch(e.target.value)}
                                className="pl-10 h-11 bg-white border-slate-200 shadow-sm focus:border-indigo-400 transition-all rounded-xl text-sm"
                            />
                        </div>
                        <div className="relative">
                            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder={t('search_pn')}
                                value={partNumberSearch}
                                onChange={(e) => setPartNumberSearch(e.target.value)}
                                className="pl-10 h-11 bg-white border-slate-200 shadow-sm focus:border-indigo-400 transition-all rounded-xl font-mono text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 hover:shadow-md transition-shadow">
                            <div className="p-2 bg-indigo-50 rounded-lg flex-shrink-0">
                                <Package className="h-4 w-4 text-indigo-600" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] leading-none">{language === 'en' ? 'Catalog Items' : 'Orodha ya Vifaa'}</p>
                                <p className="text-2xl font-bold text-slate-900 mt-0.5">{inventory?.length || 0}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 bg-white rounded-xl border border-red-100 shadow-sm px-4 py-3 hover:shadow-md transition-shadow">
                            <div className="p-2 bg-red-50 rounded-lg flex-shrink-0">
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-red-500 uppercase tracking-[0.15em] leading-none">{language === 'en' ? 'Low Stock Alerts' : 'Tahadhari'}</p>
                                <p className="text-2xl font-bold text-red-600 mt-0.5">{(inventory || []).filter((i: any) => (i.quantity || 0) <= (i.min_threshold || 0)).length}</p>
                            </div>
                        </div>
                    </div>

                    {inventoryViewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredInventory.map((item: any) => {
                                const isLow = (item.quantity || 0) <= (item.min_threshold || 0);
                                return (
                                    <div key={item.id} className={`p-5 rounded-xl bg-white shadow-sm border transition-all ${isLow ? 'border-red-200 bg-red-50/10' : 'border-slate-100 hover:border-indigo-100'} flex flex-col justify-between h-[210px]`}>
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-1">
                                                <h4 className="font-bold text-slate-900 text-lg leading-tight tracking-tight">{item.item_name}</h4>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">{item.category}</span>
                                                    {item.part_number && (
                                                        <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">PN: {item.part_number}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <Badge className={`px-2.5 py-1 text-xs font-bold ${isLow ? 'bg-red-500 animate-pulse' : 'bg-green-600'}`}>
                                                {item.quantity} {item.unit_measure}
                                            </Badge>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 mt-4">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-xs font-bold border-amber-200 text-amber-600 hover:bg-amber-50 rounded-lg group"
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
                                                <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                                                {language === 'en' ? 'Issue' : 'Toa'}
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="col-span-2 h-8 text-[11px] font-semibold border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 rounded-lg"
                                                onClick={() => {
                                                    setSelectedInventoryItem(item);
                                                    setUpdateQtyDetails({ quantity: item.quantity || 0 });
                                                    setIsUpdateQtyOpen(true);
                                                }}
                                            >
                                                {language === 'en' ? 'Update Physical count' : 'Sasisha idadi halisi'}
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-xs font-bold border-emerald-200 text-emerald-600 hover:bg-emerald-50 rounded-lg group"
                                                onClick={() => {
                                                    setStockInForm({
                                                        item_id: item.id,
                                                        item_name: item.item_name,
                                                        quantity: 1,
                                                        notes: "",
                                                        current_qty: item.quantity || 0
                                                    });
                                                    setIsStockInDialogOpen(true);
                                                }}
                                            >
                                                <PackagePlus className="w-3.5 h-3.5 mr-1.5" />
                                                {language === 'en' ? 'Stock In' : 'Pokea'}
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-xs font-bold border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-lg group"
                                                onClick={() => {
                                                    setReqType("General");
                                                    setReqTargetVehicleId(null);
                                                    setReqTargetJobId(null);
                                                    setIsSingleRestock(true);
                                                    setRequisitionItems([{ item_name: item.item_name, quantity: 5, item_id: item.id }]);
                                                    setIsRequisitionDialogOpen(true);
                                                }}
                                            >
                                                <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                                                {language === 'en' ? 'Restock' : 'Agiza'}
                                            </Button>



                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-[11px] font-semibold border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 rounded-lg"
                                                onClick={() => {
                                                    setEditProduct(item);
                                                    setIsEditProductDialogOpen(true);
                                                }}
                                            >
                                                <Settings className="w-3.5 h-3.5 mr-1.5" />
                                                {language === 'en' ? 'Edit' : 'Hariri'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-[11px] font-semibold border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-lg"
                                                onClick={() => {
                                                    if (window.confirm(language === 'en' ? "Are you sure you want to delete this product?" : "Una uhakika unataka kufuta kipuri hiki?")) {
                                                        deleteProductMutation.mutate(item.id);
                                                    }
                                                }}
                                            >
                                                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                                {language === 'en' ? 'Delete' : 'Futa'}
                                            </Button>

                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <Card className="border shadow-sm bg-white overflow-hidden rounded-xl">
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50/50">
                                            <TableHead className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-tight">{language === 'en' ? 'Item Name' : 'Jina la Kifaa'}</TableHead>
                                            <TableHead className="py-4 text-xs font-semibold text-slate-500 uppercase tracking-tight">{language === 'en' ? 'Category' : 'Kundi'}</TableHead>
                                            <TableHead className="py-4 text-xs font-semibold text-slate-500 uppercase tracking-tight">{language === 'en' ? 'Part Number' : 'Namba ya Kipuri'}</TableHead>
                                            <TableHead className="py-4 text-xs font-semibold text-slate-500 uppercase tracking-tight text-center">{language === 'en' ? 'Stock Level' : 'Kiwango cha Akiba'}</TableHead>
                                            <TableHead className="py-4 px-6 text-right text-xs font-semibold text-slate-500 uppercase tracking-tight">{language === 'en' ? 'Actions' : 'Vitendo'}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredInventory.map((item: any) => {
                                            const isLow = (item.quantity || 0) <= (item.min_threshold || 0);
                                            return (
                                                <TableRow key={item.id} className="group hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                                                    <TableCell className="py-4 px-6">
                                                        <span className="font-bold text-slate-900 text-sm tracking-tight">{item.item_name}</span>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{item.category}</span>
                                                    </TableCell>
                                                    <TableCell className="py-4">
                                                        <span className="font-mono text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-semibold italic">
                                                            {item.part_number || '-'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="py-4 text-center">
                                                        <Badge className={`px-2.5 py-0.5 text-xs font-bold ${isLow ? 'bg-red-500' : 'bg-green-600'}`}>
                                                            {item.quantity} {item.unit_measure}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-4 px-6 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50 rounded-lg group"
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
                                                                title={language === 'en' ? 'Issue' : 'Toa'}
                                                            >
                                                                <ShoppingCart className="h-4 w-4" />
                                                            </Button>

                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-8 w-8 p-0 text-indigo-600 hover:bg-indigo-50 rounded-lg group"
                                                                onClick={() => {
                                                                    setReqType("General");
                                                                    setReqTargetVehicleId(null);
                                                                    setReqTargetJobId(null);
                                                                    setIsSingleRestock(true);
                                                                    setRequisitionItems([{ item_name: item.item_name, quantity: 5, item_id: item.id }]);
                                                                    setIsRequisitionDialogOpen(true);
                                                                }}
                                                                title={language === 'en' ? 'Restock' : 'Agiza'}
                                                            >
                                                                <TrendingUp className="h-4 w-4" />
                                                            </Button>



                                                            {/* Update Physical count hidden as per user request to automate via payment portal
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50 rounded-lg group"
                                                                onClick={() => {
                                                                    setSelectedInventoryItem(item);
                                                                    setUpdateQtyDetails({ quantity: item.quantity || 0 });
                                                                    setIsUpdateQtyOpen(true);
                                                                }}
                                                                title={language === 'en' ? 'Update Physical count' : 'Sasisha idadi halisi'}
                                                            >
                                                                <ClipboardCheck className="h-4 w-4" />
                                                            </Button>
                                                            */}

                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100 rounded-lg group"
                                                                onClick={() => {
                                                                    setEditProduct(item);
                                                                    setIsEditProductDialogOpen(true);
                                                                }}
                                                                title={language === 'en' ? 'Edit Product' : 'Hariri Kipuri'}
                                                            >
                                                                <Settings className="h-4 w-4" />
                                                            </Button>

                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-8 w-8 p-0 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-lg group"
                                                                onClick={() => {
                                                                    if (window.confirm(language === 'en' ? "Are you sure you want to delete this product?" : "Una uhakika unataka kufuta kipuri hiki?")) {
                                                                        deleteProductMutation.mutate(item.id);
                                                                    }
                                                                }}
                                                                title={language === 'en' ? 'Delete Product' : 'Futa Kipuri'}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        {filteredInventory.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-32 text-center text-sm text-slate-400 italic">
                                                    {language === 'en' ? 'No items found matching your search.' : 'Hakuna vifaa vilivyopatikana vinavyolingana na utafutaji wako.'}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}
                </div>
            ) : activeTab === 'logs' ? (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                                <HistoryIcon className="w-6 h-6 text-indigo-500" />
                                Store Hub Activity
                            </h1>
                            <p className="text-sm text-slate-500 font-medium tracking-tight">Accountability & Stock Consumption Monitoring</p>
                        </div>


                        <div className="flex items-center gap-3">
                            <Select value={selectedMonth.toString()} onValueChange={(val) => setSelectedMonth(parseInt(val))}>
                                <SelectTrigger className="w-[140px] h-10 bg-white border-slate-200">
                                    <SelectValue placeholder={language === 'en' ? "Month" : "Mwezi"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {(language === 'en' ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] : ["Januari", "Februari", "Machi", "Aprili", "Mei", "Juni", "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba"]).map((m, i) => (
                                        <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
                                <SelectTrigger className="w-[100px] h-10 bg-white border-slate-200">
                                    <SelectValue placeholder={language === 'en' ? "Year" : "Mwaka"} />
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
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-2">
                        <Card className="border-none shadow-sm bg-indigo-600 text-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                                <CardTitle className="text-[9px] font-bold uppercase tracking-[0.15em] opacity-80">{language === 'en' ? 'Monthly Items Issued' : 'Matokeo ya Vifaa kwa Mwezi'}</CardTitle>
                                <ShoppingCart className="h-3.5 w-3.5 opacity-80" />
                            </CardHeader>
                            <CardContent className="p-3 pt-0">
                                <div className="text-xl font-bold">
                                    {(usageLogs || []).filter((l: any) => {
                                        const d = new Date(l.created_at);
                                        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
                                    }).reduce((sum: number, l: any) => sum + (l.quantity_used || 0), 0)}
                                </div>
                                <p className="text-[10px] opacity-70 mt-0.5">{language === 'en' ? 'Total physical units moved this month' : 'Jumla ya vifaa vilivyotolewa mwezi huu'}</p>

                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-sm bg-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                                <CardTitle className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em]">{language === 'en' ? 'Active Requests' : 'Maombi Amilifu'}</CardTitle>
                                <ClipboardCheck className="h-3.5 w-3.5 text-indigo-400" />
                            </CardHeader>
                            <CardContent className="p-3 pt-0">
                                <div className="text-xl font-bold text-slate-900">
                                    {(requisitions || []).filter((r: any) => r.status === 'Pending').length}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-0.5 italic">{language === 'en' ? 'Pending Store Room restocks' : 'Maombi ya vifaa yanayosubiri'}</p>

                            </CardContent>
                        </Card>
                    </div>

                    <Tabs value={activeStoreTab} onValueChange={setActiveStoreTab} className="w-full">
                        <TabsList className="bg-slate-100/50 p-1 mb-6">
                            <TabsTrigger value="requisitions" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-6 py-2 text-[10px] font-bold uppercase tracking-[0.15em]">
                                <HistoryIcon className="w-4 h-4 mr-2" /> {t('requisitions')}
                            </TabsTrigger>
                            <TabsTrigger value="issued" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-6 py-2 text-[10px] font-bold uppercase tracking-[0.15em]">
                                <ShoppingCart className="w-4 h-4 mr-2" /> {t('issued_items')}
                            </TabsTrigger>
                            {(['admin', 'super_admin', 'garage_manager'].includes(userRole)) && (
                                <TabsTrigger value="approvals" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-6 py-2 text-[10px] font-bold uppercase tracking-[0.15em] relative">
                                    <ClipboardCheck className="w-4 h-4 mr-2" /> {t('approvals')}
                                    {(usageLogs || []).filter((l: any) => l.status === 'Pending').length > 0 && (
                                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                                            {(usageLogs || []).filter((l: any) => l.status === 'Pending').length}
                                        </span>
                                    )}
                                </TabsTrigger>
                            )}
                            <TabsTrigger value="arrivals" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-6 py-2 text-[10px] font-bold uppercase tracking-[0.15em] relative border border-slate-200">
                                <PackageCheck className="w-4 h-4 mr-2 text-indigo-500" /> ARRIVALS
                                {(garageArrivals || []).length > 0 && (
                                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white shadow">
                                        {(garageArrivals || []).length}
                                    </span>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="arrivals" className="space-y-6">
                            <Card className="border-none shadow-lg bg-white overflow-hidden">
                                <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between">
                                    <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] flex items-center gap-2">
                                        <PackageCheck className="w-4 h-4 text-indigo-500" />
                                        Pending Arrivals to Acknowledge
                                    </CardTitle>
                                    <div className="relative w-full max-w-xs">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <Input
                                            placeholder="Search by model or plate no..."
                                            value={arrivalsSearchTerm}
                                            onChange={(e) => setArrivalsSearchTerm(e.target.value)}
                                            className="pl-9 h-8 text-xs bg-white border-slate-200"
                                        />
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader className="bg-slate-50">
                                            <TableRow>
                                                <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Status/Condition</TableHead>
                                                <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Item</TableHead>
                                                <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Quantity</TableHead>
                                                <TableHead className="text-[10px] font-bold text-slate-500 uppercase hidden md:table-cell">Vehicle</TableHead>
                                                <TableHead className="text-[10px] font-bold text-slate-500 uppercase hidden md:table-cell">Supplier</TableHead>
                                                <TableHead className="text-[10px] font-bold text-slate-500 uppercase text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoadingArrivals ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-32 text-center">
                                                        <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
                                                    </TableCell>
                                                </TableRow>
                                            ) : (garageArrivals || []).filter((arr: any) => {
                                                if (!arrivalsSearchTerm) return true;
                                                const searchStr = arrivalsSearchTerm.toLowerCase();
                                                const model = arr.vehicle?.make_model?.toLowerCase() || '';
                                                const plate = arr.vehicle?.vehicle_no?.toLowerCase() || '';
                                                return model.includes(searchStr) || plate.includes(searchStr);
                                            }).length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-32 text-center text-slate-500 text-sm">
                                                        No pending arrivals match your search.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                (garageArrivals || []).filter((arr: any) => {
                                                    if (!arrivalsSearchTerm) return true;
                                                    const searchStr = arrivalsSearchTerm.toLowerCase();
                                                    const model = arr.vehicle?.make_model?.toLowerCase() || '';
                                                    const plate = arr.vehicle?.vehicle_no?.toLowerCase() || '';
                                                    return model.includes(searchStr) || plate.includes(searchStr);
                                                }).map((arr: any) => (
                                                    <TableRow key={arr.id} className="hover:bg-slate-50/50">
                                                        <TableCell>
                                                            {arr.physically_unseen ? (
                                                                <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[9px] uppercase font-bold px-2 py-0.5">
                                                                    Direct to Vehicle - Unseen
                                                                </Badge>
                                                            ) : (
                                                                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px] uppercase font-bold px-2 py-0.5">
                                                                    Cashier Verified
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-slate-700 text-xs">{arr.item_name}</span>
                                                                <span className="text-[10px] text-slate-500">{arr.part_number || '-'}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="text-xs font-bold bg-slate-50">
                                                                {arr.quantity_approved || arr.quantity_requested} {arr.unit_measure}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="hidden md:table-cell">
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-bold text-slate-700">{arr.vehicle?.make_model || 'Store Room'}</span>
                                                                <span className="text-[10px] text-slate-500">{arr.vehicle?.vehicle_no || '-'}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="hidden md:table-cell">
                                                            <span className="text-xs text-slate-600 font-medium">
                                                                {arr.garage_suppliers?.name || 'Unknown'}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                size="sm"
                                                                className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase shadow-sm"
                                                                disabled={acknowledgeArrivalMutation.isPending}
                                                                onClick={() => acknowledgeArrivalMutation.mutate(arr)}
                                                            >
                                                                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                                                Acknowledge
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="requisitions" className="space-y-6">
                            <Card className="border-none shadow-lg bg-white overflow-hidden">
                                <CardHeader className="bg-slate-50/50 border-b">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] flex items-center gap-2">
                                            <HistoryIcon className="w-4 h-4 text-slate-400" />
                                            {language === 'en' ? 'Part Requisitions History' : 'Historia ya Maombi ya Vifaa'}
                                        </CardTitle>
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-2 md:mt-0 w-full sm:w-auto">
                                            <div className="relative w-full sm:w-64 order-last sm:order-first">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                                <Input
                                                    placeholder="Search model or plate no..."
                                                    value={reqSearchTerm}
                                                    onChange={(e) => setReqSearchTerm(e.target.value)}
                                                    className="pl-9 h-8 text-xs bg-white border-slate-200 w-full"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    className="h-8 bg-indigo-600 hover:bg-indigo-700 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                                                    onClick={() => {
                                                        setReqType("Job");
                                                        setReqTargetVehicleId("");
                                                        setReqTargetJobId(null);
                                                        setIsRequisitionDialogOpen(true);
                                                    }}
                                                >
                                                    <Plus className="w-3 h-3 mr-1.5 hidden sm:block" /> {language === 'en' ? 'Create Requisition' : 'Tengeneza Ombi'}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    className="h-8 bg-red-600 hover:bg-red-700 text-[10px] font-bold uppercase tracking-wider text-white whitespace-nowrap"
                                                    onClick={() => {
                                                        setReqType("Emergency");
                                                        setReqTargetVehicleId("");
                                                        setReqTargetJobId(null);
                                                        setIsRequisitionDialogOpen(true);
                                                    }}
                                                >
                                                    <AlertTriangle className="w-3 h-3 mr-1.5" /> {language === 'en' ? 'Emergency' : 'Dharura'}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 border-t pt-3">
                                        <Tabs value={activeReqStatusTab} onValueChange={setActiveReqStatusTab} className="w-full">
                                            <TabsList className="bg-slate-100/50 p-1 w-full md:w-fit flex">
                                                <TabsTrigger value="active" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm px-6 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 data-[state=active]:text-indigo-600">
                                                    {language === 'en' ? 'Active (Pending)' : 'Amilifu (Inayosubiri)'}
                                                </TabsTrigger>
                                                <TabsTrigger value="completed" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm px-6 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 data-[state=active]:text-emerald-600">
                                                    {language === 'en' ? 'Completed (Approved/Paid/Closed)' : 'Imekamilika (Imelipwa)'}
                                                </TabsTrigger>
                                            </TabsList>
                                        </Tabs>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50/30">
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Sent Date' : 'Tarehe'}</TableHead>
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Model' : 'Muundo'}</TableHead>
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Truck No' : 'Gari'}</TableHead>
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Requirement' : 'Hitaji'}</TableHead>
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Status' : 'Hali'}</TableHead>
                                                <TableHead className="text-right text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Actions' : 'Vitendo'}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(() => {
                                                const groups: Record<string, {
                                                    id: string, date: Date, dateStr: string, timeStr: string,
                                                    vehicle: any, category: string, status: string,
                                                    items: any[],
                                                    revoke_reason?: string
                                                }> = {};

                                                (requisitions || []).forEach((req: any) => {
                                                    const created = new Date(req.created_at);
                                                    if (req.request_type !== 'Job' || !req.vehicle) {
                                                        const key = `general-${req.id}`;
                                                        groups[key] = {
                                                            id: key, date: created, dateStr: created.toLocaleDateString(), timeStr: created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                                            vehicle: null, category: 'General', status: req.status, items: [req],
                                                            revoke_reason: req.revoke_reason
                                                        };
                                                        return;
                                                    }

                                                    const dateStr = created.toLocaleDateString();
                                                    const vId = req.vehicle.id;
                                                    const cat = req.requirement_category || 'Uncategorized';
                                                    const key = `${dateStr}-${vId}-${cat}`;

                                                    if (!groups[key]) {
                                                        groups[key] = {
                                                            id: key, date: created, dateStr: dateStr, timeStr: created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                                            vehicle: req.vehicle, category: cat, status: req.status, items: []
                                                        };
                                                    }
                                                    groups[key].items.push(req);
                                                });

                                                const sortedGroups = Object.values(groups).map(g => {
                                                    if (g.category === 'General') return g;
                                                    const statuses = g.items.map(i => i.status);
                                                    let groupStatus = 'Pending';
                                                    if (statuses.every(s => s === 'Closed' || s === 'Paid' || s === 'Stocked')) groupStatus = 'Closed';
                                                    else if (statuses.every(s => s === 'Approved')) groupStatus = 'Approved';
                                                    else if (statuses.every(s => s === 'Awaiting Approval')) groupStatus = 'Awaiting Approval';
                                                    else if (statuses.every(s => s === 'Reviewed & Pending')) groupStatus = 'Reviewed & Pending';
                                                    else if (statuses.every(s => s === 'Waiting Review')) groupStatus = 'Waiting Review';
                                                    else if (statuses.every(s => s === 'Pending')) groupStatus = 'Pending';
                                                    else if (statuses.every(s => s === 'Revoked')) {
                                                        groupStatus = 'Revoked';
                                                        g.revoke_reason = g.items.find(i => i.revoke_reason)?.revoke_reason;
                                                    }
                                                    else if (statuses.every(s => s === 'Rejected')) groupStatus = 'Rejected';
                                                    else groupStatus = 'Partial';
                                                    g.status = groupStatus;
                                                    return g;
                                                }).sort((a, b) => b.date.getTime() - a.date.getTime());

                                                const filteredGroups = sortedGroups.filter(g => {
                                                    let isStatusMatch = false;
                                                    if (activeReqStatusTab === "active") {
                                                        isStatusMatch = ['Pending', 'Waiting Review', 'Reviewed & Pending', 'Awaiting Approval', 'Partial'].includes(g.status);
                                                    } else {
                                                        isStatusMatch = ['Closed', 'Paid', 'Stocked', 'Revoked', 'Rejected', 'Approved'].includes(g.status);
                                                    }
                                                    
                                                    const searchStr = reqSearchTerm.toLowerCase();
                                                    const model = g.vehicle?.make_model?.toLowerCase() || '';
                                                    const plate = g.vehicle?.vehicle_no?.toLowerCase() || '';
                                                    const matchesSearch = !reqSearchTerm || model.includes(searchStr) || plate.includes(searchStr);
                                                    
                                                    return isStatusMatch && matchesSearch;
                                                });

                                                if (filteredGroups.length === 0) {
                                                    return (
                                                        <TableRow>
                                                            <TableCell colSpan={6} className="h-32 text-center text-slate-400 font-medium text-sm">
                                                                {language === 'en' ? `No ${activeReqStatusTab} requisitions found` : 'Hakuna maombi yaliyopatikana'}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                }

                                                return filteredGroups.map(group => {
                                                    const isExpanded = expandedReqGroups.includes(group.id);
                                                    return (
                                                        <Fragment key={group.id}>
                                                            <TableRow className="hover:bg-slate-50/50 border-b border-slate-100 transition-colors cursor-pointer" onClick={() => {
                                                                if (group.category !== 'General') {
                                                                    setExpandedReqGroups(prev => isExpanded ? prev.filter(id => id !== group.id) : [...prev, group.id]);
                                                                }
                                                            }}>
                                                                <TableCell className="text-xs text-slate-500 font-medium">
                                                                    <div className="flex flex-col">
                                                                        <span>{group.dateStr}</span>
                                                                        <span className="font-mono text-[11px] text-indigo-400">{group.timeStr}</span>
                                                                        <span className="text-[9px] font-bold text-slate-600 uppercase mt-0.5">
                                                                            By: <span className="text-blue-600">{group.items[0]?.profiles?.full_name || 'System'}</span>
                                                                        </span>
                                                                        {group.items.some((i: any) => i.is_emergency) && (
                                                                            <Badge variant="destructive" className="mt-0.5 text-[8px] uppercase font-bold w-fit animate-pulse px-1.5 py-0">EMERGENCY</Badge>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="font-semibold text-slate-700 text-sm">
                                                                    {group.vehicle?.make_model || group.vehicle?.asset_type || (group.category === 'General' ? (language === 'en' ? 'STORE ROOM' : 'STOO') : 'Unknown')}
                                                                </TableCell>
                                                                <TableCell className="font-medium text-slate-600 text-sm tracking-tight">
                                                                    {group.vehicle 
                                                                        ? getVehicleSpecificPlate(group.vehicle) 
                                                                        : (group.category === 'General' && group.items?.[0]
                                                                            ? <span className="text-indigo-600 font-bold">{group.items[0].garage_inventory?.item_name || group.items[0].item_name} <span className="text-slate-400 font-normal">x{group.items[0].quantity_requested}</span></span>
                                                                            : '-')}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <div className="flex items-center gap-2">
                                                                        <Badge variant="outline" className={`text-[10px] uppercase font-bold py-0 h-5 tracking-tighter ${group.category === 'Spare' ? 'border-orange-200 text-orange-600 bg-orange-50' : group.category === 'Paint' ? 'border-blue-200 text-blue-600 bg-blue-50' : group.category === 'Electrical' ? 'border-yellow-200 text-yellow-600 bg-yellow-50' : 'border-slate-200 text-slate-500 bg-slate-50'}`}>{group.category}</Badge>
                                                                        {group.category !== 'General' && (
                                                                            <span className="text-[10px] text-slate-400 font-mono">({group.items.length} items)</span>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <div className="flex flex-col items-start gap-1">
                                                                        <Badge className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-tight ${
                                                                            group.status === 'Waiting Review' || group.status === 'Pending' ? 'bg-amber-100 text-amber-700 border border-amber-300' :
                                                                            group.status === 'Reviewed & Pending' ? 'bg-blue-100 text-blue-700 border border-blue-300' :
                                                                            group.status === 'Awaiting Approval' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                                                                            group.status === 'Approved' ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' :
                                                                            group.status === 'Closed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                                                                            ['Revoked', 'Rejected'].includes(group.status) ? 'bg-rose-50 text-rose-600 border border-rose-200' :
                                                                            group.status === 'Partial' ? 'bg-purple-50 text-purple-600 border border-purple-200' :
                                                                            'bg-slate-50 text-slate-600'
                                                                        }`}>{group.status === 'Pending' ? 'Waiting Review' : group.status}</Badge>
                                                                        {group.status === 'Revoked' && group.revoke_reason && (
                                                                            <span className="text-[9px] text-rose-500 italic max-w-[120px] leading-tight break-words">Reason: {group.revoke_reason}</span>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        {group.category !== 'General' && (
                                                                            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-indigo-600">
                                                                                {isExpanded ? (language === 'en' ? 'Hide' : 'Ficha') : (language === 'en' ? 'View' : 'Ona')}
                                                                            </Button>
                                                                        )}
                                                                        {group.category === 'General' && (group.status === 'Pending' || group.status === 'Waiting Review') && (
                                                                            <>
                                                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 hover:bg-slate-100" onClick={(e) => { e.stopPropagation(); setEditingReqItem({ id: group.items[0].id, item_name: group.items[0].item_name, quantity: group.items[0].quantity_requested, vehicle_id: group.items[0].vehicle_id || "", requirement_category: group.category || 'Uncategorized' }); setIsEditReqOpen(true); }}><Edit2 className="w-4 h-4" /></Button>
                                                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50" onClick={(e) => { e.stopPropagation(); if (window.confirm("Delete?")) { deleteRequisitionMutation.mutate(group.items[0].id); } }}><Trash2 className="w-4 h-4" /></Button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                            {isExpanded && group.category !== 'General' && (
                                                                <TableRow className="bg-slate-50/50">
                                                                    <TableCell colSpan={6} className="p-0 border-b">
                                                                        <div className="p-4 pl-12 pr-6 border-l-2 border-indigo-200">
                                                                            <table className="w-full text-xs">
                                                                                <thead>
                                                                                    <tr className="text-slate-400 font-bold uppercase tracking-wider text-[9px] border-b border-slate-200">
                                                                                        <th className="text-left pb-2 w-1/2">Item Name</th>
                                                                                        <th className="text-center pb-2 w-16">Qty</th>
                                                                                        <th className="text-right pb-2 w-24">Status</th>
                                                                                        <th className="text-right pb-2 w-16">Actions</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {group.items.map((item: any) => (
                                                                                        <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-white transition-colors">
                                                                                            <td className="py-2 text-slate-700 font-medium">{item.garage_inventory?.item_name || item.item_name}</td>
                                                                                            <td className="py-2 text-center font-mono text-slate-600">{item.quantity_requested}</td>
                                                                                            <td className="py-2 text-right">
                                                                                                <Badge className={`text-[9px] px-1.5 py-0 ${item.status === 'Pending' || item.status === 'Waiting Review' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-700'}`}>{item.status === 'Pending' ? 'Waiting Review' : item.status}</Badge>
                                                                                            </td>
                                                                                            <td className="py-2 text-right">
                                                                                                {(item.status === 'Pending' || item.status === 'Waiting Review') ? (
                                                                                                    <div className="flex items-center justify-end gap-1">
                                                                                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-indigo-500" onClick={(e) => { e.stopPropagation(); setEditingReqItem({ id: item.id, item_name: item.item_name, quantity: item.quantity_requested, vehicle_id: item.vehicle_id || "", requirement_category: item.requirement_category || 'Uncategorized' }); setIsEditReqOpen(true); }}><Edit2 className="w-3 h-3" /></Button>
                                                                                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-rose-500" onClick={(e) => { e.stopPropagation(); if (window.confirm("Delete item?")) { deleteRequisitionMutation.mutate(item.id); } }}><Trash2 className="w-3 h-3" /></Button>
                                                                                                    </div>
                                                                                                ) : <Lock className="w-3 h-3 text-slate-300 ml-auto" />}
                                                                                            </td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </TableCell>
                                                                </TableRow>
                                                            )}
                                                        </Fragment>
                                                    );
                                                });
                                            })()}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="issued" className="space-y-6">
                            <Card className="border-none shadow-lg bg-white overflow-hidden">
                                <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle className="text-[10px] font-bold text-amber-600 uppercase tracking-[0.15em] flex items-center gap-2">
                                            <ShoppingCart className="w-4 h-4 text-amber-400" />
                                            {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][selectedMonth]} {selectedYear} Issued Items Report
                                        </CardTitle>
                                        <p className="text-sm text-slate-500 mt-1 font-medium tracking-tight">Accountability & Stock Consumption Monitoring</p>
                                    </div>
                                    <div className="relative">
                                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <Input 
                                            placeholder={language === 'en' ? "Search by name, item, or vehicle..." : "Tafuta kwa jina, kifaa, au gari..."}
                                            value={usageSearchQuery}
                                            onChange={(e) => setUsageSearchQuery(e.target.value)}
                                            className="w-[300px] pl-9 bg-white border-slate-200"
                                        />
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50/50">
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Date & Time' : 'Tarehe na Muda'}</TableHead>
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Issued To' : 'Ametolewa'}</TableHead>
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Item Taken' : 'Kifaa Kilichotolewa'}</TableHead>
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 text-center">{language === 'en' ? 'Qty' : 'Idadi'}</TableHead>
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{t('vehicle')}</TableHead>
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Manager' : 'Msimamizi'}</TableHead>
                                                <TableHead className="text-right text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Status</TableHead>
                                            </TableRow>

                                        </TableHeader>

                                        <TableBody>
                                            {(usageLogs || []).filter((log: any) => {
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
                                                            <TableCell className="font-semibold text-slate-900 font-mono italic text-sm">{log.issued_to}</TableCell>
                                                            <TableCell className="font-medium text-slate-700 text-sm tracking-tight">{log.item_name}</TableCell>
                                                            <TableCell className="text-center font-mono font-semibold text-slate-600 border-x border-slate-50">{log.quantity_used}</TableCell>

                                                            <TableCell className="text-xs font-semibold text-indigo-600 italic">
                                                                {log.vehicle?.vehicle_no || log.vehicle?.horse_number || log.vehicle?.trailer_number || "-"}
                                                            </TableCell>
                                                            <TableCell className="text-[11px] text-slate-500 font-medium">
                                                                {log.approved_by_profile?.full_name || '-'}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <Badge className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-tight ${log.status === 'Approved' ? 'bg-green-50 text-green-600 border border-green-200' :
                                                                    log.status === 'Rejected' ? 'bg-rose-50 text-rose-600 border border-rose-200' :
                                                                        'bg-amber-50 text-amber-600 border border-amber-200'
                                                                    }`}>
                                                                    {log.status || 'Pending'}
                                                                </Badge>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            {(usageLogs || []).filter((log: any) => {
                                                const d = new Date(log.created_at);
                                                if (d.getMonth() !== selectedMonth || d.getFullYear() !== selectedYear) return false;
                                                if (usageSearchQuery) {
                                                    const sq = usageSearchQuery.toLowerCase();
                                                    const itemStr = (log.garage_inventory?.item_name || log.item_name || '').toLowerCase();
                                                    const issuedToStr = (log.issued_to || '').toLowerCase();
                                                    const vehicleStr = (log.vehicle?.vehicle_no || log.vehicle?.horse_number || log.vehicle?.trailer_number || '').toLowerCase();
                                                    return itemStr.includes(sq) || issuedToStr.includes(sq) || vehicleStr.includes(sq);
                                                }
                                                return true;
                                            }).length === 0 && (
                                                    <TableRow>
                                                        <TableCell colSpan={7} className="h-24 text-center text-sm text-slate-400 italic">{language === 'en' ? 'No usage recorded for this period.' : 'Hakuna matumizi yaliyoandikwa kwa kipindi hiki.'}</TableCell>
                                                    </TableRow>

                                                )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="approvals" className="space-y-6">
                            <Card className="border-none shadow-lg bg-white overflow-hidden">
                                <CardHeader className="bg-indigo-50/50 border-b">
                                    <CardTitle className="text-[10px] font-bold text-indigo-600 uppercase tracking-[0.15em] flex items-center gap-2">

                                        <ClipboardCheck className="w-4 h-4 text-indigo-500" />
                                        {language === 'en' ? 'Pending Issuance Approvals' : 'Idhini za Matoleo Yanayosubiri'}
                                    </CardTitle>
                                    <p className="text-[11px] text-slate-500 mt-1 font-medium tracking-tight">{language === 'en' ? 'Review item issuances before they deduct from stock' : 'Hukiki matoleo ya vifaa kabla ya kupunguzwa kutoka stoo'}</p>

                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50/20">
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Requested' : 'Imeombwa'}</TableHead>
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Recipient' : 'Mpokeaji'}</TableHead>
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Item' : 'Kifaa'}</TableHead>
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 text-center">{t('edit_qty')}</TableHead>
                                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Target Vehicle' : 'Gari Linalokusudiwa'}</TableHead>
                                                <TableHead className="text-right text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{t('actions')}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(usageLogs || []).filter((l: any) => l.status === 'Pending').length > 0 ? (
                                                (usageLogs || []).filter((l: any) => l.status === 'Pending').map((log: any) => {
                                                    const created = new Date(log.created_at);
                                                    return (
                                                        <TableRow key={log.id} className="hover:bg-amber-50/30 border-b border-indigo-50 last:border-0 transition-colors">
                                                            <TableCell className="text-xs text-slate-500 font-medium whitespace-nowrap">
                                                                <div className="flex flex-col">
                                                                    <span>{created.toLocaleDateString()}</span>
                                                                    <span className="font-mono text-[10px] text-indigo-400">{created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="font-semibold text-slate-900 text-xs uppercase">{log.issued_to}</TableCell>

                                                            <TableCell className="font-medium text-slate-700 text-sm tracking-tight">{log.item_name}</TableCell>
                                                            <TableCell className="text-center">
                                                                {userRole === 'garage_manager' ? (
                                                                    <Button
                                                                        variant="ghost"
                                                                        className="h-9 w-20 p-0 font-mono font-semibold text-indigo-600 bg-indigo-50/30 text-lg hover:bg-indigo-100/50 flex flex-col items-center justify-center leading-none group"

                                                                        onClick={() => {
                                                                            setSelectedUsageToApprove(log);
                                                                            setAdjustedQty(log.quantity_used);
                                                                            setIsAdjustQtyOpen(true);
                                                                        }}
                                                                    >
                                                                        {log.quantity_used}
                                                                        <span className="text-[8px] uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 text-indigo-400">Edit Qty</span>
                                                                    </Button>
                                                                ) : (
                                                                    <div className="h-9 w-20 flex items-center justify-center font-mono font-semibold text-indigo-600 bg-indigo-50/30 text-lg rounded-md border border-indigo-100/50">

                                                                        {log.quantity_used}
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-xs font-semibold text-slate-500">
                                                                {log.vehicle?.vehicle_no || log.vehicle?.horse_number || log.vehicle?.trailer_number || "-"}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {userRole === 'garage_manager' ? (
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="h-8 text-[10px] font-semibold uppercase tracking-wider text-rose-500 border-rose-200 hover:bg-rose-50"

                                                                            onClick={() => {
                                                                                setSelectedUsageToApprove(log);
                                                                                setIsRejectionDialogOpen(true);
                                                                            }}
                                                                            disabled={approveIssuanceMutation.isPending}
                                                                        >
                                                                            {t('reject')}
                                                                        </Button>

                                                                        <Button
                                                                            className="h-8 text-[10px] font-semibold uppercase tracking-wider bg-green-600 hover:bg-green-700 text-white shadow-sm"

                                                                            onClick={() => approveIssuanceMutation.mutate({ id: log.id, status: 'Approved' })}
                                                                            disabled={approveIssuanceMutation.isPending}
                                                                        >
                                                                            {approveIssuanceMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : (language === 'en' ? 'Approve Stock Exit' : 'Idhinisha Kutoka Stoo')}
                                                                        </Button>

                                                                    </div>
                                                                ) : (
                                                                    <Badge variant="outline" className="text-[10px] uppercase font-semibold text-slate-400 border-slate-200">

                                                                        View Only
                                                                    </Badge>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="text-center py-12 text-slate-400 italic text-sm">
                                                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                                        {language === 'en' ? 'No pending issuance requests found' : 'Hakuna maombi yanayosubiri kutolewa yaliyopatikana'}
                                                    </TableCell>
                                                </TableRow>

                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs >
                </div >
            ) : activeTab === 'deleted' ? (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">

                                <Trash2 className="w-6 h-6 text-rose-500" />
                                {language === 'en' ? 'Garage Dustbin' : 'Pipa la Taka la Karakana'}
                            </h1>
                            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-[0.1em]">{language === 'en' ? 'Archived Maintenance Records & Job Cards' : 'Rekodi za Matengenezo na Kadi za Kazi Zilizohifadhiwa'}</p>

                        </div>
                    </div>

                    <Card className="border-none shadow-lg bg-white overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b">
                            <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] flex items-center gap-2">
                                <HistoryIcon className="w-4 h-4 text-slate-400" />
                                {language === 'en' ? 'Soft-Deleted Job Cards' : 'Kadi za Kazi Zilizofutwa kwa Muda'}
                            </CardTitle>

                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/30">
                                        <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Deleted Date' : 'Tarehe ya Kufutwa'}</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Vehicle' : 'Gari'}</TableHead>
                                        <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Original Faults' : 'Hitilafu za Awali'}</TableHead>
                                        <TableHead className="text-right text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{language === 'en' ? 'Actions' : 'Vitendo'}</TableHead>
                                    </TableRow>

                                </TableHeader>
                                <TableBody>
                                    {deletedJobCards && deletedJobCards.length > 0 ? (
                                        deletedJobCards.map((job: any) => (
                                            <TableRow key={job.id} className="hover:bg-slate-50/50 border-b border-slate-100 last:border-0 transition-colors">
                                                <TableCell className="text-xs text-slate-500 font-medium">
                                                    <div className="flex flex-col">
                                                        <span>{job.deleted_at ? new Date(job.deleted_at).toLocaleDateString() : 'N/A'}</span>
                                                        <span className="font-mono text-[11px] text-slate-400">{job.deleted_at ? new Date(job.deleted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-semibold text-slate-700">{job.vehicle?.vehicle_no || job.vehicle?.plate_number}</TableCell>

                                                <TableCell className="text-sm text-slate-600">
                                                    {(job.fault_list || []).map((f: any) => f.mechanic_notes || f.fault_type?.fault_name).join(", ") || "No notes"}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 border-indigo-200 hover:bg-indigo-50"

                                                        onClick={() => restoreJobMutation.mutate({ jobId: job.id, vehicleId: job.vehicle_id })}
                                                        disabled={restoreJobMutation.isPending}
                                                    >
                                                        {restoreJobMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : (
                                                            <>
                                                                <RefreshCw className="w-3 h-3 mr-1" /> Restore Record
                                                            </>
                                                        )}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center text-sm text-slate-400 italic">
                                                {language === 'en' ? 'No deleted records in the dustbin.' : 'Hakuna rekodi zilizofutwa kwenye pipa la taka.'}
                                            </TableCell>

                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            ) : activeTab === 'equipment' ? (
                <VehicleEquipment language={language} vehicles={vehicles} />
            ) : activeTab === 'lifecycle' ? (
                <VehicleLifecycle language={language} vehicles={vehicles} />
            ) : null}


            {/* Requisition Dialog */}
            <Dialog open={isRequisitionDialogOpen} onOpenChange={setIsRequisitionDialogOpen}>
                <DialogContent className="sm:max-w-[450px] max-h-[90vh] flex flex-col p-0" onInteractOutside={(e) => e.preventDefault()}>
                    <DialogHeader className="p-6 pb-2 border-b">
                        <DialogTitle className={`flex items-center gap-2 font-bold uppercase tracking-tight ${reqType === 'Emergency' ? 'text-red-700' : 'text-slate-700'}`}>
                            {reqType === 'Emergency' ? <AlertTriangle className="w-5 h-5 text-red-500" /> : <Plus className="w-5 h-5 text-indigo-500" />}
                            {reqType === 'Emergency' ? (language === 'en' ? 'Emergency Requisition' : 'Ombi la Dharura') : isSingleRestock ? (language === 'en' ? "Request Part Restock" : "Omba Kipuri") : (language === 'en' ? "Create Batch Requisition" : "Tengeneza Ombi la Vipuri")}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4 px-6 overflow-y-auto flex-1 min-h-0">
                        {(reqType === 'Job' || reqType === 'Emergency') && (
                            <div className="p-3 bg-indigo-50/30 rounded-lg border border-indigo-100 text-sm space-y-3">
                                <div className="flex items-center gap-2 border-b border-indigo-100 pb-2">
                                    <Truck className="w-5 h-5 text-indigo-500" />
                                    <div className="flex-1 min-w-0">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-2 block">{language === 'en' ? 'Select Vehicle' : 'Chagua Gari'}</Label>
                                        <Popover open={isReqVehiclePopoverOpen} onOpenChange={setIsReqVehiclePopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" role="combobox" aria-expanded={isReqVehiclePopoverOpen} className="w-full justify-between font-normal h-9 bg-white">
                                                    {reqTargetVehicleId
                                                        ? (() => {
                                                            const v = (vehicles || []).find((v: any) => v.id === reqTargetVehicleId);
                                                            return v ? `${getVehicleSpecificPlate(v)} ${v.model ? `- ${v.model}` : ''}` : 'Select a vehicle...';
                                                        })()
                                                        : language === 'en' ? "Select a vehicle..." : "Chagua gari..."}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[380px] p-0" align="start">
                                                <Command>
                                                    <CommandInput placeholder={language === 'en' ? "Search vehicle..." : "Tafuta gari..."} />
                                                    <CommandList>
                                                        <CommandEmpty>{language === 'en' ? "No vehicle found." : "Hakuna gari lililopatikana."}</CommandEmpty>
                                                        <CommandGroup>
                                                            {(vehicles || []).map((v: any) => (
                                                                <CommandItem
                                                                    key={v.id}
                                                                    value={`${v.plate_number} ${v.model} ${v.vehicle_no || ''} ${v.horse_number || ''} ${v.trailer_number || ''}`}
                                                                    onSelect={() => {
                                                                        setReqTargetVehicleId(v.id);
                                                                        setIsReqVehiclePopoverOpen(false);
                                                                    }}
                                                                >
                                                                    <Check className={`mr-2 h-4 w-4 ${reqTargetVehicleId === v.id ? "opacity-100" : "opacity-0"}`} />
                                                                    {getVehicleSpecificPlate(v)} {v.model ? `- ${v.model}` : ''}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                                
                                <div className="pt-1">
                                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-2 block">{language === 'en' ? 'Select Requirement Categories' : 'Chagua Aina za Mahitaji'}</Label>
                                    <div className="flex flex-wrap gap-3">
                                        {['Spare', 'Paint', 'Electrical'].map(cat => (
                                            <label key={cat} className="flex items-center gap-2 cursor-pointer border px-3 py-1.5 rounded bg-white hover:bg-slate-50">
                                                <input 
                                                    type="checkbox" 
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    checked={reqCategories.includes(cat)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setReqCategories([...reqCategories, cat]);
                                                            if (!requisitionItems.some(i => i.category === cat)) {
                                                                setRequisitionItems([...requisitionItems, { item_name: "", quantity: 1, category: cat }]);
                                                            }
                                                        } else {
                                                            setReqCategories(reqCategories.filter(c => c !== cat));
                                                            setRequisitionItems(requisitionItems.filter(i => i.category !== cat));
                                                        }
                                                    }}
                                                />
                                                <span className="text-sm font-medium text-slate-700">{cat}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {((reqType === 'General') ? ['General'] : reqCategories).map((categoryName) => (
                            <div key={categoryName} className="space-y-3">
                                {(reqType === 'Job' || reqType === 'Emergency') && (
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b pb-1 mt-4">{categoryName} Requirements</h3>
                                )}
                                {requisitionItems.filter(i => ((reqType === 'Job' || reqType === 'Emergency') ? i.category === categoryName : true)).map((item, localIdx) => {
                                    const globalIdx = requisitionItems.indexOf(item);
                                    return (
                                        <div key={globalIdx} className="flex items-end gap-2 p-2 border border-slate-100 rounded-md bg-slate-50/30 relative group">
                                            <div className="flex-1 space-y-1">
                                                <Label className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.1em]">{language === 'en' ? 'Item' : 'Kipuri'}</Label>
                                                <Input
                                                    placeholder={language === 'en' ? "What is needed? (e.g. Brake Pads)" : "Kinachohitajika? (mfano: Break Pads)"}
                                                    value={item.item_name}
                                                    onChange={(e) => {
                                                        const newItems = [...requisitionItems];
                                                        newItems[globalIdx].item_name = e.target.value;
                                                        setRequisitionItems(newItems);
                                                    }}
                                                    className="h-8 bg-white text-xs border-slate-200 focus-visible:ring-indigo-500/50"
                                                />
                                            </div>
                                            <div className="w-20 space-y-1">
                                                <Label className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.1em]">{language === 'en' ? 'Qty' : 'Idadi'}</Label>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={item.quantity}
                                                    onChange={(e) => {
                                                        const newItems = [...requisitionItems];
                                                        newItems[globalIdx].quantity = parseInt(e.target.value) || 1;
                                                        setRequisitionItems(newItems);
                                                    }}
                                                    className="h-8 bg-white text-xs text-center border-slate-200 focus-visible:ring-indigo-500/50"
                                                />
                                            </div>
                                            {requisitionItems.filter(i => ((reqType === 'Job' || reqType === 'Emergency') ? i.category === categoryName : true)).length > 1 && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                                                    onClick={() => setRequisitionItems(requisitionItems.filter((_, i) => i !== globalIdx))}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    );
                                })}

                                {!isSingleRestock && (
                                    <div className="flex justify-end pt-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-[10px] font-bold uppercase tracking-wider text-indigo-500 border-dashed border-indigo-200 hover:text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300"
                                            onClick={() => setRequisitionItems([...requisitionItems, { item_name: "", quantity: 1, category: (reqType === 'Job' || reqType === 'Emergency') ? categoryName : "Uncategorized" }])}
                                        >
                                            <Plus className="w-3 h-3 mr-1.5" /> {language === 'en' ? `Add ${(reqType === 'Job' || reqType === 'Emergency') ? categoryName : ''} Item` : 'Ongeza Kipuri'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}

                    </div>
                    <DialogFooter className="p-6 pt-4 border-t bg-slate-50/50">
                        <Button variant="outline" onClick={() => setIsRequisitionDialogOpen(false)} className="h-10">{language === 'en' ? 'Cancel' : 'Ghairi'}</Button>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700 h-10"
                            onClick={() => {
                                const validItems = requisitionItems.filter(i => i.item_name.trim());
                                if (validItems.length === 0) {
                                    toast({ variant: "destructive", title: language === 'en' ? "Missing Items" : "Vipuri Havipo", description: language === 'en' ? "Please enter at least one item name." : "Tafadhali weka jina la angalau kipuri kimoja." });
                                    return;
                                }

                                const payloads = validItems.map(item => ({
                                    request_type: reqType === 'Emergency' ? 'Job' : reqType,
                                    vehicle_id: reqTargetVehicleId || null,
                                    job_id: reqTargetJobId || null,
                                    item_id: item.item_id || null,
                                    item_name: item.item_name,
                                    quantity_requested: item.quantity,
                                    requirement_category: item.category || 'Uncategorized',
                                    status: 'Waiting Review',
                                    is_emergency: reqType === 'Emergency'
                                }));

                                createRequisitionMutation.mutate(payloads);
                            }}
                            disabled={createRequisitionMutation.isPending}
                        >
                            {createRequisitionMutation.isPending ? (language === 'en' ? "Sending..." : "Inatuma...") : `${language === 'en' ? 'Submit' : 'Tuma'} ${requisitionItems.filter(i => i.item_name.trim()).length > 0 ? requisitionItems.filter(i => i.item_name.trim()).length + ' ' : ''}${language === 'en' ? (requisitionItems.length > 1 ? 'Requisitions' : 'Requisition') : (requisitionItems.length > 1 ? 'Maombi' : 'Ombi')}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isEditReqOpen} onOpenChange={setIsEditReqOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-bold text-slate-700 uppercase tracking-tight">
                            <Edit2 className="w-5 h-5 text-indigo-500" />
                            {language === 'en' ? 'Edit Pending Requisition' : 'Hariri Ombi Linalosubiri'}
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            {language === 'en' ? 'Update the details before procurement processes the request.' : 'Sasisha maelezo kabla ya manunuzi kushughulikia ombi.'}
                        </DialogDescription>
                    </DialogHeader>
                    {editingReqItem && (
                        <div className="grid gap-4 py-4">
                            {editingReqItem.requirement_category === 'Uncategorized' ? (
                                <>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">{language === 'en' ? 'Item Name' : 'Jina la Kifaa'}</Label>
                                        <Input
                                            value={editingReqItem.item_name}
                                            onChange={(e) => setEditingReqItem({ ...editingReqItem, item_name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-2 block">{language === 'en' ? 'Category' : 'Kundi'}</Label>
                                        <div className="flex flex-wrap gap-3">
                                            {['Spare', 'Paint', 'Electrical'].map(cat => (
                                                <label key={cat} className="flex items-center gap-2 cursor-pointer border px-3 py-1.5 rounded bg-white hover:bg-slate-50">
                                                    <input 
                                                        type="checkbox"
                                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                        checked={editingReqItem.requirement_category === cat}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setEditingReqItem({ ...editingReqItem, requirement_category: cat });
                                                            }
                                                        }}
                                                    />
                                                    <span className="text-sm font-medium text-slate-700">
                                                        {language === 'en' ? cat : (
                                                            cat === 'Spare' ? 'Spea' :
                                                            cat === 'Paint' ? 'Rangi' :
                                                            cat === 'Electrical' ? 'Umeme' :
                                                            cat === 'General' ? 'Jumla' :
                                                            cat === 'Parts' ? 'Vipuri' :
                                                            cat === 'Fluids' ? 'Maji/Mafuta' :
                                                            cat === 'Tools' ? 'Zana' : 'Haijapangwa'
                                                        )}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">{language === 'en' ? 'Select Vehicle' : 'Chagua Gari'}</Label>
                                        <Popover open={isEditVehiclePopoverOpen} onOpenChange={setIsEditVehiclePopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" role="combobox" aria-expanded={isEditVehiclePopoverOpen} className="w-full justify-between font-normal h-9 bg-white">
                                                    {editingReqItem.vehicle_id
                                                        ? (() => {
                                                            const v = (vehicles || []).find((v: any) => v.id === editingReqItem.vehicle_id);
                                                            return v ? `${getVehicleSpecificPlate(v)} ${v.model ? `- ${v.model}` : ''}` : 'Select a vehicle...';
                                                        })()
                                                        : (language === 'en' ? "Select vehicle if applicable" : "Chagua gari kama linahusika")}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[380px] p-0" align="start">
                                                <Command>
                                                    <CommandInput placeholder={language === 'en' ? "Search vehicle..." : "Tafuta gari..."} className="h-9" />
                                                    <CommandList>
                                                        <CommandEmpty>No vehicle found.</CommandEmpty>
                                                        <CommandGroup>
                                                            <CommandItem
                                                                value="none"
                                                                onSelect={() => {
                                                                    setEditingReqItem({ ...editingReqItem, vehicle_id: "" });
                                                                    setIsEditVehiclePopoverOpen(false);
                                                                }}
                                                            >
                                                                <span className="text-slate-500 italic">{language === 'en' ? 'None (Unassign)' : 'Hakuna'}</span>
                                                            </CommandItem>
                                                            {(vehicles || []).map((v: any) => {
                                                                const plate = getVehicleSpecificPlate(v);
                                                                return (
                                                                    <CommandItem
                                                                        key={v.id}
                                                                        value={`${plate} ${v.model || ''}`}
                                                                        onSelect={() => {
                                                                            setEditingReqItem({ ...editingReqItem, vehicle_id: v.id });
                                                                            setIsEditVehiclePopoverOpen(false);
                                                                        }}
                                                                    >
                                                                        <div className="flex flex-col">
                                                                            <span className="font-semibold">{plate}</span>
                                                                            <span className="text-[10px] text-slate-500">{v.model || "Unknown Model"} • {v.status}</span>
                                                                        </div>
                                                                        <Check className={`ml-auto h-4 w-4 ${editingReqItem.vehicle_id === v.id ? "opacity-100" : "opacity-0"}`} />
                                                                    </CommandItem>
                                                                );
                                                            })}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">{language === 'en' ? 'Item Requested' : 'Kifaa Kilichoombwa'}</Label>
                                    <Input
                                        value={editingReqItem.item_name}
                                        disabled
                                        className="bg-slate-50 text-slate-500 border-slate-200 cursor-not-allowed"
                                    />
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{language === 'en' ? 'Quantity' : 'Idadi'}</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={editingReqItem.quantity}
                                    onChange={(e) => setEditingReqItem({ ...editingReqItem, quantity: parseInt(e.target.value) || 1 })}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setIsEditReqOpen(false);
                            setEditingReqItem(null);
                        }}>
                            {language === 'en' ? 'Cancel' : 'Ghairi'}
                        </Button>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            disabled={editRequisitionMutation.isPending || !editingReqItem?.item_name}
                            onClick={() => {
                                if (editingReqItem) {
                                    editRequisitionMutation.mutate(editingReqItem);
                                }
                            }}
                        >
                            {editRequisitionMutation.isPending ? (language === 'en' ? 'Saving...' : 'Inahifadhi...') : (language === 'en' ? 'Save Changes' : 'Hifadhi Mabadiliko')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Daily Usage / Issuance Dialog */}
            <Dialog open={isUsageDialogOpen} onOpenChange={setIsUsageDialogOpen}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-bold text-slate-700 uppercase tracking-tight">
                            <ShoppingCart className="w-5 h-5 text-amber-500" />
                            {language === 'en' ? 'Issue Stock' : 'Toa Kipuri'}: {usageForm.item_name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">{language === 'en' ? 'Quantity To Issue' : 'Idadi ya Kutolewa'}</Label>
                            <Input
                                type="number"
                                min={1}
                                value={usageForm.quantity}
                                onChange={(e) => setUsageForm({ ...usageForm, quantity: parseInt(e.target.value) || 1 })}
                                className="h-10 text-lg font-mono font-semibold text-red-500"
                            />
                            <p className="text-xs text-amber-600 italic font-medium">{language === 'en' ? "This issuance will be sent to the Garage Manager for approval before stock is reduced." : "Ombi hili litatumwa kwa Meneja wa Gereji kwa idhini kabla ya idadi kupunguzwa."}</p>
                        </div>


                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">{language === 'en' ? 'Issued To (Personnel)' : 'Kimetolewa kwa (Mfanyakazi)'}</Label>
                            <Input
                                placeholder={language === 'en' ? "Who is taking this item? (e.g. Mechanic Juma)" : "Ni nani anachukua kipuri hiki? (mfano: Fundi Juma)"}
                                value={usageForm.issued_to}
                                onChange={(e) => setUsageForm({ ...usageForm, issued_to: e.target.value })}
                                className="h-10"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">{language === 'en' ? 'Target Vehicle (Optional)' : 'Gari Linalolengwa (Si lazima)'}</Label>
                            <Popover open={isVehiclePopoverOpen} onOpenChange={setIsVehiclePopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={isVehiclePopoverOpen}
                                        className="w-full h-10 justify-between font-normal"
                                    >
                                        <span className="truncate">
                                            {usageForm.vehicle_id
                                                ? (vehicles || []).find((v: any) => v.id === usageForm.vehicle_id)?.plate_number || (language === 'en' ? "Select vehicle..." : "Chagua gari...")
                                                : (language === 'en' ? "Select vehicle if applicable" : "Chagua gari kama linahusika")}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[400px] p-0" align="start">
                                    <Command>
                                        <CommandInput
                                            placeholder={language === 'en' ? "Search plate number..." : "Tafuta namba ya usajili..."}
                                            className="h-9"
                                        />
                                        <CommandList className="max-h-[300px]">
                                            <CommandEmpty>{language === 'en' ? "No vehicle found." : "Gari halikupatikana."}</CommandEmpty>
                                            <CommandGroup>
                                                <CommandItem
                                                    value="none"
                                                    onSelect={() => {
                                                        setUsageForm({ ...usageForm, vehicle_id: "" });
                                                        setIsVehiclePopoverOpen(false);
                                                    }}
                                                    className="text-xs italic text-slate-500"
                                                >
                                                    <Check
                                                        className={`mr-2 h-4 w-4 ${usageForm.vehicle_id === "" ? "opacity-100" : "opacity-0"}`}
                                                    />
                                                    {language === 'en' ? "None (Not vehicle specific)" : "Hakuna (Haitaunganishwa na gari)"}
                                                </CommandItem>
                                                {(vehicles || []).filter((v: any) => 
                                                    v.status === 'Maintenance' || 
                                                    (jobCards || []).some((j: any) => j.vehicle_id === v.id && j.status !== 'Closed')
                                                ).map((v: any) => (
                                                    <CommandItem
                                                        key={v.id}
                                                        value={v.plate_number}
                                                        onSelect={() => {
                                                            setUsageForm({ ...usageForm, vehicle_id: v.id });
                                                            setIsVehiclePopoverOpen(false);
                                                        }}
                                                        className="text-xs font-mono"
                                                    >
                                                        <Check
                                                            className={`mr-2 h-4 w-4 ${usageForm.vehicle_id === v.id ? "opacity-100" : "opacity-0"}`}
                                                        />
                                                        {v.plate_number}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>


                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em]">{language === 'en' ? 'Usage Notes / Destination Dept' : 'Maelezo ya Matumizi / Idara Inayokwenda'}</Label>
                            <Textarea
                                placeholder={language === 'en' ? "Brief reason, task details, or destination department..." : "Sababu fupi, maelezo ya kazi, au idara inayokwenda..."}
                                value={usageForm.notes}
                                onChange={(e) => setUsageForm({ ...usageForm, notes: e.target.value })}
                                className="min-h-[80px]"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsUsageDialogOpen(false)} className="h-10">{language === 'en' ? 'Cancel' : 'Ghairi'}</Button>
                        <Button
                            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold h-10"
                            disabled={!usageForm.issued_to.trim() || recordUsageMutation.isPending}
                            onClick={() => recordUsageMutation.mutate(usageForm)}
                        >
                            {recordUsageMutation.isPending ? (language === 'en' ? "Recording..." : "Inasajili...") : (language === 'en' ? "Confirm & Record Usage" : "Thibitisha & Sajili Matumizi")}
                        </Button>

                    </DialogFooter>
                </DialogContent>
            </Dialog>


            {/* Add Product Dialog */}
            <Dialog open={isAddProductDialogOpen} onOpenChange={setIsAddProductDialogOpen}>
                <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-semibold">
                            <Plus className="w-5 h-5 text-indigo-500" />
                            {language === 'en' ? 'Add New Product' : 'Ongeza Kipuri Kipya'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-500 uppercase">{language === 'en' ? 'Product Name' : 'Jina la Kipuri'}</Label>
                                <Input
                                    placeholder="e.g. Engine Oil"
                                    value={newProduct.item_name}
                                    onChange={(e) => setNewProduct({ ...newProduct, item_name: e.target.value })}
                                    className="h-10"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-500 uppercase">{language === 'en' ? 'Part Number' : 'Namba ya Kipuri'}</Label>
                                <Input
                                    placeholder="e.g. 12345-PN"
                                    value={newProduct.part_number}
                                    onChange={(e) => setNewProduct({ ...newProduct, part_number: e.target.value })}
                                    className="h-10 font-mono"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-500 uppercase">{language === 'en' ? 'Category' : 'Kundi'}</Label>
                                <Select value={newProduct.category} onValueChange={(val) => setNewProduct({ ...newProduct, category: val, unit_measure: val === 'Fluids' ? 'Liters' : newProduct.unit_measure })}>
                                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Parts">{language === 'en' ? 'Parts' : 'Vipuri'}</SelectItem>
                                        <SelectItem value="Fluids">{language === 'en' ? 'Fluids' : 'Maji/Mafuta'}</SelectItem>
                                        <SelectItem value="Tools">{language === 'en' ? 'Tools' : 'Zana'}</SelectItem>
                                        <SelectItem value="General">{language === 'en' ? 'General' : 'Jumla'}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-500 uppercase">{language === 'en' ? 'Initial Stock' : 'Idadi ya Awali'}</Label>
                                <Input
                                    type="number"
                                    value={newProduct.quantity}
                                    onChange={(e) => setNewProduct({ ...newProduct, quantity: parseInt(e.target.value) || 0 })}
                                    className="h-10"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-500 uppercase">{language === 'en' ? 'Unit measure' : 'Kipimo'}</Label>
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
                                <Label className="text-sm font-semibold text-slate-500 uppercase">{language === 'en' ? 'Min Threshold' : "Kiwango cha Chini"}</Label>
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
                        <Button variant="outline" onClick={() => setIsAddProductDialogOpen(false)} className="h-10">{language === 'en' ? 'Cancel' : 'Ghairi'}</Button>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700 h-10 font-semibold"
                            disabled={!newProduct.item_name || addProductMutation.isPending}
                            onClick={() => addProductMutation.mutate(newProduct)}
                        >
                            {addProductMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (language === 'en' ? "Registry Product" : "Sajili Kipuri")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Product Dialog */}
            <Dialog open={isEditProductDialogOpen} onOpenChange={setIsEditProductDialogOpen}>
                <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-semibold">
                            <Settings className="w-5 h-5 text-indigo-500" />
                            {language === 'en' ? 'Edit Product' : 'Hariri Kipuri'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-500 uppercase">{language === 'en' ? 'Product Name' : 'Jina la Kipuri'}</Label>
                                <Input
                                    value={editProduct.item_name}
                                    onChange={(e) => setEditProduct({ ...editProduct, item_name: e.target.value })}
                                    className="h-10"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-500 uppercase">{language === 'en' ? 'Part Number' : 'Namba ya Kipuri'}</Label>
                                <Input
                                    value={editProduct.part_number}
                                    onChange={(e) => setEditProduct({ ...editProduct, part_number: e.target.value })}
                                    className="h-10 font-mono"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-500 uppercase">{language === 'en' ? 'Category' : 'Kundi'}</Label>
                                <Select value={editProduct.category} onValueChange={(val) => setEditProduct({ ...editProduct, category: val, unit_measure: val === 'Fluids' ? 'Liters' : editProduct.unit_measure })}>
                                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Parts">{language === 'en' ? 'Parts' : 'Vipuri'}</SelectItem>
                                        <SelectItem value="Fluids">{language === 'en' ? 'Fluids' : 'Maji/Mafuta'}</SelectItem>
                                        <SelectItem value="Tools">{language === 'en' ? 'Tools' : 'Zana'}</SelectItem>
                                        <SelectItem value="General">{language === 'en' ? 'General' : 'Jumla'}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-500 uppercase">{language === 'en' ? 'Unit measure' : 'Kipimo'}</Label>
                                <Input
                                    value={editProduct.unit_measure}
                                    onChange={(e) => setEditProduct({ ...editProduct, unit_measure: e.target.value })}
                                    className="h-10"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-slate-500 uppercase">{language === 'en' ? 'Min Threshold' : "Kiwango cha Chini"}</Label>
                                <div className="relative">
                                    <AlertTriangle className="absolute left-3 top-3 h-4 w-4 text-amber-500" />
                                    <Input
                                        type="number"
                                        value={editProduct.min_threshold}
                                        onChange={(e) => setEditProduct({ ...editProduct, min_threshold: parseInt(e.target.value) || 0 })}
                                        className="h-10 pl-10"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditProductDialogOpen(false)} className="h-10">{language === 'en' ? 'Cancel' : 'Ghairi'}</Button>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700 h-10 font-semibold"
                            disabled={!editProduct.item_name || editProductMutation.isPending}
                            onClick={() => editProductMutation.mutate(editProduct)}
                        >
                            {editProductMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (language === 'en' ? "Save Changes" : "Hifadhi Mabadiliko")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>



            {/* Update Quantity Dialog */}
            <Dialog open={isUpdateQtyOpen} onOpenChange={setIsUpdateQtyOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-semibold">
                            <Package className="w-5 h-5 text-indigo-500" />
                            {language === 'en' ? 'Update Physical Stock' : 'Sasisha Idadi Halisi'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="p-3 bg-slate-50 rounded border text-center">
                            <Label className="text-xs uppercase font-semibold text-slate-500">{language === 'en' ? 'Selected Item' : 'Kipuri Kilichochaguliwa'}</Label>
                            <p className="font-semibold text-slate-900">{selectedInventoryItem?.item_name}</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-slate-500 uppercase">{language === 'en' ? 'New Physical Quantity' : 'Idadi Mpya Halisi'}</Label>
                            <Input
                                type="number"
                                value={updateQtyDetails.quantity}
                                onChange={(e) => setUpdateQtyDetails({ quantity: parseInt(e.target.value) || 0 })}
                                className="h-12 text-2xl font-mono font-semibold text-indigo-600"
                            />
                            <p className="text-[10px] text-slate-400 italic font-medium">{language === 'en' ? 'Enter the actual count from the physical store.' : 'Weka idadi halisi kutoka ghalani.'}</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsUpdateQtyOpen(false)} className="h-10">{language === 'en' ? 'Cancel' : 'Ghairi'}</Button>
                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700 h-10 font-semibold"
                            disabled={updateQuantityMutation.isPending}
                            onClick={() => updateQuantityMutation.mutate({
                                id: selectedInventoryItem?.id,
                                qty: updateQtyDetails.quantity
                            })}
                        >
                            {updateQuantityMutation.isPending ? (language === 'en' ? "Saving..." : "Inahifadhi...") : (language === 'en' ? "Save Count" : "Hifadhi Idadi")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Stock In Dialog */}
            <Dialog open={isStockInDialogOpen} onOpenChange={setIsStockInDialogOpen}>
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-semibold">
                            <PackagePlus className="w-5 h-5 text-emerald-500" />
                            {language === 'en' ? 'Receive Stock' : 'Pokea Bidhaa'}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            {language === 'en' ? 'Record items received into the store to update inventory.' : 'Sajili bidhaa zilizopokelewa ghalani kusasisha hifadhi.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                            <Label className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">{language === 'en' ? 'Item' : 'Kipuri'}</Label>
                            <p className="font-bold text-slate-900 text-sm mt-0.5">{stockInForm.item_name}</p>
                            <p className="text-[11px] text-slate-500 font-medium mt-1">
                                {language === 'en' ? 'Current Stock: ' : 'Hifadhi ya Sasa: '}
                                <span className="font-bold text-slate-700">{stockInForm.current_qty}</span>
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-slate-500 uppercase">{language === 'en' ? 'Quantity Received' : 'Idadi Iliyopokelewa'}</Label>
                            <Input
                                type="number"
                                min={1}
                                value={stockInForm.quantity}
                                onChange={(e) => setStockInForm({ ...stockInForm, quantity: parseInt(e.target.value) || 1 })}
                                className="h-12 text-2xl font-mono font-semibold text-emerald-600"
                            />
                            <p className="text-[10px] text-slate-400 italic font-medium flex items-center gap-1">
                                {language === 'en' ? 'New stock level will be: ' : 'Kiwango kipya kitakuwa: '}
                                <span className="font-bold text-emerald-600 text-xs">{stockInForm.current_qty + (stockInForm.quantity || 0)}</span>
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-slate-500 uppercase">{language === 'en' ? 'Notes (Optional)' : 'Maelezo (Si lazima)'}</Label>
                            <Textarea
                                value={stockInForm.notes}
                                onChange={(e) => setStockInForm({ ...stockInForm, notes: e.target.value })}
                                placeholder={language === 'en' ? 'e.g. Received from supplier XYZ, invoice #123' : 'k.m. Imepokelewa kutoka kwa msambazaji XYZ'}
                                className="text-sm resize-none h-20"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsStockInDialogOpen(false)} className="h-10">{language === 'en' ? 'Cancel' : 'Ghairi'}</Button>
                        <Button
                            className="bg-emerald-600 hover:bg-emerald-700 h-10 font-semibold"
                            disabled={stockInMutation.isPending || stockInForm.quantity < 1}
                            onClick={() => stockInMutation.mutate(stockInForm)}
                        >
                            {stockInMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                <><PackagePlus className="w-4 h-4 mr-1.5" />{language === 'en' ? 'Receive Stock' : 'Pokea'}</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isLogFaultOpen} onOpenChange={setIsLogFaultOpen}>
                <DialogContent className={affectedUnit === 'Both' && isCoupled ? "sm:max-w-[900px] duration-300" : "sm:max-w-[500px] duration-300"}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-slate-900 uppercase tracking-tight">

                            <Wrench className="w-6 h-6 text-indigo-500" />
                            {t('log_new_fault')}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-semibold text-slate-500 italic pb-2 border-b">
                            {language === 'en' ? 'Record mechanical issues and assign responsibility' : 'Sajili hitilafu za kiufundi na mteule msimamizi'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="max-h-[75vh] overflow-y-auto pr-2 px-1 py-4 -mr-1">
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Truck className="w-3.5 h-3.5" />
                                    {language === 'en' ? 'Select Vehicle' : 'Chagua Gari'}
                                </Label>

                                <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                                    <SelectTrigger className="h-11 bg-slate-50 border-slate-200">
                                        <SelectValue placeholder={language === 'en' ? 'Search plate number...' : 'Tafuta namba ya gari...'} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <div className="p-2"><Input placeholder={language === 'en' ? 'Filter...' : 'Chuja...'} className="h-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
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
                                            ) : (<div className="p-2 text-sm text-center text-muted-foreground italic">{language === 'en' ? 'No vehicles found.' : 'Hakuna magari yaliyopatikana.'}</div>)}
                                        </ScrollArea>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Service package removed as per user request to simplify fault logging */}

                            {isCoupled && (
                                <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
                                    <Label className="text-indigo-900 font-semibold flex items-center gap-2 mb-3 text-sm">
                                        <Link className="w-4 h-4 text-indigo-500" />
                                        {language === 'en' ? 'Unit Isolation (Coupled Vehicle)' : 'Mgawanyo wa Unit (Gari lililounganishwa)'}
                                    </Label>

                                    {(() => {
                                        const vList = (vehicles || []) as any[];
                                        const pair = (couplings || []).find(c => c.horse_id === selectedVehicleId || c.trailer_id === selectedVehicleId);
                                        const horse = vList.find(v => v.id === pair?.horse_id);
                                        const trailer = vList.find(v => v.id === pair?.trailer_id);
                                        const hPlate = horse?.vehicle_no || horse?.horse_number || "Horse Plate";
                                        const tPlate = trailer?.trailer_number || trailer?.vehicle_no || "Trailer Plate";
                                        const tType = trailer?.asset_type?.toUpperCase() || "UNIT";

                                        return (
                                            <div className="grid grid-cols-3 gap-3">
                                                <label className={`flex flex-col items-center gap-1 p-3 rounded-lg border cursor-pointer transition-all ${affectedUnit === 'Horse' ? 'bg-white border-indigo-400 shadow-sm' : 'bg-white/50 border-slate-200 hover:bg-white'}`}>
                                                    <input type="radio" className="sr-only" name="affectedUnit" checked={affectedUnit === 'Horse'} onChange={() => setAffectedUnit('Horse')} />
                                                    <span className="text-sm uppercase font-normal text-slate-500 tracking-tight">{language === 'en' ? 'HORSE UNIT' : 'UNIT YA MBELE'}</span>
                                                    <span className="text-sm font-normal text-slate-900">{hPlate}</span>
                                                </label>
                                                <label className={`flex flex-col items-center gap-1 p-3 rounded-lg border cursor-pointer transition-all ${affectedUnit === 'Trailer' ? 'bg-white border-indigo-400 shadow-sm' : 'bg-white/50 border-slate-200 hover:bg-white'}`}>
                                                    <input type="radio" className="sr-only" name="affectedUnit" checked={affectedUnit === 'Trailer'} onChange={() => setAffectedUnit('Trailer')} />
                                                    <span className="text-sm uppercase font-normal text-slate-500 tracking-tight">{tType} UNIT</span>
                                                    <span className="text-sm font-normal text-slate-900">{tPlate}</span>
                                                </label>
                                                <label className={`flex flex-col items-center gap-1 p-3 rounded-lg border cursor-pointer transition-all ${affectedUnit === 'Both' ? 'bg-white border-indigo-400 shadow-sm' : 'bg-white/50 border-slate-200 hover:bg-white'}`}>
                                                    <input type="radio" className="sr-only" name="affectedUnit" checked={affectedUnit === 'Both'} onChange={() => setAffectedUnit('Both')} />
                                                    <span className="text-sm uppercase font-normal text-slate-500 tracking-tight">{language === 'en' ? 'BOTH UNITS' : 'ZOTE MBILI'}</span>
                                                    <span className="text-[10px] font-normal text-slate-700 truncate w-full text-center">{hPlate} + {tPlate}</span>
                                                </label>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            <div>
                                <div className={`grid gap-6 ${affectedUnit === 'Both' && isCoupled ? 'md:grid-cols-2 bg-slate-50 p-4 rounded-xl border border-slate-200' : ''}`}>
                                    <div className="space-y-4">
                                        {affectedUnit === 'Both' && isCoupled && (
                                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2 px-2 bg-white py-2 rounded border shadow-sm">

                                                <Truck className="w-3 h-3" /> {language === 'en' ? 'HORSE UNIT' : 'UNIT YA MBELE'}: <span className="text-slate-900 ml-1">{(() => {
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
                                                            placeholder={!selectedVehicleId ? (language === 'en' ? "Select a vehicle..." : "Chagua gari...") : (language === 'en' ? "Describe the issue (e.g. Oil leak)..." : "Elezea tatizo (mfano: Kuvuja kwa mafuta)...")}
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
                                                    <Plus className="w-3 h-3 mr-1.5" /> {language === 'en' ? 'Add Another Fault' : 'Ongeza Tatizo Jingine'}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {affectedUnit === 'Both' && isCoupled && (
                                        <div className="space-y-4 border-l pl-6 border-slate-200">
                                            <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-2 flex items-center justify-between px-2 bg-indigo-50 py-2 rounded border border-indigo-100 shadow-sm">
                                                <div className="flex items-center gap-2">
                                                    <Link className="w-3 h-3" />
                                                    {(() => {
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
                                                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-slate-400 hover:text-indigo-600" onClick={() => setPartnerFaults(JSON.parse(JSON.stringify(horseFaults)))}>{language === 'en' ? 'Copy From Horse' : 'Nakili kutoka kwa Horse'}</Button>
                                            </div>

                                            <div className="space-y-2">
                                                {partnerFaults.map((fault, idx) => (
                                                    <div key={idx} className="flex gap-3 items-center group">
                                                        <span className="text-xs font-mono text-indigo-300 w-4 pt-1 text-right">{idx + 1}.</span>
                                                        <div className="flex-1">
                                                            <Input
                                                                placeholder={language === 'en' ? "Describe partner issue..." : "Elezea tatizo la mwenza..."}
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
                                                        <Plus className="w-3 h-3 mr-1.5" /> {language === 'en' ? 'Add Partner Fault' : 'Ongeza Tatizo la Mwenza'}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-4 space-y-2">
                                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5" />
                                    {language === 'en' ? 'Current Odometer (Optional)' : 'Odometer ya Sasa (Si lazima)'}
                                </Label>
                                <Input type="number" placeholder="0" value={odometer} onChange={(e) => setOdometer(e.target.value)} className="h-10 border-slate-200" />
                            </div>

                        </div>
                    </div>
                    <DialogFooter className="bg-slate-50/50 p-4 -mx-6 -mb-6 border-t mt-4">
                        <Button variant="ghost" onClick={() => setIsLogFaultOpen(false)} className="text-slate-500 hover:bg-slate-100">{language === 'en' ? 'Cancel' : 'Ghairi'}</Button>
                        <Button onClick={handleLogFault} disabled={logFaultMutation.isPending || !selectedVehicleId} className="bg-red-600 hover:bg-red-700 hover:text-white text-white font-semibold px-6 transition-all active:scale-95 shadow-lg shadow-red-200">
                            {logFaultMutation.isPending ? (language === 'en' ? "Logging..." : "Inasajili...") : (language === 'en' ? "Log Fault & Down Vehicle" : "Sajili Hitilafu & Simamisha Gari")}
                        </Button>
                    </DialogFooter>

                </DialogContent>
            </Dialog>

            <Dialog open={isAddExtraFaultOpen} onOpenChange={setIsAddExtraFaultOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{language === 'en' ? 'Add Extra Task' : 'Ongeza Kazi ya Ziada'}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Label>{language === 'en' ? 'Task Description' : 'Maelezo ya Kazi'}</Label>
                        <Input 
                            autoFocus
                            placeholder={language === 'en' ? "E.g. Fix tail light..." : "Mf. Tengeneza taa..."}
                            value={extraFaultDescription}
                            onChange={(e) => setExtraFaultDescription(e.target.value)}
                            className="mt-2"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsAddExtraFaultOpen(false)}>{language === 'en' ? 'Cancel' : 'Ghairi'}</Button>
                        <Button 
                            disabled={!extraFaultDescription.trim() || addExtraFaultMutation.isPending}
                            onClick={() => addExtraFaultMutation.mutate()}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {addExtraFaultMutation.isPending ? (language === 'en' ? 'Adding...' : 'Inaongeza...') : (language === 'en' ? 'Add Task' : 'Ongeza')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Manage Tasks Dialog */}
            <Dialog open={isManageTasksOpen} onOpenChange={setIsManageTasksOpen}>
                <DialogContent className={`${maintenanceDebt && maintenanceDebt.length > 0 ? 'sm:max-w-[1000px]' : 'sm:max-w-[600px]'} w-[95vw] transition-all duration-300 flex flex-col max-h-[90vh]`}>
                    <DialogHeader className="flex-shrink-0">
                        <DialogTitle className="flex items-center gap-2 text-lg">
                            <Wrench className="w-6 h-6 text-indigo-600" />
                            Manage Tasks: <span className="text-slate-800 border-b border-slate-100 px-1 font-medium">{selectedJobForTasks?.vehicle?.plate_number}</span>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto py-2 space-y-4 min-h-0">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                            <div className="p-3 bg-slate-50 rounded-lg border">
                                <span className="text-slate-500 block mb-1 uppercase tracking-wider font-semibold">{language === 'en' ? 'Opened On' : 'Tarehe ya Kufunguliwa'}</span>
                                <span className="text-slate-900">{selectedJobForTasks && new Date(selectedJobForTasks.opened_at).toLocaleDateString()}</span>
                            </div>
                            <div className="p-3 bg-slate-50 rounded-lg border">
                                <span className="text-slate-500 block mb-1 uppercase tracking-wider font-semibold">{language === 'en' ? 'Priority' : 'Kipaumbele'}</span>
                                <Badge variant="outline" className={selectedJobForTasks?.priority === 'Critical' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                                    {language === 'en' ? selectedJobForTasks?.priority : (selectedJobForTasks?.priority === 'Critical' ? 'Hatari' : selectedJobForTasks?.priority === 'Urgent' ? 'Haraka' : 'Kawaida')}
                                </Badge>
                            </div>
                            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 col-span-2">
                                <span className="text-indigo-600 block mb-1 uppercase tracking-wider font-semibold flex items-center gap-2">
                                    <TrendingUp className="w-3 h-3" /> {language === 'en' ? 'Total Parts Investment' : 'Uwekezaji wa Vipuri'}
                                </span>
                                <span className="text-lg font-semibold text-indigo-900">

                                    TZS {selectedJobForTasks?.total_parts_investment?.toLocaleString() || "0"}
                                </span>
                            </div>
                        </div>



                        {/* Conditional 2-Column Workspace */}
                        <div className={`grid ${maintenanceDebt && maintenanceDebt.length > 0 ? 'md:grid-cols-2 gap-6' : 'grid-cols-1'} h-[400px]`}>
                            {/* Left Column: Current Job Faults */}
                            <div className="flex flex-col gap-3">
                                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 px-1">
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    {language === 'en' ? 'Active Job Tasks' : 'Kazi Amilifu'}
                                </h3>
                                <div className="flex-1 overflow-y-auto border rounded-xl bg-slate-50/30 p-2 space-y-4">

                                    {/* Main Vehicle */}
                                    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                                        <div className="bg-slate-50 px-3 py-1.5 border-b flex items-center gap-2">
                                            <Badge variant="outline" className="bg-white text-slate-700 border-slate-200 font-mono text-[13px] h-7 px-2.5">
                                                {getVehicleSpecificPlate(selectedJobForTasks?.vehicle)}
                                            </Badge>
                                            <div className="ml-auto flex items-center gap-2">
                                                {selectedJobForTasks?.status !== 'Closed' && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 text-[10px] text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300 font-semibold uppercase tracking-wider"
                                                        onClick={() => {
                                                            setExtraFaultTargetJobId(selectedJobForTasks.id);
                                                            setIsAddExtraFaultOpen(true);
                                                        }}
                                                    >
                                                        <Plus className="w-3 h-3 mr-1.5" /> {language === 'en' ? 'Add Task' : 'Ongeza Kazi'}
                                                    </Button>
                                                )}

                                            </div>
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
                                                                <SelectValue placeholder={language === 'en' ? "Assign Mechanic" : "Teua Mekanika"} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="unassigned" className="text-slate-400 italic">{language === 'en' ? 'Unassigned' : 'Hajapangiwa'}</SelectItem>
                                                                {(personnel || []).map((p: any) => (
                                                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <Select value={f.status} onValueChange={(val) => updateFaultStatusMutation.mutate({ faultId: f.id, status: val })}>
                                                            <SelectTrigger className={`h-7 text-[10px] w-32 font-semibold ${f.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' : f.status === 'Partial' ? 'bg-amber-50 text-amber-700 border-amber-200' : f.status === 'Not Repaired' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                                                <SelectValue />
                                                            </SelectTrigger>

                                                            <SelectContent>
                                                                <SelectItem value="Pending">{language === 'en' ? 'Pending' : 'Inasubiri'}</SelectItem>
                                                                <SelectItem value="In Progress">{language === 'en' ? 'In Progress' : 'Inaendelea'}</SelectItem>
                                                                <SelectItem value="Partial">{language === 'en' ? 'Partial Repair' : 'Kiasi'}</SelectItem>
                                                                <SelectItem value="Not Repaired">{language === 'en' ? 'Not Repaired' : 'Haikutengenezwa'}</SelectItem>
                                                                <SelectItem value="Completed">{language === 'en' ? 'Completed' : 'Ilikamilika'}</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                            )) : <div className="p-4 text-center text-xs text-muted-foreground italic">{language === 'en' ? 'No faults logged' : 'Hakuna hitilafu zilizoandikwa'}</div>}

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
                                                <div className="ml-auto flex items-center gap-2">
                                                    {partnerJob.status !== 'Closed' && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-[10px] text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300 font-semibold uppercase tracking-wider"
                                                            onClick={() => {
                                                                setExtraFaultTargetJobId(partnerJob.id);
                                                                setIsAddExtraFaultOpen(true);
                                                            }}
                                                        >
                                                            <Plus className="w-3 h-3 mr-1.5" /> {language === 'en' ? 'Add Task' : 'Ongeza Kazi'}
                                                        </Button>
                                                    )}

                                                </div>
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
                                                                    <SelectValue placeholder={language === 'en' ? "Assign Mechanic" : "Teua Mekanika"} />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="unassigned" className="text-slate-400 italic">{language === 'en' ? 'Unassigned' : 'Hajapangiwa'}</SelectItem>
                                                                    {(personnel || []).map((p: any) => (
                                                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            <Select value={f.status} onValueChange={(val) => updateFaultStatusMutation.mutate({ faultId: f.id, status: val })}>
                                                                <SelectTrigger className={`h-7 text-[10px] w-32 font-semibold ${f.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' : f.status === 'Partial' ? 'bg-amber-50 text-amber-700 border-amber-200' : f.status === 'Not Repaired' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                                                    <SelectValue />
                                                                </SelectTrigger>

                                                                <SelectContent>
                                                                    <SelectItem value="Pending">{language === 'en' ? 'Pending' : 'Inasubiri'}</SelectItem>
                                                                    <SelectItem value="In Progress">{language === 'en' ? 'In Progress' : 'Inaendelea'}</SelectItem>
                                                                    <SelectItem value="Partial">{language === 'en' ? 'Partial Repair' : 'Kiasi'}</SelectItem>
                                                                    <SelectItem value="Not Repaired">{language === 'en' ? 'Not Repaired' : 'Haikutengenezwa'}</SelectItem>
                                                                    <SelectItem value="Completed">{language === 'en' ? 'Completed' : 'Ilikamilika'}</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>
                                                )) : <div className="p-4 text-center text-xs text-muted-foreground italic">{language === 'en' ? 'No faults logged' : 'Hakuna hitilafu zilizoandikwa'}</div>}

                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Column: Carry-over Repairs (Conditional) */}
                            {maintenanceDebt && maintenanceDebt.length > 0 && (
                                <div className="flex flex-col gap-3">
                                    <h3 className="text-sm font-semibold text-amber-700 flex items-center gap-2 px-1 underline decoration-amber-200 underline-offset-4">
                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                        {language === 'en' ? 'Carry-over Repairs' : 'Matengenezo yaliyobaki'}
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
                                                                {age}{language === 'en' ? 'd old' : 'siku'}
                                                            </Badge>

                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] text-amber-600 font-medium">
                                                            <Truck className="w-3 h-3" />
                                                            <span>{f.job?.vehicle?.vehicle_no || f.job?.vehicle?.horse_number || f.job?.vehicle?.trailer_number}</span>
                                                            <span className="opacity-50">•</span>
                                                            <span>{language === 'en' ? 'Logged' : 'Iliandikwa'} {new Date(f.created_at).toLocaleDateString()}</span>
                                                        </div>

                                                    </div>
                                                    <Select value={f.status} onValueChange={(val) => updateFaultStatusMutation.mutate({ faultId: f.id, status: val })}>
                                                        <SelectTrigger className={`h-8 text-[10px] w-32 font-semibold ${f.status === 'Partial' ? 'bg-amber-50 text-amber-700 border-amber-200' : f.status === 'Not Repaired' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                                            <SelectValue />
                                                        </SelectTrigger>

                                                        <SelectContent>
                                                            <SelectItem value="Partial">{language === 'en' ? 'Partial Repair' : 'Kiasi'}</SelectItem>
                                                            <SelectItem value="Not Repaired">{language === 'en' ? 'Not Repaired' : 'Haikutengenezwa'}</SelectItem>
                                                            <SelectItem value="Completed">{language === 'en' ? 'Completed' : 'Ilikamilika'}</SelectItem>
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

                    <DialogFooter className="flex-shrink-0 bg-slate-50 -mx-6 -mb-6 p-6 rounded-b-lg border-t gap-2 sm:justify-between items-center">
                        <div className="flex items-center gap-2">
                            {allTaskFaults.every((f: any) => ['Completed', 'Partial', 'Not Repaired'].includes(f.status)) ? (
                                <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                                    <CheckCircle2 className="w-4 h-4" /> {language === 'en' ? 'READY FOR RELEASE' : 'TAYARI KURUHUSIWA'}
                                </span>
                            ) : (
                                <span className="text-xs font-semibold text-slate-400">
                                    {allTaskFaults.filter((f: any) => ['Completed', 'Partial', 'Not Repaired'].includes(f.status)).length} / {allTaskFaults.length} {language === 'en' ? 'TASKS DONE' : 'KAZI ZIMEKAMILIKA'}
                                </span>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setIsManageTasksOpen(false)}>{language === 'en' ? 'Close' : 'Funga'}</Button>
                            <Button
                                disabled={!allTaskFaults.every((f: any) => ['Completed', 'Partial', 'Not Repaired'].includes(f.status)) || releaseVehicleMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-medium"
                                onClick={handleReleaseClick}
                            >
                                {releaseVehicleMutation.isPending ? (language === 'en' ? "Releasing..." : "Kuruhusu...") : <><Truck className="w-4 h-4" /> {language === 'en' ? 'Release Vehicle' : 'Ruhusu Gari'}</>}
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
                            {language === 'en' ? 'Partial Release - Approval Required' : 'Ruhusa ya Sehemu - Idhini Inahitajika'}
                        </DialogTitle>
                    </DialogHeader>


                    <div className="py-4 space-y-6">
                        {/* Release Summary */}
                        <div className="bg-slate-50 p-4 rounded-lg border">
                            <h3 className="text-sm font-semibold text-slate-700 mb-3">{language === 'en' ? 'Release Summary:' : 'Muhtasari wa Ruhusa:'} {jobToRelease?.vehicle?.plate_number}</h3>

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
                                        <span className={`ml-auto text-xs font-semibold ${f.status === 'Completed' ? 'text-green-600' :
                                            f.status === 'Partial' ? 'text-amber-600' :
                                                'text-red-600'
                                            }`}>
                                            {f.status === 'Partial' ? (language === 'en' ? 'Partial Repair' : 'Ukarabati wa Kiasi') : (language === 'en' ? f.status : (f.status === 'Completed' ? 'Ilikamilika' : 'Haikutengenezwa'))}
                                        </span>

                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 pt-4 border-t">
                                <div className="text-sm font-semibold text-slate-700">

                                    {language === 'en' ? 'Status:' : 'Hali:'} {jobToRelease?.fault_list?.filter((f: any) => f.status === 'Completed').length} {language === 'en' ? 'Completed' : 'Zilizokamilika'},{' '}
                                    {jobToRelease?.fault_list?.filter((f: any) => f.status === 'Partial').length} {language === 'en' ? 'Partial' : 'Kiasi'},{' '}
                                    {jobToRelease?.fault_list?.filter((f: any) => f.status === 'Not Repaired').length} {language === 'en' ? 'Not Repaired' : 'Haikutengenezwa'}
                                </div>
                            </div>
                        </div>


                        {/* Warning Message */}
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                                <div className="flex-1">
                                    <h4 className="font-semibold text-amber-900 mb-1">{language === 'en' ? 'Partial Release Requires Approval' : 'Ruhusa ya Sehemu Inahitaji Idhini'}</h4>

                                    <p className="text-sm text-amber-800">
                                        {language === 'en' ? 'This vehicle has pending repairs. Head of Mechanics approval is REQUIRED to release with incomplete work.' : 'Gari hili lina matengenezo yanayosubiri. Idhini ya Mkuu wa Mafundi inahitajika ili kuruhusu kazi isiyokamilika.'}
                                    </p>
                                </div>
                            </div>
                        </div>


                        {/* Approval Note - MANDATORY */}
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                                {language === 'en' ? 'Head of Mechanics Approval Note' : 'Maelezo ya Idhini ya Mkuu wa Mafundi'} <span className="text-red-600">*</span>
                            </Label>

                            <Textarea
                                placeholder={language === 'en' ? "Explain why vehicle is being released with pending repairs. Include follow-up plan, parts status, safety assessment, etc." : "Eleza kwa nini gari linaruhusiwa likiwa na matengenezo yanayosubiri. Jumuisha mpango wa ufuatiliaji, hali ya vipuri, tathmini ya usalama, n.k."}
                                value={approvalNotes}
                                onChange={(e) => setApprovalNotes(e.target.value)}
                                className="min-h-[100px]"
                                required
                            />

                            <p className="text-xs text-slate-500">{language === 'en' ? 'This note will be visible to the Logistics team and recorded in vehicle history.' : 'Maelezo haya yataonekana kwa timu ya Usafirishaji na kurekodiwa kwenye historia ya gari.'}</p>

                        </div>

                        {/* Release Notes - Optional */}
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-slate-700">{language === 'en' ? 'Release Notes (Optional)' : 'Maelezo ya Ruhusa (Hiari)'}</Label>

                            <Textarea
                                placeholder={language === 'en' ? "Additional notes about the release, operational limitations, etc." : "Maelezo ya ziada kuhusu ruhusa, mapungufu ya kiutendaji, n.k."}

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
                            {language === 'en' ? 'Cancel' : 'Ghairi'}
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
                            {releaseVehicleMutation.isPending ? (language === 'en' ? "Releasing..." : "Kuruhusu...") : (language === 'en' ? "Approve & Release Vehicle" : "Idhinisha na Ruhusu Gari")}
                        </Button>

                    </DialogFooter>
                </DialogContent>
            </Dialog >

            {/* NEW: Digital Quality Check Dialog */}
            < Dialog open={isQualityCheckOpen} onOpenChange={setIsQualityCheckOpen} >
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-green-700">
                            <ClipboardCheck className="w-5 h-5" />
                            {language === 'en' ? 'Digital Quality Verification' : 'Uhakiki wa Ubora wa Kidijitali'}
                        </DialogTitle>

                    </DialogHeader>

                    <div className="py-4 space-y-6">
                        <div className="p-4 bg-green-50 border border-green-100 rounded-lg text-sm text-green-800">
                            <strong>{language === 'en' ? 'Verification Required:' : 'Uhakiki Unahitajika:'}</strong> {language === 'en' ? 'Please confirm that the following quality checks have been performed before releasing vehicle' : 'Tafadhali thibitisha kuwa uhakiki ufuatao wa ubora umefanywa kabla ya kuruhusu gari'} <strong>{selectedJobForTasks?.vehicle?.plate_number}</strong>.
                        </div>


                        <div className="space-y-4">
                            <div
                                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                                onClick={() => setQualityCheckAnswers(prev => ({ ...prev, work_verified: !prev.work_verified }))}
                            >
                                <div className={`mt-0.5 h-5 w-5 rounded border flex items-center justify-center transition-colors ${qualityCheckAnswers.work_verified ? 'bg-green-600 border-green-600' : 'bg-white border-slate-300'}`}>
                                    {qualityCheckAnswers.work_verified && <CheckCircle2 className="w-3 h-3 text-white" />}
                                </div>
                                <span className="text-sm font-medium text-slate-700">
                                    {language === 'en' ? 'All requested repairs have been satisfactorily completed.' : 'Matengenezo yote yaliyoombwa yamekamilika kwa kuridhisha.'}
                                </span>
                            </div>

                            <div
                                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                                onClick={() => setQualityCheckAnswers(prev => ({ ...prev, safety_verified: !prev.safety_verified }))}
                            >
                                <div className={`mt-0.5 h-5 w-5 rounded border flex items-center justify-center transition-colors ${qualityCheckAnswers.safety_verified ? 'bg-green-600 border-green-600' : 'bg-white border-slate-300'}`}>
                                    {qualityCheckAnswers.safety_verified && <CheckCircle2 className="w-3 h-3 text-white" />}
                                </div>
                                <span className="text-sm font-medium text-slate-700">
                                    {language === 'en' ? 'Vehicle is safe for operation and released back to logistics.' : 'Gari liko salama kwa matumizi na linaruhusiwa kurudi kwenye usafirishaji.'}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-slate-700">{language === 'en' ? 'Additional Verification Notes (Optional)' : 'Maelezo ya Uhakiki wa Ziada (Hiari)'}</Label>

                            <Textarea
                                placeholder={language === 'en' ? "Any final remarks from the supervisor..." : "Maelezo yoyote ya mwisho kutoka kwa msimamizi..."}

                                value={releaseNotes}
                                onChange={(e) => setReleaseNotes(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsQualityCheckOpen(false)}>{language === 'en' ? 'Back' : 'Rudi'}</Button>

                        <Button
                            disabled={
                                !qualityCheckAnswers.work_verified || !qualityCheckAnswers.safety_verified ||
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
                            {releaseVehicleMutation.isPending ? (language === 'en' ? "Processing..." : "Inachakata...") : (language === 'en' ? "Verify & Release Vehicle" : "Hakiki na Ruhusu Gari")}
                        </Button>

                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* NEW: Rejection Reason Dialog */}
            <Dialog open={isRejectionDialogOpen} onOpenChange={setIsRejectionDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-rose-600 flex items-center gap-2">
                            <XCircle className="w-5 h-5" />
                            {language === 'en' ? 'Reject Issuance' : 'Kataa Kutolewa'}
                        </DialogTitle>
                        <DialogDescription>
                            {language === 'en' ? 'Please provide a reason for rejecting this issuance request.' : 'Tafadhali toa sababu ya kukataa maombi haya ya kutolewa.'}
                        </DialogDescription>

                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                            <div className="text-[10px] font-semibold text-slate-400 uppercase mb-1">{language === 'en' ? 'Item Details' : 'Maelezo ya Kifaa'}</div>
                            <div className="text-sm font-semibold text-slate-700">{selectedUsageToApprove?.item_name}</div>
                            <div className="text-xs text-slate-500">{language === 'en' ? 'Requested Qty:' : 'Idadi Iliyoombwa:'} {selectedUsageToApprove?.quantity_used}</div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-slate-500 uppercase">{language === 'en' ? 'Rejection Reason' : 'Sababu ya Kukataa'}</Label>

                            <Textarea
                                placeholder={language === 'en' ? "e.g. Wrong part selected, Excess quantity requested..." : "mfano: Kifaa kibaya kimechaguliwa, Idadi kubwa imeombwa..."}
                                value={rejectionNotes}
                                onChange={(e) => setRejectionNotes(e.target.value)}
                                className="min-h-[100px]"
                            />
                        </div>

                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRejectionDialogOpen(false)}>{language === 'en' ? 'Cancel' : 'Ghairi'}</Button>
                        <Button
                            className="bg-rose-600 hover:bg-rose-700 text-white"
                            disabled={!rejectionNotes.trim() || approveIssuanceMutation.isPending}
                            onClick={() => {
                                approveIssuanceMutation.mutate({
                                    id: selectedUsageToApprove.id,
                                    status: 'Rejected',
                                    notes: rejectionNotes
                                }, {
                                    onSuccess: () => {
                                        setIsRejectionDialogOpen(false);
                                        setRejectionNotes("");
                                        setSelectedUsageToApprove(null);
                                    }
                                });
                            }}
                        >
                            {approveIssuanceMutation.isPending ? (language === 'en' ? "Rejecting..." : "Inakataa...") : (language === 'en' ? "Confirm Rejection" : "Thibitisha Kukataa")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >


            {/* NEW: Adjust Quantity Dialog */}
            < Dialog open={isAdjustQtyOpen} onOpenChange={setIsAdjustQtyOpen} >
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="text-indigo-600 flex items-center gap-2">
                            <Wrench className="w-5 h-5" />
                            {language === 'en' ? 'Adjust Issuance Quantity' : 'Rekebisha Idadi ya Matoleo'}
                        </DialogTitle>
                        <DialogDescription>
                            {language === 'en' ? 'Review or reduce the quantity before final approval.' : 'Hakiki au punguza idadi kabla ya idhini ya mwisho.'}
                        </DialogDescription>

                    </DialogHeader>
                    <div className="py-6 space-y-6">
                        <div className="flex flex-col items-center justify-center p-8 bg-indigo-50/30 rounded-2xl border-2 border-dashed border-indigo-100">
                            <Label className="text-xs font-semibold text-indigo-400 uppercase mb-4 tracking-widest">Approved Quantity</Label>
                            <div className="flex items-center gap-6">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-12 w-12 rounded-full border-indigo-200 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                    onClick={() => setAdjustedQty(Math.max(1, adjustedQty - 1))}
                                >
                                    <Minus className="w-6 h-6" />
                                </Button>
                                <div className="text-5xl font-semibold text-indigo-600 font-mono tracking-tighter w-20 text-center">

                                    {adjustedQty}
                                </div>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-12 w-12 rounded-full border-indigo-200 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                    onClick={() => setAdjustedQty(adjustedQty + 1)}
                                >
                                    <Plus className="w-6 h-6" />
                                </Button>
                            </div>

                            <div className="mt-4 text-[10px] font-medium text-indigo-400 italic">
                                {language === 'en' ? 'Original Request:' : 'Maombi ya Awali:'} {selectedUsageToApprove?.quantity_used} {language === 'en' ? 'units' : 'vipande'}
                            </div>

                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAdjustQtyOpen(false)}>{language === 'en' ? 'Cancel' : 'Ghairi'}</Button>

                        <Button
                            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg"
                            disabled={approveIssuanceMutation.isPending}
                            onClick={() => {
                                approveIssuanceMutation.mutate({
                                    id: selectedUsageToApprove.id,
                                    status: 'Approved',
                                    quantity: adjustedQty
                                }, {
                                    onSuccess: () => {
                                        setIsAdjustQtyOpen(false);
                                        setSelectedUsageToApprove(null);
                                    }
                                });
                            }}
                        >
                            {approveIssuanceMutation.isPending ? (language === 'en' ? "Approving..." : "Inaidhinisha...") : (language === 'en' ? "Approve & Adjust Stock" : "Idhinisha na Rekebisha Stoo")}
                        </Button>

                    </DialogFooter>
                </DialogContent>
            </Dialog >
        </div >
    );
};


export default GarageDashboard;
