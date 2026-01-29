import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck, Users, Map, Activity, Clock, Plus, Trash2, Settings, FileText, CheckCircle, AlertTriangle } from "lucide-react";
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

    return (
        <div className="space-y-6 animate-fade-in p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Logistics Overview</h1>
                    <p className="text-muted-foreground mt-2">Manage fleet, drivers, and active journeys.</p>
                </div>
            </div>

            <div className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Metric Cards */}
                    <Card className="border-none shadow-lg bg-white/80 backdrop-blur-sm dark:bg-gray-900/80 hover:scale-[1.02] transition-transform">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Fleet</CardTitle>
                            <Truck className="h-4 w-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-gray-900 dark:text-white">{fleetCount ?? 0}</div>
                            <p className="text-xs text-muted-foreground mt-1">Vehicles registered</p>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-lg bg-white/80 backdrop-blur-sm dark:bg-gray-900/80 hover:scale-[1.02] transition-transform">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Active Drivers</CardTitle>
                            <Users className="h-4 w-4 text-indigo-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-gray-900 dark:text-white">{driverCount ?? 0}</div>
                            <p className="text-xs text-muted-foreground mt-1">Available for assignment</p>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-lg bg-white/80 backdrop-blur-sm dark:bg-gray-900/80 hover:scale-[1.02] transition-transform">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Active Trips</CardTitle>
                            <Map className="h-4 w-4 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-gray-900 dark:text-white">{activeTripsCount ?? 0}</div>
                            <p className="text-xs text-muted-foreground mt-1">Trucks in transit</p>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-lg bg-white/80 backdrop-blur-sm dark:bg-gray-900/80 hover:scale-[1.02] transition-transform">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Fleet Health</CardTitle>
                            <Activity className="h-4 w-4 text-indigo-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">100%</div>
                            <p className="text-xs text-muted-foreground mt-1">Operational status</p>
                        </CardContent>
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
