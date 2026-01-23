import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client"; // Verify this path
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast"; // Verify hook path
import {
    MapPin, Calendar, Truck, User, Package, Plus, Search,
    ArrowRight, Clock, CheckCircle2, AlertTriangle, FileText,
    Navigation, RefreshCw, Filter
} from "lucide-react";
import { format } from "date-fns";

// Types
type TripStatus = 'Planned' | 'Dispatched' | 'In Transit' | 'At Destination' | 'Returning' | 'Completed' | 'Cancelled';

const TripManagement = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // Form State
    const [newTrip, setNewTrip] = useState({
        vehicle_id: "",
        trailer_id: "",
        driver_id: "",
        origin: "Headquarters",
        destination: "",
        cargo_outbound: "",
        cargo_inbound: "",
        notes: ""
    });

    // Fetch Trips
    const { data: trips, isLoading } = useQuery({
        queryKey: ["logistics_trips"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_trips")
                .select(`
                    *,
                    vehicle:logistics_fleet!vehicle_id(vehicle_no, make_model),
                    trailer:logistics_fleet!trailer_id(vehicle_no, make_model),
                    driver:logistics_drivers!driver_id(full_name)
                `)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data;
        }
    });

    // Fetch Resources for Form
    const { data: fleet } = useQuery({
        queryKey: ["fleet_available"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_fleet")
                .select("id, vehicle_no, asset_type")
                .eq("is_active", true);
            return data || [];
        }
    });

    const { data: assetTypes } = useQuery({
        queryKey: ["logistics-asset-types"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_asset_types")
                .select("*")
                .eq("is_active", true);
            return data || [];
        }
    });

    const { data: activeTripResources } = useQuery({
        queryKey: ["active_trip_resources"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_trips")
                .select("vehicle_id, trailer_id, driver_id")
                .not("status", "in", "('Completed', 'Cancelled')");
            return data || [];
        }
    });

    const { data: drivers } = useQuery({
        queryKey: ["drivers_available"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_drivers")
                .select("id, full_name")
                .eq("is_active", true);
            return data || [];
        }
    });

    const { data: couplings } = useQuery({
        queryKey: ["logistics_couplings_active"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_couplings")
                .select("*")
                .eq("is_active", true);
            return data || [];
        }
    });

    // Filtered Resources (Only show available ones)
    const availableVehicles = fleet?.filter(v => {
        const typeInfo = assetTypes?.find(t => t.name === v.asset_type);
        if (!typeInfo || typeInfo.type_category !== 'Vehicle') return false;

        // If it requires coupling, it MUST be coupled to show up
        if (typeInfo.requires_coupling && v.coupling_status !== 'coupled') return false;

        return !activeTripResources?.some(tr => tr.vehicle_id === v.id);
    }) || [];

    const availableTrailers = fleet?.filter(v => {
        const typeInfo = assetTypes?.find(t => t.name === v.asset_type);
        if (!typeInfo || typeInfo.type_category !== 'Trailer') return false;

        // Trailers ALWAYS require coupling to be on a trip
        if (v.coupling_status !== 'coupled') return false;

        return !activeTripResources?.some(tr => tr.trailer_id === v.id);
    }) || [];

    const availableDrivers = drivers?.filter(d =>
        !activeTripResources?.some(tr => tr.driver_id === d.id)
    ) || [];

    // Create Trip Mutation
    const createTripMutation = useMutation({
        mutationFn: async (tripData: any) => {
            if (!tripData.vehicle_id || !tripData.driver_id || !tripData.destination) {
                throw new Error("Please fill in all required fields.");
            }

            const { error } = await supabase.from("logistics_trips").insert([tripData]);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trips"] });
            queryClient.invalidateQueries({ queryKey: ["active_trip_resources"] });
            setIsCreateDialogOpen(false);
            setNewTrip({
                vehicle_id: "",
                trailer_id: "",
                driver_id: "",
                origin: "Headquarters",
                destination: "",
                cargo_outbound: "",
                cargo_inbound: "",
                notes: ""
            });
            toast({ title: "Trip Created", description: "The trip has been successfully planned." });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message });
        }
    });

    // Status Update Mutation
    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string, status: TripStatus }) => {
            const updates: any = { status };
            const now = new Date().toISOString();

            if (status === 'Dispatched') updates.departure_date = now;
            if (status === 'At Destination') updates.arrival_destination_date = now;
            if (status === 'Returning') updates.return_trip_start_date = now;
            if (status === 'Completed') updates.completion_date = now;

            const { error } = await supabase.from("logistics_trips").update(updates).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trips"] });
            queryClient.invalidateQueries({ queryKey: ["active_trip_resources"] });
            toast({ title: "Status Updated", description: "Trip status has been updated." });
        }
    });

    // Helper to calculate duration
    const formatDuration = (start: string, end: string) => {
        if (!start || !end) return null;
        const diff = new Date(end).getTime() - new Date(start).getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return `${days}d ${hours}h`;
    };

    const getTripsByStatus = (status: TripStatus) => {
        return trips?.filter((t: any) => t.status === status) || [];
    };

    const StatusColumn = ({ status, title, icon: Icon, colorClass }: any) => (
        <div className="flex-1 min-w-[280px] bg-slate-50/50 rounded-lg p-2 flex flex-col gap-3 h-full">
            <div className={`flex items-center gap-2 p-2 rounded-md ${colorClass} bg-opacity-10 border border-opacity-20`}>
                <Icon className={`w-4 h-4 ${colorClass.replace("bg-", "text-")}`} />
                <h3 className={`font-bold text-sm ${colorClass.replace("bg-", "text-")}`}>{title}</h3>
                <span className="ml-auto bg-white px-2 py-0.5 rounded text-xs font-bold shadow-sm">
                    {getTripsByStatus(status).length}
                </span>
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-280px)]">
                {getTripsByStatus(status).map((trip: any) => (
                    <Card key={trip.id} className="shadow-sm hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-primary">
                        <CardContent className="p-3 space-y-3">
                            <div className="flex justify-between items-start">
                                <span className="text-xs font-bold text-slate-500">{trip.trip_number}</span>
                                <Badge variant="outline" className="text-[10px]">{format(new Date(trip.created_at), 'MMM dd')}</Badge>
                            </div>

                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                <span className="truncate max-w-[80px]">{trip.origin}</span>
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                <span className="truncate max-w-[100px]">{trip.destination}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="text-[10px] text-slate-500 bg-slate-100 p-1.5 rounded flex items-center gap-1">
                                    <Truck className="w-3 h-3" />
                                    <span className="truncate">{trip.vehicle?.vehicle_no}</span>
                                    {trip.trailer && <span className="text-slate-400">/ {trip.trailer.vehicle_no}</span>}
                                </div>
                                <div className="text-[10px] text-slate-500 bg-slate-100 p-1.5 rounded flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    <span className="truncate">{trip.driver?.full_name}</span>
                                </div>
                            </div>

                            {trip.cargo_outbound && (
                                <div className="text-[10px] flex items-center gap-1 text-slate-600 italic">
                                    <Package className="w-3 h-3" />
                                    <span className="truncate">{trip.cargo_outbound}</span>
                                </div>
                            )}

                            {status === 'Completed' && trip.departure_date && trip.completion_date && (
                                <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-600">
                                    <Clock className="w-3 h-3" />
                                    TAT: {formatDuration(trip.departure_date, trip.completion_date)}
                                </div>
                            )}

                            <div className="pt-1">
                                {status === 'Planned' && (
                                    <Button size="sm" className="w-full h-7 text-xs bg-indigo-600 hover:bg-indigo-700"
                                        onClick={() => updateStatusMutation.mutate({ id: trip.id, status: 'Dispatched' })}>
                                        Dispatch <Navigation className="w-3 h-3 ml-2" />
                                    </Button>
                                )}
                                {status === 'Dispatched' && (
                                    <Button size="sm" className="w-full h-7 text-xs bg-blue-600 hover:bg-blue-700"
                                        onClick={() => updateStatusMutation.mutate({ id: trip.id, status: 'In Transit' })}>
                                        Start Transit <ArrowRight className="w-3 h-3 ml-2" />
                                    </Button>
                                )}
                                {status === 'In Transit' && (
                                    <Button size="sm" className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                                        onClick={() => updateStatusMutation.mutate({ id: trip.id, status: 'At Destination' })}>
                                        Arrived <MapPin className="w-3 h-3 ml-2" />
                                    </Button>
                                )}
                                {status === 'At Destination' && (
                                    <Button size="sm" className="w-full h-7 text-xs bg-amber-600 hover:bg-amber-700"
                                        onClick={() => updateStatusMutation.mutate({ id: trip.id, status: 'Returning' })}>
                                        Return <RefreshCw className="w-3 h-3 ml-2" />
                                    </Button>
                                )}
                                {status === 'Returning' && (
                                    <Button size="sm" className="w-full h-7 text-xs bg-slate-800 hover:bg-slate-900"
                                        onClick={() => updateStatusMutation.mutate({ id: trip.id, status: 'Completed' })}>
                                        Finish <CheckCircle2 className="w-3 h-3 ml-2" />
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {getTripsByStatus(status).length === 0 && (
                    <div className="text-center p-4 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-xs text-opacity-50">
                        Empty
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="p-4 md:p-6 space-y-6 h-[calc(100vh-60px)] flex flex-col overflow-hidden bg-slate-50/30">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Navigation className="w-6 h-6 text-primary" />
                        Trip Management
                    </h1>
                    <p className="text-sm text-muted-foreground">Monitor dispatch, transit, and delivery workflows.</p>
                </div>
                <div className="flex gap-2">
                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="shadow-lg"><Plus className="w-4 h-4 mr-2" /> Plan New Trip</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-xl">
                            <DialogHeader><DialogTitle>Plan New Trip</DialogTitle></DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Origin</Label>
                                        <Input value={newTrip.origin} onChange={(e) => setNewTrip({ ...newTrip, origin: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Destination *</Label>
                                        <Input placeholder="City/Port" value={newTrip.destination} onChange={(e) => setNewTrip({ ...newTrip, destination: e.target.value })} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Vehicle *</Label>
                                        <Select onValueChange={(v) => {
                                            const selectedHorse = fleet?.find(f => f.id === v);
                                            const coupling = couplings?.find(c => c.horse_id === v);
                                            setNewTrip({
                                                ...newTrip,
                                                vehicle_id: v,
                                                trailer_id: coupling ? coupling.trailer_id : ""
                                            });
                                        }}>
                                            <SelectTrigger><SelectValue placeholder="Select Vehicle" /></SelectTrigger>
                                            <SelectContent>
                                                {availableVehicles.map((v: any) => (
                                                    <SelectItem key={v.id} value={v.id}>{v.vehicle_no} ({v.asset_type})</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[10px] text-muted-foreground">{availableVehicles.length} units available</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Driver *</Label>
                                        <Select onValueChange={(v) => setNewTrip({ ...newTrip, driver_id: v })}>
                                            <SelectTrigger><SelectValue placeholder="Select Driver" /></SelectTrigger>
                                            <SelectContent>
                                                {availableDrivers.map((d: any) => (
                                                    <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[10px] text-muted-foreground">{availableDrivers.length} drivers available</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Trailer {newTrip.trailer_id && "(Auto-Selected)"}</Label>
                                    <Select
                                        value={newTrip.trailer_id || "none"}
                                        onValueChange={(v) => setNewTrip({ ...newTrip, trailer_id: v === "none" ? "" : v })}
                                    >
                                        <SelectTrigger><SelectValue placeholder="Select Trailer" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            {fleet?.filter(f => f.asset_type.toLowerCase().includes('trailer')).map((v: any) => (
                                                <SelectItem key={v.id} value={v.id}>{v.vehicle_no}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[10px] text-muted-foreground italic">Note: Coupled trailers are auto-selected.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Cargo Outbound</Label>
                                    <Input placeholder="Description..." value={newTrip.cargo_outbound} onChange={(e) => setNewTrip({ ...newTrip, cargo_outbound: e.target.value })} />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={() => createTripMutation.mutate(newTrip)} className="w-full">Confirm & Plan Trip</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="flex-1 overflow-x-auto">
                <div className="flex gap-4 h-full min-w-[1400px] pb-4">
                    <StatusColumn status="Planned" title="Planned" icon={Calendar} colorClass="bg-slate-500" />
                    <StatusColumn status="Dispatched" title="Dispatched" icon={Truck} colorClass="bg-indigo-600" />
                    <StatusColumn status="In Transit" title="In Transit" icon={Navigation} colorClass="bg-blue-600" />
                    <StatusColumn status="At Destination" title="At Destination" icon={MapPin} colorClass="bg-emerald-600" />
                    <StatusColumn status="Returning" title="Returning" icon={RefreshCw} colorClass="bg-amber-500" />
                    <StatusColumn status="Completed" title="Completed" icon={CheckCircle2} colorClass="bg-slate-800" />
                </div>
            </div>
        </div>
    );
};

export default TripManagement;
