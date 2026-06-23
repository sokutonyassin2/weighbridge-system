import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";
import {
    CreditCard,
    Plus,
    History,
    TrendingUp,
    AlertTriangle,
    CheckCircle2,
    Calendar,
    ChevronDown,
    Briefcase
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export const LogisticsPaymentTracker = ({ searchTerm = "" }: { searchTerm?: string }) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [expandedInvoices, setExpandedInvoices] = useState<string[]>([]);
    const [paymentDialog, setPaymentDialog] = useState<{ open: boolean, invoice_no: string, total_amount: number } | null>(null);
    const [paymentAmt, setPaymentAmt] = useState("");
    const [paymentNote, setPaymentNote] = useState("");

    const toggleInvoice = (invoiceNo: string) => {
        setExpandedInvoices(prev => 
            prev.includes(invoiceNo) ? prev.filter(i => i !== invoiceNo) : [...prev, invoiceNo]
        );
    };

    // 1. Fetch Trips to get Invoice Aggregates
    const { data: tripData, isLoading: tripsLoading, error: tripsError } = useQuery({
        queryKey: ["logistics_invoices_summary"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_trip_sheets" as any)
                .select(`
                    *,
                    vehicle:logistics_fleet!vehicle_id(vehicle_no, trailer_number),
                    trailer:logistics_fleet!trailer_id(vehicle_no, trailer_number)
                `)
                .not("invoice_no", "is", null)
                .order("invoice_date", { ascending: false });

            if (error) throw error;

            // Fetch expenses separately to avoid Supabase join relation errors
            if (data && data.length > 0) {
                const tripIds = data.map((t: any) => t.id);
                const { data: expenseData, error: expenseError } = await supabase
                    .from("logistics_trip_expenses" as any)
                    .select("*")
                    .in("trip_id", tripIds);
                
                if (!expenseError && expenseData) {
                    const expenseMap = expenseData.reduce((acc: any, exp: any) => {
                        if (!acc[exp.trip_id]) acc[exp.trip_id] = [];
                        acc[exp.trip_id].push(exp);
                        return acc;
                    }, {});
                    
                    data.forEach((trip: any) => {
                        trip.expenses = expenseMap[trip.id] || [];
                    });
                } else {
                    data.forEach((trip: any) => trip.expenses = []);
                }
            }

            return data as any[];
        }
    });

    // 2. Fetch Payment History
    const { data: payments, isLoading: paymentsLoading, error: paymentsError } = useQuery({
        queryKey: ["logistics_invoice_payments"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_invoice_payments" as any)
                .select("*")
                .order("payment_date", { ascending: false });

            if (error) throw error;
            return data as any[];
        }
    });

    // 3. Process Data into Ledger Groups
    const ledger = useMemo(() => {
        if (!tripData) return [];

        const invoiceGroups: Record<string, any> = {};

        tripData.forEach(trip => {
            const clientName = trip.client_name || "Unknown Client";
            const rate = parseFloat(trip.exchange_rate) || 2700;

            const processInvoice = (inv: string, isReturn: boolean) => {
                if (!inv) return;

                // Search Filter
                if (searchTerm && !inv.toLowerCase().includes(searchTerm.toLowerCase()) && !clientName.toLowerCase().includes(searchTerm.toLowerCase())) {
                    return;
                }

                if (!invoiceGroups[inv]) {
                    invoiceGroups[inv] = {
                        invoice_no: inv,
                        invoice_date: isReturn ? trip.return_invoice_date : trip.invoice_date,
                        client: clientName,
                        total_revenue: 0,
                        total_journey_costs: 0,
                        trips: []
                    };
                }

                const revAmountRaw = isReturn ? trip.return_revenue_amount : trip.revenue_amount;
                const revCurrency = isReturn ? trip.return_revenue_currency : trip.revenue_currency;
                const rev = parseFloat(revAmountRaw) || 0;
                const revTSh = revCurrency === 'TZS' ? rev : rev * rate;

                // Journey Costs (only assign to outbound to prevent double counting, unless it's ONLY a return trip)
                let journeyCostsTSh = 0;
                if (!isReturn) {
                    const tripExpenses = (trip.expenses as any[]) || [];
                    journeyCostsTSh = tripExpenses
                        .filter(e => e.category !== 'Fixed')
                        .reduce((sum, e) => {
                            const amt = parseFloat(e.amount) || 0;
                            let inTZS = 0;
                            if (e.currency === 'USD') {
                                inTZS = amt * rate;
                            } else if (e.currency === 'TZS' || e.currency === 'TZ') {
                                inTZS = amt;
                            } else {
                                const cRates = trip.country_rates || {};
                                if (e.category === 'Zambia') inTZS = amt * (cRates["Zambia"] || 100);
                                else if (e.category === 'DRC') inTZS = amt * (cRates["DRC"] || 1.0);
                                else if (e.category === 'Rwanda') inTZS = amt * (cRates["Rwanda"] || 2);
                                else if (e.category === 'Burundi') inTZS = amt * (cRates["Burundi"] || 1);
                                else inTZS = amt;
                            }
                            return sum + inTZS;
                        }, 0);
                }

                invoiceGroups[inv].total_revenue += revTSh;
                invoiceGroups[inv].total_journey_costs += journeyCostsTSh;
                
                invoiceGroups[inv].trips.push({
                    ...trip,
                    isReturnInvoice: isReturn,
                    revTSh,
                    journeyCostsTSh,
                    margin: revTSh - journeyCostsTSh,
                    marginUSD: (revTSh - journeyCostsTSh) / rate
                });
            };

            if (trip.invoice_no) processInvoice(trip.invoice_no, false);
            if (trip.journey_type?.includes('Go & Return') && trip.return_invoice_no) processInvoice(trip.return_invoice_no, true);
        });

        const sortedInvoices = Object.values(invoiceGroups).sort((a: any, b: any) => 
            new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime()
        );

        return sortedInvoices.map((inv: any) => {
            const invPayments = payments?.filter(p => p.invoice_no === inv.invoice_no) || [];
            const totalPaid = invPayments.reduce((sum, p) => sum + parseFloat(p.amount_paid), 0);
            return {
                ...inv,
                payments: invPayments,
                total_paid: totalPaid,
                balance: inv.total_revenue - totalPaid,
                margin: inv.total_revenue - inv.total_journey_costs
            };
        });
    }, [tripData, payments]);

    const addPaymentMutation = useMutation({
        mutationFn: async () => {
            if (!paymentDialog || !paymentAmt) return;
            
            const { error } = await supabase
                .from("logistics_invoice_payments" as any)
                .insert({
                    invoice_no: paymentDialog.invoice_no,
                    amount_paid: parseFloat(paymentAmt),
                    recorded_by: user?.id,
                    notes: paymentNote
                });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics_invoice_payments"] });
            toast({ title: "Payment Recorded", description: "The ledger has been updated successfully." });
            setPaymentDialog(null);
            setPaymentAmt("");
            setPaymentNote("");
        },
        onError: (err: any) => {
            toast({ variant: "destructive", title: "Failed to record payment", description: err.message });
        }
    });

    const formatTSh = (val: number) => `TShs. ${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

    if (tripsLoading || paymentsLoading) return (
        <div className="p-12 flex flex-col items-center justify-center gap-4">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
            <div className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Initializing Finance Ledger...</div>
        </div>
    );

    if (tripsError || paymentsError) return (
        <div className="p-12 bg-rose-50 border border-rose-100 rounded-3xl text-center space-y-4">
            <div className="inline-flex p-3 bg-rose-100 text-rose-600 rounded-2xl">
                <AlertTriangle size={24} />
            </div>
            <div>
                <h3 className="text-sm font-bold text-rose-900">Ledger Connection Error</h3>
                <p className="text-xs text-rose-600 mt-1 max-w-md mx-auto">
                    {((paymentsError as any)?.message || (tripsError as any)?.message) === "relation \"public.logistics_invoice_payments\" does not exist" 
                        ? "The Finance Ledger table hasn't been created yet. Please run the provided SQL in your Supabase SQL Editor." 
                        : (paymentsError as any)?.message || (tripsError as any)?.message || "An unexpected error occurred while fetching data."}
                </p>
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4 h-8 text-[10px] font-bold uppercase border-rose-200 text-rose-700 hover:bg-rose-100"
                    onClick={() => queryClient.invalidateQueries()}
                >
                    Retry Connection
                </Button>
            </div>
        </div>
    );

    const totalRevenueSum = ledger.reduce((sum, i) => sum + i.total_revenue, 0);
    const totalPaidSum = ledger.reduce((sum, i) => sum + i.total_paid, 0);
    const totalBalanceSum = ledger.reduce((sum, i) => sum + i.balance, 0);
    const totalMarginSum = ledger.reduce((sum, i) => sum + i.margin, 0);

    const USD_RATE = 2700;
    const formatUSD = (val: number) => `$${(val / USD_RATE).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-slate-900 text-white border-none shadow-xl rounded-3xl overflow-hidden relative">
                    <div className="absolute right-0 bottom-0 p-4 opacity-10">
                        <CreditCard size={64} />
                    </div>
                    <CardHeader className="pb-2 pt-6">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Invoiced Revenue</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-6">
                        <div className="text-lg font-bold tracking-tight">{formatTSh(totalRevenueSum)}</div>
                        <div className="text-[11px] font-bold text-slate-500 mt-0.5">{formatUSD(totalRevenueSum)}</div>
                        <div className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-widest">Total lifecycle value</div>
                    </CardContent>
                </Card>

                <Card className="bg-emerald-50 border-emerald-100 shadow-sm rounded-3xl overflow-hidden">
                    <CardHeader className="pb-2 pt-6">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600/70">Total Liquidated (Paid)</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-6">
                        <div className="text-lg font-bold text-emerald-700 tracking-tight">{formatTSh(totalPaidSum)}</div>
                        <div className="text-[11px] font-bold text-emerald-600/60 mt-0.5">{formatUSD(totalPaidSum)}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                            <TrendingUp size={12} className="text-emerald-500" />
                            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Settled against invoices</div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-rose-50 border-rose-100 shadow-sm rounded-3xl overflow-hidden">
                    <CardHeader className="pb-2 pt-6">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-600/70">Outstanding Balance</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-6">
                        <div className="text-lg font-bold text-rose-700 tracking-tight">{formatTSh(totalBalanceSum)}</div>
                        <div className="text-[11px] font-bold text-rose-600/60 mt-0.5">{formatUSD(totalBalanceSum)}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                            <AlertTriangle size={12} className="text-rose-500" />
                            <div className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">Collectable Debt</div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-indigo-50 border-indigo-100 shadow-sm rounded-3xl overflow-hidden">
                    <CardHeader className="pb-2 pt-6">
                        <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-600/70">Net Journey Margin</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-6">
                        <div className="text-lg font-bold text-indigo-700 tracking-tight">{formatTSh(totalMarginSum)}</div>
                        <div className="text-[11px] font-bold text-indigo-600/60 mt-0.5">{formatUSD(totalMarginSum)}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                            <Briefcase size={12} className="text-indigo-500" />
                            <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Excl. Fixed Costs</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Finance Ledger Table */}
            <Card className="border-slate-200 border shadow-lg rounded-3xl overflow-hidden bg-white">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="w-12"></TableHead>
                            <TableHead className="text-[9px] font-bold uppercase text-slate-400 tracking-widest py-3">Invoice Tracking</TableHead>
                            <TableHead className="text-[9px] font-bold uppercase text-slate-400 tracking-widest">Client</TableHead>
                            <TableHead className="text-right text-[9px] font-bold uppercase text-slate-400 tracking-widest">Total Amount</TableHead>
                            <TableHead className="text-right text-[9px] font-bold uppercase text-slate-400 tracking-widest">Paid</TableHead>
                            <TableHead className="text-right text-[9px] font-bold uppercase text-slate-400 tracking-widest">Balance</TableHead>
                            <TableHead className="w-32"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {ledger.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="py-24 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="p-4 bg-slate-50 rounded-full text-slate-300">
                                            <Briefcase size={32} />
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No invoices found in accounts</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : ledger.map((inv) => {
                            const isExpanded = expandedInvoices.includes(inv.invoice_no);
                            const isFullyPaid = inv.balance <= 0.01;
                            
                            return (
                                <Fragment key={inv.invoice_no}>
                                    <TableRow className={cn(
                                        "hover:bg-slate-50 group transition-all",
                                        isExpanded && "bg-slate-100/50"
                                    )}>
                                        <TableCell className="text-center">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => toggleInvoice(inv.invoice_no)}>
                                                {isExpanded ? <ChevronDown size={16} /> : <Plus size={16} className="text-slate-300" />}
                                            </Button>
                                        </TableCell>
                                        <TableCell className="font-bold text-slate-900 py-5">
                                            <div className="flex flex-col">
                                                <span className="text-sm tracking-tight">{inv.invoice_no}</span>
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    <Calendar size={10} className="text-slate-400" />
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Issued {new Date(inv.invoice_date).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs font-bold text-slate-600">{inv.client}</span>
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-slate-900">{formatTSh(inv.total_revenue)}</TableCell>
                                        <TableCell className="text-right font-bold text-emerald-600">{formatTSh(inv.total_paid)}</TableCell>
                                        <TableCell className="text-right">
                                            <span className={cn(
                                                "font-bold text-xs tabular-nums",
                                                isFullyPaid ? "text-slate-300" : "text-rose-600"
                                            )}>
                                                {formatTSh(inv.balance < 0 ? 0 : inv.balance)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            {!isFullyPaid ? (
                                                <Button 
                                                    className="h-7 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[9px] uppercase tracking-widest transition-all"
                                                    onClick={() => setPaymentDialog({ open: true, invoice_no: inv.invoice_no, total_amount: inv.total_revenue })}
                                                >
                                                    Add Payment
                                                </Button>
                                            ) : (
                                                <Badge className="bg-emerald-50 text-emerald-600 border-none px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em]">
                                                    Settled
                                                </Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>

                                    {/* Breakdown Section */}
                                    {isExpanded && (
                                        <TableRow className="bg-white border-none">
                                            <TableCell colSpan={7} className="p-0 border-none">
                                                <div className="p-6 pt-2 space-y-6 animate-in slide-in-from-top-2 duration-300">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                        {/* List of Vehicles */}
                                                        <div className="space-y-3">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <CreditCard size={14} className="text-indigo-500" />
                                                                <h5 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Charged Vehicles</h5>
                                                            </div>
                                                            <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 space-y-2">
                                                                {inv.trips.map((trip: any) => (
                                                                    <div key={trip.id} className="flex items-center justify-between text-[11px] py-1.5 border-b border-slate-100 last:border-0">
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <div className="flex items-center justify-between gap-4">
                                                                                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-tighter">ID: {trip.trip_number || trip.reference_number || trip.trip_id || 'N/A'}</span>
                                                                                <Badge variant="outline" className={cn(
                                                                                    "text-[8px] h-3.5 px-1 border-none font-black uppercase tracking-tighter",
                                                                                    trip.margin > 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                                                                                )}>
                                                                                    {trip.margin > 0 ? "Profitable Journey" : "Negative Margin"}
                                                                                </Badge>
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="font-bold text-slate-700">{trip.vehicle?.vehicle_no || trip.vehicle?.trailer_number || 'Unknown'}</span>
                                                                                <span className="text-slate-300">|</span>
                                                                                <span className="font-medium text-slate-500 italic">{trip.trailer?.vehicle_no || trip.trailer?.trailer_number || 'No Trailer'}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex flex-col items-end gap-0.5 border-l border-slate-100 pl-4">
                                                                            <span className="font-black text-slate-900">{formatTSh(trip.revTSh)}</span>
                                                                            <div className="flex items-center gap-2 text-[9px] font-bold">
                                                                                <span className="text-slate-400">Costs: {formatTSh(trip.journeyCostsTSh)}</span>
                                                                                <span className="text-slate-300">|</span>
                                                                                <span className={cn(trip.margin > 0 ? "text-emerald-600" : "text-rose-600")}>Net: ${trip.marginUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Payment History */}
                                                        <div className="space-y-3">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <History size={14} className="text-emerald-500" />
                                                                <h5 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Payment History Ledger</h5>
                                                            </div>
                                                            <div className="space-y-2">
                                                                {inv.payments.length === 0 ? (
                                                                    <div className="text-center py-4 text-slate-300 italic text-[10px] font-medium uppercase">No payments recorded yet</div>
                                                                ) : inv.payments.map((p: any) => (
                                                                    <div key={p.id} className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm transition-all hover:border-emerald-200">
                                                                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                                                                            <CheckCircle2 size={14} />
                                                                        </div>
                                                                        <div className="flex-1">
                                                                            <div className="flex justify-between items-center">
                                                                                <span className="text-xs font-black text-emerald-600 tracking-tight">+{formatTSh(parseFloat(p.amount_paid))}</span>
                                                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{new Date(p.payment_date).toLocaleDateString()}</span>
                                                                            </div>
                                                                            {p.notes && <p className="text-[10px] text-slate-500 mt-1 font-medium capitalize">{p.notes}</p>}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            </Card>

            {/* Add Payment Dialog */}
            <Dialog open={!!paymentDialog?.open} onOpenChange={(open) => !open && setPaymentDialog(null)}>
                <DialogContent className="max-w-md bg-white border-none shadow-2xl rounded-3xl overflow-hidden p-0">
                    <div className="bg-slate-900 p-6 text-white">
                        <DialogHeader>
                            <DialogTitle className="text-lg font-bold flex items-center gap-3">
                                <div className="p-2 bg-emerald-500 rounded-xl">
                                    <Plus size={18} className="text-white" />
                                </div>
                                Record Settlement
                            </DialogTitle>
                            <p className="text-slate-400 text-xs font-medium mt-1 uppercase tracking-widest opacity-60">Invoice Ref: <span className="text-emerald-400 font-black">{paymentDialog?.invoice_no}</span></p>
                        </DialogHeader>
                    </div>

                    <div className="p-8 space-y-6 pb-2">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Payment Amount (TShs)</Label>
                            <Input 
                                type="number"
                                placeholder="e.g. 1500000" 
                                value={paymentAmt}
                                className="text-lg font-black bg-slate-50 border-none rounded-2xl h-14 hover:bg-slate-100 transition-all focus:bg-white shadow-inner"
                                onChange={(e) => setPaymentAmt(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Admin Notes</Label>
                            <Input 
                                placeholder="e.g. Paid via Bank Transfer - CRDB" 
                                value={paymentNote}
                                className="text-xs rounded-xl h-12 bg-white border-slate-200"
                                onChange={(e) => setPaymentNote(e.target.value)}
                            />
                        </div>

                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3 text-amber-700">
                            <AlertTriangle size={18} className="shrink-0" />
                            <p className="text-[10px] font-bold leading-relaxed uppercase">This entry will update the client ledger permanently. Please verify the amount before confirming.</p>
                        </div>
                    </div>

                    <DialogFooter className="p-6 pt-2 bg-white gap-3">
                        <Button variant="ghost" className="rounded-xl font-bold uppercase text-[10px] tracking-widest h-11 flex-1" onClick={() => setPaymentDialog(null)}>Cancel</Button>
                        <Button 
                            className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-[10px] uppercase tracking-widest px-8 shadow-xl flex-1 h-11 active:scale-95 transition-all"
                            onClick={() => addPaymentMutation.mutate()}
                            disabled={addPaymentMutation.isPending || !paymentAmt}
                        >
                            {addPaymentMutation.isPending ? "Processing..." : "Confirm Entry"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
