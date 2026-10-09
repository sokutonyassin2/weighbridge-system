import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    DollarSign, 
    CreditCard, 
    TrendingUp, 
    ArrowUpRight, 
    ArrowDownRight, 
    AlertCircle, 
    CheckCircle2, 
    Clock, 
    Building2, 
    FileText, 
    FileCheck, 
    Banknote, 
    Truck, 
    RotateCcw,
    ChevronRight,
    Wallet,
    Scale,
    Receipt
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { format } from "date-fns";
import { fetchCleanLogisticsTripSheets, fetchStationPaymentsSummary } from "@/lib/logisticsDataService";

export default function FinanceOverview() {
    const [period, setPeriod] = useState<"all" | "month" | "year">("all");

    // 1. Fetch Trip Sheets for Invoiced Revenues & Expenses (with clean query & operational baseline fallback)
    const { data: tripSheets = [], isLoading: isLoadingSheets, refetch: refetchSheets } = useQuery({
        queryKey: ["finance_overview_sheets"],
        queryFn: async () => {
            return await fetchCleanLogisticsTripSheets();
        }
    });

    // 2. Fetch Recorded Invoice Payments
    const { data: invoicePayments = [], isLoading: isLoadingPayments, refetch: refetchPayments } = useQuery({
        queryKey: ["finance_overview_payments"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_invoice_payments" as any)
                .select("*")
                .order("created_at", { ascending: false });

            if (error) return [];
            return data || [];
        }
    });

    // 3. Fetch Live Station / Weighbridge Collections Summary
    const { data: stationSummary, refetch: refetchStation } = useQuery({
        queryKey: ["finance_overview_station_summary"],
        queryFn: async () => {
            return await fetchStationPaymentsSummary();
        }
    });

    // 4. Fetch Trip Settlements for Driver Reconciliation Status
    const { data: tripSettlements = [], isLoading: isLoadingSettlements } = useQuery({
        queryKey: ["finance_overview_settlements"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_trip_settlements" as any)
                .select("*");

            if (error) return [];
            return data || [];
        }
    });

    const handleRefreshAll = () => {
        refetchSheets();
        refetchPayments();
        refetchStation();
    };

    // Calculate Payment Totals per Invoice
    const paymentMap = useMemo(() => {
        const map: Record<string, number> = {};
        invoicePayments.forEach((p: any) => {
            if (p.invoice_no) {
                map[p.invoice_no] = (map[p.invoice_no] || 0) + (parseFloat(p.amount_paid) || 0);
            }
        });
        return map;
    }, [invoicePayments]);

    // Financial Metrics Aggregation
    const metrics = useMemo(() => {
        let grossInvoicedUSD = 0;
        let grossInvoicedTZS = 0;
        let totalReceivedUSD = 0;
        let totalReceivedTZS = 0;
        let stillDemandedUSD = 0;
        let stillDemandedTZS = 0;
        let totalExpensesUSD = 0;
        let totalExpensesTZS = 0;

        let totalInvoicesCount = 0;
        let paidInvoicesCount = 0;
        let partialInvoicesCount = 0;
        let pendingInvoicesCount = 0;

        const clientExposureMap: Record<string, {
            client_name: string;
            total_invoiced_usd: number;
            total_received_usd: number;
            still_demanded_usd: number;
            invoice_count: number;
            unpaid_count: number;
        }> = {};

        tripSheets.forEach((sheet: any) => {
            const rate = parseFloat(sheet.exchange_rate) || 2700;

            // Outbound Leg
            const revAmt = parseFloat(sheet.revenue_amount) || 0;
            if (sheet.invoice_no || revAmt > 0) {
                totalInvoicesCount++;
                const invNo = sheet.invoice_no || sheet.reference_number || `TRIP_${sheet.id}`;
                const client = sheet.client_name || "Unspecified";
                const isUSD = (sheet.revenue_currency || "USD") === "USD";
                const revUSD = isUSD ? revAmt : revAmt / rate;
                const revTZS = isUSD ? revAmt * rate : revAmt;

                grossInvoicedUSD += revUSD;
                grossInvoicedTZS += revTZS;

                // Amount received for this invoice
                const defaultRec = sheet.amount_received !== undefined ? sheet.amount_received : (sheet.payment_status === "Paid" ? revAmt : 0);
                const recRaw = paymentMap[invNo] !== undefined ? paymentMap[invNo] : defaultRec;
                const recUSD = isUSD ? recRaw : recRaw / rate;
                const recTZS = isUSD ? recRaw * rate : recRaw;

                totalReceivedUSD += recUSD;
                totalReceivedTZS += recTZS;

                const demUSD = Math.max(0, revUSD - recUSD);
                const demTZS = Math.max(0, revTZS - recTZS);
                stillDemandedUSD += demUSD;
                stillDemandedTZS += demTZS;

                if (demUSD <= 0.01) {
                    paidInvoicesCount++;
                } else if (recUSD > 0) {
                    partialInvoicesCount++;
                } else {
                    pendingInvoicesCount++;
                }

                // Client Exposure
                if (!clientExposureMap[client]) {
                    clientExposureMap[client] = {
                        client_name: client,
                        total_invoiced_usd: 0,
                        total_received_usd: 0,
                        still_demanded_usd: 0,
                        invoice_count: 0,
                        unpaid_count: 0
                    };
                }
                clientExposureMap[client].total_invoiced_usd += revUSD;
                clientExposureMap[client].total_received_usd += recUSD;
                clientExposureMap[client].still_demanded_usd += demUSD;
                clientExposureMap[client].invoice_count++;
                if (demUSD > 0.01) clientExposureMap[client].unpaid_count++;
            }

            // Return Leg
            const retRevAmt = parseFloat(sheet.return_revenue_amount) || 0;
            if (sheet.return_invoice_no || retRevAmt > 0) {
                totalInvoicesCount++;
                const retInvNo = sheet.return_invoice_no || `RET_${sheet.reference_number || sheet.id}`;
                const retClient = sheet.return_client_name || sheet.client_name || "Unspecified";
                const isRetUSD = (sheet.return_revenue_currency || "USD") === "USD";
                const retRevUSD = isRetUSD ? retRevAmt : retRevAmt / rate;
                const retRevTZS = isRetUSD ? retRevAmt * rate : retRevAmt;

                grossInvoicedUSD += retRevUSD;
                grossInvoicedTZS += retRevTZS;

                const retRecRaw = paymentMap[retInvNo] !== undefined 
                    ? paymentMap[retInvNo] 
                    : (sheet.return_payment_status === "Paid" ? retRevAmt : 0);
                const retRecUSD = isRetUSD ? retRecRaw : retRecRaw / rate;
                const retRecTZS = isRetUSD ? retRecRaw * rate : retRecRaw;

                totalReceivedUSD += retRecUSD;
                totalReceivedTZS += retRecTZS;

                const retDemUSD = Math.max(0, retRevUSD - retRecUSD);
                const retDemTZS = Math.max(0, retRevTZS - retRecTZS);
                stillDemandedUSD += retDemUSD;
                stillDemandedTZS += retDemTZS;

                if (retDemUSD <= 0.01) {
                    paidInvoicesCount++;
                } else if (retRecUSD > 0) {
                    partialInvoicesCount++;
                } else {
                    pendingInvoicesCount++;
                }

                if (!clientExposureMap[retClient]) {
                    clientExposureMap[retClient] = {
                        client_name: retClient,
                        total_invoiced_usd: 0,
                        total_received_usd: 0,
                        still_demanded_usd: 0,
                        invoice_count: 0,
                        unpaid_count: 0
                    };
                }
                clientExposureMap[retClient].total_invoiced_usd += retRevUSD;
                clientExposureMap[retClient].total_received_usd += retRecUSD;
                clientExposureMap[retClient].still_demanded_usd += retDemUSD;
                clientExposureMap[retClient].invoice_count++;
                if (retDemUSD > 0.01) clientExposureMap[retClient].unpaid_count++;
            }

            // Trip Expenses / Advances
            const expUSD = parseFloat(sheet.total_expenses_usd) || 0;
            const expTZS = parseFloat(sheet.total_expenses_tzs) || 0;
            totalExpensesUSD += expUSD;
            totalExpensesTZS += expTZS > 0 ? expTZS : expUSD * rate;
        });

        const netProfitUSD = grossInvoicedUSD - totalExpensesUSD;
        const netProfitTZS = grossInvoicedTZS - totalExpensesTZS;
        const profitMarginPct = grossInvoicedUSD > 0 ? Math.round((netProfitUSD / grossInvoicedUSD) * 100) : 0;
        const collectionRatePct = grossInvoicedUSD > 0 ? Math.round((totalReceivedUSD / grossInvoicedUSD) * 100) : 0;

        const topDebtClients = Object.values(clientExposureMap)
            .filter(c => c.still_demanded_usd > 0)
            .sort((a, b) => b.still_demanded_usd - a.still_demanded_usd)
            .slice(0, 5);

        return {
            grossInvoicedUSD,
            grossInvoicedTZS,
            totalReceivedUSD,
            totalReceivedTZS,
            stillDemandedUSD,
            stillDemandedTZS,
            totalExpensesUSD,
            totalExpensesTZS,
            netProfitUSD,
            netProfitTZS,
            profitMarginPct,
            collectionRatePct,
            totalInvoicesCount,
            paidInvoicesCount,
            partialInvoicesCount,
            pendingInvoicesCount,
            topDebtClients
        };
    }, [tripSheets, paymentMap]);

    return (
        <div className="p-6 max-w-[1650px] mx-auto space-y-8 min-h-screen bg-slate-50/40">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md">
                            <DollarSign className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Finance & Accounts Overview</h1>
                            <p className="text-xs font-semibold text-slate-500 mt-0.5">
                                Executive command center for billing, collections, still demanded receivables, road disbursements, and operating surplus.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleRefreshAll} 
                        className="h-9 px-3 text-xs font-semibold text-slate-700 gap-1.5 bg-white border-slate-200 hover:bg-slate-50"
                    >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        Refresh Data
                    </Button>
                    <NavLink to="/finance/receivables">
                        <Button size="sm" className="h-9 px-3.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm gap-1.5">
                            <CreditCard className="w-3.5 h-3.5" />
                            Accounts Receivable
                        </Button>
                    </NavLink>
                </div>
            </div>

            {/* Top Financial KPI Row (The Financial Pulse) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Gross Invoiced Revenue */}
                <Card className="border-slate-200/90 shadow-xs bg-white relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600" />
                    <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gross Invoiced Revenue</span>
                            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                                <DollarSign className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-1">
                            <p className="text-2xl font-black text-slate-900 tracking-tight">
                                ${metrics.grossInvoicedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs font-bold text-slate-500 mt-0.5">
                                TSh {metrics.grossInvoicedTZS.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                            <span>Total Billed Invoices</span>
                            <span className="font-bold text-slate-800">{metrics.totalInvoicesCount} invoices</span>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Total Cash Collected */}
                <Card className="border-slate-200/90 shadow-xs bg-white relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                    <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Cash Received</span>
                            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                                <CheckCircle2 className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-1">
                            <p className="text-2xl font-black text-emerald-700 tracking-tight">
                                ${metrics.totalReceivedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs font-bold text-slate-500 mt-0.5">
                                TSh {metrics.totalReceivedTZS.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                            <span>Collection Rate</span>
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                                {metrics.collectionRatePct}% Collected
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                {/* 3. Total Still Demanded (Outstanding Receivables) */}
                <Card className="border-slate-200/90 shadow-xs bg-white relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                    <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Still Demanded (AR)</span>
                            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                                <CreditCard className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-1">
                            <p className="text-2xl font-black text-amber-800 tracking-tight">
                                ${metrics.stillDemandedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs font-bold text-slate-500 mt-0.5">
                                TSh {metrics.stillDemandedTZS.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                            <span>Unpaid / Partial Invoices</span>
                            <span className="font-bold text-amber-900">
                                {metrics.pendingInvoicesCount + metrics.partialInvoicesCount} invoices pending
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* 4. Realized Net Surplus / Margin */}
                <Card className="border-slate-200/90 shadow-xs bg-white relative overflow-hidden">
                    <div className={`absolute top-0 left-0 right-0 h-1 ${metrics.netProfitUSD >= 0 ? 'bg-teal-500' : 'bg-rose-500'}`} />
                    <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Operating Surplus (Margin)</span>
                            <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600">
                                <TrendingUp className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="mt-1">
                            <p className={`text-2xl font-black tracking-tight ${metrics.netProfitUSD >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>
                                ${metrics.netProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs font-bold text-slate-500 mt-0.5">
                                TSh {metrics.netProfitTZS.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </p>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                            <span>Gross Margin</span>
                            <Badge variant="outline" className={`text-[10px] font-bold ${
                                metrics.profitMarginPct >= 20 ? 'bg-teal-50 text-teal-800 border-teal-200' :
                                metrics.profitMarginPct > 0 ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                'bg-rose-50 text-rose-800 border-rose-200'
                            }`}>
                                {metrics.profitMarginPct}% Margin
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Middle Section: Client Debt Watchlist + Quick Actions Command Center */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Client Still Demanded Watchlist (2 cols) */}
                <div className="lg:col-span-2 space-y-4">
                    <Card className="border-slate-200/90 shadow-xs bg-white">
                        <CardHeader className="p-5 pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-indigo-600" />
                                    Client Receivables Watchlist (Still Demanded)
                                </CardTitle>
                                <CardDescription className="text-xs mt-0.5">
                                    Top commercial clients with active unpaid balances requiring collection.
                                </CardDescription>
                            </div>
                            <NavLink to="/finance/receivables">
                                <Button variant="ghost" size="sm" className="text-xs font-bold text-indigo-600 hover:text-indigo-800 gap-1">
                                    View All Receivables <ChevronRight className="w-3.5 h-3.5" />
                                </Button>
                            </NavLink>
                        </CardHeader>
                        <CardContent className="p-0">
                            {metrics.topDebtClients.length === 0 ? (
                                <div className="p-8 text-center text-xs text-slate-400 font-medium">
                                    ✓ No outstanding client debts! All invoiced trips have been settled.
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {metrics.topDebtClients.map((client, idx) => (
                                        <div key={idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xs font-black text-indigo-700">
                                                    {idx + 1}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900">{client.client_name}</p>
                                                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                                                        {client.unpaid_count} pending invoice(s) • Total billed: ${client.total_invoiced_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 sm:justify-end">
                                                <div className="text-right">
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Still Demanded</p>
                                                    <p className="text-base font-black text-amber-900">
                                                        ${client.still_demanded_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </p>
                                                </div>
                                                <NavLink to="/finance/receivables">
                                                    <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs font-bold text-indigo-700 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100">
                                                        Log Payment
                                                    </Button>
                                                </NavLink>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Operational Expenses & Road Advance Pulse */}
                    <Card className="border-slate-200/90 shadow-xs bg-white">
                        <CardHeader className="p-5 pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <Banknote className="w-4 h-4 text-emerald-600" />
                                    Road Advance & Cashier Disbursement Summary
                                </CardTitle>
                                <CardDescription className="text-xs mt-0.5">
                                    Funds released for road tolls, border clearances, escort fees, and fuel vouchers.
                                </CardDescription>
                            </div>
                            <NavLink to="/procurement/cashier-portal">
                                <Button variant="ghost" size="sm" className="text-xs font-bold text-emerald-700 hover:text-emerald-900 gap-1">
                                    Open Cashier Portal <ChevronRight className="w-3.5 h-3.5" />
                                </Button>
                            </NavLink>
                        </CardHeader>
                        <CardContent className="p-5">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Road Advances Disbursed</p>
                                    <p className="text-lg font-black text-slate-900 mt-1">
                                        ${metrics.totalExpensesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                    <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                                        TSh {metrics.totalExpensesTZS.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </p>
                                </div>

                                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Cashier Payment Portal</p>
                                    <p className="text-sm font-bold text-emerald-900 mt-1">
                                        Ready for Driver Requisition & Vouchers
                                    </p>
                                    <NavLink to="/procurement/cashier-portal" className="inline-block mt-2">
                                        <span className="text-[11px] font-black text-emerald-700 hover:underline">
                                            Manage Cashier Payments →
                                        </span>
                                    </NavLink>
                                </div>

                                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Driver Reconciliation Portal</p>
                                    <p className="text-sm font-bold text-blue-900 mt-1">
                                        Compare Budget vs Actual Driver Receipts
                                    </p>
                                    <NavLink to="/logistics/reconciliation" className="inline-block mt-2">
                                        <span className="text-[11px] font-black text-blue-700 hover:underline">
                                            Settle Trip Receipts →
                                        </span>
                                    </NavLink>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Weighbridge Station Real Cashflow Summary */}
                    {stationSummary && (
                        <Card className="border-slate-200/90 shadow-xs bg-white">
                            <CardHeader className="p-5 pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Receipt className="w-4 h-4 text-indigo-600" />
                                        Weighbridge Station Cashier Collections (Live Feed)
                                    </CardTitle>
                                    <CardDescription className="text-xs mt-0.5">
                                        Recorded payments across daily cashier shifts, axle fees, and weighbridge permits.
                                    </CardDescription>
                                </div>
                                <NavLink to="/cashier">
                                    <Button variant="ghost" size="sm" className="text-xs font-bold text-indigo-700 hover:text-indigo-900 gap-1">
                                        Cashier Dashboard <ChevronRight className="w-3.5 h-3.5" />
                                    </Button>
                                </NavLink>
                            </CardHeader>
                            <CardContent className="p-5">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-100">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Total Station Transactions</p>
                                        <p className="text-2xl font-black text-indigo-950 mt-1">
                                            {stationSummary.totalCount.toLocaleString()} weighs
                                        </p>
                                        <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                                            Station Cashier Ledger
                                        </p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-100">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Total Cashier Receipts (TZS)</p>
                                        <p className="text-xl font-black text-emerald-900 mt-1">
                                            TSh {stationSummary.totalAmountTSh.toLocaleString()}
                                        </p>
                                        <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                                            ≈ ${stationSummary.totalAmountUSD.toLocaleString()} USD
                                        </p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Shift Reconciliation</p>
                                        <p className="text-sm font-bold text-slate-800 mt-1">
                                            Day & Night Shift Audits
                                        </p>
                                        <NavLink to="/shifts/summary" className="inline-block mt-2">
                                            <span className="text-[11px] font-black text-indigo-600 hover:underline">
                                                View Shift Summary →
                                            </span>
                                        </NavLink>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Quick Navigation Command Hub (1 col) */}
                <div className="space-y-4">
                    <Card className="border-slate-200/90 shadow-xs bg-white">
                        <CardHeader className="p-5 pb-3 border-b border-slate-100">
                            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                                <Wallet className="w-4 h-4 text-indigo-600" />
                                Finance Quick Navigation
                            </CardTitle>
                            <CardDescription className="text-xs mt-0.5">
                                Direct links to all specialized finance modules.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-3 space-y-1.5">
                            {[
                                { title: "Trip Invoices", desc: "Batch & individual invoice generation", url: "/logistics/invoices", icon: CreditCard, color: "text-indigo-600 bg-indigo-50" },
                                { title: "Accounts Receivable", desc: "Track debt & log installment payments", url: "/finance/receivables", icon: DollarSign, color: "text-emerald-600 bg-emerald-50" },
                                { title: "Trip Reconciliation", desc: "Settle driver physical receipts vs advance", url: "/logistics/reconciliation", icon: FileCheck, color: "text-blue-600 bg-blue-50" },
                                { title: "Cashier Payment Portal", desc: "Disburse approved road funds & vouchers", url: "/procurement/cashier-portal", icon: Banknote, color: "text-amber-600 bg-amber-50" },
                                { title: "Logistics P&L Analytics", desc: "Route & truck gross profit breakdown", url: "/finance-dashboard", icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
                                { title: "Company Expenses", desc: "Manage non-trip operational overheads", url: "/finance/expenses", icon: FileText, color: "text-slate-600 bg-slate-100" },
                                { title: "Payroll Management", desc: "Driver & staff compensation ledger", url: "/finance/payroll", icon: Wallet, color: "text-teal-600 bg-teal-50" },
                                { title: "General Ledger", desc: "Double-entry books and trial balances", url: "/finance/ledger", icon: Scale, color: "text-rose-600 bg-rose-50" },
                            ].map((item, i) => (
                                <NavLink 
                                    key={i} 
                                    to={item.url} 
                                    className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors group border border-transparent hover:border-slate-100"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${item.color}`}>
                                            <item.icon className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{item.title}</p>
                                            <p className="text-[10px] text-slate-500 font-medium">{item.desc}</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition-colors" />
                                </NavLink>
                            ))}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
