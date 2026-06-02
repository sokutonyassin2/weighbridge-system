import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, Truck, Calendar, History, ArrowRight } from "lucide-react";

export const CompletedTripsHistory = ({ tripSheets, searchTerm }: { tripSheets: any[], searchTerm: string }) => {
    // Only completed trips
    const completedTrips = useMemo(() => {
        if (!tripSheets) return [];
        return tripSheets.filter(t => t.status === 'Completed');
    }, [tripSheets]);

    // Apply search filter
    const filteredTrips = useMemo(() => {
        return completedTrips.filter(trip => 
            (trip.reference_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (trip.vehicle?.vehicle_no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (trip.driver?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (trip.client_name || '').toLowerCase().includes(searchTerm.toLowerCase())
        ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [completedTrips, searchTerm]);

    const formatTSh = (val: any) => {
        if (!val) return "TShs. 0";
        return `TShs. ${parseFloat(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    };

    if (completedTrips.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center mb-6 border border-slate-100">
                    <History className="h-10 w-10 text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">No Completed Trips Yet</h3>
                <p className="text-slate-500 max-w-md mx-auto text-sm">
                    Once a vehicle fully completes its journey, it will be moved here for historical tracking.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="border-none shadow-xl bg-white ring-1 ring-slate-200 overflow-hidden rounded-2xl">
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
                        <Badge className="bg-slate-900 text-white font-bold px-3 py-1 text-xs">{filteredTrips.length} Records</Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-50/50">
                                <TableRow>
                                    <TableHead className="w-[200px] text-[10px] font-bold text-slate-500 uppercase tracking-wider py-4 px-6">Vehicle & Date</TableHead>
                                    <TableHead className="text-[10px] font-bold text-slate-500 uppercase tracking-wider py-4">Route & Cargo</TableHead>
                                    <TableHead className="text-[10px] font-bold text-slate-500 uppercase tracking-wider py-4">Trip Ref</TableHead>
                                    <TableHead className="text-[10px] font-bold text-slate-500 uppercase tracking-wider py-4 text-right px-6">Revenue & Days</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredTrips.map((trip) => (
                                    <TableRow key={trip.id} className="hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="py-5 px-6 align-top">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2">
                                                    <Truck size={14} className="text-slate-400" />
                                                    <span className="font-bold text-slate-900 text-sm">{trip.vehicle?.vehicle_no || 'Unknown'}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <Calendar size={12} />
                                                    <span className="text-xs font-medium">
                                                        {new Date(trip.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </span>
                                                </div>
                                                <Badge variant="outline" className="w-fit text-[9px] uppercase tracking-wider text-slate-500 border-slate-200 mt-1 font-bold">
                                                    {trip.journey_type}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-5 align-top">
                                            <div className="space-y-3">
                                                {/* Outbound */}
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <MapPin size={12} className="text-blue-500" />
                                                        <span className="text-xs font-bold text-slate-700">
                                                            {trip.origin} <ArrowRight size={10} className="inline mx-1 text-slate-400" /> {trip.destination}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 ml-5"><span className="font-semibold text-slate-600">Cargo:</span> {trip.cargo_outbound || 'N/A'}</p>
                                                </div>
                                                
                                                {/* Return if exists */}
                                                {trip.journey_type?.includes('Go & Return') && (
                                                    <div className="pt-2 border-t border-slate-100 border-dashed">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <MapPin size={12} className="text-indigo-500" />
                                                            <span className="text-xs font-bold text-slate-700">
                                                                {trip.destination} <ArrowRight size={10} className="inline mx-1 text-slate-400" /> {trip.origin}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 ml-5"><span className="font-semibold text-slate-600">Return Cargo:</span> {trip.return_cargo || 'N/A'}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-5 align-top">
                                            <div className="flex flex-col gap-2">
                                                <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded w-fit border border-slate-200">
                                                    {trip.reference_number || trip.trip_number}
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{trip.client_name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-5 px-6 align-top text-right">
                                            <div className="flex flex-col items-end gap-1.5">
                                                <span className="text-sm font-black text-emerald-600">
                                                    {trip.revenue_currency === 'USD' ? `$${parseFloat(trip.revenue_amount || 0).toLocaleString()} USD` : formatTSh(trip.revenue_amount)}
                                                </span>
                                                {trip.journey_type?.includes('Go & Return') && trip.return_revenue_amount && (
                                                    <span className="text-xs font-bold text-indigo-600">
                                                        + {trip.return_revenue_currency === 'USD' ? `$${parseFloat(trip.return_revenue_amount).toLocaleString()} USD` : formatTSh(trip.return_revenue_amount)} <span className="text-[9px] uppercase tracking-wider opacity-60">(Return)</span>
                                                    </span>
                                                )}
                                                <div className="mt-2 flex items-center justify-end gap-1.5 bg-slate-100 px-2.5 py-1 rounded-full w-fit">
                                                    <ClockIcon className="w-3 h-3 text-slate-500" />
                                                    <span className="text-[10px] font-bold text-slate-600">{trip.agreed_days || 0} Days</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

function ClockIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    )
}
