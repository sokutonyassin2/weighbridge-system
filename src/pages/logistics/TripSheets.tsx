import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter 
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Search,
    TrendingUp,
    TrendingDown,
    ArrowRight,
    Plus,
    Truck,
    AlertTriangle,
    Copy,
    ShieldCheck,
    Zap,
    Clock,
    Trash2,
    Folders,
    ChevronLeft,
    User,
    ChevronDown,
    ChevronRight,
    Navigation,
    Route as RouteIcon,
    CreditCard
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { TripSheet } from "@/components/logistics/TripSheet";
import { LogisticsPaymentTracker } from "@/components/logistics/LogisticsPaymentTracker";
import { CompletedTripsHistory } from "@/components/logistics/CompletedTripsHistory";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const TripSheets = () => {
    const { userRole, user, userProfile } = useAuth();
    const [activeTab, setActiveTab] = useState<'operations' | 'finance' | 'history'>('operations');
    const { toast } = useToast();
    const [searchTerm, setSearchTerm] = useState("");
    
    // Batch Invoicing State
    const [batchDialog, setBatchDialog] = useState<{ open: boolean, groupKey: string, trips: any[] }>({
        open: false,
        groupKey: '',
        trips: []
    });
    const [batchData, setBatchData] = useState({ invoice_no: '', payment_status: 'Pending' });
    const [isProcessingBatch, setIsProcessingBatch] = useState(false);
    const [selectedBatchTrips, setSelectedBatchTrips] = useState<string[]>([]);
    const [selectedTrip, setSelectedTrip] = useState<any>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [duplicateSourceTrip, setDuplicateSourceTrip] = useState<any>(null);
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const isSuperAdmin = userRole === 'super_admin';
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';

    const handleUpdateStatus = async (tripId: string, newStatus: string) => {
        try {
            // Strict Validation for Approval
            if (newStatus === 'Approved') {
                const trip = tripSheets?.find(t => t.id === tripId);
                if (!trip) throw new Error("Trip record not found.");

                if (!trip.vehicle_id || !trip.trailer_id || trip.trailer_id === 'none') {
                    toast({
                        variant: "destructive",
                        title: "Approval Blocked",
                        description: "Horse and Linked Trailer are mandatory for approval. Please edit the trip sheet to assign them."
                    });
                    return;
                }

                if (!trip.reference_number) {
                    toast({
                        variant: "destructive",
                        title: "Approval Blocked",
                        description: "Trip Reference Number is missing. Please edit the trip sheet first."
                    });
                    return;
                }

                if (!trip.journey_type) {
                    toast({
                        variant: "destructive",
                        title: "Approval Blocked",
                        description: "Journey Type must be selected before approval."
                    });
                    return;
                }

                if (!trip.invoice_no) {
                    toast({
                        variant: "destructive",
                        title: "Invoice Required",
                        description: "A valid Invoice Number is mandatory before this trip can be approved."
                    });
                    return;
                }
            }

            const payload: any = { 
                status: newStatus,
                updated_at: new Date().toISOString()
            };

            if (newStatus === 'Approved') {
                payload.approved_by = user?.id;
                payload.approved_at = new Date().toISOString();
            } else if (newStatus === 'Active') {
                payload.activated_by = user?.id;
                payload.activated_at = new Date().toISOString();
            }

            const { error } = await supabase
                .from('logistics_trip_sheets' as any)
                .update(payload)
                .eq('id', tripId);

            if (error) throw error;

            toast({
                title: "Status Updated",
                description: `Trip sheet is now ${newStatus}.`,
            });
            refetch();
        } catch (error: any) {
            toast({
                title: "Update Failed",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    const handleBatchUpdate = async () => {
        if (!batchData.invoice_no) {
            toast({ variant: "destructive", title: "Missing Information", description: "Please enter a valid Invoice Number for the batch." });
            return;
        }

        if (selectedBatchTrips.length === 0) {
            toast({ variant: "destructive", title: "No Trips Selected", description: "Please select at least one trip to apply this invoice to." });
            return;
        }

        setIsProcessingBatch(true);
        try {
            const { error } = await supabase
                .from('logistics_trip_sheets' as any)
                .update({
                    invoice_no: batchData.invoice_no,
                    invoice_date: batchData.invoice_date || null,
                    payment_status: batchData.payment_status,
                    updated_at: new Date().toISOString()
                })
                .in('id', selectedBatchTrips);

            if (error) throw error;

            toast({
                title: "Batch Updated Successfully",
                description: `Applied Invoice ${batchData.invoice_no} to ${selectedBatchTrips.length} trips for ${batchDialog.groupKey}.`,
            });
            setBatchDialog({ open: false, groupKey: '', trips: [] });
            refetch();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Batch Update Failed",
                description: error.message
            });
        } finally {
            setIsProcessingBatch(false);
        }
    };

    const handleDeleteTrip = async (tripId: string) => {
        if (!window.confirm("Are you sure you want to delete this trip sheet? This action cannot be undone.")) return;

        try {
            const { error } = await supabase
                .from('logistics_trip_sheets' as any)
                .delete()
                .eq('id', tripId);

            if (error) throw error;

            toast({
                title: "Trip Deleted",
                description: "The trip sheet has been successfully removed.",
            });
            refetch();
        } catch (error: any) {
            toast({
                title: "Deletion Failed",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    // Formatting Helpers
    const formatTSh = (val: any) => {
        if (val === undefined || val === null || val === "") return "TShs. 0";
        const num = parseFloat(val);
        if (isNaN(num)) return "TShs. 0";
        return `TShs. ${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    };

    const formatUSD = (val: any) => {
        if (val === undefined || val === null || val === "") return "$0.00 USD";
        const num = parseFloat(val);
        if (isNaN(num)) return "$0.00 USD";
        return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    };

    const { data: tripSheets, isLoading, isError, error: queryError, refetch } = useQuery({
        queryKey: ["logistics_trip_sheets_list"],
        queryFn: async () => {
            const { data: sheets, error } = await supabase
                .from("logistics_trip_sheets" as any)
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            if (!sheets || sheets.length === 0) return [];

            const vehicleIds = [...new Set((sheets as any[]).map(s => s.vehicle_id).filter(Boolean))];
            const driverIds = [...new Set((sheets as any[]).map(s => s.driver_id).filter(Boolean))];

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

            return (sheets as any[]).map(s => ({
                ...s,
                vehicle: s.vehicle_id ? vehicleMap[s.vehicle_id] : null,
                driver: s.driver_id ? driverMap[s.driver_id] : null,
            }));
        }
    });

    const filteredSheets = tripSheets?.filter(trip =>
        trip.reference_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.vehicle?.vehicle_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.driver?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.destination?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const groupedTrips = filteredSheets?.filter(t => t.status !== 'Completed')?.reduce((acc, trip) => {
        const client = trip.client_name || 'Individual / Unspecified';
        const key = client;
        
        if (!acc[key]) {
            acc[key] = { 
                name: client,
                destinations: [],
                trips: [], 
                totals: { revenueUSD: 0, revenueTZS: 0, expensesUSD: 0, expensesTZS: 0, profitUSD: 0, profitTZS: 0 } 
            };
        }

        acc[key].trips.push(trip);
        
        // Track unique destinations for the group
        if (trip.destination && !acc[key].destinations.includes(trip.destination)) {
            acc[key].destinations.push(trip.destination);
        }

        const rate = parseFloat(trip.exchange_rate) || 2700;
        const revAmt = parseFloat(trip.revenue_amount) || 0;
        const revUSD = trip.revenue_currency === 'USD' ? revAmt : revAmt / rate;
        const revTZS = trip.revenue_currency === 'TZS' ? revAmt : revAmt * rate;

        acc[key].totals.revenueUSD += revUSD;
        acc[key].totals.revenueTZS += revTZS;
        acc[key].totals.expensesUSD += parseFloat(trip.total_expenses_usd) || 0;
        acc[key].totals.expensesTZS += parseFloat(trip.total_expenses_tzs) || 0;
        acc[key].totals.profitUSD += parseFloat(trip.net_profit_usd) || 0;
        acc[key].totals.profitTZS += revTZS - (parseFloat(trip.total_expenses_tzs) || 0);

        return acc;
    }, {} as Record<string, any>) || {};

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Planned': return <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1"><Clock size={10} /> DRAFT</Badge>;
            case 'Approved': return <Badge className="bg-blue-100 text-blue-800 border-blue-300 gap-1"><ShieldCheck size={10} /> APPROVED</Badge>;
            case 'Active': return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1"><Zap size={10} /> ACTIVE</Badge>;
            case 'Completed': return <Badge className="bg-slate-100 text-slate-600 gap-1">COMPLETED</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    // If Editor is open, show the TripSheet component
    if (isSheetOpen) {
        return (
            <div className="bg-slate-50/50 animate-in fade-in duration-300">
                {/* ── Editor Header (Sticky) ────────────────────────────────── */}
                <div className="flex items-center justify-between p-3 border-b bg-white sticky top-0 z-30 shadow-sm">
                    <div className="flex items-center gap-4">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => { 
                                setIsSheetOpen(false); 
                                setDuplicateSourceTrip(null); 
                                setSelectedTrip(null);
                            }} 
                            className="gap-2 h-8 px-2 rounded-lg hover:bg-slate-100 font-bold text-slate-600"
                        >
                            <ChevronLeft size={14} />
                            <span className="text-[11px] uppercase tracking-tight">Back to List</span>
                        </Button>
                        <div className="h-4 w-px bg-slate-200" />
                        <div className="flex items-center gap-2">
                             <div className="p-1.5 bg-slate-900 text-white rounded-md shadow-sm">
                                <Truck size={12} />
                            </div>
                            <div>
                                <h2 className="font-black text-slate-900 tracking-tight leading-none uppercase text-[11px]">
                                    {duplicateSourceTrip ? "Duplicate Sheet" : selectedTrip ? `Trip: ${selectedTrip.reference_number || selectedTrip.trip_number || 'N/A'}` : "Create New Sheet"}
                                </h2>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                                    {selectedTrip?.client_name || "New Logistics Entry"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 md:p-6">
                    <TripSheet 
                        tripId={selectedTrip?.id} 
                        duplicateData={duplicateSourceTrip} 
                        onSaveSuccess={() => {
                            setIsSheetOpen(false);
                            setDuplicateSourceTrip(null);
                            setSelectedTrip(null);
                            refetch();
                        }} 
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 space-y-6 animate-fade-in max-w-[1700px] mx-auto">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 items-end bg-white/50 p-3 px-5 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-slate-900 text-white rounded-lg">
                            <Folders size={14} />
                        </div>
                        <div>
                             <h1 className="text-[13px] font-bold tracking-tight text-slate-900 uppercase">Transit Financials</h1>
                             <p className="text-[8px] text-slate-500 font-bold uppercase tracking-[0.2em] opacity-60">Terminal Logistics Control</p>
                        </div>
                    </div>
                    
                    {/* Tab Navigation */}
                    <div className="flex items-center gap-1 mt-4 bg-slate-100/80 p-1 rounded-xl w-fit">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className={cn(
                                "h-7 px-3 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all",
                                activeTab === 'operations' ? "bg-white text-slate-900 shadow-sm shadow-slate-200" : "text-slate-500 hover:text-slate-900"
                            )}
                            onClick={() => setActiveTab('operations')}
                        >
                            Operations
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className={cn(
                                "h-7 px-3 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all",
                                activeTab === 'history' ? "bg-slate-800 text-white shadow-sm shadow-slate-900" : "text-slate-500 hover:text-slate-900"
                            )}
                            onClick={() => setActiveTab('history')}
                        >
                            History & Completed
                        </Button>
                        {(userRole === 'super_admin' || userRole === 'finance' || userRole === 'audit_clerk') && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className={cn(
                                    "h-7 px-3 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all",
                                    activeTab === 'finance' ? "bg-emerald-600 text-white shadow-sm shadow-emerald-200" : "text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                                )}
                                onClick={() => setActiveTab('finance')}
                            >
                                <CreditCard size={12} className="mr-1.5" />
                                Accounts Tracking
                            </Button>
                        )}
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input 
                            placeholder="Search client, trip..." 
                            className="pl-9 h-10 bg-white border-slate-200 shadow-sm rounded-xl text-xs font-medium w-full"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button className="h-10 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs gap-2 shadow-lg shadow-slate-200 whitespace-nowrap" onClick={() => {
                        setSelectedTrip(null);
                        setDuplicateSourceTrip(null);
                        setIsSheetOpen(true);
                    }}>
                        <Plus size={16} />
                        New Trip Sheet
                    </Button>
                </div>
            </div>

            {activeTab === 'finance' ? (
                <LogisticsPaymentTracker searchTerm={searchTerm} />
            ) : activeTab === 'history' ? (
                <CompletedTripsHistory tripSheets={tripSheets || []} searchTerm={searchTerm} />
            ) : (
                <Fragment>
            {/* Quick Stats Grid - More Compact */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-none bg-indigo-600 text-white shadow-lg overflow-hidden relative group/stats hover:shadow-xl transition-all">
                    <div className="absolute right-0 top-0 p-4 opacity-10">
                        <TrendingUp size={64} />
                    </div>
                    <CardHeader className="pb-0.5 pt-4">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-100/70">Total Revenue Projection</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                        <div className="text-xl font-bold">TShs { (tripSheets?.filter((t: any) => t.status !== 'Planned').reduce((sum: number, t: any) => sum + (parseFloat(t.net_profit_usd || 0) + (parseFloat(t.total_expenses_usd || 0))), 0) * (tripSheets?.[0]?.exchange_rate || 2700)).toLocaleString(undefined, { maximumFractionDigits: 0 }) }</div>
                        <div className="text-[10px] font-bold text-indigo-100 mt-0.5 opacity-70 uppercase tracking-widest">
                            Approx. {formatUSD(tripSheets?.filter((t: any) => t.status !== 'Planned').reduce((sum: number, t: any) => sum + (parseFloat(t.net_profit_usd || 0) + (parseFloat(t.total_expenses_usd || 0))), 0))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-slate-200 bg-white shadow-sm overflow-hidden relative group/stats hover:shadow-md transition-all">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500" />
                    <CardHeader className="pb-0.5 pt-4">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Total Logistics Expenses</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                        <div className="text-xl font-bold text-slate-900 tabular-nums">TShs { (tripSheets?.filter((t: any) => t.status !== 'Planned').reduce((sum: number, t: any) => sum + (parseFloat(t.total_expenses_usd) || 0), 0) * (tripSheets?.[0]?.exchange_rate || 2700)).toLocaleString(undefined, { maximumFractionDigits: 0 }) }</div>
                        <div className="flex items-center gap-1.5 mt-1">
                            <TrendingDown size={10} className="text-orange-400" />
                            <div className="text-[10px] font-bold text-orange-500 uppercase tracking-widest leading-none">Approx. {formatUSD(tripSheets?.filter((t: any) => t.status !== 'Planned').reduce((sum: number, t: any) => sum + (parseFloat(t.total_expenses_usd) || 0), 0))}</div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-slate-200 bg-white shadow-sm overflow-hidden relative group/stats hover:shadow-md transition-all">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                    <CardHeader className="pb-0.5 pt-4">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Estimated Net Surplus</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                        <div className="text-xl font-bold text-emerald-600 tabular-nums">TShs { (tripSheets?.filter((t: any) => t.status !== 'Planned').reduce((sum: number, t: any) => sum + (parseFloat(t.net_profit_usd) || 0), 0) * (tripSheets?.[0]?.exchange_rate || 2700)).toLocaleString(undefined, { maximumFractionDigits: 0 }) }</div>
                        <div className="flex items-center gap-1.5 mt-1">
                            <ShieldCheck size={10} className="text-emerald-400" />
                            <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest leading-none">Approx. {formatUSD(tripSheets?.filter((t: any) => t.status !== 'Planned').reduce((sum: number, t: any) => sum + (parseFloat(t.net_profit_usd) || 0), 0))}</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border border-slate-200 shadow-xl bg-white overflow-hidden rounded-2xl">
                <div className="overflow-x-auto">
                    <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow className="hover:bg-transparent border-b border-slate-100">
                            <TableHead className="w-12 text-center text-xs font-semibold text-slate-500">#</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 py-4">Vehicle Trip Details</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500">Current Status</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500">Asset Allocation</TableHead>
                            <TableHead className="text-right text-xs font-semibold text-slate-500 whitespace-nowrap">Gross Rev (TShs)</TableHead>
                            <TableHead className="text-right text-xs font-semibold text-slate-500 whitespace-nowrap">Expenses (TShs)</TableHead>
                            <TableHead className="text-right text-xs font-semibold text-slate-500 whitespace-nowrap">Est. Profit (TShs)</TableHead>
                            <TableHead className="w-16"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={8} className="text-center py-24 text-slate-400 font-bold uppercase tracking-widest text-[10px]">Loading Secure Records...</TableCell></TableRow>
                        ) : isError ? (
                            <TableRow><TableCell colSpan={8} className="text-center py-24">
                                <div className="flex flex-col items-center gap-2 text-red-500 italic">
                                    <AlertTriangle size={24} />
                                    <span className="font-bold text-xs uppercase tracking-tight">Sync Error: {(queryError as any)?.message}</span>
                                </div>
                            </TableCell></TableRow>
                        ) : (!filteredSheets || filteredSheets.length === 0) ? (
                            <TableRow><TableCell colSpan={8} className="text-center py-24">
                                <Truck size={32} className="mx-auto text-slate-200 mb-3" />
                                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No Transit Records Found</p>
                            </TableCell></TableRow>
                        ) : (
                            Object.entries(groupedTrips).map(([groupKey, group]: [string, any]) => {
                                const isExpanded = expandedGroups.includes(groupKey);
                                const totalProfit = group.totals.profitUSD * (tripSheets?.[0]?.exchange_rate || 2700);

                                return (
                                    <Fragment key={groupKey}>
                                        <TableRow
                                            className="bg-slate-50/80 border-y border-slate-100 sticky top-0 z-10 transition-colors cursor-pointer hover:bg-slate-100 group/header"
                                            onClick={() => toggleGroup(groupKey)}
                                        >
                                            <TableCell colSpan={4} className="py-4 px-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="transition-transform duration-200">
                                                        {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                                                    </div>
                                                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100 shadow-sm">
                                                        <Folders size={16} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-base font-bold text-slate-900 tracking-tight">{group.name}</span>
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                {(group.destinations.length > 0 ? group.destinations : ['No Route']).map((dest: string, idx: number) => (
                                                                    <div key={idx} className="flex items-center gap-1.5 px-2 py-0.5 bg-white border border-slate-200 rounded-full shadow-sm">
                                                                        <RouteIcon size={10} className="text-indigo-400" />
                                                                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{dest}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <Badge variant="secondary" className="text-[10px] h-5 font-black bg-slate-900 text-white rounded-md px-2">
                                                                {group.trips.length} ASSETS
                                                            </Badge>
                                                            {(isSuperAdmin || isAdmin) && (
                                                                <Button 
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    className="h-6 px-2 text-[9px] font-bold border-indigo-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-600 hover:text-white rounded-md flex items-center gap-1.5"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setBatchDialog({ open: true, groupKey, trips: group.trips });
                                                                        setBatchData({ invoice_no: '', payment_status: 'Pending' });
                                                                        setSelectedBatchTrips(group.trips.map((t: any) => t.id));
                                                                    }}
                                                                >
                                                                    <CreditCard size={10} />
                                                                    BATCH INVOICE
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right py-4">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1 opacity-60">Revenue</span>
                                                    <span className="text-sm font-bold text-slate-900 leading-none">{formatTSh(group.totals.revenueUSD * (tripSheets?.[0]?.exchange_rate || 2700))}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right py-4">
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[9px] text-orange-400 font-bold uppercase tracking-widest mb-1 opacity-60">Expenses</span>
                                                    <span className="text-sm font-bold text-orange-600 leading-none">{formatTSh(group.totals.expensesUSD * (tripSheets?.[0]?.exchange_rate || 2700))}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right py-4">
                                                <div className="flex flex-col items-end pr-4">
                                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1 opacity-60">Combined Profit</span>
                                                    <span className={`text-base font-bold leading-none ${totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        {formatTSh(totalProfit)}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell />
                                        </TableRow>

                                        {isExpanded && (
                                            <TableRow className="bg-slate-50/30 hover:bg-slate-50/30 transition-none border-none">
                                                <TableCell colSpan={8} className="p-4 bg-slate-50/50">
                                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                                        {group.trips.map((trip: any, tIndex: number) => {

                                                            const rate = trip.exchange_rate || 2700;
                                                            const revTSh = trip.revenue_currency === 'TZS' ? trip.revenue_amount : trip.revenue_amount * rate;
                                                            const expTSh = trip.total_expenses_tzs || 0;
                                                            const netTSh = revTSh - expTSh;
                                                            const isProfit = netTSh >= 0;
                                                            
                                                            return (
                                                                <div key={trip.id} className="relative group/card bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden">
                                                                    {/* Left Decoration */}
                                                                    <div className={cn(
                                                                        "absolute left-0 top-0 bottom-0 w-1.5",
                                                                        trip.status === 'Planned' ? 'bg-amber-400' :
                                                                        trip.status === 'Approved' ? 'bg-blue-400' :
                                                                        trip.status === 'Active' ? 'bg-emerald-400' : 'bg-slate-300'
                                                                    )} />

                                                                    {/* 1. Identification Section */}
                                                                    <div className="flex items-start gap-4 flex-1">
                                                                        <div className="text-[10px] font-black text-slate-300 tabular-nums mt-1">
                                                                            {(tIndex + 1).toString().padStart(2, '0')}
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            <div className="flex items-center gap-2">
                                                                                <h4 className="font-bold text-slate-900 text-sm tracking-tight group-hover/card:text-indigo-600 transition-colors">
                                                                                    {trip.vehicle?.vehicle_no || "PENDING VEHICLE"}
                                                                                </h4>
                                                                                {getStatusBadge(trip.status)}
                                                                                <Badge variant="outline" className={cn(
                                                                                    "text-[9px] font-bold tracking-tighter uppercase px-1.5 py-0 h-4 rounded border-dashed",
                                                                                    trip.journey_type === 'Go & Return' ? 'border-indigo-200 text-indigo-600' : 'border-orange-200 text-orange-600'
                                                                                )}>
                                                                                    {trip.journey_type || 'G&R'}
                                                                                </Badge>
                                                                            </div>
                                                                            <div className="flex flex-wrap items-center gap-3">
                                                                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                                                                    <User size={10} className="text-slate-400" />
                                                                                    {trip.driver?.full_name || "AWAITING DRIVER"}
                                                                                </div>
                                                                                <div className="h-1 w-1 rounded-full bg-slate-200" />
                                                                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em]">
                                                                                    Ref: {trip.reference_number}
                                                                                </div>
                                                                                {trip.invoice_no && (
                                                                                    <>
                                                                                        <div className="h-1 w-1 rounded-full bg-slate-200" />
                                                                                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-600 uppercase tracking-tighter">
                                                                                            <CreditCard size={10} className="text-slate-400" />
                                                                                            INV: {trip.invoice_no}
                                                                                        </div>
                                                                                        <Badge variant="outline" className={cn(
                                                                                            "text-[8px] h-4 px-1 border-none font-black uppercase tracking-widest",
                                                                                            trip.payment_status === 'Paid' ? "bg-emerald-50 text-emerald-600" :
                                                                                            trip.payment_status === 'Partial' ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400"
                                                                                        )}>
                                                                                            {trip.payment_status || 'Unpaid'}
                                                                                        </Badge>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* 2. Financial Breakdown (3 Pillars) */}
                                                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-10 bg-slate-50/50 px-4 sm:px-6 py-3 rounded-xl border border-slate-100">
                                                                        {/* Revenue */}
                                                                        <div className="flex flex-row sm:flex-col justify-between sm:justify-start items-center sm:items-start gap-4 sm:gap-0.5">
                                                                            <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-[0.2em] leading-none">Gross Rev</span>
                                                                            <div className="text-right sm:text-left">
                                                                                <span className="block text-[13px] font-bold text-slate-900 leading-snug">{formatTSh(revTSh)}</span>
                                                                                <span className="block text-[9px] font-medium text-slate-400 leading-none">${formatUSD(revTSh / rate).replace('$','')} USD</span>
                                                                            </div>
                                                                        </div>

                                                                        <div className="hidden sm:block h-8 w-px bg-slate-200" />
                                                                        <Separator className="sm:hidden bg-slate-200" />

                                                                        {/* Expenses */}
                                                                        <div className="flex flex-row sm:flex-col justify-between sm:justify-start items-center sm:items-start gap-4 sm:gap-0.5">
                                                                            <span className="block text-[8px] text-orange-400 font-bold uppercase tracking-[0.2em] leading-none">Expenses</span>
                                                                            <div className="text-right sm:text-left">
                                                                                <span className="block text-[13px] font-bold text-orange-600 leading-snug">{formatTSh(trip.total_expenses_tzs)}</span>
                                                                                <span className="block text-[9px] font-medium text-orange-300 leading-none">${formatUSD(trip.total_expenses_usd).replace('$','')} USD</span>
                                                                            </div>
                                                                        </div>

                                                                        <div className="hidden sm:block h-8 w-px bg-slate-200" />
                                                                        <Separator className="sm:hidden bg-slate-200" />

                                                                        {/* Profit */}
                                                                        <div className="flex flex-row sm:flex-col justify-between sm:justify-start items-center sm:items-start gap-4 sm:gap-0.5">
                                                                            <span className={cn(
                                                                                "block text-[8px] font-bold uppercase tracking-[0.2em] leading-none",
                                                                                isProfit ? "text-emerald-400" : "text-red-400"
                                                                            )}>Net Profit</span>
                                                                            <div className="text-right sm:text-left">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <span className={cn(
                                                                                        "block text-[15px] font-bold leading-snug",
                                                                                        isProfit ? "text-emerald-600" : "text-red-600"
                                                                                    )}>
                                                                                        {formatTSh(netTSh)}
                                                                                    </span>
                                                                                    {isProfit ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-red-400" />}
                                                                                </div>
                                                                                <span className={cn(
                                                                                    "block text-[9px] font-medium leading-none opacity-70",
                                                                                    isProfit ? "text-emerald-500" : "text-red-400"
                                                                                )}>${formatUSD(trip.net_profit_usd).replace('$','')} USD</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* 3. Actions Section */}
                                                                    <div className="flex items-center gap-2 pl-0 sm:pl-4 border-l-0 sm:border-l border-slate-100 flex-wrap sm:flex-nowrap">
                                                                        {isAdmin && trip.status === 'Planned' && (
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                className="h-9 px-4 rounded-xl font-bold text-[10px] uppercase tracking-widest bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-white flex-1 sm:flex-none"
                                                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(trip.id, 'Approved'); }}
                                                                            >
                                                                                <ShieldCheck size={14} className="mr-1.5" /> Approve
                                                                            </Button>
                                                                        )}
                                                                        
                                                                        {isAdmin && trip.status === 'Approved' && (
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                className="h-9 px-4 rounded-xl font-bold text-[10px] uppercase tracking-widest bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-600 hover:text-white flex-1 sm:flex-none"
                                                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(trip.id, 'Active'); }}
                                                                            >
                                                                                <Zap size={14} className="mr-1.5" /> Activate
                                                                            </Button>
                                                                        )}

                                                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-9 w-9 rounded-xl border border-slate-200 hover:bg-white hover:text-indigo-600 shadow-sm"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setDuplicateSourceTrip(trip);
                                                                                    setSelectedTrip(null);
                                                                                    setIsSheetOpen(true);
                                                                                }}
                                                                                title="Duplicate"
                                                                            >
                                                                                <Copy size={16} />
                                                                            </Button>

                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className={cn(
                                                                                    "h-9 w-9 rounded-xl border border-rose-100 shadow-sm transition-all",
                                                                                    (isAdmin || trip.status === 'Planned') 
                                                                                        ? "text-rose-500 hover:bg-rose-500 hover:text-white border-rose-200" 
                                                                                        : "text-slate-300 bg-slate-50 cursor-not-allowed opacity-50"
                                                                                )}
                                                                                disabled={!isAdmin && trip.status !== 'Planned'}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleDeleteTrip(trip.id);
                                                                                }}
                                                                                title={(!isAdmin && trip.status !== 'Planned') ? "Only Drafts can be deleted" : "Delete Trip"}
                                                                            >
                                                                                <Trash2 size={16} />
                                                                            </Button>

                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                className="h-9 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest bg-slate-900 text-white border-slate-900 hover:bg-slate-800 shadow-md active:scale-95 transition-all flex-1"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setDuplicateSourceTrip(null);
                                                                                    setSelectedTrip(trip);
                                                                                    setIsSheetOpen(true);
                                                                                }}
                                                                            >
                                                                                Manage
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </Fragment>
                                );
                            })
                        )}
                    </TableBody>
                    </Table>
                </div>
            </Card>

            {/* 🧾 Professional Batch Invoicing Dashboard */}
            <Dialog open={batchDialog.open} onOpenChange={(open) => setBatchDialog(prev => ({ ...prev, open }))}>
                <DialogContent className="max-w-2xl bg-white border-none shadow-2xl rounded-3xl overflow-hidden p-0">
                    <div className="bg-slate-900 p-6 text-white relative">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold flex items-center gap-3">
                                <div className="p-2 bg-indigo-500 rounded-xl">
                                    <CreditCard size={20} className="text-white" />
                                </div>
                                Batch Invoice Management
                            </DialogTitle>
                            <p className="text-slate-400 text-xs font-medium mt-1">Assigning Shared Invoice to Group: <span className="text-indigo-400 font-bold">{batchDialog.groupKey}</span></p>
                        </DialogHeader>
                    </div>

                    <div className="p-8 space-y-8">
                        {/* 1. Invoice Details Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Invoice Number</Label>
                                <Input 
                                    placeholder="SCL/2025/004" 
                                    value={batchData.invoice_no}
                                    onChange={(e) => setBatchData({...batchData, invoice_no: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Payment Status</Label>
                                <Select 
                                    value={batchData.payment_status}
                                    onValueChange={(val) => setBatchData({...batchData, payment_status: val})}
                                >
                                    <SelectTrigger className="h-10 bg-slate-50 border-slate-200 text-xs font-semibold">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="z-[105]">
                                        <SelectItem value="Pending">Unpaid / Pending</SelectItem>
                                        <SelectItem value="Partial">Partial Payment</SelectItem>
                                        <SelectItem value="Paid">Fully Settled</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* 2. Asset Selection List */}
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Select Assets to Invoice ({selectedBatchTrips.length} Selected)</h4>
                                <Button 
                                    variant="link" 
                                    className="h-auto p-0 text-[10px] font-bold text-primary"
                                    onClick={() => setSelectedBatchTrips(batchDialog.trips.map(t => t.id))}
                                >
                                    Select All
                                </Button>
                            </div>
                            
                            <div className="grid gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                {batchDialog.trips.map((trip) => (
                                    <div 
                                        key={trip.id} 
                                        className={cn(
                                            "flex items-center gap-4 p-3 rounded-xl border transition-all cursor-pointer",
                                            selectedBatchTrips.includes(trip.id) ? "bg-indigo-50 border-indigo-200" : "bg-white border-slate-100 hover:border-slate-200"
                                        )}
                                        onClick={() => {
                                            setSelectedBatchTrips(prev => 
                                                prev.includes(trip.id) ? prev.filter(id => id !== trip.id) : [...prev, trip.id]
                                            );
                                        }}
                                    >
                                        <Checkbox 
                                            checked={selectedBatchTrips.includes(trip.id)}
                                            onCheckedChange={() => {}} // Handled by div click
                                            className="border-slate-300"
                                        />
                                        <div className="flex-1">
                                            <div className="font-bold text-xs text-slate-900 uppercase">{trip.vehicle?.vehicle_no || 'NA'}</div>
                                            <div className="text-[9px] font-bold text-slate-400 tracking-tighter uppercase">{trip.trip_number} • {trip.destination}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-black text-slate-900">{formatTSh(trip.total_expenses_tzs)}</div>
                                            <div className="text-[9px] font-bold text-slate-400 uppercase opacity-60">COST</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row gap-3">
                        <Button variant="ghost" className="h-11 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500" onClick={() => setBatchDialog(prev => ({ ...prev, open: false }))}>
                            Cancel
                        </Button>
                        <Button 
                            className="flex-1 h-11 bg-slate-900 hover:bg-slate-800 text-white font-black text-[10px] uppercase tracking-[0.2em] rounded-xl shadow-lg shadow-slate-200 transition-all active:scale-[0.98]"
                            onClick={handleBatchUpdate}
                            disabled={isProcessingBatch}
                        >
                            {isProcessingBatch ? "Processing Security Update..." : `Process Batch Invoice (${selectedBatchTrips.length})`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
                </Fragment>
            )}
        </div>
    );
};

export default TripSheets;
