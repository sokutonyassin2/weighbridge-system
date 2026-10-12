import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
    Search, 
    CreditCard, 
    CheckCircle2, 
    Clock, 
    AlertCircle, 
    Building2, 
    DollarSign, 
    Calendar, 
    ChevronDown, 
    ChevronUp, 
    History,
    Receipt,
    ArrowUpRight,
    TrendingUp,
    RotateCcw,
    Printer,
    FileText
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { fetchCleanLogisticsTripSheets } from "@/lib/logisticsDataService";
import { 
    getClientOpeningBalances, 
    saveClientOpeningBalance, 
    buildClientStatement 
} from "@/lib/logisticsFinanceService";

export default function AccountsReceivable() {
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<"All" | "Unsettled" | "Partial" | "Paid">("All");
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    const [paymentAmount, setPaymentAmount] = useState<string>("");
    const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split("T")[0]);
    const [paymentNotes, setPaymentNotes] = useState<string>("");
    const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

    // Client Statement & Opening Balance States
    const [clientOpeningBalances, setClientOpeningBalances] = useState<Record<string, number>>(() => getClientOpeningBalances());
    const [selectedClientForStatement, setSelectedClientForStatement] = useState<string | null>(null);
    const [clientStatementModalOpen, setClientStatementModalOpen] = useState(false);
    const [editOpeningBalanceModalOpen, setEditOpeningBalanceModalOpen] = useState(false);
    const [editingClientName, setEditingClientName] = useState("");
    const [openingBalanceInput, setOpeningBalanceInput] = useState("");

    const { toast } = useToast();
    const queryClient = useQueryClient();

    // 1. Fetch Trip Sheets that have been invoiced (with operational baseline)
    const { data: invoicedSheets = [], isLoading: isLoadingSheets, refetch: refetchSheets } = useQuery({
        queryKey: ["finance-accounts-receivable"],
        queryFn: async () => {
            const sheets = await fetchCleanLogisticsTripSheets();
            return (sheets || []).filter((s: any) => s.invoice_no || s.return_invoice_no);
        }
    });

    // 2. Fetch Recorded Invoice Payments
    const { data: invoicePayments = [], isLoading: isLoadingPayments, refetch: refetchPayments } = useQuery({
        queryKey: ["finance-ar-invoice-payments"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_invoice_payments" as any)
                .select("*")
                .order("created_at", { ascending: false });

            if (error) return [];
            return data || [];
        }
    });

    const handleRefreshAll = () => {
        refetchSheets();
        refetchPayments();
    };

    // Calculate Payment Totals and History Map per Invoice
    const { paymentTotals, paymentHistoryMap } = useMemo(() => {
        const totals: Record<string, number> = {};
        const history: Record<string, any[]> = {};

        invoicePayments.forEach((p: any) => {
            if (p.invoice_no) {
                const amt = parseFloat(p.amount_paid) || 0;
                totals[p.invoice_no] = (totals[p.invoice_no] || 0) + amt;

                if (!history[p.invoice_no]) history[p.invoice_no] = [];
                history[p.invoice_no].push(p);
            }
        });

        return { paymentTotals: totals, paymentHistoryMap: history };
    }, [invoicePayments]);

    // Record Payment Mutation (Exact amount received)
    const recordPaymentMutation = useMutation({
        mutationFn: async ({
            invoice,
            amount,
            date,
            notes
        }: {
            invoice: any;
            amount: number;
            date: string;
            notes: string;
        }) => {
            if (amount <= 0) {
                throw new Error("Payment amount must be greater than zero.");
            }

            // 1. Insert into logistics_invoice_payments
            const { error: pError } = await supabase
                .from("logistics_invoice_payments" as any)
                .insert({
                    invoice_no: invoice.invoice_no,
                    amount_paid: amount,
                    payment_date: date || new Date().toISOString().split("T")[0],
                    notes: notes || "Payment received",
                    recorded_by: user?.id || null
                });

            if (pError) throw pError;

            // 2. Compute new status
            const newTotalPaid = (invoice.amount_paid || 0) + amount;
            const newRemaining = Math.max(0, invoice.total_amount - newTotalPaid);
            const newStatus = newRemaining <= 0.01 ? "Paid" : "Partial";

            // 3. Update all trip sheets tied to this invoice
            const updates = invoice.trips.map((trip: any) => {
                if (trip._leg === "RETURN") {
                    return supabase
                        .from("logistics_trip_sheets" as any)
                        .update({ return_payment_status: newStatus })
                        .eq("id", trip.id);
                } else {
                    return supabase
                        .from("logistics_trip_sheets" as any)
                        .update({ payment_status: newStatus })
                        .eq("id", trip.id);
                }
            });

            await Promise.all(updates);

            return { newTotalPaid, newRemaining, newStatus };
        },
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ["finance-accounts-receivable"] });
            queryClient.invalidateQueries({ queryKey: ["finance-ar-invoice-payments"] });
            queryClient.invalidateQueries({ queryKey: ["logistics-invoices-sheets"] });
            queryClient.invalidateQueries({ queryKey: ["logistics_invoice_payments_list"] });
            queryClient.invalidateQueries({ queryKey: ["finance_overview_sheets"] });
            queryClient.invalidateQueries({ queryKey: ["finance_overview_payments"] });

            toast({
                title: "Payment Recorded",
                description: res.newRemaining <= 0.01
                    ? `Invoice ${selectedInvoice?.invoice_no} has been FULLY SETTLED.`
                    : `Partial payment recorded. Still Demanded: ${selectedInvoice?.currency} ${res.newRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            });

            setPaymentModalOpen(false);
            setSelectedInvoice(null);
            setPaymentAmount("");
            setPaymentNotes("");
        },
        onError: (error: any) => {
            toast({ variant: "destructive", title: "Failed to Record Payment", description: error.message });
        }
    });

    // Grouping Invoices and Calculating Outstanding "Still Demanded" Balances
    const { clientGroups, overallMetrics } = useMemo(() => {
        const allInvoices: Record<string, any> = {};

        let totalInvoicedUSD = 0;
        let totalInvoicedTZS = 0;
        let totalReceivedUSD = 0;
        let totalReceivedTZS = 0;
        let totalDemandedUSD = 0;
        let totalDemandedTZS = 0;

        let countPaid = 0;
        let countPartial = 0;
        let countPending = 0;

        invoicedSheets.forEach((sheet: any) => {
            const rate = parseFloat(sheet.exchange_rate) || 2700;

            // Outbound Leg
            if (sheet.invoice_no) {
                const invNo = sheet.invoice_no;
                if (!allInvoices[invNo]) {
                    allInvoices[invNo] = {
                        invoice_no: invNo,
                        invoice_date: sheet.invoice_date,
                        currency: sheet.revenue_currency || "TZS",
                        client_name: sheet.client_name || "Unspecified Client",
                        exchange_rate: rate,
                        total_amount: 0,
                        trips: []
                    };
                }
                allInvoices[invNo].trips.push({ ...sheet, _leg: "OUTBOUND" });
                allInvoices[invNo].total_amount += parseFloat(sheet.revenue_amount || 0);
            }

            // Return Leg
            if (sheet.return_invoice_no) {
                const retInvNo = sheet.return_invoice_no;
                if (!allInvoices[retInvNo]) {
                    allInvoices[retInvNo] = {
                        invoice_no: retInvNo,
                        invoice_date: sheet.return_invoice_date,
                        currency: sheet.return_revenue_currency || "TZS",
                        client_name: sheet.return_client_name || sheet.client_name || "Unspecified Client",
                        exchange_rate: rate,
                        total_amount: 0,
                        trips: []
                    };
                }
                allInvoices[retInvNo].trips.push({ ...sheet, _leg: "RETURN" });
                allInvoices[retInvNo].total_amount += parseFloat(sheet.return_revenue_amount || 0);
            }
        });

        // Compute metrics & filter by search / tab
        const searchLower = searchTerm.toLowerCase();
        const clientAcc: Record<string, any> = {};

        Object.values(allInvoices).forEach((inv: any) => {
            const rate = inv.exchange_rate || 2700;
            const isUSD = inv.currency === "USD";

            // Amount Received calculation
            // If invoicePayments has records, sum them. If not recorded, check trip baseline amount_received or status.
            const recordedPayments = paymentTotals[inv.invoice_no];
            const hasLegacyPaid = inv.trips.every((t: any) => 
                (t._leg === "RETURN" ? t.return_payment_status : t.payment_status) === "Paid"
            );
            const baselineReceived = inv.trips.reduce((acc: number, t: any) => acc + (t.amount_received || 0), 0);
            const amountPaid = recordedPayments !== undefined 
                ? recordedPayments 
                : (hasLegacyPaid ? inv.total_amount : baselineReceived);

            const stillDemanded = Math.max(0, inv.total_amount - amountPaid);
            const isFullyPaid = stillDemanded <= 0.01 && inv.total_amount > 0;
            const isPartial = amountPaid > 0 && stillDemanded > 0.01;

            const computedStatus = isFullyPaid ? "Paid" : isPartial ? "Partial" : "Pending";

            inv.amount_paid = amountPaid;
            inv.still_demanded = stillDemanded;
            inv.computed_status = computedStatus;
            inv.payments = paymentHistoryMap[inv.invoice_no] || [];

            // Convert to USD and TZS for global totals
            const invUSD = isUSD ? inv.total_amount : inv.total_amount / rate;
            const invTZS = isUSD ? inv.total_amount * rate : inv.total_amount;
            const recUSD = isUSD ? amountPaid : amountPaid / rate;
            const recTZS = isUSD ? amountPaid * rate : amountPaid;
            const demUSD = isUSD ? stillDemanded : stillDemanded / rate;
            const demTZS = isUSD ? stillDemanded * rate : stillDemanded;

            totalInvoicedUSD += invUSD;
            totalInvoicedTZS += invTZS;
            totalReceivedUSD += recUSD;
            totalReceivedTZS += recTZS;
            totalDemandedUSD += demUSD;
            totalDemandedTZS += demTZS;

            if (computedStatus === "Paid") countPaid++;
            else if (computedStatus === "Partial") countPartial++;
            else countPending++;

            // Filter logic
            const matchesSearch = !searchTerm || 
                inv.invoice_no.toLowerCase().includes(searchLower) || 
                inv.client_name.toLowerCase().includes(searchLower);

            let matchesTab = true;
            if (activeTab === "Unsettled") {
                matchesTab = computedStatus !== "Paid";
            } else if (activeTab === "Partial") {
                matchesTab = computedStatus === "Partial";
            } else if (activeTab === "Paid") {
                matchesTab = computedStatus === "Paid";
            }

            if (matchesSearch && matchesTab) {
                const client = inv.client_name;
                if (!clientAcc[client]) {
                    clientAcc[client] = {
                        client_name: client,
                        total_invoiced_usd: 0,
                        total_received_usd: 0,
                        total_demanded_usd: 0,
                        invoices: []
                    };
                }
                clientAcc[client].invoices.push(inv);
                clientAcc[client].total_invoiced_usd += invUSD;
                clientAcc[client].total_received_usd += recUSD;
                clientAcc[client].total_demanded_usd += demUSD;
            }
        });

        let totalOpeningUSD = 0;
        let totalClosingUSD = 0;

        Object.values(clientAcc).forEach((group: any) => {
            const ob = clientOpeningBalances[group.client_name] || 0;
            group.opening_balance_usd = ob;
            group.closing_balance_usd = ob + group.total_invoiced_usd - group.total_received_usd;
            totalOpeningUSD += ob;
            totalClosingUSD += group.closing_balance_usd;
        });

        const collectionRate = totalInvoicedUSD > 0 ? Math.round((totalReceivedUSD / totalInvoicedUSD) * 100) : 0;

        return {
            clientGroups: clientAcc,
            overallMetrics: {
                totalInvoicedUSD,
                totalInvoicedTZS,
                totalReceivedUSD,
                totalReceivedTZS,
                totalDemandedUSD,
                totalDemandedTZS,
                totalOpeningUSD,
                totalClosingUSD,
                countPaid,
                countPartial,
                countPending,
                collectionRate,
                totalInvoicesCount: Object.keys(allInvoices).length
            }
        };
    }, [invoicedSheets, paymentTotals, paymentHistoryMap, searchTerm, activeTab, clientOpeningBalances]);

    const handleOpenPayment = (invoice: any) => {
        setSelectedInvoice(invoice);
        setPaymentAmount(invoice.still_demanded > 0 ? invoice.still_demanded.toString() : "");
        setPaymentDate(new Date().toISOString().split("T")[0]);
        setPaymentNotes("");
        setPaymentModalOpen(true);
    };

    const toggleHistory = (invoiceNo: string) => {
        setExpandedHistory(prev => ({ ...prev, [invoiceNo]: !prev[invoiceNo] }));
    };

    // Calculate dynamic preview for payment modal
    const parsedPaymentInput = parseFloat(paymentAmount) || 0;
    const previewNewReceived = selectedInvoice ? (selectedInvoice.amount_paid || 0) + parsedPaymentInput : 0;
    const previewNewDemanded = selectedInvoice ? Math.max(0, selectedInvoice.total_amount - previewNewReceived) : 0;

    // Build active client statement
    const activeClientStatement = useMemo(() => {
        if (!selectedClientForStatement) return null;
        const cGroup = clientGroups[selectedClientForStatement];
        if (!cGroup) return null;
        return buildClientStatement(selectedClientForStatement, cGroup.invoices, cGroup.opening_balance_usd);
    }, [selectedClientForStatement, clientGroups]);

    const handleSaveOpeningBalance = () => {
        if (!editingClientName) return;
        const val = parseFloat(openingBalanceInput) || 0;
        saveClientOpeningBalance(editingClientName, val);
        setClientOpeningBalances(getClientOpeningBalances());
        toast({
            title: "Opening Balance Saved",
            description: `Set opening balance for ${editingClientName} to $${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`
        });
        setEditOpeningBalanceModalOpen(false);
    };

    return (
        <div className="p-6 max-w-[1650px] mx-auto space-y-6 min-h-screen bg-slate-50/40">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md">
                            <CreditCard className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Accounts Receivable & Collections</h1>
                            <p className="text-xs font-semibold text-slate-500 mt-0.5">
                                Log exact customer payments, track remaining balances still demanded, and manage credit risk exposure.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input 
                            placeholder="Search invoice or client..." 
                            className="pl-9 h-9 text-xs bg-slate-50 border-slate-200 focus:bg-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleRefreshAll} 
                        className="h-9 px-3 text-xs font-semibold text-slate-700 gap-1.5 bg-white border-slate-200 hover:bg-slate-50"
                    >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Financial Health KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Invoiced */}
                <Card className="border-slate-200/90 shadow-xs bg-white relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600" />
                    <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Billed Receivables</span>
                            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                                <DollarSign className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-1">
                            <p className="text-2xl font-black text-slate-900 tracking-tight">
                                ${overallMetrics.totalInvoicedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs font-bold text-slate-500 mt-0.5">
                                TSh {overallMetrics.totalInvoicedTZS.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                            <span>Total Invoices</span>
                            <span className="font-bold text-slate-800">{overallMetrics.totalInvoicesCount} invoices</span>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Total Cash Received */}
                <Card className="border-slate-200/90 shadow-xs bg-white relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                    <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Cash Collected</span>
                            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                                <CheckCircle2 className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-1">
                            <p className="text-2xl font-black text-emerald-700 tracking-tight">
                                ${overallMetrics.totalReceivedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs font-bold text-slate-500 mt-0.5">
                                TSh {overallMetrics.totalReceivedTZS.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                            <span>Collection Rate</span>
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                                {overallMetrics.collectionRate}% Collected
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Total Still Demanded (Outstanding Debt) */}
                <Card className="border-slate-200/90 shadow-xs bg-white relative overflow-hidden ring-1 ring-amber-400/20">
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-500" />
                    <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Total Still Demanded (Debt)</span>
                            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                                <AlertCircle className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-1">
                            <p className="text-2xl font-black text-amber-800 tracking-tight">
                                ${overallMetrics.totalDemandedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs font-bold text-slate-500 mt-0.5">
                                TSh {overallMetrics.totalDemandedTZS.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                            <span>Pending Invoices</span>
                            <span className="font-bold text-amber-900">{overallMetrics.countPending + overallMetrics.countPartial} active</span>
                        </div>
                    </CardContent>
                </Card>

                {/* 4. Status Breakdown */}
                <Card className="border-slate-200/90 shadow-xs bg-white relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-slate-400" />
                    <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Settlement Status</span>
                            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600">
                                <Receipt className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-2 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Fully Settled:
                                </span>
                                <span className="font-black text-emerald-700">{overallMetrics.countPaid}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-orange-500" /> Partial (Demanded):
                                </span>
                                <span className="font-black text-orange-700">{overallMetrics.countPartial}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-slate-400" /> Unpaid / Pending:
                                </span>
                                <span className="font-black text-slate-700">{overallMetrics.countPending}</span>
                            </div>
                        </div>
                    </CardHeader>
                </Card>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full sm:w-auto">
                    <TabsList className="bg-white border border-slate-200 p-1 shadow-xs h-auto">
                        <TabsTrigger value="All" className="py-1.5 px-3 text-xs font-bold data-[state=active]:bg-slate-100">
                            All Invoices ({overallMetrics.totalInvoicesCount})
                        </TabsTrigger>
                        <TabsTrigger value="Unsettled" className="py-1.5 px-3 text-xs font-bold text-amber-700 data-[state=active]:bg-amber-50">
                            Still Demanded ({overallMetrics.countPending + overallMetrics.countPartial})
                        </TabsTrigger>
                        <TabsTrigger value="Partial" className="py-1.5 px-3 text-xs font-bold text-orange-700 data-[state=active]:bg-orange-50">
                            Partial Payments ({overallMetrics.countPartial})
                        </TabsTrigger>
                        <TabsTrigger value="Paid" className="py-1.5 px-3 text-xs font-bold text-emerald-700 data-[state=active]:bg-emerald-50">
                            Fully Settled ({overallMetrics.countPaid})
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Invoices Grouped by Client */}
            <div className="space-y-6">
                {isLoadingSheets || isLoadingPayments ? (
                    <div className="p-16 text-center text-slate-500 font-medium bg-white rounded-2xl border border-slate-200">
                        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        Loading accounts receivable and payment records...
                    </div>
                ) : Object.keys(clientGroups).length === 0 ? (
                    <div className="p-16 text-center text-slate-500 border-2 border-dashed rounded-2xl bg-white space-y-2">
                        <p className="text-base font-bold text-slate-700">No invoices match your selected filter.</p>
                        <p className="text-xs text-slate-400">Try switching tabs or resetting your search term.</p>
                    </div>
                ) : (
                    Object.values(clientGroups).map((clientGroup: any) => (
                        <Card key={clientGroup.client_name} className="border-slate-200/90 shadow-xs bg-white overflow-hidden">
                            {/* Client Summary Header */}
                            <CardHeader className="bg-slate-50/80 p-4 border-b border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-indigo-600 shadow-2xs">
                                        <Building2 className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                                            {clientGroup.client_name}
                                            <Badge variant="outline" className="text-[10px] font-bold bg-white text-slate-600 border-slate-200">
                                                {clientGroup.invoices.length} {clientGroup.invoices.length === 1 ? "Invoice" : "Invoices"}
                                                {(() => {
                                                    const totalTrips = clientGroup.invoices.reduce((sum: number, inv: any) => sum + (inv.trips ? inv.trips.length : 1), 0);
                                                    return totalTrips > clientGroup.invoices.length ? ` (${totalTrips} Trips)` : null;
                                                })()}
                                            </Badge>
                                        </h2>
                                        <p className="text-xs font-semibold text-slate-500 mt-0.5">
                                            Client Account Statement & Accounts Receivable Ledger
                                        </p>
                                    </div>
                                </div>

                                {/* Financial Equation: Opening + Billed - Received = Closing */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-2.5 rounded-xl border border-slate-200/90 text-xs">
                                    {/* Opening Balance */}
                                    <div className="px-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opening Bal</span>
                                            <button 
                                                className="text-[10px] text-indigo-600 font-bold hover:underline"
                                                onClick={() => {
                                                    setEditingClientName(clientGroup.client_name);
                                                    setOpeningBalanceInput(String(clientGroup.opening_balance_usd || 0));
                                                    setEditOpeningBalanceModalOpen(true);
                                                }}
                                            >
                                                Edit
                                            </button>
                                        </div>
                                        <p className="text-sm font-black text-slate-800 mt-0.5">
                                            ${(clientGroup.opening_balance_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                    </div>

                                    {/* Total Invoiced */}
                                    <div className="px-2 border-l border-slate-100">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Billed (+)</span>
                                        <p className="text-sm font-black text-slate-900 mt-0.5">
                                            ${clientGroup.total_invoiced_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                    </div>

                                    {/* Total Received */}
                                    <div className="px-2 border-l border-slate-100">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Received (-)</span>
                                        <p className="text-sm font-black text-emerald-700 mt-0.5">
                                            ${clientGroup.total_received_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                    </div>

                                    {/* Closing Balance */}
                                    <div className="px-2 border-l border-slate-100">
                                        <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Closing Bal (=)</span>
                                        <p className={`text-sm font-black mt-0.5 ${clientGroup.closing_balance_usd <= 0.01 ? "text-emerald-700" : "text-amber-900"}`}>
                                            ${(clientGroup.closing_balance_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button 
                                        size="sm" 
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 shadow-sm"
                                        onClick={() => {
                                            setSelectedClientForStatement(clientGroup.client_name);
                                            setClientStatementModalOpen(true);
                                        }}
                                    >
                                        <FileText className="w-3.5 h-3.5 mr-1.5" /> View Statement & Ledger
                                    </Button>
                                </div>
                            </CardHeader>

                            {/* Invoices List */}
                            <CardContent className="p-0 divide-y divide-slate-100">
                                {clientGroup.invoices.map((inv: any) => {
                                    const isPaid = inv.computed_status === "Paid";
                                    const isPartial = inv.computed_status === "Partial";
                                    const paidPct = inv.total_amount > 0 ? Math.min(100, Math.round((inv.amount_paid / inv.total_amount) * 100)) : 0;
                                    const hasHistory = inv.payments && inv.payments.length > 0;
                                    const isExpanded = !!expandedHistory[inv.invoice_no];

                                    return (
                                        <div key={inv.invoice_no} className="p-5 hover:bg-slate-50/50 transition-colors">
                                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                                {/* Left: Invoice Identity & Details */}
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-base font-black text-slate-900 tracking-tight">
                                                            {inv.invoice_no}
                                                        </span>
                                                        <Badge 
                                                            className={cn("text-[10px] font-bold",
                                                                isPaid ? "bg-emerald-500 hover:bg-emerald-600 text-white" :
                                                                isPartial ? "bg-orange-500 hover:bg-orange-600 text-white" :
                                                                "bg-slate-400 hover:bg-slate-500 text-white"
                                                            )}
                                                        >
                                                            {isPaid ? "Fully Paid" : isPartial ? "Partial Payment" : "Pending / Unpaid"}
                                                        </Badge>
                                                        {inv.invoice_date && (
                                                            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                                                                <Calendar className="w-3 h-3 text-slate-400" />
                                                                {format(new Date(inv.invoice_date), "MMM dd, yyyy")}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Vehicles Tag */}
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vehicles:</span>
                                                        {inv.trips.map((t: any, idx: number) => (
                                                            <Badge key={idx} variant="outline" className="text-[11px] font-semibold bg-white border-slate-200 text-slate-700 py-0.5 px-2">
                                                                {t.vehicle?.vehicle_no || "Truck"}
                                                                {t._leg === "RETURN" && <span className="text-indigo-600 ml-1 font-bold">(Return)</span>}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Middle: Financial Breakdown (Invoiced, Received, Still Demanded) */}
                                                <div className="grid grid-cols-3 gap-3 bg-slate-50/90 p-3 rounded-xl border border-slate-200/80">
                                                    <div className="text-left">
                                                        <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Total Invoiced</p>
                                                        <p className="text-sm font-black text-slate-900">
                                                            {inv.currency} {inv.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </p>
                                                    </div>

                                                    <div className="text-left">
                                                        <p className="text-[9px] uppercase font-bold text-emerald-600 tracking-wider">Amount Received</p>
                                                        <p className="text-sm font-black text-emerald-700">
                                                            {inv.currency} {inv.amount_paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </p>
                                                    </div>

                                                    <div className="text-left pl-3 border-l border-slate-200">
                                                        <p className="text-[9px] uppercase font-bold text-amber-700 tracking-wider">Still Demanded</p>
                                                        <p className={`text-sm font-black ${inv.still_demanded > 0.01 ? "text-amber-900" : "text-emerald-700"}`}>
                                                            {inv.still_demanded > 0.01 
                                                                ? `${inv.currency} ${inv.still_demanded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                                : "Settled ✓"}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Right: Actions */}
                                                <div className="flex items-center gap-2 justify-end">
                                                    {hasHistory && (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            onClick={() => toggleHistory(inv.invoice_no)}
                                                            className="h-8 text-xs font-semibold text-slate-600 gap-1 hover:bg-slate-100"
                                                        >
                                                            <History className="w-3.5 h-3.5 text-slate-500" />
                                                            Ledger ({inv.payments.length})
                                                            {isExpanded ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                                                        </Button>
                                                    )}

                                                    {inv.still_demanded > 0.01 ? (
                                                        <Button 
                                                            onClick={() => handleOpenPayment(inv)}
                                                            size="sm"
                                                            className="h-8.5 px-3.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-1.5"
                                                        >
                                                            <DollarSign className="w-3.5 h-3.5" />
                                                            Log Payment
                                                        </Button>
                                                    ) : (
                                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-bold py-1 px-2.5">
                                                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Fully Settled
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Progress Bar */}
                                            <div className="mt-3 flex items-center gap-3">
                                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div 
                                                        className={cn("h-full transition-all duration-500",
                                                            isPaid ? "bg-emerald-500" : isPartial ? "bg-orange-500" : "bg-slate-300"
                                                        )}
                                                        style={{ width: `${paidPct}%` }}
                                                    />
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                                                    {paidPct}% Collected
                                                </span>
                                            </div>

                                            {/* Payment Ledger Expandable Details */}
                                            {isExpanded && hasHistory && (
                                                <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                                        <Receipt className="w-3.5 h-3.5 text-indigo-600" />
                                                        Payment Receipt History for {inv.invoice_no}
                                                    </p>
                                                    <div className="divide-y divide-slate-200/60 text-xs">
                                                        {inv.payments.map((payment: any, pIdx: number) => (
                                                            <div key={pIdx} className="py-2 flex items-center justify-between">
                                                                <div>
                                                                    <span className="font-bold text-slate-800">
                                                                        {inv.currency} {parseFloat(payment.amount_paid).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </span>
                                                                    <span className="text-slate-400 text-[11px] ml-2 font-medium">
                                                                        {payment.payment_date ? format(new Date(payment.payment_date), "MMM dd, yyyy") : "No date"}
                                                                    </span>
                                                                </div>
                                                                <div className="text-slate-500 text-[11px] italic">
                                                                    {payment.notes || "Receipt logged"}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* RECORD PAYMENT MODAL (Exact Amount Received) */}
            <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                                <DollarSign className="w-5 h-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-black text-slate-900">Log Received Payment</DialogTitle>
                                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                                    Record the exact payment received from customer for this invoice.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    {selectedInvoice && (
                        <div className="space-y-4 py-2">
                            {/* Invoice Summary Box */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2.5">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500 font-medium">Invoice Number:</span>
                                    <span className="font-black text-slate-900">{selectedInvoice.invoice_no}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500 font-medium">Client Account:</span>
                                    <span className="font-bold text-indigo-600">{selectedInvoice.client_name}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500 font-medium">Total Billed:</span>
                                    <span className="font-bold text-slate-800">
                                        {selectedInvoice.currency} {selectedInvoice.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500 font-medium">Previously Received:</span>
                                    <span className="font-bold text-emerald-700">
                                        {selectedInvoice.currency} {selectedInvoice.amount_paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                                    <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Current Still Demanded:</span>
                                    <span className="text-base font-black text-amber-900">
                                        {selectedInvoice.currency} {selectedInvoice.still_demanded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            {/* Payment Amount Input */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                        Amount Received Now ({selectedInvoice.currency})
                                    </Label>
                                    <button 
                                        type="button" 
                                        onClick={() => setPaymentAmount(selectedInvoice.still_demanded.toString())}
                                        className="text-[11px] font-bold text-indigo-600 hover:underline"
                                    >
                                        Fill Full Balance
                                    </button>
                                </div>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">
                                        {selectedInvoice.currency}
                                    </span>
                                    <Input 
                                        type="number" 
                                        step="any"
                                        placeholder="0.00" 
                                        value={paymentAmount} 
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                        className="pl-14 h-10 font-bold text-slate-900 text-base border-slate-200"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {/* Payment Date & Reference */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Payment Date</Label>
                                    <Input 
                                        type="date" 
                                        value={paymentDate} 
                                        onChange={(e) => setPaymentDate(e.target.value)}
                                        className="h-9 text-xs"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Payment Reference / Note</Label>
                                    <Input 
                                        placeholder="e.g. Wire transfer, Cheque #401" 
                                        value={paymentNotes} 
                                        onChange={(e) => setPaymentNotes(e.target.value)}
                                        className="h-9 text-xs"
                                    />
                                </div>
                            </div>

                            {/* Live Calculation Preview */}
                            <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-100 flex items-center justify-between text-xs">
                                <div>
                                    <span className="text-slate-500 font-medium">New Balance Still Demanded:</span>
                                    <p className="text-sm font-black text-indigo-950 mt-0.5">
                                        {selectedInvoice.currency} {previewNewDemanded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div>
                                    <Badge className={cn("text-[10px] font-bold",
                                        previewNewDemanded <= 0.01 
                                            ? "bg-emerald-600 text-white" 
                                            : "bg-amber-600 text-white"
                                    )}>
                                        {previewNewDemanded <= 0.01 ? "Will Mark Paid" : "Will Mark Partial"}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:justify-between pt-2 border-t border-slate-100">
                        <Button variant="ghost" size="sm" onClick={() => setPaymentModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 px-4 shadow-sm"
                            disabled={recordPaymentMutation.isPending || !paymentAmount || parseFloat(paymentAmount) <= 0}
                            onClick={() => {
                                if (!selectedInvoice) return;
                                recordPaymentMutation.mutate({
                                    invoice: selectedInvoice,
                                    amount: parseFloat(paymentAmount),
                                    date: paymentDate,
                                    notes: paymentNotes
                                });
                            }}
                        >
                            {recordPaymentMutation.isPending ? "Recording..." : "Confirm Payment"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* CLIENT STATEMENT & RUNNING BALANCE LEDGER MODAL */}
            <Dialog open={clientStatementModalOpen} onOpenChange={setClientStatementModalOpen}>
                <DialogContent className="max-w-[900px] p-0 overflow-hidden bg-white max-h-[90vh] flex flex-col">
                    {activeClientStatement && (
                        <>
                            {/* Header */}
                            <div className="bg-slate-900 text-white p-6 border-b border-slate-800 flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge className="bg-indigo-500 text-white font-bold text-[10px] uppercase">Statement of Account</Badge>
                                        <span className="text-xs text-slate-400">Chronological Running Balance</span>
                                    </div>
                                    <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                                        <Building2 className="w-5 h-5 text-indigo-400" />
                                        {selectedClientForStatement}
                                    </h2>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        Official Client Statement • Currency: USD
                                    </p>
                                </div>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => window.print()}
                                    className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-bold"
                                >
                                    <Printer className="w-3.5 h-3.5 mr-1.5" /> Print Statement
                                </Button>
                            </div>

                            {/* Balances Summary Banner */}
                            <div className="grid grid-cols-4 gap-3 bg-slate-50 p-4 border-b border-slate-200 text-xs">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opening Balance</span>
                                    <p className="text-base font-black text-slate-800 mt-0.5">
                                        ${activeClientStatement.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Debits (Billed)</span>
                                    <p className="text-base font-black text-indigo-700 mt-0.5">
                                        ${activeClientStatement.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Credits (Paid)</span>
                                    <p className="text-base font-black text-emerald-700 mt-0.5">
                                        ${activeClientStatement.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div className="border-l border-slate-200 pl-3">
                                    <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Closing Balance (=)</span>
                                    <p className="text-base font-black text-amber-900 mt-0.5">
                                        ${activeClientStatement.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                            </div>

                            {/* Running Balance Ledger Table */}
                            <div className="p-0 overflow-y-auto flex-1">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600">
                                        <tr>
                                            <th className="py-3 px-4">Date</th>
                                            <th className="py-3 px-4">Doc / Ref #</th>
                                            <th className="py-3 px-4">Description</th>
                                            <th className="py-3 px-4 text-right">Debit (+)</th>
                                            <th className="py-3 px-4 text-right">Credit (-)</th>
                                            <th className="py-3 px-4 text-right font-black">Running Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {activeClientStatement.entries.map((entry) => (
                                            <tr key={entry.id} className="hover:bg-slate-50/70">
                                                <td className="py-2.5 px-4 font-mono text-slate-500">{entry.date}</td>
                                                <td className="py-2.5 px-4 font-mono font-bold text-indigo-700">{entry.reference_no}</td>
                                                <td className="py-2.5 px-4 font-medium text-slate-800">{entry.description}</td>
                                                <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                                                    {entry.debit > 0 ? `$${entry.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}
                                                </td>
                                                <td className="py-2.5 px-4 text-right font-bold text-emerald-700">
                                                    {entry.credit > 0 ? `$${entry.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}
                                                </td>
                                                <td className="py-2.5 px-4 text-right font-black text-slate-900 bg-slate-50/50">
                                                    ${entry.running_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer */}
                            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end">
                                <Button variant="outline" onClick={() => setClientStatementModalOpen(false)}>Close Statement</Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* EDIT CLIENT OPENING BALANCE MODAL */}
            <Dialog open={editOpeningBalanceModalOpen} onOpenChange={setEditOpeningBalanceModalOpen}>
                <DialogContent className="max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="text-base font-black text-slate-900">
                            Set Opening Balance for {editingClientName}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-500">
                            Set the initial brought forward balance for this customer prior to current period billings.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2 text-xs">
                        <Label className="font-bold text-slate-700">Opening Balance Amount (USD)</Label>
                        <div className="relative">
                            <DollarSign className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                            <Input 
                                type="number"
                                value={openingBalanceInput}
                                onChange={(e) => setOpeningBalanceInput(e.target.value)}
                                placeholder="0.00"
                                className="pl-9 font-bold text-base h-10"
                            />
                        </div>
                        <p className="text-[11px] text-slate-500">
                            This amount will be added to the customer's current invoiced total to compute their live closing balance.
                        </p>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpeningBalanceModalOpen(false)}>Cancel</Button>
                        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold" onClick={handleSaveOpeningBalance}>
                            Save Opening Balance
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
