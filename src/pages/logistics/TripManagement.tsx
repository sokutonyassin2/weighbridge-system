import { useState } from "react";
import TransitDashboard from "@/components/logistics/TransitDashboard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
    MapPin, Calendar, Truck, User, Package, Plus, Search,
    ArrowRight, Clock, CheckCircle2, AlertTriangle, FileText,
    Navigation, RefreshCw, Filter, Printer, Check, ChevronsUpDown,
    Pencil, Trash2, DollarSign, Map, Globe
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { TripSheet } from "@/components/logistics/TripSheet";
import { TripTimeline } from "@/components/logistics/TripTimeline";
import { Calendar as CalendarUI } from "@/components/ui/calendar";

// Types
type TripStatus = 'Planned' | 'Dispatched' | 'In Transit' | 'At Destination' | 'Returning' | 'Completed' | 'Cancelled';

const TripManagement = () => {
    const [activeModule, setActiveModule] = useState<"local" | "transit">("local");
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isCompletionDialogOpen, setIsCompletionDialogOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedTripForCompletion, setSelectedTripForCompletion] = useState<any>(null);
    const [selectedTripForPrint, setSelectedTripForPrint] = useState<any>(null);
    const [tripToEdit, setTripToEdit] = useState<any>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [completionData, setCompletionData] = useState({
        closing_km: "",
        actual_fuel_liters: "",
        actual_fuel_cost: "",
        return_cargo: ""
    });
    const [podFile, setPodFile] = useState<File | null>(null);
    const [isVehiclePopoverOpen, setIsVehiclePopoverOpen] = useState(false);
    const [isDriverPopoverOpen, setIsDriverPopoverOpen] = useState(false);
    const [isTrailerPopoverOpen, setIsTrailerPopoverOpen] = useState(false);
    const [selectedTripForSheet, setSelectedTripForSheet] = useState<any>(null);
    const [isTimelineOpen, setIsTimelineOpen] = useState(false);
    const [selectedTripForTimeline, setSelectedTripForTimeline] = useState<any>(null);

    // De-cluttering State
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const [activeView, setActiveView] = useState<"kanban" | "tabs">("kanban");
    const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>({
        'Cancelled': true,
        'Completed': false
    });

    // Form State
    const [newTrip, setNewTrip] = useState({
        vehicle_id: "",
        trailer_id: "",
        driver_id: "",
        origin: "Headquarters",
        destination: "",
        cargo_outbound: "",
        cargo_inbound: "",
        notes: "",
        starting_km: "",
        fuel_liters: "",
        fuel_cost: "",
        trip_allowance: ""
    });

    // Fetch Trips
    const { data: trips, isLoading } = useQuery({
        queryKey: ["logistics_trips", selectedDate],
        queryFn: async () => {
            let query = supabase
                .from("logistics_trips" as any)
                .select(`
                    *,
                    vehicle:logistics_fleet!vehicle_id(vehicle_no, make_model),
                    trailer:logistics_fleet!trailer_id(vehicle_no, make_model),
                    driver:logistics_drivers!driver_id(full_name)
                `);

            if (selectedDate) {
                const startOfDay = new Date(selectedDate);
                startOfDay.setHours(0, 0, 0, 0);
                
                const endOfDay = new Date(selectedDate);
                endOfDay.setHours(23, 59, 59, 999);
                
                query = query.gte("created_at", startOfDay.toISOString());
                query = query.lte("created_at", endOfDay.toISOString());
            }

            const { data, error } = await query.order("created_at", { ascending: false });

            if (error) throw error;
            return (data || []) as any[];
        }
    });

    // Fetch Resources for Form
    const { data: fleet } = useQuery({
        queryKey: ["fleet_available"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_fleet" as any)
                .select("id, vehicle_no, asset_type, asset_status, assignment_status, coupling_status, fleet_category")
                .eq("is_active", true);
            return (data || []) as any[];
        }
    });

    const { data: assetTypes } = useQuery({
        queryKey: ["logistics-asset-types"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_asset_types" as any)
                .select("*")
                .eq("is_active", true);
            return (data || []) as any[];
        }
    });

    const { data: activeTripResources } = useQuery({
        queryKey: ["active_trip_resources"],
        queryFn: async () => {
            // Check both Local Trips & Transit Trip Sheets for busy resources
            const [localTrips, transitTrips] = await Promise.all([
                supabase
                    .from("logistics_trips" as any)
                    .select("vehicle_id, trailer_id, driver_id")
                    .in("status", ["Planned", "Dispatched", "In Transit", "At Destination", "Returning"]),
                supabase
                    .from("logistics_trip_sheets" as any)
                    .select("vehicle_id, trailer_id, driver_id")
                    .in("status", ["Active", "Arrived", "Returning"])
            ]);

            return [
                ...(localTrips.data || []),
                ...(transitTrips.data || [])
            ] as any[];
        }
    });

    const { data: drivers } = useQuery({
        queryKey: ["drivers_available"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_drivers" as any)
                .select("id, full_name, license_expiry, operation_type")
                .eq("is_active", true);
            return (data || []) as any[];
        }
    });

    const { data: couplings } = useQuery({
        queryKey: ["logistics_couplings_active"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_couplings" as any)
                .select("*")
                .eq("is_active", true);
            return (data || []) as any[];
        }
    });

    // Fetch predefined route locations
    const { data: routeLocations } = useQuery({
        queryKey: ["logistics-routes"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_routes" as any)
                .select("*")
                .eq("is_active", true)
                .order("location_name", { ascending: true });
            return (data || []) as any[];
        }
    });

    const [isOriginPopoverOpen, setIsOriginPopoverOpen] = useState(false);
    const [isDestPopoverOpen, setIsDestPopoverOpen] = useState(false);
    const [isEditOriginPopoverOpen, setIsEditOriginPopoverOpen] = useState(false);
    const [isEditDestPopoverOpen, setIsEditDestPopoverOpen] = useState(false);

    // Filtered Resources (Only show available ones)
    const availableVehicles = fleet?.map(v => {
        const typeInfo = assetTypes?.find(t => t.name === v.asset_type);
        const isRecordedOnTrip = activeTripResources?.some(tr => tr.vehicle_id === v.id || tr.trailer_id === v.id);
        const isBusy = v.assignment_status === 'On Job' || v.assignment_status === 'In Transit' || isRecordedOnTrip;
        const isGarage = v.asset_status === 'In Garage' || v.asset_status === 'Inactive' || v.asset_status === 'Under Maintenance';

        return { ...v, isBusy, isGarage };
    }) || [];

    const availableTrailers = fleet?.map(v => {
        const typeInfo = assetTypes?.find(t => t.name === v.asset_type);
        const isRecordedOnTrip = activeTripResources?.some(tr => tr.vehicle_id === v.id || tr.trailer_id === v.id);
        const isBusy = v.assignment_status === 'On Job' || v.assignment_status === 'In Transit' || isRecordedOnTrip;
        const isGarage = v.asset_status === 'In Garage' || v.asset_status === 'Inactive';
        let isTrailer = typeInfo?.type_category === 'Trailer' || v.asset_type?.toLowerCase()?.includes('trailer');
        return { ...v, isBusy, isGarage, isTrailer };
    }).filter(v => v.isTrailer) || [];

    const availableDrivers = (drivers as any[])?.filter(d =>
        !d.license_expiry || new Date(d.license_expiry).getTime() >= new Date().setHours(0, 0, 0, 0)
    ).map(d => ({
        ...d,
        isBusy: (activeTripResources as any[])?.some(tr => tr.driver_id === d.id)
    })) || [];

    // Create Trip Mutation
    const createTripMutation = useMutation({
        mutationFn: async (tripData: any) => {
            if (!tripData.vehicle_id || !tripData.driver_id || !tripData.destination) {
                throw new Error("Please fill in all required fields.");
            }
            
            // Auto-generate Trip Number based on Vehicle, Year (2025), and Leg (G)
            const vehicleData = fleet?.find(f => f.id === tripData.vehicle_id);
            const vehicleNo = vehicleData?.vehicle_no || 'UNK';
            
            const { count } = await supabase
                .from("logistics_trips" as any)
                .select('*', { count: 'exact', head: true })
                .eq('vehicle_id', tripData.vehicle_id);
                
            const sequence = (count || 0) + 1;
            const paddedSequence = sequence.toString().padStart(3, '0');
            const tripNumber = `TRIP:${vehicleNo}/2025/G${paddedSequence}`;
            
            const formattedData = {
                ...tripData,
                trip_number: tripNumber,
                leg_type: 'G',
                leg_sequence: sequence,
                trailer_id: tripData.trailer_id === "" ? null : tripData.trailer_id,
                starting_km: Number(tripData.starting_km) || 0,
                fuel_liters: Number(tripData.fuel_liters) || 0,
                fuel_cost: Number(tripData.fuel_cost) || 0,
                trip_allowance: Number(tripData.trip_allowance) || 0
            };
            const { error } = await supabase.from("logistics_trips" as any).insert([formattedData]);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trips"] });
            setIsCreateDialogOpen(false);
            setNewTrip({
                vehicle_id: "", trailer_id: "", driver_id: "", origin: "Headquarters",
                destination: "", cargo_outbound: "", cargo_inbound: "", notes: "",
                starting_km: "", fuel_liters: "", fuel_cost: "", trip_allowance: ""
            });
            toast({ title: "Trip Created", description: "The trip has been successfully planned." });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message });
        }
    });

    const editTripMutation = useMutation({
        mutationFn: async (tripData: any) => {
            const formattedData = {
                origin: tripData.origin,
                destination: tripData.destination,
                cargo_outbound: tripData.cargo_outbound,
                cargo_inbound: tripData.cargo_inbound,
                starting_km: Number(tripData.starting_km) || 0,
                fuel_liters: Number(tripData.fuel_liters) || 0,
                fuel_cost: Number(tripData.fuel_cost) || 0,
                trip_allowance: Number(tripData.trip_allowance) || 0,
                trailer_id: tripData.trailer_id === "" || tripData.trailer_id === "none" ? null : tripData.trailer_id,
                created_at: tripData.created_at
            };
            const { error } = await supabase.from("logistics_trips" as any).update(formattedData).eq("id", tripData.id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trips"] });
            setIsEditDialogOpen(false);
            setTripToEdit(null);
            toast({ title: "Trip Updated", description: "Changes have been saved." });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message });
        }
    });

    const deleteTripMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("logistics_trips" as any).delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trips"] });
            toast({ title: "Trip Deleted", description: "The trip has been removed." });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message });
        }
    });

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status, completionData, podFile }: { id: string, status: TripStatus, completionData?: any, podFile?: File | null }) => {
            const updates: any = { status };
            const now = new Date().toISOString();
            if (status === 'Dispatched') updates.departure_date = now;
            if (status === 'At Destination') updates.arrival_destination_date = now;
            if (status === 'Returning') {
                // Update current Go trip to Completed
                updates.status = 'Completed';
                updates.completion_date = now;
                
                // Fetch the current trip to duplicate
                const { data: currentTrip } = await supabase.from("logistics_trips" as any).select("*").eq("id", id).single();
                
                if (currentTrip) {
                    let returnTripNumber = currentTrip.trip_number ? currentTrip.trip_number.replace('/G', '/R') : `TRIP:UNK/2025/R${currentTrip.leg_sequence ? currentTrip.leg_sequence.toString().padStart(3, '0') : '001'}`;
                    
                    await supabase.from("logistics_trips" as any).insert([{
                        vehicle_id: currentTrip.vehicle_id,
                        trailer_id: currentTrip.trailer_id,
                        driver_id: currentTrip.driver_id,
                        origin: currentTrip.destination,
                        destination: currentTrip.origin,
                        status: 'Returning',
                        trip_number: returnTripNumber,
                        leg_type: 'R',
                        leg_sequence: currentTrip.leg_sequence || 1,
                        parent_trip_id: currentTrip.id,
                        starting_km: currentTrip.starting_km,
                        return_trip_start_date: now
                    }]);
                }
            }
            if (status === 'Completed') {
                updates.completion_date = now;
                if (podFile) {
                    const fileExt = podFile.name.split('.').pop();
                    const fileName = `pod_${id}_${Date.now()}.${fileExt}`;
                    const { error: uploadError } = await supabase.storage.from('trip-pods').upload(fileName, podFile);
                    if (uploadError) throw uploadError;
                    const { data: { publicUrl } } = supabase.storage.from('trip-pods').getPublicUrl(fileName);
                    updates.pod_url = publicUrl;
                }
                if (completionData) {
                    updates.closing_km = Number(completionData.closing_km) || 0;
                    updates.actual_fuel_liters = Number(completionData.actual_fuel_liters) || 0;
                    updates.actual_fuel_cost = Number(completionData.actual_fuel_cost) || 0;
                    updates.cargo_inbound = completionData.return_cargo || null;
                }
            }
            const { data: tripData, error: tripError } = await supabase.from("logistics_trips" as any).update(updates).eq("id", id).select("vehicle_id").single();
            if (tripError) throw tripError;
            if (status === 'Completed' && updates.closing_km && (tripData as any)?.vehicle_id) {
                await supabase.from("logistics_fleet" as any).update({ current_odometer: updates.closing_km }).eq("id", (tripData as any).vehicle_id);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trips"] });
            setPodFile(null);
            toast({ title: "Status Updated", description: "Trip status has been updated." });
        }
    });

    const formatDuration = (start: string, end: string) => {
        if (!start || !end) return null;
        const diff = new Date(end).getTime() - new Date(start).getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return `${days}d ${hours}h`;
    };

    const handlePrintTrip = (trip: any) => {
        setSelectedTripForPrint(trip);
        setTimeout(() => window.print(), 300);
    };

    const getTripsByStatus = (status: TripStatus) => (trips as any[])?.filter((t: any) => t.status === status) || [];

    const getFilteredTrips = (status: TripStatus) => {
        const statusTrips = getTripsByStatus(status);
        if (!searchTerm) return statusTrips;
        const term = searchTerm.toLowerCase();
        return statusTrips.filter((t: any) =>
            t.trip_number?.toLowerCase()?.includes(term) ||
            t.vehicle?.vehicle_no?.toLowerCase()?.includes(term) ||
            t.destination?.toLowerCase()?.includes(term) ||
            t.driver?.full_name?.toLowerCase()?.includes(term)
        );
    };

    const StatusColumn = ({ status, title, icon: Icon, colorClass }: any) => {
        const isCollapsed = collapsedColumns[status];
        const filteredTrips = getFilteredTrips(status);
        const totalCount = getTripsByStatus(status).length;
        return (
            <div className={cn("bg-slate-50/50 rounded-lg p-2 flex flex-col gap-3 transition-all duration-300", isCollapsed ? "w-[60px] min-w-[60px]" : "flex-1 min-w-[280px]")}>
                <div className={cn("flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-opacity-20 transition-colors", colorClass, "bg-opacity-10 border border-opacity-20")} onClick={() => setCollapsedColumns(prev => ({ ...prev, [status]: !prev[status] }))}>
                    <Icon className={cn("w-4 h-4 shrink-0", colorClass.replace("bg-", "text-"))} />
                    {!isCollapsed && (
                        <>
                            <h3 className={cn("font-bold text-sm truncate", colorClass.replace("bg-", "text-"))}>{title}</h3>
                            <span className={cn("ml-auto px-2 py-0.5 rounded text-xs font-bold shadow-sm", searchTerm && filteredTrips.length > 0 ? "bg-primary text-white" : "bg-white text-slate-900")}>{searchTerm ? filteredTrips.length : totalCount}</span>
                        </>
                    )}
                </div>
                {!isCollapsed && (
                    <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-280px)]">
                        {filteredTrips.map((trip: any) => (
                            <Card key={trip.id} className={cn("shadow-sm hover:shadow-md transition-shadow cursor-pointer border-l-4", status === 'Completed' ? "border-l-slate-400 opacity-80" : "border-l-primary")}>
                                <CardContent className={cn("p-3 space-y-3", status === 'Completed' && "py-2")}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-500">{trip.trip_number}</span>
                                            <Badge variant="outline" className="text-[10px] w-fit mt-1">{trip.created_at ? format(new Date(trip.created_at), 'MMM dd') : 'N/A'}</Badge>
                                        </div>
                                        <div className="flex gap-1">
                                            {status === 'Planned' && <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600" onClick={(e) => { e.stopPropagation(); setTripToEdit(trip); setIsEditDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>}
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary" onClick={(e) => { e.stopPropagation(); handlePrintTrip(trip); }}><Printer className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-emerald-600" onClick={(e) => { e.stopPropagation(); setSelectedTripForSheet(trip); }}><DollarSign className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-amber-600" onClick={(e) => { e.stopPropagation(); setSelectedTripForTimeline(trip); setIsTimelineOpen(true); }}><Clock className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" disabled={deleteTripMutation.isPending} onClick={(e) => { e.stopPropagation(); if (window.confirm("Are you sure you want to delete this trip?")) { deleteTripMutation.mutate(trip.id); } }}><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                        <span className="truncate max-w-[80px]">{trip.origin}</span>
                                        <ArrowRight className="w-3 h-3 text-slate-400" />
                                        <span className="truncate max-w-[100px]">{trip.destination}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="text-[10px] text-slate-500 bg-slate-100 p-1.5 rounded flex items-center gap-1">
                                            <Truck className="w-3 h-3 text-primary/70" />
                                            <span className="truncate">{trip.vehicle?.vehicle_no}</span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 bg-slate-100 p-1.5 rounded flex items-center gap-1">
                                            <User className="w-3 h-3 text-primary/70" />
                                            <span className="truncate">{trip.driver?.full_name?.split(' ')[0]}</span>
                                        </div>
                                    </div>
                                    <div className="pt-1">
                                        {status === 'Planned' && <Button size="sm" disabled={updateStatusMutation.isPending} className="w-full h-7 text-xs bg-indigo-600 hover:bg-indigo-700" onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: trip.id, status: 'Dispatched' }); }}>Dispatch <Navigation className="w-3 h-3 ml-2" /></Button>}
                                        {status === 'Dispatched' && <Button size="sm" disabled={updateStatusMutation.isPending} className="w-full h-7 text-xs bg-blue-600 hover:bg-blue-700" onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: trip.id, status: 'In Transit' }); }}>Start Transit <ArrowRight className="w-3 h-3 ml-2" /></Button>}
                                        {status === 'In Transit' && <Button size="sm" disabled={updateStatusMutation.isPending} className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: trip.id, status: 'At Destination' }); }}>Arrived <MapPin className="w-3 h-3 ml-2" /></Button>}
                                        {status === 'At Destination' && <Button size="sm" disabled={updateStatusMutation.isPending} className="w-full h-7 text-xs bg-amber-600 hover:bg-amber-700" onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: trip.id, status: 'Returning' }); }}>Return <RefreshCw className="w-3 h-3 ml-2" /></Button>}
                                        {status === 'Returning' && (
                                            <Button size="sm" disabled={updateStatusMutation.isPending} className="w-full h-7 text-xs bg-slate-800 hover:bg-slate-900" onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedTripForCompletion(trip);
                                                setCompletionData({
                                                    closing_km: trip.closing_km?.toString() || "",
                                                    actual_fuel_liters: trip.actual_fuel_liters?.toString() || trip.fuel_liters?.toString() || "",
                                                    actual_fuel_cost: trip.actual_fuel_cost?.toString() || trip.fuel_cost?.toString() || "",
                                                    return_cargo: trip.cargo_inbound || ""
                                                });
                                                setIsCompletionDialogOpen(true);
                                            }}>Finish <CheckCircle2 className="w-3 h-3 ml-2" /></Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-4 md:p-6 space-y-4 h-[calc(100vh-60px)] flex flex-col overflow-hidden bg-white/50 backdrop-blur-sm">

            {/* ── Module Switcher ───────────────────────────────────────── */}
            <div className="flex items-center gap-1 bg-slate-100/80 border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
                <button
                    onClick={() => setActiveModule("local")}
                    className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${
                        activeModule === "local"
                            ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                            : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                    <Navigation className="w-4 h-4" />
                    Local Trips
                </button>
                <button
                    onClick={() => setActiveModule("transit")}
                    className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${
                        activeModule === "transit"
                            ? "bg-[#1a3a5c] text-white shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                    <Globe className="w-4 h-4" />
                    Transit Tracking
                </button>
            </div>

            {/* ── Transit Module ────────────────────────────────────────── */}
            {activeModule === "transit" && (
                <div className="flex-1 overflow-y-auto pb-6">
                    <div className="mb-4">
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <div className="p-2 bg-[#1a3a5c]/10 rounded-lg"><Globe className="w-6 h-6 text-[#1a3a5c]" /></div>
                            Transit Tracking
                        </h1>
                        <p className="text-sm text-slate-500 mt-0.5">Long-haul transit management — Polytra-style 30+ column tracking</p>
                    </div>
                    <TransitDashboard />
                </div>
            )}

            {/* ── Local Trips Module ────────────────────────────────────────── */}
            {activeModule === "local" && (
                <div className="flex-1 overflow-y-auto pb-6 -mx-1 px-1">
                    {selectedTripForSheet ? (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Persistent Header for Trip Sheet */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 backdrop-blur-md p-4 rounded-2xl border shadow-sm sticky top-0 z-20">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-emerald-50 rounded-xl">
                                        <DollarSign className="w-6 h-6 text-emerald-600" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h1 className="text-xl font-black text-slate-900 tracking-tight">Edit Trip Sheet</h1>
                                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-black">{selectedTripForSheet.trip_number}</Badge>
                                        </div>
                                        <p className="text-xs text-slate-500 font-bold mt-0.5 flex items-center gap-1.5">
                                            Managing financials for <span className="text-slate-900">{selectedTripForSheet.origin}</span> 
                                            <ArrowRight className="w-3 h-3" /> 
                                            <span className="text-slate-900">{selectedTripForSheet.destination}</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button 
                                        variant="outline" 
                                        onClick={() => {
                                            handlePrintTrip(selectedTripForSheet);
                                        }}
                                        className="h-10 font-bold rounded-xl border-slate-200"
                                    >
                                        <Printer className="w-4 h-4 mr-2" /> Print Sheet
                                    </Button>
                                    <Button 
                                        onClick={() => setSelectedTripForSheet(null)} 
                                        className="h-10 font-bold bg-slate-900 text-white rounded-xl shadow-lg hover:shadow-xl transition-all"
                                    >
                                        Back to Trip Dashboard
                                    </Button>
                                </div>
                            </div>

                            {/* Main Trip Sheet Component */}
                            <div className="bg-white rounded-3xl border shadow-sm overflow-hidden min-h-[600px]">
                                <TripSheet 
                                    tripId={selectedTripForSheet.id} 
                                    onSaveSuccess={() => {
                                        queryClient.invalidateQueries({ queryKey: ["logistics_trips"] });
                                        toast({ 
                                            title: "Sheet Updated", 
                                            description: "The trip sheet has been successfully updated and security logs recorded." 
                                        });
                                        setSelectedTripForSheet(null);
                                    }} 
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                <div>
                                    <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                                        <div className="p-2 bg-primary/10 rounded-lg"><Navigation className="w-5 h-5 md:w-6 md:h-6 text-primary" /></div>
                                        Trip Management
                                    </h1>
                                </div>
                                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
                                    <div className="flex bg-slate-100/50 p-1 rounded-xl border backdrop-blur-sm w-full sm:w-auto">
                                        <Button variant={activeView === "kanban" ? "secondary" : "ghost"} size="sm" className={cn("h-8 flex-1 sm:flex-none px-4 rounded-lg text-xs font-bold transition-all duration-300", activeView === "kanban" && "shadow-sm border bg-white")} onClick={() => setActiveView("kanban")}>Board</Button>
                                        <Button variant={activeView === "tabs" ? "secondary" : "ghost"} size="sm" className={cn("h-8 flex-1 sm:flex-none px-4 rounded-lg text-xs font-bold transition-all duration-300", activeView === "tabs" && "shadow-sm border bg-white")} onClick={() => setActiveView("tabs")}>Tabs</Button>
                                    </div>
                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" className={cn("flex-1 sm:w-[150px] h-10 text-xs font-bold bg-white/80 border-slate-200 rounded-xl shadow-sm justify-start text-left", !selectedDate && "text-slate-500")}>
                                                    <Calendar className="w-3.5 h-3.5 mr-2 text-primary shrink-0" />
                                                    {selectedDate ? format(selectedDate, "MMM dd, yyyy") : <span>Filter by Date</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0 rounded-2xl border-slate-200 shadow-xl" align="end">
                                                <CalendarUI
                                                    mode="single"
                                                    selected={selectedDate}
                                                    onSelect={setSelectedDate}
                                                    initialFocus
                                                    className="p-3"
                                                />
                                                {selectedDate && (
                                                    <div className="p-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                                                        <Button variant="ghost" size="sm" className="w-full text-xs font-bold text-slate-500 hover:text-slate-900" onClick={() => setSelectedDate(undefined)}>Clear Filter</Button>
                                                    </div>
                                                )}
                                            </PopoverContent>
                                        </Popover>
                                        <Button onClick={() => setIsCreateDialogOpen(true)} className="flex-1 sm:flex-none h-10 font-bold bg-slate-900 rounded-xl whitespace-nowrap"><Plus className="w-4 h-4 mr-0 sm:mr-2" /><span className="hidden sm:inline">Plan New Trip</span><span className="sm:hidden">Plan</span></Button>
                                    </div>
                                    <div className="relative w-full sm:w-48 lg:w-64"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input placeholder="Search..." className="h-10 pl-10 text-xs bg-white/80 rounded-xl w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                                </div>
                            </div>

                            {activeView === "kanban" ? (
                                <div className="flex gap-4 overflow-x-auto pb-4 pt-2 flex-1 items-start">
                                    <StatusColumn status="Planned" title="Planned" icon={Calendar} colorClass="bg-indigo-500" />
                                    <StatusColumn status="Dispatched" title="Dispatched" icon={Navigation} colorClass="bg-blue-500" />
                                    <StatusColumn status="In Transit" title="Transit" icon={ArrowRight} colorClass="bg-blue-600" />
                                    <StatusColumn status="At Destination" title="Arrived" icon={MapPin} colorClass="bg-emerald-500" />
                                    <StatusColumn status="Returning" title="Returning" icon={RefreshCw} colorClass="bg-amber-500" />
                                    <StatusColumn status="Completed" title="Finished" icon={CheckCircle2} colorClass="bg-slate-500" />
                                </div>
                            ) : (
                                <Tabs defaultValue="Planned" className="h-full mt-4">
                                    <TabsList className="bg-slate-100/50 p-1 w-fit border rounded-xl mb-2">
                                        {(['Planned', 'Dispatched', 'In Transit', 'At Destination', 'Returning', 'Completed'] as TripStatus[]).map(status => (
                                            <TabsTrigger key={status} value={status} className="text-xs font-bold px-5 rounded-lg transition-all duration-300">
                                                {status} ({getTripsByStatus(status).length})
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                    {(['Planned', 'Dispatched', 'In Transit', 'At Destination', 'Returning', 'Completed'] as TripStatus[]).map(status => (
                                        <TabsContent key={status} value={status} className="flex-1 h-full overflow-y-auto pb-20">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                                {getFilteredTrips(status).map(trip => (
                                                    <Card key={trip.id} className="group hover:shadow-xl transition-all duration-300 border-none bg-white rounded-2xl shadow-sm overflow-hidden">
                                                        <CardContent className="p-4 space-y-4">
                                                            <div className="flex justify-between items-start">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">{trip.trip_number}</span>
                                                                    <span className="text-xs font-medium text-slate-400">{format(new Date(trip.created_at), 'MMM dd, HH:mm')}</span>
                                                                </div>
                                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-primary" onClick={() => handlePrintTrip(trip)}><Printer className="h-3.5 w-3.5" /></Button>
                                                                    {status === 'Planned' && <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500" onClick={() => { setTripToEdit(trip); setIsEditDialogOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>}
                                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" onClick={() => setSelectedTripForSheet(trip)}><DollarSign className="h-3.5 w-3.5" /></Button>
                                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600" onClick={() => { setSelectedTripForTimeline(trip); setIsTimelineOpen(true); }}><Clock className="h-3.5 w-3.5" /></Button>
                                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" disabled={deleteTripMutation.isPending} onClick={() => { if (window.confirm("Are you sure you want to delete this trip?")) { deleteTripMutation.mutate(trip.id); } }}><Trash2 className="h-3.5 w-3.5" /></Button>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 font-medium text-slate-700">{trip.origin} <span className="text-slate-300">→</span> {trip.destination}</div>
                                                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl text-xs">
                                                                <Truck className="w-3.5 h-3.5 text-primary" /> <span className="font-semibold">{trip.vehicle?.vehicle_no}</span>
                                                                <User className="w-3.5 h-3.5 text-slate-400 ml-2" /> <span className="truncate">{trip.driver?.full_name}</span>
                                                            </div>
                                                            <Button size="sm" disabled={updateStatusMutation.isPending || status === 'Completed'} className={`w-full font-medium h-9 ${status === 'Completed' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200 opacity-70' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'}`} onClick={() => {
                                                                if (status === 'Returning') {
                                                                    setSelectedTripForCompletion(trip);
                                                                    setCompletionData({
                                                                        closing_km: trip.closing_km?.toString() || "",
                                                                        actual_fuel_liters: trip.actual_fuel_liters?.toString() || trip.fuel_liters?.toString() || "",
                                                                        actual_fuel_cost: trip.actual_fuel_cost?.toString() || trip.fuel_cost?.toString() || "",
                                                                        return_cargo: trip.cargo_inbound || ""
                                                                    });
                                                                    setIsCompletionDialogOpen(true);
                                                                } else if (status !== 'Completed') {
                                                                    const next: any = { 'Planned': 'Dispatched', 'Dispatched': 'In Transit', 'In Transit': 'At Destination', 'At Destination': 'Returning' };
                                                                    updateStatusMutation.mutate({ id: trip.id, status: next[status] });
                                                                }
                                                            }}>
                                                                {status === 'Planned' && "Dispatch"} {status === 'Dispatched' && "Start Transit"} {status === 'In Transit' && "Mark Arrived"} {status === 'At Destination' && "Return"} {status === 'Returning' && "Finalize"} {status === 'Completed' && "Completed"}
                                                            </Button>
                                                        </CardContent>
                                                    </Card>
                                                ))}
                                            </div>
                                        </TabsContent>
                                    ))}
                                </Tabs>
                            )}
                        </div>
                    )}
                </div>
            )}

            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent className="max-w-xl">
                    <DialogHeader><DialogTitle>Plan New Trip</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">ORIGIN</Label>
                                <Popover open={isOriginPopoverOpen} onOpenChange={setIsOriginPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className={cn("w-full justify-between h-10 px-3 font-normal border-slate-200", !newTrip.origin && "text-slate-400")}>
                                            <span className="truncate">{newTrip.origin || "Select origin..."}</span>
                                            <ChevronsUpDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] sm:w-[300px] z-[100]" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search location..." className="h-9" />
                                            <CommandList>
                                                <CommandEmpty>No location found.</CommandEmpty>
                                                <CommandGroup className="max-h-[200px] overflow-auto">
                                                    {(routeLocations || []).map((r: any) => (
                                                        <CommandItem key={r.id} value={r.location_name} onSelect={(v) => { setNewTrip({ ...newTrip, origin: v.toUpperCase() }); setIsOriginPopoverOpen(false); }} className="text-sm">
                                                            <Check className={cn("mr-2 h-3 w-3", newTrip.origin?.toUpperCase() === r.location_name?.toUpperCase() ? "opacity-100" : "opacity-0")} />
                                                            {r.location_name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">DESTINATION *</Label>
                                <Popover open={isDestPopoverOpen} onOpenChange={setIsDestPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className={cn("w-full justify-between h-10 px-3 font-normal border-slate-200", !newTrip.destination && "text-slate-400")}>
                                            <span className="truncate">{newTrip.destination || "Select destination..."}</span>
                                            <ChevronsUpDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] sm:w-[300px] z-[100]" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search location..." className="h-9" />
                                            <CommandList>
                                                <CommandEmpty>No location found.</CommandEmpty>
                                                <CommandGroup className="max-h-[200px] overflow-auto">
                                                    {(routeLocations || []).map((r: any) => (
                                                        <CommandItem key={r.id} value={r.location_name} onSelect={(v) => { setNewTrip({ ...newTrip, destination: v.toUpperCase() }); setIsDestPopoverOpen(false); }} className="text-sm">
                                                            <Check className={cn("mr-2 h-3 w-3", newTrip.destination?.toUpperCase() === r.location_name?.toUpperCase() ? "opacity-100" : "opacity-0")} />
                                                            {r.location_name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">VEHICLE *</Label>
                                <Popover open={isVehiclePopoverOpen} onOpenChange={setIsVehiclePopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between h-10 px-3 font-normal text-slate-600 border-slate-200">
                                            {newTrip.vehicle_id 
                                                ? `${fleet?.find(f => f.id === newTrip.vehicle_id)?.vehicle_no} - ${fleet?.find(f => f.id === newTrip.vehicle_id)?.make_model}` 
                                                : "Select Vehicle..."}
                                            <ChevronsUpDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] sm:w-[400px] z-[100]" align="start">
                                        <Command className="border-none">
                                            <div className="flex items-center border-b px-3">
                                                <CommandInput 
                                                    placeholder="Search plate number..." 
                                                    className="border-none focus:ring-0 h-11 text-sm font-medium"
                                                />
                                            </div>
                                            <CommandList className="max-h-[400px]">
                                                <CommandEmpty className="py-4 text-center text-xs font-bold text-slate-400">No vehicle found.</CommandEmpty>
                                                <CommandGroup>
                                                    <div className="px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] bg-slate-50 border-y border-slate-100">Horse / Tractor</div>
                                                    {availableVehicles.map(v => (
                                                        <CommandItem 
                                                            key={v.id} 
                                                            value={v.vehicle_no}
                                                            disabled={v.isBusy || v.isGarage}
                                                            onSelect={() => { 
                                                                setNewTrip({ ...newTrip, vehicle_id: v.id }); 
                                                                setIsVehiclePopoverOpen(false); 
                                                            }}
                                                            className={cn(
                                                                "flex flex-col items-start gap-1 py-3 px-4 transition-all duration-200",
                                                                (v.isBusy || v.isGarage) ? "opacity-40 grayscale cursor-not-allowed" : "hover:bg-slate-50"
                                                            )}
                                                        >
                                                            <div className="flex justify-between w-full items-center">
                                                                <span className="text-xs font-bold text-slate-900 tracking-wide uppercase">{v.vehicle_no}</span>
                                                                <Badge variant="outline" className="text-[8px] font-bold tracking-widest uppercase py-0 px-1 border-slate-200 text-slate-400">{v.fleet_category}</Badge>
                                                            </div>
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{v.asset_type || "Medium Truck"}</span>
                                                            
                                                            {v.isBusy && (
                                                                <div className="flex items-center gap-1.5 mt-1 text-amber-600">
                                                                    <AlertTriangle className="w-3 h-3" />
                                                                    <span className="text-[10px] font-black uppercase italic tracking-tighter">Currently on Trip</span>
                                                                </div>
                                                            )}
                                                            {v.isGarage && (
                                                                <div className="flex items-center gap-1.5 mt-1 text-red-600">
                                                                    <AlertTriangle className="w-3 h-3" />
                                                                    <span className="text-[10px] font-black uppercase italic tracking-tighter">In Garage / Maintenance</span>
                                                                </div>
                                                            )}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">DRIVER *</Label>
                                <Popover open={isDriverPopoverOpen} onOpenChange={setIsDriverPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between h-10 px-3 font-normal text-slate-600 border-slate-200">
                                            {newTrip.driver_id 
                                                ? availableDrivers?.find(d => d.id === newTrip.driver_id)?.full_name
                                                : "Select Driver..."}
                                            <ChevronsUpDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] sm:w-[400px] z-[100]" align="start">
                                        <Command className="border-none">
                                            <div className="flex items-center border-b px-3">
                                                <CommandInput 
                                                    placeholder="Search driver name..." 
                                                    className="border-none focus:ring-0 h-11 text-sm font-medium"
                                                />
                                            </div>
                                            <CommandList className="max-h-[400px]">
                                                <CommandEmpty className="py-4 text-center text-xs font-bold text-slate-400">No driver found.</CommandEmpty>
                                                <CommandGroup>
                                                    <div className="px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] bg-slate-50 border-y border-slate-100">Company Drivers</div>
                                                    {availableDrivers.map(d => (
                                                        <CommandItem 
                                                            key={d.id} 
                                                            value={d.full_name}
                                                            disabled={d.isBusy}
                                                            onSelect={() => { 
                                                                setNewTrip({ ...newTrip, driver_id: d.id }); 
                                                                setIsDriverPopoverOpen(false); 
                                                            }}
                                                            className={cn(
                                                                "flex flex-col items-start gap-1 py-3 px-4 transition-all duration-200",
                                                                d.isBusy ? "opacity-40 grayscale cursor-not-allowed" : "hover:bg-slate-50"
                                                            )}
                                                        >
                                                            <div className="flex justify-between w-full items-center">
                                                                <span className="text-sm font-medium text-slate-700">{d.full_name}</span>
                                                                <Badge variant="outline" className="text-[8px] font-bold tracking-widest uppercase py-0 px-1 border-slate-200 text-slate-400">{d.operation_type || 'Local'}</Badge>
                                                            </div>
                                                            {d.isBusy && (
                                                                <div className="flex items-center gap-1.5 mt-1 text-amber-600">
                                                                    <AlertTriangle className="w-3 h-3" />
                                                                    <span className="text-[10px] font-black uppercase italic tracking-tighter">Currently on Trip</span>
                                                                </div>
                                                            )}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <div className="space-y-1.5"><Label className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">OUTBOUND CARGO</Label><Input placeholder="Cargo details..." value={newTrip.cargo_outbound} onChange={(e) => setNewTrip({ ...newTrip, cargo_outbound: e.target.value })} /></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div className="space-y-1.5">
                                <Label className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">STARTING KM</Label>
                                <Input type="number" value={newTrip.starting_km} onChange={(e) => setNewTrip({ ...newTrip, starting_km: e.target.value })} />
                            </div>
                            <div className="space-y-1.5 text-left">
                                <Label className="text-emerald-600 font-bold uppercase text-[10px] tracking-wider block text-right">ALLOWANCE (TSHS)</Label>
                                <Input type="number" placeholder="Enter amount..." value={newTrip.trip_allowance} onChange={(e) => setNewTrip({ ...newTrip, trip_allowance: e.target.value })} className="text-right" />
                            </div>
                        </div>
                    </div>
                    <DialogFooter><Button className="w-full font-bold h-11" disabled={createTripMutation.isPending} onClick={() => createTripMutation.mutate(newTrip)}>{createTripMutation.isPending ? "Planning..." : "Plan & Confirm Trip"}</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Trip Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="max-w-xl">
                    <DialogHeader><DialogTitle>Edit Trip: {tripToEdit?.trip_number}</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">ORIGIN</Label>
                                <Popover open={isEditOriginPopoverOpen} onOpenChange={setIsEditOriginPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className={cn("w-full justify-between h-10 px-3 font-normal border-slate-200", !tripToEdit?.origin && "text-slate-400")}>
                                            <span className="truncate">{tripToEdit?.origin || "Select origin..."}</span>
                                            <ChevronsUpDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] sm:w-[300px] z-[100]" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search location..." className="h-9" />
                                            <CommandList>
                                                <CommandEmpty>No location found.</CommandEmpty>
                                                <CommandGroup className="max-h-[200px] overflow-auto">
                                                    {(routeLocations || []).map((r: any) => (
                                                        <CommandItem key={r.id} value={r.location_name} onSelect={(v) => { setTripToEdit({ ...tripToEdit, origin: v.toUpperCase() }); setIsEditOriginPopoverOpen(false); }} className="text-sm">
                                                            <Check className={cn("mr-2 h-3 w-3", tripToEdit?.origin?.toUpperCase() === r.location_name?.toUpperCase() ? "opacity-100" : "opacity-0")} />
                                                            {r.location_name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">DESTINATION *</Label>
                                <Popover open={isEditDestPopoverOpen} onOpenChange={setIsEditDestPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className={cn("w-full justify-between h-10 px-3 font-normal border-slate-200", !tripToEdit?.destination && "text-slate-400")}>
                                            <span className="truncate">{tripToEdit?.destination || "Select destination..."}</span>
                                            <ChevronsUpDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] sm:w-[300px] z-[100]" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search location..." className="h-9" />
                                            <CommandList>
                                                <CommandEmpty>No location found.</CommandEmpty>
                                                <CommandGroup className="max-h-[200px] overflow-auto">
                                                    {(routeLocations || []).map((r: any) => (
                                                        <CommandItem key={r.id} value={r.location_name} onSelect={(v) => { setTripToEdit({ ...tripToEdit, destination: v.toUpperCase() }); setIsEditDestPopoverOpen(false); }} className="text-sm">
                                                            <Check className={cn("mr-2 h-3 w-3", tripToEdit?.destination?.toUpperCase() === r.location_name?.toUpperCase() ? "opacity-100" : "opacity-0")} />
                                                            {r.location_name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <div className="space-y-1.5"><Label className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">OUTBOUND CARGO</Label><Input placeholder="Cargo details..." value={tripToEdit?.cargo_outbound} onChange={(e) => setTripToEdit({ ...tripToEdit, cargo_outbound: e.target.value })} /></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                             <div className="space-y-1.5"><Label className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">STARTING KM</Label><Input type="number" value={tripToEdit?.starting_km} onChange={(e) => setTripToEdit({ ...tripToEdit, starting_km: e.target.value })} /></div>
                             <div className="space-y-1.5 text-right"><Label className="text-emerald-600 font-bold uppercase text-[10px] tracking-wider block text-right">ALLOWANCE (TSHS)</Label><Input type="number" placeholder="Enter amount..." value={tripToEdit?.trip_allowance} onChange={(e) => setTripToEdit({ ...tripToEdit, trip_allowance: e.target.value })} className="text-right" /></div>
                        </div>
                    </div>
                    <DialogFooter><Button className="w-full font-bold h-11 bg-blue-600 hover:bg-blue-700" disabled={editTripMutation.isPending} onClick={() => editTripMutation.mutate(tripToEdit)}>{editTripMutation.isPending ? "Saving..." : "Save Changes"}</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Trip Completion Dialog */}
            <Dialog open={isCompletionDialogOpen} onOpenChange={setIsCompletionDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Finalize Trip: {selectedTripForCompletion?.trip_number}</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-1.5"><Label className="text-slate-600 font-bold uppercase text-[10px] tracking-wider">Closing KM *</Label><Input type="number" value={completionData.closing_km} onChange={(e) => setCompletionData({ ...completionData, closing_km: e.target.value })} /></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="space-y-1.5"><Label className="text-slate-600 font-bold uppercase text-[10px] tracking-wider">Fuel Liters</Label><Input type="number" value={completionData.actual_fuel_liters} onChange={(e) => setCompletionData({ ...completionData, actual_fuel_liters: e.target.value })} /></div>
                             <div className="space-y-1.5 text-right"><Label className="text-orange-700 font-bold uppercase text-[10px] tracking-wider block text-right font-medium">FUEL COST (TSHS)</Label><Input type="number" placeholder="Enter amount..." value={completionData.actual_fuel_cost} onChange={(e) => setCompletionData({ ...completionData, actual_fuel_cost: e.target.value })} className="text-right" /></div>
                        </div>
                        <div className="space-y-1.5"><Label className="text-blue-600 font-bold uppercase text-[10px] tracking-wider">RETURN CARGO</Label><Input placeholder="Cargo details..." value={completionData.return_cargo} onChange={(e) => setCompletionData({ ...completionData, return_cargo: e.target.value })} /></div>
                    </div>
                    <DialogFooter><Button className="w-full font-bold h-11 bg-slate-900 hover:bg-slate-800" disabled={updateStatusMutation.isPending} onClick={() => { if (!completionData.closing_km) return; updateStatusMutation.mutate({ id: selectedTripForCompletion.id, status: 'Completed', completionData }); setIsCompletionDialogOpen(false); }}>{updateStatusMutation.isPending ? "Confirming..." : "Confirm Finish"}</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Trip Timeline Dialog */}
            <Dialog open={isTimelineOpen} onOpenChange={setIsTimelineOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    {selectedTripForTimeline && (
                        <TripTimeline 
                            tripId={selectedTripForTimeline.id} 
                            vehicleNo={selectedTripForTimeline.vehicle?.vehicle_no}
                            tripNumber={selectedTripForTimeline.trip_number}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Clean & Professional Print View (A4/A5 Compatible) */}
            {selectedTripForPrint && (
                <div id="print-logistics" className="hidden print:block fixed inset-0 bg-white z-[9999] p-8 overflow-auto font-sans text-slate-900">
                    <div className="max-w-[190mm] mx-auto">
                        {/* Header Section */}
                        <div className="border-t-2 border-slate-900 pt-6 flex justify-between items-start mb-8">
                            <div>
                                <h1 className="text-3xl font-bold tracking-tight">TRIP SHEET</h1>
                                <p className="text-sm font-medium text-slate-500 mt-1">Ref: {selectedTripForPrint.trip_number}</p>
                            </div>
                            <div className="text-right">
                                <h2 className="text-xl font-bold uppercase tracking-wide">SUDSUD EAFEED</h2>
                                <p className="text-[10px] font-medium text-slate-500 italic leading-none">Fueling Industry Growth</p>
                                <p className="text-[10px] font-bold text-slate-900 mt-3 whitespace-nowrap">Date: {format(new Date(), 'MMMM do, yyyy h:mm a')}</p>
                            </div>
                        </div>

                        {/* Status & Route Bar */}
                        <div className="grid grid-cols-2 border border-slate-200 rounded-lg overflow-hidden mb-8 bg-slate-50/50">
                            <div className="p-4 border-r border-slate-200">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-2">TRIP STATUS</p>
                                <p className="text-sm font-bold text-slate-900">{selectedTripForPrint.status}</p>
                            </div>
                            <div className="p-4">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-2">ROUTE</p>
                                <p className="text-sm font-bold text-slate-900">{selectedTripForPrint.origin} &rarr; {selectedTripForPrint.destination}</p>
                            </div>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-12 mb-10">
                            {/* Resource Assignment */}
                            <div className="space-y-6">
                                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.15em] border-b border-slate-100 pb-2">RESOURCE ASSIGNMENT</h3>
                                <div className="grid grid-cols-2 gap-y-4 text-sm">
                                    <div>
                                        <p className="text-[10px] font-medium text-slate-400 mb-0.5">Driver Name</p>
                                        <p className="font-bold">{selectedTripForPrint.driver?.full_name}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-medium text-slate-400 mb-0.5">Driver ID</p>
                                        <p className="font-bold">{selectedTripForPrint.driver_id?.slice(0, 8).toUpperCase() || '---'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-medium text-slate-400 mb-0.5">Primary Vehicle</p>
                                        <p className="font-bold">{selectedTripForPrint.vehicle?.vehicle_no}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-medium text-slate-400 mb-0.5">Trailer No</p>
                                        <p className="font-bold">{selectedTripForPrint.trailer?.vehicle_no || '---'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Trip Expenses */}
                            <div className="space-y-6">
                                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.15em] border-b border-slate-100 pb-2">TRIP EXPENSES & FUEL</h3>
                                <div className="grid grid-cols-2 gap-y-4 text-sm">
                                    <div>
                                        <p className="text-[10px] font-medium text-slate-400 mb-0.5">Fuel Allocation</p>
                                        <p className="font-bold text-slate-900">
                                            {selectedTripForPrint.actual_fuel_liters ? `${selectedTripForPrint.actual_fuel_liters}L (Actual)` : `${selectedTripForPrint.fuel_liters || 0}L (Plan)`}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-medium text-slate-400 mb-0.5">Fuel Cost</p>
                                        <p className="font-bold text-slate-900">{formatTSh(selectedTripForPrint.actual_fuel_cost || selectedTripForPrint.fuel_cost || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-medium text-slate-400 mb-0.5">Trip Allowance</p>
                                        <p className="font-bold text-slate-900">{formatTSh(selectedTripForPrint.trip_allowance || 0)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-medium text-slate-400 mb-0.5">Odometer (Start/End)</p>
                                        <p className="font-bold text-slate-900">
                                            {selectedTripForPrint.starting_km?.toLocaleString()} &rarr; {selectedTripForPrint.closing_km?.toLocaleString() || '---'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Load Manifest */}
                        <div className="mb-16">
                            <div className="text-center mb-4">
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] inline-block bg-white px-4">LOAD MANIFEST</p>
                                <div className="h-px bg-slate-100 -mt-2"></div>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="border border-slate-200 rounded-xl p-6 bg-slate-50/20">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Outbound Cargo</p>
                                    <p className="text-sm font-bold text-slate-900 leading-relaxed uppercase min-h-[40px]">{selectedTripForPrint.cargo_outbound || 'NIL'}</p>
                                </div>
                                <div className="border border-slate-200 rounded-xl p-6 bg-slate-50/20">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Inbound (Backhaul)</p>
                                    <p className="text-sm font-bold text-slate-900 leading-relaxed uppercase min-h-[40px]">{selectedTripForPrint.cargo_inbound || 'NIL'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Signatures */}
                        <div className="grid grid-cols-2 gap-20 pt-8 border-t border-slate-100">
                            <div className="space-y-12">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">DISPATCHER SIGNATURE</p>
                                <div className="border-b border-slate-900 w-full pb-1 italic text-slate-300 text-sm">Authorized Official</div>
                            </div>
                            <div className="space-y-12 text-right flex flex-col items-end">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">DRIVER SIGNATURE</p>
                                <div className="border-b border-slate-900 w-full pb-1 text-slate-900 font-bold uppercase text-sm">{selectedTripForPrint.driver?.full_name}</div>
                            </div>
                        </div>

                        {/* Footer info */}
                        <div className="mt-20 text-center">
                            <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest leading-relaxed">
                                Generated by SUDSUD Weighbridge & Logistics System. <br/> Official Trip Sheet Document. &copy; {new Date().getFullYear()}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Formatting Helpers
const formatTSh = (amt: any) => {
    if (!amt) return "";
    const val = parseFloat(amt) || 0;
    return `TShs. ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatUSD = (amt: any) => {
    const val = parseFloat(amt) || 0;
    return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
};

const handleTShInputChange = (val: string, callback: (raw: string) => void) => {
    const digits = val.replace(/\D/g, "");
    callback(digits);
};

export default TripManagement;
