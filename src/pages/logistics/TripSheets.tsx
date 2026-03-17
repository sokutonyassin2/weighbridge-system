import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    Search,
    DollarSign,
    FileText,
    TrendingUp,
    TrendingDown,
    Calendar,
    ArrowRight,
    Map,
    Plus,
    Truck,
    AlertTriangle
} from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { TripSheet } from "@/components/logistics/TripSheet";

const TripSheets = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedTrip, setSelectedTrip] = useState<any>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    const { data: tripSheets, isLoading, isError, error: queryError } = useQuery({
        queryKey: ["logistics_trip_sheets_list"],
        queryFn: async () => {
            try {
                const { data, error } = await supabase
                    .from("logistics_trip_sheets")
                    .select(`
                        *,
                        vehicle:vehicle_id(vehicle_no, fleet_category),
                        driver:driver_id(full_name),
                        expenses:logistics_trip_expenses(*)
                    `)
                    .order("created_at", { ascending: false });

                if (error) throw error;
                return (data || []) as any[];
            } catch (err) {
                console.error("Detailed query catch:", err);
                throw err;
            }
        }
    });

    const filteredSheets = tripSheets?.filter(trip =>
        trip.trip_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.vehicle?.vehicle_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.driver?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.destination?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const stats = {
        totalRevenueUSD: tripSheets?.reduce((sum, t) => sum + (t.revenue_currency === 'USD' ? (t.revenue_amount || 0) : 0), 0) || 0,
        totalRevenueTZS: tripSheets?.reduce((sum, t) => sum + (t.revenue_currency === 'TZS' ? (t.revenue_amount || 0) : 0), 0) || 0,
        totalExpensesUSD: tripSheets?.reduce((sum, t) => sum + (t.total_expenses_usd || 0), 0) || 0,
        totalExpensesTZS: tripSheets?.reduce((sum, t) => sum + (t.total_expenses_tzs || 0), 0) || 0,
        totalProfitUSD: tripSheets?.reduce((sum, t) => sum + (t.net_profit_usd || 0), 0) || 0
    };

    if (isSheetOpen) {
        return (
            <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            {selectedTrip ? `Edit Trip Sheet: ${selectedTrip.trip_number}` : "New Trip Sheet Plan"}
                        </h1>
                        <p className="text-muted-foreground">
                            {selectedTrip ? `Managing financials for ${selectedTrip.vehicle?.vehicle_no}` : "Configure assets and financials for a new transit trip."}
                        </p>
                    </div>
                    <Button variant="ghost" onClick={() => setIsSheetOpen(false)} className="gap-2">
                        Back to Trip Sheets
                    </Button>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-1">
                    <TripSheet
                        tripId={selectedTrip?.id}
                        onSaveSuccess={() => {
                            setIsSheetOpen(false);
                        }}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Trip Sheets & Financials</h1>
                    <p className="text-muted-foreground">Monitor revenue, expenses, and net profit per trip.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search trip, vehicle, or driver..."
                            className="pl-9 h-10 bg-white"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button className="gap-2 bg-primary" onClick={() => {
                        setSelectedTrip(null);
                        setIsSheetOpen(true);
                    }}>
                        <Plus size={16} />
                        Create New Trip Sheet
                    </Button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
                    <CardHeader className="py-4">
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-indigo-600">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                        <div className="text-xl font-bold font-mono text-indigo-700">${stats.totalRevenueUSD.toLocaleString()}</div>
                        <div className="text-sm font-medium text-indigo-400">TSh {stats.totalRevenueTZS.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-orange-50 to-white border-orange-100">
                    <CardHeader className="py-4">
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-orange-600">Total Operational Cost</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                        <div className="text-xl font-bold font-mono text-orange-700">${stats.totalExpensesUSD.toLocaleString()}</div>
                        <div className="text-sm font-medium text-orange-400">TSh {stats.totalExpensesTZS.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card className={`bg-gradient-to-br ${stats.totalProfitUSD >= 0 ? 'from-emerald-50 to-white border-emerald-100' : 'from-red-50 to-white border-red-100'}`}>
                    <CardHeader className="py-4">
                        <CardTitle className={`text-xs font-bold uppercase tracking-wider ${stats.totalProfitUSD >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Expected Net Profit (USD)</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                        <div className={`text-2xl font-bold ${stats.totalProfitUSD >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            ${stats.totalProfitUSD.toLocaleString()}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-none shadow-sm bg-white overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow>
                            <TableHead className="font-bold">Trip Details</TableHead>
                            <TableHead className="font-bold">Vehicle & Driver</TableHead>
                            <TableHead className="font-bold">Revenue Type</TableHead>
                            <TableHead className="font-bold text-right">Revenue</TableHead>
                            <TableHead className="font-bold text-right">Expenses</TableHead>
                            <TableHead className="font-bold text-right">Net Profit</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-20">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                                    <p className="text-sm text-muted-foreground font-medium">Loading financial records...</p>
                                </div>
                            </TableCell></TableRow>
                        ) : isError ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-20">
                                <div className="flex flex-col items-center gap-2 text-red-500">
                                    <AlertTriangle size={32} />
                                    <p className="font-bold">Failed to load trip records</p>
                                    <p className="text-sm text-red-400">{(queryError as any)?.message || "Internal server error"}</p>
                                </div>
                            </TableCell></TableRow>
                        ) : (!filteredSheets || filteredSheets.length === 0) ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-20">
                                <div className="flex flex-col items-center gap-4 max-w-sm mx-auto">
                                    <div className="p-4 bg-slate-100 rounded-full text-slate-400">
                                        <Truck size={40} />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="font-bold text-lg">No Transit Plans Found</h3>
                                        <p className="text-sm text-muted-foreground">
                                            No pro-forma trip sheets found for Transit vehicles. Click the button above to create your first plan.
                                        </p>
                                    </div>
                                    <Button className="mt-2" onClick={() => {
                                        setSelectedTrip(null);
                                        setIsSheetOpen(true);
                                    }}>
                                        <Plus size={16} className="mr-2" />
                                        Create Your First Trip Sheet
                                    </Button>
                                </div>
                            </TableCell></TableRow>
                        ) : filteredSheets?.map((trip) => {
                            const isProfit = (trip.net_profit || 0) >= 0;

                            return (
                                <TableRow key={trip.id} className="hover:bg-slate-50/50 transition-colors">
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-primary">{trip.trip_number}</span>
                                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                <span>{trip.origin}</span>
                                                <ArrowRight size={10} />
                                                <span>{trip.destination}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{trip.vehicle?.vehicle_no}</span>
                                            <span className="text-xs text-muted-foreground">{trip.driver?.full_name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {trip.revenue_type ? (
                                            <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                                                {trip.revenue_type}
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">Not set</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        <div className="flex flex-col items-end">
                                            <span className="font-bold">{trip.revenue_currency === 'USD' ? '$' : 'TSh '}{trip.revenue_amount?.toLocaleString() || '—'}</span>
                                            <span className="text-[10px] text-muted-foreground uppercase">{trip.revenue_type}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        <div className="flex flex-col items-end text-orange-600">
                                            <span>${trip.total_expenses_usd?.toLocaleString() || '0'}</span>
                                            <span className="text-[10px]">TSh {trip.total_expenses_tzs?.toLocaleString() || '0'}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className={`flex flex-col items-end ${isProfit ? 'text-emerald-600' : 'text-red-600'}`}>
                                            <span className="font-bold">${(trip.net_profit_usd || 0).toLocaleString()}</span>
                                            <span className="text-[10px] flex items-center gap-0.5 uppercase tracking-tighter">
                                                {isProfit ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                                {isProfit ? 'Profit' : 'Loss'}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 gap-2 border-primary/20 hover:bg-primary/10 hover:text-primary"
                                            onClick={() => {
                                                setSelectedTrip(trip);
                                                setIsSheetOpen(true);
                                            }}
                                        >
                                            <DollarSign size={14} />
                                            Manage
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </Card>
        </div >
    );
};

export default TripSheets;
