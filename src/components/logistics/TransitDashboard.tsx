import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
    Plus, Search, Truck, Globe, Printer, Eye, FileText,
    RefreshCw, BarChart3, CalendarDays, MapPin, AlertTriangle,
    CheckCircle2, X, Edit2, ChevronDown, Folders, ArrowRight, Save, FileUp, User, Package, Phone, RefreshCcw
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (d: any) => d ? format(new Date(d), "dd MMM yy") : "—";
const daysBetween = (a: any, b: any): number | null => {
    if (!a || !b) return null;
    return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
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
    standing_charges: "",
    arrive_offloading_site_date: "",
    offloading_date: "",
    selected_vehicle_id: "",
    is_tanker: false,
    leg_type: "G" as "G" | "R",
    source_sheet_id: "",
    trip_number: "",
    trip_number: "",
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
    const [yearFilter, setYearFilter] = useState("All");

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
                .select("*, vehicle:vehicle_id(vehicle_no, asset_type), trailer:trailer_id(vehicle_no), driver:driver_id(full_name, license_no, id_number)")
                .in("status", ["Approved", "Active"])
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

    const { data: trips = [], isLoading } = useQuery({
        queryKey: ["transit_trips", yearFilter, statusFilter],
        queryFn: async () => {
            let q = supabase
                .from("logistics_transit_trips" as any)
                .select("*")
                .order("created_at", { ascending: false });
            if (statusFilter !== "All") q = q.eq("status", statusFilter);
            const { data, error } = await q;
            if (error) throw error;
            return (data || []) as any[];
        }
    });

    // ─── Logic ───────────────────────────────────────────────────────────────
    const generateTripId = (truckNo: string, legType: "G" | "R"): string => {
        const CODE = "2025";
        const cleanTruck = truckNo.replace(/\s*[A-Z]+$/, "").trim();
        const seq = String(trips.length + 1).padStart(3, "0");
        return `${cleanTruck}/${CODE}/${legType}${seq}`;
    };

    const saveMutation = useMutation({
        mutationFn: async (data: any) => {
            const truckNo = fleet.find((f: any) => f.id === data.selected_vehicle_id)?.vehicle_no || data.truck_no;
            let tripId = data.trip_number || generateTripId(truckNo, data.leg_type);

            const payload: any = {
                client_name: data.client_name || null,
                truck_no: truckNo,
                trailer_no: data.trailer_no || null,
                trip_id: tripId,
                driver_name: data.driver_name || null,
                status: data.status,
                destination: data.destination || null,
                arrival_loading_date: data.arrival_loading_date || null,
                loading_date: data.loading_date || null,
                dispatch_date: data.dispatch_date || null,
                
                checkpoint_1_name: data.checkpoint_1_name || null,
                checkpoint_1_arrival_date: data.checkpoint_1_arrival_date || null,
                checkpoint_1_departure_date: data.checkpoint_1_departure_date || null,
                days_at_checkpoint_1: daysBetween(data.checkpoint_1_arrival_date, data.checkpoint_1_departure_date),
                
                checkpoint_2_name: data.checkpoint_2_name || null,
                checkpoint_2_arrival_date: data.checkpoint_2_arrival_date || null,
                checkpoint_2_departure_date: data.checkpoint_2_departure_date || null,
                days_at_checkpoint_2: daysBetween(data.checkpoint_2_arrival_date, data.checkpoint_2_departure_date),
                
                checkpoint_3_name: data.checkpoint_3_name || null,
                checkpoint_3_arrival_date: data.checkpoint_3_arrival_date || null,
                checkpoint_3_departure_date: data.checkpoint_3_departure_date || null,
                days_at_checkpoint_3: daysBetween(data.checkpoint_3_arrival_date, data.checkpoint_3_departure_date),
                standing_charges: Number(data.standing_charges) || 0,
                arrive_offloading_site_date: data.arrive_offloading_site_date || null,
                offloading_date: data.offloading_date || null,
                is_tanker: data.is_tanker,
                leg_type: data.leg_type,
                nature: data.nature || null,
                trip_sheet_id: data.source_sheet_id || null,
                total_trip_days: daysBetween(data.dispatch_date, data.offloading_date || new Date().toISOString().slice(0, 10)),
                contact_no: data.contact_no || null,
                passport_no: data.passport_no || null,
                license_no: data.license_no || null,
                location: data.location || null,
                bl_number: data.bl_number || null,
                container_no: data.container_no || null,
                cargo: data.cargo || null,
            };

            if (editingTrip) {
                const { error } = await supabase.from("logistics_transit_trips" as any).update(payload).eq("id", editingTrip.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from("logistics_transit_trips" as any).insert([payload]);
                if (error) throw error;
            }
        },
        onSuccess: async (_, vars) => {
            if (!editingTrip && vars.source_sheet_id) {
                await supabase.from("logistics_trip_sheets" as any).update({ status: "Active", activated_at: new Date().toISOString() }).eq("id", vars.source_sheet_id);
                qc.invalidateQueries({ queryKey: ["approved_trip_sheets"] });
            }
            qc.invalidateQueries({ queryKey: ["transit_trips"] });
            setIsFormOpen(false);
            setEditingTrip(null);
            setForm(emptyForm());
            toast({ title: "Success", description: "Record saved successfully." });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => { await supabase.from("logistics_transit_trips" as any).delete().eq("id", id); },
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["transit_trips"] }); toast({ title: "Deleted" }); }
    });

    // ─── Grouped & Filtered trips ──────────────────────────────────────────────
    const filtered = trips.filter((t: any) => {
        const term = search.toLowerCase();
        return !search || t.truck_no?.toLowerCase().includes(term) || t.trip_id?.toLowerCase().includes(term) || t.driver_name?.toLowerCase().includes(term) || t.destination?.toLowerCase().includes(term) || t.client_name?.toLowerCase().includes(term) || t.cargo?.toLowerCase().includes(term);
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
        completed: trips.filter((t: any) => t.status === "Completed").length,
        avgDays: trips.filter((t: any) => t.total_trip_days).reduce((a: number, b: any) => a + (b.total_trip_days || 0), 0) / Math.max(trips.filter((t: any) => t.total_trip_days).length, 1),
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: "Total Trips", value: stats.total, icon: Globe, color: "text-blue-600 bg-blue-50" },
                    { label: "Active", value: stats.active, icon: Truck, color: "text-amber-600 bg-amber-50" },
                    { label: "Completed", value: stats.completed, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
                    { label: "Avg Trip Days", value: stats.avgDays.toFixed(1), icon: CalendarDays, color: "text-violet-600 bg-violet-50" },
                ].map(s => (
                    <div key={s.label} className="flex items-center gap-3 p-3 rounded-xl border bg-white shadow-sm">
                        <div className={`p-2 rounded-lg ${s.color}`}><s.icon className="w-4 h-4" /></div>
                        <div>
                            <div className="text-xs text-slate-500 font-medium">{s.label}</div>
                            <div className="text-xl font-bold text-slate-800">{s.value}</div>
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
                <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse min-w-[2400px]">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-t border-slate-200">
                                <th className="px-3 py-3 text-left font-semibold border-r border-slate-200 w-12">SN</th>
                                <th className="px-3 py-3 text-left font-semibold border-r border-slate-200">Trip Number</th>
                                <th className="px-3 py-3 text-left font-semibold border-r border-slate-200">Client Identity</th>
                                <th className="px-3 py-3 text-left font-semibold border-r border-slate-200">Registration</th>
                                <th className="px-3 py-3 text-left font-semibold border-r border-slate-200">Transit Status</th>
                                <th className="px-3 py-3 text-left font-semibold border-r border-slate-200">Destination</th>
                                <th className="px-3 py-3 text-left font-semibold border-r border-slate-200">Arr. Loading</th>
                                <th className="px-3 py-3 text-left font-semibold border-r border-slate-200">Loading Dt</th>
                                <th className="px-3 py-3 text-left font-semibold border-r border-slate-200 bg-blue-50 text-blue-700">DISPATCHED</th>
                                <th className="px-3 py-3 text-left font-semibold border-r border-slate-200">Point 1</th>
                                <th className="px-2 py-3 text-center font-semibold border-r border-slate-200">P1 Days</th>
                                <th className="px-3 py-3 text-left font-semibold border-r border-slate-200">Point 2</th>
                                <th className="px-2 py-3 text-center font-semibold border-r border-slate-200">P2 Days</th>
                                <th className="px-3 py-3 text-left font-semibold border-r border-slate-200">Point 3</th>
                                <th className="px-2 py-3 text-center font-semibold border-r border-slate-200">P3 Days</th>
                                <th className="px-3 py-3 text-right font-semibold border-r border-slate-200">Standing $</th>
                                <th className="px-3 py-3 text-left font-semibold border-r border-slate-200">Arrived Site</th>
                                <th className="px-3 py-3 text-left font-semibold border-r border-slate-200 bg-emerald-50 text-emerald-700 whitespace-nowrap">OFFLOADED</th>
                                <th className="px-3 py-3 text-center font-semibold border-r border-slate-200">Total Cycle</th>
                                <th className="px-3 py-3 text-center font-semibold">Manage</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={30} className="text-center py-24 text-slate-500 text-sm">Loading transit data...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={30} className="text-center py-24 text-slate-400 text-sm">No active transit assets found</td></tr>
                            ) : (
                                Object.entries(groupedByClient).map(([clientName, clientGroup]: [string, any]) => (
                                    <Fragment key={clientName}>
                                        {/* ── Client Header ────────────────────────────────── */}
                                        <tr className="bg-slate-100 text-slate-800 font-bold uppercase text-[11px] sticky left-0 group">
                                            <td colSpan={30} className="px-4 py-2 border-b border-slate-200 shadow-[inset_0_-1px_0_rgba(0,0,0,0.05)]">
                                                <div className="flex items-center gap-3">
                                                    <Folders size={16} className="text-slate-400" />
                                                    <span className="text-slate-500 tracking-wider">CLIENT:</span>
                                                    <span className="text-slate-800 text-sm">{clientName}</span>
                                                    <Badge className="ml-4 bg-white text-slate-600 border-slate-200 text-[10px] font-semibold tracking-wider hover:bg-white">{Object.keys(clientGroup.routes).length} ROUTES ACTIVE</Badge>
                                                </div>
                                            </td>
                                        </tr>
                                        
                                        {Object.entries(clientGroup.routes).map(([destName, routeGroup]: [string, any]) => (
                                            <Fragment key={`${clientName}-${destName}`}>
                                                {/* ── Route Header ────────────────────────────────── */}
                                                <tr className="bg-white text-slate-600 font-semibold uppercase text-[10px] sticky left-0 group">
                                                    <td colSpan={30} className="px-6 py-1.5 border-b border-slate-100">
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                                                                <MapPin size={12} className="text-slate-400" />
                                                                <span className="text-slate-500">ROUTE DESTINATION:</span>
                                                                <span className="text-slate-800 font-bold">{destName}</span>
                                                            </div>
                                                            <div className="text-[9px] text-slate-400">
                                                                {routeGroup.trips.length} ASSETS ON THIS PATH
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {routeGroup.trips.map((t: any, idx: number) => (
                                                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                                                        <td className="px-3 py-3 text-slate-400 font-medium text-center border-r border-slate-50 group-hover:text-slate-600 transition-colors">{(idx + 1).toString().padStart(2, '0')}</td>
                                                        <td className="px-3 py-3 font-semibold text-slate-700 whitespace-nowrap border-r border-slate-50">
                                                            {t.trip_id}
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
                                                        <td className="px-3 py-3 font-medium text-slate-700 border-r border-slate-50">{t.client_name || "—"}</td>
                                                        <td className="px-3 py-3 font-semibold text-slate-700 border-r border-slate-50 cursor-pointer hover:bg-slate-50 hover:text-indigo-600 transition-colors group/cell" onClick={() => setSelectedTripDetails(t)}>
                                                            <div className="flex items-center justify-between">
                                                                <span>{t.truck_no}</span>
                                                                <Eye size={14} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 ml-2" />
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 border-r border-slate-50">
                                                            <Badge className={`text-[10px] font-semibold px-2 py-0.5 border shadow-none ${statusColor[t.status as TransitStatus] || "bg-slate-100 text-slate-600"}`}>
                                                                {t.status}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-700 font-medium border-r border-slate-50">{t.destination}</td>
                                                        <td className="px-3 py-3 text-slate-400 border-r border-slate-50">{fmt(t.arrival_loading_date)}</td>
                                                        <td className="px-3 py-3 text-slate-400 border-r border-slate-50">{fmt(t.loading_date)}</td>
                                                        <td className="px-3 py-3 text-blue-700 font-medium border-r border-blue-50 bg-blue-50/30">{fmt(t.dispatch_date)}</td>
                                                        <td className="px-3 py-3 text-slate-500 border-r border-slate-50 leading-tight">
                                                            {t.checkpoint_1_name && <span className="block text-[10px] font-semibold text-indigo-600 mb-0.5">{t.checkpoint_1_name}</span>}
                                                            {fmt(t.checkpoint_1_arrival_date)}
                                                        </td>
                                                        <td className="px-3 py-3 text-center border-r border-slate-50">
                                                            {t.days_at_checkpoint_1 != null && <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${t.days_at_checkpoint_1 > 3 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'}`}>{t.days_at_checkpoint_1} days</span>}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-500 border-r border-slate-50 leading-tight">
                                                            {t.checkpoint_2_name && <span className="block text-[10px] font-semibold text-violet-600 mb-0.5">{t.checkpoint_2_name}</span>}
                                                            {fmt(t.checkpoint_2_arrival_date)}
                                                        </td>
                                                        <td className="px-3 py-3 text-center border-r border-slate-50">
                                                            {t.days_at_checkpoint_2 != null && <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${t.days_at_checkpoint_2 > 3 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'}`}>{t.days_at_checkpoint_2} days</span>}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-500 border-r border-slate-50 leading-tight">
                                                            {t.checkpoint_3_name && <span className="block text-[10px] font-semibold text-fuchsia-600 mb-0.5">{t.checkpoint_3_name}</span>}
                                                            {fmt(t.checkpoint_3_arrival_date)}
                                                        </td>
                                                        <td className="px-3 py-3 text-center border-r border-slate-50">
                                                            {t.days_at_checkpoint_3 != null && <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${t.days_at_checkpoint_3 > 3 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500'}`}>{t.days_at_checkpoint_3} days</span>}
                                                        </td>
                                                        <td className="px-3 py-3 text-right font-medium text-amber-600 border-r border-slate-50 tabular-nums">
                                                            {t.standing_charges > 0 ? `$${Number(t.standing_charges).toLocaleString()}` : "—"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-500 border-r border-slate-50">{fmt(t.arrive_offloading_site_date)}</td>
                                                        <td className="px-3 py-3 text-emerald-700 font-medium border-r border-emerald-50 bg-emerald-50/30">{fmt(t.offloading_date)}</td>
                                                        <td className="px-3 py-3 text-center border-r border-slate-50">
                                                            {t.total_trip_days != null && <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded">{t.total_trip_days} days</span>}
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                {t.nature === "Go & Return" && t.leg_type === "G" && (t.status === "Offloading" || t.status === "Completed") && (
                                                                    <Button variant="outline" size="icon" title="Initiate Return Leg" className="h-8 w-8 rounded-lg border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100" onClick={() => {
                                                                        if(confirm(`Initiate Return Leg for ${t.truck_no}? This will duplicate the route and set leg to Return.`)) {
                                                                            const returnTripId = t.trip_id.replace('/G', '/R');
                                                                            const payload = { ...t };
                                                                            delete payload.id;
                                                                            delete payload.created_at;
                                                                            
                                                                            payload.trip_id = returnTripId;
                                                                            payload.leg_type = "R";
                                                                            payload.status = "Positioning";
                                                                            payload.dispatch_date = null;
                                                                            payload.arrival_loading_date = null;
                                                                            payload.loading_date = null;
                                                                            payload.checkpoint_1_arrival_date = null;
                                                                            payload.checkpoint_1_departure_date = null;
                                                                            payload.days_at_checkpoint_1 = null;
                                                                            payload.checkpoint_2_arrival_date = null;
                                                                            payload.checkpoint_2_departure_date = null;
                                                                            payload.days_at_checkpoint_2 = null;
                                                                            payload.checkpoint_3_arrival_date = null;
                                                                            payload.checkpoint_3_departure_date = null;
                                                                            payload.days_at_checkpoint_3 = null;
                                                                            payload.arrive_offloading_site_date = null;
                                                                            payload.offloading_date = null;
                                                                            payload.total_trip_days = null;
                                                                            
                                                                            supabase.from("logistics_transit_trips").insert([payload]).then(({error}) => {
                                                                                if(error) toast({ title: "Error spawning return leg", variant: "destructive" });
                                                                                else { toast({ title: "Return Leg Spawned!" }); qc.invalidateQueries({ queryKey: ["transit_trips"] }); }
                                                                            });
                                                                        }
                                                                    }}><RefreshCcw size={14} /></Button>
                                                                )}
                                                                <Button variant="outline" size="icon" title="View Ledger" className="h-8 w-8 rounded-lg border-slate-200" onClick={() => navigate(`/logistics/transit-sheet/${t.id}`)}><FileText size={14} /></Button>
                                                                <Button variant="outline" size="icon" title="Edit Record" className="h-8 w-8 rounded-lg border-slate-200 text-blue-600" onClick={() => { setEditingTrip(t); setForm({ ...emptyForm(), ...t, selected_vehicle_id: "", standing_charges: t.standing_charges?.toString() || "" }); setIsFormOpen(true); }}><Edit2 size={14} /></Button>
                                                                <Button variant="outline" size="icon" title="Delete" className="h-8 w-8 rounded-lg border-slate-200 text-red-600" onClick={() => { if(confirm("Permanently delete?")) deleteMutation.mutate(t.id); }}><X size={14} /></Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </Fragment>
                                        ))}
                                    </Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Dialog open={isFormOpen} onOpenChange={o => { if(!o) { setIsFormOpen(false); setEditingTrip(null); } }}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 border-none shadow-2xl">
                    <div className="p-6 bg-[#1a3a5c] text-white">
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-black uppercase tracking-tight">{editingTrip ? "Edit Mission Record" : "Deploy New Transit Assets"}</DialogTitle>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Configure Mission Parameters & Border Logistics</p>
                        </DialogHeader>
                    </div>

                    <div className="p-8 space-y-8 bg-white">
                        {!editingTrip && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-200">
                                <div className="space-y-3">
                                    <Label className="text-sm font-semibold text-slate-700">1. Select Approved Mission Plan</Label>
                                    <Select onValueChange={(v) => {
                                        const t = approvedTrips.find(x => x.id === v);
                                        if(t) setForm(f => ({ 
                                            ...f, 
                                            truck_no: t.vehicle?.vehicle_no || "", 
                                            trailer_no: t.trailer?.vehicle_no || "", 
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
                                            trip_number: t.reference_number || ""
                                        }));
                                    }}>
                                        <SelectTrigger className="h-12 bg-white rounded-xl shadow-sm border-slate-200"><SelectValue placeholder="Mission Plans..." /></SelectTrigger>
                                        <SelectContent>
                                            {approvedTrips.length === 0 ? <SelectItem value="none" disabled>No pending plans</SelectItem> : approvedTrips.map(x => (
                                                <SelectItem key={x.id} value={x.id}>{x.reference_number} | {x.client_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-3">
                                    <Label className="text-sm font-semibold text-slate-700">2. Apply Route Template (Tracking Plan)</Label>
                                    <Select onValueChange={(v) => {
                                        const route = routeTemplates.find(x => x.id === v);
                                        if(route) {
                                            const ms = route.milestones || [];
                                            setForm(f => ({
                                                ...f,
                                                destination: route.destination,
                                                nature: route.nature || f.nature,
                                                checkpoint_1_name: ms[0] || "",
                                                checkpoint_2_name: ms[1] || "",
                                                checkpoint_3_name: ms[2] || ""
                                            }));
                                        }
                                    }}>
                                        <SelectTrigger className="h-12 bg-white rounded-xl shadow-sm border-slate-200"><SelectValue placeholder="Standard Routes..." /></SelectTrigger>
                                        <SelectContent>
                                            {routeTemplates.length === 0 ? <SelectItem value="none" disabled>No templates saved</SelectItem> : routeTemplates.map(x => (
                                                <SelectItem key={x.id} value={x.id}>{x.route_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Row 1 - Basics */}
                            <div className="space-y-2 md:col-span-2"><Label className="text-xs font-semibold text-slate-600">Client / Convoy Entity *</Label><Input className="h-11 rounded-xl bg-slate-50 border-slate-200" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs font-semibold text-slate-600">Status *</Label>
                                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as TransitStatus }))}>
                                    <SelectTrigger className="h-11 rounded-xl border-slate-200 shadow-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent>{TRANSIT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>

                            {/* Row 2 - Asset & Crew Details */}
                            <div className="md:col-span-3 text-sm font-bold text-slate-800 border-b pb-2 mt-4">Asset & Crew Details</div>
                            <div className="space-y-2"><Label className="text-xs font-semibold text-slate-600">Truck Reg *</Label><Input className="h-11 rounded-xl bg-slate-50 border-slate-200" value={form.truck_no} onChange={e => setForm(f => ({ ...f, truck_no: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs font-semibold text-slate-600">Trailer Reg</Label><Input className="h-11 rounded-xl bg-slate-50 border-slate-200" value={form.trailer_no} onChange={e => setForm(f => ({ ...f, trailer_no: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs font-semibold text-slate-600">Contact No</Label><Input className="h-11 rounded-xl border-slate-200" value={form.contact_no} onChange={e => setForm(f => ({ ...f, contact_no: e.target.value }))} /></div>
                            
                            <div className="space-y-2"><Label className="text-xs font-semibold text-slate-600">Driver Name *</Label><Input className="h-11 rounded-xl border-slate-200" value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs font-semibold text-slate-600">License No</Label><Input className="h-11 rounded-xl border-slate-200" value={form.license_no} onChange={e => setForm(f => ({ ...f, license_no: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs font-semibold text-slate-600">Passport No</Label><Input className="h-11 rounded-xl border-slate-200" value={form.passport_no} onChange={e => setForm(f => ({ ...f, passport_no: e.target.value }))} /></div>

                            {/* Row 3 - Cargo & Logistics */}
                            <div className="md:col-span-3 text-sm font-bold text-slate-800 border-b pb-2 mt-4">Consignment Logistics</div>
                            <div className="space-y-2 md:col-span-3"><Label className="text-xs font-semibold text-slate-600">Cargo Description</Label><Input placeholder="e.g. Copper Cathodes" className="h-11 rounded-xl border-slate-200 bg-slate-50" value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs font-semibold text-slate-600">BL / Consignment No</Label><Input className="h-11 rounded-xl border-slate-200" value={form.bl_number} onChange={e => setForm(f => ({ ...f, bl_number: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs font-semibold text-slate-600">Container No</Label><Input className="h-11 rounded-xl border-slate-200" value={form.container_no} onChange={e => setForm(f => ({ ...f, container_no: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs font-semibold text-slate-600">Delivery Destination *</Label><Input className="h-11 rounded-xl border-slate-200" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} /></div>
                            {/* Row 4 - Trip Configuration */}
                            <div className="md:col-span-3 text-sm font-bold text-slate-800 border-b pb-2 mt-4">Mission Setup</div>
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-600">Nature of Trip</Label>
                                <Select value={form.nature} onValueChange={v => setForm(f => ({ ...f, nature: v }))}>
                                    <SelectTrigger className="h-11 rounded-xl border-slate-200 shadow-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Go Alone">Go Alone</SelectItem>
                                        <SelectItem value="Go & Return">Go & Return</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-6 gap-x-4 gap-y-6 bg-slate-50 p-6 rounded-2xl">
                            <div className="md:col-span-6 text-sm font-bold text-indigo-700 border-b pb-2 flex justify-between">
                                <span>Routing Checkpoints & Timeline</span>
                            </div>

                            <div className="space-y-1.5 md:col-span-2">
                                <Label className="text-xs font-semibold text-slate-600">Dispatch Date</Label>
                                <Input type="date" className="h-9 text-xs rounded-lg" value={form.dispatch_date} onChange={e => setForm(f => ({ ...f, dispatch_date: e.target.value }))} />
                            </div>
                            <div className="md:col-span-4"></div>

                            {/* Checkpoint 1 */}
                            <div className="space-y-1.5 md:col-span-2">
                                <Label className="text-xs font-semibold text-indigo-600">Checkpoint 1 Name</Label>
                                <Input placeholder="e.g. Tunduma (TZ), Namanga..." className="h-9 text-xs border-indigo-200" value={form.checkpoint_1_name} onChange={e => setForm(f => ({ ...f, checkpoint_1_name: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-500">Arrival Date</Label>
                                <Input type="date" className="h-9 text-xs" value={form.checkpoint_1_arrival_date} onChange={e => setForm(f => ({ ...f, checkpoint_1_arrival_date: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-500">Departure Date</Label>
                                <Input type="date" className="h-9 text-xs" value={form.checkpoint_1_departure_date} onChange={e => setForm(f => ({ ...f, checkpoint_1_departure_date: e.target.value }))} />
                            </div>
                            <div className="md:col-span-2"></div>

                            {/* Checkpoint 2 */}
                            <div className="space-y-1.5 md:col-span-2">
                                <Label className="text-xs font-semibold text-violet-600">Checkpoint 2 Name</Label>
                                <Input placeholder="(Optional)" className="h-9 text-xs border-violet-200" value={form.checkpoint_2_name} onChange={e => setForm(f => ({ ...f, checkpoint_2_name: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold text-slate-400 uppercase">Arr</Label>
                                <Input type="date" className="h-9 text-xs" value={form.checkpoint_2_arrival_date} onChange={e => setForm(f => ({ ...f, checkpoint_2_arrival_date: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold text-slate-400 uppercase">Dep</Label>
                                <Input type="date" className="h-9 text-xs" value={form.checkpoint_2_departure_date} onChange={e => setForm(f => ({ ...f, checkpoint_2_departure_date: e.target.value }))} />
                            </div>
                            <div className="md:col-span-2"></div>

                            {/* Checkpoint 3 */}
                            <div className="space-y-1.5 md:col-span-2">
                                <Label className="text-xs font-semibold text-fuchsia-600">Checkpoint 3 Name</Label>
                                <Input placeholder="(Optional)" className="h-9 text-xs border-fuchsia-200" value={form.checkpoint_3_name} onChange={e => setForm(f => ({ ...f, checkpoint_3_name: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold text-slate-400 uppercase">Arr</Label>
                                <Input type="date" className="h-9 text-xs" value={form.checkpoint_3_arrival_date} onChange={e => setForm(f => ({ ...f, checkpoint_3_arrival_date: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold text-slate-400 uppercase">Dep</Label>
                                <Input type="date" className="h-9 text-xs" value={form.checkpoint_3_departure_date} onChange={e => setForm(f => ({ ...f, checkpoint_3_departure_date: e.target.value }))} />
                            </div>
                            <div className="md:col-span-2"></div>

                            {/* Offloading */}
                            <div className="space-y-1.5 md:col-span-2 pt-4 border-t border-slate-200">
                                <Label className="text-xs font-semibold text-emerald-600">Site Arrival & Offload</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input type="date" className="h-9 text-xs" placeholder="Arr" value={form.arrive_offloading_site_date} onChange={e => setForm(f => ({ ...f, arrive_offloading_site_date: e.target.value }))} />
                                    <Input type="date" className="h-9 text-xs" placeholder="Off" value={form.offloading_date} onChange={e => setForm(f => ({ ...f, offloading_date: e.target.value }))} />
                                </div>
                            </div>
                            <div className="space-y-1.5 pt-4 border-t border-slate-200">
                                <Label className="text-[10px] font-bold text-amber-600 uppercase">Standing Chg ($)</Label>
                                <Input type="number" className="h-9 text-xs border-amber-200 bg-amber-50 font-bold" value={form.standing_charges} onChange={e => setForm(f => ({ ...f, standing_charges: e.target.value }))} />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="p-6 bg-slate-50 border-t gap-3">
                        {!editingTrip && form.destination && (
                            <Button 
                                variant="outline" 
                                className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold"
                                onClick={async () => {
                                    const name = prompt("Enter Route Name (e.g. Lubumbashi Standard):");
                                    if (name) {
                                        // Check if it already exists to allow updates
                                        const existing = routeTemplates.find(x => x.route_name.toLowerCase() === name.toLowerCase());
                                        const payload = {
                                            route_name: name,
                                            destination: form.destination,
                                            nature: form.nature,
                                            milestones: [form.checkpoint_1_name, form.checkpoint_2_name, form.checkpoint_3_name].filter(Boolean)
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
                                        if (error) toast({ title: "Error saving template", variant: "destructive" });
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
                        <Button variant="ghost" onClick={() => setIsFormOpen(false)} className="font-bold">Discard</Button>
                        <Button className="px-10 h-12 bg-[#1a3a5c] hover:bg-black text-white font-black rounded-xl shadow-xl shadow-blue-900/20" onClick={() => saveMutation.mutate(form)}>{editingTrip ? "UPDATE ASSET DATA" : "DEPLOY TRANSIT ASSET"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Sheet open={!!selectedTripDetails} onOpenChange={o => !o && setSelectedTripDetails(null)}>
                <SheetContent className="w-[400px] sm:w-[540px] bg-white border-l border-slate-200 p-0 overflow-y-auto z-[100]">
                    {selectedTripDetails && (
                        <div className="flex flex-col h-full bg-slate-50/50">
                            <div className="p-6 bg-[#1a3a5c] text-white rounded-b-3xl shadow-sm">
                                <SheetHeader>
                                    <div className="flex items-center gap-3 mb-2">
                                        <Badge className="bg-amber-500 hover:bg-amber-600 text-[10px] font-black border-none">{selectedTripDetails.status}</Badge>
                                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{selectedTripDetails.nature} / {selectedTripDetails.leg_type === "G" ? "OUTBOUND" : "RETURN"}</span>
                                    </div>
                                    <SheetTitle className="text-2xl font-black text-white text-left">{selectedTripDetails.trip_id}</SheetTitle>
                                    <p className="text-slate-300 text-sm font-medium text-left">{selectedTripDetails.client_name}</p>
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
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
};

export default TransitDashboard;
