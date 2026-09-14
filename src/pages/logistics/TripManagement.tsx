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
            {/* ── Transit Tracking View ── */}
            <div className="flex-1 overflow-y-auto pb-6">
                <TransitDashboard />
            </div>
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
