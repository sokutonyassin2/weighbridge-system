import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
    Truck, Users, Map, Activity, Clock, Plus, Trash2, Settings, FileText, 
    CheckCircle, AlertTriangle, DollarSign, TrendingUp, CreditCard, 
    ExternalLink, ShieldCheck, ArrowRight, Gauge, Fuel, Navigation, 
    ChevronRight, Layers, Bell, CheckCircle2, Package, Sparkles, Wrench
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Cell, PieChart, Pie, Legend
} from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

const LogisticsDashboard = () => {
    const navigate = useNavigate();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Fetch live statistics
    const { data: fleetCount } = useQuery({
        queryKey: ["fleet_count"],
        queryFn: async () => {
            const { count } = await (supabase
                .from("logistics_fleet" as any)
                .select("*", { count: 'exact', head: true }) as any)
                .eq("is_active", true);
            return count || 0;
        }
    });

    const { data: driverCount } = useQuery({
        queryKey: ["driver_count"],
        queryFn: async () => {
            const { count } = await (supabase
                .from("logistics_drivers" as any)
                .select("*", { count: 'exact', head: true }) as any)
                .eq("is_active", true);
            return count || 0;
        }
    });

    const { data: activeTripsCount } = useQuery({
        queryKey: ["active_trips_count"],
        queryFn: async () => {
            const { count } = await (supabase
                .from("logistics_trips" as any)
                .select("*", { count: 'exact', head: true }) as any)
                .not("status", "in", "('Completed', 'Cancelled')");
            return count || 0;
        }
    });

    // Real Fleet Health Query (Active vs In Garage / Maintenance)
    const { data: fleetHealthStats } = useQuery({
        queryKey: ["logistics_fleet_health_real"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_fleet" as any)
                .select("id, vehicle_no, asset_status, assignment_status, is_active");
            const activeFleet = (data || []).filter((v: any) => v.is_active !== false);
            const total = activeFleet.length;
            const inMaintenance = activeFleet.filter((v: any) => v.asset_status === 'Maintenance').length;
            const operational = total - inMaintenance;
            const healthPercent = total > 0 ? Math.round((operational / total) * 100) : 100;
            return { total, operational, inMaintenance, healthPercent };
        },
        refetchInterval: 10000
    });

    // Live Trip Pipeline Stats
    const { data: pipelineStats } = useQuery({
        queryKey: ["logistics_pipeline_stats_live"],
        queryFn: async () => {
            const { data: orders } = await supabase
                .from("logistics_trip_orders" as any)
                .select("id, status, garage_readiness, payment_status");
            const { data: trips } = await supabase
                .from("logistics_trips" as any)
                .select("id, status");
            
            const totalOrders = orders?.length || 0;
            const inGarage = orders?.filter((o: any) => o.garage_readiness === 'Pending' || o.status === 'In Garage').length || 0;
            const pendingOrders = orders?.filter((o: any) => o.status === 'Pending' || o.status === 'Submitted').length || 0;
            const inTransit = trips?.filter((t: any) => !['Completed', 'Cancelled'].includes(t.status)).length || 0;
            const completed = trips?.filter((t: any) => t.status === 'Completed').length || 0;

            return { totalOrders, inGarage, pendingOrders, inTransit, completed };
        },
        refetchInterval: 10000
    });

    const { data: recentActivity } = useQuery({
        queryKey: ["logistics_activity"],
        queryFn: async () => {
            const { data } = await supabase
                .from("logistics_audit_logs" as any)
                .select("*")
                .order("created_at", { ascending: false })
                .limit(5);
            return data || [];
        }
    });

    // Fetch Fleet Status Distribution
    const { data: fleetStatusData } = useQuery({
        queryKey: ["fleet_status_distribution"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_fleet" as any)
                .select("assignment_status");

            if (error) throw error;

            const statusCounts: Record<string, number> = {};
            data.forEach((item: any) => {
                const status = item.assignment_status || 'Unassigned';
                statusCounts[status] = (statusCounts[status] || 0) + 1;
            });

            return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
        }
    });

    // Fetch Driver Availability Distribution
    const { data: driverStatusData } = useQuery({
        queryKey: ["driver_status_distribution"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_drivers" as any)
                .select("assigned_vehicle_id");

            if (error) throw error;

            let assignedCount = 0;
            let unassignedCount = 0;

            data.forEach((item: any) => {
                if (item.assigned_vehicle_id) assignedCount++;
                else unassignedCount++;
            });

            return [
                { name: 'Available', value: unassignedCount },
                { name: 'Assigned', value: assignedCount }
            ];
        }
    });

    const COLORS = ['#4f46e5', '#3b82f6', '#f59e0b', '#ef4444', '#64748b'];

    // Fetch Fuel Efficiency Data
    const { data: fuelStats } = useQuery({
        queryKey: ["fuel_efficiency_stats"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_trips" as any)
                .select(`
                    id, 
                    trip_number,
                    starting_km, 
                    closing_km, 
                    actual_fuel_liters,
                    vehicle:logistics_fleet!vehicle_id(vehicle_no)
                `)
                .eq("status", "Completed")
                .not("actual_fuel_liters", "is", null)
                .order("completion_date", { ascending: false })
                .limit(20);

            if (error) throw error;

            return data.map((trip: any) => {
                const distance = (trip.closing_km || 0) - (trip.starting_km || 0);
                const efficiency = trip.actual_fuel_liters > 0 ? (distance / trip.actual_fuel_liters) : 0;
                return {
                    trip: trip.trip_number,
                    vehicle: trip.vehicle?.vehicle_no || "Unknown",
                    efficiency: parseFloat(efficiency.toFixed(2)),
                    distance: distance
                };
            }).filter(d => d.efficiency > 0);
        }
    });

    // Fetch Financial Statistics
    const { data: financialStats } = useQuery({
        queryKey: ["logistics_financial_stats"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_trip_sheets" as any)
                .select("revenue_amount, revenue_currency, return_revenue_amount, return_revenue_currency, exchange_rate, total_expenses_tzs, total_expenses_usd, status")
                .eq("status", "Approved");
            
            if (error) throw error;
            
            let totalRevTzs = 0;
            let totalExpTzs = 0;
            let totalRevUsd = 0;
            let totalExpUsd = 0;
            
            data.forEach((trip: any) => {
                const rate = trip.exchange_rate || 2700;
                
                // Outbound Revenue
                const outRevAmt = parseFloat(trip.revenue_amount) || 0;
                const outRevTzs = trip.revenue_currency === 'TZS' ? outRevAmt : outRevAmt * rate;
                const outRevUsd = trip.revenue_currency === 'USD' ? outRevAmt : outRevAmt / rate;

                // Return Revenue
                const retRevAmt = parseFloat(trip.return_revenue_amount) || 0;
                const retRevTzs = trip.return_revenue_currency === 'TZS' ? retRevAmt : retRevAmt * rate;
                const retRevUsd = trip.return_revenue_currency === 'USD' ? retRevAmt : retRevAmt / rate;
                
                const expTzs = parseFloat(trip.total_expenses_tzs) || 0;
                const expUsd = parseFloat(trip.total_expenses_usd) || 0;
                
                totalRevTzs += (outRevTzs + retRevTzs);
                totalExpTzs += expTzs;
                totalRevUsd += (outRevUsd + retRevUsd);
                totalExpUsd += expUsd;
            });
            
            return {
                totalRevenue: totalRevTzs,
                totalExpenses: totalExpTzs,
                profit: totalRevTzs - totalExpTzs,
                totalRevenueUSD: totalRevUsd,
                totalExpensesUSD: totalExpUsd,
                profitUSD: totalRevUsd - totalExpUsd
            };
        },
        refetchInterval: 5000
    });

    const formatTSh = (val: any) => {
        if (val === undefined || val === null || isNaN(val)) return "TShs. 0";
        return `TShs. ${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    };

    const formatUsd = (val: any) => {
        if (val === undefined || val === null || isNaN(val)) return "$ 0.00";
        return `$ ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
        <div className="space-y-6 animate-fade-in p-4 md:p-6 bg-slate-50/50 min-h-screen">
            {/* EXECUTIVE HEADER BANNER */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
                <div className="flex items-center gap-3.5">
                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-600 shadow-xs">
                        <Truck className="w-7 h-7" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Logistics Command Center</h1>
                            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-bold px-2 py-0.5">
                                Live Operations
                            </Badge>
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                            End-to-end trip dispatch, real-time vehicle transit, driver allocations, and freight finances.
                        </p>
                    </div>
                </div>

                {/* Quick Primary Actions */}
                <div className="flex items-center gap-2.5 flex-wrap">
                    <Button
                        variant="outline"
                        onClick={() => navigate("/logistics/orders")}
                        className="border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs h-10 px-3.5 rounded-xl gap-2 shadow-xs"
                    >
                        <Bell className="w-4 h-4 text-purple-600" />
                        <span>Nominate to Garage</span>
                        {(pipelineStats?.inGarage || 0) > 0 && (
                            <Badge className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0 border-none">
                                {pipelineStats?.inGarage}
                            </Badge>
                        )}
                    </Button>
                    <Button
                        onClick={() => navigate("/logistics/orders")}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-10 px-4 rounded-xl shadow-md shadow-indigo-100 gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        <span>New Trip Order</span>
                    </Button>
                </div>
            </div>

            {/* UNIFIED LOGISTICS OPERATIONS NAVIGATION RIBBON */}
            <div className="bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => navigate("/logistics/orders")} 
                        className="text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 font-bold text-xs h-8 px-3 rounded-lg gap-1.5"
                    >
                        <Package className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Trip Orders</span>
                        {(pipelineStats?.pendingOrders || 0) > 0 && (
                            <Badge className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0 border-none">
                                {pipelineStats?.pendingOrders}
                            </Badge>
                        )}
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => navigate("/logistics/trips")} 
                        className="text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 font-bold text-xs h-8 px-3 rounded-lg gap-1.5"
                    >
                        <Navigation className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Live Journeys</span>
                        {(activeTripsCount || 0) > 0 && (
                            <Badge className="bg-indigo-100 text-indigo-700 text-[9px] font-bold px-1.5 py-0 border-none">
                                {activeTripsCount}
                            </Badge>
                        )}
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => navigate("/logistics/fleet")} 
                        className="text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 font-bold text-xs h-8 px-3 rounded-lg gap-1.5"
                    >
                        <Truck className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Fleet & Couplings</span>
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => navigate("/logistics/drivers")} 
                        className="text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 font-bold text-xs h-8 px-3 rounded-lg gap-1.5"
                    >
                        <Users className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Driver Registry</span>
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => navigate("/logistics/tripsheets")} 
                        className="text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 font-bold text-xs h-8 px-3 rounded-lg gap-1.5"
                    >
                        <FileText className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Trip Sheets & Fuel</span>
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => navigate("/logistics/fund-approvals")} 
                        className="text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 font-bold text-xs h-8 px-3 rounded-lg gap-1.5"
                    >
                        <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Road Fund Approvals</span>
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => navigate("/logistics/masters")} 
                        className="text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 font-bold text-xs h-8 px-3 rounded-lg gap-1.5"
                    >
                        <Layers className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Masters & Rates</span>
                    </Button>
                </div>
                <div className="text-[11px] text-slate-400 font-medium px-2 hidden xl:block">
                    Executive Logistics Infrastructure
                </div>
            </div>

            {/* LIVE TRIP EXECUTION LIFECYCLE STRIP */}
            <Card className="border border-slate-200/80 shadow-sm rounded-2xl bg-white p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-indigo-600" />
                        Active Trip Lifecycle Progression
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">From customer booking to transit arrival</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    {/* Stage 1 */}
                    <div 
                        onClick={() => navigate("/logistics/orders")}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 hover:bg-indigo-50/50 hover:border-indigo-200 cursor-pointer transition-all"
                    >
                        <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                            <span>1. Booking Orders</span>
                            <Package className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                        <div className="text-xl font-black text-slate-900 mt-1">
                            {pipelineStats?.pendingOrders || 0}
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">Pending client dispatch</p>
                    </div>

                    {/* Stage 2 */}
                    <div 
                        onClick={() => navigate("/logistics/orders")}
                        className="p-3 rounded-xl bg-purple-50/50 border border-purple-200/70 hover:bg-purple-50 cursor-pointer transition-all"
                    >
                        <div className="flex items-center justify-between text-purple-700 text-[10px] font-bold uppercase tracking-wider">
                            <span>2. Garage Clearance</span>
                            <Wrench className="w-3.5 h-3.5 text-purple-500" />
                        </div>
                        <div className="text-xl font-black text-purple-900 mt-1">
                            {pipelineStats?.inGarage || 0}
                        </div>
                        <p className="text-[10px] text-purple-600/80 font-medium mt-0.5">Under workshop check</p>
                    </div>

                    {/* Stage 3 */}
                    <div 
                        onClick={() => navigate("/logistics/fund-approvals")}
                        className="p-3 rounded-xl bg-amber-50/50 border border-amber-200/70 hover:bg-amber-50 cursor-pointer transition-all"
                    >
                        <div className="flex items-center justify-between text-amber-700 text-[10px] font-bold uppercase tracking-wider">
                            <span>3. Road Funds</span>
                            <DollarSign className="w-3.5 h-3.5 text-amber-500" />
                        </div>
                        <div className="text-xl font-black text-amber-900 mt-1">
                            Authorized
                        </div>
                        <p className="text-[10px] text-amber-600/80 font-medium mt-0.5">Ready for driver payout</p>
                    </div>

                    {/* Stage 4 */}
                    <div 
                        onClick={() => navigate("/logistics/trips")}
                        className="p-3 rounded-xl bg-blue-50/50 border border-blue-200/70 hover:bg-blue-50 cursor-pointer transition-all"
                    >
                        <div className="flex items-center justify-between text-blue-700 text-[10px] font-bold uppercase tracking-wider">
                            <span>4. In Transit</span>
                            <Navigation className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                        </div>
                        <div className="text-xl font-black text-blue-900 mt-1">
                            {activeTripsCount || 0}
                        </div>
                        <p className="text-[10px] text-blue-600/80 font-medium mt-0.5">Trucks moving on route</p>
                    </div>

                    {/* Stage 5 */}
                    <div 
                        onClick={() => navigate("/logistics/tripsheets")}
                        className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/70 hover:bg-emerald-50 cursor-pointer transition-all"
                    >
                        <div className="flex items-center justify-between text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                            <span>5. Delivered & Closed</span>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        </div>
                        <div className="text-xl font-black text-emerald-900 mt-1">
                            {pipelineStats?.completed || 0}
                        </div>
                        <p className="text-[10px] text-emerald-600/80 font-medium mt-0.5">Reconciled trip sheets</p>
                    </div>
                </div>
            </Card>

            <div className="space-y-6">
                {/* 4 CORE OPERATIONAL METRIC CARDS */}
                <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-4">
                    {/* 1. Fleet Readiness */}
                    <Card 
                        onClick={() => navigate("/logistics/fleet")}
                        className="border border-slate-200/80 shadow-sm bg-white rounded-2xl hover:shadow-md transition-all cursor-pointer group"
                    >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-indigo-600 transition-colors">
                                Total Fleet
                            </span>
                            <div className="h-7 w-7 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                                <Truck className="h-3.5 w-3.5 text-blue-600" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900">{fleetCount ?? 0}</span>
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold px-1.5 py-0">
                                    {fleetHealthStats?.operational ?? fleetCount ?? 0} Road-Ready
                                </Badge>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 font-medium">
                                {(fleetHealthStats?.inMaintenance || 0) > 0 ? `${fleetHealthStats?.inMaintenance} in garage workshop` : "All registered units active"}
                            </p>
                        </CardContent>
                    </Card>

                    {/* 2. Drivers */}
                    <Card 
                        onClick={() => navigate("/logistics/drivers")}
                        className="border border-slate-200/80 shadow-sm bg-white rounded-2xl hover:shadow-md transition-all cursor-pointer group"
                    >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-indigo-600 transition-colors">
                                Active Drivers
                            </span>
                            <div className="h-7 w-7 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                                <Users className="h-3.5 w-3.5 text-indigo-600" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900">{driverCount ?? 0}</span>
                                <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-bold px-1.5 py-0">
                                    {driverStatusData?.find((d: any) => d.name === 'Available')?.value ?? 0} Free
                                </Badge>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 font-medium">
                                {driverStatusData?.find((d: any) => d.name === 'Assigned')?.value ?? 0} currently assigned to rigs
                            </p>
                        </CardContent>
                    </Card>

                    {/* 3. Active Trips */}
                    <Card 
                        onClick={() => navigate("/logistics/trips")}
                        className="border border-slate-200/80 shadow-sm bg-white rounded-2xl hover:shadow-md transition-all cursor-pointer group"
                    >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-indigo-600 transition-colors">
                                Active Trips
                            </span>
                            <div className="h-7 w-7 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                                <Map className="h-3.5 w-3.5 text-amber-600" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900">{activeTripsCount ?? 0}</span>
                                <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold px-1.5 py-0">
                                    In Transit
                                </Badge>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 font-medium">Vehicles on active transit routes</p>
                        </CardContent>
                    </Card>

                    {/* 4. Real Fleet Health */}
                    <Card 
                        onClick={() => navigate("/garage")}
                        className="border border-slate-200/80 shadow-sm bg-white rounded-2xl hover:shadow-md transition-all cursor-pointer group"
                    >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-indigo-600 transition-colors">
                                Fleet Readiness
                            </span>
                            <div className="h-7 w-7 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                                <Activity className="h-3.5 w-3.5 text-emerald-600" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900">
                                    {fleetHealthStats?.healthPercent ?? 100}%
                                </span>
                                {(fleetHealthStats?.inMaintenance || 0) > 0 ? (
                                    <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold px-1.5 py-0">
                                        {fleetHealthStats?.inMaintenance} In Garage
                                    </Badge>
                                ) : (
                                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                        ✓ Full Health
                                    </span>
                                )}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 font-medium">Synced with Garage Command</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Financial Overview Cards */}
                <div className="grid gap-3.5 grid-cols-1 sm:grid-cols-3">
                    <Card className="border border-slate-200/80 shadow-sm bg-white rounded-2xl p-5 hover:shadow-md transition-all">
                        <div className="flex items-center justify-between pb-2">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gross Freight Revenue</span>
                            <div className="h-7 w-7 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                                <DollarSign className="h-4 w-4 text-emerald-600" />
                            </div>
                        </div>
                        <div className="text-2xl font-black text-slate-900">
                            {formatUsd(financialStats?.totalRevenueUSD)}
                        </div>
                        <p className="text-xs font-semibold text-emerald-600 mt-1">
                            {formatTSh(financialStats?.totalRevenue)}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">Completed & approved trip earnings</p>
                    </Card>

                    <Card className="border border-slate-200/80 shadow-sm bg-white rounded-2xl p-5 hover:shadow-md transition-all">
                        <div className="flex items-center justify-between pb-2">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Road & Trip Expenses</span>
                            <div className="h-7 w-7 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center">
                                <CreditCard className="h-4 w-4 text-rose-600" />
                            </div>
                        </div>
                        <div className="text-2xl font-black text-slate-900">
                            {formatUsd(financialStats?.totalExpensesUSD)}
                        </div>
                        <p className="text-xs font-semibold text-rose-600 mt-1">
                            {formatTSh(financialStats?.totalExpenses)}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">Fuel, transit permits, allowances</p>
                    </Card>

                    <Card className="border border-slate-200/80 shadow-sm bg-white rounded-2xl p-5 hover:shadow-md transition-all">
                        <div className="flex items-center justify-between pb-2">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Net Freight Margin</span>
                            <div className="h-7 w-7 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                                <TrendingUp className="h-4 w-4 text-indigo-600" />
                            </div>
                        </div>
                        <div className="text-2xl font-black text-slate-900">
                            {formatUsd(financialStats?.profitUSD)}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs font-semibold text-indigo-600">
                                {formatTSh(financialStats?.profit)}
                            </p>
                            {financialStats?.totalRevenueUSD > 0 && (
                                <Badge className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-1.5 py-0 border-indigo-200">
                                    {Math.round((financialStats.profitUSD / financialStats.totalRevenueUSD) * 100)}% Margin
                                </Badge>
                            )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">Net operational freight earnings</p>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <Card className="border-none shadow-xl bg-white dark:bg-gray-900 lg:col-span-2">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base font-semibold text-slate-700">Fuel Efficiency Performance (KM/L)</CardTitle>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-slate-100 p-1.5 rounded">
                                <Activity className="w-3.5 h-3.5 text-indigo-500" />
                                Target: 4.5 KM/L
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px] w-full mt-4">
                                {fuelStats && fuelStats.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={fuelStats as any}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis
                                                dataKey="vehicle"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fontSize: 10, fill: '#64748b' }}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fontSize: 10, fill: '#64748b' }}
                                                label={{ value: 'KM per Liter', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }}
                                            />
                                            <Tooltip
                                                cursor={{ fill: '#f8fafc' }}
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                formatter={(value) => [`${value} KM/L`, 'Efficiency']}
                                            />
                                            <Bar dataKey="efficiency" radius={[4, 4, 0, 0]}>
                                                {fuelStats.map((entry, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={entry.efficiency >= 4.5 ? '#4f46e5' : entry.efficiency >= 3.5 ? '#f59e0b' : '#ef4444'}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                                        <Activity className="w-8 h-8 opacity-20" />
                                        <p className="text-sm">Complete trips with fuel data to see analytics</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        {/* REPLACEMENT SECTION: Fleet Status */}
                        <Card className="border-none shadow-xl bg-white dark:bg-gray-900">
                            <CardHeader>
                                <CardTitle className="text-base font-semibold text-slate-700">Fleet Utilization</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {fleetStatusData && fleetStatusData.length > 0 ? (
                                    <div className="space-y-4">
                                        {fleetStatusData.map((status: any, index: number) => (
                                            <div key={status.name} className="space-y-2">
                                                <div className="flex justify-between text-sm font-semibold">
                                                    <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                                                        <div className={`w-2 h-2 rounded-full ${index % 2 === 0 ? 'bg-indigo-500' : 'bg-amber-500'}`} />
                                                        {status.name}
                                                    </span>
                                                    <span className="text-slate-500">{status.value} units</span>
                                                </div>
                                                <Progress value={(status.value / (fleetCount || 1)) * 100} className="h-2.5" />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                                        <p className="text-xs">No data available</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-xl bg-white dark:bg-gray-900">
                            <CardHeader>
                                <CardTitle className="text-base font-semibold text-slate-700">Driver Availability</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {driverStatusData && driverStatusData.length > 0 ? (
                                    <div className="space-y-6">
                                        <div className="flex items-end justify-between">
                                            <div>
                                                <div className="text-xl font-bold text-slate-800 dark:text-white">
                                                    {Math.round(((driverStatusData.find((d: any) => d.name === 'Available')?.value || 0) / (driverCount || 1)) * 100)}%
                                                </div>
                                                <p className="text-sm font-medium text-muted-foreground mt-1">Workforce Available</p>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-medium text-slate-900 dark:text-white">
                                                    {driverStatusData.find((d: any) => d.name === 'Available')?.value || 0} / {driverCount}
                                                </div>
                                                <p className="text-[10px] uppercase font-semibold text-muted-foreground">Drivers Free</p>
                                            </div>
                                        </div>
                                        <Progress
                                            value={((driverStatusData.find((d: any) => d.name === 'Available')?.value || 0) / (driverCount || 1)) * 100}
                                            className="h-2.5 w-full bg-slate-100"
                                        />
                                        <div className="grid grid-cols-2 gap-4 pt-2">
                                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                                <p className="text-[10px] uppercase text-slate-400 font-semibold">Assigned</p>
                                                <p className="text-sm font-medium text-slate-700">
                                                    {driverStatusData.find((d: any) => d.name === 'Assigned')?.value || 0}
                                                </p>
                                            </div>
                                            <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                                                <p className="text-[10px] uppercase text-indigo-400 font-semibold">Total</p>
                                                <p className="text-sm font-medium text-indigo-700">{driverCount}</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                                        <p className="text-xs">No data available</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-xl bg-white dark:bg-gray-900">
                            <CardHeader>
                                <CardTitle>Recent Activity</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {recentActivity && recentActivity.length > 0 ? (
                                        recentActivity.map((log: any) => (
                                            <div key={log.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                                                <div className="mt-1 bg-primary/10 p-1.5 rounded-full">
                                                    <Clock className="w-3.5 h-3.5 text-primary" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                                        {log.action || log.event_type}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {log.user_name || 'System'} • {format(new Date(log.created_at), "HH:mm, MMM dd")}
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                                            <Activity className="w-8 h-8 opacity-20" />
                                            <p className="text-sm">No recent activity to display</p>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LogisticsDashboard;
