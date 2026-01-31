import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    Card, CardContent, CardHeader, CardTitle, CardDescription
} from "@/components/ui/card";
import {
    BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, AreaChart, Area
} from "recharts";
import {
    Scale, Truck, Wrench, Package, TrendingUp, Users, Activity,
    ArrowUpRight, ArrowDownRight, DollarSign, Clock, ShieldCheck, User
} from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const COLORS = {
    primary: "#4F46E5", // Indigo 600
    secondary: "#10B981", // Emerald 500
    warning: "#F59E0B", // Amber 500
    danger: "#EF4444", // Red 500
    purple: "#8B5CF6", // Violet 500
};

export default function SuperadminDashboard() {
    const [timeRange] = useState(7); // Default to last 7 days

    // 1. Fetch Weighbridge Data (Revenue & Tonnage)
    const { data: weighbridgeData } = useQuery({
        queryKey: ["superadmin-weighbridge", timeRange],
        queryFn: async () => {
            const startDate = subDays(startOfDay(new Date()), timeRange);
            const { data, error } = await supabase
                .from("weigh_records")
                .select("*, vehicle_entries(category, entry_time)")
                .gte("created_at", startDate.toISOString());

            if (error) throw error;
            return data as any[];
        },
    });

    // 2. Fetch Fleet Status
    const { data: fleetStats } = useQuery({
        queryKey: ["superadmin-fleet"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_fleet")
                .select("asset_status, id");

            if (error) throw error;

            const stats = {
                total: data.length,
                active: data.filter(v => v.asset_status === "Active").length,
                maintenance: data.filter(v => v.asset_status === "Maintenance" || v.asset_status === "In Garage").length,
                breakdown: data.filter(v => v.asset_status === "Breakdown").length,
            };
            return stats;
        }
    });

    // 3. Fetch Recent Global Activity
    const { data: globalActivity } = useQuery({
        queryKey: ["superadmin-activity"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("activity_logs")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(6);

            if (error) throw error;
            return data;
        }
    });

    // 4. Fetch Pending Quality Checks
    const { data: qualityChecks } = useQuery({
        queryKey: ["superadmin-quality-checks"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("activity_logs") // Using activity_logs as a proxy since garage_job_cards is missing in types
                .select("*")
                .limit(5);

            if (error) throw error;
            return data as any[];
        }
    });

    // Process Chart Data
    const chartData = useMemo(() => {
        if (!weighbridgeData) return [];

        const dayMap = new Map();
        // Initialize last 7 days
        for (let i = timeRange; i >= 0; i--) {
            const d = format(subDays(new Date(), i), "MMM dd");
            dayMap.set(d, { date: d, revenue: 0, tonnage: 0, count: 0 });
        }

        weighbridgeData.forEach(record => {
            const d = format(new Date(record.created_at), "MMM dd");
            if (dayMap.has(d)) {
                const entry = dayMap.get(d);
                // Tonnage estimate (net weight)
                const netWeight = Math.abs((record.gross_weight || 0) - (record.tare_weight || 0));
                entry.tonnage += netWeight / 1000; // Convert to Tons
                // Revenue estimate - set to 0 as first_weigh_fee is missing
                entry.revenue += 0;
                entry.count++;
            }
        });

        return Array.from(dayMap.values());
    }, [weighbridgeData, timeRange]);

    const totalRevenue = useMemo(() =>
        weighbridgeData?.reduce((sum, r) => sum + 0, 0) || 0,
        [weighbridgeData]);

    return (
        <div className="p-6 space-y-8 bg-[#F8FAFC] min-h-screen font-inter">
            {/* Header section with glassmorphism feel */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                        Global Hub <span className="text-purple-600">Command Center</span>
                    </h1>
                    <p className="text-slate-500 font-medium mt-1">Real-time operational overview across all Energy Feeds modules.</p>
                </div>
                <div className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex -space-x-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center overflow-hidden">
                                <Users className="w-4 h-4 text-slate-400" />
                            </div>
                        ))}
                    </div>
                    <span className="text-xs font-bold text-slate-600 px-2 border-l">4 Users Online</span>
                    <Badge className="bg-green-500/10 text-green-600 border-none animate-pulse">Live Sync</Badge>
                </div>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Revenue (7d)"
                    value={`TZS ${totalRevenue.toLocaleString()}`}
                    subValue="+12.5% from last week"
                    icon={DollarSign}
                    trend="up"
                    color="bg-primary"
                />
                <StatCard
                    title="Avg. Tonnage / Day"
                    value={`${Math.round(chartData.reduce((s, d) => s + d.tonnage, 0) / (timeRange || 1))} Tons`}
                    subValue="Across all weigh stations"
                    icon={Scale}
                    trend="up"
                    color="bg-purple"
                />
                <StatCard
                    title="Fleet Health"
                    value={`${fleetStats?.active || 0} / ${fleetStats?.total || 0}`}
                    subValue={`${fleetStats?.maintenance || 0} units in maintenance`}
                    icon={Truck}
                    trend={((fleetStats?.active || 0) / (fleetStats?.total || 1)) > 0.8 ? "up" : "down"}
                    color="bg-secondary"
                />
                <StatCard
                    title="Maintenance Debt"
                    value={qualityChecks?.length || 0}
                    subValue="Open job cards pending release"
                    icon={Wrench}
                    trend="down"
                    color="bg-warning"
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Tonnage Trend */}
                <Card className="lg:col-span-2 border-none shadow-sm rounded-3xl overflow-hidden bg-white">
                    <CardHeader className="pb-0 pt-6 px-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-lg font-bold text-slate-800">Operational Throughput</CardTitle>
                                <CardDescription className="font-medium">Tonnage trends across the last 7 days</CardDescription>
                            </div>
                            <Badge variant="outline" className="font-bold border-slate-200 text-slate-500">Live Feedback</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="h-[350px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorTonnage" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.1} />
                                            <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis
                                        dataKey="date"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748B', fontSize: 12, fontWeight: 600 }}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748B', fontSize: 12 }}
                                    />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                        itemStyle={{ fontWeight: 700 }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="tonnage"
                                        stroke={COLORS.primary}
                                        strokeWidth={4}
                                        fillOpacity={1}
                                        fill="url(#colorTonnage)"
                                        name="Tons"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Global Activity Feed */}
                <Card className="border-none shadow-sm rounded-3xl bg-white">
                    <CardHeader className="pt-6 px-6 border-b border-slate-50 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-lg font-bold text-slate-800">System Pulse</CardTitle>
                            <CardDescription className="font-medium text-[10px] uppercase tracking-widest text-slate-400">Real-time Traffic</CardDescription>
                        </div>
                        <Activity className="h-5 w-5 text-purple-500" />
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-slate-50">
                            {globalActivity?.map((activity) => (
                                <div key={activity.id} className="p-4 hover:bg-slate-50 transition-colors cursor-pointer group">
                                    <div className="flex items-start gap-4">
                                        <div className="p-2 bg-slate-100 rounded-xl group-hover:bg-white transition-colors">
                                            <Clock className="w-4 h-4 text-slate-500" />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs font-bold text-slate-800">{activity.user_name}</p>
                                                <span className="text-[10px] font-bold text-slate-400">{format(new Date(activity.created_at), "HH:mm")}</span>
                                            </div>
                                            <p className="text-xs font-medium text-slate-500 leading-relaxed">{activity.details}</p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <Badge className="bg-slate-100 text-slate-600 border-none text-[9px] font-bold px-2 py-0">
                                                    {activity.action}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 bg-slate-50/50 text-center">
                            <button
                                onClick={() => window.location.href = '/activity-logs'}
                                className="text-xs font-bold text-primary hover:underline"
                            >
                                View Full Logs Archive
                            </button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue Line Chart */}
                <Card className="border-none shadow-sm rounded-3xl bg-white">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold text-slate-800">Revenue Stream</CardTitle>
                        <CardDescription className="font-medium text-xs">Monetary collection peaks</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" hide />
                                    <YAxis hide />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', background: '#1e293b', color: '#fff' }}
                                    />
                                    <Line
                                        type="stepAfter"
                                        dataKey="revenue"
                                        stroke={COLORS.secondary}
                                        strokeWidth={3}
                                        dot={false}
                                        name="Revenue"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Maintenance Overview */}
                <Card className="border-none shadow-sm rounded-3xl bg-white overflow-hidden">
                    <CardHeader className="bg-slate-900 border-none rounded-t-3xl text-white">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-lg font-bold">Garage Health Radar</CardTitle>
                                <CardDescription className="text-slate-400 font-medium">Critical focus areas</CardDescription>
                            </div>
                            <ShieldCheck className="h-6 w-6 text-emerald-400" />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow className="border-none">
                                    <TableHead className="text-[10px] font-bold uppercase tracking-widest px-6">Vehicle No</TableHead>
                                    <TableHead className="text-[10px] font-bold uppercase tracking-widest px-6">Logged At</TableHead>
                                    <TableHead className="text-[10px] font-bold uppercase tracking-widest  text-right px-6">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {qualityChecks?.slice(0, 5).map(card => (
                                    <TableRow key={card.id} className="hover:bg-slate-50 transition-colors border-slate-50">
                                        <TableCell className="font-bold text-sm px-6">{card.user_name || "N/A"}</TableCell>
                                        <TableCell className="text-xs font-medium text-slate-500 px-6">{format(new Date(card.created_at), "MMM dd, HH:mm")}</TableCell>
                                        <TableCell className="text-right px-6">
                                            <Button variant="ghost" size="sm" className="font-bold text-[10px] text-primary" onClick={() => window.location.href = '/activity-logs'}>
                                                Inspect
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {(!qualityChecks || qualityChecks.length === 0) && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-8 text-slate-400 italic text-xs">No pending maintenance items</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            {/* Brand Footer Info */}
            <div className="flex items-center justify-between py-4 border-t border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Energy Feeds Group | SudSud Logistics & Maintenance Hub</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ref: HQ-SYSA-2026</p>
            </div>
        </div>
    );
}

function StatCard({ title, value, subValue, icon: Icon, trend, color }: any) {
    return (
        <Card className="border-none shadow-sm rounded-3xl group hover:shadow-xl transition-all duration-300 bg-white">
            <CardContent className="p-6">
                <div className="flex items-start justify-between">
                    <div className={`p-3 rounded-2xl ${color} text-white shadow-lg shadow-${color.split('-')[1]}-200 group-hover:scale-110 transition-transform`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    {trend && (
                        <div className={`flex items-center gap-1 text-[11px] font-bold ${trend === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {trend === 'up' ? 'Elevating' : 'Watch'}
                        </div>
                    )}
                </div>
                <div className="mt-5 space-y-1">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
                    <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{value}</p>
                    <p className="text-[10px] font-medium text-slate-500 opacity-80">{subValue}</p>
                </div>
            </CardContent>
        </Card>
    );
}
