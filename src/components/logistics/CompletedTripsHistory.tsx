import React, { useMemo, useState } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
    History, 
    ChevronDown, 
    ChevronRight, 
    Route as RouteIcon,
    Truck,
    User,
    CreditCard,
    CheckCircle2,
    ArrowRight,
    Eye,
    Copy,
    Check,
    Calendar,
    Search,
    X,
    Layers,
    Building2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CompletedTripsHistoryProps {
    tripSheets: any[];
    searchTerm?: string;
    onSelectTrip?: (trip: any) => void;
}

export const CompletedTripsHistory: React.FC<CompletedTripsHistoryProps> = ({ 
    tripSheets, 
    searchTerm: externalSearchTerm = '', 
    onSelectTrip 
}) => {
    const [localSearch, setLocalSearch] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
    const [copiedRef, setCopiedRef] = useState<string | null>(null);

    const activeSearch = (externalSearchTerm || localSearch).trim().toLowerCase();

    const copyToClipboard = (text: string, label: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedRef(text);
        toast.success(`${label} copied to clipboard: ${text}`);
        setTimeout(() => setCopiedRef(null), 2500);
    };

    const toggleGroup = (groupKey: string) => {
        setExpandedGroups(prev => 
            prev.includes(groupKey) ? prev.filter(k => k !== groupKey) : [...prev, groupKey]
        );
    };

    const formatTSh = (val: any) => {
        if (!val) return "TShs. 0";
        return `TShs. ${parseFloat(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    };

    const groupedCompletedTrips = useMemo(() => {
        if (!tripSheets) return {};

        // Only include Completed trips
        let filtered = tripSheets.filter(t => t.status === 'Completed');

        if (activeSearch) {
            filtered = filtered.filter(t => 
                (t.reference_number || '').toLowerCase().includes(activeSearch) ||
                (t.vehicle?.vehicle_no || '').toLowerCase().includes(activeSearch) ||
                (t.trailer?.vehicle_no || t.trailer_reg || '').toLowerCase().includes(activeSearch) ||
                (t.driver?.full_name || '').toLowerCase().includes(activeSearch) ||
                (t.client_name || '').toLowerCase().includes(activeSearch) ||
                (t.destination || '').toLowerCase().includes(activeSearch) ||
                (t.origin || '').toLowerCase().includes(activeSearch) ||
                (t.invoice_no || '').toLowerCase().includes(activeSearch)
            );
        }

        return filtered.reduce((acc: any, trip) => {
            const clientKey = trip.client_name || 'Individual / Unassigned';
            if (!acc[clientKey]) {
                acc[clientKey] = {
                    name: clientKey,
                    trips: [],
                    destinations: [],
                    totals: { revenueUSD: 0, revenueTZS: 0, expensesUSD: 0, expensesTZS: 0, profitUSD: 0, profitTZS: 0 }
                };
            }

            acc[clientKey].trips.push(trip);
            
            if (trip.destination && !acc[clientKey].destinations.includes(trip.destination)) {
                acc[clientKey].destinations.push(trip.destination);
            }

            const rate = parseFloat(trip.exchange_rate) || 2700;
            const revAmt = parseFloat(trip.revenue_amount) || 0;
            const revUSD = trip.revenue_currency === 'USD' ? revAmt : revAmt / rate;
            const revTZS = trip.revenue_currency === 'TZS' ? revAmt : revAmt * rate;
            const expUSD = parseFloat(trip.total_expenses_usd) || 0;
            const expTZS = parseFloat(trip.total_expenses_tzs) || 0;

            acc[clientKey].totals.revenueUSD += revUSD;
            acc[clientKey].totals.revenueTZS += revTZS;
            acc[clientKey].totals.expensesUSD += expUSD;
            acc[clientKey].totals.expensesTZS += expTZS;
            acc[clientKey].totals.profitUSD += (revUSD - expUSD);
            acc[clientKey].totals.profitTZS += revTZS - expTZS;

            return acc;
        }, {} as Record<string, any>);
    }, [tripSheets, activeSearch]);

    const clientKeys = Object.keys(groupedCompletedTrips);
    const hasTrips = clientKeys.length > 0;
    const totalCompletedTrips = useMemo(() => {
        return Object.values(groupedCompletedTrips).reduce((sum: number, g: any) => sum + g.trips.length, 0);
    }, [groupedCompletedTrips]);

    const isAllExpanded = clientKeys.length > 0 && clientKeys.every(k => expandedGroups.includes(k));

    const handleToggleAll = () => {
        if (isAllExpanded) {
            setExpandedGroups([]);
        } else {
            setExpandedGroups(clientKeys);
        }
    };

    return (
        <div className="space-y-4">
            {/* ── Operations Control Toolbar (Matches Active Operations) ── */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                        placeholder="Search completed trip #, plate, driver, client, invoice..."
                        className="pl-9 pr-8 h-9 bg-slate-50 border-slate-200 focus:bg-white text-xs font-medium rounded-xl"
                        value={localSearch || externalSearchTerm}
                        onChange={(e) => setLocalSearch(e.target.value)}
                    />
                    {(localSearch || externalSearchTerm) && (
                        <button
                            type="button"
                            onClick={() => setLocalSearch("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>

                {/* Status Indicator & Total Counter */}
                <div className="flex items-center gap-2 overflow-x-auto">
                    <div className="h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-slate-900 text-white flex items-center gap-1.5 shadow-xs whitespace-nowrap">
                        <CheckCircle2 size={12} className="text-emerald-400" />
                        <span>Completed Archive ({totalCompletedTrips})</span>
                    </div>
                    <Badge variant="outline" className="h-8 px-3 rounded-lg text-[11px] font-bold border-slate-200 text-slate-600 bg-slate-50 whitespace-nowrap">
                        {clientKeys.length} {clientKeys.length === 1 ? 'Client' : 'Clients'}
                    </Badge>
                </div>

                {/* Expand All / Collapse All Toggle */}
                <div className="flex items-center gap-2 ml-auto lg:ml-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleToggleAll}
                        className="h-8 px-3 text-xs font-bold text-slate-600 border-slate-200 hover:bg-slate-50 gap-1.5 rounded-xl"
                    >
                        <Layers size={13} className="text-slate-400" />
                        <span>{isAllExpanded ? "Collapse All" : "Expand All"}</span>
                    </Button>
                </div>
            </div>

            {/* ── Content List ── */}
            {!hasTrips ? (
                <Card className="border border-slate-200 bg-white p-16 rounded-2xl text-center shadow-xs">
                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <History size={28} className="text-slate-400" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                        No Completed Transit Operations Found
                    </h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 font-medium">
                        {activeSearch
                            ? "No archived trips match your search keywords. Try adjusting your query."
                            : "Trips that are closed and finalized in Active Operations will automatically appear here."}
                    </p>
                    {activeSearch && (
                        <div className="mt-5 flex items-center justify-center">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setLocalSearch("")}
                                className="h-9 px-4 text-xs font-bold rounded-xl"
                            >
                                Clear Search
                            </Button>
                        </div>
                    )}
                </Card>
            ) : (
                <div className="space-y-4">
                    {Object.entries(groupedCompletedTrips).map(([clientName, group]: [string, any]) => {
                        const isExpanded = expandedGroups.includes(clientName);

                        return (
                            <Card
                                key={clientName}
                                className="border border-slate-200 bg-white shadow-xs rounded-2xl overflow-hidden transition-all duration-200"
                            >
                                {/* Client Header Card (Matches Active Operations) */}
                                <div
                                    onClick={() => toggleGroup(clientName)}
                                    className="p-4 sm:p-5 bg-gradient-to-r from-slate-50/90 via-white to-slate-50/50 hover:from-slate-100/90 hover:to-slate-100/60 border-b border-slate-200 cursor-pointer transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 select-none"
                                >
                                    <div className="flex items-center gap-3.5 flex-1">
                                        <div className="text-slate-400 transition-transform duration-200">
                                            {isExpanded ? <ChevronDown size={20} className="text-slate-700" /> : <ChevronRight size={20} />}
                                        </div>

                                        <div className="p-2.5 bg-slate-800 text-white rounded-xl shadow-xs">
                                            <Building2 size={18} />
                                        </div>

                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-base font-black text-slate-900 tracking-tight uppercase">
                                                    {clientName}
                                                </h3>
                                                <Badge className="bg-slate-800 text-white text-[10px] font-black border-none px-2 h-5 rounded-md">
                                                    {group.trips.length} {group.trips.length === 1 ? 'Trip' : 'Trips'} Completed
                                                </Badge>
                                            </div>
                                            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                                                {isExpanded ? "Click to collapse archived trip details" : "Click to expand completed vehicle records & financial summary"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Client Totals Strip */}
                                    <div className="flex items-center gap-4 sm:gap-6 flex-wrap sm:flex-nowrap pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-200">
                                        <div className="space-y-0.5">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Contracted Revenue</span>
                                            <div className="text-sm font-black text-orange-600 leading-none">
                                                {formatTSh(group.totals.revenueTZS)}
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400 block">
                                                ${group.totals.revenueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>

                                        <div className="space-y-0.5 pl-4 border-l border-slate-200">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Expenses</span>
                                            <div className="text-sm font-black text-rose-600 leading-none">
                                                {formatTSh(group.totals.expensesTZS)}
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400 block">
                                                ${group.totals.expensesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>

                                        <div className="space-y-0.5 pl-4 border-l border-slate-200">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Realized Surplus</span>
                                            <div className={cn("text-sm font-black leading-none", group.totals.profitTZS >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                                {formatTSh(group.totals.profitTZS)}
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400 block">
                                                ${group.totals.profitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Trip Cards List (Matches Active Operations cards) */}
                                {isExpanded && (
                                    <div className="p-4 sm:p-5 bg-slate-50/40 space-y-3">
                                        {group.trips.map((trip: any, tIndex: number) => {
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
                                                    {/* Status Accent Bar - Slate/Emerald for Completed */}
                                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-slate-500" />

                                                    {/* 1. Vehicle & Identity */}
                                                    <div className="flex items-start gap-3.5 flex-1 min-w-[280px]">
                                                        <div className="text-[10px] font-black text-slate-300 tabular-nums mt-1">
                                                            {(tIndex + 1).toString().padStart(2, '0')}
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-black text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
                                                                    <Truck size={14} className="text-slate-600" />
                                                                    {trip.vehicle?.vehicle_no || "HORSE"}
                                                                </span>
                                                                {trip.trailer_id && trip.trailer_id !== 'none' && (
                                                                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                                                        / {trip.trailer?.vehicle_no || trip.trailer_reg || 'TRAILER'}
                                                                    </span>
                                                                )}
                                                                <Badge className="bg-slate-100 text-slate-700 border-slate-200 gap-1 text-[10px] font-black px-2 py-0.5">
                                                                    <CheckCircle2 size={10} className="text-emerald-600" />
                                                                    COMPLETED
                                                                </Badge>
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

                                                                {/* Reference with copy */}
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
                                                                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-bold text-slate-700">
                                                                            <CreditCard size={10} className="text-slate-500" />
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
                                                                    <RouteIcon size={12} className="text-slate-500" />
                                                                    <span>{trip.origin || 'DAR ES SALAAM'}</span>
                                                                    <ArrowRight size={10} className="text-slate-400" />
                                                                    <span className="text-slate-900">{trip.destination || 'DESTINATION'}</span>
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

                                                    {/* 3. Action Buttons */}
                                                    <div className="flex items-center gap-2 pl-0 xl:pl-4 border-t xl:border-t-0 xl:border-l border-slate-100 pt-3 xl:pt-0 w-full xl:w-auto flex-wrap sm:flex-nowrap justify-end">
                                                        {onSelectTrip && (
                                                            <Button
                                                                size="sm"
                                                                className="h-8 px-3.5 rounded-lg font-black text-[10px] uppercase tracking-wider bg-slate-900 text-white hover:bg-indigo-600 shadow-xs transition-all gap-1.5"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onSelectTrip(trip);
                                                                }}
                                                            >
                                                                <Eye size={12} />
                                                                View Sheet
                                                            </Button>
                                                        )}
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
    );
};
