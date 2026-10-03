import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
    Plus, Search, Truck, Globe, Printer, Eye, FileText,
    RefreshCw, BarChart3, CalendarDays, MapPin, AlertTriangle,
    CheckCircle2, X, Edit2, ChevronDown, ChevronRight, Folders, ArrowRight, Save, FileUp, User, Package, Phone, RefreshCcw,
    Building2, ChevronsUpDown, Check, Trash2, Clock, Navigation
} from "lucide-react";

import { format, differenceInDays, formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (d: any) => d ? format(new Date(d), "dd MMM yy") : "—";
const daysBetween = (a: any, b: any): number | null => {
    if (!a || !b) return null;
    return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
};

const computeLiveCycle = (t: any): number | null => {
    const start = t.arrival_loading_date || t.loading_date || t.dispatch_date;
    if (!start) return null;
    
    if (t.hq_arrival_date) return daysBetween(start, t.hq_arrival_date);
    
    const dates = [
        t.offloading_date,
        t.arrive_offloading_site_date,
        t.borders_data?.[2]?.departure,
        t.borders_data?.[2]?.arrival,
        t.borders_data?.[1]?.departure,
        t.borders_data?.[1]?.arrival,
        t.borders_data?.[0]?.departure,
        t.borders_data?.[0]?.arrival,
        t.checkpoint_3_departure_date,
        t.checkpoint_3_arrival_date,
        t.checkpoint_2_departure_date,
        t.checkpoint_2_arrival_date,
        t.checkpoint_1_departure_date,
        t.checkpoint_1_arrival_date,
        t.dispatch_date,
        t.loading_date,
        t.arrival_loading_date
    ].filter(d => !!d);
    
    if (dates.length === 0) return null;
    dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return daysBetween(start, dates[0]);
};

const TRANSIT_STATUSES = ["Positioning", "Loading", "Dispatched", "Checkpoint 1", "Checkpoint 2", "Checkpoint 3", "In Transit", "Offloading", "Completed", "Cancelled"] as const;

type TransitStatus = typeof TRANSIT_STATUSES[number];

const statusColor: Record<TransitStatus, string> = {
    Positioning: "bg-slate-100 text-slate-800 border-slate-300",
    Loading: "bg-amber-100 text-amber-800 border-amber-300",
    Dispatched: "bg-blue-100 text-blue-800 border-blue-300",
    "Checkpoint 1": "bg-indigo-100 text-indigo-800 border-indigo-300",
    "Checkpoint 2": "bg-violet-100 text-violet-800 border-violet-300",
    "Checkpoint 3": "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
    "In Transit": "bg-cyan-100 text-cyan-800 border-cyan-300",
    Offloading: "bg-orange-100 text-orange-800 border-orange-300",
    Completed: "bg-emerald-100 text-emerald-800 border-emerald-300",
    Cancelled: "bg-red-100 text-red-800 border-red-300",
};

// Default empty form
const emptyForm = () => ({
    truck_no: "",
    trailer_no: "",
    driver_name: "",
    license_no: "",
    passport_no: "",
    contact_no: "",
    location: "",
    bl_number: "",
    container_no: "",
    cargo: "",
    status: "Positioning" as TransitStatus,
    destination: "",
    arrival_loading_date: "",
    loading_date: "",
    dispatch_date: "",
    checkpoint_1_name: "",
    checkpoint_1_arrival_date: "",
    checkpoint_1_departure_date: "",
    checkpoint_2_name: "",
    checkpoint_2_arrival_date: "",
    checkpoint_2_departure_date: "",
    checkpoint_3_name: "",
    checkpoint_3_arrival_date: "",
    checkpoint_3_departure_date: "",
    borders: [] as { name: string; arrival: string; departure: string }[],
    hq_arrival_date: "",
    standing_charges: "",
    arrive_offloading_site_date: "",
    offloading_date: "",
    departure_from_site_date: "",
    return_borders: [] as { name: string; arrival: string; crossing: string; departure: string }[],
    selected_vehicle_id: "",
    leg_type: "G" as "G" | "R",
    source_sheet_id: "",
    trip_number: "",
    invoice_no: "",
    return_invoice_no: "",
    return_revenue_amount: "",
    return_invoice_date: "",
    client_name: "",
    nature: "Go & Return",
});

// ─── Main Component ────────────────────────────────────────────────────────────
const TransitDashboard = () => {
    const { toast } = useToast();
    const qc = useQueryClient();
    const navigate = useNavigate();

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("All");
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingTrip, setEditingTrip] = useState<any>(null);
    const [selectedTripDetails, setSelectedTripDetails] = useState<any>(null);
    const [form, setForm] = useState(emptyForm());
    const [selectedSheetIds, setSelectedSheetIds] = useState<string[]>([]);
    const [expandedClients, setExpandedClients] = useState<string[]>([]);
    const [collapsedRoutes, setCollapsedRoutes] = useState<Record<string, boolean>>({});
    const [collapsedClients, setCollapsedClients] = useState<Record<string, boolean>>({});
    const [locationUpdateTrip, setLocationUpdateTrip] = useState<any>(null);
    const [locationInput, setLocationInput] = useState("");
    const [reasonInput, setReasonInput] = useState("");

    const toggleRouteCollapse = (key: string) => {
        setCollapsedRoutes(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleClientCollapse = (key: string) => {
        setCollapsedClients(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const [yearFilter, setYearFilter] = useState("All");
    const [activeTab, setActiveTab] = useState<"ALL" | "OUTBOUND" | "BACKLOAD" | "TANKERS" | "ARCHIVE">("ALL");

    // We will define STANDARD_DESTINATIONS after fetching routeTemplates

    // Fetch clients registry
    const { data: clientsList = [], refetch: refetchClients } = useQuery({
        queryKey: ["logistics-clients"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_clients")
                .select("*")
                .order("name", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    const [newClientName, setNewClientName] = useState("");
    const [isAddingClient, setIsAddingClient] = useState(false);

    const handleAddClient = async () => {
        if (!newClientName.trim()) return;
        setIsAddingClient(true);
        try {
            const { data, error } = await supabase
                .from("logistics_clients")
                .insert([{ name: newClientName.trim() }])
                .select();
            if (error) throw error;
            toast({
                title: "Client Added",
                description: `Successfully added "${newClientName}" to the registry.`
            });
            setNewClientName("");
            refetchClients();
            setForm(prev => ({ ...prev, client_name: newClientName.trim() }));
        } catch (err: any) {
            toast({
                variant: "destructive",
                title: "Error adding client",
                description: err.message
            });
        } finally {
            setIsAddingClient(false);
        }
    };

    // ─── Fetch Data ───────────────────────────────────────────────────────────
    const { data: fleet = [] } = useQuery({
        queryKey: ["fleet_for_transit"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_fleet" as any)
                .select("id, vehicle_no, asset_type")
                .eq("fleet_category", "Transit")
                .eq("is_active", true);
            return (data || []) as any[];
        }
    });

    const { data: approvedTrips = [] } = useQuery({
        queryKey: ["approved_trip_sheets"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_trip_sheets" as any)
                .select("*, vehicle:vehicle_id(vehicle_no, asset_type), trailer:trailer_id(vehicle_no, trailer_number), driver:driver_id(full_name, license_no, id_number)")
                .eq("status", "Approved")
                .order("created_at", { ascending: false });
            if (error) console.error("Error fetching approved trips:", error);
            return (data || []) as any[];
        }
    });

    const { data: routeTemplates = [] } = useQuery({
        queryKey: ["logistics_route_templates"],
        queryFn: async () => {
            const { data } = await supabase.from("logistics_route_templates" as any).select("*").order("route_name");
            return (data || []) as any[];
        }
    });

    const STANDARD_DESTINATIONS = Array.from(new Set([
        "CCSA", "CHAMBISHI", "CHINGOLA", "CHIPATA", "CIKO MINING", 
        "DAR ES SALAAM", "KABWE", "KALULUSHI", "KAMBOVE", "LUSAKA", 
        "LUSAKA / CHAMBISHI", "NDOLA",
        ...routeTemplates.map(rt => rt.destination).filter(Boolean)
    ])).sort();

    const { data: trips = [], isLoading, isError, error: tripsError } = useQuery({
        queryKey: ["transit_trips", yearFilter, statusFilter],
        queryFn: async () => {
            let q = supabase
                .from("logistics_transit_trips" as any)
                .select("*")
                .order("created_at", { ascending: false });
            if (statusFilter !== "All") q = q.eq("status", statusFilter);
            const { data, error } = await q;
            if (error) {
                console.error("TRANSIT TRIPS FETCH ERROR:", error);
                throw error;
            }
            return (data || []) as any[];
        }
    });

    // ─── Logic ───────────────────────────────────────────────────────────────
    const isTankerTrip = (item: any) => {
        if (!item) return false;
        if (item.is_tanker) return true;
        const n = (item.nature || item.journey_type || "").toLowerCase();
        return n.includes("alone") || n.includes("only") || n.includes("empty") || n.includes("tanker");
    };

    const generateTripId = (truckNo: string, legType: "G" | "R"): string => {
        const CODE = "2025";
        const cleanTruck = truckNo.replace(/\s*[A-Z]+$/, "").trim();
        const seq = String(trips.length + 1).padStart(3, "0");
        return `${cleanTruck}/${CODE}/${legType}${seq}`;
    };

    const buildPayload = (data: any, tripSheet?: any) => {
        const src = tripSheet || data;
        const truckNo = tripSheet ? (tripSheet.vehicle?.vehicle_no || "") : (fleet.find((f: any) => f.id === data.selected_vehicle_id)?.vehicle_no || data.truck_no);
        // Use reference_number from trip sheet as trip_id when available, otherwise keep existing trip_id
        const tripId = tripSheet
            ? (tripSheet.reference_number || generateTripId(truckNo, data.leg_type))
            : (data.trip_id || data.reference_number || generateTripId(truckNo, data.leg_type));

        return {
            client_name: (tripSheet?.client_name || data.client_name) || null,
            truck_no: truckNo,
            trailer_no: (tripSheet?.trailer?.vehicle_no || tripSheet?.trailer?.trailer_number || data.trailer_no) || null,
            trip_id: tripId,
            driver_name: (tripSheet?.driver?.full_name || data.driver_name) || null,
            status: data.status,
            destination: data.destination || null,
            arrival_loading_date: data.arrival_loading_date || null,
            loading_date: data.loading_date || null,
            dispatch_date: data.dispatch_date || null,
            checkpoint_1_name: data.borders?.[0]?.name || null,
            checkpoint_1_arrival_date: data.borders?.[0]?.arrival || null,
            checkpoint_1_departure_date: data.borders?.[0]?.departure || null,
            days_at_checkpoint_1: daysBetween(data.borders?.[0]?.arrival, data.borders?.[0]?.departure),
            checkpoint_2_name: data.borders?.[1]?.name || null,
            checkpoint_2_arrival_date: data.borders?.[1]?.arrival || null,
            checkpoint_2_departure_date: data.borders?.[1]?.departure || null,
            days_at_checkpoint_2: daysBetween(data.borders?.[1]?.arrival, data.borders?.[1]?.departure),
            checkpoint_3_name: data.borders?.[2]?.name || null,
            checkpoint_3_arrival_date: data.borders?.[2]?.arrival || null,
            checkpoint_3_departure_date: data.borders?.[2]?.departure || null,
            days_at_checkpoint_3: daysBetween(data.borders?.[2]?.arrival, data.borders?.[2]?.departure),
            hq_arrival_date: data.hq_arrival_date || null,
            standing_charges: Number(data.standing_charges) || 0,
            arrive_offloading_site_date: data.arrive_offloading_site_date || null,
            offloading_date: data.offloading_date || null,
            departure_from_site_date: data.departure_from_site_date || null,
            return_borders_data: data.return_borders || [],
            leg_type: data.leg_type,
            nature: (tripSheet?.journey_type || data.nature) || null,
            trip_sheet_id: (tripSheet?.id || data.source_sheet_id) || null,
            total_trip_days: computeLiveCycle(data),
            contact_no: data.contact_no || null,
            passport_no: (tripSheet?.driver?.id_number || data.passport_no) || null,
            license_no: (tripSheet?.driver?.license_no || data.license_no) || null,
            location: data.location || null,
            bl_number: (tripSheet?.bl_number || data.bl_number) || null,
            container_no: (tripSheet?.container_no || data.container_no) || null,
            borders_data: data.borders || [],
            cargo: (tripSheet?.cargo_outbound || data.cargo) || null,
            invoice_no: (tripSheet?.invoice_no || data.invoice_no) || null,
            reference_number: (tripSheet?.reference_number || data.trip_number) || null,
        };
    };

    const saveMutation = useMutation({
        mutationFn: async (data: any) => {
            if (editingTrip) {
                // Single update (editing existing trip)
                const payload = buildPayload(data);
                const { error } = await supabase.from("logistics_transit_trips" as any).update(payload).eq("id", editingTrip.id);
                if (error) throw error;
            } else if (selectedSheetIds.length > 1) {
                // Bulk insert — one transit trip per selected trip sheet
                const payloads = selectedSheetIds.map(sheetId => {
                    const tripSheet = approvedTrips.find(x => x.id === sheetId);
                    return buildPayload(data, tripSheet);
                });
                const { error } = await supabase.from("logistics_transit_trips" as any).insert(payloads);
                if (error) throw error;
            } else {
                // Single insert
                const payload = buildPayload(data);
                const { error } = await supabase.from("logistics_transit_trips" as any).insert([payload]);
                if (error) throw error;
            }
        },
        onSuccess: async (_, vars) => {
            // Mark all selected trip sheets as Active
            if (!editingTrip) {
                const sheetIdsToActivate = selectedSheetIds.length > 0 ? selectedSheetIds : (vars.source_sheet_id ? [vars.source_sheet_id] : []);
                for (const sheetId of sheetIdsToActivate) {
                    await supabase.from("logistics_trip_sheets" as any).update({ status: "Active", activated_at: new Date().toISOString() }).eq("id", sheetId);
                }
                if (sheetIdsToActivate.length > 0) {
                    qc.invalidateQueries({ queryKey: ["approved_trip_sheets"] });
                }
            }
            
            // Sync return invoice + revenue amount + date back to the original trip sheet when saving a Return leg
            if (vars.leg_type === "R" && (vars.return_invoice_no || vars.return_revenue_amount || vars.return_invoice_date)) {
                const tripSheetId = vars.source_sheet_id || (vars as any).trip_sheet_id;
                if (tripSheetId) {
                    const syncPayload: any = {};
                    if (vars.return_invoice_no) syncPayload.return_invoice_no = vars.return_invoice_no;
                    if (vars.return_invoice_date) syncPayload.return_invoice_date = vars.return_invoice_date;
                    if (vars.return_revenue_amount) {
                        syncPayload.return_revenue_amount = parseFloat(vars.return_revenue_amount);
                        syncPayload.return_revenue_currency = "USD";
                    }
                    await supabase.from("logistics_trip_sheets" as any).update(syncPayload).eq("id", tripSheetId);
                    qc.invalidateQueries({ queryKey: ["approved_trip_sheets"] });
                    qc.invalidateQueries({ queryKey: ["trip_sheet"] });
                }
            }

            qc.invalidateQueries({ queryKey: ["transit_trips"] });
            setIsFormOpen(false);
            setEditingTrip(null);
            setForm(emptyForm());
            setSelectedSheetIds([]);
            toast({ title: "Success", description: selectedSheetIds.length > 1 ? `${selectedSheetIds.length} transit assets deployed successfully.` : "Record saved successfully." });
        },
        onError: (error: any) => {
            toast({ title: "Error Saving", description: error.message || "Failed to save record.", variant: "destructive" });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => { await supabase.from("logistics_transit_trips" as any).delete().eq("id", id); },
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["transit_trips"] }); toast({ title: "Deleted" }); }
    });

    // ─── Location Updates ──────────────────────────────────────────────────────
    const { data: locationUpdates = [] } = useQuery({
        queryKey: ["trip_location_updates"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("trip_location_updates" as any)
                .select("*")
                .order("created_at", { ascending: false });
            if (error) {
                console.warn("Location updates table may not exist yet:", error.message);
                return [];
            }
            return (data || []) as any[];
        }
    });

    const getLatestLocation = (tripId: string) => {
        return locationUpdates.find((u: any) => u.trip_id === tripId);
    };

    const getTripLocationHistory = (tripId: string) => {
        return locationUpdates.filter((u: any) => u.trip_id === tripId);
    };

    const locationMutation = useMutation({
        mutationFn: async ({ tripId, location, reason }: { tripId: string; location: string; reason?: string }) => {
            const { error } = await supabase
                .from("trip_location_updates" as any)
                .insert([{ trip_id: tripId, location, reason: reason || null }]);
            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["trip_location_updates"] });
            setLocationInput("");
            setReasonInput("");
            toast({ title: "📍 Location Updated", description: "Vehicle location has been recorded." });
        },
        onError: (error: any) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    });

    // ─── Grouped & Filtered trips ──────────────────────────────────────────────
    const filtered = trips.filter((t: any) => {
        const matchesSearch = !search || 
            (t.truck_no?.toLowerCase().includes(search.toLowerCase()) ||
             t.trip_id?.toLowerCase().includes(search.toLowerCase()) ||
             t.reference_number?.toLowerCase().includes(search.toLowerCase()) ||
             t.driver_name?.toLowerCase().includes(search.toLowerCase()) ||
             t.destination?.toLowerCase().includes(search.toLowerCase()) ||
             t.client_name?.toLowerCase().includes(search.toLowerCase()) ||
             t.cargo?.toLowerCase().includes(search.toLowerCase()));
        
        const matchesStatus = statusFilter === "All" || t.status === statusFilter;
        
        // Tab Filtering Logic
        let matchesTab = true;
        if (activeTab === "OUTBOUND") matchesTab = t.leg_type === "G" && !t.is_tanker && t.status !== "Completed";
        else if (activeTab === "BACKLOAD") matchesTab = t.leg_type === "R" && t.status !== "Completed";
        else if (activeTab === "TANKERS") matchesTab = (t.is_tanker === true || (t.trip_id && t.trip_id.includes('/T')));
        else if (activeTab === "ARCHIVE") matchesTab = t.status === "Completed";
        else if (activeTab === "ALL") matchesTab = t.status !== "Completed"; 

        return matchesSearch && matchesStatus && matchesTab;
    });

    const groupedByClient = filtered.reduce((acc, trip) => {
        const client = trip.client_name || 'Individual / Walk-in';
        if (!acc[client]) {
            acc[client] = {
                client,
                routes: {} as Record<string, { destination: string, trips: any[] }>
            };
        }
        
        const dest = trip.destination || 'Direct Route';
        if (!acc[client].routes[dest]) {
            acc[client].routes[dest] = { destination: dest, trips: [] };
        }
        
        acc[client].routes[dest].trips.push(trip);
        return acc;
    }, {} as Record<string, { client: string, routes: Record<string, { destination: string, trips: any[] }> }>);

    const stats = {
        total: trips.length,
        active: trips.filter((t: any) => !["Completed", "Cancelled"].includes(t.status)).length,
        completed: trips.filter((t: any) => t.status === "Completed" && !(t.nature === "Go & Return" && t.leg_type === "G")).length,
        avgDays: trips.filter((t: any) => t.total_trip_days).reduce((a: number, b: any) => a + (b.total_trip_days || 0), 0) / Math.max(trips.filter((t: any) => t.total_trip_days).length, 1),
    };

    return (
        <div className="space-y-4">
            {/* Premium Sub-Navigation Tabs */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200 w-fit">
                {[
                    { id: "ALL", label: "Active Fleet", icon: Truck },
                    { id: "OUTBOUND", label: "Outbound (G)", icon: ArrowRight },
                    { id: "BACKLOAD", label: "Backload (R)", icon: RefreshCcw },
                    { id: "TANKERS", label: "Tankers (T)", icon: FileUp },
                    { id: "ARCHIVE", label: "Archive", icon: CheckCircle2 },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                            activeTab === tab.id 
                            ? "bg-white text-[#1a3a5c] shadow-sm border border-slate-200" 
                            : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                        }`}
                    >
                        <tab.icon size={13} className={activeTab === tab.id ? "text-indigo-600" : "text-slate-300"} />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: "Total Assets", value: stats.total, icon: Globe, color: "text-blue-600 bg-blue-50" },
                    { label: "Active Now", value: stats.active, icon: Truck, color: "text-amber-600 bg-amber-50" },
                    { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
                    { label: "Avg Cycle", value: stats.avgDays.toFixed(1), icon: CalendarDays, color: "text-violet-600 bg-violet-50" },
                ].map(s => (
                    <div key={s.label} className="flex items-center gap-3 p-4 rounded-2xl border bg-white shadow-sm border-slate-100">
                        <div className={`p-2.5 rounded-xl ${s.color}`}><s.icon className="w-5 h-5" /></div>
                        <div>
                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{s.label}</div>
                            <div className="text-2xl font-black text-slate-800 tracking-tighter">{s.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input placeholder="Search mission, truck, driver..." className="pl-9 h-11 bg-white text-xs rounded-xl border-slate-200 shadow-sm" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[160px] h-11 text-xs font-bold bg-white rounded-xl shadow-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All Statuses</SelectItem>
                        {TRANSIT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Button onClick={() => { setEditingTrip(null); setForm(emptyForm()); setIsFormOpen(true); }} className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl gap-2 shadow">
                    <Plus className="w-4 h-4" /> New Transit Mission
                </Button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden ring-1 ring-slate-100">
                <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-260px)] min-h-[420px] relative">
                    <table className="w-full text-[11px] border-separate border-spacing-0 min-w-[2400px]">
                        <thead className="sticky top-0 z-30 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                            <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                                <th className="sticky left-0 top-0 z-40 bg-slate-50 px-3 py-3 text-left font-semibold border-b border-r border-slate-200 w-12 min-w-[48px] max-w-[48px]">SN</th>
                                <th className="sticky left-[48px] top-0 z-40 bg-slate-50 px-3 py-3 text-left font-semibold border-b border-r border-slate-200 w-[140px] min-w-[140px] max-w-[140px]">Trip Number</th>
                                <th className="sticky left-[188px] top-0 z-40 bg-slate-50 px-3 py-3 text-left font-semibold border-b border-r border-slate-200 w-[130px] min-w-[130px] max-w-[130px]">Registration</th>
                                <th className="sticky left-[318px] top-0 z-40 bg-slate-50 px-3 py-3 text-left font-semibold border-b border-r border-slate-200 w-[120px] min-w-[120px] max-w-[120px]">Transit Status</th>
                                <th className="sticky left-[438px] top-0 z-40 bg-slate-50 px-3 py-3 text-left font-semibold border-b border-r-2 border-slate-300 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.12)] w-[140px] min-w-[140px] max-w-[140px]">Destination</th>
                                <th className="sticky top-0 z-30 bg-slate-50 px-3 py-3 text-left font-semibold border-b border-r border-slate-200">Arr. Loading</th>
                                <th className="sticky top-0 z-30 bg-slate-50 px-3 py-3 text-left font-semibold border-b border-r border-slate-200">Loading Dt</th>
                                <th className="sticky top-0 z-30 px-3 py-3 text-left font-semibold border-b border-r border-slate-200 bg-blue-50 text-blue-700">DISPATCHED</th>
                                {Array.from({ length: Math.max(3, ...trips.map(t => (t.borders_data || []).length)) }).map((_, i) => (
                                    <Fragment key={i}>
                                        <th className={`sticky top-0 z-30 px-3 py-3 text-left font-semibold border-b border-r border-slate-200 ${i === 0 ? 'bg-indigo-50 text-indigo-700' : i === 1 ? 'bg-violet-50 text-violet-700' : i === 2 ? 'bg-fuchsia-50 text-fuchsia-700' : 'bg-slate-50 text-slate-700'}`}>Border {i + 1} (Logistics)</th>
                                        <th className={`sticky top-0 z-30 px-2 py-3 text-center font-semibold border-b border-r border-slate-200 ${i === 0 ? 'bg-indigo-50 text-indigo-700' : i === 1 ? 'bg-violet-50 text-violet-700' : i === 2 ? 'bg-fuchsia-50 text-fuchsia-700' : 'bg-slate-50 text-slate-700'}`}>B{i + 1} Days</th>
                                    </Fragment>
                                ))}
                                <th className="sticky top-0 z-30 bg-slate-50 px-3 py-3 text-right font-semibold border-b border-r border-slate-200">Standing $</th>
                                <th className="sticky top-0 z-30 bg-slate-50 px-3 py-3 text-left font-semibold border-b border-r border-slate-200">Arrived Site</th>
                                <th className="sticky top-0 z-30 px-3 py-3 text-left font-semibold border-b border-r border-slate-200 bg-emerald-50 text-emerald-700 whitespace-nowrap">OFFLOADED</th>
                                <th className="sticky top-0 z-30 px-3 py-3 text-left font-semibold border-b border-r border-slate-200 bg-emerald-50 text-emerald-700">HQ Arrival</th>
                                <th className="sticky top-0 z-30 bg-slate-50 px-3 py-3 text-center font-semibold border-b border-r border-slate-200">Total Cycle</th>
                                <th className="sticky top-0 z-30 bg-slate-50 px-3 py-3 text-center font-semibold border-b border-slate-200">Manage</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={30} className="text-center py-24 text-slate-500 text-sm">Loading transit data...</td></tr>
                            ) : isError ? (
                                <tr><td colSpan={30} className="text-center py-24 text-red-500 font-bold text-sm">Error: {(tripsError as any)?.message || JSON.stringify(tripsError)}</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={30} className="text-center py-24 text-slate-400 text-sm">No active transit assets found</td></tr>
                            ) : (
                                Object.entries(groupedByClient).map(([clientName, clientGroup]: [string, any]) => {
                                    const isClientCollapsed = !!collapsedClients[clientName];
                                    return (
                                        <Fragment key={clientName}>
                                            {/* ── Client Header ────────────────────────────────── */}
                                            <tr 
                                                className="bg-slate-100 hover:bg-slate-200/70 text-slate-800 font-bold uppercase text-[11px] group cursor-pointer select-none transition-colors"
                                                onClick={() => toggleClientCollapse(clientName)}
                                            >
                                                <td colSpan={30} className="px-4 py-2 border-b border-slate-200 shadow-[inset_0_-1px_0_rgba(0,0,0,0.05)] sticky left-0 bg-slate-100 z-20">
                                                    <div className="sticky left-4 flex items-center gap-3 w-fit">
                                                        {isClientCollapsed ? (
                                                            <ChevronRight size={15} className="text-slate-500 shrink-0" />
                                                        ) : (
                                                            <ChevronDown size={15} className="text-slate-500 shrink-0" />
                                                        )}
                                                        <Folders size={16} className="text-slate-400 shrink-0" />
                                                        <span className="text-slate-500 tracking-wider">CLIENT:</span>
                                                        <span className="text-slate-800 text-sm font-black">{clientName}</span>
                                                        <Badge className="ml-3 bg-white text-slate-600 border-slate-200 text-[10px] font-semibold tracking-wider hover:bg-white">
                                                            {Object.keys(clientGroup.routes).length} ROUTES ACTIVE
                                                        </Badge>
                                                        {isClientCollapsed && (
                                                            <span className="text-[9px] font-bold text-slate-400 bg-white/80 px-2 py-0.5 rounded border border-slate-200">
                                                                COLLAPSED
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            
                                            {!isClientCollapsed && Object.entries(clientGroup.routes).map(([destName, routeGroup]: [string, any]) => {
                                                const routeKey = `${clientName}-${destName}`;
                                                const isRouteCollapsed = !!collapsedRoutes[routeKey];
                                                return (
                                                    <Fragment key={routeKey}>
                                                        {/* ── Route Header ────────────────────────────────── */}
                                                        <tr 
                                                            className="bg-slate-50/80 hover:bg-slate-100 text-slate-600 font-semibold uppercase text-[10px] group cursor-pointer select-none transition-colors border-b border-slate-100"
                                                            onClick={() => toggleRouteCollapse(routeKey)}
                                                        >
                                                            <td colSpan={30} className="px-6 py-1.5 border-b border-slate-100 sticky left-0 bg-slate-50 z-20">
                                                                <div className="sticky left-6 flex items-center gap-3 w-fit">
                                                                    <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded border border-slate-200 shadow-sm hover:border-indigo-300 transition-colors">
                                                                        {isRouteCollapsed ? (
                                                                            <ChevronRight size={13} className="text-indigo-600 shrink-0" />
                                                                        ) : (
                                                                            <ChevronDown size={13} className="text-indigo-600 shrink-0" />
                                                                        )}
                                                                        <MapPin size={12} className="text-slate-400 shrink-0" />
                                                                        <span className="text-slate-500 font-bold">ROUTE DESTINATION:</span>
                                                                        <span className="text-slate-800 font-black">{destName}</span>
                                                                        <Badge className="ml-1 bg-indigo-50 text-indigo-700 border-indigo-100 text-[9px] font-bold">
                                                                            {routeGroup.trips.length} ASSETS
                                                                        </Badge>
                                                                    </div>
                                                                    <span className="text-[9px] font-bold text-slate-400">
                                                                        {isRouteCollapsed ? "Click to expand" : "Click to collapse"}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        </tr>

                                                        {!isRouteCollapsed && routeGroup.trips.map((t: any, idx: number) => (
                                                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                                                        <td className="sticky left-0 z-20 bg-white group-hover:bg-slate-50 transition-colors px-3 py-3 text-slate-400 font-medium text-center border-r border-slate-100 w-12 min-w-[48px] max-w-[48px] group-hover:text-slate-600">{(idx + 1).toString().padStart(2, '0')}</td>
                                                        <td className="sticky left-[48px] z-20 bg-white group-hover:bg-slate-50 transition-colors px-3 py-3 font-semibold text-slate-700 whitespace-nowrap border-r border-slate-100 w-[140px] min-w-[140px] max-w-[140px]">
                                                            {t.reference_number || t.trip_id}
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${t.leg_type === "G" ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-rose-50 text-rose-600 border border-rose-100"}`}>
                                                                    {t.is_tanker ? "TKR" : t.leg_type === "G" ? "OUT" : "RTN"}
                                                                </span>
                                                                {t.nature && (
                                                                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200">
                                                                        {t.nature}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="sticky left-[188px] z-20 bg-white group-hover:bg-slate-50 transition-colors px-3 py-3 font-semibold text-slate-700 border-r border-slate-100 w-[130px] min-w-[130px] max-w-[130px] cursor-pointer hover:bg-slate-50 hover:text-indigo-600 group/cell" onClick={() => setSelectedTripDetails(t)}>
                                                            <div className="flex items-center justify-between">
                                                                <span>{t.truck_no}</span>
                                                                <Eye size={14} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 ml-2" />
                                                            </div>
                                                        </td>
                                                        <td className="sticky left-[318px] z-20 bg-white group-hover:bg-slate-50 transition-colors px-3 py-3 border-r border-slate-100 w-[120px] min-w-[120px] max-w-[120px]">
                                                            <Badge className={`text-[10px] font-semibold px-2 py-0.5 border shadow-none ${statusColor[t.status as TransitStatus] || "bg-slate-100 text-slate-600"}`}>
                                                                {t.status}
                                                            </Badge>
                                                            {t.status === "In Transit" && isTankerTrip(t) && (
                                                                t.departure_from_site_date ? (
                                                                    <div className="flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-black w-fit shadow-[0_0_8px_rgba(245,158,11,0.25)]">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_#f59e0b] animate-pulse" />
                                                                        Returning
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-black w-fit shadow-[0_0_8px_rgba(16,185,129,0.25)]">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981] animate-pulse" />
                                                                        Going
                                                                    </div>
                                                                )
                                                            )}
                                                            {/* Current Location Indicator */}
                                                            {(() => {
                                                                const latestLoc = getLatestLocation(t.id);
                                                                return latestLoc ? (
                                                                    <div
                                                                        className="flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-700 text-[8px] font-bold cursor-pointer hover:bg-sky-100 transition-colors w-fit max-w-full group/loc"
                                                                        onClick={(e) => { e.stopPropagation(); setLocationUpdateTrip(t); setLocationInput(""); setReasonInput(""); }}
                                                                        title={`📍 ${latestLoc.location}${latestLoc.reason ? '\nReason: ' + latestLoc.reason : ''}\nUpdated: ${format(new Date(latestLoc.created_at), "dd MMM yy HH:mm")}`}
                                                                    >
                                                                        <Navigation size={8} className="shrink-0 text-sky-500" />
                                                                        <span className="truncate max-w-[70px]">{latestLoc.location}</span>
                                                                    </div>
                                                                ) : (
                                                                    <div
                                                                        className="flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded bg-slate-50 border border-dashed border-slate-200 text-slate-400 text-[8px] font-medium cursor-pointer hover:bg-slate-100 hover:text-slate-600 hover:border-slate-300 transition-colors w-fit"
                                                                        onClick={(e) => { e.stopPropagation(); setLocationUpdateTrip(t); setLocationInput(""); setReasonInput(""); }}
                                                                    >
                                                                        <MapPin size={8} />
                                                                        <span>Set location</span>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>
                                                        <td className="sticky left-[438px] z-20 bg-white group-hover:bg-slate-50 transition-colors px-3 py-3 text-slate-700 font-medium border-r-2 border-slate-300 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.12)] w-[140px] min-w-[140px] max-w-[140px]">{t.destination}</td>
                                                        <td className="px-3 py-3 text-slate-400 border-r border-slate-50 bg-slate-50/20">{fmt(t.arrival_loading_date)}</td>
                                                        <td className="px-3 py-3 text-slate-400 border-r border-slate-50 bg-slate-50/20">{fmt(t.loading_date)}</td>
                                                        <td className="px-3 py-3 text-blue-700 font-medium border-r border-blue-50 bg-blue-50/30">
                                                            {fmt(t.dispatch_date)}
                                                            {t.arrival_loading_date && t.dispatch_date && (
                                                                <span className="block mt-1 text-[10px] font-bold text-blue-600 bg-white px-1.5 py-0.5 rounded border border-blue-100 shadow-sm w-fit">
                                                                    {differenceInDays(new Date(t.dispatch_date), new Date(t.arrival_loading_date))} days loading
                                                                </span>
                                                            )}
                                                        </td>
                                                        {Array.from({ length: Math.max(3, ...trips.map(tr => (tr.borders_data || []).length)) }).map((_, i) => {
                                                            const b = t.borders_data?.[i] || (i === 0 ? { name: t.checkpoint_1_name, arrival: t.checkpoint_1_arrival_date, departure: t.checkpoint_1_departure_date } : i === 1 ? { name: t.checkpoint_2_name, arrival: t.checkpoint_2_arrival_date, departure: t.checkpoint_2_departure_date } : i === 2 ? { name: t.checkpoint_3_name, arrival: t.checkpoint_3_arrival_date, departure: t.checkpoint_3_departure_date } : null);
                                                            const days = b?.arrival && b?.departure ? daysBetween(b.arrival, b.departure) : (i === 0 ? t.days_at_checkpoint_1 : i === 1 ? t.days_at_checkpoint_2 : i === 2 ? t.days_at_checkpoint_3 : null);
                                                            
                                                            return (
                                                                <Fragment key={i}>
                                                                    <td className={`px-3 py-3 border-r border-slate-50 leading-tight ${i === 0 ? 'text-indigo-700 bg-indigo-50/10' : i === 1 ? 'text-violet-700 bg-violet-50/10' : i === 2 ? 'text-fuchsia-700 bg-fuchsia-50/10' : 'text-slate-700 bg-slate-50/10'}`}>
                                                                        {b?.name && <span className="block text-[10px] font-semibold mb-0.5">{b.name}</span>}
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <span className="text-[10px]"><span className="text-slate-400">Arr:</span> {fmt(b?.arrival)}</span>
                                                                            {b?.crossing && <span className="text-[10px] font-bold text-indigo-600"><span className="text-slate-400 font-medium">Cross:</span> {fmt(b.crossing)}</span>}
                                                                            {b?.departure && <span className="text-[10px] text-slate-400 font-medium">Dep: {fmt(b.departure)}</span>}
                                                                        </div>
                                                                    </td>
                                                                    <td className={`px-3 py-3 text-center border-r border-slate-50 ${i === 0 ? 'bg-indigo-50/10' : i === 1 ? 'bg-violet-50/10' : i === 2 ? 'bg-fuchsia-50/10' : 'bg-slate-50/10'}`}>
                                                                        {days != null && <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${days > 3 ? 'bg-red-50 text-red-600' : 'bg-white text-slate-500 border border-slate-200'}`}>{days} days</span>}
                                                                    </td>
                                                                </Fragment>
                                                            );
                                                        })}
                                                        <td className="px-3 py-3 text-right font-medium text-amber-600 border-r border-slate-50 tabular-nums">
                                                            {t.standing_charges > 0 ? `$${Number(t.standing_charges).toLocaleString()}` : "—"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-500 border-r border-slate-50">{fmt(t.arrive_offloading_site_date)}</td>
                                                        <td className="px-3 py-3 text-emerald-700 font-medium border-r border-emerald-50 bg-emerald-50/30">{fmt(t.offloading_date)}</td>
                                                        <td className="px-3 py-3 text-emerald-700 border-r border-emerald-50 bg-emerald-50/10 leading-tight">
                                                            {fmt(t.hq_arrival_date)}
                                                        </td>
                                                        <td className="px-3 py-3 text-center border-r border-slate-50 min-w-[120px]">
                                                            <div className="flex flex-col items-center gap-1.5">
                                                                {computeLiveCycle(t) != null && (
                                                                    <span className="font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 leading-none">
                                                                        {computeLiveCycle(t)} <span className="text-[9px] text-slate-400 font-medium uppercase">Days</span>
                                                                    </span>
                                                                )}
                                                                {t.leg_type === "R" && (() => {
                                                                    const goingLeg = trips.find(x => x.trip_sheet_id && x.trip_sheet_id === t.trip_sheet_id && x.leg_type === "G" && x.id !== t.id);
                                                                    return goingLeg ? (
                                                                    <div className="flex flex-col items-center p-1.5 bg-emerald-50 rounded-lg border border-emerald-100 shadow-sm">
                                                                        <span className="text-[8px] font-black text-emerald-600 uppercase tracking-tighter">Round Trip Total</span>
                                                                        <span className="text-sm font-black text-emerald-700 tabular-nums">
                                                                            {(computeLiveCycle(t) || 0) + (computeLiveCycle(goingLeg) || 0)} <span className="text-[9px] uppercase">DYS</span>
                                                                        </span>
                                                                    </div>
                                                                    ) : null;
                                                                })()}
                                                                {t.leg_type === "G" && (() => {
                                                                    const returnLeg = trips.find(x => x.trip_sheet_id && x.trip_sheet_id === t.trip_sheet_id && x.leg_type === "R" && x.id !== t.id);
                                                                    return returnLeg ? (
                                                                    <div className="flex flex-col items-center p-1.5 bg-emerald-50 rounded-lg border border-emerald-100 shadow-sm">
                                                                        <span className="text-[8px] font-black text-emerald-600 uppercase tracking-tighter">Round Trip Total</span>
                                                                        <span className="text-sm font-black text-emerald-700 tabular-nums">
                                                                            {(computeLiveCycle(t) || 0) + (computeLiveCycle(returnLeg) || 0)} <span className="text-[9px] uppercase">DYS</span>
                                                                        </span>
                                                                    </div>
                                                                    ) : null;
                                                                })()}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                {t.nature === "Go & Return" && t.leg_type === "G" && (t.status === "Offloading" || t.status === "Completed") && (
                                                                    <Button variant="outline" size="icon" title="Initiate Return Leg" className="h-8 w-8 rounded-lg border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100" onClick={() => {
                                                                        if(confirm(`Initiate Return Leg for ${t.truck_no}? This will reverse the route and set destination to Dar Es Salaam.`)) {
                                                                            const isTanker = t.is_tanker || (t.trip_id && t.trip_id.includes('/T'));
                                                                            // Keep the same reference_number for the return leg so round-trip matching works via trip_sheet_id
                                                                            const returnTripId = t.reference_number || (isTanker ? t.trip_id : t.trip_id.replace('/G', '/R'));
                                                                            
                                                                            // Reverse borders
                                                                            const reversedBorders = (t.borders_data || []).map((b: any) => ({
                                                                                ...b,
                                                                                arrival: "",
                                                                                crossing: "",
                                                                                departure: ""
                                                                            })).reverse();

                                                                            const payload = { 
                                                                                ...t,
                                                                                trip_id: returnTripId,
                                                                                leg_type: "R",
                                                                                status: "Positioning",
                                                                                destination: "Dar Es Salaam",
                                                                                borders_data: reversedBorders,
                                                                                cargo: isTanker ? "EMPTY RETURN" : t.cargo,
                                                                                // Reset journey specific dates
                                                                                dispatch_date: null,
                                                                                arrival_loading_date: null,
                                                                                loading_date: null,
                                                                                checkpoint_1_arrival_date: null,
                                                                                checkpoint_1_departure_date: null,
                                                                                checkpoint_2_arrival_date: null,
                                                                                checkpoint_2_departure_date: null,
                                                                                checkpoint_3_arrival_date: null,
                                                                                checkpoint_3_departure_date: null,
                                                                                arrive_offloading_site_date: null,
                                                                                offloading_date: null,
                                                                                hq_arrival_date: null,
                                                                                total_trip_days: null,
                                                                                standing_charges: 0
                                                                            };
                                                                            delete payload.id;
                                                                            delete payload.created_at;
                                                                            
                                                                            supabase.from("logistics_transit_trips").insert([payload]).then(({error}) => {
                                                                                if(error) {
                                                                                    console.error("Spawn error:", error);
                                                                                    toast({ title: "Error spawning return leg", description: error.message, variant: "destructive" });
                                                                                }
                                                                                else { 
                                                                                    toast({ title: "Return Leg Spawned!" }); 
                                                                                    qc.invalidateQueries({ queryKey: ["transit_trips"] }); 
                                                                                }
                                                                            });
                                                                        }
                                                                    }}><RefreshCcw size={14} /></Button>
                                                                )}
                                                                <Button variant="outline" size="icon" title="View Ledger" className="h-8 w-8 rounded-lg border-slate-200" onClick={() => navigate(`/logistics/transit-sheet/${t.id}`)}><FileText size={14} /></Button>
                                                                <Button variant="outline" size="icon" title="Edit Record" className="h-8 w-8 rounded-lg border-slate-200 text-blue-600" onClick={() => { 
                                                                    setEditingTrip(t); 
                                                                    let borders = t.borders_data || [];
                                                                    if (borders.length === 0) {
                                                                        if (t.checkpoint_1_name || t.checkpoint_1_arrival_date) borders.push({ name: t.checkpoint_1_name || "", arrival: t.checkpoint_1_arrival_date || "", crossing: "", departure: t.checkpoint_1_departure_date || "" });
                                                                        if (t.checkpoint_2_name || t.checkpoint_2_arrival_date) borders.push({ name: t.checkpoint_2_name || "", arrival: t.checkpoint_2_arrival_date || "", crossing: "", departure: t.checkpoint_2_departure_date || "" });
                                                                        if (t.checkpoint_3_name || t.checkpoint_3_arrival_date) borders.push({ name: t.checkpoint_3_name || "", arrival: t.checkpoint_3_arrival_date || "", crossing: "", departure: t.checkpoint_3_departure_date || "" });
                                                                    }
                                                                    
                                                                    // Auto-heal corrupted return legs & missing Go leg details
                                                                    let recoveredSourceId = t.trip_sheet_id;
                                                                    let recoveredTripNumber = t.reference_number;
                                                                    let recoveredInvoiceNo = t.invoice_no;
                                                                    let recoveredClientName = t.client_name;
                                                                    let recoveredReturnInvoiceNo = t.return_invoice_no;
                                                                    
                                                                    if (t.leg_type === "R") {
                                                                        let gLeg = trips.find((x: any) => x.trip_sheet_id && x.trip_sheet_id === t.trip_sheet_id && x.leg_type === "G" && x.id !== t.id);
                                                                        if (!gLeg) {
                                                                            // Fallback: Find the most recent Go leg for the same truck
                                                                            gLeg = trips.find((x: any) => x.leg_type === "G" && x.truck_no === t.truck_no);
                                                                        }
                                                                        if (gLeg) {
                                                                            recoveredSourceId = recoveredSourceId || gLeg.trip_sheet_id;
                                                                            recoveredTripNumber = recoveredTripNumber || gLeg.reference_number;
                                                                            recoveredInvoiceNo = recoveredInvoiceNo || gLeg.invoice_no;
                                                                            recoveredClientName = recoveredClientName || gLeg.client_name;
                                                                            recoveredReturnInvoiceNo = recoveredReturnInvoiceNo || gLeg.return_invoice_no;
                                                                        }
                                                                    }

                                                                    // Fallback to original Trip Sheet data if fields are still missing
                                                                    let originalSheet = recoveredSourceId ? approvedTrips.find(x => x.id === recoveredSourceId) : null;
                                                                    if (!originalSheet) {
                                                                        originalSheet = approvedTrips.find((x: any) => 
                                                                            x.vehicle?.vehicle_no?.trim() === t.truck_no?.trim() || 
                                                                            x.truck_no?.trim() === t.truck_no?.trim()
                                                                        );
                                                                    }

                                                                    if (originalSheet) {
                                                                        recoveredSourceId = recoveredSourceId || originalSheet.id;
                                                                        recoveredTripNumber = recoveredTripNumber || originalSheet.reference_number;
                                                                        recoveredInvoiceNo = recoveredInvoiceNo || originalSheet.invoice_no;
                                                                        recoveredClientName = recoveredClientName || originalSheet.client_name;
                                                                        recoveredReturnInvoiceNo = recoveredReturnInvoiceNo || originalSheet.return_invoice_no;
                                                                    }

                                                                    setForm({ 
                                                                        ...emptyForm(), 
                                                                        ...t, 
                                                                        client_name: recoveredClientName || "",
                                                                        selected_vehicle_id: "", 
                                                                        standing_charges: t.standing_charges?.toString() || "",
                                                                        borders,
                                                                        return_borders: (t.return_borders_data || []).map((b: any) => ({ name: b.name || "", arrival: b.arrival || "", crossing: b.crossing || "", departure: b.departure || "" })),
                                                                        departure_from_site_date: t.departure_from_site_date || "",
                                                                        hq_arrival_date: t.hq_arrival_date || "",
                                                                        return_invoice_no: recoveredReturnInvoiceNo || "",
                                                                        return_revenue_amount: t.return_revenue_amount?.toString() || "",
                                                                        return_invoice_date: t.return_invoice_date || "",
                                                                        trip_number: recoveredTripNumber || "",
                                                                        invoice_no: recoveredInvoiceNo || "",
                                                                        source_sheet_id: recoveredSourceId || ""
                                                                    }); 
                                                                    setIsFormOpen(true); 
                                                                }}><Edit2 size={14} /></Button>
                                                                <Button variant="outline" size="icon" title="Delete" className="h-8 w-8 rounded-lg border-slate-200 text-red-600" onClick={() => { if(confirm("Permanently delete?")) deleteMutation.mutate(t.id); }}><X size={14} /></Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                 ))}
                                                    </Fragment>
                                                );
                                            })}
                                        </Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Dialog open={isFormOpen} onOpenChange={o => { if(!o) { setIsFormOpen(false); setEditingTrip(null); } }}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 border-none shadow-2xl">
                    <DialogHeader className="bg-gradient-to-r from-[#1a3a5c] to-[#2d5a8e] text-white p-6 rounded-t-3xl">
                        <DialogTitle className="text-lg font-bold uppercase tracking-tight">{editingTrip ? "Edit Mission Record" : "Deploy Transit Assets"}</DialogTitle>
                        <DialogDescription className="text-white/60 text-xs font-medium mt-1">
                            Configure routing checkpoints & border logistics for tracking
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-6 bg-white">

                        {/* ── STEP 1: Mission Plan Selection (only for new trips) ── */}
                        {!editingTrip && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/80 p-5 rounded-2xl border border-slate-200">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                                        <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">1</div>
                                        Select Approved Mission Plans
                                    </Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className="w-full h-11 justify-between bg-white rounded-xl shadow-sm border-slate-200 text-left font-medium text-slate-700 hover:bg-white hover:text-slate-700"
                                            >
                                                <span className="truncate">
                                                    {selectedSheetIds.length === 0
                                                        ? "Select mission plans..."
                                                        : selectedSheetIds.length === 1
                                                            ? (() => { const t = approvedTrips.find(x => x.id === selectedSheetIds[0]); return t ? `${t.reference_number} | ${t.client_name}` : "1 selected"; })()
                                                            : `${selectedSheetIds.length} trips selected`
                                                    }
                                                </span>
                                                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[460px] p-0 bg-white border border-slate-200 shadow-xl rounded-xl z-[9999]" align="start">
                                            <Command>
                                                <CommandInput placeholder="Search trip, client or destination..." className="h-9 border-none focus:ring-0" />
                                                <CommandList className="max-h-[350px] overflow-y-auto">
                                                    <CommandEmpty>No approved mission plans found.</CommandEmpty>
                                                    {Array.from(new Set(approvedTrips.map(t => t.client_name || "General Client"))).sort().map(clientName => (
                                                        <CommandGroup key={clientName} heading={clientName}>
                                                            {approvedTrips.filter(t => (t.client_name || "General Client") === clientName).map((x: any) => (
                                                                <CommandItem
                                                                    key={x.id}
                                                                    value={`${x.reference_number} ${x.client_name} ${x.destination || ''} ${x.vehicle?.vehicle_no || ''}`}
                                                                    onSelect={() => {
                                                                                setSelectedSheetIds(prev => {
                                                                                    const newIds = prev.includes(x.id)
                                                                                        ? prev.filter(id => id !== x.id)
                                                                                        : [...prev, x.id];
                                                                                    if (newIds.length > 0) {
                                                                                        const t = approvedTrips.find(a => a.id === newIds[0]);
                                                                                        if (t) setForm(f => ({
                                                                                            ...f,
                                                                                            truck_no: t.vehicle?.vehicle_no || "",
                                                                                            trailer_no: t.trailer?.vehicle_no || t.trailer?.trailer_number || "",
                                                                                            driver_name: t.driver?.full_name || "",
                                                                                            license_no: t.driver?.license_no || "",
                                                                                            passport_no: t.driver?.id_number || "",
                                                                                            client_name: t.client_name || "",
                                                                                            destination: t.destination || "",
                                                                                            cargo: t.cargo_outbound || "",
                                                                                            bl_number: t.bl_number || "",
                                                                                            container_no: t.container_no || "",
                                                                                            nature: t.journey_type || "Go & Return",
                                                                                            source_sheet_id: t.id,
                                                                                            trip_number: t.reference_number || "",
                                                                                            invoice_no: t.invoice_no || "",
                                                                                            return_invoice_no: t.return_invoice_no || ""
                                                                                        }));
                                                                                    }
                                                                                    return newIds;
                                                                                });
                                                                            }}
                                                                            className="cursor-pointer hover:bg-slate-50 text-slate-700 py-2.5"
                                                                        >
                                                                            <Check className={cn("mr-2 h-4 w-4 text-emerald-600 shrink-0", selectedSheetIds.includes(x.id) ? "opacity-100" : "opacity-0")} />
                                                                            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                                                                <span className="font-bold text-sm text-slate-800">{x.reference_number}</span>
                                                                                <span className="text-[11px] text-slate-500 flex items-center gap-1"><MapPin size={10} />{x.destination || 'No destination'}</span>
                                                                            </div>
                                                                        </CommandItem>
                                                                    ))}
                                                                </CommandGroup>
                                                    ))}
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                    {/* Show selected trips summary */}
                                    {selectedSheetIds.length > 1 && (
                                        <div className="space-y-1.5 pt-1">
                                            {selectedSheetIds.map(id => {
                                                const t = approvedTrips.find(x => x.id === id);
                                                return t ? (
                                                    <div key={id} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-100 text-xs">
                                                        <Truck size={12} className="text-slate-400 shrink-0" />
                                                        <span className="font-bold text-slate-700">{t.reference_number}</span>
                                                        <span className="text-slate-400">•</span>
                                                        <span className="text-slate-500 truncate">{t.client_name}</span>
                                                        <span className="text-slate-400">•</span>
                                                        <span className="text-indigo-500 truncate text-[10px]">{t.destination || '—'}</span>
                                                        <button onClick={() => setSelectedSheetIds(prev => prev.filter(i => i !== id))} className="ml-auto text-slate-400 hover:text-red-500">
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                ) : null;
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                                        <div className="w-5 h-5 rounded-full bg-slate-500 text-white flex items-center justify-center text-[10px] font-black">2</div>
                                        Apply Route Template
                                    </Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className="w-full h-11 justify-between bg-white rounded-xl shadow-sm border-slate-200 text-left font-medium text-slate-700 hover:bg-white hover:text-slate-700"
                                            >
                                                <span>Select route template...</span>
                                                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[360px] p-2 bg-white border border-slate-200 shadow-xl rounded-xl z-[9999]" align="start">
                                            <div className="max-h-[300px] overflow-y-auto space-y-1">
                                                {routeTemplates.length === 0 ? (
                                                    <div className="p-4 text-center text-sm text-slate-500">No templates saved yet.</div>
                                                ) : (
                                                    routeTemplates.map((x: any) => (
                                                        <div
                                                            key={x.id}
                                                            onClick={() => {
                                                                const ms = x.milestones || [];
                                                                setForm(f => ({
                                                                    ...f,
                                                                    destination: x.destination,
                                                                    nature: x.nature || f.nature,
                                                                    borders: (ms || []).map((m: any) => ({ name: m, arrival: "", crossing: "", departure: "" }))
                                                                }));
                                                            }}
                                                            className="cursor-pointer hover:bg-slate-50 text-slate-700 p-2 rounded-lg flex items-center justify-between"
                                                        >
                                                            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                                                <span className="font-bold text-sm">{x.route_name}</span>
                                                                <span className="text-[10px] text-slate-400">{x.destination} • {(x.milestones || []).length} checkpoints</span>
                                                            </div>
                                                            <div
                                                                onPointerDown={(e) => e.stopPropagation()}
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    if (confirm(`Delete template "${x.route_name}"?`)) {
                                                                        const { error } = await supabase.from("logistics_route_templates" as any).delete().eq("id", x.id);
                                                                        if (error) toast({ title: "Error deleting", description: error.message, variant: "destructive" });
                                                                        else {
                                                                            toast({ title: "Template deleted" });
                                                                            qc.invalidateQueries({ queryKey: ["logistics_route_templates"] });
                                                                        }
                                                                    }
                                                                }}
                                                                className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0 z-50 cursor-pointer"
                                                            >
                                                                <Trash2 size={14} />
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                        )}

                        {/* ── TRIP SUMMARY CARD (Read-only auto-filled info) ── */}
                        {(form.trip_number || form.truck_no || form.client_name) && (
                            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white overflow-hidden">
                                {/* Summary Header Bar */}
                                <div className="px-5 py-3 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <FileText size={14} className="text-slate-400" />
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mission Summary</span>
                                    </div>
                                    {form.trip_number && (
                                        <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                                            {form.trip_number}
                                        </span>
                                    )}
                                    {(form.leg_type === "R" || (editingTrip?.leg_type === "R")) && (
                                        <span className="text-[9px] font-black px-2 py-1 rounded-full bg-rose-100 text-rose-600 uppercase tracking-wider">Return Leg</span>
                                    )}
                                </div>
                                {/* Summary Grid */}
                                <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
                                    {[
                                        { label: "Client", value: form.client_name, icon: <Building2 size={12} /> },
                                        { label: "Truck", value: form.truck_no, icon: <Truck size={12} /> },
                                        { label: "Trailer", value: form.trailer_no, icon: <Package size={12} /> },
                                        { label: "Driver", value: form.driver_name, icon: <User size={12} /> },
                                        { label: "Destination", value: form.destination, icon: <MapPin size={12} /> },
                                        { label: "Cargo", value: form.cargo, icon: <Package size={12} /> },
                                        { label: "Journey", value: form.nature, icon: <ArrowRight size={12} /> },
                                        { label: "Invoice", value: form.invoice_no || "—", icon: <FileText size={12} /> },
                                    ].filter(item => item.value).map((item, i) => (
                                        <div key={i} className="flex items-start gap-2">
                                            <span className="text-slate-400 mt-0.5 shrink-0">{item.icon}</span>
                                            <div className="min-w-0">
                                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{item.label}</div>
                                                <div className="text-xs font-semibold text-slate-800 truncate">{item.value}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── STATUS + EDITABLE OVERRIDES (compact row) ── */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-slate-700">Status *</Label>
                                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as TransitStatus }))}>
                                    <SelectTrigger className="h-10 rounded-xl border-slate-200 shadow-sm text-sm font-medium"><SelectValue /></SelectTrigger>
                                    <SelectContent>{TRANSIT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-500">Contact No</Label>
                                <Input className="h-10 rounded-xl border-slate-200 text-sm" placeholder="Optional" value={form.contact_no} onChange={e => setForm(f => ({ ...f, contact_no: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-500">BL / Consignment</Label>
                                <Input className="h-10 rounded-xl border-slate-200 text-sm" value={form.bl_number} onChange={e => setForm(f => ({ ...f, bl_number: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-500">Container No</Label>
                                <Input className="h-10 rounded-xl border-slate-200 text-sm" value={form.container_no} onChange={e => setForm(f => ({ ...f, container_no: e.target.value }))} />
                            </div>
                        </div>

                        {/* ── DESTINATION OVERRIDE (only show if not auto-filled or editing) ── */}
                        {(!form.destination || editingTrip) && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-bold text-slate-700">Delivery Destination *</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className={cn(
                                                    "w-full h-10 justify-between bg-white rounded-xl border-slate-200 text-left font-medium text-slate-700 hover:bg-white hover:text-slate-700 shadow-sm text-sm",
                                                    !form.destination && "text-muted-foreground"
                                                )}
                                            >
                                                {form.destination || "Select destination..."}
                                                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[300px] p-0 bg-white border border-slate-200 shadow-xl rounded-xl z-[9999]" align="start">
                                            <Command>
                                                <CommandInput placeholder="Search location..." className="h-9 border-none focus:ring-0" onValueChange={v => setForm(f => ({ ...f, destination: v.toUpperCase() }))} />
                                                <CommandList className="max-h-[250px] overflow-y-auto">
                                                    <CommandEmpty>Press enter to use "{form.destination}"</CommandEmpty>
                                                    <CommandGroup>
                                                        {STANDARD_DESTINATIONS.map(dest => (
                                                            <CommandItem
                                                                key={dest}
                                                                value={dest}
                                                                onSelect={() => setForm(f => ({ ...f, destination: dest }))}
                                                                className="cursor-pointer hover:bg-slate-50 text-slate-700 py-2 font-medium"
                                                            >
                                                                <Check className={cn("mr-2 h-4 w-4 text-indigo-600", form.destination === dest ? "opacity-100" : "opacity-0")} />
                                                                {dest}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-500">Nature of Trip</Label>
                                    <Select value={form.nature} onValueChange={v => setForm(f => ({ ...f, nature: v }))}>
                                        <SelectTrigger className="h-10 rounded-xl border-slate-200 shadow-sm text-sm"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Go Alone">Go Alone</SelectItem>
                                            <SelectItem value="Go & Return">Go & Return</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-500">Cargo Description</Label>
                                    <Input placeholder="e.g. Copper Cathodes" className="h-10 rounded-xl border-slate-200 text-sm" value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} />
                                </div>
                            </div>
                        )}

                        {/* ── RETURN LEG INVOICE (conditional) ── */}
                        {(form.leg_type === "R" || editingTrip?.leg_type === "R") && (
                            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/30 p-5 space-y-4">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wider">Return Leg Invoice</span>
                                    {form.client_name && (
                                        <span className="text-xs font-bold text-indigo-700">• {form.client_name}</span>
                                    )}
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="relative">
                                        <Label className="text-xs font-bold text-amber-700 mb-1.5 block">Invoice No. *</Label>
                                        <Input
                                            placeholder="e.g. INV-2025-R001"
                                            className="h-10 rounded-xl border-amber-300 bg-white text-amber-900 font-semibold text-sm placeholder:text-amber-300 focus:border-amber-500"
                                            value={form.return_invoice_no || ""}
                                            onChange={e => setForm(f => ({ ...f, return_invoice_no: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-amber-700">Revenue (USD)</Label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-black text-slate-400">$</span>
                                            <Input
                                                type="number"
                                                placeholder="0.00"
                                                className="h-10 rounded-xl border-amber-300 bg-white text-amber-900 font-semibold text-sm pl-7"
                                                value={form.return_revenue_amount || ""}
                                                onChange={e => setForm(f => ({ ...f, return_revenue_amount: e.target.value }))}
                                            />
                                        </div>
                                        {form.return_revenue_amount && parseFloat(form.return_revenue_amount) > 0 && (
                                            <p className="text-[10px] text-slate-500 font-medium pl-1">
                                                ≈ TShs {(parseFloat(form.return_revenue_amount) * 2700).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-amber-700">Invoice Date</Label>
                                        <Input
                                            type="date"
                                            onClick={(e) => (e.target as HTMLInputElement).showPicker()}
                                            className="cursor-pointer h-10 rounded-xl border-amber-300 bg-white text-amber-900 font-medium text-sm"
                                            value={form.return_invoice_date || ""}
                                            onChange={e => setForm(f => ({ ...f, return_invoice_date: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <p className="text-[10px] text-amber-600 font-medium">
                                    💡 Invoice, amount &amp; date will be saved back to the original Trip Sheet automatically.
                                </p>
                            </div>
                        )}

                        {/* ── HIDDEN FIELDS for editingTrip to keep truck/trailer/driver editable ── */}
                        {editingTrip && (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
                                <div className="col-span-full">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Asset & Crew Details</span>
                                </div>
                                <div className="space-y-1.5"><Label className="text-xs font-semibold text-slate-600">Truck Reg *</Label><Input className="h-10 rounded-xl bg-white border-slate-200 text-sm" value={form.truck_no} onChange={e => setForm(f => ({ ...f, truck_no: e.target.value }))} /></div>
                                <div className="space-y-1.5"><Label className="text-xs font-semibold text-slate-600">Trailer Reg</Label><Input className="h-10 rounded-xl bg-white border-slate-200 text-sm" value={form.trailer_no} onChange={e => setForm(f => ({ ...f, trailer_no: e.target.value }))} /></div>
                                <div className="space-y-1.5"><Label className="text-xs font-semibold text-slate-600">Driver Name *</Label><Input className="h-10 rounded-xl bg-white border-slate-200 text-sm" value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} /></div>
                                <div className="space-y-1.5"><Label className="text-xs font-semibold text-slate-600">License No</Label><Input className="h-10 rounded-xl bg-white border-slate-200 text-sm" value={form.license_no} onChange={e => setForm(f => ({ ...f, license_no: e.target.value }))} /></div>
                                <div className="space-y-1.5"><Label className="text-xs font-semibold text-slate-600">Passport No</Label><Input className="h-10 rounded-xl bg-white border-slate-200 text-sm" value={form.passport_no} onChange={e => setForm(f => ({ ...f, passport_no: e.target.value }))} /></div>
                                <div className="space-y-1.5"><Label className="text-xs font-semibold text-slate-600">Contact No</Label><Input className="h-10 rounded-xl bg-white border-slate-200 text-sm" value={form.contact_no} onChange={e => setForm(f => ({ ...f, contact_no: e.target.value }))} /></div>
                            </div>
                        )}

                        {/* ═══════════════════════════════════════════════════════════════════
                            ROUTING & TIMELINE — The main working area
                        ═══════════════════════════════════════════════════════════════════ */}
                        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/30 to-white overflow-hidden">
                            {/* Section Header */}
                            <div className="px-5 py-3 bg-indigo-50/60 border-b border-indigo-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Globe size={14} className="text-indigo-500" />
                                    <span className="text-xs font-black text-indigo-800 uppercase tracking-wider">Routing & Timeline</span>
                                </div>
                                <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] font-black border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 gap-1" onClick={() => setForm(f => ({ ...f, borders: [...(f.borders || []), { name: "", arrival: "", crossing: "", departure: "" }] }))}>
                                    <Plus size={12} /> Add Border
                                </Button>
                            </div>

                            <div className="p-5 space-y-5">
                                {/* Loading & Dispatch Dates */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Arrival for Loading</Label>
                                        <Input type="date" onClick={(e) => (e.target as HTMLInputElement).showPicker()} className="cursor-pointer h-10 rounded-xl border-slate-200 bg-white font-medium text-sm" value={form.arrival_loading_date} onChange={e => setForm(f => ({ ...f, arrival_loading_date: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Loading Date</Label>
                                        <Input type="date" onClick={(e) => (e.target as HTMLInputElement).showPicker()} className="cursor-pointer h-10 rounded-xl border-slate-200 bg-white font-medium text-sm" value={form.loading_date} onChange={e => setForm(f => ({ ...f, loading_date: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Dispatch Date</Label>
                                        <Input type="date" onClick={(e) => (e.target as HTMLInputElement).showPicker()} className="cursor-pointer h-10 rounded-xl border-blue-200 bg-blue-50/30 font-medium text-sm text-blue-900" value={form.dispatch_date} onChange={e => setForm(f => ({ ...f, dispatch_date: e.target.value }))} />
                                    </div>
                                </div>

                                {/* Border Crossings */}
                                <div className="space-y-3">
                                    {(form.borders || []).map((border, idx) => (
                                        <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end p-3 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] font-bold text-slate-500 uppercase">
                                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 text-[8px] font-black mr-1">{idx + 1}</span>
                                                    Border Point
                                                </Label>
                                                <Input placeholder="e.g. Tunduma" className="h-9 rounded-lg bg-slate-50 border-slate-200 text-xs font-medium" value={border.name} onChange={e => {
                                                    const val = e.target.value;
                                                    setForm(f => ({ ...f, borders: f.borders.map((b, i) => i === idx ? { ...b, name: val } : b) }));
                                                }} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] font-bold text-slate-500 uppercase">Arrival</Label>
                                                <Input type="date" onClick={(e) => (e.target as HTMLInputElement).showPicker()} className="cursor-pointer h-9 rounded-lg bg-white border-slate-200 text-xs" value={border.arrival} onChange={e => {
                                                    const val = e.target.value;
                                                    setForm(f => ({ ...f, borders: f.borders.map((b, i) => i === idx ? { ...b, arrival: val } : b) }));
                                                }} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] font-bold text-indigo-600 uppercase">Crossing</Label>
                                                <Input type="date" onClick={(e) => (e.target as HTMLInputElement).showPicker()} className="cursor-pointer h-9 rounded-lg border-indigo-100 bg-white text-xs" value={border.crossing} onChange={e => {
                                                    const val = e.target.value;
                                                    setForm(f => ({ ...f, borders: f.borders.map((b, i) => i === idx ? { ...b, crossing: val } : b) }));
                                                }} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] font-bold text-slate-500 uppercase">Departure</Label>
                                                <Input type="date" onClick={(e) => (e.target as HTMLInputElement).showPicker()} className="cursor-pointer h-9 rounded-lg bg-white border-slate-200 text-xs" value={border.departure} onChange={e => {
                                                    const val = e.target.value;
                                                    setForm(f => ({ ...f, borders: f.borders.map((b, i) => i === idx ? { ...b, departure: val } : b) }));
                                                }} />
                                            </div>
                                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0" onClick={() => {
                                                setForm(f => ({ ...f, borders: f.borders.filter((_, i) => i !== idx) }));
                                            }}><X size={14} /></Button>
                                        </div>
                                    ))}

                                    {form.borders.length === 0 && (
                                        <div className="text-center py-8 bg-white/50 rounded-xl border border-dashed border-slate-200">
                                            <Globe size={20} className="mx-auto text-slate-300 mb-2" />
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">No border crossings added</p>
                                            <p className="text-[9px] text-slate-400 mt-1">Click "Add Border" to define crossing points</p>
                                        </div>
                                    )}
                                </div>

                                {/* Divider */}
                                <div className="border-t border-slate-200" />

                                {/* Arrival, Offloading, Standing Charges — Clean 3-col grid */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Arrival at Site</Label>
                                        <Input type="date" onClick={(e) => (e.target as HTMLInputElement).showPicker()} className="cursor-pointer h-10 rounded-xl border-slate-200 bg-white font-medium text-sm" value={form.arrive_offloading_site_date} onChange={e => setForm(f => ({ ...f, arrive_offloading_site_date: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Offloading Complete</Label>
                                        <Input type="date" onClick={(e) => (e.target as HTMLInputElement).showPicker()} className="cursor-pointer h-10 rounded-xl border-slate-200 bg-white font-medium text-sm" value={form.offloading_date} onChange={e => setForm(f => ({ ...f, offloading_date: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Standing Chg ($)</Label>
                                        <Input type="number" className="h-10 rounded-xl border-amber-200 bg-amber-50/30 font-semibold text-amber-800 text-sm" value={form.standing_charges} onChange={e => setForm(f => ({ ...f, standing_charges: e.target.value }))} />
                                    </div>
                                </div>

                                {/* ═══ RETURN JOURNEY SECTION (for Go Alone / Tankers) ═══ */}
                                {form.offloading_date && (isTankerTrip(form) || isTankerTrip(editingTrip)) && (
                                    <>
                                        {/* Departure from Site */}
                                        <div className="border-t-2 border-dashed border-orange-300 pt-4 mt-2" />
                                        <div className="rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-orange-50/40 to-amber-50/20 overflow-hidden">
                                            <div className="px-5 py-3 bg-orange-100/60 border-b border-orange-200 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <RefreshCcw size={14} className="text-orange-600" />
                                                    <span className="text-xs font-black text-orange-800 uppercase tracking-wider">Return Journey Checkpoints</span>
                                                </div>
                                                <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] font-black border-orange-200 text-orange-600 rounded-lg hover:bg-orange-50 gap-1" onClick={() => setForm(f => ({ ...f, return_borders: [...(f.return_borders || []), { name: "", arrival: "", crossing: "", departure: "" }] }))}>
                                                    <Plus size={12} /> Add Return Border
                                                </Button>
                                            </div>

                                            <div className="p-5 space-y-4">
                                                {/* Departure from site date */}
                                                <div className="grid grid-cols-3 gap-4">
                                                    <div className="space-y-1.5">
                                                        <Label className="text-[10px] font-bold text-orange-700 uppercase tracking-wider">Departure from Site</Label>
                                                        <Input type="date" onClick={(e) => (e.target as HTMLInputElement).showPicker()} className="cursor-pointer h-10 rounded-xl border-orange-200 bg-orange-50/30 font-medium text-sm text-orange-900" value={form.departure_from_site_date} onChange={e => setForm(f => ({ ...f, departure_from_site_date: e.target.value }))} />
                                                    </div>
                                                </div>

                                                {/* Auto-populate button */}
                                                {(form.return_borders || []).length === 0 && (form.borders || []).length > 0 && (
                                                    <div className="text-center py-4 bg-white/50 rounded-xl border border-dashed border-orange-200">
                                                        <RefreshCcw size={18} className="mx-auto text-orange-300 mb-2" />
                                                        <p className="text-[10px] font-bold text-orange-500 uppercase mb-2">No return checkpoints added</p>
                                                        <Button type="button" variant="outline" size="sm" className="text-[10px] font-black border-orange-200 text-orange-600 rounded-lg hover:bg-orange-50 gap-1" onClick={() => {
                                                            const reversed = [...(form.borders || [])].reverse().map(b => ({ name: b.name || "", arrival: "", crossing: "", departure: "" }));
                                                            setForm(f => ({ ...f, return_borders: reversed }));
                                                        }}>
                                                            <RefreshCcw size={12} /> Auto-fill from Outbound (Reversed)
                                                        </Button>
                                                    </div>
                                                )}

                                                {/* Return border crossings */}
                                                <div className="space-y-3">
                                                    {(form.return_borders || []).map((border, idx) => (
                                                        <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end p-3 bg-white rounded-xl border border-orange-100 shadow-sm hover:shadow-md transition-shadow">
                                                            <div className="space-y-1">
                                                                <Label className="text-[10px] font-bold text-slate-500 uppercase">
                                                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-100 text-orange-700 text-[8px] font-black mr-1">{idx + 1}</span>
                                                                    Border Point
                                                                </Label>
                                                                <Input placeholder="e.g. Sakania" className="h-9 rounded-lg bg-slate-50 border-slate-200 text-xs font-medium" value={border.name} onChange={e => {
                                                                    const val = e.target.value;
                                                                    setForm(f => ({ ...f, return_borders: f.return_borders.map((b, i) => i === idx ? { ...b, name: val } : b) }));
                                                                }} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label className="text-[10px] font-bold text-slate-500 uppercase">Arrival</Label>
                                                                <Input type="date" onClick={(e) => (e.target as HTMLInputElement).showPicker()} className="cursor-pointer h-9 rounded-lg bg-white border-slate-200 text-xs" value={border.arrival} onChange={e => {
                                                                    const val = e.target.value;
                                                                    setForm(f => ({ ...f, return_borders: f.return_borders.map((b, i) => i === idx ? { ...b, arrival: val } : b) }));
                                                                }} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label className="text-[10px] font-bold text-orange-600 uppercase">Crossing</Label>
                                                                <Input type="date" onClick={(e) => (e.target as HTMLInputElement).showPicker()} className="cursor-pointer h-9 rounded-lg border-orange-100 bg-white text-xs" value={border.crossing} onChange={e => {
                                                                    const val = e.target.value;
                                                                    setForm(f => ({ ...f, return_borders: f.return_borders.map((b, i) => i === idx ? { ...b, crossing: val } : b) }));
                                                                }} />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label className="text-[10px] font-bold text-slate-500 uppercase">Departure</Label>
                                                                <Input type="date" onClick={(e) => (e.target as HTMLInputElement).showPicker()} className="cursor-pointer h-9 rounded-lg bg-white border-slate-200 text-xs" value={border.departure} onChange={e => {
                                                                    const val = e.target.value;
                                                                    setForm(f => ({ ...f, return_borders: f.return_borders.map((b, i) => i === idx ? { ...b, departure: val } : b) }));
                                                                }} />
                                                            </div>
                                                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0" onClick={() => {
                                                                setForm(f => ({ ...f, return_borders: f.return_borders.filter((_, i) => i !== idx) }));
                                                            }}><X size={14} /></Button>
                                                        </div>
                                                    ))}
                                                </div>

                                                <p className="text-[10px] text-orange-600 font-medium">
                                                    🔄 Return journey checkpoints track the vehicle's movement back from the offloading site.
                                                </p>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Final HQ Return — Prominent standalone row */}
                                <div className="flex items-center justify-between gap-4 bg-emerald-50/50 p-4 rounded-xl border border-emerald-200">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <Label className="text-xs font-bold text-emerald-800 whitespace-nowrap">Final HQ Return</Label>
                                    </div>
                                    <Input type="date" onClick={(e) => (e.target as HTMLInputElement).showPicker()} className="cursor-pointer h-10 rounded-xl border-emerald-200 bg-white text-emerald-800 font-semibold text-sm max-w-[220px]" value={form.hq_arrival_date} onChange={e => setForm(f => ({ ...f, hq_arrival_date: e.target.value }))} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="p-5 bg-slate-50 border-t gap-3 rounded-b-3xl">
                        {!editingTrip && (
                            <Button 
                                variant="outline" 
                                className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold text-xs"
                                onClick={async () => {
                                    if (!form.destination) {
                                        toast({ title: "Missing Destination", description: "Please enter a Delivery Destination in the form first.", variant: "destructive" });
                                        return;
                                    }
                                    const name = form.destination;
                                    if (name) {
                                        // Check if it already exists to allow updates
                                        const existing = routeTemplates.find(x => x.route_name.toLowerCase() === name.toLowerCase());
                                        const payload = {
                                            name: name,
                                            route_name: name,
                                            origin: "TBD",
                                            destination: form.destination,
                                            nature: form.nature,
                                            milestones: (form.borders || []).map(b => b.name).filter(Boolean)
                                        };
                                        let error;
                                        if (existing) {
                                            if(confirm(`Template "${name}" already exists. Do you want to update it to use these checkpoints?`)) {
                                                const { error: updErr } = await supabase.from("logistics_route_templates" as any).update(payload).eq("id", existing.id);
                                                error = updErr;
                                            }
                                        } else {
                                            const { error: insErr } = await supabase.from("logistics_route_templates" as any).insert([payload]);
                                            error = insErr;
                                        }
                                        if (error) toast({ title: "Error saving template", description: error.message, variant: "destructive" });
                                        else {
                                            toast({ title: "Route Template Saved" });
                                            qc.invalidateQueries({ queryKey: ["logistics_route_templates"] });
                                        }
                                    }
                                }}
                            >
                                <Save size={14} className="mr-2" /> Save as Template
                            </Button>
                        )}
                        <Button variant="ghost" onClick={() => setIsFormOpen(false)} className="font-bold text-xs">Discard</Button>
                        <Button className="px-8 h-11 bg-[#1a3a5c] hover:bg-black text-white font-black rounded-xl shadow-xl shadow-blue-900/20 text-xs" onClick={() => saveMutation.mutate(form)}>{editingTrip ? "UPDATE ASSET DATA" : selectedSheetIds.length > 1 ? `DEPLOY ${selectedSheetIds.length} TRANSIT ASSETS` : "DEPLOY TRANSIT ASSET"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Location Update Dialog ───────────────────────────────────── */}
            <Dialog open={!!locationUpdateTrip} onOpenChange={o => { if (!o) setLocationUpdateTrip(null); }}>
                <DialogContent className="sm:max-w-[520px] p-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
                    {locationUpdateTrip && (() => {
                        const history = getTripLocationHistory(locationUpdateTrip.id);
                        return (
                            <>
                                {/* Header */}
                                <div className="bg-gradient-to-r from-sky-600 to-indigo-600 text-white p-5 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -mr-8 -mt-8" />
                                    <DialogHeader>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Navigation size={16} className="text-sky-200" />
                                            <DialogTitle className="text-lg font-black text-white">Location Update</DialogTitle>
                                        </div>
                                        <DialogDescription className="text-sky-200 text-xs font-medium">
                                            {locationUpdateTrip.truck_no} — {locationUpdateTrip.reference_number || locationUpdateTrip.trip_id}
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="flex gap-3 mt-3 pt-3 border-t border-white/15">
                                        <Badge className="bg-white/20 border-none text-[10px] font-bold">{locationUpdateTrip.status}</Badge>
                                        <span className="text-[10px] font-bold text-sky-200">{locationUpdateTrip.destination}</span>
                                    </div>
                                </div>

                                {/* Update Form */}
                                <div className="p-5 space-y-4 border-b border-slate-100">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Where is this vehicle right now?</Label>
                                        <Input
                                            placeholder="e.g. Dodoma, Morogoro, Kapiri Mposhi, Border Crossing..."
                                            className="h-11 rounded-xl border-slate-200 bg-slate-50 font-medium text-sm focus:bg-white"
                                            value={locationInput}
                                            onChange={e => setLocationInput(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Reason <span className="text-slate-300 font-medium">(Optional)</span></Label>
                                        <Input
                                            placeholder="e.g. Fueling stop, Customs clearance, Breakdown, Resting..."
                                            className="h-10 rounded-xl border-slate-200 bg-slate-50 text-xs font-medium focus:bg-white"
                                            value={reasonInput}
                                            onChange={e => setReasonInput(e.target.value)}
                                        />
                                    </div>
                                    <Button
                                        className="w-full h-10 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs gap-2 shadow-lg shadow-sky-200"
                                        disabled={!locationInput.trim() || locationMutation.isPending}
                                        onClick={() => {
                                            locationMutation.mutate({
                                                tripId: locationUpdateTrip.id,
                                                location: locationInput.trim(),
                                                reason: reasonInput.trim() || undefined
                                            });
                                        }}
                                    >
                                        <Navigation size={14} />
                                        {locationMutation.isPending ? "Saving..." : "Update Location"}
                                    </Button>
                                </div>

                                {/* Location History Timeline */}
                                <div className="p-5 max-h-[300px] overflow-y-auto">
                                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 flex items-center gap-2">
                                        <Clock size={12} />
                                        Location History ({history.length})
                                    </h4>
                                    {history.length === 0 ? (
                                        <div className="text-center py-8">
                                            <MapPin size={24} className="mx-auto text-slate-200 mb-2" />
                                            <p className="text-[11px] text-slate-400 font-medium">No location updates yet</p>
                                            <p className="text-[10px] text-slate-300 mt-1">Add the first location above</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-0">
                                            {history.map((update: any, i: number) => (
                                                <div key={update.id} className="flex gap-3 relative">
                                                    <div className="flex flex-col items-center">
                                                        <div className={`w-2.5 h-2.5 rounded-full z-10 shrink-0 mt-0.5 ${i === 0 ? 'bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)]' : 'bg-slate-300'}`} />
                                                        {i < history.length - 1 && <div className="w-0.5 flex-1 bg-slate-200" />}
                                                    </div>
                                                    <div className="pb-4 flex-1 min-w-0">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className={`text-xs font-black ${i === 0 ? 'text-sky-700' : 'text-slate-600'}`}>
                                                                {update.location}
                                                            </div>
                                                            <span className={`text-[9px] font-bold whitespace-nowrap shrink-0 ${i === 0 ? 'text-sky-500' : 'text-slate-400'}`}>
                                                                {formatDistanceToNow(new Date(update.created_at), { addSuffix: true })}
                                                            </span>
                                                        </div>
                                                        {update.reason && (
                                                            <div className="text-[10px] text-slate-400 font-medium mt-0.5 italic">
                                                                {update.reason}
                                                            </div>
                                                        )}
                                                        <div className="text-[9px] text-slate-300 font-medium mt-0.5">
                                                            {format(new Date(update.created_at), "dd MMM yyyy, HH:mm")}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            <Sheet open={!!selectedTripDetails} onOpenChange={o => !o && setSelectedTripDetails(null)}>
                <SheetContent className="w-[400px] sm:w-[540px] bg-white border-l border-slate-200 p-0 overflow-y-auto z-[100]">
                    {selectedTripDetails && (
                        <div className="flex flex-col h-full bg-slate-50/50">
                            <div className="p-6 bg-[#1a3a5c] text-white rounded-b-3xl shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-10 -mt-10" />
                                <SheetHeader>
                                    <div className="flex items-center gap-3 mb-2">
                                        <Badge className="bg-amber-500 hover:bg-amber-600 text-[10px] font-black border-none">{selectedTripDetails.status}</Badge>
                                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{selectedTripDetails.nature} / {selectedTripDetails.leg_type === "G" ? "OUTBOUND" : "RETURN"}</span>
                                    </div>
                                    <SheetTitle className="text-2xl font-black text-white text-left tracking-tighter leading-none mb-1">
                                        {selectedTripDetails.reference_number || selectedTripDetails.trip_id}
                                    </SheetTitle>
                                    <p className="text-slate-300 text-sm font-medium text-left">{selectedTripDetails.client_name}</p>
                                    
                                    <div className="flex gap-4 mt-4 pt-4 border-t border-white/10">
                                        <div>
                                            <Label className="text-[9px] text-slate-400 uppercase font-black">Trip Ref</Label>
                                            <div className="text-xs font-bold text-emerald-400">{selectedTripDetails.reference_number || "—"}</div>
                                        </div>
                                        <div>
                                            <Label className="text-[9px] text-slate-400 uppercase font-black">Associated Invoice</Label>
                                            <div className="text-xs font-bold text-emerald-400">{selectedTripDetails.invoice_no || "—"}</div>
                                        </div>
                                    </div>
                                </SheetHeader>
                            </div>
                            
                            <div className="p-6 space-y-6">
                                {/* Asset & Crew */}
                                <div>
                                    <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 flex items-center gap-2"><User size={14} /> Asset & Crew</h3>
                                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-xs grid grid-cols-2 gap-y-4">
                                        <div><Label className="text-[9px] text-slate-400 uppercase">Truck Reg</Label><div className="font-bold text-slate-800 text-sm">{selectedTripDetails.truck_no}</div></div>
                                        <div><Label className="text-[9px] text-slate-400 uppercase">Trailer Reg</Label><div className="font-bold text-slate-800 text-sm">{selectedTripDetails.trailer_no || "—"}</div></div>
                                        <div className="col-span-2 pt-3 border-t border-slate-100"><Label className="text-[9px] text-slate-400 uppercase">Driver Name</Label><div className="font-black text-slate-800">{selectedTripDetails.driver_name}</div></div>
                                        <div><Label className="text-[9px] text-slate-400 uppercase">License No</Label><div className="font-mono text-slate-600 font-bold">{selectedTripDetails.license_no || "—"}</div></div>
                                        <div><Label className="text-[9px] text-slate-400 uppercase">Passport No</Label><div className="font-mono text-slate-600 font-bold">{selectedTripDetails.passport_no || "—"}</div></div>
                                        <div className="col-span-2 pt-3 border-t border-slate-100"><Label className="text-[9px] text-slate-400 uppercase">Contact Route</Label><div className="font-medium text-slate-800">{selectedTripDetails.contact_no || "—"}</div></div>
                                    </div>
                                </div>

                                {/* Cargo details */}
                                <div>
                                    <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 flex items-center gap-2"><Package size={14} /> Consignment Details</h3>
                                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-xs grid grid-cols-2 gap-y-4">
                                        <div className="col-span-2"><Label className="text-[9px] text-slate-400 uppercase">Cargo Description</Label><div className="font-medium text-slate-800 uppercase tracking-tight">{selectedTripDetails.cargo || "—"}</div></div>
                                        <div className="pt-3 border-t border-slate-100"><Label className="text-[9px] text-slate-400 uppercase">BL / Consignment</Label><div className="font-mono text-slate-600 font-bold uppercase">{selectedTripDetails.bl_number || "—"}</div></div>
                                        <div className="pt-3 border-t border-slate-100"><Label className="text-[9px] text-slate-400 uppercase">Container No</Label><div className="font-mono text-slate-600 font-bold uppercase">{selectedTripDetails.container_no || "—"}</div></div>
                                    </div>
                                </div>

                                {/* Live Details */}
                                <div>
                                    <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 flex items-center gap-2"><MapPin size={14} /> Live Tracker Location</h3>
                                    <div className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm p-4 text-xs">
                                        <Label className="text-[9px] text-amber-600 uppercase font-black">Latest Geo-Ping Route Context</Label>
                                        <div className="font-black text-amber-900 mt-1 italic uppercase tracking-tight">
                                            {selectedTripDetails.location || "No recent active pings from driver..."}
                                        </div>
                                    </div>
                                </div>

                                {/* Dynamic Timeline */}
                                <div>
                                    <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 flex items-center gap-2"><CalendarDays size={14} /> Transit Timeline</h3>
                                    <div className="space-y-3">
                                        {[
                                            { label: "Dispatch", date: selectedTripDetails.dispatch_date, color: "blue" },
                                            ...(selectedTripDetails.borders_data || []).map((b: any) => ({
                                                label: b.name || "Border Crossing",
                                                date: b.arrival,
                                                crossing: b.crossing,
                                                dep: b.departure,
                                                color: "indigo"
                                            })),
                                            { label: "Offloading Site", date: selectedTripDetails.arrive_offloading_site_date, color: "orange" },
                                            { label: "Final Offload", date: selectedTripDetails.offloading_date, color: "emerald" },
                                            ...(selectedTripDetails.departure_from_site_date ? [{ label: "Departure from Site", date: selectedTripDetails.departure_from_site_date, color: "orange" }] : []),
                                            ...(selectedTripDetails.return_borders_data || []).map((b: any) => ({
                                                label: `↩ ${b.name || "Return Border"}`,
                                                date: b.arrival,
                                                crossing: b.crossing,
                                                dep: b.departure,
                                                color: "orange"
                                            })),
                                            { label: "Final HQ Arrival", date: selectedTripDetails.hq_arrival_date, color: "emerald" },
                                        ].filter(x => x.date).map((item, i) => (
                                            <div key={i} className="flex gap-4 relative">
                                                <div className="flex flex-col items-center">
                                                    <div className={`w-3 h-3 rounded-full bg-${item.color.split(' ')[0]}-500 z-10 shadow-[0_0_8px_rgba(0,0,0,0.1)]`} />
                                                    <div className="w-0.5 h-full bg-slate-200 absolute top-3" />
                                                </div>
                                                <div className="pb-4 flex-1">
                                                    <div className="flex justify-between items-start">
                                                        <div className={`text-[10px] uppercase font-bold text-${item.color.split(' ')[0]}-600`}>{item.label}</div>
                                                        <div className="text-[10px] font-bold text-slate-400">{fmt(item.date)}</div>
                                                    </div>
                                                    <div className="text-sm font-black text-slate-800">{fmt(item.date)}</div>
                                                    {item.crossing && (
                                                        <div className="text-[10px] font-black text-indigo-600 mt-1 bg-indigo-50 px-2 py-0.5 rounded w-fit border border-indigo-100 flex items-center gap-1">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                                            CROSSING: {fmt(item.crossing)}
                                                        </div>
                                                    )}
                                                    {item.dep && (
                                                        <div className="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                                                            <ArrowRight size={10} className="text-slate-300" /> 
                                                            Departed: {fmt(item.dep)}
                                                            {item.date && item.dep && (
                                                                <span className="text-indigo-600 ml-1 font-bold">({daysBetween(item.date, item.dep)} days)</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
};

export default TransitDashboard;
