import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
    Plus, Search, Truck, Globe, Printer, Eye, FileText,
    RefreshCw, BarChart3, CalendarDays, MapPin, AlertTriangle,
    CheckCircle2, X, Edit2, ChevronDown, Folders, ArrowRight, Save, FileUp
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (d: any) => d ? format(new Date(d), "dd MMM yy") : "—";
const daysBetween = (a: any, b: any): number | null => {
    if (!a || !b) return null;
    return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
};

const TRANSIT_STATUSES = ["Going to Load", "Loading", "Dispatched", "Tunduma", "Nakonde", "In Transit", "Offloading", "Completed", "Cancelled"] as const;

type TransitStatus = typeof TRANSIT_STATUSES[number];

const statusColor: Record<TransitStatus, string> = {
    "Going to Load": "bg-slate-100 text-slate-800 border-slate-300",
    Loading: "bg-amber-100 text-amber-800 border-amber-300",
    Dispatched: "bg-blue-100 text-blue-800 border-blue-300",
    Tunduma: "bg-indigo-100 text-indigo-800 border-indigo-300",
    Nakonde: "bg-violet-100 text-violet-800 border-violet-300",
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
    status: "Going to Load" as TransitStatus,
    destination: "",
    arrival_loading_date: "",
    loading_date: "",
    dispatch_date: "",
    tunduma_arrival_date: "",
    tunduma_departure_date: "",
    crossing_date: "",
    nakonde_arrival_date: "",
    nakonde_departure_date: "",
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
                .eq("status", "Approved")
                .eq("fleet_category", "Transit")
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
                tunduma_arrival_date: data.tunduma_arrival_date || null,
                tunduma_departure_date: data.tunduma_departure_date || null,
                days_at_tunduma: daysBetween(data.tunduma_arrival_date, data.tunduma_departure_date),
                crossing_date: data.crossing_date || null,
                nakonde_arrival_date: data.nakonde_arrival_date || null,
                nakonde_departure_date: data.nakonde_departure_date || null,
                days_at_nakonde: daysBetween(data.nakonde_arrival_date, data.nakonde_departure_date),
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
                <Button onClick={() => { setEditingTrip(null); setForm(emptyForm()); setIsFormOpen(true); }} className="h-11 px-6 bg-[#1a3a5c] hover:bg-slate-800 text-white font-black rounded-xl gap-2 shadow-lg">
                    <Plus className="w-4 h-4" /> NEW TRANSIT MISSION
                </Button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden ring-1 ring-slate-100">
                <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse min-w-[2400px]">
                        <thead>
                            <tr className="bg-[#1a3a5c] text-white">
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50 w-12">SN</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Trip Number</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Client Identity</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Registration</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50 text-slate-400">Trailer</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Driver Name</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Licence</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Passport</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50 text-slate-400">Contact</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Location</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">BL / Consign.</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Container</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Cargo Description</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Transit Status</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Destination</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Arr. Loading</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Loading Dt</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50 bg-blue-900">DISPATCHED</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Tunduma Arr</th>
                                <th className="px-2 py-3 text-center font-black uppercase tracking-widest border-r border-slate-700/50">TND Days</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Nakonde Arr</th>
                                <th className="px-2 py-3 text-center font-black uppercase tracking-widest border-r border-slate-700/50">NKD Days</th>
                                <th className="px-3 py-3 text-right font-black uppercase tracking-widest border-r border-slate-700/50 text-amber-300">Standing $</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50">Arrived Site</th>
                                <th className="px-3 py-3 text-left font-black uppercase tracking-widest border-r border-slate-700/50 bg-emerald-900 whitespace-nowrap">OFFLOADED</th>
                                <th className="px-3 py-3 text-center font-black uppercase tracking-widest border-r border-slate-700/50">Total Cycle</th>
                                <th className="px-3 py-3 text-center font-black uppercase tracking-widest">Manage</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={30} className="text-center py-24 text-slate-400 font-bold uppercase tracking-[0.2em]">Acquiring Satellite Telemetry...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={30} className="text-center py-24 text-slate-300 font-bold uppercase tracking-[0.2em] italic">No active transit assets found</td></tr>
                            ) : (
                                Object.entries(groupedByClient).map(([clientName, clientGroup]: [string, any]) => (
                                    <Fragment key={clientName}>
                                        {/* ── Client Header ────────────────────────────────── */}
                                        <tr className="bg-slate-950 text-white font-black uppercase tracking-widest text-[11px] sticky left-0 group">
                                            <td colSpan={30} className="px-4 py-3 border-b-2 border-slate-800">
                                                <div className="flex items-center gap-3">
                                                    <Folders size={18} className="text-amber-400" />
                                                    <span className="text-amber-400">CLIENT:</span>
                                                    <span className="text-white text-lg tracking-tight">{clientName}</span>
                                                    <Badge className="ml-4 bg-white/10 text-[10px]">{Object.keys(clientGroup.routes).length} ROUTES ACTIVE</Badge>
                                                </div>
                                            </td>
                                        </tr>
                                        
                                        {Object.entries(clientGroup.routes).map(([destName, routeGroup]: [string, any]) => (
                                            <Fragment key={`${clientName}-${destName}`}>
                                                {/* ── Route Header ────────────────────────────────── */}
                                                <tr className="bg-slate-900 text-white font-black uppercase tracking-widest text-[9px] sticky left-0 group">
                                                    <td colSpan={30} className="px-6 py-2 border-y border-slate-800/50">
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex items-center gap-2 bg-indigo-500/10 px-3 py-1 rounded border border-indigo-500/20">
                                                                <MapPin size={12} className="text-indigo-400" />
                                                                <span className="text-indigo-300">ROUTE DESTINATION:</span>
                                                                <span className="text-white font-black">{destName}</span>
                                                            </div>
                                                            <div className="text-[8px] text-slate-500">
                                                                {routeGroup.trips.length} ASSETS ON THIS PATH
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {routeGroup.trips.map((t: any, idx: number) => (
                                                    <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                                                        <td className="px-3 py-3 text-slate-300 font-black text-center border-r border-slate-50 group-hover:text-slate-900 transition-colors">{(idx + 1).toString().padStart(2, '0')}</td>
                                                        <td className="px-3 py-3 font-black text-[#1a3a5c] whitespace-nowrap border-r border-slate-50">
                                                            {t.trip_id}
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                <span className={`text-[7px] font-black px-1 py-0.5 rounded-full ${t.leg_type === "G" ? "bg-blue-100 text-blue-700" : "bg-rose-100 text-rose-700"}`}>
                                                                    {t.is_tanker ? "TKR" : t.leg_type === "G" ? "OUT" : "RTN"}
                                                                </span>
                                                                {t.nature && (
                                                                    <span className="text-[7px] font-black px-1 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                                                        {t.nature.toUpperCase()}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 font-black text-slate-900 uppercase tracking-tight border-r border-slate-50">{t.client_name || "—"}</td>
                                                        <td className="px-3 py-3 font-bold text-slate-800 border-r border-slate-50">{t.truck_no}</td>
                                                        <td className="px-3 py-3 text-slate-400 font-medium border-r border-slate-50">{t.trailer_no || "—"}</td>
                                                        <td className="px-3 py-3 font-bold text-slate-700 border-r border-slate-50">{t.driver_name}</td>
                                                        <td className="px-3 py-3 font-mono text-slate-400 border-r border-slate-50">{t.license_no || "—"}</td>
                                                        <td className="px-3 py-3 font-mono text-slate-400 border-r border-slate-50">{t.passport_no || "—"}</td>
                                                        <td className="px-3 py-3 text-slate-400 border-r border-slate-50">{t.contact_no || "—"}</td>
                                                        <td className="px-3 py-3 text-slate-600 font-bold border-r border-slate-50 italic">{t.location || "—"}</td>
                                                        <td className="px-3 py-3 font-mono text-slate-500 border-r border-slate-50 uppercase">{t.bl_number || "—"}</td>
                                                        <td className="px-3 py-3 font-mono text-slate-500 border-r border-slate-50 uppercase">{t.container_no || "—"}</td>
                                                        <td className="px-3 py-3 text-slate-700 font-medium border-r border-slate-50 truncate max-w-[150px]">{t.cargo || "—"}</td>
                                                        <td className="px-3 py-3 border-r border-slate-50">
                                                            <Badge className={`text-[9px] font-black px-2 py-0.5 border shadow-sm ${statusColor[t.status as TransitStatus] || "bg-slate-100 text-slate-600"}`}>
                                                                {t.status?.toUpperCase()}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-900 font-black uppercase border-r border-slate-50">{t.destination}</td>
                                                        <td className="px-3 py-3 text-slate-400 border-r border-slate-50">{fmt(t.arrival_loading_date)}</td>
                                                        <td className="px-3 py-3 text-slate-400 border-r border-slate-50">{fmt(t.loading_date)}</td>
                                                        <td className="px-3 py-3 text-blue-700 font-black border-r border-blue-50 bg-blue-50/30">{fmt(t.dispatch_date)}</td>
                                                        <td className="px-3 py-3 text-slate-400 border-r border-slate-50">{fmt(t.tunduma_arrival_date)}</td>
                                                        <td className="px-3 py-3 text-center border-r border-slate-50 font-black">
                                                            {t.days_at_tunduma != null && <span className={`px-2 py-0.5 rounded-full text-[9px] ${t.days_at_tunduma > 3 ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-700'}`}>{t.days_at_tunduma}D</span>}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-400 border-r border-slate-50">{fmt(t.nakonde_arrival_date)}</td>
                                                        <td className="px-3 py-3 text-center border-r border-slate-50 font-black">
                                                            {t.days_at_nakonde != null && <span className={`px-2 py-0.5 rounded-full text-[9px] ${t.days_at_nakonde > 3 ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-700'}`}>{t.days_at_nakonde}D</span>}
                                                        </td>
                                                        <td className="px-3 py-3 text-right font-black text-amber-600 border-r border-slate-50 tabular-nums">
                                                            {t.standing_charges > 0 ? `$${Number(t.standing_charges).toLocaleString()}` : "—"}
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-400 border-r border-slate-50">{fmt(t.arrive_offloading_site_date)}</td>
                                                        <td className="px-3 py-3 text-emerald-700 font-black border-r border-emerald-50 bg-emerald-50/30">{fmt(t.offloading_date)}</td>
                                                        <td className="px-3 py-3 text-center border-r border-slate-50">
                                                            {t.total_trip_days != null && <span className="font-black text-slate-900 border-b-2 border-slate-200">{t.total_trip_days}D</span>}
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200" onClick={() => navigate(`/logistics/transit-sheet/${t.id}`)}><FileText size={14} /></Button>
                                                                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200 text-blue-600" onClick={() => { setEditingTrip(t); setForm({ ...emptyForm(), ...t, selected_vehicle_id: "", standing_charges: t.standing_charges?.toString() || "" }); setIsFormOpen(true); }}><Edit2 size={14} /></Button>
                                                                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg border-slate-200 text-red-600" onClick={() => { if(confirm("Permanently delete?")) deleteMutation.mutate(t.id); }}><X size={14} /></Button>
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
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">1. Select Approved mission plan</Label>
                                    <Select onValueChange={(v) => {
                                        const t = approvedTrips.find(x => x.id === v);
                                        if(t) setForm(f => ({ 
                                            ...f, 
                                            truck_no: t.vehicle?.vehicle_no, 
                                            trailer_no: t.trailer?.vehicle_no, 
                                            driver_name: t.driver?.full_name,
                                            license_no: t.driver?.license_no || "",
                                            passport_no: t.driver?.id_number || "",
                                            client_name: t.client_name, 
                                            destination: t.destination, 
                                            cargo: t.cargo_outbound, 
                                            nature: t.journey_type,
                                            source_sheet_id: t.id, 
                                            trip_number: t.reference_number 
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
                                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">2. Apply Route Template (Tracking Plan)</Label>
                                    <Select onValueChange={(v) => {
                                        const route = routeTemplates.find(x => x.id === v);
                                        if(route) setForm(f => ({ ...f, destination: route.destination, nature: route.nature || f.nature }));
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
                            <div className="space-y-2 md:col-span-2"><Label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Client / Convoy Entity *</Label><Input className="h-11 rounded-xl bg-slate-50 border-none shadow-inner font-black uppercase" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Asset Reg # *</Label><Input className="h-11 rounded-xl bg-slate-50 border-none shadow-inner font-black uppercase" value={form.truck_no} onChange={e => setForm(f => ({ ...f, truck_no: e.target.value }))} /></div>
                            
                            <div className="space-y-2"><Label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Driver Name *</Label><Input className="h-11 rounded-xl border-slate-200" value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Destination *</Label><Input className="h-11 rounded-xl border-slate-200" value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Status</Label>
                                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as TransitStatus }))}>
                                    <SelectTrigger className="h-11 rounded-xl border-slate-200 shadow-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent>{TRANSIT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Nature of Trip</Label>
                                <Select value={form.nature} onValueChange={v => setForm(f => ({ ...f, nature: v }))}>
                                    <SelectTrigger className="h-11 rounded-xl border-slate-200 shadow-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Go Alone">Go Alone</SelectItem>
                                        <SelectItem value="Go & Return">Go & Return</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-6 rounded-2xl">
                            <div className="md:col-span-4 text-[10px] font-black uppercase text-indigo-600 tracking-[0.3em] pb-2 border-b">Border & Transit Timeline</div>
                            {[
                                { label: "Dispatch", key: "dispatch_date" },
                                { label: "TND Arrival", key: "tunduma_arrival_date" },
                                { label: "TND Dep.", key: "tunduma_departure_date" },
                                { label: "NKD Arrival", key: "nakonde_arrival_date" },
                                { label: "NKD Dep.", key: "nakonde_departure_date" },
                                { label: "Offloaded", key: "offloading_date" },
                            ].map(x => (
                                <div key={x.key} className="space-y-1.5">
                                    <Label className="text-[10px] font-bold text-slate-400 uppercase">{x.label}</Label>
                                    <Input type="date" className="h-9 text-xs rounded-lg border-slate-200" value={(form as any)[x.key]} onChange={e => setForm(f => ({ ...f, [x.key]: e.target.value }))} />
                                </div>
                            ))}
                            <div className="space-y-1.5"><Label className="text-[10px] font-bold text-amber-600 uppercase">Standing Chg ($)</Label><Input type="number" className="h-9 text-xs border-amber-200 bg-amber-50 rounded-lg font-bold" value={form.standing_charges} onChange={e => setForm(f => ({ ...f, standing_charges: e.target.value }))} /></div>
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
                                        const { error } = await supabase.from("logistics_route_templates" as any).insert([{
                                            route_name: name,
                                            destination: form.destination,
                                            nature: form.nature
                                        }]);
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
        </div>
    );
};

export default TransitDashboard;
