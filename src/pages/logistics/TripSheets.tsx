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
    CreditCard,
    CheckCircle2,
    DollarSign,
    Building2,
    TrendingUp,
    Sparkles,
    Send
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { TripSheet } from "@/components/logistics/TripSheet";
import { LogisticsPaymentTracker } from "@/components/logistics/LogisticsPaymentTracker";
import { CompletedTripsHistory } from "@/components/logistics/CompletedTripsHistory";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const TripSheets = () => {
    const { userRole, user, userProfile } = useAuth();
    const [activeTab, setActiveTab] = useState<'approved_orders' | 'operations' | 'finance' | 'history'>('operations');
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

    const isSuperAdmin = userRole === 'super_admin' || (userRole as string)?.toLowerCase().replace(/\s+/g, '_') === 'super_admin';
    const isAdmin = userRole === 'admin' || userRole === 'super_admin' || ['admin', 'super_admin'].includes((userRole as string)?.toLowerCase().replace(/\s+/g, '_'));

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
            // Delete associated transit trip details first to satisfy foreign key constraints
            const { error: transitError } = await supabase
                .from('logistics_transit_trips' as any)
                .delete()
                .eq('trip_sheet_id', tripId);

            if (transitError) throw transitError;

            // Then delete the main trip sheet record
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

    // ──── SUBMIT FOR APPROVAL: Creates trip sheet (Planned) + logistics_trips entry for tracking & Boss Approval ────
    const handleBudgetApproval = async (order: any) => {
        try {
            const est = getVehicleEstimatedExpenses(order);
            const orderUSD = parseFloat(order.agreed_amount_usd) || 0;
            const orderRate = parseFloat(order.agreed_client_rate) || 2700;
            const orderLocal = parseFloat(order.agreed_amount_local) || (orderUSD * orderRate);

            // Resolve vehicle_id, trailer_id, driver_id from order strings if IDs are missing
            let resolvedVehicleId = order.vehicle_id || null;
            let resolvedTrailerId = order.trailer_id || null;
            let resolvedDriverId = order.driver_id || null;

            if (!resolvedVehicleId && order.truck_reg) {
                const { data: vData } = await supabase
                    .from('logistics_fleet' as any)
                    .select('id')
                    .ilike('vehicle_no', order.truck_reg.trim())
                    .maybeSingle();
                if (vData?.id) resolvedVehicleId = vData.id;
            }

            if (!resolvedTrailerId && order.trailer_reg) {
                const { data: trData } = await supabase
                    .from('logistics_fleet' as any)
                    .select('id')
                    .ilike('vehicle_no', order.trailer_reg.trim())
                    .maybeSingle();
                if (trData?.id) resolvedTrailerId = trData.id;
            }

            if (!resolvedDriverId && order.driver_name) {
                const { data: dData } = await supabase
                    .from('logistics_drivers' as any)
                    .select('id')
                    .ilike('full_name', order.driver_name.trim())
                    .maybeSingle();
                if (dData?.id) resolvedDriverId = dData.id;
            }

            // Check if trip sheet already exists for this trip_number
            const existingSheet = tripSheets?.find((t: any) => t.reference_number === order.trip_number);
            if (existingSheet) {
                if (existingSheet.status === 'Approved' || existingSheet.status === 'Active') {
                    toast({ title: "Already Approved", description: `Trip ${order.trip_number} is already approved.` });
                    return;
                } else {
                    toast({ title: "Already Submitted", description: `Trip ${order.trip_number} is already submitted for Boss Approval.` });
                    return;
                }
            } else {
                // Create a new trip sheet with status Planned (waiting for Boss approval)
                const { error: createErr } = await supabase
                    .from('logistics_trip_sheets' as any)
                    .insert({
                        reference_number: order.trip_number,
                        vehicle_id: resolvedVehicleId,
                        trailer_id: resolvedTrailerId,
                        driver_id: resolvedDriverId,
                        origin: order.origin || 'DAR ES SALAAM',
                        destination: order.destination,
                        client_name: order.client_name,
                        journey_type: order.journey_type || 'Go & Return',
                        cargo_outbound: order.cargo_description || null,
                        revenue_amount: orderUSD,
                        revenue_currency: 'USD',
                        revenue_type: 'With Fuel',
                        exchange_rate: orderRate,
                        agreed_days: order.agreed_days || null,
                        daily_fine_amount: order.daily_penalty_fine || null,
                        status: 'Pending_Approval',
                        created_by: user?.id
                    });
                if (createErr) throw createErr;
            }

            // Ensure logistics_trips entry exists for tracking visibility
            const { data: existingTrip } = await supabase
                .from('logistics_trips' as any)
                .select('id')
                .eq('trip_number', order.trip_number)
                .maybeSingle();

            if (!existingTrip) {
                await supabase
                    .from('logistics_trips' as any)
                    .insert({
                        trip_number: order.trip_number,
                        vehicle_id: order.vehicle_id || null,
                        driver_id: order.driver_id || null,
                        origin: order.origin || 'DAR ES SALAAM',
                        destination: order.destination,
                        status: 'Planned',
                        created_by: user?.id
                    });
            }

            toast({
                title: "Submitted for Approval ✓",
                description: `Trip ${order.trip_number} submitted to Trip Fund Approvals for Executive review.`,
            });
            refetch();
            refetchApprovedOrders();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Submission Failed",
                description: error.message
            });
        }
    };

    const handleBatchBudgetApproval = async (orders: any[]) => {
        if (!window.confirm(`Submit all ${orders.length} vehicles in this batch for Boss / Fund Approval?`)) return;
        for (const order of orders) {
            await handleBudgetApproval(order);
        }
    };

    // Formatting Helpers
    const formatTSh = (val: any) => {
        if (val === undefined || val === null || val === "") return "TShs. 0";
        const num = parseFloat(val);
        if (isNaN(num)) return "TShs. 0";
        return `TShs. ${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    };

    const { data: tripSheets, isLoading, isError, error: queryError, refetch } = useQuery({
        queryKey: ["logistics_trip_sheets_list"],
        queryFn: async () => {
            const { data: sheets, error } = await supabase
                .from("logistics_trip_sheets" as any)
                .select(`
                    *,
                    vehicle:vehicle_id ( id, vehicle_no, fleet_category ),
                    driver:driver_id ( id, full_name )
                `)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return sheets || [];
        }
    });

    // Fetch Approved Trip Orders awaiting Trip Sheet confirmation
    const { data: approvedOrders = [], isLoading: isLoadingApprovedOrders, refetch: refetchApprovedOrders } = useQuery({
        queryKey: ["approved_orders_for_trip_sheets"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_trip_orders" as any)
                .select("*")
                .eq("status", "Approved")
                .order("created_at", { ascending: false });
            if (error) throw error;

            const orders = (data || []).map((order: any) => {
                const name = order.approved_by_name && order.approved_by_name !== "Admin" 
                    ? order.approved_by_name 
                    : "Yahya Kilua";
                return { ...order, approved_by_name: name };
            });

            // Auto-heal rows in database where approved_by_name is empty or "Admin"
            const missingIds = (data || [])
                .filter((o: any) => !o.approved_by_name || o.approved_by_name === "Admin")
                .map((o: any) => o.id);
            if (missingIds.length > 0) {
                supabase
                    .from("logistics_trip_orders" as any)
                    .update({ approved_by_name: "Yahya Kilua" })
                    .in("id", missingIds)
                    .then(() => {});
            }

            return orders;
        }
    });

    // Fetch Master Route Expenses for projecting batch expenses and profit
    const { data: routeExpensesMaster = [] } = useQuery({
        queryKey: ["route_expenses_master_for_batch_totals"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_route_expenses_master" as any)
                .select("destination, expenses, fuel_liters, fuel_rate_usd, fuel_rate_tzs");
            if (error) return [];
            return data || [];
        }
    });

    // Expanded accordion state for Approved Orders tab
    const [expandedApprovedClients, setExpandedApprovedClients] = useState<string[]>([]);
    const toggleApprovedClient = (clientName: string) => {
        setExpandedApprovedClients(prev => 
            prev.includes(clientName) ? prev.filter(c => c !== clientName) : [...prev, clientName]
        );
    };

    // Filter approved orders by search
    const filteredApprovedOrders = approvedOrders.filter((order: any) =>
        (order.trip_number || '')?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.order_number || '')?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.truck_reg || '')?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.driver_name || '')?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.destination || '')?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.client_name || '')?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Robust helper to calculate estimated route expenses and profit for a trip order
    const getVehicleEstimatedExpenses = (order: any) => {
        const dest = (order.destination || "").trim().toUpperCase();
        const usd = parseFloat(order.agreed_amount_usd) || 0;
        const rate = parseFloat(order.agreed_client_rate) || 2700;
        const local = parseFloat(order.agreed_amount_local) || (usd * rate);

        let items: any[] = [];
        const routeMatch = routeExpensesMaster.find((r: any) => {
            const rDest = (r.destination || "").trim().toUpperCase();
            return rDest === dest || (dest && rDest.includes(dest)) || (rDest && dest.includes(rDest));
        });

        if (routeMatch && Array.isArray(routeMatch.expenses) && routeMatch.expenses.length > 0) {
            items = routeMatch.expenses;
        } else {
            try {
                const saved = localStorage.getItem("master_collection_route_expenses");
                if (saved) {
                    const expMap = JSON.parse(saved);
                    items = expMap[dest] || expMap[order.destination?.trim()] || [];
                    if (items.length === 0) {
                        const matchedKey = Object.keys(expMap).find(k => k.includes(dest) || dest.includes(k));
                        if (matchedKey) items = expMap[matchedKey];
                    }
                }
            } catch (e) {}
        }

        let orderExpUSD = 0;
        let orderExpTZS = 0;

        if (Array.isArray(items) && items.length > 0) {
            items.forEach((item: any) => {
                const amt = parseFloat(item.amount) || 0;
                if (item.currency === "USD") {
                    orderExpUSD += amt;
                    orderExpTZS += amt * rate;
                } else {
                    orderExpTZS += amt;
                    orderExpUSD += rate > 0 ? amt / rate : 0;
                }
            });
        }

        return {
            orderUSD: usd,
            orderLocal: local,
            orderRate: rate,
            expUSD: orderExpUSD,
            expTZS: orderExpTZS,
            profitUSD: usd - orderExpUSD,
            profitTZS: local - orderExpTZS
        };
    };

    // Group approved orders by Client Name (batches from same client stay grouped together!)
    const groupedApprovedOrders = filteredApprovedOrders.reduce((acc: Record<string, any>, order: any) => {
        const client = order.client_name || 'Individual / Unspecified';
        if (!acc[client]) {
            acc[client] = {
                clientName: client,
                orders: [],
                totalUSD: 0,
                totalTZS: 0,
                totalExpensesUSD: 0,
                totalExpensesTZS: 0,
                totalProfitUSD: 0,
                totalProfitTZS: 0,
                vehiclesCount: 0
            };
        }
        acc[client].orders.push(order);
        acc[client].vehiclesCount += 1;

        const est = getVehicleEstimatedExpenses(order);
        acc[client].totalUSD += est.orderUSD;
        acc[client].totalTZS += est.orderLocal;
        acc[client].totalExpensesUSD += est.expUSD;
        acc[client].totalExpensesTZS += est.expTZS;
        acc[client].totalProfitUSD = acc[client].totalUSD - acc[client].totalExpensesUSD;
        acc[client].totalProfitTZS = acc[client].totalTZS - acc[client].totalExpensesTZS;

        return acc;
    }, {});

    const filteredSheets = tripSheets?.filter(trip =>
        trip.reference_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.vehicle?.vehicle_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.driver?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.destination?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const groupedTrips = filteredSheets?.filter(t => t.status !== 'Completed')?.reduce((acc, trip) => {
        const client = trip.client_name || 'Individual / Unspecified';
        const dateStr = trip.created_at ? trip.created_at.split('T')[0] : 'Unknown Date';
        
        const subGroupKey = trip.invoice_no ? `inv_${trip.invoice_no}` : `date_${dateStr}`;
        const subGroupName = trip.invoice_no ? `Invoice: ${trip.invoice_no}` : `Convoy: ${dateStr}`;
        
        if (!acc[client]) {
            acc[client] = {
                name: client,
                subGroups: {},
                totals: { revenueUSD: 0, revenueTZS: 0, expensesUSD: 0, expensesTZS: 0, profitUSD: 0, profitTZS: 0 },
                tripsCount: 0
            };
        }
        
        if (!acc[client].subGroups[subGroupKey]) {
            acc[client].subGroups[subGroupKey] = {
                name: subGroupName,
                destinations: [],
                trips: [],
                totals: { revenueUSD: 0, revenueTZS: 0, expensesUSD: 0, expensesTZS: 0, profitUSD: 0, profitTZS: 0 }
            };
        }
        
        const subGroup = acc[client].subGroups[subGroupKey];
        subGroup.trips.push(trip);
        
        if (trip.destination && !subGroup.destinations.includes(trip.destination)) {
            subGroup.destinations.push(trip.destination);
        }
        
        const rate = parseFloat(trip.exchange_rate) || 2700;
        const revAmt = parseFloat(trip.revenue_amount) || 0;
        const revUSD = trip.revenue_currency === 'USD' ? revAmt : revAmt / rate;
        const revTZS = trip.revenue_currency === 'TZS' ? revAmt : revAmt * rate;
        const expUSD = parseFloat(trip.total_expenses_usd) || 0;
        const expTZS = parseFloat(trip.total_expenses_tzs) || 0;
        const profUSD = revUSD - expUSD;
        const profTZS = revTZS - expTZS;
        
        // Update subGroup totals
        subGroup.totals.revenueUSD += revUSD;
        subGroup.totals.revenueTZS += revTZS;
        subGroup.totals.expensesUSD += expUSD;
        subGroup.totals.expensesTZS += expTZS;
        subGroup.totals.profitUSD += profUSD;
        subGroup.totals.profitTZS += profTZS;
        
        // Update client totals
        acc[client].totals.revenueUSD += revUSD;
        acc[client].totals.revenueTZS += revTZS;
        acc[client].totals.expensesUSD += expUSD;
        acc[client].totals.expensesTZS += expTZS;
        acc[client].totals.profitUSD += profUSD;
        acc[client].totals.profitTZS += profTZS;
        
        acc[client].tripsCount += 1;
        
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
                        onSaveSuccess={(sheetId) => {
                            if (sheetId) {
                                setSelectedTrip({ id: sheetId } as any);
                            }
                            setDuplicateSourceTrip(null);
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
                    {/* Tab Navigation */}
                    <div className="flex items-center gap-1.5 mt-4 bg-slate-100/90 p-1 rounded-xl w-fit">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className={cn(
                                "h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5",
                                activeTab === 'approved_orders' 
                                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200" 
                                    : "text-slate-600 hover:text-indigo-600 hover:bg-white/60"
                            )}
                            onClick={() => setActiveTab('approved_orders')}
                        >
                            <Sparkles size={12} className={activeTab === 'approved_orders' ? "text-amber-300" : "text-indigo-500"} />
                            Approved Orders
                            {approvedOrders.length > 0 && (
                                <Badge className={cn(
                                    "ml-1 text-[9px] font-black px-1.5 py-0 h-4 border-none",
                                    activeTab === 'approved_orders' ? "bg-white text-indigo-900" : "bg-indigo-100 text-indigo-800"
                                )}>
                                    {approvedOrders.length}
                                </Badge>
                            )}
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className={cn(
                                "h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                                activeTab === 'operations' ? "bg-white text-slate-900 shadow-sm shadow-slate-200" : "text-slate-500 hover:text-slate-900"
                            )}
                            onClick={() => setActiveTab('operations')}
                        >
                            Active Operations
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className={cn(
                                "h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                                activeTab === 'history' ? "bg-slate-800 text-white shadow-sm shadow-slate-900" : "text-slate-500 hover:text-slate-900"
                            )}
                            onClick={() => setActiveTab('history')}
                        >
                            History & Completed
                        </Button>
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
                </div>
            </div>

            {activeTab === 'history' ? (
                <CompletedTripsHistory tripSheets={tripSheets || []} searchTerm={searchTerm} />
            ) : activeTab === 'approved_orders' ? (
                /* ─── APPROVED ORDERS AWAITING FINANCE CONFIRMATION / ACTIVATION ─── */
                <div className="space-y-4">
                    <div className="bg-indigo-50/70 border border-indigo-100 p-4 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
                                <Sparkles size={16} />
                            </div>
                            <div>
                                <h3 className="text-xs font-black uppercase tracking-wider text-indigo-950">
                                    Approved Trip Orders (Pre-Operations Queue)
                                </h3>
                                <p className="text-[11px] text-indigo-700 font-medium">
                                    Orders reviewed & approved by Administration. Grouped by Client and Batch, ready to confirm into Active Operations.
                                </p>
                            </div>
                        </div>
                        <Badge className="bg-indigo-600 text-white font-bold text-xs px-3 py-1">
                            {approvedOrders.length} Approved Vehicles
                        </Badge>
                    </div>

                    <Card className="border border-slate-200 shadow-xl bg-white overflow-hidden rounded-2xl">
                        <Table>
                            <TableHeader className="bg-slate-50/60">
                                <TableRow className="border-b border-slate-100">
                                    <TableHead className="w-12 text-center text-xs font-semibold text-slate-500">#</TableHead>
                                    <TableHead className="text-xs font-semibold text-slate-500 py-3.5">Client & Order Details</TableHead>
                                    <TableHead className="text-xs font-semibold text-slate-500">Route & Cargo</TableHead>
                                    <TableHead className="text-right text-xs font-semibold text-slate-500">Commercial Value</TableHead>
                                    <TableHead className="text-center text-xs font-semibold text-slate-500">Status</TableHead>
                                    <TableHead className="text-right text-xs font-semibold text-slate-500 pr-6">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoadingApprovedOrders ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-24 text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                                            Loading Approved Orders...
                                        </TableCell>
                                    </TableRow>
                                ) : Object.keys(groupedApprovedOrders).length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-24">
                                            <div className="flex flex-col items-center gap-2 text-slate-400">
                                                <CheckCircle2 size={32} className="text-emerald-500/50" />
                                                <span className="font-bold text-xs uppercase tracking-tight text-slate-600">No Orders Pending Confirmation</span>
                                                <p className="text-[11px] text-slate-400 max-w-sm text-center">
                                                    When orders are approved in the Logistics Trip Orders section, they will appear here grouped under their client for final confirmation.
                                                </p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    Object.entries(groupedApprovedOrders).map(([clientName, group]: [string, any], cIdx: number) => {
                                        const isExpanded = expandedApprovedClients.includes(clientName);
                                        return (
                                            <Fragment key={clientName}>
                                                {/* Client Accordion Header */}
                                                <TableRow
                                                    className="bg-slate-100/90 border-y border-slate-200 cursor-pointer hover:bg-slate-200/80 transition-colors select-none"
                                                    onClick={() => toggleApprovedClient(clientName)}
                                                >
                                                    <TableCell className="text-center text-xs font-black text-slate-600">
                                                        {(cIdx + 1).toString().padStart(2, '0')}
                                                    </TableCell>
                                                    <TableCell colSpan={2} className="py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="text-slate-500 transition-transform duration-200">
                                                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                            </div>
                                                            <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-xs">
                                                                <Building2 size={16} />
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-black text-slate-900 tracking-tight uppercase">
                                                                        {clientName}
                                                                    </span>
                                                                    <Badge className="bg-indigo-100 text-indigo-800 text-[10px] font-black border-none px-2 h-5">
                                                                        {group.vehiclesCount} VEHICLES TOTAL
                                                                    </Badge>
                                                                </div>
                                                                <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                                                    {isExpanded ? "Click to collapse" : "Click to expand approved vehicles & trips"}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex flex-col items-end gap-1">
                                                            <div className="flex items-center gap-3">
                                                                <div className="text-right">
                                                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Gross Contracted</span>
                                                                    <span className="text-xs font-black text-indigo-700">
                                                                        ${group.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </span>
                                                                </div>
                                                                <div className="text-right pl-2 border-l border-slate-300">
                                                                    <span className="text-[8px] font-bold text-amber-600 uppercase tracking-widest block">Est. Expenses</span>
                                                                    <span className="text-xs font-black text-amber-700">
                                                                        ${group.totalExpensesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </span>
                                                                </div>
                                                                <div className="text-right pl-2 border-l border-slate-300">
                                                                    <span className="text-[8px] font-bold text-emerald-700 uppercase tracking-widest block">Est. Profit</span>
                                                                    <span className={`text-xs font-black ${group.totalProfitUSD >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                                        ${group.totalProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="text-[9px] font-semibold text-slate-500">
                                                                TZS Net: <span className={group.totalProfitTZS >= 0 ? "font-bold text-emerald-700" : "font-bold text-rose-600"}>{formatTSh(group.totalProfitTZS)}</span>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-black px-2 py-0.5">
                                                            ORDER APPROVED
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-8 px-3 text-[10px] font-black uppercase tracking-wider text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                                                                onClick={() => toggleApprovedClient(clientName)}
                                                            >
                                                                {isExpanded ? "Hide Vehicles" : `View ${group.vehiclesCount} Vehicles`}
                                                            </Button>
                                                            {isAdmin && (
                                                                <Button
                                                                    size="sm"
                                                                    className="h-8 px-3 text-[10px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm gap-1.5"
                                                                    onClick={() => handleBatchBudgetApproval(group.orders)}
                                                                >
                                                                    <ShieldCheck size={12} />
                                                                    Submit for Approval
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>

                                                {/* Child Vehicle Cards inside Client Folder */}
                                                {isExpanded && group.orders.map((order: any, oIdx: number) => {
                                                    const orderUSD = parseFloat(order.agreed_amount_usd) || 0;
                                                    const orderRate = parseFloat(order.agreed_client_rate) || 2700;
                                                    const orderLocal = parseFloat(order.agreed_amount_local) || (orderUSD * orderRate);

                                                    return (
                                                        <TableRow key={order.id} className="bg-slate-50/40 hover:bg-slate-100/60 border-b border-slate-100 transition-colors">
                                                            <TableCell className="text-center text-[10px] font-bold text-slate-400 pl-4">
                                                                ↳ {oIdx + 1}
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-black text-indigo-900 text-xs tracking-tight">
                                                                            Trip ID: {order.trip_number || "PENDING TRIP #"}
                                                                        </span>
                                                                        <Badge variant="outline" className="text-[9px] font-black px-1.5 py-0 h-4 border-slate-300 text-slate-700 bg-white">
                                                                            {order.order_number || "SEL-BATCH"}
                                                                        </Badge>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                                                                        <Truck size={13} className="text-indigo-600" />
                                                                        <span>{order.truck_reg}</span>
                                                                        {order.trailer_reg && (
                                                                            <span className="text-slate-400 font-normal">/ {order.trailer_reg}</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                                                                        <User size={11} className="text-slate-400" />
                                                                        <span>{order.driver_name || "No Driver Assigned"}</span>
                                                                        {order.contact_no && (
                                                                            <span className="text-slate-400 text-[10px]">({order.contact_no})</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                                                                        <RouteIcon size={12} className="text-indigo-600" />
                                                                        <span>{order.origin || 'DAR ES SALAAM'}</span>
                                                                        <ArrowRight size={10} className="text-slate-400" />
                                                                        <span className="text-indigo-600">{order.destination}</span>
                                                                    </div>
                                                                    {order.cargo_description && (
                                                                        <div className="text-[10px] font-semibold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200/80 w-fit">
                                                                            Cargo: {order.cargo_description}
                                                                        </div>
                                                                    )}
                                                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                                                        Journey: {order.journey_type || "Go & Return"}
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {(() => {
                                                                    const est = getVehicleEstimatedExpenses(order);
                                                                    return (
                                                                        <div className="space-y-0.5">
                                                                            <div className="font-black text-slate-900 text-xs">
                                                                                ${orderUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                                                            </div>
                                                                            <div className="text-[10px] font-bold text-emerald-700">
                                                                                {formatTSh(orderLocal)}
                                                                            </div>
                                                                            <div className="text-[9px] font-semibold text-slate-400">
                                                                                Rate: @{orderRate}
                                                                            </div>
                                                                            <Separator className="my-1" />
                                                                            <div className="text-[10px] font-bold text-amber-700">
                                                                                Est. Exp: ${est.expUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                            </div>
                                                                            <div className={`text-[10px] font-black ${est.profitUSD >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                                                Est. Net: {est.profitUSD >= 0 ? '+' : ''}${est.profitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <div className="space-y-1.5">
                                                                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold px-2 py-0.5">
                                                                        Order: {order.approved_by_name || "Yahya Kilua"}
                                                                    </Badge>
                                                                    {order.approved_at && (
                                                                        <div className="text-[9px] text-slate-400">
                                                                            {order.approved_at.split('T')[0]}
                                                                        </div>
                                                                    )}
                                                                    {(() => {
                                                                        const tripMatch = tripSheets?.find((t: any) => t.reference_number === order.trip_number);
                                                                        const budgetStatus = tripMatch?.status === 'Approved' ? 'Budget Approved'
                                                                            : tripMatch?.status === 'Pending_Approval' ? 'Awaiting Boss Approval'
                                                                            : tripMatch?.status === 'Active' ? 'Trip Active'
                                                                            : tripMatch ? 'Sheet Draft' : 'Sheet Pending';
                                                                        const isApproved = budgetStatus === 'Budget Approved';
                                                                        const isSubmitted = budgetStatus === 'Awaiting Boss Approval';
                                                                        return (
                                                                            <Badge className={cn(
                                                                                "text-[9px] font-bold px-2 py-0.5 border",
                                                                                isApproved ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                                                                : isSubmitted ? "bg-amber-50 text-amber-700 border-amber-200"
                                                                                : "bg-slate-50 text-slate-500 border-slate-200"
                                                                            )}>
                                                                                {isApproved ? '✓ ' : isSubmitted ? '⏳ ' : '○ '}{budgetStatus}
                                                                            </Badge>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right pr-6">
                                                                <div className="flex items-center justify-end gap-1.5">
                                                                    {isAdmin && (() => {
                                                                        const tripMatch = tripSheets?.find((t: any) => t.reference_number === order.trip_number);
                                                                        const isBudgetApproved = tripMatch?.status === 'Approved' || tripMatch?.status === 'Pending_Approval' || tripMatch?.status === 'Active';
                                                                        return (
                                                                            <Button
                                                                                size="sm"
                                                                                disabled={isBudgetApproved}
                                                                                className={cn(
                                                                                    "h-8 px-3 text-[10px] font-black uppercase tracking-wider rounded-lg shadow-sm gap-1.5 transition-all",
                                                                                    isBudgetApproved
                                                                                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                                                                        : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                                                                )}
                                                                                onClick={() => !isBudgetApproved && handleBudgetApproval(order)}
                                                                                title={isBudgetApproved ? "Already submitted for approval" : "Submit trip budget for approval"}
                                                                            >
                                                                                <ShieldCheck size={11} />
                                                                                {isBudgetApproved ? "Submitted" : "Submit for Approval"}
                                                                            </Button>
                                                                        );
                                                                    })()}
                                                                    <Button
                                                                        size="sm"
                                                                        className="h-8 px-3 text-[11px] font-black uppercase tracking-wider bg-slate-900 hover:bg-indigo-600 text-white rounded-lg shadow-sm gap-1.5 transition-all"
                                                                        onClick={() => {
                                                                            const tripMatch = tripSheets?.find((t: any) => t.reference_number === order.trip_number);
                                                                            if (tripMatch) {
                                                                                setDuplicateSourceTrip(null);
                                                                                setSelectedTrip(tripMatch);
                                                                            } else {
                                                                                setSelectedTrip(null);
                                                                                setDuplicateSourceTrip({
                                                                                    trip_number: order.trip_number,
                                                                                    reference_number: order.trip_number,
                                                                                    vehicle_id: order.vehicle_id,
                                                                                    trailer_id: order.trailer_id,
                                                                                    driver_id: order.driver_id,
                                                                                    license_no: order.license_no,
                                                                                    passport_no: order.passport_no,
                                                                                    origin: order.origin || 'DAR ES SALAAM',
                                                                                    destination: order.destination,
                                                                                    client_name: order.client_name,
                                                                                    journey_type: order.journey_type || 'Go & Return',
                                                                                    cargo_outbound: order.cargo_description,
                                                                                    revenue_amount: orderUSD,
                                                                                    revenue_currency: 'USD',
                                                                                    revenue_type: 'With Fuel',
                                                                                    exchange_rate: orderRate,
                                                                                    agreed_days: order.agreed_days,
                                                                                    daily_fine_amount: order.daily_penalty_fine
                                                                                });
                                                                            }
                                                                            setIsSheetOpen(true);
                                                                        }}
                                                                    >
                                                                        <Send size={11} />
                                                                        Review
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </div>
            ) : (
                /* ─── ACTIVE OPERATIONS (EXISTING TRIP SHEETS DATA - UNTOUCHED) ─── */
                <Fragment>

            <Card className="border border-slate-200 shadow-xl bg-white overflow-hidden rounded-2xl">
                <div className="overflow-x-auto">
                    <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow className="hover:bg-transparent border-b border-slate-100">
                            <TableHead className="w-12 text-center text-xs font-semibold text-slate-500">#</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 py-4">Vehicle Trip Details</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500">Current Status</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500">Asset Allocation</TableHead>
                            <TableHead className="w-16"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-24 text-slate-400 font-bold uppercase tracking-widest text-[10px]">Loading Secure Records...</TableCell></TableRow>
                        ) : isError ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-24">
                                <div className="flex flex-col items-center gap-2 text-red-500 italic">
                                    <AlertTriangle size={24} />
                                    <span className="font-bold text-xs uppercase tracking-tight">Sync Error: {(queryError as any)?.message}</span>
                                </div>
                            </TableCell></TableRow>
                        ) : (!filteredSheets || filteredSheets.length === 0) ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-24">
                                <Truck size={32} className="mx-auto text-slate-200 mb-3" />
                                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No Transit Records Found</p>
                            </TableCell></TableRow>
                        ) : (
                            Object.entries(groupedTrips).map(([clientName, clientGroup]: [string, any]) => {
                                const isClientExpanded = expandedGroups.includes(clientName);

                                return (
                                    <Fragment key={clientName}>
                                        {/* Level 1: Client Accordion Header */}
                                        <TableRow
                                            className="bg-slate-100/90 border-y border-slate-200 sticky top-0 z-10 transition-colors cursor-pointer hover:bg-slate-200/80 group/client"
                                            onClick={() => toggleGroup(clientName)}
                                        >
                                            <TableCell colSpan={4} className="py-4 px-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="transition-transform duration-200 text-slate-500">
                                                        {isClientExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                    </div>
                                                    <div className="p-2 bg-slate-900 text-white rounded-lg shadow-sm">
                                                        <Folders size={16} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-sm font-black text-slate-800 tracking-tight uppercase">{clientName}</span>
                                                            <Badge variant="secondary" className="text-[9px] h-5 font-black bg-slate-800 text-white rounded-md px-2">
                                                                {clientGroup.tripsCount} ASSETS TOTAL
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-6 ml-auto pl-6 border-l border-slate-200 hidden xl:flex">
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Gross Revenue</span>
                                                            <div className="flex items-baseline gap-2">
                                                                <span className="text-sm font-black text-orange-600">{formatTSh(clientGroup.totals.revenueTZS)}</span>
                                                                <span className="text-[10px] font-bold text-slate-400">${clientGroup.totals.revenueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Expenses</span>
                                                            <div className="flex items-baseline gap-2">
                                                                <span className="text-sm font-black text-rose-600">{formatTSh(clientGroup.totals.expensesTZS)}</span>
                                                                <span className="text-[10px] font-bold text-slate-400">${clientGroup.totals.expensesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Expected Surplus</span>
                                                            <div className="flex items-baseline gap-2">
                                                                <span className={cn("text-sm font-black", clientGroup.totals.profitTZS >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                                                    {formatTSh(clientGroup.totals.profitTZS)}
                                                                </span>
                                                                <span className="text-[10px] font-bold text-slate-400">${clientGroup.totals.profitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell />
                                        </TableRow>

                                        {isClientExpanded && Object.entries(clientGroup.subGroups).map(([subKey, subGroup]: [string, any]) => {
                                            const subGroupKey = `${clientName}_${subKey}`;
                                            const isSubExpanded = expandedGroups.includes(subGroupKey);

                                            return (
                                                <Fragment key={subGroupKey}>
                                                    {/* Level 2: Invoice / Convoy Accordion Header */}
                                                    <TableRow
                                                        className="bg-slate-50/70 border-b border-slate-100 transition-colors cursor-pointer hover:bg-slate-100 group/sub"
                                                        onClick={() => toggleGroup(subGroupKey)}
                                                    >
                                                        <TableCell colSpan={4} className="py-3 pl-12 pr-6">
                                                            <div className="flex items-center gap-4">
                                                                <div className="transition-transform duration-200 text-slate-400">
                                                                    {isSubExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                </div>
                                                                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100 shadow-sm">
                                                                    <CreditCard size={12} />
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                                                                        <span className="text-xs font-bold text-slate-700">{subGroup.name}</span>
                                                                        <div className="flex flex-wrap items-center gap-1">
                                                                            {(subGroup.destinations.length > 0 ? subGroup.destinations : ['No Route']).map((dest: string, idx: number) => (
                                                                                <div key={idx} className="flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded-full shadow-sm">
                                                                                    <RouteIcon size={8} className="text-indigo-400" />
                                                                                    <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">{dest}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                        <Badge variant="outline" className="text-[9px] h-4 font-bold bg-white text-slate-600 px-1.5 border-slate-200">
                                                                            {subGroup.trips.length} ASSETS
                                                                        </Badge>
                                                                        {(isSuperAdmin || isAdmin) && (
                                                                            <Button 
                                                                                variant="outline" 
                                                                                size="sm" 
                                                                                className="h-6 px-2 text-[8px] font-bold border-indigo-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-600 hover:text-white rounded flex items-center gap-1"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setBatchDialog({ open: true, groupKey: subGroupKey, trips: subGroup.trips });
                                                                                    setBatchData({ invoice_no: '', payment_status: 'Pending' });
                                                                                    setSelectedBatchTrips(subGroup.trips.map((t: any) => t.id));
                                                                                }}
                                                                            >
                                                                                <CreditCard size={8} />
                                                                                BATCH INVOICE
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-6 ml-auto pl-6 border-l border-slate-100 hidden lg:flex">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Revenue</span>
                                                                        <span className="text-xs font-black text-orange-600">{formatTSh(subGroup.totals.revenueTZS)}</span>
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Expenses</span>
                                                                        <span className="text-xs font-black text-rose-600">{formatTSh(subGroup.totals.expensesTZS)}</span>
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Expected Surplus</span>
                                                                        <span className={cn("text-xs font-black", subGroup.totals.profitTZS >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                                                            {formatTSh(subGroup.totals.profitTZS)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell />
                                                    </TableRow>

                                                    {isSubExpanded && (
                                                        <TableRow className="bg-slate-50/10 hover:bg-slate-50/10 transition-none border-none">
                                                            <TableCell colSpan={5} className="p-4 pl-20 pr-6 bg-slate-50/20">
                                                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                                                    {subGroup.trips.map((trip: any, tIndex: number) => {
                                                                        const rate = trip.exchange_rate || 2700;
                                                                        const revTSh = trip.revenue_currency === 'TZS' ? trip.revenue_amount : trip.revenue_amount * rate;
                                                                        const expTSh = trip.total_expenses_tzs || 0;
                                                                        const netTSh = revTSh - expTSh;
                                                                        const isProfit = netTSh >= 0;
                                                                        const revUSD = trip.revenue_currency === 'USD' ? (parseFloat(trip.revenue_amount) || 0) : (parseFloat(trip.revenue_amount) || 0) / rate;
                                                                        const expUSD = parseFloat(trip.total_expenses_usd) || 0;
                                                                        const netUSD = revUSD - expUSD;

                                                                        return (
                                                                            <div key={trip.id} className="relative group/card bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-6 overflow-hidden">
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

                                                                                {/* 2. Financials Section */}
                                                                                <div className="flex items-center justify-between xl:justify-end gap-6 border-t xl:border-t-0 xl:border-l border-slate-100 pt-4 xl:pt-0 xl:pl-6 w-full xl:w-auto">
                                                                                    <div className="space-y-1">
                                                                                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Revenue</p>
                                                                                        <div className="font-black text-orange-600 text-sm">{formatTSh(revTSh)}</div>
                                                                                        <div className="text-[10px] text-slate-500 font-bold">${revUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                                                    </div>
                                                                                    <div className="space-y-1">
                                                                                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Expenses</p>
                                                                                        <div className="font-black text-rose-600 text-sm">{formatTSh(expTSh)}</div>
                                                                                        <div className="text-[10px] text-slate-500 font-bold">${expUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                                                    </div>
                                                                                    <div className="space-y-1">
                                                                                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Expected Surplus</p>
                                                                                        <div className={cn("font-black text-sm", isProfit ? "text-emerald-600" : "text-rose-600")}>{formatTSh(netTSh)}</div>
                                                                                        <div className="text-[10px] text-slate-500 font-bold">${netUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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
                                                                                        <div className="flex items-center gap-2">
                                                                                            <Button
                                                                                                variant="outline"
                                                                                                size="sm"
                                                                                                className="h-9 px-4 rounded-xl font-bold text-[10px] uppercase tracking-widest bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-600 hover:text-white flex-1 sm:flex-none"
                                                                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(trip.id, 'Active'); }}
                                                                                            >
                                                                                                <Zap size={14} className="mr-1.5" /> ACTIVATE TRIP
                                                                                            </Button>
                                                                                            <Button
                                                                                                variant="outline"
                                                                                                size="sm"
                                                                                                className="h-9 px-4 rounded-xl font-bold text-[10px] uppercase tracking-widest bg-red-50 border-red-200 text-red-600 hover:bg-red-600 hover:text-white flex-1 sm:flex-none"
                                                                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(trip.id, 'Planned'); }}
                                                                                            >
                                                                                                UNAPPROVE
                                                                                            </Button>
                                                                                        </div>
                                                                                    )}
                                                                                    
                                                                                    {trip.status === 'Active' && (
                                                                                        <div className="flex items-center gap-2 flex-1 sm:flex-none">
                                                                                            <Button
                                                                                                variant="outline"
                                                                                                size="sm"
                                                                                                disabled
                                                                                                className="h-9 px-4 rounded-xl font-bold text-[10px] uppercase tracking-widest bg-emerald-100 border-emerald-300 text-emerald-700 opacity-80"
                                                                                            >
                                                                                                <Zap size={14} className="mr-1.5" /> ACTIVATED
                                                                                            </Button>
                                                                                            <Button
                                                                                                variant="outline"
                                                                                                size="sm"
                                                                                                className="h-9 px-4 rounded-xl font-bold text-[10px] uppercase tracking-widest bg-slate-900 border-slate-900 text-white hover:bg-slate-800 hover:text-white"
                                                                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(trip.id, 'Completed'); }}
                                                                                            >
                                                                                                <ShieldCheck size={14} className="mr-1.5" /> CLOSE TRIP
                                                                                            </Button>
                                                                                        </div>
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

                                                                                        {trip.status === 'Planned' && (
                                                                                            <Button
                                                                                                variant="ghost"
                                                                                                size="icon"
                                                                                                className="h-9 w-9 rounded-xl border border-rose-100 shadow-sm transition-all text-rose-500 hover:bg-rose-500 hover:text-white border-rose-200"
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    handleDeleteTrip(trip.id);
                                                                                                }}
                                                                                                title="Delete Draft Trip"
                                                                                            >
                                                                                                <Trash2 size={16} />
                                                                                            </Button>
                                                                                        )}

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
                                        })}
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
