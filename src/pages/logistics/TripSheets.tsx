import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    Search,
    DollarSign,
    FileText,
    TrendingUp,
    TrendingDown,
    Calendar,
    ArrowRight,
    Map,
    Plus,
    Truck,
    AlertTriangle,
    Copy,
    ShieldCheck,
    Zap,
    Clock,
    Trash2,
    Folders,
    Layers,
    LayoutGrid
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { TripSheet } from "@/components/logistics/TripSheet";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/use-toast"; // Assuming toast is available from shadcn/ui

const TripSheets = () => {
    const { userRole, user, userProfile } = useAuth();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedTrip, setSelectedTrip] = useState<any>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [duplicateSourceTrip, setDuplicateSourceTrip] = useState<any>(null);
    const [selectedTrips, setSelectedTrips] = useState<string[]>([]);
    const [isConvoyDialogOpen, setIsConvoyDialogOpen] = useState(false);
    const [convoyName, setConvoyName] = useState("");
    const [isProcessingConvoy, setIsProcessingConvoy] = useState(false);
    const isSuperAdmin = userRole === 'super_admin';

    const { data: tripSheets, isLoading, isError, error: queryError, refetch } = useQuery({
        queryKey: ["logistics_trip_sheets_list"],
        queryFn: async () => {
            try {
                // 1. Fetch all trip sheets without FK joins (avoids schema cache issues)
                const { data: sheets, error } = await supabase
                    .from("logistics_trip_sheets" as any)
                    .select("*")
                    .order("created_at", { ascending: false });

                if (error) throw error;
                if (!sheets || sheets.length === 0) return [];

                // 2. Collect unique IDs
                const vehicleIds = [...new Set((sheets as any[]).map(s => s.vehicle_id).filter(Boolean))];
                const driverIds = [...new Set((sheets as any[]).map(s => s.driver_id).filter(Boolean))];

                // 3. Batch fetch vehicles and drivers (only if IDs exist)
                const [vehicleRes, driverRes] = await Promise.all([
                    vehicleIds.length > 0
                        ? supabase.from("logistics_fleet" as any).select("id, vehicle_no, fleet_category").in("id", vehicleIds)
                        : Promise.resolve({ data: [] }),
                    driverIds.length > 0
                        ? supabase.from("logistics_drivers" as any).select("id, full_name").in("id", driverIds)
                        : Promise.resolve({ data: [] }),
                ]);

                const vehicleMap: Record<string, any> = {};
                const driverMap: Record<string, any> = {};
                (vehicleRes.data || []).forEach((v: any) => { vehicleMap[v.id] = v; });
                (driverRes.data || []).forEach((d: any) => { driverMap[d.id] = d; });

                // 4. Attach vehicle and driver to each sheet
                return (sheets as any[]).map(s => ({
                    ...s,
                    vehicle: s.vehicle_id ? vehicleMap[s.vehicle_id] : null,
                    driver: s.driver_id ? driverMap[s.driver_id] : null,
                }));
            } catch (err) {
                console.error("Detailed query catch:", err);
                throw err;
            }
        }
    });

    const filteredSheets = tripSheets?.filter(trip =>
        trip.trip_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.vehicle?.vehicle_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.driver?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.destination?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const stats = tripSheets?.reduce((acc, t) => {
        const rate = parseFloat(t.exchange_rate) || 2700;

        // Revenue
        const revAmt = parseFloat(t.revenue_amount) || 0;
        const revInUSD = t.revenue_currency === 'USD' ? revAmt : revAmt / rate;
        const revInTZS = t.revenue_currency === 'TZS' ? revAmt : revAmt * rate;

        // Expenses
        const expInUSD = parseFloat(t.total_expenses_usd) || 0;
        const expInTZS = parseFloat(t.total_expenses_tzs) || 0;

        // Profit
        const profitInUSD = parseFloat(t.net_profit_usd) || 0;
        const profitInTZS = profitInUSD * rate;

        acc.totalRevenueUSD += revInUSD;
        acc.totalRevenueTZS += revInTZS;
        acc.totalExpensesUSD += expInUSD;
        acc.totalExpensesTZS += expInTZS;
        acc.totalProfitUSD += profitInUSD;
        acc.totalProfitTZS += profitInTZS;

        return acc;
    }, {
        totalRevenueUSD: 0,
        totalRevenueTZS: 0,
        totalExpensesUSD: 0,
        totalExpensesTZS: 0,
        totalProfitUSD: 0,
        totalProfitTZS: 0
    }) || {
        totalRevenueUSD: 0,
        totalRevenueTZS: 0,
        totalExpensesUSD: 0,
        totalExpensesTZS: 0,
        totalProfitUSD: 0,
        totalProfitTZS: 0
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Planned':
                return <Badge className="bg-amber-100 text-amber-800 border-amber-300 animate-pulse gap-1"><Clock size={10} /> Unapproved Draft</Badge>;
            case 'Approved':
                return <Badge className="bg-blue-100 text-blue-800 border-blue-300 gap-1"><ShieldCheck size={10} /> Budget Approved</Badge>;
            case 'Active':
                return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1"><Zap size={10} /> Active Transit</Badge>;
            case 'Completed':
                return <Badge className="bg-slate-100 text-slate-600 gap-1">Completed</Badge>;
            case 'Cancelled':
                return <Badge variant="destructive" className="gap-1">Cancelled</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    if (isSheetOpen) {
        return (
            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            {duplicateSourceTrip ? `Duplicating: ${duplicateSourceTrip.trip_number || `${duplicateSourceTrip.origin} to ${duplicateSourceTrip.destination}`}` : selectedTrip ? `Edit Trip Sheet: ${selectedTrip.trip_number}` : "New Trip Sheet Plan"}
                        </h1>
                        <p className="text-muted-foreground">
                            {duplicateSourceTrip ? `Creating a new copy of the ${duplicateSourceTrip.origin} route. Just assign a new vehicle & driver.` : selectedTrip ? `Managing financials for ${selectedTrip.vehicle?.vehicle_no}` : "Configure assets and financials for a new transit trip."}
                        </p>
                    </div>
                    <Button variant="ghost" onClick={() => { setIsSheetOpen(false); setDuplicateSourceTrip(null); }} className="gap-2">
                        Back to Trip Sheets
                    </Button>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-1">
                    <TripSheet
                        tripId={selectedTrip?.id}
                        duplicateData={duplicateSourceTrip}
                        onSaveSuccess={() => {
                            setIsSheetOpen(false);
                            setDuplicateSourceTrip(null);
                            refetch(); // Refetch data after successful save/duplicate
                        }}
                    />
                </div>
            </div>
        );
    }

    // Convoy Handling Logic
    const handleCreateConvoy = async () => {
        if (!convoyName.trim()) {
            toast({ title: "Naming Required", description: "Please enter a name for this convoy.", variant: "destructive" });
            return;
        }

        setIsProcessingConvoy(true);
        try {
            const convoyId = crypto.randomUUID();
            const { error } = await supabase
                .from('logistics_trip_sheets' as any)
                .update({
                    convoy_id: convoyId,
                    convoy_name: convoyName
                })
                .in('id', selectedTrips);

            if (error) throw error;

            toast({ title: "Convoy Created ✅", description: `Grouped ${selectedTrips.length} vehicles into "${convoyName}"` });
            setSelectedTrips([]);
            setIsConvoyDialogOpen(false);
            setConvoyName("");
            refetch();
        } catch (err: any) {
            toast({ title: "Convoy Creation Failed", description: err.message, variant: "destructive" });
        } finally {
            setIsProcessingConvoy(false);
        }
    };

    // Grouping Logic
    const groupedTrips = filteredSheets?.reduce((acc, trip) => {
        const key = trip.convoy_id || 'unassigned';
        if (!acc[key]) acc[key] = { name: trip.convoy_name || 'Individual Trips', trips: [], totals: { revenueUSD: 0, revenueTZS: 0, expensesUSD: 0, expensesTZS: 0, profitUSD: 0, profitTZS: 0 } };

        acc[key].trips.push(trip);

        const rate = parseFloat(trip.exchange_rate) || 2700;
        const revAmt = parseFloat(trip.revenue_amount) || 0;
        const revUSD = trip.revenue_currency === 'USD' ? revAmt : revAmt / rate;
        const revTZS = trip.revenue_currency === 'TZS' ? revAmt : revAmt * rate;

        acc[key].totals.revenueUSD += revUSD;
        acc[key].totals.revenueTZS += revTZS;
        acc[key].totals.expensesUSD += parseFloat(trip.total_expenses_usd) || 0;
        acc[key].totals.expensesTZS += parseFloat(trip.total_expenses_tzs) || 0;
        acc[key].totals.profitUSD += parseFloat(trip.net_profit_usd) || 0;
        acc[key].totals.profitTZS += (parseFloat(trip.net_profit_usd) || 0) * rate;

        return acc;
    }, {} as Record<string, { name: string, trips: any[], totals: any }>) || {};

    const toggleTripSelection = (id: string) => {
        setSelectedTrips(prev =>
            prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
        );
    };

    return (
        <div className="p-6 space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Trip Sheets & Financials</h1>
                    <p className="text-muted-foreground">Monitor revenue, expenses, and net profit per trip.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search trip, vehicle, or driver..."
                            className="pl-9 h-10 bg-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button className="gap-2 bg-primary" onClick={() => {
                        setSelectedTrip(null);
                        setIsSheetOpen(true);
                    }}>
                        <Plus size={16} />
                        Create New Trip Sheet
                    </Button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
                    <CardHeader className="py-4">
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-indigo-600">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                        <div className="text-xl font-bold font-mono text-indigo-700">${stats.totalRevenueUSD.toLocaleString()}</div>
                        <div className="text-sm font-medium text-indigo-400">TSh {stats.totalRevenueTZS.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-orange-50 to-white border-orange-100">
                    <CardHeader className="py-4">
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-orange-600">Total Operational Cost</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                        <div className="text-xl font-bold font-mono text-orange-700">${stats.totalExpensesUSD.toLocaleString()}</div>
                        <div className="text-sm font-medium text-orange-400">TSh {stats.totalExpensesTZS.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card className={`bg-gradient-to-br ${stats.totalProfitUSD >= 0 ? 'from-emerald-50 to-white border-emerald-100' : 'from-red-50 to-white border-red-100'}`}>
                    <CardHeader className="py-4">
                        <CardTitle className={`text-xs font-bold uppercase tracking-wider ${stats.totalProfitUSD >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Expected Net Profit</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                        <div className={`text-xl font-bold font-mono ${stats.totalProfitUSD >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            ${stats.totalProfitUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <div className={`text-sm font-medium ${stats.totalProfitUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            TSh {stats.totalProfitTZS.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-none shadow-sm bg-white overflow-hidden relative">
                {/* 🛠 Selection Actions Bar */}
                {selectedTrips.length > 0 && (
                    <div className="absolute top-0 left-0 right-0 z-10 bg-slate-900 text-white p-3 flex items-center justify-between animate-in slide-in-from-top duration-300">
                        <div className="flex items-center gap-4 px-2">
                            <span className="text-sm font-bold flex items-center gap-2">
                                <Layers size={16} className="text-emerald-400" />
                                {selectedTrips.length} Trips Selected
                            </span>
                            <div className="h-4 w-px bg-slate-700" />
                            <p className="text-[10px] text-slate-400">Select multiple trips to group them into a single Convoy mission.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white" onClick={() => setSelectedTrips([])}>Cancel</Button>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 gap-2" onClick={() => setIsConvoyDialogOpen(true)}>
                                <Folders size={14} />
                                Create Convoy
                            </Button>
                        </div>
                    </div>
                )}

                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow>
                            <TableHead className="w-10">
                                <Checkbox
                                    checked={selectedTrips.length === filteredSheets?.length && filteredSheets?.length > 0}
                                    onCheckedChange={(checked) => {
                                        if (checked) setSelectedTrips(filteredSheets?.map(t => t.id) || []);
                                        else setSelectedTrips([]);
                                    }}
                                />
                            </TableHead>
                            <TableHead className="font-bold">Trip Details</TableHead>
                            <TableHead className="font-bold">Status</TableHead>
                            <TableHead className="font-bold">Vehicle & Driver</TableHead>
                            <TableHead className="font-bold text-right">Revenue</TableHead>
                            <TableHead className="font-bold text-right">Expenses</TableHead>
                            <TableHead className="font-bold text-right">Net Profit</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={8} className="text-center py-20">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                                    <p className="text-sm text-muted-foreground font-medium">Loading financial records...</p>
                                </div>
                            </TableCell></TableRow>
                        ) : isError ? (
                            <TableRow><TableCell colSpan={8} className="text-center py-20">
                                <div className="flex flex-col items-center gap-2 text-red-500">
                                    <AlertTriangle size={32} />
                                    <p className="font-bold">Failed to load trip records</p>
                                    <p className="text-sm text-red-400">{(queryError as any)?.message || "Internal server error"}</p>
                                </div>
                            </TableCell></TableRow>
                        ) : (!filteredSheets || filteredSheets.length === 0) ? (
                            <TableRow><TableCell colSpan={8} className="text-center py-20">
                                <div className="flex flex-col items-center gap-4 max-w-sm mx-auto">
                                    <div className="p-4 bg-slate-100 rounded-full text-slate-400">
                                        <Truck size={40} />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="font-bold text-lg">No Transit Plans Found</h3>
                                        <p className="text-sm text-muted-foreground">
                                            No pro-forma trip sheets found for Transit vehicles. Click the button above to create your first plan.
                                        </p>
                                    </div>
                                    <Button className="mt-2" onClick={() => {
                                        setSelectedTrip(null);
                                        setIsSheetOpen(true);
                                    }}>
                                        <Plus size={16} className="mr-2" />
                                        Create Your First Trip Sheet
                                    </Button>
                                </div>
                            </TableCell></TableRow>
                        ) : (
                            Object.entries(groupedTrips).map(([convoyId, group]: [string, any]) => (
                                <Fragment key={convoyId}>
                                    {/* 📦 Convoy Subtotal Header Row */}
                                    {convoyId !== 'unassigned' && (
                                        <TableRow key={`header-${convoyId}`} className="bg-slate-50/80 border-y-2 border-slate-200 group hover:bg-slate-100/80 transition-all">
                                            <TableCell colSpan={4} className="py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-slate-900 text-white rounded-lg shadow-sm">
                                                        <Folders size={16} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                                                            {group.name}
                                                            <Badge variant="outline" className="text-[9px] h-4 bg-white border-slate-300">{group.trips.length} Vehicles</Badge>
                                                        </span>
                                                        <span className="text-[10px] text-slate-500 font-medium">CONVOY MISSION SUMMARY</span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-xs font-black text-slate-900">${group.totals.revenueUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                    <span className="text-[9px] text-slate-500 font-bold">TSh {group.totals.revenueTZS.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-xs font-black text-orange-700">${group.totals.expensesUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                    <span className="text-[9px] text-orange-400 font-bold">TSh {group.totals.expensesTZS.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className={`text-xs font-black ${group.totals.profitUSD >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                                        ${group.totals.profitUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </span>
                                                    <span className={`text-[9px] font-bold ${group.totals.profitUSD >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                                                        TSh {group.totals.profitTZS.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400 hover:text-slate-900" title="Remove Convoy Grouping" onClick={async () => {
                                                    if (confirm("Disband this convoy? Trips will return to individual view.")) {
                                                        await supabase.from('logistics_trip_sheets' as any).update({ convoy_id: null, convoy_name: null }).eq('convoy_id', convoyId);
                                                        refetch();
                                                    }
                                                }}>
                                                    Disband
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )}

                                    {group.trips.map((trip) => {
                                        const isProfit = (trip.net_profit_usd || 0) >= 0;
                                        return (
                                            <TableRow key={trip.id} className={`hover:bg-slate-50/50 transition-colors ${trip.status === 'Planned' ? 'border-l-4 border-l-amber-400' :
                                                trip.status === 'Approved' ? 'border-l-4 border-l-blue-400' :
                                                    trip.status === 'Active' ? 'border-l-4 border-l-emerald-400' : ''
                                                } ${convoyId !== 'unassigned' ? 'bg-slate-50/20' : ''}`}>
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedTrips.includes(trip.id)}
                                                        onCheckedChange={() => toggleTripSelection(trip.id)}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-primary">{trip.trip_number}</span>
                                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                            <span>{trip.origin}</span>
                                                            <ArrowRight size={10} />
                                                            <span>{trip.destination}</span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {getStatusBadge(trip.status)}
                                                    {trip.approved_by_name && (
                                                        <div className="text-[10px] text-muted-foreground mt-1">by {trip.approved_by_name}</div>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium">{trip.vehicle?.vehicle_no || <span className="text-slate-400 italic text-xs">Unassigned</span>}</span>
                                                        <span className="text-xs text-muted-foreground">{trip.driver?.full_name || '—'}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    <div className="flex flex-col items-end">
                                                        <span className="font-bold">{trip.revenue_currency === 'USD' ? '$' : 'TSh '}{trip.revenue_amount?.toLocaleString() || '—'}</span>
                                                        {trip.revenue_currency === 'USD' && (
                                                            <span className="text-[10px] text-muted-foreground">TSh {(trip.revenue_amount * (trip.exchange_rate || 2700)).toLocaleString()}</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    <div className="flex flex-col items-end text-orange-600">
                                                        <span>${trip.total_expenses_usd?.toLocaleString() || '0'}</span>
                                                        <span className="text-[10px]">TSh {trip.total_expenses_tzs?.toLocaleString() || '0'}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className={`flex flex-col items-end ${isProfit ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        <span className="font-bold">${(trip.net_profit_usd || 0).toLocaleString()}</span>
                                                        <span className="text-[10px] font-medium opacity-80">TSh {((trip.net_profit_usd || 0) * (trip.exchange_rate || 2700)).toLocaleString()}</span>
                                                        <span className="text-[8px] flex items-center gap-0.5 uppercase tracking-tighter mt-0.5">
                                                            {isProfit ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                                                            {isProfit ? 'Profit' : 'Loss'}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {/* ... action buttons ... (no changes needed here, keeping same) */}
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 gap-1 text-slate-600 border-slate-200 hover:bg-slate-50"
                                                            title="Duplicate this trip sheet"
                                                            onClick={() => {
                                                                setDuplicateSourceTrip(trip);
                                                                setSelectedTrip(null);
                                                                setIsSheetOpen(true);
                                                            }}
                                                        >
                                                            <Copy size={13} />
                                                        </Button>
                                                        {isSuperAdmin && trip.status === 'Planned' && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                                                                title="Approve Budget"
                                                                onClick={async () => {
                                                                    const { error } = await supabase
                                                                        .from('logistics_trip_sheets' as any)
                                                                        .update({
                                                                            status: 'Approved',
                                                                            approved_by: user?.id,
                                                                            approved_by_name: userProfile?.full_name || user?.email,
                                                                            approved_at: new Date().toISOString()
                                                                        })
                                                                        .eq('id', trip.id);

                                                                    if (error) {
                                                                        toast({ title: "Approval Failed", description: error.message, variant: "destructive" });
                                                                    } else {
                                                                        toast({ title: "Budget Approved ✅", description: "The trip is now ready for activation." });
                                                                        refetch();
                                                                    }
                                                                }}
                                                            >
                                                                <ShieldCheck size={13} />
                                                                Approve
                                                            </Button>
                                                        )}

                                                        {(userRole === 'logistics_manager' || userRole === 'admin' || isSuperAdmin) && trip.status === 'Approved' && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                                                title="Activate Trip"
                                                                onClick={() => {
                                                                    setSelectedTrip(trip);
                                                                    setIsSheetOpen(true);
                                                                    toast({
                                                                        title: "Activation Required",
                                                                        description: "Please assign a vehicle and driver inside the management sheet to activate."
                                                                    });
                                                                }}
                                                            >
                                                                <Zap size={13} />
                                                                Activate
                                                            </Button>
                                                        )}
                                                        {isSuperAdmin && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 gap-1 text-red-600 border-red-200 hover:bg-red-50"
                                                                title="Delete this trip sheet"
                                                                onClick={async () => {
                                                                    if (confirm("Are you sure you want to delete this trip sheet? This action cannot be undone.")) {
                                                                        const { error } = await supabase
                                                                            .from('logistics_trip_sheets' as any)
                                                                            .delete()
                                                                            .eq('id', trip.id);

                                                                        if (error) {
                                                                            toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
                                                                        } else {
                                                                            toast({ title: "Trip Deleted", description: "The trip sheet was successfully removed." });
                                                                            refetch();
                                                                        }
                                                                    }
                                                                }}
                                                            >
                                                                <Trash2 size={13} />
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 gap-1 text-slate-600 border-slate-200 hover:bg-slate-50"
                                                            onClick={() => {
                                                                setDuplicateSourceTrip(null);
                                                                setSelectedTrip(trip);
                                                                setIsSheetOpen(true);
                                                            }}
                                                        >
                                                            Manage
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </Fragment>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            {/* 🏗 Convoy Creation Dialog */}
            <Dialog open={isConvoyDialogOpen} onOpenChange={setIsConvoyDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Folders className="text-primary" />
                            Create New Convoy
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="convoy-name">Convoy Name / Mission Title</Label>
                            <Input
                                id="convoy-name"
                                placeholder="e.g. DRC Mission - March Convoy A"
                                value={convoyName}
                                onChange={(e) => setConvoyName(e.target.value)}
                            />
                            <p className="text-[10px] text-muted-foreground">
                                This will group these {selectedTrips.length} vehicles together for financial reporting.
                            </p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setIsConvoyDialogOpen(false)}>Cancel</Button>
                        <Button
                            className="bg-primary gap-2"
                            disabled={isProcessingConvoy || !convoyName.trim()}
                            onClick={handleCreateConvoy}
                        >
                            {isProcessingConvoy ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <ShieldCheck size={16} />}
                            Group Vehicles
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div >
    );
};

export default TripSheets;
