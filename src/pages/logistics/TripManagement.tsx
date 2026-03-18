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
    Navigation, RefreshCw, Filter, Printer, Check, ChevronsUpDown,
    Pencil, Trash2, DollarSign, Map
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { TripSheet } from "@/components/logistics/TripSheet";

// Types
type TripStatus = 'Planned' | 'Dispatched' | 'In Transit' | 'At Destination' | 'Returning' | 'Completed' | 'Cancelled';

const TripManagement = () => {
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
    const [isTrailerPopoverOpen, setIsTrailerPopoverOpen] = useState(false);
    const [isTripSheetOpen, setIsTripSheetOpen] = useState(false);
    const [selectedTripForSheet, setSelectedTripForSheet] = useState<any>(null);

    // De-cluttering State
    const [dateRange, setDateRange] = useState<"Today" | "Yesterday" | "7Days" | "All">("All");
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
        queryKey: ["logistics_trips", dateRange],
        queryFn: async () => {
            let query = supabase
                .from("logistics_trips" as any)
                .select(`
                    *,
                    vehicle:logistics_fleet!vehicle_id(vehicle_no, make_model),
                    trailer:logistics_fleet!trailer_id(vehicle_no, make_model),
                    driver:logistics_drivers!driver_id(full_name)
                `);

            if (dateRange !== "All") {
                const now = new Date();
                let filterDate = new Date();

                if (dateRange === "Today") {
                    filterDate.setHours(0, 0, 0, 0);
                } else if (dateRange === "Yesterday") {
                    filterDate.setDate(now.getDate() - 1);
                    filterDate.setHours(0, 0, 0, 0);
                    // For yesterday we need a range
                    const endOfYesterday = new Date(filterDate);
                    endOfYesterday.setHours(23, 59, 59, 999);
                    query = query.lte("created_at", endOfYesterday.toISOString());
                } else if (dateRange === "7Days") {
                    filterDate.setDate(now.getDate() - 7);
                    filterDate.setHours(0, 0, 0, 0);
                }

                query = query.gte("created_at", filterDate.toISOString());
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
                .select("id, vehicle_no, asset_type, asset_status, assignment_status, coupling_status")
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
            const { data } = await supabase
                .from("logistics_trips" as any)
                .select("vehicle_id, trailer_id, driver_id")
                .in("status", ["Planned", "Dispatched", "In Transit", "At Destination", "Returning"]);
            return (data || []) as any[];
        }
    });

    const { data: drivers } = useQuery({
        queryKey: ["drivers_available"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_drivers" as any)
                .select("id, full_name, compliance_flagged, license_expiry")
                .eq("is_active", true)
                .eq("compliance_flagged", false);
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

    // Filtered Resources (Only show available ones)
    const availableVehicles = fleet?.map(v => {
        const typeInfo = assetTypes?.find(t => t.name === v.asset_type);
        const isRecordedOnTrip = activeTripResources?.some(tr => tr.vehicle_id === v.id || tr.trailer_id === v.id);
        const isBusy = v.assignment_status === 'On Job' || v.assignment_status === 'In Transit' || isRecordedOnTrip;
        const isGarage = v.asset_status === 'In Garage' || v.asset_status === 'Inactive';

        // Articulated check
        const isArticulated = (typeInfo as any)?.requires_coupling;
        const isCoupled = v.coupling_status === 'coupled';

        // We only show Horses (if they need coupling, they must be coupled) or standalone vehicles
        let shouldShow = false;
        if (typeInfo?.type_category === 'Vehicle') {
            if (isArticulated) {
                if (isCoupled) shouldShow = true;
            } else {
                shouldShow = true;
            }
        } else if (!typeInfo && !v.asset_type?.toLowerCase()?.includes('trailer')) {
            shouldShow = true;
        }

        return {
            ...v,
            isBusy,
            isGarage,
            shouldShow
        };
    }).filter(v => v.shouldShow) || [];

    const availableTrailers = fleet?.map(v => {
        const typeInfo = assetTypes?.find(t => t.name === v.asset_type);
        const isRecordedOnTrip = activeTripResources?.some(tr => tr.vehicle_id === v.id || tr.trailer_id === v.id);
        const isBusy = v.assignment_status === 'On Job' || v.assignment_status === 'In Transit' || isRecordedOnTrip;
        const isGarage = v.asset_status === 'In Garage' || v.asset_status === 'Inactive';

        let isTrailer = typeInfo?.type_category === 'Trailer' || v.asset_type?.toLowerCase()?.includes('trailer');

        return {
            ...v,
            isBusy,
            isGarage,
            isTrailer
        };
    }).filter(v => v.isTrailer) || [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const availableDrivers = (drivers as any[])?.filter(d =>
        !d.license_expiry || new Date(d.license_expiry) >= today
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

            const formattedData = {
                ...tripData,
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
                notes: "",
                starting_km: "",
                fuel_liters: "",
                fuel_cost: "",
                trip_allowance: ""
            });
            toast({ title: "Trip Created", description: "The trip has been successfully planned." });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error", description: error.message });
        }
    });

    const editTripMutation = useMutation({
        mutationFn: async (tripData: any) => {
            // Explicitly pick only editable columns to avoid schema errors with computed/readonly columns
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
                created_at: tripData.created_at // Allow updating the timestamp
            };

            const { error } = await supabase
                .from("logistics_trips" as any)
                .update(formattedData)
                .eq("id", tripData.id);

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
            if (status === 'Returning') updates.return_trip_start_date = now;

            if (status === 'Completed') {
                updates.completion_date = now;

                // POD Upload
                if (podFile) {
                    try {
                        const fileExt = podFile.name.split('.').pop();
                        const fileName = `pod_${id}_${Date.now()}.${fileExt}`;
                        const { data: uploadData, error: uploadError } = await supabase.storage
                            .from('trip-pods')
                            .upload(fileName, podFile);
                        if (uploadError) throw uploadError;

                        const { data: { publicUrl } } = supabase.storage
                            .from('trip-pods')
                            .getPublicUrl(fileName);
                        updates.pod_url = publicUrl;
                    } catch (err) {
                        console.error("POD upload failed:", err);
                    }
                }

                if (completionData) {
                    updates.closing_km = completionData.closing_km ? Number(completionData.closing_km) : 0;
                    updates.actual_fuel_liters = completionData.actual_fuel_liters ? Number(completionData.actual_fuel_liters) : 0;
                    updates.actual_fuel_cost = completionData.actual_fuel_cost ? Number(completionData.actual_fuel_cost) : 0;
                    updates.cargo_inbound = completionData.return_cargo || null;
                }
            }

            const { data: tripData, error: tripError } = await supabase
                .from("logistics_trips" as any)
                .update(updates)
                .eq("id", id)
                .select("vehicle_id")
                .single();
            if (tripError) throw tripError;

            // Sync Odometer to Fleet
            if (status === 'Completed' && updates.closing_km && (tripData as any)?.vehicle_id) {
                await supabase
                    .from("logistics_fleet" as any)
                    .update({ current_odometer: updates.closing_km })
                    .eq("id", (tripData as any).vehicle_id);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trips"] });
            queryClient.invalidateQueries({ queryKey: ["active_trip_resources"] });
            queryClient.invalidateQueries({ queryKey: ["logistics-fleet"] });
            setPodFile(null);
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

    const handlePrintTrip = (trip: any) => {
        setSelectedTripForPrint(trip);
        setTimeout(() => {
            window.print();
        }, 300);
    };

    const getTripsByStatus = (status: TripStatus) => {
        return (trips as any[])?.filter((t: any) => t.status === status) || [];
    };

    const getFilteredTrips = (status: TripStatus) => {
        const statusTrips = getTripsByStatus(status);
        if (!searchTerm) return statusTrips;

        const term = searchTerm.toLowerCase();
        return statusTrips.filter((t: any) =>
            t.trip_number?.toLowerCase()?.includes(term) ||
            t.vehicle?.vehicle_no?.toLowerCase()?.includes(term) ||
            t.trailer?.vehicle_no?.toLowerCase()?.includes(term) ||
            t.destination?.toLowerCase()?.includes(term) ||
            t.driver?.full_name?.toLowerCase()?.includes(term)
        );
    };

    const StatusColumn = ({ status, title, icon: Icon, colorClass }: any) => {
        const isCollapsed = collapsedColumns[status];
        const filteredTrips = getFilteredTrips(status);
        const totalCount = getTripsByStatus(status).length;

        return (
            <div className={cn(
                "bg-slate-50/50 rounded-lg p-2 flex flex-col gap-3 transition-all duration-300",
                isCollapsed ? "w-[60px] min-w-[60px]" : "flex-1 min-w-[280px]"
            )}>
                <div
                    className={cn(
                        "flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-opacity-20 transition-colors",
                        colorClass, "bg-opacity-10 border border-opacity-20"
                    )}
                    onClick={() => setCollapsedColumns(prev => ({ ...prev, [status]: !prev[status] }))}
                >
                    <Icon className={cn("w-4 h-4 shrink-0", colorClass.replace("bg-", "text-"))} />
                    {!isCollapsed && (
                        <>
                            <h3 className={cn("font-bold text-sm truncate", colorClass.replace("bg-", "text-"))}>{title}</h3>
                            <span className={cn(
                                "ml-auto px-2 py-0.5 rounded text-xs font-bold shadow-sm transition-colors",
                                searchTerm && filteredTrips.length > 0 ? "bg-primary text-white" : "bg-white text-slate-900"
                            )}>
                                {searchTerm ? filteredTrips.length : totalCount}
                            </span>
                        </>
                    )}
                    {isCollapsed && (
                        <span className={cn(
                            "mx-auto text-[10px] font-bold",
                            searchTerm && filteredTrips.length > 0 ? "text-primary" : ""
                        )}>
                            {searchTerm ? filteredTrips.length : totalCount}
                        </span>
                    )}
                </div>

                {!isCollapsed && (
                    <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-280px)]">
                        {filteredTrips.map((trip: any) => (
                            <Card key={trip.id} className={cn(
                                "shadow-sm hover:shadow-md transition-shadow cursor-pointer border-l-4",
                                status === 'Completed' ? "border-l-slate-400 opacity-80" : "border-l-primary"
                            )}>
                                <CardContent className={cn("p-3 space-y-3", status === 'Completed' && "py-2")}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-500">{trip.trip_number}</span>
                                            <Badge variant="outline" className="text-[10px] w-fit mt-1">{trip.created_at ? format(new Date(trip.created_at), 'MMM dd') : 'N/A'}</Badge>
                                        </div>
                                        <div className="flex gap-1">
                                            {status === 'Planned' && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-blue-600"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setTripToEdit(trip);
                                                        setIsEditDialogOpen(true);
                                                    }}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-400 hover:text-rose-600"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm("Are you sure you want to delete this trip?")) {
                                                        deleteTripMutation.mutate(trip.id);
                                                    }
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-400 hover:text-primary"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePrintTrip(trip);
                                                }}
                                            >
                                                <Printer className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-slate-400 hover:text-emerald-600"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedTripForSheet(trip);
                                                    setIsTripSheetOpen(true);
                                                }}
                                            >
                                                <DollarSign className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    {status !== 'Completed' ? (
                                        <>
                                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                                <span className="truncate max-w-[80px]">{trip.origin}</span>
                                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                                <span className="truncate max-w-[100px]">{trip.destination}</span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="text-[10px] text-slate-500 bg-slate-100 p-1.5 rounded flex items-center gap-1">
                                                    <Truck className="w-3 h-3 text-primary/70" />
                                                    <span className="truncate">{trip.vehicle?.vehicle_no}</span>
                                                    {trip.trailer && <span className="text-slate-400">/ {trip.trailer.vehicle_no}</span>}
                                                </div>
                                                <div className="text-[10px] text-slate-500 bg-slate-100 p-1.5 rounded flex items-center gap-1">
                                                    <User className="w-3 h-3 text-primary/70" />
                                                    <span className="truncate">{trip.driver?.full_name}</span>
                                                </div>
                                            </div>

                                            {trip.cargo_outbound && (
                                                <div className="text-[10px] flex items-center gap-1 text-slate-600 italic">
                                                    <Package className="w-3 h-3 text-emerald-600" />
                                                    <span className="truncate">{trip.cargo_outbound}</span>
                                                </div>
                                            )}

                                            {(trip.fuel_liters || trip.trip_allowance) && (
                                                <div className="flex flex-wrap gap-2 pt-1 border-t border-dotted mt-1">
                                                    {trip.fuel_liters && (
                                                        <div className="text-[10px] flex items-center gap-1 text-orange-600 font-bold bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">
                                                            <Navigation className="w-2.5 h-2.5 rotate-45" />
                                                            {trip.fuel_liters}L
                                                        </div>
                                                    )}
                                                    {trip.trip_allowance && (
                                                        <div className="text-[10px] flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                                            Allow: {parseFloat(trip.trip_allowance).toLocaleString()}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="bg-slate-50 p-2 rounded text-[10px] space-y-1 mt-1">
                                            <div className="flex justify-between font-medium">
                                                <span>{trip.origin} → {trip.destination}</span>
                                                <span className="text-emerald-600 font-bold">Done</span>
                                            </div>
                                            <div className="text-slate-500 flex justify-between">
                                                <span>{trip.vehicle?.vehicle_no} • {trip.driver?.full_name?.split(' ')[0]}</span>
                                                {trip.departure_date && trip.completion_date && (
                                                    <span className="text-indigo-600 font-bold">
                                                        TAT: {formatDuration(trip.departure_date, trip.completion_date)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {status === 'At Destination' && trip.arrival_destination_date && (
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                                            <MapPin className="w-3 h-3" />
                                            Time at Destination: {formatDuration(trip.arrival_destination_date, new Date().toISOString())}
                                        </div>
                                    )}

                                    {(status === 'In Transit' || status === 'Returning' || status === 'At Destination') && (
                                        (() => {
                                            const startTime = status === 'At Destination' ? trip.arrival_destination_date : (status === 'In Transit' ? trip.departure_date : trip.return_trip_start_date);
                                            if (!startTime) return null;
                                            const hours = (new Date().getTime() - new Date(startTime).getTime()) / (1000 * 60 * 60);
                                            const threshold = status === 'At Destination' ? 24 : 48;

                                            if (hours > threshold) {
                                                return (
                                                    <div className="flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded animate-pulse">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        DELAY ALERT: {Math.floor(hours)}h elapsed
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()
                                    )}

                                    <div className="pt-1">
                                        {status === 'Planned' && (
                                            <Button
                                                size="sm"
                                                className="w-full h-7 text-xs bg-indigo-600 hover:bg-indigo-700"
                                                disabled={updateStatusMutation.isPending}
                                                onClick={() => updateStatusMutation.mutate({ id: trip.id, status: 'Dispatched' })}>
                                                {updateStatusMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : "Dispatch"}
                                                {!updateStatusMutation.isPending && <Navigation className="w-3 h-3 ml-2" />}
                                            </Button>
                                        )}
                                        {status === 'Dispatched' && (
                                            <Button
                                                size="sm"
                                                className="w-full h-7 text-xs bg-blue-600 hover:bg-blue-700"
                                                disabled={updateStatusMutation.isPending}
                                                onClick={() => updateStatusMutation.mutate({ id: trip.id, status: 'In Transit' })}>
                                                {updateStatusMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : "Start Transit"}
                                                {!updateStatusMutation.isPending && <ArrowRight className="w-3 h-3 ml-2" />}
                                            </Button>
                                        )}
                                        {status === 'In Transit' && (
                                            <Button
                                                size="sm"
                                                className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                                                disabled={updateStatusMutation.isPending}
                                                onClick={() => updateStatusMutation.mutate({ id: trip.id, status: 'At Destination' })}>
                                                {updateStatusMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : "Arrived"}
                                                {!updateStatusMutation.isPending && <MapPin className="w-3 h-3 ml-2" />}
                                            </Button>
                                        )}
                                        {status === 'At Destination' && (
                                            <Button
                                                size="sm"
                                                className="w-full h-7 text-xs bg-amber-600 hover:bg-amber-700"
                                                disabled={updateStatusMutation.isPending}
                                                onClick={() => updateStatusMutation.mutate({ id: trip.id, status: 'Returning' })}>
                                                {updateStatusMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : "Return"}
                                                {!updateStatusMutation.isPending && <RefreshCw className="w-3 h-3 ml-2" />}
                                            </Button>
                                        )}
                                        {status === 'Returning' && (
                                            <Button
                                                size="sm"
                                                className="w-full h-7 text-xs bg-slate-800 hover:bg-slate-900"
                                                disabled={updateStatusMutation.isPending}
                                                onClick={() => {
                                                    setSelectedTripForCompletion(trip);
                                                    setCompletionData({
                                                        closing_km: trip.closing_km?.toString() || "",
                                                        actual_fuel_liters: trip.actual_fuel_liters?.toString() || trip.fuel_liters?.toString() || "",
                                                        actual_fuel_cost: trip.actual_fuel_cost?.toString() || trip.fuel_cost?.toString() || "",
                                                        return_cargo: trip.cargo_inbound || ""
                                                    });
                                                    setIsCompletionDialogOpen(true);
                                                }}>
                                                Finish <CheckCircle2 className="w-3 h-3 ml-2" />
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {filteredTrips.length === 0 && (
                            <div className="text-center p-4 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-xs text-opacity-50">
                                Empty
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-4 md:p-6 space-y-6 h-[calc(100vh-60px)] flex flex-col overflow-hidden bg-white/50 backdrop-blur-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Navigation className="w-6 h-6 text-primary" />
                        </div>
                        Trip Management
                    </h1>
                    <p className="text-sm text-muted-foreground ml-10">Monitor dispatch, transit, and delivery workflows.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* View Switcher */}
                    <div className="flex bg-slate-100/50 p-1 rounded-xl border backdrop-blur-sm">
                        <Button
                            variant={activeView === "kanban" ? "secondary" : "ghost"}
                            size="sm"
                            className={cn("h-8 px-4 rounded-lg text-xs font-bold transition-all duration-300", activeView === "kanban" && "shadow-sm border bg-white")}
                            onClick={() => setActiveView("kanban")}
                        >
                            Board
                        </Button>
                        <Button
                            variant={activeView === "tabs" ? "secondary" : "ghost"}
                            size="sm"
                            className={cn("h-8 px-4 rounded-lg text-xs font-bold transition-all duration-300", activeView === "tabs" && "shadow-sm border bg-white")}
                            onClick={() => setActiveView("tabs")}
                        >
                            Tabs
                        </Button>
                    </div>

                    {/* Date Scoping */}
                    <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
                        <SelectTrigger className="w-[150px] h-10 text-xs font-bold bg-white/80 border-slate-200 rounded-xl shadow-sm">
                            <Calendar className="w-3.5 h-3.5 mr-2 text-primary" />
                            <SelectValue placeholder="Date Range" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-slate-200">
                            <SelectItem value="Today">Today Only</SelectItem>
                            <SelectItem value="Yesterday">Yesterday</SelectItem>
                            <SelectItem value="7Days">Last 7 Days</SelectItem>
                            <SelectItem value="All">All Historical</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Quick Search */}
                    <div className="relative w-48 md:w-64">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search trip, vehicle, city..."
                            className="h-10 pl-10 text-xs bg-white/80 border-slate-200 rounded-xl shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="h-10 shadow-lg font-bold bg-slate-900 rounded-xl hover:bg-slate-800 transition-all">
                                <Plus className="w-4 h-4 mr-2" />
                                Plan New Trip
                            </Button>
                        </DialogTrigger>
                        {/* New Trip Dialog */}
                        <DialogContent className="max-w-xl rounded-2xl">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Plus className="w-5 h-5 text-primary" />
                                    Plan New Trip
                                </DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto px-1 scrollbar-hide">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-500 uppercase">Origin</Label>
                                        <Input className="rounded-lg" value={newTrip.origin} onChange={(e) => setNewTrip({ ...newTrip, origin: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-500 uppercase">Destination *</Label>
                                        <Input className="rounded-lg" placeholder="City/Port" value={newTrip.destination} onChange={(e) => setNewTrip({ ...newTrip, destination: e.target.value })} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-500 uppercase">Vehicle *</Label>
                                        <Popover open={isVehiclePopoverOpen} onOpenChange={setIsVehiclePopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    aria-expanded={isVehiclePopoverOpen}
                                                    className="w-full justify-between rounded-lg h-10"
                                                >
                                                    {newTrip.vehicle_id
                                                        ? fleet?.find((f) => f.id === newTrip.vehicle_id)?.vehicle_no
                                                        : "Select Vehicle..."}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-full p-0" align="start">
                                                <Command>
                                                    <CommandInput placeholder="Search plate number..." />
                                                    <CommandList>
                                                        <CommandEmpty>No vehicle found.</CommandEmpty>
                                                        <CommandGroup>
                                                            {availableVehicles.map((v: any) => (
                                                                <CommandItem
                                                                    key={v.id}
                                                                    value={`${v.vehicle_no} ${v.asset_type}`}
                                                                    disabled={v.isBusy || v.isGarage}
                                                                    onSelect={() => {
                                                                        const coupling = couplings?.find(c => c.horse_id === v.id);
                                                                        const typeInfo = assetTypes?.find(t => t.name === v.asset_type);
                                                                        const needsCoupling = (typeInfo as any)?.requires_coupling;

                                                                        setNewTrip({
                                                                            ...newTrip,
                                                                            vehicle_id: v.id,
                                                                            trailer_id: (needsCoupling && coupling) ? coupling.trailer_id : ""
                                                                        });
                                                                        setIsVehiclePopoverOpen(false);
                                                                    }}
                                                                >
                                                                    <Check
                                                                        className={cn(
                                                                            "mr-2 h-4 w-4",
                                                                            newTrip.vehicle_id === v.id ? "opacity-100" : "opacity-0"
                                                                        )}
                                                                    />
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold">{v.vehicle_no}</span>
                                                                        <span className="text-[10px] text-slate-500">{v.asset_type}</span>
                                                                        {v.isBusy && <span className="text-[10px] text-rose-500 font-bold italic">⚠️ Currently on Trip</span>}
                                                                        {v.isGarage && <span className="text-[10px] text-amber-500 font-bold italic">⛔ In Garage</span>}
                                                                    </div>
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-500 uppercase">Driver *</Label>
                                        <Select onValueChange={(v) => setNewTrip({ ...newTrip, driver_id: v })}>
                                            <SelectTrigger className="rounded-lg h-10"><SelectValue placeholder="Select Driver" /></SelectTrigger>
                                            <SelectContent>
                                                {availableDrivers.map((d: any) => (
                                                    <SelectItem key={d.id} value={d.id} disabled={d.isBusy}>
                                                        {d.full_name} {d.isBusy && "⚠️ (On Trip)"}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-500 uppercase">Outbound Cargo</Label>
                                    <Input className="rounded-lg" placeholder="Description of goods" value={newTrip.cargo_outbound} onChange={(e) => setNewTrip({ ...newTrip, cargo_outbound: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-indigo-600 uppercase">Starting KM</Label>
                                        <Input type="number" className="rounded-lg bg-white" placeholder="0" value={newTrip.starting_km} onChange={(e) => setNewTrip({ ...newTrip, starting_km: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-emerald-600 uppercase">Trip Allow. (TShs)</Label>
                                        <Input type="number" className="rounded-lg bg-white" placeholder="0" value={newTrip.trip_allowance} onChange={(e) => setNewTrip({ ...newTrip, trip_allowance: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button className="w-full h-11 rounded-xl text-base font-bold shadow-lg" disabled={createTripMutation.isPending} onClick={() => createTripMutation.mutate(newTrip)}>
                                    {createTripMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                                    Plan & Confirm Trip
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Board View vs Tab View */}
            {activeView === "kanban" ? (
                <div className="flex gap-4 overflow-x-auto pb-4 flex-1 items-start scrollbar-thin scrollbar-thumb-slate-200">
                    <StatusColumn status="Planned" title="Planned" icon={Calendar} colorClass="bg-indigo-500" />
                    <StatusColumn status="Dispatched" title="Dispatched" icon={Navigation} colorClass="bg-blue-500" />
                    <StatusColumn status="In Transit" title="In Transit" icon={ArrowRight} colorClass="bg-blue-600" />
                    <StatusColumn status="At Destination" title="At Destination" icon={MapPin} colorClass="bg-emerald-500" />
                    <StatusColumn status="Returning" title="Returning" icon={RefreshCw} colorClass="bg-amber-500" />
                    <StatusColumn status="Completed" title="Completed" icon={CheckCircle2} colorClass="bg-slate-500" />
                </div>
            ) : (
                <div className="flex-1 overflow-hidden flex flex-col gap-4">
                    <Tabs defaultValue="Planned" className="h-full flex flex-col">
                        <TabsList className="bg-slate-100/50 p-1 w-fit border rounded-xl backdrop-blur-sm self-start mb-2">
                            {(['Planned', 'Dispatched', 'In Transit', 'At Destination', 'Returning', 'Completed'] as TripStatus[]).map(status => (
                                <TabsTrigger key={status} value={status} className="text-xs font-bold px-5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                    {status === 'At Destination' ? 'Destination' : status}
                                    <Badge
                                        variant={searchTerm && getFilteredTrips(status).length > 0 ? "default" : "secondary"}
                                        className={cn(
                                            "ml-2 h-4 px-1 text-[10px] min-w-[18px] justify-center transition-all",
                                            searchTerm && getFilteredTrips(status).length > 0 && "bg-primary"
                                        )}
                                    >
                                        {searchTerm ? getFilteredTrips(status).length : getTripsByStatus(status).length}
                                    </Badge>
                                </TabsTrigger>
                            ))}
                        </TabsList>

                        {(['Planned', 'Dispatched', 'In Transit', 'At Destination', 'Returning', 'Completed'] as TripStatus[]).map(status => {
                            const filteredTrips = getFilteredTrips(status);
                            return (
                                <TabsContent key={status} value={status} className="flex-1 mt-0 overflow-hidden outline-none">
                                    <div className="h-full overflow-y-auto pr-2 pb-10 scrollbar-thin scrollbar-thumb-slate-200">
                                        {filteredTrips.length > 0 ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                                                {filteredTrips.map(trip => (
                                                    <Card key={trip.id} className={cn(
                                                        "group hover:shadow-xl transition-all duration-300 border-none bg-white rounded-2xl shadow-sm overflow-hidden",
                                                        status === 'Completed' ? "opacity-80" : ""
                                                    )}>
                                                        {/* Header Stripe based on status */}
                                                        <div className={cn(
                                                            "h-1.5 w-full",
                                                            status === 'Planned' && "bg-indigo-500",
                                                            status === 'Dispatched' && "bg-blue-400",
                                                            status === 'In Transit' && "bg-blue-600",
                                                            status === 'At Destination' && "bg-emerald-500",
                                                            status === 'Returning' && "bg-amber-500",
                                                            status === 'Completed' && "bg-slate-400",
                                                        )} />

                                                        <CardContent className="p-4 space-y-4">
                                                            <div className="flex justify-between items-start">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">{trip.trip_number || 'TRIP-REF'}</span>
                                                                    <span className="text-xs font-bold text-slate-500 mt-0.5">{trip.created_at ? format(new Date(trip.created_at), 'MMM dd, HH:mm') : 'N/A'}</span>
                                                                </div>
                                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => handlePrintTrip(trip)}>
                                                                        <Printer className="h-3.5 w-3.5 text-slate-400" />
                                                                    </Button>
                                                                    {status === 'Planned' && (
                                                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-blue-500" onClick={() => { setTripToEdit(trip); setIsEditDialogOpen(true); }}>
                                                                            <Pencil className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="space-y-1">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                                                                        <MapPin className="w-3 h-3 text-slate-500" />
                                                                    </div>
                                                                    <span className="text-sm font-bold truncate text-slate-800">{trip.destination}</span>
                                                                </div>
                                                                <div className="flex items-center gap-2 pl-3 ml-3 border-l-2 border-slate-100 py-1">
                                                                    <span className="text-[10px] font-medium text-slate-500">From: {trip.origin}</span>
                                                                </div>
                                                            </div>

                                                            <div className="flex flex-col gap-2">
                                                                <div className="flex items-center gap-2 bg-slate-50/80 p-2 rounded-xl border border-slate-100/50">
                                                                    <Truck className="w-3.5 h-3.5 text-primary" />
                                                                    <span className="text-xs font-bold">{trip.vehicle?.vehicle_no}</span>
                                                                    <div className="h-1 w-1 rounded-full bg-slate-300 mx-1" />
                                                                    <span className="text-[10px] font-medium text-slate-500 truncate">{trip.driver?.full_name?.split(' ')[0]}</span>
                                                                </div>
                                                            </div>

                                                            <div className="pt-2">
                                                                <Button
                                                                    size="sm"
                                                                    className={cn(
                                                                        "w-full h-9 rounded-xl text-xs font-bold",
                                                                        status === 'Planned' && "bg-indigo-600 hover:bg-indigo-700",
                                                                        status === 'Dispatched' && "bg-blue-600 hover:bg-blue-700",
                                                                        status === 'In Transit' && "bg-emerald-600 hover:bg-emerald-700",
                                                                        status === 'At Destination' && "bg-amber-600 hover:bg-amber-700",
                                                                        status === 'Returning' && "bg-slate-900",
                                                                        status === 'Completed' && "bg-white border text-slate-500"
                                                                    )}
                                                                    onClick={() => {
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
                                                                            const nextStatusMapping: any = {
                                                                                'Planned': 'Dispatched',
                                                                                'Dispatched': 'In Transit',
                                                                                'In Transit': 'At Destination',
                                                                                'At Destination': 'Returning'
                                                                            };
                                                                            updateStatusMutation.mutate({ id: trip.id, status: nextStatusMapping[status] });
                                                                        }
                                                                    }}
                                                                >
                                                                    {status === 'Planned' && "Dispatch Trip"}
                                                                    {status === 'Dispatched' && "Start Transit"}
                                                                    {status === 'In Transit' && "Mark Arrival"}
                                                                    {status === 'At Destination' && "Start Return"}
                                                                    {status === 'Returning' && "Finalize Trip"}
                                                                    {status === 'Completed' && "Completed"}
                                                                </Button>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50 text-slate-400">
                                                <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                                                    <Truck className="w-8 h-8 opacity-20" />
                                                </div>
                                                <p className="text-sm font-bold">No {status.toLowerCase()} trips</p>
                                                <p className="text-xs">Adjust your date filter to see older records.</p>
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>
                            );
                        })}
                    </Tabs>
                </div>
            )}

            {/* Edit Trip Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="max-w-xl rounded-2xl">
                    <DialogHeader><DialogTitle>Edit Trip: {tripToEdit?.trip_number}</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto px-1">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Origin</Label>
                                <Input value={tripToEdit?.origin} onChange={(e) => setTripToEdit({ ...tripToEdit, origin: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Destination *</Label>
                                <Input placeholder="City/Port" value={tripToEdit?.destination} onChange={(e) => setTripToEdit({ ...tripToEdit, destination: e.target.value })} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Cargo Outbound</Label>
                            <Input placeholder="Description..." value={tripToEdit?.cargo_outbound} onChange={(e) => setTripToEdit({ ...tripToEdit, cargo_outbound: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-4 border-t pt-4">
                            <div className="space-y-2 col-span-2">
                                <Label className="text-slate-500">Trip Date & Time</Label>
                                <div className="flex items-center gap-2 p-2 border rounded-md bg-slate-100 text-slate-500 text-sm">
                                    <Calendar className="w-4 h-4" />
                                    <span>{tripToEdit?.created_at ? format(new Date(tripToEdit.created_at), 'MMM dd, yyyy HH:mm') : 'N/A'} (Recorded)</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground italic">Recorded date cannot be modified.</p>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-indigo-600">Starting KM (Odometer)</Label>
                                <Input type="number" placeholder="0" value={tripToEdit?.starting_km} onChange={(e) => setTripToEdit({ ...tripToEdit, starting_km: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-emerald-600">Trip Allowance (TShs)</Label>
                                <Input type="number" placeholder="Enter amount" value={tripToEdit?.trip_allowance} onChange={(e) => setTripToEdit({ ...tripToEdit, trip_allowance: e.target.value })} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 bg-orange-50/50 p-3 rounded-lg border border-orange-100">
                            <div className="space-y-2">
                                <Label className="text-orange-700">Fuel Liters</Label>
                                <Input type="number" step="0.01" placeholder="0.00" value={tripToEdit?.fuel_liters} onChange={(e) => setTripToEdit({ ...tripToEdit, fuel_liters: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-orange-700">Fuel Cost (TShs)</Label>
                                <Input type="number" placeholder="0" value={tripToEdit?.fuel_cost} onChange={(e) => setTripToEdit({ ...tripToEdit, fuel_cost: e.target.value })} />
                            </div>
                        </div>
                        {tripToEdit?.status === 'Completed' && (
                            <div className="space-y-2 border-t pt-4">
                                <Label className="text-emerald-600 font-bold">Return Cargo (Inbound)</Label>
                                <Input
                                    placeholder="Cargo carried back..."
                                    value={tripToEdit?.cargo_inbound || ""}
                                    onChange={(e) => setTripToEdit({ ...tripToEdit, cargo_inbound: e.target.value })}
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            disabled={editTripMutation.isPending}
                            onClick={() => editTripMutation.mutate(tripToEdit)}
                            className="w-full bg-blue-600"
                        >
                            {editTripMutation.isPending ? "Saving Changes..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Trip Completion Dialog */}
            <Dialog open={isCompletionDialogOpen} onOpenChange={setIsCompletionDialogOpen}>
                <DialogContent className="max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle>Complete Trip: {selectedTripForCompletion?.trip_number}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Closing KM (Odometer) *</Label>
                            <Input
                                type="number"
                                placeholder="Enter ending mileage"
                                value={completionData.closing_km}
                                onChange={(e) => setCompletionData({ ...completionData, closing_km: e.target.value })}
                            />
                            <p className="text-[10px] text-muted-foreground italic">
                                Starting KM was: {selectedTripForCompletion?.starting_km || "Not recorded"}
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Total Fuel Used (Liters)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={completionData.actual_fuel_liters}
                                    onChange={(e) => setCompletionData({ ...completionData, actual_fuel_liters: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Total Fuel Cost (TShs)</Label>
                                <Input
                                    type="number"
                                    value={completionData.actual_fuel_cost}
                                    onChange={(e) => setCompletionData({ ...completionData, actual_fuel_cost: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2 border-t pt-4">
                                <Label className="text-sm font-bold flex items-center gap-2">
                                    <Package className="w-4 h-4 text-emerald-600" />
                                    Return Cargo (Optional)
                                </Label>
                                <Input
                                    placeholder="What is the vehicle carrying back?"
                                    value={completionData.return_cargo}
                                    onChange={(e) => setCompletionData({ ...completionData, return_cargo: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2 border-t pt-4">
                                <Label className="text-sm font-bold flex items-center gap-2">
                                    <FileText className="w-4 h-4" />
                                    Proof of Delivery (Optional)
                                </Label>
                                <Input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => setPodFile(e.target.files?.[0] || null)}
                                    className="bg-slate-50/50"
                                />
                                <p className="text-[10px] text-muted-foreground italic">Upload POD for electronic record keeping.</p>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            disabled={updateStatusMutation.isPending}
                            onClick={() => {
                                if (!completionData.closing_km) {
                                    toast({ variant: "destructive", title: "Missing Info", description: "Closing KM is required." });
                                    return;
                                }
                                updateStatusMutation.mutate({
                                    id: selectedTripForCompletion.id,
                                    status: 'Completed',
                                    completionData,
                                    podFile
                                });
                                setIsCompletionDialogOpen(false);
                            }}
                            className="w-full bg-slate-800"
                        >
                            Confirm Completion
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Trip Financials (Trip Sheet) Dialog */}
            <Dialog open={isTripSheetOpen} onOpenChange={setIsTripSheetOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 border-none bg-slate-50/50 backdrop-blur-xl">
                    <DialogHeader className="p-6 pb-2 sticky top-0 bg-white/80 backdrop-blur-md z-10 border-b">
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                                    <Map className="text-primary" />
                                    Trip Sheet: {selectedTripForSheet?.trip_number}
                                </DialogTitle>
                                <p className="text-sm text-muted-foreground">
                                    {selectedTripForSheet?.vehicle?.vehicle_no} • {selectedTripForSheet?.driver?.full_name} • {selectedTripForSheet?.origin} to {selectedTripForSheet?.destination}
                                </p>
                            </div>
                            <Badge variant="outline" className="h-fit px-3 py-1 bg-white font-bold border-primary/20 text-primary">
                                {selectedTripForSheet?.status}
                            </Badge>
                        </div>
                    </DialogHeader>
                    <div className="p-6">
                        {selectedTripForSheet && (
                            <TripSheet
                                tripId={selectedTripForSheet.id}
                                onSaveSuccess={() => {
                                    queryClient.invalidateQueries({ queryKey: ["logistics_trips"] });
                                }}
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Printable Trip Sheet */}
            {selectedTripForPrint && (
                <div id="print-logistics" className="hidden print:block fixed inset-0 bg-white z-[9999] p-10 overflow-auto">
                    <div className="max-w-4xl mx-auto space-y-8">
                        {/* Header */}
                        <div className="flex justify-between border-b-2 border-primary pb-6">
                            <div>
                                <h1 className="text-3xl font-bold text-primary">TRIP SHEET</h1>
                                <p className="text-gray-500 mt-1">Ref: {selectedTripForPrint.trip_number}</p>
                            </div>
                            <div className="text-right">
                                <h2 className="text-xl font-bold">SUDSUD EAFEEDS</h2>
                                <p className="text-sm text-gray-500 italic">Fueling Industry Growth</p>
                                <p className="text-sm font-medium mt-2">Date: {format(new Date(), 'PPP p')}</p>
                            </div>
                        </div>

                        {/* Status Bar */}
                        <div className="flex border rounded-lg overflow-hidden bg-slate-50">
                            <div className="flex-1 p-3 border-r">
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Trip Status</p>
                                <p className="text-sm font-bold text-indigo-700">{selectedTripForPrint.status}</p>
                            </div>
                            <div className="flex-1 p-3 border-r">
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Route</p>
                                <p className="text-sm font-bold">{selectedTripForPrint.origin} → {selectedTripForPrint.destination}</p>
                            </div>
                        </div>

                        {/* Resource Details */}
                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold border-b pb-1 uppercase text-slate-500">Resource Assignment</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="font-medium text-slate-500">Driver Name</p>
                                        <p className="font-bold">{selectedTripForPrint.driver?.full_name}</p>
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-500">Driver ID</p>
                                        <p className="font-bold">{selectedTripForPrint.driver_id?.split('-')[0]?.toUpperCase() || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-500">Primary Vehicle</p>
                                        <p className="font-bold">{selectedTripForPrint.vehicle?.vehicle_no} ({selectedTripForPrint.vehicle?.make_model || 'N/A'})</p>
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-500">Trailer No</p>
                                        <p className="font-bold">{selectedTripForPrint.trailer?.vehicle_no || 'None'}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-bold border-b pb-1 uppercase text-slate-500">Trip Expenses & Fuel</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <p className="font-medium text-slate-500">Fuel Allocation</p>
                                        <p className="font-bold">{selectedTripForPrint.fuel_liters || 0}L (Plan) / {selectedTripForPrint.actual_fuel_liters || 0}L (Actual)</p>
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-500">Fuel Cost</p>
                                        <p className="font-bold">TShs {parseFloat(selectedTripForPrint.actual_fuel_cost || selectedTripForPrint.fuel_cost || 0).toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-500">Trip Allowance</p>
                                        <p className="font-bold">TShs {parseFloat(selectedTripForPrint.trip_allowance || 0).toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-500">Odometer (Start/End)</p>
                                        <p className="font-bold">{selectedTripForPrint.starting_km || 0} → {selectedTripForPrint.closing_km || '...'}</p>
                                        {selectedTripForPrint.closing_km && (
                                            <p className="text-[10px] text-slate-400">Total: {Number(selectedTripForPrint.closing_km) - Number(selectedTripForPrint.starting_km)} KM</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Cargo Manifest */}
                        <div className="space-y-4 pt-4 border-t-2 border-dotted">
                            <h3 className="text-sm font-bold uppercase text-slate-500 text-center">Load Manifest</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="border rounded p-4">
                                    <h4 className="font-bold text-indigo-700 mb-2 border-b pb-1">Outbound Cargo</h4>
                                    <p className="text-sm min-h-[60px]">{selectedTripForPrint.cargo_outbound || 'No cargo assigned'}</p>
                                </div>
                                <div className="border rounded p-4">
                                    <h4 className="font-bold text-amber-700 mb-2 border-b pb-1">Inbound (Backhaul)</h4>
                                    <p className="text-sm min-h-[60px]">{selectedTripForPrint.cargo_inbound || 'TBA upon return'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Signature Section */}
                        <div className="grid grid-cols-2 gap-12 pt-12">
                            <div className="space-y-8">
                                <div className="border-t border-slate-400 pt-2">
                                    <label className="text-[10px] font-bold uppercase text-slate-500">Dispatcher Signature</label>
                                    <div className="h-10 mt-2 italic text-slate-300">Authorized Official</div>
                                </div>
                            </div>
                            <div className="space-y-8">
                                <div className="border-t border-slate-400 pt-2 text-right">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 text-right block">Driver Signature</label>
                                    <p className="text-sm font-bold mt-2 truncate">{selectedTripForPrint.driver?.full_name}</p>
                                </div>
                            </div>
                        </div>

                        {/* Footer Notes */}
                        <div className="text-[10px] text-slate-400 text-center pt-10 border-t border-slate-100 italic">
                            Generated by SUDSUD Weighbridge & Logistics System. Contact management for any discrepancies.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TripManagement;
