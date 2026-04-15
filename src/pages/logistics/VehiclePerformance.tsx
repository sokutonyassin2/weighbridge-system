import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Printer, Truck, FileText, AlertTriangle, CheckCircle, Clock, MapPin, Calendar, Wrench } from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { Progress } from "@/components/ui/progress";

export default function VehiclePerformance() {
    const [vehicleNo, setVehicleNo] = useState("");
    const [searchVehicle, setSearchVehicle] = useState("");
    const [activeTab, setActiveTab] = useState("all"); // For filtering trips if needed

    // Fetch Vehicle Profile
    const { data: vehicleProfile, isLoading: isLoadingProfile } = useQuery({
        queryKey: ["logistics-vehicle-profile", searchVehicle],
        queryFn: async () => {
            if (!searchVehicle) return null;

            const { data, error } = await supabase
                .from("logistics_fleet")
                .select("*")
                .or(`vehicle_no.ilike.%${searchVehicle}%,horse_number.ilike.%${searchVehicle}%,trailer_number.ilike.%${searchVehicle}%`)
                .single();

            if (error) throw error;
            return data;
        },
        enabled: !!searchVehicle,
    });

    // Fetch Trip History
    const { data: trips } = useQuery({
        queryKey: ["logistics-vehicle-trips", vehicleProfile?.id],
        queryFn: async () => {
            if (!vehicleProfile?.id) return [];

            const { data, error } = await supabase
                .from("logistics_trips")
                .select(`
          *,
          driver:logistics_drivers(full_name),
          horse:logistics_fleet!horse_id(vehicle_no, make_model),
          trailer:logistics_fleet!trailer_id(trailer_number)
        `)
                .or(`horse_id.eq.${vehicleProfile.id},trailer_id.eq.${vehicleProfile.id}`)
                .order("departure_date", { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!vehicleProfile?.id,
    });

    // Fetch Compliance Documents
    const { data: documents } = useQuery({
        queryKey: ["logistics-vehicle-docs", vehicleProfile?.id],
        queryFn: async () => {
            if (!vehicleProfile?.id) return [];

            const { data, error } = await supabase
                .from("logistics_fleet_documents" as any)
                .select("*")
                .eq("fleet_id", vehicleProfile.id)
                .order("expiry_date", { ascending: true });

            if (error) throw error;
            return data;
        },
        enabled: !!vehicleProfile?.id,
    });

    const handleSearch = () => {
        if (vehicleNo.trim()) {
            setSearchVehicle(vehicleNo.trim().toUpperCase());
        }
    };

    const getStatusInfo = (expiryDate: string) => {
        const date = new Date(expiryDate);
        const daysLeft = differenceInDays(date, new Date());

        if (isPast(date)) return { label: "Expired", color: "bg-rose-600", text: "text-rose-600", icon: <AlertTriangle className="w-4 h-4" />, daysLeft };
        if (daysLeft <= 30) return { label: "Expiring Soon", color: "bg-amber-500", text: "text-amber-600", icon: <Clock className="w-4 h-4" />, daysLeft };
        return { label: "Valid", color: "bg-green-600", text: "text-green-600", icon: <CheckCircle className="w-4 h-4" />, daysLeft };
    };

    const getMaintenanceHealth = (current: number, target: number) => {
        const remaining = (target || 0) - (current || 0);
        const percentage = target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0;

        if (remaining <= 0) return { status: "Overdue", color: "text-rose-600", progressColor: "bg-rose-600" };
        if (remaining <= 1000) return { status: "Due Soon", color: "text-amber-600", progressColor: "bg-amber-500" };
        return { status: "Good", color: "text-green-600", progressColor: "bg-green-600" };
    };

    const stats = {
        totalTrips: trips?.length || 0,
        totalDistance: trips?.reduce((sum, t) => sum + (t.distance_km || 0), 0) || 0,
        completedTrips: trips?.filter(t => t.status === 'Completed').length || 0,
    };

    return (
        <div className="p-6 space-y-8 animate-fade-in max-w-7xl mx-auto print:p-0 print:max-w-none">
            <style type="text/css" media="print">
                {`
                @page { size: auto; margin: 20mm; }
                body * { visibility: hidden; }
                #vehicle-report, #vehicle-report * { visibility: visible; }
                #vehicle-report { position: absolute; left: 0; top: 0; width: 100%; }
                .no-print { display: none !important; }
                `}
            </style>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vehicle Performance Report</h1>
                    <p className="text-slate-500 mt-1">Comprehensive logistics analysis and health check</p>
                </div>
                <div className="flex items-center gap-2">
                    <Card className="w-full md:w-[400px] border-none shadow-sm bg-white">
                        <CardContent className="p-1 flex items-center">
                            <Input
                                className="border-0 focus-visible:ring-0 text-base font-medium"
                                placeholder="Search Vehicle / Trailer No..."
                                value={vehicleNo}
                                onChange={(e) => setVehicleNo(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                            />
                            <Button size="sm" onClick={handleSearch} className="ml-2 bg-slate-900 text-white hover:bg-slate-800">
                                <Search className="h-4 w-4" />
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {!searchVehicle && (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 print:hidden">
                    <div className="bg-slate-100 p-6 rounded-full">
                        <Truck className="h-12 w-12 text-slate-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-700">No Vehicle Selected</h3>
                    <p className="text-slate-500 max-w-sm">Enter a registration number above to view the complete logistics report card.</p>
                </div>
            )}

            {searchVehicle && isLoadingProfile && (
                <div className="text-center py-12 print:hidden">Loading vehicle profile...</div>
            )}

            {searchVehicle && !isLoadingProfile && !vehicleProfile && (
                <div className="text-center py-12 print:hidden">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-rose-100 mb-4">
                        <AlertTriangle className="h-8 w-8 text-rose-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">Vehicle Not Found</h3>
                    <p className="text-slate-500">Could not find any vehicle with registration "{searchVehicle}"</p>
                </div>
            )}

            {vehicleProfile && (
                <div id="vehicle-report" className="space-y-6">
                    {/* ACTION BAR */}
                    <div className="flex justify-end no-print">
                        <Button variant="outline" onClick={() => window.print()} className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50">
                            <Printer className="h-4 w-4" /> Print Logistics Report
                        </Button>
                    </div>

                    {/* REPORT HEADER (PRINT ONLY) */}
                    <div className="hidden print:block mb-10 relative text-slate-900 border-b-2 border-slate-950 pb-8">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-6">
                                <img
                                    src="/images/energy-feeds-logo.jpg"
                                    alt="Logo"
                                    className="h-20 object-contain"
                                />
                                <div>
                                    <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">ENERGY FEEDS LIMITED</h1>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">FLEET PERFORMANCE & LOGISTICS REPORT</p>
                                    <div className="flex gap-4 mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                        <span>Generated: {format(new Date(), "MMM dd, yyyy • HH:mm")}</span>
                                        <span className="opacity-30">•</span>
                                        <span>Department: Logistics Operations</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-3xl font-black text-slate-950 tracking-tighter">
                                    {vehicleProfile.vehicle_no || vehicleProfile.trailer_number}
                                </div>
                                <p className="text-sm font-bold text-slate-600 uppercase tracking-widest mt-1">
                                    {vehicleProfile.make_model || 'Standard Asset'}
                                </p>
                            </div>
                        </div>

                        <h2 className="mt-8 text-sm font-black text-slate-900 uppercase tracking-[0.3em] flex items-center justify-center gap-4">
                            <span className="h-px bg-slate-200 flex-1"></span>
                            OFFICIAL ASSET SCORECARD
                            <span className="h-px bg-slate-200 flex-1"></span>
                        </h2>
                    </div>

                    {/* 1. PROFILE & STATS CARD */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Profile */}
                        <Card className="border-none shadow-sm print:shadow-none print:border print:border-slate-300 bg-white overflow-hidden md:col-span-1">
                            <div className="h-1 bg-slate-900 w-full" />
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base font-bold text-slate-800 flex justify-between items-center">
                                    Vehicle Profile
                                    <Badge variant={vehicleProfile.asset_status === 'Active' ? 'default' : 'secondary'} className="font-semibold">
                                        {vehicleProfile.asset_status}
                                    </Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Registration</p>
                                    <p className="text-xl font-bold text-slate-900">{vehicleProfile.vehicle_no || vehicleProfile.trailer_number}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Make / Model</p>
                                        <p className="font-semibold text-slate-700">{vehicleProfile.make_model || 'N/A'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Type</p>
                                        <p className="font-semibold text-slate-700">{vehicleProfile.asset_type}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Category</p>
                                        <p className="font-medium text-slate-600">{vehicleProfile.fleet_category}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Coupled With</p>
                                        <p className="font-medium text-slate-600">
                                            {vehicleProfile.coupling_status === 'coupled' ? (
                                                <span className="flex items-center gap-1 text-blue-600"><CheckCircle className="w-3 h-3" /> Coupled</span>
                                            ) : 'Uncoupled'}
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Performance Stats */}
                        <Card className="border-none shadow-sm print:shadow-none print:border print:border-slate-300 bg-white overflow-hidden md:col-span-2">
                            <div className="h-1 bg-indigo-600 w-full" />
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base font-bold text-slate-800">Operational Performance</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <MapPin className="w-3 h-3" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider">Total Trips</span>
                                        </div>
                                        <p className="text-2xl font-bold text-indigo-600">{stats.totalTrips}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <CheckCircle className="w-3 h-3" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider">Completed</span>
                                        </div>
                                        <p className="text-2xl font-bold text-green-600">{stats.completedTrips}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <Truck className="w-3 h-3" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider">Distance</span>
                                        </div>
                                        <p className="text-2xl font-bold text-slate-800">{stats.totalDistance.toLocaleString()} <span className="text-xs font-semibold text-slate-400">km</span></p>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <Wrench className="w-3 h-3" />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider">Odometer</span>
                                        </div>
                                        <p className="text-2xl font-bold text-slate-800">{(vehicleProfile.current_odometer || 0).toLocaleString()} <span className="text-xs font-semibold text-slate-400">km</span></p>
                                    </div>
                                </div>

                                <div className="mt-8 pt-6 border-t border-slate-100">
                                    <div className="flex justify-between items-end mb-2">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Maintenance Health</p>
                                            <p className="text-sm font-medium text-slate-700">Next Service at <span className="font-bold">{(vehicleProfile.next_service_odometer || 0).toLocaleString()} km</span></p>
                                        </div>
                                        <Badge variant="outline" className={`font-semibold ${getMaintenanceHealth(vehicleProfile.current_odometer, vehicleProfile.next_service_odometer).color}`}>
                                            {getMaintenanceHealth(vehicleProfile.current_odometer, vehicleProfile.next_service_odometer).status}
                                        </Badge>
                                    </div>
                                    <Progress
                                        value={(vehicleProfile.next_service_odometer > 0) ? (vehicleProfile.current_odometer / vehicleProfile.next_service_odometer) * 100 : 0}
                                        className={`h-2 ${getMaintenanceHealth(vehicleProfile.current_odometer, vehicleProfile.next_service_odometer).progressColor?.replace('bg-', '[&>div]:bg-')}`}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* 2. COMPLIANCE SECTION */}
                    <Card className="border-none shadow-sm print:shadow-none print:border print:border-slate-300 bg-white overflow-hidden break-inside-avoid">
                        <div className="h-1 bg-slate-200 w-full" />
                        <CardHeader className="pb-4">
                            <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-slate-500" />
                                Compliance & Documentation
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead className="font-semibold text-slate-700">Document Type</TableHead>
                                        <TableHead className="font-semibold text-slate-700">Expiry Date</TableHead>
                                        <TableHead className="font-semibold text-slate-700">Status</TableHead>
                                        <TableHead className="text-right font-semibold text-slate-700">Days Remaining</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {documents?.map((doc: any) => {
                                        const status = getStatusInfo(doc.expiry_date);
                                        return (
                                            <TableRow key={doc.id}>
                                                <TableCell className="font-medium text-slate-700">{doc.document_type}</TableCell>
                                                <TableCell className="font-normal text-slate-600">{format(new Date(doc.expiry_date), "MMM dd, yyyy")}</TableCell>
                                                <TableCell>
                                                    <div className={`flex items-center gap-2 text-xs font-semibold uppercase ${status.text}`}>
                                                        {status.icon} {status.label}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Badge className={`${status.color} text-white font-bold h-6`}>
                                                        {status.daysLeft < 0 ? `${Math.abs(status.daysLeft)} DAYS AGO` : `${status.daysLeft} DAYS`}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                    {(!documents || documents.length === 0) && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-6 text-slate-400 italic">No documents recorded for this vehicle.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* 3. TRIP HISTORY TABLE */}
                    <Card className="border-none shadow-sm print:shadow-none print:border print:border-slate-300 bg-white overflow-hidden break-before-auto">
                        <div className="h-1 bg-slate-800 w-full" />
                        <CardHeader className="pb-4">
                            <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-slate-500" />
                                Recent Trip History
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead className="font-semibold text-slate-700">Trip Date</TableHead>
                                        <TableHead className="font-semibold text-slate-700">Route</TableHead>
                                        <TableHead className="font-semibold text-slate-700">Driver</TableHead>
                                        <TableHead className="font-semibold text-slate-700">Cargo</TableHead>
                                        <TableHead className="font-semibold text-slate-700 text-center">Distance</TableHead>
                                        <TableHead className="text-right font-semibold text-slate-700">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {trips?.map((trip: any) => (
                                        <TableRow key={trip.id} className="hover:bg-slate-50/50">
                                            <TableCell className="font-medium text-slate-700">
                                                {format(new Date(trip.departure_date), "MMM dd, HH:mm")}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col text-xs">
                                                    <span className="font-semibold text-slate-700">{trip.route_origin}</span>
                                                    <span className="text-slate-400">to</span>
                                                    <span className="font-semibold text-slate-700">{trip.route_destination}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">{trip.driver?.full_name || 'Unassigned'}</TableCell>
                                            <TableCell className="text-sm text-slate-600">{trip.cargo_type}</TableCell>
                                            <TableCell className="text-center font-mono text-slate-600">{trip.distance_km?.toLocaleString()} km</TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant="outline" className={`font-bold text-[10px] uppercase ${trip.status === 'Completed' ? 'text-green-600 border-green-200 bg-green-50' :
                                                    trip.status === 'In Transit' ? 'text-blue-600 border-blue-200 bg-blue-50' :
                                                        'text-slate-500'
                                                    }`}>
                                                    {trip.status}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {(!trips || trips.length === 0) && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-slate-400 italic">No trip history found.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <div className="hidden print:block mt-12 pt-8 border-t text-center text-xs text-slate-400">
                        <p>Energy Feeds Limited • Logistics Department • Internal Use Only</p>
                    </div>
                </div>
            )}
        </div>
    );
}
