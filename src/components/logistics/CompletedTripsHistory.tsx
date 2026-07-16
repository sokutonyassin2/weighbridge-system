import React, { useMemo, useState, Fragment } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
    History, 
    Folders, 
    ChevronDown, 
    ChevronRight, 
    Route as RouteIcon,
    Truck,
    User,
    CreditCard
} from "lucide-react";
import { cn } from "@/lib/utils";

export const CompletedTripsHistory = ({ tripSheets, searchTerm }: { tripSheets: any[], searchTerm: string }) => {
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

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

        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            filtered = filtered.filter(t => 
                (t.reference_number || '').toLowerCase().includes(lowerSearch) ||
                (t.vehicle?.vehicle_no || '').toLowerCase().includes(lowerSearch) ||
                (t.driver?.full_name || '').toLowerCase().includes(lowerSearch) ||
                (t.client_name || '').toLowerCase().includes(lowerSearch)
            );
        }

        return filtered.reduce((acc: any, trip) => {
            const key = trip.client_name || 'Unassigned Client';
            if (!acc[key]) {
                acc[key] = {
                    name: key,
                    trips: [],
                    destinations: [],
                    totals: { revenueUSD: 0, revenueTZS: 0, expensesUSD: 0, expensesTZS: 0, profitUSD: 0, profitTZS: 0 }
                };
            }

            acc[key].trips.push(trip);
            
            if (trip.destination && !acc[key].destinations.includes(trip.destination)) {
                acc[key].destinations.push(trip.destination);
            }

            const rate = parseFloat(trip.exchange_rate) || 2700;
            const revAmt = parseFloat(trip.revenue_amount) || 0;
            const revUSD = trip.revenue_currency === 'USD' ? revAmt : revAmt / rate;
            const revTZS = trip.revenue_currency === 'TZS' ? revAmt : revAmt * rate;
            const expUSD = parseFloat(trip.total_expenses_usd) || 0;
            const expTZS = parseFloat(trip.total_expenses_tzs) || 0;

            acc[key].totals.revenueUSD += revUSD;
            acc[key].totals.revenueTZS += revTZS;
            acc[key].totals.expensesUSD += expUSD;
            acc[key].totals.expensesTZS += expTZS;
            acc[key].totals.profitUSD += (revUSD - expUSD);
            acc[key].totals.profitTZS += revTZS - expTZS;

            return acc;
        }, {} as Record<string, any>);
    }, [tripSheets, searchTerm]);

    const hasTrips = Object.keys(groupedCompletedTrips).length > 0;

    return (
        <div className="space-y-6">
            <Card className="border border-slate-200 shadow-xl bg-white overflow-hidden rounded-2xl">
                <CardHeader className="bg-slate-50 border-b p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                                <History size={18} className="text-slate-500" />
                                COMPLETED TRIPS ARCHIVE
                            </CardTitle>
                            <CardDescription className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">
                                Search by plate number to view full vehicle history
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
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
                            {!hasTrips ? (
                                <TableRow><TableCell colSpan={5} className="text-center py-24">
                                    <div className="flex flex-col items-center justify-center">
                                        <div className="h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center mb-6 border border-slate-100">
                                            <History className="h-10 w-10 text-slate-300" />
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-900 mb-2">No Completed Trips Yet</h3>
                                        <p className="text-slate-500 max-w-md mx-auto text-sm">
                                            Trips will automatically appear here once they are finalized.
                                        </p>
                                    </div>
                                </TableCell></TableRow>
                            ) : (
                                Object.entries(groupedCompletedTrips).map(([groupKey, group]: [string, any]) => {
                                    const isExpanded = expandedGroups.includes(groupKey);

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
                                                                <div className="flex items-center gap-6 ml-auto pl-6 border-l border-slate-200 hidden xl:flex">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Gross Revenue</span>
                                                                        <div className="flex items-baseline gap-2">
                                                                            <span className="text-sm font-black text-orange-600">{formatTSh(group.totals.revenueTZS)}</span>
                                                                            <span className="text-[10px] font-bold text-slate-400">${group.totals.revenueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Expenses</span>
                                                                        <div className="flex items-baseline gap-2">
                                                                            <span className="text-sm font-black text-rose-600">{formatTSh(group.totals.expensesTZS)}</span>
                                                                            <span className="text-[10px] font-bold text-slate-400">${group.totals.expensesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Expected Surplus</span>
                                                                        <div className="flex items-baseline gap-2">
                                                                            <span className={cn("text-sm font-black", group.totals.profitTZS >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                                                                {formatTSh(group.totals.profitTZS)}
                                                                            </span>
                                                                            <span className="text-[10px] font-bold text-slate-400">${group.totals.profitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell />
                                            </TableRow>

                                            {isExpanded && (
                                                <TableRow className="bg-slate-50/30 hover:bg-slate-50/30 transition-none border-none">
                                                    <TableCell colSpan={5} className="p-4 bg-slate-50/50">
                                                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                                            {group.trips.map((trip: any, tIndex: number) => {
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
                                                                        {/* Left Decoration - Gray for Completed */}
                                                                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-slate-400" />

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
                                                                                    <Badge className="bg-slate-100 text-slate-600 border-slate-200 gap-1 hover:bg-slate-200">
                                                                                        <History size={10} /> COMPLETED
                                                                                    </Badge>
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
        </div>
    );
};
