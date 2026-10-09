import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
    ShieldCheck,
    Zap,
    Clock,
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
    Send,
    Calendar,
    Edit2,
    RefreshCw,
    Copy,
    Check,
    Layers,
    Filter,
    SlidersHorizontal,
    Eye,
    Trash2,
    ArrowUpRight,
    Compass
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
    const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Approved' | 'Planned'>('all');
    const [copiedRef, setCopiedRef] = useState<string | null>(null);

    const copyToClipboard = (text: string, label: string = "Reference") => {
        navigator.clipboard.writeText(text);
        setCopiedRef(text);
        toast({
            title: "Copied to Clipboard ✓",
            description: `${label}: ${text}`
        });
        setTimeout(() => setCopiedRef(null), 2000);
    };
    
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
    const [editRefDialog, setEditRefDialog] = useState<{ open: boolean; trip: any; newRef: string }>({
        open: false,
        trip: null,
        newRef: ''
    });
    const [isUpdatingRef, setIsUpdatingRef] = useState(false);
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

    const handleUpdateTripReference = async () => {
        const { trip, newRef } = editRefDialog;
        const trimmedRef = newRef.trim();
        if (!trip || !trimmedRef) {
            toast({
                variant: "destructive",
                title: "Reference Required",
                description: "Please enter a valid trip sheet reference number."
            });
            return;
        }

        setIsUpdatingRef(true);
        try {
            const oldRef = trip.reference_number;
            const { error } = await supabase
                .from('logistics_trip_sheets' as any)
                .update({
                    reference_number: trimmedRef,
                    updated_at: new Date().toISOString()
                })
                .eq('id', trip.id);

            if (error) throw error;

            // Also keep logistics_trips table in sync if matching trip_number exists
            if (oldRef) {
                await supabase
                    .from('logistics_trips' as any)
                    .update({ trip_number: trimmedRef })
                    .eq('trip_number', oldRef);
            }

            toast({
                title: "Reference Number Updated ✓",
                description: `Trip reference switched to "${trimmedRef}". Approved Orders filter updated automatically.`
            });

            setEditRefDialog({ open: false, trip: null, newRef: '' });
            refetch();
            refetchApprovedOrders();
        } catch (err: any) {
            toast({
                variant: "destructive",
                title: "Update Failed",
                description: err.message
            });
        } finally {
            setIsUpdatingRef(false);
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

    // Filter approved orders: exclude any whose trip sheet has already been approved/active by Executive/Fund Approvals
    const activeOrApprovedTripSheetNumbers = new Set(
        (tripSheets || [])
            .filter((s: any) => s.status === 'Approved' || s.status === 'Active')
            .map((s: any) => s.reference_number?.trim()?.toUpperCase())
            .filter(Boolean)
    );

    const pendingConfirmationOrders = approvedOrders.filter((order: any) => {
        const tripNum = (order.trip_number || '').trim().toUpperCase();
        return !activeOrApprovedTripSheetNumbers.has(tripNum);
    });

    // Filter approved orders by search
    const filteredApprovedOrders = pendingConfirmationOrders.filter((order: any) =>
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

    const isAllApprovedExpanded = useMemo(() => {
        const clients = Object.keys(groupedApprovedOrders);
        return clients.length > 0 && clients.every(c => expandedApprovedClients.includes(c));
    }, [groupedApprovedOrders, expandedApprovedClients]);

    const handleToggleAllApprovedClients = () => {
        const clients = Object.keys(groupedApprovedOrders);
        if (isAllApprovedExpanded) {
            setExpandedApprovedClients([]);
        } else {
            setExpandedApprovedClients(clients);
        }
    };

    const filteredSheets = useMemo(() => {
        return tripSheets?.filter(trip => {
            const term = searchTerm.trim().toLowerCase();
            const matchesSearch = !term || (
                (trip.reference_number || '').toLowerCase().includes(term) ||
                (trip.vehicle?.vehicle_no || '').toLowerCase().includes(term) ||
                (trip.driver?.full_name || '').toLowerCase().includes(term) ||
                (trip.destination || '').toLowerCase().includes(term) ||
                (trip.origin || '').toLowerCase().includes(term) ||
                (trip.client_name || '').toLowerCase().includes(term) ||
                (trip.cargo_outbound || '').toLowerCase().includes(term) ||
                (trip.invoice_no || '').toLowerCase().includes(term)
            );

            const matchesStatus = statusFilter === 'all'
                ? (trip.status === 'Active' || trip.status === 'Approved')
                : statusFilter === 'Planned'
                    ? (trip.status === 'Planned' || trip.status === 'Pending_Approval')
                    : trip.status === statusFilter;

            return matchesSearch && matchesStatus;
        }) || [];
    }, [tripSheets, searchTerm, statusFilter]);

    const groupedTrips = useMemo(() => {
        return filteredSheets.filter(t => t.status !== 'Completed').reduce((acc, trip) => {
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
        }, {} as Record<string, any>);
    }, [filteredSheets]);

    // Live KPI statistics across all trips
    const stats = useMemo(() => {
        const sheets = tripSheets || [];
        const active = sheets.filter(s => s.status === 'Active');
        const approved = sheets.filter(s => s.status === 'Approved');
        const planned = sheets.filter(s => s.status === 'Planned' || s.status === 'Pending_Approval');
        const completed = sheets.filter(s => s.status === 'Completed');

        let totalActiveRevenueUSD = 0;
        let totalActiveRevenueTZS = 0;
        let totalActiveProfitUSD = 0;
        let totalActiveProfitTZS = 0;

        active.forEach(t => {
            const rate = parseFloat(t.exchange_rate) || 2700;
            const revAmt = parseFloat(t.revenue_amount) || 0;
            const revUSD = t.revenue_currency === 'USD' ? revAmt : revAmt / rate;
            const revTZS = t.revenue_currency === 'TZS' ? revAmt : revAmt * rate;
            const expUSD = parseFloat(t.total_expenses_usd) || 0;
            const expTZS = parseFloat(t.total_expenses_tzs) || 0;
            totalActiveRevenueUSD += revUSD;
            totalActiveRevenueTZS += revTZS;
            totalActiveProfitUSD += (revUSD - expUSD);
            totalActiveProfitTZS += (revTZS - expTZS);
        });

        return {
            totalTrips: sheets.length,
            activeCount: active.length,
            approvedCount: approved.length,
            plannedCount: planned.length,
            completedCount: completed.length,
            pendingOrdersCount: pendingConfirmationOrders.length,
            activeRevenueUSD: totalActiveRevenueUSD,
            activeRevenueTZS: totalActiveRevenueTZS,
            activeProfitUSD: totalActiveProfitUSD,
            activeProfitTZS: totalActiveProfitTZS,
        };
    }, [tripSheets, pendingConfirmationOrders]);

    // Expand/Collapse all clients & convoys
    const isAllExpanded = useMemo(() => {
        const clientKeys = Object.keys(groupedTrips);
        if (clientKeys.length === 0) return false;
        return clientKeys.every(k => expandedGroups.includes(k));
    }, [groupedTrips, expandedGroups]);

    const handleToggleAllGroups = () => {
        if (isAllExpanded) {
            setExpandedGroups([]);
        } else {
            const allClientKeys = Object.keys(groupedTrips);
            const allSubKeys = Object.entries(groupedTrips).flatMap(([clientName, grp]: [string, any]) =>
                Object.keys(grp.subGroups).map(subKey => `${clientName}_${subKey}`)
            );
            setExpandedGroups([...allClientKeys, ...allSubKeys]);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Planned': 
                return <Badge className="bg-amber-50 text-amber-800 border-amber-200 gap-1 font-bold text-[10px]"><Clock size={11} className="text-amber-600" /> DRAFT</Badge>;
            case 'Pending_Approval': 
                return <Badge className="bg-purple-50 text-purple-800 border-purple-200 gap-1 font-bold text-[10px]"><Clock size={11} className="text-purple-600" /> AWAITING APPROVAL</Badge>;
            case 'Approved': 
                return <Badge className="bg-blue-50 text-blue-800 border-blue-200 gap-1 font-bold text-[10px]"><ShieldCheck size={11} className="text-blue-600" /> APPROVED</Badge>;
            case 'Active': 
                return <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 gap-1 font-bold text-[10px]"><Zap size={11} className="text-emerald-600" /> ACTIVE (IN TRANSIT)</Badge>;
            case 'Completed': 
                return <Badge className="bg-slate-100 text-slate-700 border-slate-200 gap-1 font-bold text-[10px]"><CheckCircle2 size={11} className="text-slate-500" /> COMPLETED</Badge>;
            default: 
                return <Badge variant="outline" className="text-[10px] font-bold">{status}</Badge>;
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
        <div className="p-2.5 sm:p-4 md:p-6 space-y-4 sm:space-y-6 animate-fade-in max-w-[1700px] mx-auto overflow-x-hidden">
            {/* ── Executive Header Strip ────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 sm:p-2.5 bg-slate-900 text-white rounded-xl shadow-xs shrink-0">
                            <Truck size={18} className="text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase">
                                    Trip Sheets & Dispatch
                                </h1>
                                <Badge className="bg-slate-100 text-slate-700 border-slate-200 font-bold text-[10px]">
                                    {stats.totalTrips} Total Records
                                </Badge>
                            </div>
                            <p className="text-xs text-slate-500 font-medium">
                                Manage vehicle transit operations, route budgets, cargo dispatches, and client convoys.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            refetch();
                            refetchApprovedOrders();
                            toast({ title: "Refreshing Data...", description: "Latest trip sheets and orders retrieved." });
                        }}
                        className="h-9 px-3 rounded-xl text-xs font-bold text-slate-600 border-slate-200 hover:bg-slate-50 gap-1.5"
                    >
                        <RefreshCw size={13} className={isLoading ? "animate-spin text-indigo-600" : "text-slate-500"} />
                        <span>Refresh</span>
                    </Button>

                    <Button
                        size="sm"
                        onClick={() => {
                            setSelectedTrip(null);
                            setDuplicateSourceTrip(null);
                            setIsSheetOpen(true);
                        }}
                        className="h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-900 hover:bg-indigo-600 text-white shadow-xs gap-1.5 active:scale-95 transition-all"
                    >
                        <Plus size={14} />
                        <span>New Trip Sheet</span>
                    </Button>
                </div>
            </div>

            {/* ── Executive KPI Metric Cards ────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* 1. Active In Transit */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">In Transit (Active)</span>
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                            <Zap size={16} />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900">{stats.activeCount}</span>
                        <span className="text-xs font-bold text-emerald-600">Vehicles on Road</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Active convoys with assigned driver & cargo
                    </div>
                </Card>

                {/* 2. Approved & Ready */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Approved & Ready</span>
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                            <ShieldCheck size={16} />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900">{stats.approvedCount}</span>
                        <span className="text-xs font-bold text-blue-600">Ready for Activation</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Budget vetted, awaiting departure signal
                    </div>
                </Card>

                {/* 3. Approved Orders Queue */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pre-Op Queue</span>
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <Sparkles size={16} />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900">{stats.pendingOrdersCount}</span>
                        <span className="text-xs font-bold text-indigo-600">Office Approved</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Trip orders approved, pending dispatch confirmation
                    </div>
                </Card>

                {/* 4. Active Transit Revenue */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Active Transit Value</span>
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-xl">
                            <DollarSign size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-lg font-black text-slate-900 leading-tight">
                            ${stats.activeRevenueUSD.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} USD
                        </div>
                        <div className="text-[11px] font-black text-orange-600 mt-0.5">
                            {formatTSh(stats.activeRevenueTZS)}
                        </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Estimated gross across active road operations
                    </div>
                </Card>
            </div>

            {/* ── Segmented Navigation Tabs ─────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-2.5 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar w-full sm:w-auto">
                    <button
                        type="button"
                        onClick={() => setActiveTab('operations')}
                        className={cn(
                            "h-9 px-3.5 sm:px-4 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0",
                            activeTab === 'operations'
                                ? "bg-white text-slate-900 shadow-xs"
                                : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
                        )}
                    >
                        <Truck size={14} className={activeTab === 'operations' ? "text-indigo-600" : "text-slate-400"} />
                        <span>Active Operations</span>
                        <Badge className={cn(
                            "text-[9px] font-black px-1.5 py-0 h-4 border-none ml-1",
                            activeTab === 'operations' ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"
                        )}>
                            {stats.activeCount + stats.approvedCount}
                        </Badge>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('approved_orders')}
                        className={cn(
                            "h-9 px-3.5 sm:px-4 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0",
                            activeTab === 'approved_orders'
                                ? "bg-indigo-600 text-white shadow-xs shadow-indigo-200"
                                : "text-slate-600 hover:text-indigo-600 hover:bg-white/50"
                        )}
                    >
                        <Sparkles size={14} className={activeTab === 'approved_orders' ? "text-amber-300" : "text-indigo-500"} />
                        <span>Approved Orders Queue</span>
                        {stats.pendingOrdersCount > 0 && (
                            <Badge className={cn(
                                "text-[9px] font-black px-1.5 py-0 h-4 border-none ml-1",
                                activeTab === 'approved_orders' ? "bg-white text-indigo-900" : "bg-amber-500 text-white"
                            )}>
                                {stats.pendingOrdersCount}
                            </Badge>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('history')}
                        className={cn(
                            "h-9 px-3.5 sm:px-4 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0",
                            activeTab === 'history'
                                ? "bg-slate-800 text-white shadow-xs"
                                : "text-slate-500 hover:text-slate-900 hover:bg-white/50"
                        )}
                    >
                        <CheckCircle2 size={14} className={activeTab === 'history' ? "text-emerald-400" : "text-slate-400"} />
                        <span>History & Completed</span>
                        <Badge className={cn(
                            "text-[9px] font-black px-1.5 py-0 h-4 border-none ml-1",
                            activeTab === 'history' ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                        )}>
                            {stats.completedCount}
                        </Badge>
                    </button>
                </div>
            </div>

            {activeTab === 'history' ? (
                <CompletedTripsHistory 
                    tripSheets={tripSheets || []} 
                    searchTerm={searchTerm} 
                    onSelectTrip={(trip: any) => {
                        setDuplicateSourceTrip(null);
                        setSelectedTrip(trip);
                        setIsSheetOpen(true);
                    }}
                />
            ) : activeTab === 'approved_orders' ? (
                /* ─── APPROVED ORDERS QUEUE (ORGANIZED, PROFESSIONAL & INTUITIVE) ─── */
                <div className="space-y-4">
                    {/* Operations Control Toolbar (Matches Active Operations) */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                        {/* Search Input */}
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input
                                placeholder="Search approved order, trip #, truck plate, driver, client..."
                                className="pl-9 pr-8 h-9 bg-slate-50 border-slate-200 focus:bg-white text-xs font-medium rounded-xl"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {/* Status Pills / Counter */}
                        <div className="flex items-center gap-2 overflow-x-auto">
                            <div className="h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-indigo-600 text-white flex items-center gap-1.5 shadow-xs whitespace-nowrap">
                                <Sparkles size={12} className="text-amber-300" />
                                <span>Pre-Op Queue ({filteredApprovedOrders.length})</span>
                            </div>
                            <Badge variant="outline" className="h-8 px-3 rounded-lg text-[11px] font-bold border-slate-200 text-slate-600 bg-slate-50 whitespace-nowrap">
                                {Object.keys(groupedApprovedOrders).length} {Object.keys(groupedApprovedOrders).length === 1 ? 'Client' : 'Clients'}
                            </Badge>
                        </div>

                        {/* Expand All / Collapse All Toggle */}
                        <div className="flex items-center gap-2 ml-auto lg:ml-0">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleToggleAllApprovedClients}
                                className="h-8 px-3 text-xs font-bold text-slate-600 border-slate-200 hover:bg-slate-50 gap-1.5 rounded-xl"
                            >
                                <Layers size={13} className="text-slate-400" />
                                <span>{isAllApprovedExpanded ? "Collapse All" : "Expand All"}</span>
                            </Button>
                        </div>
                    </div>

                    {/* Content List */}
                    {isLoadingApprovedOrders ? (
                        <Card className="border border-slate-200 bg-white p-16 rounded-2xl text-center shadow-xs">
                            <RefreshCw size={28} className="mx-auto text-indigo-600 animate-spin mb-3" />
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                Loading Approved Orders Queue...
                            </p>
                        </Card>
                    ) : Object.keys(groupedApprovedOrders).length === 0 ? (
                        <Card className="border border-slate-200 bg-white p-16 rounded-2xl text-center shadow-xs">
                            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <CheckCircle2 size={28} className="text-emerald-500" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                                No Orders Pending Confirmation
                            </h3>
                            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 font-medium">
                                {searchTerm
                                    ? "No approved orders match your current search query. Try clearing your filters."
                                    : "All approved orders have been converted to active convoys. When new trip orders are approved in Logistics Trip Orders, they will appear here."}
                            </p>
                            {searchTerm && (
                                <div className="mt-5 flex items-center justify-center">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setSearchTerm("")}
                                        className="h-9 px-4 text-xs font-bold rounded-xl"
                                    >
                                        Clear Search
                                    </Button>
                                </div>
                            )}
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            {Object.entries(groupedApprovedOrders).map(([clientName, group]: [string, any], cIdx: number) => {
                                const isExpanded = expandedApprovedClients.includes(clientName);

                                return (
                                    <Card
                                        key={clientName}
                                        className="border border-slate-200 bg-white shadow-xs rounded-2xl overflow-hidden transition-all duration-200"
                                    >
                                        {/* Client Header Card (Matches Active Operations) */}
                                        <div
                                            onClick={() => toggleApprovedClient(clientName)}
                                            className="p-4 sm:p-5 bg-gradient-to-r from-slate-50/90 via-white to-slate-50/50 hover:from-slate-100/90 hover:to-slate-100/60 border-b border-slate-200 cursor-pointer transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 select-none"
                                        >
                                            <div className="flex items-center gap-3.5 flex-1">
                                                <div className="text-slate-400 transition-transform duration-200">
                                                    {isExpanded ? <ChevronDown size={20} className="text-slate-700" /> : <ChevronRight size={20} />}
                                                </div>

                                                <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs">
                                                    <Building2 size={18} />
                                                </div>

                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="text-base font-black text-slate-900 tracking-tight uppercase">
                                                            {clientName}
                                                        </h3>
                                                        <Badge className="bg-indigo-600 text-white text-[10px] font-black border-none px-2 h-5 rounded-md">
                                                            {group.vehiclesCount} {group.vehiclesCount === 1 ? 'Vehicle' : 'Vehicles'} Total
                                                        </Badge>
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                                                        {isExpanded ? "Click to collapse approved order details" : "Click to expand approved vehicles & trip setup"}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Client Totals Strip & Batch Approval Button */}
                                            <div className="flex items-center gap-4 sm:gap-6 flex-wrap sm:flex-nowrap pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-200">
                                                <div className="space-y-0.5">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Contracted Gross</span>
                                                    <div className="text-sm font-black text-orange-600 leading-none">
                                                        {formatTSh(group.totalTZS)}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-400 block">
                                                        ${group.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>

                                                <div className="space-y-0.5 pl-4 border-l border-slate-200">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Est. Expenses</span>
                                                    <div className="text-sm font-black text-rose-600 leading-none">
                                                        {formatTSh(group.totalExpensesTZS)}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-400 block">
                                                        ${group.totalExpensesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>

                                                <div className="space-y-0.5 pl-4 border-l border-slate-200">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Est. Profit</span>
                                                    <div className={cn("text-sm font-black leading-none", group.totalProfitUSD >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                                        {formatTSh(group.totalProfitTZS)}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-400 block">
                                                        ${group.totalProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>

                                                {isAdmin && (
                                                    <div className="pl-4 border-l border-slate-200" onClick={(e) => e.stopPropagation()}>
                                                        <Button
                                                            size="sm"
                                                            className="h-8 px-3 text-[10px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm gap-1.5"
                                                            onClick={() => handleBatchBudgetApproval(group.orders)}
                                                        >
                                                            <ShieldCheck size={12} />
                                                            Submit All ({group.vehiclesCount})
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Child Vehicle Cards inside Client Folder (Matches Active Operations cards) */}
                                        {isExpanded && (
                                            <div className="p-4 sm:p-5 bg-slate-50/40 space-y-3">
                                                {group.orders.map((order: any, oIdx: number) => {
                                                    const orderUSD = parseFloat(order.agreed_amount_usd) || 0;
                                                    const orderRate = parseFloat(order.agreed_client_rate) || 2700;
                                                    const orderLocal = parseFloat(order.agreed_amount_local) || (orderUSD * orderRate);
                                                    const est = getVehicleEstimatedExpenses(order);
                                                    const rawGoUsd = order.go_amount_usd !== null && order.go_amount_usd !== undefined && order.go_amount_usd !== ''
                                                        ? parseFloat(order.go_amount_usd) || 0
                                                        : orderUSD;
                                                    const rawRetUsd = parseFloat(order.return_amount_usd) || 0;
                                                    const marginPct = orderUSD > 0 ? Math.round((est.profitUSD / orderUSD) * 100) : 0;
                                                    const isProfit = est.profitUSD >= 0;

                                                    const tripMatch = tripSheets?.find((t: any) => t.reference_number === order.trip_number);
                                                    const isBudgetApproved = tripMatch?.status === 'Approved' || tripMatch?.status === 'Pending_Approval' || tripMatch?.status === 'Active';
                                                    const budgetStatus = tripMatch?.status === 'Approved' ? 'Budget Approved'
                                                        : tripMatch?.status === 'Pending_Approval' ? 'Awaiting Boss Approval'
                                                        : tripMatch?.status === 'Active' ? 'Trip Active'
                                                        : tripMatch ? 'Sheet Draft' : 'Sheet Pending';

                                                    return (
                                                        <div
                                                            key={order.id}
                                                            className="relative group/card bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-5 overflow-hidden"
                                                        >
                                                            {/* Status Accent Bar */}
                                                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-500" />

                                                            {/* 1. Vehicle & Identity */}
                                                            <div className="flex items-start gap-3.5 flex-1 min-w-[280px]">
                                                                <div className="text-[10px] font-black text-slate-300 tabular-nums mt-1">
                                                                    {(oIdx + 1).toString().padStart(2, '0')}
                                                                </div>

                                                                <div className="space-y-1.5">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <span className="font-black text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
                                                                            <Truck size={14} className="text-indigo-600" />
                                                                            {order.truck_reg || "PENDING HORSE"}
                                                                        </span>
                                                                        {order.trailer_reg && (
                                                                            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                                                                / {order.trailer_reg}
                                                                            </span>
                                                                        )}
                                                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-black px-2 py-0.5">
                                                                            ORDER APPROVED
                                                                        </Badge>
                                                                        <Badge
                                                                            variant="outline"
                                                                            className="text-[9px] font-bold tracking-tight uppercase px-1.5 py-0 h-4 rounded border-dashed border-indigo-200 text-indigo-700 bg-indigo-50/50"
                                                                        >
                                                                            {order.journey_type || 'Go & Return'}
                                                                        </Badge>
                                                                        <Badge className={cn(
                                                                            "text-[9px] font-bold px-2 py-0.5 border",
                                                                            isBudgetApproved ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                                                            : budgetStatus === 'Awaiting Boss Approval' ? "bg-amber-50 text-amber-700 border-amber-200"
                                                                            : "bg-slate-50 text-slate-500 border-slate-200"
                                                                        )}>
                                                                            {isBudgetApproved ? '✓ ' : budgetStatus === 'Awaiting Boss Approval' ? '⏳ ' : '○ '}{budgetStatus}
                                                                        </Badge>
                                                                    </div>

                                                                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                                                                        {/* Driver */}
                                                                        <div className="flex items-center gap-1 text-[11px] text-slate-600 font-bold">
                                                                            <User size={11} className="text-slate-400" />
                                                                            <span>{order.driver_name || "Awaiting Driver"}</span>
                                                                            {order.contact_no && (
                                                                                <span className="text-slate-400 font-normal">({order.contact_no})</span>
                                                                            )}
                                                                        </div>

                                                                        <span className="text-slate-300">•</span>

                                                                        {/* Trip ID with Copy */}
                                                                        <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                                                                            <span>Trip ID: {order.trip_number || 'PENDING #'}</span>
                                                                            {order.trip_number && (
                                                                                <button
                                                                                    type="button"
                                                                                    title="Copy Trip Number"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        copyToClipboard(order.trip_number, "Trip Number");
                                                                                    }}
                                                                                    className="text-slate-400 hover:text-indigo-600 p-0.5 rounded transition-colors ml-0.5"
                                                                                >
                                                                                    {copiedRef === order.trip_number ? (
                                                                                        <Check size={10} className="text-emerald-600" />
                                                                                    ) : (
                                                                                        <Copy size={10} />
                                                                                    )}
                                                                                </button>
                                                                            )}
                                                                        </div>

                                                                        <span className="text-slate-300">•</span>

                                                                        {/* Batch / Order badge */}
                                                                        <Badge variant="outline" className="text-[9px] font-black px-1.5 py-0 h-4 border-slate-300 text-slate-700 bg-white">
                                                                            {order.order_number || "BATCH"}
                                                                        </Badge>

                                                                        <span className="text-slate-300">•</span>

                                                                        {/* Approved by & date */}
                                                                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                                                                            <ShieldCheck size={10} className="text-emerald-600" />
                                                                            <span>By {order.approved_by_name || "Yahya Kilua"}</span>
                                                                            {order.approved_at && (
                                                                                <span>• {order.approved_at.split('T')[0]}</span>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    {/* Route & Cargo */}
                                                                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                                                                        <div className="inline-flex items-center gap-1 text-xs font-black text-slate-800">
                                                                            <RouteIcon size={12} className="text-indigo-500" />
                                                                            <span>{order.origin || 'DAR ES SALAAM'}</span>
                                                                            <ArrowRight size={10} className="text-slate-400" />
                                                                            <span className="text-indigo-600">{order.destination}</span>
                                                                        </div>
                                                                        {order.cargo_description && (
                                                                            <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                                                                Cargo: {order.cargo_description}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* 2. Financials Breakdown */}
                                                            <div className="flex items-center justify-between xl:justify-end gap-6 border-t xl:border-t-0 xl:border-l border-slate-100 pt-3 xl:pt-0 xl:pl-6 w-full xl:w-auto">
                                                                <div className="space-y-0.5">
                                                                    <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Gross Contract</span>
                                                                    <div className="font-black text-orange-600 text-xs leading-none">{formatTSh(orderLocal)}</div>
                                                                    <span className="text-[10px] text-slate-400 font-bold block">${orderUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                    {rawRetUsd > 0 && (
                                                                        <span className="text-[8px] text-slate-400 block font-semibold">
                                                                            Go: ${rawGoUsd.toLocaleString(undefined, { minimumFractionDigits: 0 })} | Ret: ${rawRetUsd.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div className="space-y-0.5 pl-4 border-l border-slate-100">
                                                                    <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Est. Expenses</span>
                                                                    <div className="font-black text-rose-600 text-xs leading-none">{formatTSh(est.expTZS)}</div>
                                                                    <span className="text-[10px] text-slate-400 font-bold block">${est.expUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                </div>

                                                                <div className="space-y-0.5 pl-4 border-l border-slate-100 text-right">
                                                                    <div className="flex items-center justify-end gap-1.5">
                                                                        <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Est. Surplus</span>
                                                                        {orderUSD > 0 && (
                                                                            <span className={cn(
                                                                                "text-[9px] px-1.5 py-0.2 rounded font-black tracking-tight border",
                                                                                marginPct >= 20 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                                                marginPct > 0 ? "bg-amber-50 text-amber-700 border-amber-200" :
                                                                                "bg-rose-50 text-rose-700 border-rose-200"
                                                                            )}>
                                                                                {marginPct}%
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className={cn("font-black text-xs leading-none", isProfit ? "text-emerald-600" : "text-rose-600")}>
                                                                        {formatTSh(est.profitTZS)}
                                                                    </div>
                                                                    <span className="text-[10px] text-slate-400 font-bold block">
                                                                        ${est.profitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* 3. Action Buttons */}
                                                            <div className="flex items-center gap-2 pl-0 xl:pl-4 border-t xl:border-t-0 xl:border-l border-slate-100 pt-3 xl:pt-0 w-full xl:w-auto flex-wrap sm:flex-nowrap justify-end">
                                                                {isAdmin && (
                                                                    <Button
                                                                        size="sm"
                                                                        disabled={isBudgetApproved}
                                                                        className={cn(
                                                                            "h-8 px-3 text-[10px] font-black uppercase tracking-wider rounded-lg shadow-sm gap-1.5 transition-all",
                                                                            isBudgetApproved
                                                                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default opacity-100 shadow-none font-bold"
                                                                                : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                                                        )}
                                                                        onClick={() => !isBudgetApproved && handleBudgetApproval(order)}
                                                                        title={isBudgetApproved ? "Already submitted for approval" : "Submit trip budget for approval"}
                                                                    >
                                                                        {isBudgetApproved ? (
                                                                            <>
                                                                                <Check size={12} className="text-emerald-600 stroke-[3]" />
                                                                                <span>Submitted ✓</span>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <ShieldCheck size={12} />
                                                                                <span>Submit for Approval</span>
                                                                            </>
                                                                        )}
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    size="sm"
                                                                    className="h-8 px-3.5 rounded-lg font-black text-[10px] uppercase tracking-wider bg-slate-900 text-white hover:bg-indigo-600 shadow-xs transition-all gap-1.5"
                                                                    onClick={() => {
                                                                        const existingTrip = tripSheets?.find((t: any) => t.reference_number === order.trip_number);
                                                                        if (existingTrip) {
                                                                            setDuplicateSourceTrip(null);
                                                                            setSelectedTrip(existingTrip);
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
                                                                                go_amount_usd: order.go_amount_usd !== null && order.go_amount_usd !== undefined && order.go_amount_usd !== '' ? String(order.go_amount_usd) : String(orderUSD),
                                                                                return_amount_usd: order.return_amount_usd !== null && order.return_amount_usd !== undefined ? String(order.return_amount_usd) : '',
                                                                                exchange_rate: orderRate,
                                                                                agreed_days: order.agreed_days,
                                                                                daily_fine_amount: order.daily_penalty_fine
                                                                            });
                                                                        }
                                                                        setIsSheetOpen(true);
                                                                    }}
                                                                >
                                                                    <Send size={11} />
                                                                    Review & Setup
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                /* ─── ACTIVE OPERATIONS (ORGANIZED, PROFESSIONAL & INTUITIVE) ─── */
                <div className="space-y-4">
                    {/* Operations Control Toolbar */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                        {/* Search Input */}
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input
                                placeholder="Search trip #, plate, driver, destination, client, invoice..."
                                className="pl-9 pr-8 h-9 bg-slate-50 border-slate-200 focus:bg-white text-xs font-medium rounded-xl"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {/* Status Filter Toggle Pills */}
                        <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
                            <button
                                type="button"
                                onClick={() => setStatusFilter('all')}
                                className={cn(
                                    "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                                    statusFilter === 'all'
                                        ? "bg-slate-900 text-white shadow-xs"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                )}
                            >
                                Active & Approved ({stats.activeCount + stats.approvedCount})
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter('Active')}
                                className={cn(
                                    "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap",
                                    statusFilter === 'Active'
                                        ? "bg-emerald-600 text-white shadow-xs"
                                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                )}
                            >
                                <Zap size={11} />
                                Active ({stats.activeCount})
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter('Approved')}
                                className={cn(
                                    "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap",
                                    statusFilter === 'Approved'
                                        ? "bg-blue-600 text-white shadow-xs"
                                        : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                                )}
                            >
                                <ShieldCheck size={11} />
                                Approved ({stats.approvedCount})
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter('Planned')}
                                className={cn(
                                    "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 whitespace-nowrap",
                                    statusFilter === 'Planned'
                                        ? "bg-amber-600 text-white shadow-xs"
                                        : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                                )}
                            >
                                <Clock size={11} />
                                Draft ({stats.plannedCount})
                            </button>
                        </div>

                        {/* Expand All / Collapse All */}
                        <div className="flex items-center gap-2 ml-auto lg:ml-0">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleToggleAllGroups}
                                className="h-8 px-3 text-xs font-bold text-slate-600 border-slate-200 hover:bg-slate-50 gap-1.5 rounded-xl"
                            >
                                <Layers size={13} className="text-slate-400" />
                                <span>{isAllExpanded ? "Collapse All" : "Expand All"}</span>
                            </Button>
                        </div>
                    </div>

                    {/* Content List */}
                    {isLoading ? (
                        <Card className="border border-slate-200 bg-white p-16 rounded-2xl text-center">
                            <RefreshCw size={28} className="mx-auto text-indigo-600 animate-spin mb-3" />
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                Loading Secure Operations Records...
                            </p>
                        </Card>
                    ) : isError ? (
                        <Card className="border border-rose-200 bg-rose-50/50 p-12 rounded-2xl text-center">
                            <AlertTriangle size={28} className="mx-auto text-rose-500 mb-2" />
                            <p className="text-xs font-bold text-rose-700 uppercase tracking-tight">
                                Sync Error: {(queryError as any)?.message}
                            </p>
                        </Card>
                    ) : Object.keys(groupedTrips).length === 0 ? (
                        <Card className="border border-slate-200 bg-white p-16 rounded-2xl text-center shadow-xs">
                            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <Truck size={28} className="text-slate-400" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                                No Transit Operations Found
                            </h3>
                            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 font-medium">
                                {searchTerm || statusFilter !== 'all'
                                    ? "No trip sheets match your current search or status filter. Try clearing filters."
                                    : "No active trip sheets in progress. You can create a new trip sheet or confirm orders from the Approved Orders queue."}
                            </p>
                            <div className="mt-5 flex items-center justify-center gap-2">
                                {(searchTerm || statusFilter !== 'all') && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => { setSearchTerm(""); setStatusFilter('all'); }}
                                        className="h-9 px-4 text-xs font-bold rounded-xl"
                                    >
                                        Clear Filters
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    onClick={() => { setSelectedTrip(null); setDuplicateSourceTrip(null); setIsSheetOpen(true); }}
                                    className="h-9 px-4 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                                >
                                    <Plus size={14} className="mr-1.5" />
                                    New Trip Sheet
                                </Button>
                            </div>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            {Object.entries(groupedTrips).map(([clientName, clientGroup]: [string, any]) => {
                                const isClientExpanded = expandedGroups.includes(clientName);

                                return (
                                    <Card
                                        key={clientName}
                                        className="border border-slate-200 bg-white shadow-xs rounded-2xl overflow-hidden transition-all duration-200"
                                    >
                                        {/* Client Header Card */}
                                        <div
                                            onClick={() => toggleGroup(clientName)}
                                            className="p-4 sm:p-5 bg-gradient-to-r from-slate-50/90 via-white to-slate-50/50 hover:from-slate-100/90 hover:to-slate-100/60 border-b border-slate-200 cursor-pointer transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 select-none"
                                        >
                                            <div className="flex items-center gap-3.5 flex-1">
                                                <div className="text-slate-400 transition-transform duration-200">
                                                    {isClientExpanded ? <ChevronDown size={20} className="text-slate-700" /> : <ChevronRight size={20} />}
                                                </div>

                                                <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow-xs">
                                                    <Building2 size={18} />
                                                </div>

                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="text-base font-black text-slate-900 tracking-tight uppercase">
                                                            {clientName}
                                                        </h3>
                                                        <Badge className="bg-slate-900 text-white text-[10px] font-black border-none px-2 h-5 rounded-md">
                                                            {clientGroup.tripsCount} {clientGroup.tripsCount === 1 ? 'Trip' : 'Trips'} Total
                                                        </Badge>
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                                                        {isClientExpanded ? "Click to collapse client convoy details" : "Click to expand convoy batches and vehicle allocations"}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Client Totals Strip */}
                                            <div className="flex items-center gap-4 sm:gap-6 flex-wrap sm:flex-nowrap pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-200">
                                                <div className="space-y-0.5">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Contracted Revenue</span>
                                                    <div className="text-sm font-black text-orange-600 leading-none">
                                                        {formatTSh(clientGroup.totals.revenueTZS)}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-400 block">
                                                        ${clientGroup.totals.revenueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>

                                                <div className="space-y-0.5 pl-4 border-l border-slate-200">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Expenses</span>
                                                    <div className="text-sm font-black text-rose-600 leading-none">
                                                        {formatTSh(clientGroup.totals.expensesTZS)}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-400 block">
                                                        ${clientGroup.totals.expensesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>

                                                <div className="space-y-0.5 pl-4 border-l border-slate-200">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Expected Surplus</span>
                                                    <div className={cn("text-sm font-black leading-none", clientGroup.totals.profitTZS >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                                        {formatTSh(clientGroup.totals.profitTZS)}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-400 block">
                                                        ${clientGroup.totals.profitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Subgroups & Trip Cards */}
                                        {isClientExpanded && (
                                            <div className="p-4 sm:p-5 bg-slate-50/40 space-y-5">
                                                {Object.entries(clientGroup.subGroups).map(([subKey, subGroup]: [string, any]) => {
                                                    const subGroupKey = `${clientName}_${subKey}`;
                                                    const isSubExpanded = expandedGroups.includes(subGroupKey);

                                                    return (
                                                        <div key={subGroupKey} className="border border-slate-200/90 rounded-2xl bg-white overflow-hidden shadow-xs">
                                                            {/* Sub-Group Header (Convoy / Invoice) */}
                                                            <div
                                                                onClick={() => toggleGroup(subGroupKey)}
                                                                className="p-3 sm:p-3.5 bg-slate-100/70 hover:bg-slate-100 border-b border-slate-200/80 cursor-pointer transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3 select-none"
                                                            >
                                                                <div className="flex items-center gap-3 flex-wrap">
                                                                    <div className="text-slate-400 transition-transform duration-200">
                                                                        {isSubExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                                                    </div>
                                                                    <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200/60 shadow-xs">
                                                                        <CreditCard size={13} />
                                                                    </div>
                                                                    <span className="text-xs font-black text-slate-800 tracking-tight">
                                                                        {subGroup.name}
                                                                    </span>

                                                                    {/* Destinations Tags */}
                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                        {(subGroup.destinations.length > 0 ? subGroup.destinations : ['Route Unassigned']).map((dest: string, idx: number) => (
                                                                            <span
                                                                                key={idx}
                                                                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded-md text-[9px] font-bold uppercase tracking-wider shadow-xs"
                                                                            >
                                                                                <RouteIcon size={9} className="text-indigo-500" />
                                                                                {dest}
                                                                            </span>
                                                                        ))}
                                                                    </div>

                                                                    <Badge variant="outline" className="text-[9px] h-5 font-bold bg-white text-slate-600 px-2 border-slate-200">
                                                                        {subGroup.trips.length} {subGroup.trips.length === 1 ? 'Asset' : 'Assets'}
                                                                    </Badge>

                                                                    {(isSuperAdmin || isAdmin) && (
                                                                        <Button
                                                                            variant="outline"
                                                                            size="sm"
                                                                            className="h-6 px-2.5 text-[9px] font-black border-indigo-200 text-indigo-700 bg-indigo-50/60 hover:bg-indigo-600 hover:text-white rounded-md flex items-center gap-1 transition-all"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setBatchDialog({ open: true, groupKey: subGroupKey, trips: subGroup.trips });
                                                                                setBatchData({ invoice_no: '', payment_status: 'Pending' });
                                                                                setSelectedBatchTrips(subGroup.trips.map((t: any) => t.id));
                                                                            }}
                                                                        >
                                                                            <CreditCard size={9} />
                                                                            Batch Invoice
                                                                        </Button>
                                                                    )}
                                                                </div>

                                                                {/* Subgroup Financials */}
                                                                <div className="flex items-center gap-4 text-right ml-auto md:ml-0">
                                                                    <div>
                                                                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Revenue</span>
                                                                        <span className="text-xs font-black text-orange-600">{formatTSh(subGroup.totals.revenueTZS)}</span>
                                                                    </div>
                                                                    <div className="pl-3 border-l border-slate-200">
                                                                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Expenses</span>
                                                                        <span className="text-xs font-black text-rose-600">{formatTSh(subGroup.totals.expensesTZS)}</span>
                                                                    </div>
                                                                    <div className="pl-3 border-l border-slate-200">
                                                                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Surplus</span>
                                                                        <span className={cn("text-xs font-black", subGroup.totals.profitTZS >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                                                            {formatTSh(subGroup.totals.profitTZS)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Trip Cards Inside Subgroup */}
                                                            {isSubExpanded && (
                                                                <div className="p-3.5 space-y-3 bg-slate-50/30">
                                                                    {subGroup.trips.map((trip: any, tIndex: number) => {
                                                                        const rate = trip.exchange_rate || 2700;
                                                                        const revTSh = trip.revenue_currency === 'TZS' ? trip.revenue_amount : trip.revenue_amount * rate;
                                                                        const expTSh = trip.total_expenses_tzs || 0;
                                                                        const netTSh = revTSh - expTSh;
                                                                        const isProfit = netTSh >= 0;
                                                                        const revUSD = trip.revenue_currency === 'USD' ? (parseFloat(trip.revenue_amount) || 0) : (parseFloat(trip.revenue_amount) || 0) / rate;
                                                                        const expUSD = parseFloat(trip.total_expenses_usd) || 0;
                                                                        const netUSD = revUSD - expUSD;
                                                                        const marginPct = revUSD > 0 ? Math.round((netUSD / revUSD) * 100) : 0;

                                                                        return (
                                                                            <div
                                                                                key={trip.id}
                                                                                className="relative group/card bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-5 overflow-hidden"
                                                                            >
                                                                                {/* Status Indicator Bar */}
                                                                                <div
                                                                                    className={cn(
                                                                                        "absolute left-0 top-0 bottom-0 w-1.5",
                                                                                        trip.status === 'Planned' ? 'bg-amber-400' :
                                                                                        trip.status === 'Pending_Approval' ? 'bg-purple-500' :
                                                                                        trip.status === 'Approved' ? 'bg-blue-500' :
                                                                                        trip.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'
                                                                                    )}
                                                                                />

                                                                                {/* 1. Vehicle & Identity */}
                                                                                <div className="flex items-start gap-3.5 flex-1 min-w-[280px]">
                                                                                    <div className="text-[10px] font-black text-slate-300 tabular-nums mt-1">
                                                                                        {(tIndex + 1).toString().padStart(2, '0')}
                                                                                    </div>
                                                                                    <div className="space-y-1.5">
                                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                                            <span className="font-black text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
                                                                                                <Truck size={14} className="text-indigo-600" />
                                                                                                {trip.vehicle?.vehicle_no || "PENDING HORSE"}
                                                                                            </span>
                                                                                            {trip.trailer_id && trip.trailer_id !== 'none' && (
                                                                                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                                                                                    / {trip.trailer?.vehicle_no || trip.trailer_reg || 'TRAILER'}
                                                                                                </span>
                                                                                            )}
                                                                                            {getStatusBadge(trip.status)}
                                                                                            <Badge
                                                                                                variant="outline"
                                                                                                className={cn(
                                                                                                    "text-[9px] font-bold tracking-tight uppercase px-1.5 py-0 h-4 rounded border-dashed",
                                                                                                    trip.journey_type === 'Go & Return' ? 'border-indigo-200 text-indigo-700 bg-indigo-50/50' : 'border-orange-200 text-orange-700 bg-orange-50/50'
                                                                                                )}
                                                                                            >
                                                                                                {trip.journey_type || 'G&R'}
                                                                                            </Badge>
                                                                                        </div>

                                                                                        <div className="flex flex-wrap items-center gap-2.5 text-xs">
                                                                                            {/* Driver */}
                                                                                            <div className="flex items-center gap-1 text-[11px] text-slate-600 font-bold">
                                                                                                <User size={11} className="text-slate-400" />
                                                                                                <span>{trip.driver?.full_name || "AWAITING DRIVER"}</span>
                                                                                            </div>

                                                                                            <span className="text-slate-300">•</span>

                                                                                            {/* Reference with copy & edit */}
                                                                                            <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                                                                                                <span>Ref: {trip.reference_number || 'N/A'}</span>
                                                                                                {trip.reference_number && (
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        title="Copy Reference"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            copyToClipboard(trip.reference_number, "Trip Reference");
                                                                                                        }}
                                                                                                        className="text-slate-400 hover:text-indigo-600 p-0.5 rounded transition-colors ml-0.5"
                                                                                                    >
                                                                                                        {copiedRef === trip.reference_number ? (
                                                                                                            <Check size={10} className="text-emerald-600" />
                                                                                                        ) : (
                                                                                                            <Copy size={10} />
                                                                                                        )}
                                                                                                    </button>
                                                                                                )}
                                                                                                {isAdmin && (
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        title="Switch / Edit Reference Number"
                                                                                                        className="text-slate-400 hover:text-indigo-600 p-0.5 rounded transition-colors ml-0.5"
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            setEditRefDialog({
                                                                                                                open: true,
                                                                                                                trip,
                                                                                                                newRef: trip.reference_number || ''
                                                                                                            });
                                                                                                        }}
                                                                                                    >
                                                                                                        <Edit2 size={10} />
                                                                                                    </button>
                                                                                                )}
                                                                                            </div>

                                                                                            <span className="text-slate-300">•</span>

                                                                                            {/* Date */}
                                                                                            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                                                                                                <Calendar size={10} />
                                                                                                <span>{trip.created_at ? new Date(trip.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                                                                                            </div>

                                                                                            {/* Invoicing info */}
                                                                                            {trip.invoice_no && (
                                                                                                <>
                                                                                                    <span className="text-slate-300">•</span>
                                                                                                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-[9px] font-bold text-indigo-700">
                                                                                                        <CreditCard size={10} className="text-indigo-500" />
                                                                                                        INV: {trip.invoice_no}
                                                                                                    </div>
                                                                                                    <Badge
                                                                                                        variant="outline"
                                                                                                        className={cn(
                                                                                                            "text-[8px] h-4 px-1.5 border-none font-black uppercase tracking-widest",
                                                                                                            trip.payment_status === 'Paid' ? "bg-emerald-50 text-emerald-700" :
                                                                                                            trip.payment_status === 'Partial' ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                                                                                                        )}
                                                                                                    >
                                                                                                        {trip.payment_status || 'Unpaid'}
                                                                                                    </Badge>
                                                                                                </>
                                                                                            )}
                                                                                        </div>

                                                                                        {/* Route & Cargo */}
                                                                                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                                                                                            <div className="inline-flex items-center gap-1 text-xs font-black text-slate-800">
                                                                                                <RouteIcon size={12} className="text-indigo-500" />
                                                                                                <span>{trip.origin || 'DAR ES SALAAM'}</span>
                                                                                                <ArrowRight size={10} className="text-slate-400" />
                                                                                                <span className="text-indigo-600">{trip.destination || 'DESTINATION'}</span>
                                                                                            </div>
                                                                                            {trip.cargo_outbound && (
                                                                                                <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                                                                                    Cargo: {trip.cargo_outbound}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>

                                                                                {/* 2. Financials Breakdown */}
                                                                                <div className="flex items-center justify-between xl:justify-end gap-6 border-t xl:border-t-0 xl:border-l border-slate-100 pt-3 xl:pt-0 xl:pl-6 w-full xl:w-auto">
                                                                                    <div className="space-y-0.5">
                                                                                        <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Revenue</span>
                                                                                        <div className="font-black text-orange-600 text-xs leading-none">{formatTSh(revTSh)}</div>
                                                                                        <span className="text-[10px] text-slate-400 font-bold block">${revUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                                    </div>

                                                                                    <div className="space-y-0.5 pl-4 border-l border-slate-100">
                                                                                        <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Expenses</span>
                                                                                        <div className="font-black text-rose-600 text-xs leading-none">{formatTSh(expTSh)}</div>
                                                                                        <span className="text-[10px] text-slate-400 font-bold block">${expUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                                    </div>

                                                                                    <div className="space-y-0.5 pl-4 border-l border-slate-100 text-right">
                                                                                        <div className="flex items-center justify-end gap-1.5">
                                                                                            <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Surplus</span>
                                                                                            {revUSD > 0 && (
                                                                                                <span className={cn(
                                                                                                    "text-[9px] px-1.5 py-0.2 rounded font-black tracking-tight border",
                                                                                                    marginPct >= 20 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                                                                    marginPct > 0 ? "bg-amber-50 text-amber-700 border-amber-200" :
                                                                                                    "bg-rose-50 text-rose-700 border-rose-200"
                                                                                                )}>
                                                                                                    {marginPct}%
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                        <div className={cn("font-black text-xs leading-none", isProfit ? "text-emerald-600" : "text-rose-600")}>
                                                                                            {formatTSh(netTSh)}
                                                                                        </div>
                                                                                        <span className="text-[10px] text-slate-400 font-bold block">
                                                                                            ${netUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                                        </span>
                                                                                    </div>
                                                                                </div>

                                                                                {/* 3. Operational Action Buttons */}
                                                                                <div className="flex items-center gap-2 pl-0 xl:pl-4 border-t xl:border-t-0 xl:border-l border-slate-100 pt-3 xl:pt-0 w-full xl:w-auto flex-wrap sm:flex-nowrap justify-end">
                                                                                    {isAdmin && (trip.status === 'Planned' || trip.status === 'Pending_Approval') && (
                                                                                        <Button
                                                                                            variant="outline"
                                                                                            size="sm"
                                                                                            className="h-8 px-3 rounded-lg font-black text-[10px] uppercase tracking-wider bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white transition-all gap-1"
                                                                                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus(trip.id, 'Approved'); }}
                                                                                        >
                                                                                            <ShieldCheck size={12} />
                                                                                            Approve
                                                                                        </Button>
                                                                                    )}

                                                                                    {isAdmin && trip.status === 'Approved' && (
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <Button
                                                                                                variant="outline"
                                                                                                size="sm"
                                                                                                className="h-8 px-3 rounded-lg font-black text-[10px] uppercase tracking-wider bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all gap-1"
                                                                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(trip.id, 'Active'); }}
                                                                                            >
                                                                                                <Zap size={12} />
                                                                                                Activate Trip
                                                                                            </Button>
                                                                                            <Button
                                                                                                variant="ghost"
                                                                                                size="sm"
                                                                                                className="h-8 px-2.5 rounded-lg font-bold text-[10px] uppercase tracking-wider text-slate-500 hover:bg-slate-100"
                                                                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(trip.id, 'Planned'); }}
                                                                                            >
                                                                                                Revert
                                                                                            </Button>
                                                                                        </div>
                                                                                    )}

                                                                                    {trip.status === 'Active' && (
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <Button
                                                                                                variant="outline"
                                                                                                size="sm"
                                                                                                className="h-8 px-3 rounded-lg font-black text-[10px] uppercase tracking-wider bg-slate-900 border-slate-900 text-white hover:bg-slate-800 transition-all gap-1"
                                                                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(trip.id, 'Completed'); }}
                                                                                            >
                                                                                                <CheckCircle2 size={12} />
                                                                                                Close Trip
                                                                                            </Button>
                                                                                        </div>
                                                                                    )}

                                                                                    <Button
                                                                                        size="sm"
                                                                                        className="h-8 px-3.5 rounded-lg font-black text-[10px] uppercase tracking-wider bg-slate-900 text-white hover:bg-indigo-600 shadow-xs transition-all gap-1.5"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setDuplicateSourceTrip(null);
                                                                                            setSelectedTrip(trip);
                                                                                            setIsSheetOpen(true);
                                                                                        }}
                                                                                    >
                                                                                        <Eye size={12} />
                                                                                        Manage Sheet
                                                                                    </Button>

                                                                                    {(isSuperAdmin || isAdmin) && (
                                                                                        <Button
                                                                                            variant="ghost"
                                                                                            size="sm"
                                                                                            title="Delete trip sheet"
                                                                                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                handleDeleteTrip(trip.id);
                                                                                            }}
                                                                                        >
                                                                                            <Trash2 size={12} />
                                                                                        </Button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ✏️ Switch / Edit Trip Reference Number Dialog */}
            <Dialog 
                open={editRefDialog.open} 
                onOpenChange={(open) => {
                    if (!isUpdatingRef) {
                        setEditRefDialog(prev => ({ ...prev, open }));
                    }
                }}
            >
                <DialogContent className="max-w-md bg-white border-none shadow-2xl rounded-2xl p-0 overflow-hidden">
                    <div className="bg-slate-900 p-5 text-white">
                        <DialogHeader>
                            <DialogTitle className="text-base font-bold flex items-center gap-2.5">
                                <div className="p-2 bg-indigo-600 rounded-lg">
                                    <Edit2 size={16} className="text-white" />
                                </div>
                                Switch Trip Reference Number
                            </DialogTitle>
                            <p className="text-slate-400 text-xs mt-1">
                                Vehicle: <span className="text-white font-bold">{editRefDialog.trip?.vehicle?.vehicle_no || editRefDialog.trip?.truck_reg || 'N/A'}</span>
                            </p>
                        </DialogHeader>
                    </div>

                    <div className="p-6 space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                Current Reference
                            </Label>
                            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs font-mono font-bold text-slate-700">
                                {editRefDialog.trip?.reference_number || "None"}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                New Reference Number
                            </Label>
                            <Input
                                autoFocus
                                placeholder="e.g. T 985/2025/T121"
                                value={editRefDialog.newRef}
                                onChange={(e) => setEditRefDialog(prev => ({ ...prev, newRef: e.target.value }))}
                                className="h-10 text-xs font-semibold"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleUpdateTripReference();
                                    }
                                }}
                            />
                            <p className="text-[11px] text-slate-400">
                                Enter the exact trip number from the approved order (e.g. <span className="font-mono font-semibold text-slate-600">T 985/2025/T121</span>). This links them and clears it from the Approved Orders tab.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={isUpdatingRef}
                            onClick={() => setEditRefDialog({ open: false, trip: null, newRef: '' })}
                            className="text-xs font-semibold"
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            disabled={isUpdatingRef || !editRefDialog.newRef.trim()}
                            onClick={handleUpdateTripReference}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md"
                        >
                            {isUpdatingRef ? "Updating..." : "Save Reference"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
        </div>
    );
};

export default TripSheets;
