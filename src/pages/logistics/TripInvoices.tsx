import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, CreditCard, Truck, RefreshCw, Pencil, Navigation, Plus, Calculator, CheckSquare, Square, Printer, DollarSign, Calendar, History, Receipt, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import LogisticsInvoicePreview from "@/components/logistics/LogisticsInvoicePreview";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { fetchCleanLogisticsTripSheets } from "@/lib/logisticsDataService";

export default function TripInvoices() {
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState("all");
    const [editingTrip, setEditingTrip] = useState<any>(null);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    
    // Payment Recording Modal State
    const [paymentModal, setPaymentModal] = useState<{
        open: boolean;
        invoice_no: string;
        client_name: string;
        currency: string;
        total_amount: number;
        amount_received: number;
        still_demanded: number;
        trips: any[];
    } | null>(null);
    const [paymentAmountInput, setPaymentAmountInput] = useState<string>("");
    const [paymentDateInput, setPaymentDateInput] = useState<string>(new Date().toISOString().split('T')[0]);
    const [paymentNotesInput, setPaymentNotesInput] = useState<string>("");
    
    // Create Invoice States
    const [newInvoiceData, setNewInvoiceData] = useState({
        invoice_no: "",
        invoice_date: new Date().toISOString().split('T')[0],
        revenue_currency: "TZS",
        default_revenue: "",
        payment_status: "Pending"
    });
    const [selectedTripGroup, setSelectedTripGroup] = useState<string | null>(null);
    const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
    const [vehicleRevenues, setVehicleRevenues] = useState<Record<string, string>>({});

    // Invoice Preview State
    const [previewInvoice, setPreviewInvoice] = useState<any>(null);

    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: tripSheets, isLoading } = useQuery({
        queryKey: ["logistics-invoices-sheets"],
        queryFn: async () => {
            return await fetchCleanLogisticsTripSheets();
        }
    });

    // Fetch Recorded Invoice Payments
    const { data: invoicePayments = [] } = useQuery({
        queryKey: ["logistics_invoice_payments_list"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_invoice_payments" as any)
                .select("*")
                .order("created_at", { ascending: false });
            if (error) return [];
            return data || [];
        }
    });

    const paymentMap = useMemo(() => {
        const map: Record<string, number> = {};
        invoicePayments.forEach((p: any) => {
            if (p.invoice_no) {
                map[p.invoice_no] = (map[p.invoice_no] || 0) + (parseFloat(p.amount_paid) || 0);
            }
        });
        return map;
    }, [invoicePayments]);

    const updateInvoiceMutation = useMutation({
        mutationFn: async (updates: any) => {
            const { id, ...data } = updates;
            const { error } = await supabase
                .from("logistics_trip_sheets" as any)
                .update(data)
                .eq("id", id);
            
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-invoices-sheets"] });
            queryClient.invalidateQueries({ queryKey: ["logistics_invoice_payments_list"] });
            queryClient.invalidateQueries({ queryKey: ["finance_overview_sheets"] });
            queryClient.invalidateQueries({ queryKey: ["finance_overview_payments"] });
            toast({ title: "Invoices Updated", description: "The invoice details and payment records have been saved successfully." });
            setEditingTrip(null);
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error Saving", description: error.message });
        }
    });

    const removeFromInvoiceMutation = useMutation({
        mutationFn: async ({ sheetId, isReturn }: { sheetId: string; isReturn?: boolean }) => {
            const updatePayload = isReturn 
                ? { return_invoice_no: null, return_invoice_date: null, return_payment_status: "Pending" }
                : { invoice_no: null, invoice_date: null, payment_status: "Pending" };
            const { error } = await supabase
                .from("logistics_trip_sheets" as any)
                .update(updatePayload)
                .eq("id", sheetId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-invoices-sheets"] });
            queryClient.invalidateQueries({ queryKey: ["finance_overview_sheets"] });
            toast({ title: "Removed from Invoice", description: "Trip has been moved back to Uninvoiced Vehicles." });
            setEditingTrip(null);
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error Removing", description: error.message });
        }
    });

    const deleteTripSheetMutation = useMutation({
        mutationFn: async ({ sheetId, referenceNumber }: { sheetId: string; referenceNumber?: string }) => {
            const { error: sheetErr } = await supabase
                .from("logistics_trip_sheets" as any)
                .delete()
                .eq("id", sheetId);
            if (sheetErr) throw sheetErr;

            if (referenceNumber) {
                await supabase
                    .from("logistics_trip_orders" as any)
                    .delete()
                    .eq("trip_number", referenceNumber);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-invoices-sheets"] });
            queryClient.invalidateQueries({ queryKey: ["finance_overview_sheets"] });
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_sheets_list"] });
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_orders"] });
            toast({ title: "Deleted", description: "Trip record has been permanently deleted from the database." });
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Delete Failed", description: error.message });
        }
    });


    const createGroupInvoiceMutation = useMutation({
        mutationFn: async () => {
            if (!selectedTripGroup) throw new Error("No trip group selected");
            if (!newInvoiceData.invoice_no) throw new Error("Invoice number is required");

            const sheetsInGroup = uninvoicedGroups[selectedTripGroup] || [];
            const selectedSheets = sheetsInGroup.filter((s: any) => selectedVehicles.includes(s.id));
            
            if (selectedSheets.length === 0) throw new Error("No vehicles selected for invoicing");

            // Prepare updates for all selected sheets
            const updates = selectedSheets.map((sheet: any) => {
                const assignedRevenue = vehicleRevenues[sheet.id];
                const fallbackRevenue = sheet.revenue_amount !== undefined && sheet.revenue_amount !== null && sheet.revenue_amount !== '' && String(sheet.revenue_amount) !== '0'
                    ? String(sheet.revenue_amount)
                    : (newInvoiceData.default_revenue || "0");
                return {
                    id: sheet.id,
                    invoice_no: newInvoiceData.invoice_no,
                    invoice_date: newInvoiceData.invoice_date,
                    payment_status: newInvoiceData.payment_status,
                    revenue_currency: newInvoiceData.revenue_currency || sheet.revenue_currency || "TZS",
                    revenue_amount: assignedRevenue !== undefined && assignedRevenue !== '' ? assignedRevenue : fallbackRevenue
                };
            });

            // Execute all updates
            for (const update of updates) {
                const { error } = await supabase
                    .from("logistics_trip_sheets" as any)
                    .update({
                        invoice_no: update.invoice_no,
                        invoice_date: update.invoice_date,
                        payment_status: update.payment_status,
                        revenue_currency: update.revenue_currency,
                        revenue_amount: update.revenue_amount
                    })
                    .eq("id", update.id);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics-invoices-sheets"] });
            toast({ title: "Invoice Created", description: "All vehicles have been assigned to the invoice." });
            setCreateModalOpen(false);
            resetCreateModal();
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Error Creating Invoice", description: error.message });
        }
    });

    const recordPaymentMutation = useMutation({
        mutationFn: async () => {
            if (!paymentModal || !paymentAmountInput) throw new Error("Payment amount is required");
            const amt = parseFloat(paymentAmountInput);
            if (isNaN(amt) || amt <= 0) throw new Error("Please enter a valid positive payment amount");

            // 1. Insert payment record into logistics_invoice_payments
            const { error: pError } = await supabase
                .from("logistics_invoice_payments" as any)
                .insert({
                    invoice_no: paymentModal.invoice_no,
                    amount_paid: amt,
                    payment_date: paymentDateInput || new Date().toISOString().split('T')[0],
                    notes: paymentNotesInput || "Customer payment received",
                    recorded_by: user?.id || null
                });

            if (pError) throw pError;

            // 2. Compute new total paid and new status
            const newTotalPaid = paymentModal.amount_received + amt;
            const newBalance = Math.max(0, paymentModal.total_amount - newTotalPaid);
            const newStatus = newBalance <= 0.01 ? "Paid" : "Partial";

            // 3. Update trip sheets associated with this invoice
            for (const trip of paymentModal.trips) {
                if (trip._leg === 'RETURN') {
                    await supabase
                        .from("logistics_trip_sheets" as any)
                        .update({ return_payment_status: newStatus })
                        .eq("id", trip.id);
                } else {
                    await supabase
                        .from("logistics_trip_sheets" as any)
                        .update({ payment_status: newStatus })
                        .eq("id", trip.id);
                }
            }

            return { newTotalPaid, newBalance, newStatus };
        },
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ["logistics-invoices-sheets"] });
            queryClient.invalidateQueries({ queryKey: ["logistics_invoice_payments_list"] });
            queryClient.invalidateQueries({ queryKey: ["finance-accounts-receivable"] });
            queryClient.invalidateQueries({ queryKey: ["finance_overview_sheets"] });
            queryClient.invalidateQueries({ queryKey: ["finance_overview_payments"] });

            toast({
                title: "Payment Recorded Successfully",
                description: res.newBalance <= 0.01
                    ? `Invoice ${paymentModal?.invoice_no} is now FULLY SETTLED.`
                    : `Partial payment recorded. Still Demanded: ${paymentModal?.currency} ${res.newBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            });
            setPaymentModal(null);
            setPaymentAmountInput("");
            setPaymentNotesInput("");
        },
        onError: (err: any) => {
            toast({ variant: "destructive", title: "Failed to Record Payment", description: err.message });
        }
    });

    const handleOpenRecordPayment = (group: any) => {
        const defaultRec = group.trips?.[0]?.amount_received !== undefined ? group.trips[0].amount_received : (group.payment_status === 'Paid' ? group.total_revenue : 0);
        const received = paymentMap[group.invoice_no] !== undefined ? paymentMap[group.invoice_no] : defaultRec;
        const demanded = Math.max(0, group.total_revenue - received);
        setPaymentModal({
            open: true,
            invoice_no: group.invoice_no,
            client_name: group.client_name || "Client",
            currency: group.currency,
            total_amount: group.total_revenue,
            amount_received: received,
            still_demanded: demanded,
            trips: group.trips
        });
        setPaymentAmountInput(demanded > 0 ? demanded.toString() : "");
        setPaymentDateInput(new Date().toISOString().split('T')[0]);
        setPaymentNotesInput("");
    };

    const handleSaveEdit = async () => {
        if (!editingTrip) return;

        // If user recorded a new payment amount in the modal, log it into logistics_invoice_payments
        if (editingTrip._new_payment_amt && parseFloat(editingTrip._new_payment_amt) > 0) {
            const pAmt = parseFloat(editingTrip._new_payment_amt);
            const targetInv = editingTrip.invoice_no;
            if (targetInv) {
                try {
                    await supabase
                        .from("logistics_invoice_payments" as any)
                        .insert({
                            invoice_no: targetInv,
                            amount_paid: pAmt,
                            payment_date: new Date().toISOString().split('T')[0],
                            notes: "Payment logged during invoice edit",
                            recorded_by: user?.id || null
                        });
                } catch (e) {
                    console.error("Error logging payment entry:", e);
                }
            }
        }

        updateInvoiceMutation.mutate({
            id: editingTrip.id,
            invoice_no: editingTrip.invoice_no,
            invoice_date: editingTrip.invoice_date,
            payment_status: editingTrip.payment_status,
            revenue_currency: editingTrip.revenue_currency,
            revenue_amount: editingTrip.revenue_amount,
            return_invoice_no: editingTrip.return_invoice_no,
            return_invoice_date: editingTrip.return_invoice_date || null,
            return_revenue_currency: editingTrip.return_revenue_currency,
            return_revenue_amount: parseFloat(editingTrip.return_revenue_amount) || null,
            return_payment_status: editingTrip.return_payment_status,
            return_client_name: editingTrip.return_client_name || null
        });
    };

    const resetCreateModal = () => {
        setNewInvoiceData({
            invoice_no: "",
            invoice_date: new Date().toISOString().split('T')[0],
            revenue_currency: "TZS",
            default_revenue: "",
            payment_status: "Pending"
        });
        setSelectedTripGroup(null);
        setSelectedVehicles([]);
        setVehicleRevenues({});
    };

    // Filter and group
    const filteredSheets = (tripSheets || []).filter((s: any) => {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm ||
            s.sheet_number?.toLowerCase().includes(searchLower) ||
            s.reference_number?.toLowerCase().includes(searchLower) ||
            s.client_name?.toLowerCase().includes(searchLower) ||
            s.vehicle?.vehicle_no?.toLowerCase().includes(searchLower) ||
            s.invoice_no?.toLowerCase().includes(searchLower) ||
            s.return_invoice_no?.toLowerCase().includes(searchLower);
        
        if (activeTab === "pending") return matchesSearch && (s.payment_status !== "Paid" || (s.journey_type?.includes("Go & Return") && s.return_payment_status !== "Paid"));
        if (activeTab === "paid") return matchesSearch && s.payment_status === "Paid" && (!s.journey_type?.includes("Go & Return") || s.return_payment_status === "Paid");
        return matchesSearch;
    });

    // Uninvoiced Trips specifically grouped for the Create Invoice modal — by CLIENT
    const uninvoicedGroups = useMemo(() => {
        const groups: Record<string, any[]> = {};
        (tripSheets || []).forEach((sheet: any) => {
            if (!sheet.invoice_no) { // Has no outbound invoice yet
                const clientName = sheet.client_name || 'Individual / Unspecified';
                if (!groups[clientName]) groups[clientName] = [];
                groups[clientName].push(sheet);
            }
        });
        return groups;
    }, [tripSheets]);

    // Apply default revenue to all selected vehicles when it changes
    const handleDefaultRevenueChange = (val: string) => {
        setNewInvoiceData({ ...newInvoiceData, default_revenue: val });
        if (selectedTripGroup) {
            const updatedRevs = { ...vehicleRevenues };
            uninvoicedGroups[selectedTripGroup].forEach((sheet: any) => {
                updatedRevs[sheet.id] = val;
            });
            setVehicleRevenues(updatedRevs);
        }
    };

    const calculateSheetExpensesTZS = (sheet: any) => {
        const rate = parseFloat(sheet.exchange_rate) || 2700;
        return sheet.expenses?.reduce((sum: number, exp: any) => {
            const amt = parseFloat(exp.amount) || 0;
            let inTZS = 0;
            if (exp.currency === 'USD') {
                inTZS = amt * rate;
            } else if (exp.currency === 'TZS' || exp.currency === 'TZ') {
                inTZS = amt;
            } else {
                const cRates = sheet.country_rates || {};
                if (exp.category === 'Zambia') inTZS = amt * (cRates["Zambia"] || 100);
                else if (exp.category === 'DRC') inTZS = amt * (cRates["DRC"] || 1.0);
                else if (exp.category === 'Rwanda') inTZS = amt * (cRates["Rwanda"] || 2);
                else if (exp.category === 'Burundi') inTZS = amt * (cRates["Burundi"] || 1);
                else inTZS = amt;
            }
            return sum + inTZS;
        }, 0) || 0;
    };

    // Grouping by Invoice
    const groupedByInvoice = filteredSheets.reduce((acc: any, sheet: any) => {
        // --- 1. Outbound Leg ---
        const clientName = sheet.client_name || 'Individual / Unspecified';
        const invNo = sheet.invoice_no || `UNASSIGNED_${clientName}`;
        if (!acc[invNo]) {
            acc[invNo] = {
                invoice_no: invNo,
                invoice_date: sheet.invoice_date,
                payment_status: sheet.payment_status,
                currency: sheet.revenue_currency || 'TZS',
                client_name: sheet.client_name || '',
                total_revenue: 0,
                total_expenses: 0,
                trips: []
            };
        }
        
        const hasReturn = sheet.journey_type?.includes('Go & Return');
        const outboundSheet = { ...sheet, _leg: hasReturn && sheet.return_client_name ? 'OUTBOUND' : 'FULL' };
        
        acc[invNo].trips.push(outboundSheet);
        acc[invNo].total_revenue += parseFloat(sheet.revenue_amount || 0);
        
        if (!acc[invNo].client_name && sheet.client_name) {
            acc[invNo].client_name = sheet.client_name;
        }

        const sheetExpenses = calculateSheetExpensesTZS(sheet);
        acc[invNo].total_expenses += sheetExpenses;

        // --- 2. Return Leg (if client changes) ---
        if (hasReturn && sheet.return_client_name) {
            const retClientName = sheet.return_client_name;
            const retInvNo = sheet.return_invoice_no || `UNASSIGNED_RET_${retClientName}_${sheet.id}`;
            
            if (!acc[retInvNo]) {
                acc[retInvNo] = {
                    invoice_no: sheet.return_invoice_no || `UNASSIGNED_${retClientName}`,
                    invoice_date: sheet.return_invoice_date,
                    payment_status: sheet.return_payment_status || 'Pending',
                    currency: sheet.return_revenue_currency || 'TZS',
                    client_name: retClientName,
                    total_revenue: 0,
                    total_expenses: 0,
                    trips: []
                };
            }
            
            const returnSheet = { ...sheet, _leg: 'RETURN' };
            acc[retInvNo].trips.push(returnSheet);
            acc[retInvNo].total_revenue += parseFloat(sheet.return_revenue_amount || 0);
            // Expenses are already accounted for in the outbound trip, so we can keep it 0 for the return leg
            // unless they want to split expenses, but currently expenses are per sheet.
        }

        return acc;
    }, {});

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <CreditCard className="w-6 h-6" />
                        </div>
                        Trip Invoices Management
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Generate invoices, apply per-vehicle billing, and track surplus.
                    </p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input 
                            placeholder="Search invoice, vehicle, sheet..." 
                            className="pl-9 h-10 bg-slate-50 border-slate-200"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button 
                        onClick={() => { resetCreateModal(); setCreateModalOpen(true); }}
                        className="bg-primary hover:bg-primary/90 text-white w-full sm:w-auto shadow-md font-bold"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Invoice
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="grouped" className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <TabsList className="bg-slate-100 p-1 border border-slate-200 h-auto">
                        <TabsTrigger value="grouped" className="py-2 text-xs font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">Grouped by Invoice</TabsTrigger>
                        <TabsTrigger value="list" className="py-2 text-xs font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">All Trip Sheets</TabsTrigger>
                    </TabsList>
                    
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1">
                        <Button variant={activeTab === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab("all")} className="h-8 text-xs font-bold">All</Button>
                        <Button variant={activeTab === "pending" ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab("pending")} className="h-8 text-xs font-bold text-amber-600">Pending</Button>
                        <Button variant={activeTab === "paid" ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab("paid")} className="h-8 text-xs font-bold text-emerald-600">Paid</Button>
                    </div>
                </div>

                <TabsContent value="grouped" className="mt-0">
                    <div className="space-y-6">
                        {isLoading ? (
                            <div className="p-8 text-center text-slate-500 w-full col-span-2">Loading invoices...</div>
                        ) : Object.keys(groupedByInvoice).length === 0 ? (
                            <div className="p-8 text-center text-slate-500 w-full border-2 border-dashed rounded-xl">No invoices match your search.</div>
                        ) : Object.values(groupedByInvoice).map((group: any) => (
                            <Card key={group.invoice_no} className="border-slate-200 overflow-hidden shadow-sm">
                                <CardHeader className="bg-slate-50 border-b border-slate-100 py-3 px-4 flex flex-row items-center justify-between space-y-0">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-white p-1.5 border rounded shadow-sm text-indigo-600">
                                            <CreditCard className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-sm font-black text-slate-800 flex items-center gap-2">
                                                {group.invoice_no.startsWith("UNASSIGNED") ? <span className="text-slate-400 italic">Uninvoiced Vehicles</span> : group.invoice_no}
                                                {!group.invoice_no.startsWith("UNASSIGNED") && group.invoice_date && (
                                                    <span className="text-[10px] font-medium text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                                                        {format(new Date(group.invoice_date), "MMM dd, yyyy")}
                                                    </span>
                                                )}
                                            </CardTitle>
                                            <CardDescription className="text-xs font-bold mt-0.5 flex items-center gap-2">
                                                {group.client_name && (
                                                    <span className="text-indigo-600 font-black">{group.client_name}</span>
                                                )}
                                                <span>{group.trips.length} {group.trips.length === 1 ? 'Vehicle' : 'Vehicles'}</span>
                                            </CardDescription>
                                        </div>
                                    </div>
                                    
                                    {!group.invoice_no.startsWith("UNASSIGNED") && (() => {
                                        const defaultRec = group.trips?.[0]?.amount_received !== undefined ? group.trips[0].amount_received : (group.payment_status === 'Paid' ? group.total_revenue : 0);
                                        const amountReceived = paymentMap[group.invoice_no] !== undefined ? paymentMap[group.invoice_no] : defaultRec;
                                        const stillDemanded = Math.max(0, group.total_revenue - amountReceived);
                                        const isFullyPaid = stillDemanded <= 0.01 && group.total_revenue > 0;
                                        const isPartial = amountReceived > 0 && stillDemanded > 0.01;

                                        return (
                                            <div className="flex items-center gap-3">
                                                <div className="hidden lg:flex items-center gap-3 text-xs">
                                                    <div className="text-right">
                                                        <p className="text-[9px] uppercase text-slate-400 font-bold mb-0.5">Total Revenue</p>
                                                        <p className="font-black text-slate-900">{group.currency} {group.total_revenue.toLocaleString()}</p>
                                                    </div>
                                                    <div className="text-right pl-3 border-l">
                                                        <p className="text-[9px] uppercase text-emerald-600 font-bold mb-0.5">Received</p>
                                                        <p className="font-bold text-emerald-700">{group.currency} {amountReceived.toLocaleString()}</p>
                                                    </div>
                                                    <div className="text-right pl-3 border-l">
                                                        <p className="text-[9px] uppercase text-amber-700 font-bold mb-0.5">Still Demanded</p>
                                                        <p className={`font-black ${stillDemanded > 0.01 ? 'text-amber-900' : 'text-emerald-700'}`}>
                                                            {stillDemanded > 0.01 ? `${group.currency} ${stillDemanded.toLocaleString()}` : 'Settled ✓'}
                                                        </p>
                                                    </div>
                                                    <div className="text-right pl-3 border-l">
                                                        <p className="text-[9px] uppercase text-slate-400 font-bold mb-0.5">Est. Surplus</p>
                                                        <p className="font-black text-emerald-600">
                                                            {group.currency === 'TZS' ? `TShs ${(group.total_revenue - group.total_expenses).toLocaleString()}` : 'Varies'}
                                                        </p>
                                                    </div>
                                                </div>

                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 text-xs font-bold gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                                    onClick={(e) => { e.stopPropagation(); setPreviewInvoice(group); }}
                                                >
                                                    <Printer className="w-3.5 h-3.5" /> Print
                                                </Button>

                                                {stillDemanded > 0.01 && (
                                                    <Button
                                                        size="sm"
                                                        className="h-8 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                                                        onClick={(e) => { e.stopPropagation(); handleOpenRecordPayment(group); }}
                                                    >
                                                        <DollarSign className="w-3.5 h-3.5" /> Enter Payment
                                                    </Button>
                                                )}

                                                <Badge className={cn("ml-1 text-[10px] font-bold whitespace-nowrap",
                                                    isFullyPaid ? "bg-emerald-500 hover:bg-emerald-600 text-white" : 
                                                    isPartial ? "bg-orange-500 hover:bg-orange-600 text-white" : 
                                                    "bg-slate-400 hover:bg-slate-500 text-white"
                                                )}>
                                                    {isFullyPaid ? "Paid" : isPartial ? "Partial Payment" : "Pending / Unpaid"}
                                                </Badge>
                                            </div>
                                        );
                                    })()}
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y divide-slate-100 bg-white">
                                        {group.trips.map((sheet: any) => {
                                            const exp = calculateSheetExpensesTZS(sheet);
                                            return (
                                                <div key={sheet.id} className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200 shrink-0">
                                                            <Truck className="w-5 h-5 text-slate-500" />
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                                                                <span>
                                                                    {sheet.vehicle?.vehicle_no}
                                                                    {(sheet.trailer?.vehicle_no || sheet.trailer?.trailer_number) && (
                                                                        <span className="text-slate-400 font-normal ml-1">
                                                                            / {sheet.trailer?.vehicle_no || sheet.trailer?.trailer_number}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                {sheet.reference_number && (
                                                                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                                                        {sheet.reference_number}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                                                                {sheet.sheet_number} • {sheet.origin} → {sheet.destination}
                                                            </div>
                                                            <div className="text-[10px] mt-1 flex flex-wrap items-center gap-2 text-slate-500">
                                                                <span>Exp: {exp > 0 ? `TShs ${exp.toLocaleString()}` : '-'}</span>
                                                                {sheet._leg === 'RETURN' ? (
                                                                    <span className="font-bold text-slate-700">Rev: {sheet.return_revenue_currency || 'TZS'} {Number(sheet.return_revenue_amount || 0).toLocaleString()}</span>
                                                                ) : (
                                                                    <span className="font-bold text-slate-700">Total Rev: {sheet.revenue_currency} {Number(sheet.revenue_amount || 0).toLocaleString()}</span>
                                                                )}
                                                                {parseFloat(sheet.return_amount_usd || '0') > 0 && sheet._leg !== 'RETURN' && (
                                                                    <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-semibold text-slate-600 border border-slate-200">
                                                                        <span>Go: ${parseFloat(sheet.go_amount_usd || '0').toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                                                                        <span className="text-slate-300">|</span>
                                                                        <span className="text-amber-700">Ret: ${parseFloat(sheet.return_amount_usd || '0').toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                                                        {sheet._leg === 'RETURN' ? (
                                                            <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50 text-[10px] whitespace-nowrap">
                                                                <RefreshCw className="w-3 h-3 mr-1" />
                                                                RETURN LEG
                                                            </Badge>
                                                        ) : sheet._leg === 'OUTBOUND' ? (
                                                            <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 text-[10px] whitespace-nowrap">
                                                                <Navigation className="w-3 h-3 mr-1" />
                                                                OUTBOUND LEG
                                                            </Badge>
                                                        ) : sheet.journey_type?.includes('Go & Return') && sheet.return_invoice_no ? (
                                                            <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50 text-[10px] whitespace-nowrap">
                                                                <RefreshCw className="w-3 h-3 mr-1" />
                                                                Return: {sheet.return_invoice_no}
                                                            </Badge>
                                                        ) : (parseFloat(sheet.return_amount_usd || '0') > 0) && (
                                                            <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50/70 text-[10px] whitespace-nowrap">
                                                                Return Uninvoiced ($3,300)
                                                            </Badge>
                                                        )}
                                                        <Button size="sm" variant="outline" className="h-8 text-xs font-bold" onClick={() => setEditingTrip({...sheet})}>
                                                            <Pencil className="w-3 h-3 mr-1" /> Edit
                                                        </Button>
                                                        {group.invoice_no.startsWith("UNASSIGNED") ? (
                                                            <Button 
                                                                size="sm" 
                                                                variant="ghost" 
                                                                className="h-8 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                title="Delete this record permanently from the database"
                                                                onClick={() => {
                                                                    if (confirm(`Delete ${sheet.reference_number || sheet.vehicle?.vehicle_no} permanently from the database?`)) {
                                                                        deleteTripSheetMutation.mutate({ 
                                                                            sheetId: sheet.id, 
                                                                            referenceNumber: sheet.reference_number 
                                                                        });
                                                                    }
                                                                }}
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                                                            </Button>
                                                        ) : (
                                                            <Button 
                                                                size="sm" 
                                                                variant="ghost" 
                                                                className="h-8 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                title="Remove from invoice back to Uninvoiced Vehicles"
                                                                onClick={() => {
                                                                    if (confirm(`Remove ${sheet.vehicle?.vehicle_no || sheet.reference_number} from invoice ${group.invoice_no}? It will be returned to Uninvoiced Vehicles.`)) {
                                                                        removeFromInvoiceMutation.mutate({ 
                                                                            sheetId: sheet.id, 
                                                                            isReturn: sheet._leg === 'RETURN' 
                                                                        });
                                                                    }
                                                                }}
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="list" className="mt-0">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {isLoading ? (
                            <div className="p-8 text-center text-slate-500 w-full col-span-2">Loading trip sheets...</div>
                        ) : filteredSheets.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 w-full col-span-2 border-2 border-dashed rounded-xl">No records found matching your filters.</div>
                        ) : (
                            filteredSheets.map((sheet: any) => (
                                <Card key={sheet.id} className="overflow-hidden hover:shadow-md transition-all border-slate-200">
                                    <div className="flex flex-col sm:flex-row">
                                        <div className="p-4 bg-slate-50 sm:w-1/3 border-b sm:border-b-0 sm:border-r border-slate-200 flex flex-col justify-between">
                                            <div>
                                                <Badge variant="outline" className="mb-2 bg-white text-[10px] tracking-widest">{sheet.sheet_number}</Badge>
                                                <div className="flex items-center gap-2 font-bold text-slate-900 mt-1">
                                                    <Truck className="w-4 h-4 text-primary" />
                                                    <span>
                                                        {sheet.vehicle?.vehicle_no}
                                                        {(sheet.trailer?.vehicle_no || sheet.trailer?.trailer_number) && (
                                                            <span className="text-slate-400 font-normal ml-1">
                                                                / {sheet.trailer?.vehicle_no || sheet.trailer?.trailer_number}
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-slate-500 mt-2 font-medium flex items-center gap-1.5">
                                                    <Navigation className="w-3 h-3" />
                                                    {sheet.origin} → {sheet.destination}
                                                </div>
                                                <div className="mt-3">
                                                    <Badge className={cn("text-[10px] uppercase", 
                                                        sheet.journey_type?.includes('Go & Return') ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                                                    )}>
                                                        {sheet.journey_type}
                                                    </Badge>
                                                </div>
                                            </div>
                                            <div className="mt-4">
                                                <Button size="sm" variant="outline" className="w-full h-8 text-xs font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => setEditingTrip({...sheet})}>
                                                    <Pencil className="w-3 h-3 mr-2" />
                                                    Edit Invoices
                                                </Button>
                                            </div>
                                        </div>
                                        
                                        <div className="p-4 sm:w-2/3 space-y-4">
                                            {/* Outbound Invoice */}
                                            <div className="bg-white rounded-lg p-3 border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div>
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Outbound Invoice</div>
                                                    <div className="font-bold text-sm text-slate-800">{sheet.invoice_no || <span className="text-slate-400 font-normal italic text-xs">Unassigned</span>}</div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        {sheet.invoice_date && <span className="text-[10px] text-slate-500 font-medium">{format(new Date(sheet.invoice_date), "MMM dd, yyyy")}</span>}
                                                        {sheet.revenue_amount && <span className="text-xs font-black text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border">{sheet.revenue_currency} {Number(sheet.revenue_amount).toLocaleString()}</span>}
                                                    </div>
                                                </div>
                                                <Badge className={cn("shrink-0", 
                                                    sheet.payment_status === 'Paid' ? "bg-emerald-500" : 
                                                    sheet.payment_status === 'Partial' ? "bg-amber-500" : "bg-slate-400"
                                                )}>
                                                    {sheet.payment_status || "Pending"}
                                                </Badge>
                                            </div>

                                            {/* Return Invoice (If applicable) */}
                                            {sheet.journey_type?.includes('Go & Return') && (
                                                <div className="bg-indigo-50/50 rounded-lg p-3 border border-indigo-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                                                    <div className="pl-2">
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-1 flex items-center gap-1">
                                                            <RefreshCw className="w-3 h-3" />
                                                            Return Invoice {sheet.return_client_name ? `(${sheet.return_client_name})` : ''}
                                                        </div>
                                                        <div className="font-bold text-sm text-slate-800">{sheet.return_invoice_no || <span className="text-slate-400 font-normal italic text-xs">Unassigned</span>}</div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            {sheet.return_invoice_date && <span className="text-[10px] text-slate-500 font-medium">{format(new Date(sheet.return_invoice_date), "MMM dd, yyyy")}</span>}
                                                            {sheet.return_revenue_amount && <span className="text-xs font-black text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">{sheet.return_revenue_currency} {Number(sheet.return_revenue_amount).toLocaleString()}</span>}
                                                        </div>
                                                    </div>
                                                    <Badge className={cn("shrink-0", 
                                                        sheet.return_payment_status === 'Paid' ? "bg-emerald-500" : 
                                                        sheet.return_payment_status === 'Partial' ? "bg-amber-500" : "bg-slate-400"
                                                    )}>
                                                        {sheet.return_payment_status || "Pending"}
                                                    </Badge>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* CREATE INVOICE MODAL */}
            <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
                <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden bg-slate-50">
                    <DialogHeader className="p-6 bg-white border-b border-slate-100">
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Plus className="text-primary w-5 h-5" />
                            Create New Invoice
                        </DialogTitle>
                        <DialogDescription>
                            Enter invoice details and attach uninvoiced vehicles by trip group.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                        {/* INVOICE DETAILS */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <div className="space-y-1.5 col-span-2 md:col-span-1">
                                <Label className="text-[10px] font-bold text-slate-500 uppercase">Invoice Number *</Label>
                                <Input 
                                    placeholder="e.g. INV-2026-001" 
                                    value={newInvoiceData.invoice_no} 
                                    onChange={e => setNewInvoiceData({...newInvoiceData, invoice_no: e.target.value})}
                                    className="h-9 text-sm font-semibold border-primary/20 focus-visible:ring-primary"
                                />
                            </div>
                            <div className="space-y-1.5 col-span-2 md:col-span-1">
                                <Label className="text-[10px] font-bold text-slate-500 uppercase">Invoice Date</Label>
                                <Input 
                                    type="date" 
                                    value={newInvoiceData.invoice_date} 
                                    onChange={e => setNewInvoiceData({...newInvoiceData, invoice_date: e.target.value})}
                                    className="h-9 text-sm"
                                />
                            </div>
                            <div className="space-y-1.5 col-span-2">
                                <Label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                    <Calculator className="w-3 h-3" /> Default Revenue Per Vehicle
                                </Label>
                                <div className="flex relative">
                                    <select
                                        className="absolute left-0 top-0 h-full w-16 bg-slate-100 border-none text-xs font-bold text-slate-600 focus:ring-0 cursor-pointer px-2 rounded-l-md border-r"
                                        value={newInvoiceData.revenue_currency}
                                        onChange={e => setNewInvoiceData({...newInvoiceData, revenue_currency: e.target.value})}
                                    >
                                        <option value="TZS">TZS</option>
                                        <option value="USD">USD</option>
                                    </select>
                                    <Input 
                                        type="number"
                                        placeholder="0" 
                                        value={newInvoiceData.default_revenue} 
                                        onChange={e => handleDefaultRevenueChange(e.target.value)}
                                        className="h-9 pl-20 text-sm font-bold"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* TRIP SELECTION */}
                        <div className="space-y-3">
                            <Label className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                Select Client Group to Invoice
                            </Label>
                            
                            {Object.keys(uninvoicedGroups).length === 0 ? (
                                <div className="bg-slate-100 p-8 rounded-xl text-center text-slate-500 text-sm border-2 border-dashed">
                                    No uninvoiced vehicles available. All vehicles have an assigned invoice number!
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {Object.entries(uninvoicedGroups).map(([groupName, sheets]) => {
                                        const isSelected = selectedTripGroup === groupName;
                                        return (
                                            <Card 
                                                key={groupName} 
                                                className={cn(
                                                    "border-2 transition-all overflow-hidden", 
                                                    isSelected ? "border-primary shadow-md" : "border-slate-200 hover:border-primary/50 cursor-pointer"
                                                )}
                                                onClick={() => {
                                                    if (!isSelected) {
                                                        setSelectedTripGroup(groupName);
                                                        // Initialize revenues for this group using existing revenue if available
                                                        const updatedRevs = { ...vehicleRevenues };
                                                        const allIds: string[] = [];
                                                        sheets.forEach((s: any) => {
                                                            const existingRevenue = s.revenue_amount !== undefined && s.revenue_amount !== null && s.revenue_amount !== '' && String(s.revenue_amount) !== '0'
                                                                ? String(s.revenue_amount)
                                                                : newInvoiceData.default_revenue;
                                                            updatedRevs[s.id] = existingRevenue;
                                                            allIds.push(s.id);
                                                        });
                                                        setVehicleRevenues(updatedRevs);
                                                        setSelectedVehicles(allIds);
                                                    }
                                                }}
                                            >
                                                <div className={cn("p-4 flex items-center justify-between", isSelected ? "bg-primary/5" : "bg-white")}>
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn("w-5 h-5 rounded flex items-center justify-center", isSelected ? "bg-primary text-white" : "bg-slate-100 text-slate-400")}>
                                                            {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-slate-900">{groupName}</div>
                                                            <div className="text-xs text-slate-500 font-medium">{sheets.length} Vehicles to invoice</div>
                                                        </div>
                                                    </div>
                                                    {isSelected && <Badge className="bg-primary hover:bg-primary">Selected</Badge>}
                                                </div>

                                                {/* Expandable Per-Vehicle Table */}
                                                {isSelected && (
                                                    <div className="border-t border-slate-200 bg-white p-4">
                                                        <p className="text-[10px] uppercase font-bold text-slate-400 mb-3 tracking-widest">Adjust Revenue Per Vehicle</p>
                                                        <div className="space-y-2">
                                                            {sheets.map((sheet: any) => (
                                                                <div key={sheet.id} className="flex items-center justify-between gap-4 p-2 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-100">
                                                                    <div className="flex items-center gap-3">
                                                                        <div 
                                                                            className={cn("w-5 h-5 rounded flex items-center justify-center cursor-pointer transition-colors border", selectedVehicles.includes(sheet.id) ? "bg-primary border-primary text-white" : "bg-white border-slate-300 text-transparent hover:border-primary")}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if (selectedVehicles.includes(sheet.id)) {
                                                                                    setSelectedVehicles(selectedVehicles.filter(id => id !== sheet.id));
                                                                                } else {
                                                                                    setSelectedVehicles([...selectedVehicles, sheet.id]);
                                                                                }
                                                                            }}
                                                                        >
                                                                            <CheckSquare className="w-4 h-4" />
                                                                        </div>
                                                                        <Truck className="w-4 h-4 text-slate-400 ml-1" />
                                                                        <div>
                                                                            <span className="font-bold text-sm text-slate-700">{sheet.vehicle?.vehicle_no}</span>
                                                                            <span className="text-[10px] text-slate-400 ml-2">{sheet.origin} → {sheet.destination}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs font-bold text-slate-500">{newInvoiceData.revenue_currency}</span>
                                                                        <Input 
                                                                            type="number"
                                                                            placeholder="0"
                                                                            value={vehicleRevenues[sheet.id] || ''}
                                                                            onChange={(e) => setVehicleRevenues({...vehicleRevenues, [sheet.id]: e.target.value})}
                                                                            className="w-32 h-8 text-sm font-bold text-right"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </Card>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <DialogFooter className="p-4 bg-white border-t border-slate-100 sm:justify-between">
                        <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
                        <Button 
                            onClick={() => createGroupInvoiceMutation.mutate()} 
                            disabled={!selectedTripGroup || selectedVehicles.length === 0 || !newInvoiceData.invoice_no || createGroupInvoiceMutation.isPending}
                            className="bg-primary hover:bg-primary/90 shadow-md"
                        >
                            {createGroupInvoiceMutation.isPending ? "Creating Invoice..." : `Attach ${selectedVehicles.length} Vehicle(s)`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* EDIT INVOICE MODAL (For existing individually) */}
            <Dialog open={!!editingTrip} onOpenChange={(open) => !open && setEditingTrip(null)}>
                <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden">
                    <DialogHeader className="p-6 bg-slate-50 border-b border-slate-100">
                        <DialogTitle className="flex items-center gap-2">
                            <CreditCard className="text-primary w-5 h-5" />
                            Edit Trip Invoices
                        </DialogTitle>
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mt-2">
                            <Badge variant="secondary" className="font-bold">{editingTrip?.vehicle?.vehicle_no}</Badge>
                            <span>{editingTrip?.sheet_number}</span>
                        </div>
                    </DialogHeader>
                    
                    {editingTrip && (
                        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                            <div className="space-y-4">
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 border-b pb-2">Outbound Invoice Details</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Invoice Number</Label>
                                        <Input 
                                            placeholder="INV-..." 
                                            value={editingTrip.invoice_no || ''} 
                                            onChange={e => setEditingTrip({...editingTrip, invoice_no: e.target.value})}
                                            className="h-10 text-sm font-semibold"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Invoice Date</Label>
                                        <Input 
                                            type="date" 
                                            value={editingTrip.invoice_date ? new Date(editingTrip.invoice_date).toISOString().split('T')[0] : ''} 
                                            onChange={e => setEditingTrip({...editingTrip, invoice_date: e.target.value})}
                                            className="h-10 text-sm"
                                        />
                                    </div>
                                    {/* Order Leg Breakdown Banner */}
                                    {parseFloat(editingTrip.return_amount_usd || '0') > 0 && (
                                        <div className="col-span-2 p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl space-y-1.5">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                                                    <span>📦 Trip Order Contract:</span>
                                                    <span className="font-black">${(parseFloat(editingTrip.revenue_amount) || 0).toLocaleString()} USD Total</span>
                                                </span>
                                                <Badge variant="outline" className="text-[10px] bg-white border-indigo-300 text-indigo-700 font-bold">
                                                    Outbound Invoicing Active
                                                </Badge>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                                                <div className="p-2 bg-white rounded-lg border border-indigo-100 flex items-center justify-between">
                                                    <div>
                                                        <p className="text-[9px] font-bold uppercase text-slate-400">Going Fee (This Invoice)</p>
                                                        <p className="font-black text-slate-900">${parseFloat(editingTrip.go_amount_usd || '0').toLocaleString()}</p>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-6 px-2 text-[10px] font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
                                                        onClick={() => {
                                                            const goVal = (parseFloat(editingTrip.go_amount_usd) || 0).toString();
                                                            setEditingTrip({
                                                                ...editingTrip,
                                                                amount_received: goVal,
                                                                _new_payment_amt: goVal,
                                                                payment_status: 'Paid'
                                                            });
                                                        }}
                                                    >
                                                        Pay Full Go Fee
                                                    </Button>
                                                </div>
                                                <div className="p-2 bg-white rounded-lg border border-indigo-100 flex items-center justify-between">
                                                    <div>
                                                        <p className="text-[9px] font-bold uppercase text-slate-400">Return Fee (Future Leg)</p>
                                                        <p className="font-black text-amber-700">${parseFloat(editingTrip.return_amount_usd || '0').toLocaleString()}</p>
                                                    </div>
                                                    <span className="text-[9px] font-semibold text-slate-400 italic">Billed on Offload</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase">
                                            {parseFloat(editingTrip.return_amount_usd || '0') > 0 ? "Total Contract Revenue" : "Revenue"}
                                        </Label>
                                        <div className="flex relative">
                                            <select
                                                className="absolute left-0 top-0 h-full w-16 bg-transparent border-none text-xs font-bold text-slate-600 focus:ring-0 cursor-pointer px-2"
                                                value={editingTrip.revenue_currency || 'TZS'}
                                                onChange={e => setEditingTrip({...editingTrip, revenue_currency: e.target.value})}
                                            >
                                                <option value="TZS">TZS</option>
                                                <option value="USD">USD</option>
                                            </select>
                                            <Input 
                                                type="number"
                                                placeholder="0" 
                                                value={editingTrip.revenue_amount || ''} 
                                                onChange={e => setEditingTrip({...editingTrip, revenue_amount: e.target.value})}
                                                className="h-10 pl-16 text-sm font-bold border-slate-200"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-[10px] font-bold text-emerald-700 uppercase">Amount Received</Label>
                                            {parseFloat(editingTrip.go_amount_usd || '0') > 0 && (
                                                <button
                                                    type="button"
                                                    className="text-[9px] font-bold text-indigo-600 hover:underline"
                                                    onClick={() => {
                                                        const goVal = (parseFloat(editingTrip.go_amount_usd) || 0).toString();
                                                        setEditingTrip({
                                                            ...editingTrip,
                                                            amount_received: goVal,
                                                            _new_payment_amt: goVal,
                                                            payment_status: 'Paid'
                                                        });
                                                    }}
                                                >
                                                    Fill Go: ${parseFloat(editingTrip.go_amount_usd || '0').toLocaleString()}
                                                </button>
                                            )}
                                        </div>
                                        <Input 
                                            type="number"
                                            step="any"
                                            placeholder="0.00" 
                                            value={editingTrip.amount_received ?? (editingTrip.payment_status === 'Paid' ? (editingTrip.go_amount_usd || editingTrip.revenue_amount || '') : '')} 
                                            onChange={e => {
                                                const recVal = parseFloat(e.target.value) || 0;
                                                const targetVal = parseFloat(editingTrip.go_amount_usd || editingTrip.revenue_amount) || 0;
                                                const newStatus = recVal >= targetVal && targetVal > 0 ? 'Paid' : recVal > 0 ? 'Partial' : 'Pending';
                                                setEditingTrip({
                                                    ...editingTrip,
                                                    amount_received: e.target.value,
                                                    _new_payment_amt: e.target.value,
                                                    payment_status: newStatus
                                                });
                                            }}
                                            className="h-10 text-sm font-bold text-emerald-700 bg-emerald-50/30 border-emerald-200"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Payment Status</Label>
                                        <Select 
                                            value={editingTrip.payment_status || "Pending"} 
                                            onValueChange={(val) => {
                                                const targetRev = parseFloat(editingTrip.go_amount_usd || editingTrip.revenue_amount) || 0;
                                                const autoRec = val === 'Paid' ? targetRev.toString() : val === 'Pending' ? '0' : editingTrip.amount_received;
                                                setEditingTrip({
                                                    ...editingTrip, 
                                                    payment_status: val, 
                                                    amount_received: autoRec, 
                                                    _new_payment_amt: val === 'Paid' ? targetRev.toString() : editingTrip._new_payment_amt
                                                });
                                            }}
                                        >
                                            <SelectTrigger className="h-10">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Pending">Pending / Unpaid</SelectItem>
                                                <SelectItem value="Partial">Partial Payment</SelectItem>
                                                <SelectItem value="Paid">Fully Paid (Going Fee Settled)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Outbound Still Demanded Live Callout */}
                                    {(() => {
                                        // If this trip has an outbound Go Fee, calculate demanded against the Go Fee for this invoice
                                        const targetRev = parseFloat(editingTrip.go_amount_usd || editingTrip.revenue_amount) || 0;
                                        const rec = parseFloat(editingTrip.amount_received ?? (editingTrip.payment_status === 'Paid' ? targetRev : 0)) || 0;
                                        const demanded = Math.max(0, targetRev - rec);
                                        const hasRetLeg = parseFloat(editingTrip.return_amount_usd || '0') > 0;

                                        return (
                                            <div className="col-span-2 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-slate-500 font-bold uppercase text-[10px]">
                                                            {hasRetLeg ? "Outbound Still Demanded:" : "Still Demanded:"}
                                                        </span>
                                                        <span className={`text-sm font-black ${demanded > 0.01 ? 'text-amber-900' : 'text-emerald-700'}`}>
                                                            {editingTrip.revenue_currency || 'TZS'} {demanded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                    {hasRetLeg && (
                                                        <span className="text-[10px] text-slate-400 font-medium">
                                                            (Calculated on Going Fee: ${targetRev.toLocaleString()} USD • Return Leg billed separately)
                                                        </span>
                                                    )}
                                                </div>
                                                <Badge className={cn("text-[10px] font-bold",
                                                    editingTrip.payment_status === 'Paid' ? 'bg-emerald-600 text-white' :
                                                    editingTrip.payment_status === 'Partial' ? 'bg-orange-600 text-white' :
                                                    'bg-slate-400 text-white'
                                                )}>
                                                    {editingTrip.payment_status === 'Paid' ? 'Going Settled' : editingTrip.payment_status === 'Partial' ? 'Partial Balance' : 'Unpaid'}
                                                </Badge>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            {editingTrip.journey_type?.includes('Go & Return') && (
                                <div className="space-y-4 pt-4 border-t border-dashed">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-indigo-500 border-b border-indigo-100 pb-2 flex items-center gap-1.5">
                                        <RefreshCw className="w-3.5 h-3.5" /> Return Invoice Details
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase">Return Client Name</Label>
                                            <Input 
                                                placeholder="e.g. Acme Corp" 
                                                value={editingTrip.return_client_name || ''} 
                                                onChange={e => setEditingTrip({...editingTrip, return_client_name: e.target.value})}
                                                className="h-10 text-sm font-semibold border-indigo-100 bg-indigo-50/30"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase">Return Invoice Number</Label>
                                            <Input 
                                                placeholder="INV-RET-..." 
                                                value={editingTrip.return_invoice_no || ''} 
                                                onChange={e => setEditingTrip({...editingTrip, return_invoice_no: e.target.value})}
                                                className="h-10 text-sm font-semibold border-indigo-100 bg-indigo-50/30"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase">Return Invoice Date</Label>
                                            <Input 
                                                type="date" 
                                                value={editingTrip.return_invoice_date ? new Date(editingTrip.return_invoice_date).toISOString().split('T')[0] : ''} 
                                                onChange={e => setEditingTrip({...editingTrip, return_invoice_date: e.target.value})}
                                                className="h-10 text-sm border-indigo-100 bg-indigo-50/30"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase">Return Revenue</Label>
                                            <div className="flex relative">
                                                <select
                                                    className="absolute left-0 top-0 h-full w-16 bg-transparent border-none text-xs font-bold text-slate-600 focus:ring-0 cursor-pointer px-2"
                                                    value={editingTrip.return_revenue_currency || 'TZS'}
                                                    onChange={e => setEditingTrip({...editingTrip, return_revenue_currency: e.target.value})}
                                                >
                                                    <option value="TZS">TZS</option>
                                                    <option value="USD">USD</option>
                                                </select>
                                                <Input 
                                                    type="number"
                                                    placeholder="0" 
                                                    value={editingTrip.return_revenue_amount || ''} 
                                                    onChange={e => setEditingTrip({...editingTrip, return_revenue_amount: e.target.value})}
                                                    className="h-10 pl-16 text-sm font-bold border-indigo-100 bg-indigo-50/30"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold text-emerald-700 uppercase">Return Amount Received</Label>
                                            <Input 
                                                type="number"
                                                step="any"
                                                placeholder="0.00" 
                                                value={editingTrip.return_amount_received ?? (editingTrip.return_payment_status === 'Paid' ? (editingTrip.return_revenue_amount || '') : '')} 
                                                onChange={e => {
                                                    const recVal = parseFloat(e.target.value) || 0;
                                                    const revVal = parseFloat(editingTrip.return_revenue_amount) || 0;
                                                    const newStatus = recVal >= revVal && revVal > 0 ? 'Paid' : recVal > 0 ? 'Partial' : 'Pending';
                                                    setEditingTrip({
                                                        ...editingTrip,
                                                        return_amount_received: e.target.value,
                                                        return_payment_status: newStatus
                                                    });
                                                }}
                                                className="h-10 text-sm font-bold text-emerald-700 bg-emerald-50/30 border-emerald-200"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] font-bold text-slate-500 uppercase">Return Payment Status</Label>
                                            <Select 
                                                value={editingTrip.return_payment_status || "Pending"} 
                                                onValueChange={(val) => {
                                                    const revVal = parseFloat(editingTrip.return_revenue_amount) || 0;
                                                    const autoRec = val === 'Paid' ? revVal.toString() : val === 'Pending' ? '0' : editingTrip.return_amount_received;
                                                    setEditingTrip({...editingTrip, return_payment_status: val, return_amount_received: autoRec});
                                                }}
                                            >
                                                <SelectTrigger className="h-10 border-indigo-100 bg-indigo-50/30">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Pending">Pending / Unpaid</SelectItem>
                                                    <SelectItem value="Partial">Partial Payment</SelectItem>
                                                    <SelectItem value="Paid">Fully Paid</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Return Still Demanded Live Callout */}
                                        {(() => {
                                            const rev = parseFloat(editingTrip.return_revenue_amount) || 0;
                                            const rec = parseFloat(editingTrip.return_amount_received ?? (editingTrip.return_payment_status === 'Paid' ? rev : 0)) || 0;
                                            const demanded = Math.max(0, rev - rec);
                                            return (
                                                <div className="col-span-2 p-3 rounded-xl bg-indigo-50/50 border border-indigo-100 flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-slate-500 font-bold uppercase text-[10px]">Return Still Demanded:</span>
                                                        <span className={`text-sm font-black ${demanded > 0.01 ? 'text-amber-900' : 'text-emerald-700'}`}>
                                                            {editingTrip.return_revenue_currency || 'TZS'} {demanded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                    <Badge className={cn("text-[10px] font-bold",
                                                        editingTrip.return_payment_status === 'Paid' ? 'bg-emerald-600 text-white' :
                                                        editingTrip.return_payment_status === 'Partial' ? 'bg-orange-600 text-white' :
                                                        'bg-slate-400 text-white'
                                                    )}>
                                                        {editingTrip.return_payment_status === 'Paid' ? 'Fully Settled' : editingTrip.return_payment_status === 'Partial' ? 'Partial Balance' : 'Unpaid'}
                                                    </Badge>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 flex flex-row items-center justify-between">
                        <div>
                            {editingTrip?.invoice_no && !editingTrip.invoice_no.startsWith("UNASSIGNED") && (
                                <Button 
                                    type="button"
                                    variant="outline" 
                                    className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 text-xs font-bold"
                                    onClick={() => {
                                        if (confirm(`Remove this trip from invoice ${editingTrip.invoice_no}? It will be returned to Uninvoiced Vehicles.`)) {
                                            removeFromInvoiceMutation.mutate({ 
                                                sheetId: editingTrip.id,
                                                isReturn: editingTrip._leg === 'RETURN'
                                            });
                                        }
                                    }}
                                    disabled={removeFromInvoiceMutation.isPending}
                                >
                                    <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500" />
                                    {removeFromInvoiceMutation.isPending ? "Removing..." : "Remove from Invoice"}
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={() => setEditingTrip(null)}>Cancel</Button>
                            <Button 
                                onClick={handleSaveEdit} 
                                disabled={updateInvoiceMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700 shadow-md font-bold text-xs"
                            >
                                {updateInvoiceMutation.isPending ? "Saving..." : "Save Edits"}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* RECORD PAYMENT DIALOG */}
            <Dialog open={!!paymentModal} onOpenChange={(open) => !open && setPaymentModal(null)}>
                <DialogContent className="sm:max-w-[460px]">
                    <DialogHeader>
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                                <DollarSign className="w-5 h-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-black text-slate-900">Record Customer Payment</DialogTitle>
                                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                                    Log exact payment receipt into the invoice ledger.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    {paymentModal && (() => {
                        const parsedAmt = parseFloat(paymentAmountInput) || 0;
                        const previewNewTotal = paymentModal.amount_received + parsedAmt;
                        const previewRemaining = Math.max(0, paymentModal.total_amount - previewNewTotal);

                        return (
                            <div className="space-y-4 py-2">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500 font-medium">Invoice:</span>
                                        <span className="font-black text-slate-900">{paymentModal.invoice_no}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500 font-medium">Client:</span>
                                        <span className="font-bold text-indigo-600">{paymentModal.client_name}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500 font-medium">Total Invoiced:</span>
                                        <span className="font-bold text-slate-800">
                                            {paymentModal.currency} {paymentModal.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500 font-medium">Already Received:</span>
                                        <span className="font-bold text-emerald-700">
                                            {paymentModal.currency} {paymentModal.amount_received.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                                        <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Currently Still Demanded:</span>
                                        <span className="text-base font-black text-amber-900">
                                            {paymentModal.currency} {paymentModal.still_demanded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                            Payment Amount Received ({paymentModal.currency})
                                        </Label>
                                        <button 
                                            type="button" 
                                            onClick={() => setPaymentAmountInput(paymentModal.still_demanded.toString())}
                                            className="text-[11px] font-bold text-indigo-600 hover:underline"
                                        >
                                            Full Balance
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">
                                            {paymentModal.currency}
                                        </span>
                                        <Input 
                                            type="number" 
                                            step="any"
                                            placeholder="0.00" 
                                            value={paymentAmountInput} 
                                            onChange={(e) => setPaymentAmountInput(e.target.value)}
                                            className="pl-14 h-10 font-bold text-slate-900 text-base"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Payment Date</Label>
                                        <Input 
                                            type="date" 
                                            value={paymentDateInput} 
                                            onChange={(e) => setPaymentDateInput(e.target.value)}
                                            className="h-9 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Reference / Note</Label>
                                        <Input 
                                            placeholder="e.g. Bank slip, Cheque" 
                                            value={paymentNotesInput} 
                                            onChange={(e) => setPaymentNotesInput(e.target.value)}
                                            className="h-9 text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-100 flex items-center justify-between text-xs">
                                    <div>
                                        <span className="text-slate-500 font-medium">New Still Demanded:</span>
                                        <p className="text-sm font-black text-indigo-950 mt-0.5">
                                            {paymentModal.currency} {previewRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <Badge className={cn("text-[10px] font-bold",
                                        previewRemaining <= 0.01 ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
                                    )}>
                                        {previewRemaining <= 0.01 ? "Will Mark Paid" : "Will Mark Partial"}
                                    </Badge>
                                </div>
                            </div>
                        );
                    })()}

                    <DialogFooter className="gap-2 sm:justify-between pt-2 border-t border-slate-100">
                        <Button variant="ghost" size="sm" onClick={() => setPaymentModal(null)}>
                            Cancel
                        </Button>
                        <Button 
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 px-4 shadow-sm"
                            disabled={recordPaymentMutation.isPending || !paymentAmountInput || parseFloat(paymentAmountInput) <= 0}
                            onClick={() => recordPaymentMutation.mutate()}
                        >
                            {recordPaymentMutation.isPending ? "Recording..." : "Save Payment"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* INVOICE PREVIEW DIALOG */}
            {previewInvoice && (
                <LogisticsInvoicePreview
                    open={!!previewInvoice}
                    onClose={() => setPreviewInvoice(null)}
                    invoiceNo={previewInvoice.invoice_no}
                    invoiceDate={previewInvoice.invoice_date}
                    clientName={previewInvoice.client_name}
                    currency={previewInvoice.currency}
                    trips={previewInvoice.trips}
                    totalRevenue={previewInvoice.total_revenue}
                />
            )}
        </div>
    );
}
