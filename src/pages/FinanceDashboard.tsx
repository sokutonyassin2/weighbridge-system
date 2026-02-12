import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { TrendingUp, Banknote, ShoppingCart, Package, AlertCircle, Calendar, ArrowUpRight, ArrowDownRight, CreditCard } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfToday, endOfToday, subMonths } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function FinanceDashboard() {
    const [selectedMonth, setSelectedMonth] = useState(new Date());

    const monthStart = startOfMonth(selectedMonth);
    const monthEnd = endOfMonth(selectedMonth);

    // 1. Fetch Revenue (Payments + Penalties)
    const { data: revenueData, isLoading: isLoadingRevenue } = useQuery({
        queryKey: ["finance-revenue", selectedMonth.toISOString()],
        queryFn: async () => {
            const { data: payments } = await supabase
                .from("payments")
                .select("amount, paid_at, payment_type")
                .eq("payment_status", "Paid")
                .gte("paid_at", monthStart.toISOString())
                .lte("paid_at", monthEnd.toISOString());

            const { data: penalties } = await supabase
                .from("penalties")
                .select("amount, created_at")
                .gte("created_at", monthStart.toISOString())
                .lte("created_at", monthEnd.toISOString());

            const paymentsTotal = payments?.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0) || 0;
            const penaltiesTotal = penalties?.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0) || 0;

            // Group payments by type for the pie chart
            const methodMap = new Map();
            payments?.forEach(p => {
                const type = p.payment_type || "Other";
                methodMap.set(type, (methodMap.get(type) || 0) + parseFloat(p.amount.toString()));
            });

            const methodData = Array.from(methodMap.entries()).map(([name, value]) => ({ name, value }));

            return {
                total: paymentsTotal + penaltiesTotal,
                payments: paymentsTotal,
                penalties: penaltiesTotal,
                methodData
            };
        },
        refetchInterval: 10000
    });

    // 2. Fetch Expenditure (Procurement)
    const { data: spendData, isLoading: isLoadingSpend } = useQuery({
        queryKey: ["finance-spend", selectedMonth.toISOString()],
        queryFn: async () => {
            const { data: requisitions } = await (supabase as any)
                .from("garage_requisitions")
                .select("total_price, created_at, status")
                .in("status", ["Purchased", "Received", "Paid"])
                .gte("created_at", monthStart.toISOString())
                .lte("created_at", monthEnd.toISOString());

            const totalSpend = (requisitions || []).reduce((sum: number, r: any) => sum + (r.total_price || 0), 0);

            return { total: totalSpend, count: requisitions?.length || 0 };
        },
        refetchInterval: 10000
    });

    // 3. Fetch Inventory Value
    const { data: inventoryValue, isLoading: isLoadingInventory } = useQuery({
        queryKey: ["finance-inventory-value"],
        queryFn: async () => {
            const { data } = await (supabase as any)
                .from("garage_inventory")
                .select("unit_price, quantity");

            return (data || []).reduce((sum: number, item: any) => sum + ((item.unit_price || 0) * (item.quantity || 0)), 0) || 0;
        }
    });

    // 4. Fetch Weighbridge Activity
    const { data: activityData, isLoading: isLoadingActivity } = useQuery({
        queryKey: ["finance-activity", selectedMonth.toISOString()],
        queryFn: async () => {
            const { count } = await supabase
                .from("vehicle_entries")
                .select("*", { count: 'exact', head: true })
                .gte("created_at", monthStart.toISOString())
                .lte("created_at", monthEnd.toISOString());

            return count || 0;
        }
    });

    // 5. Recent Large Transactions
    const { data: recentTransactions } = useQuery({
        queryKey: ["finance-recent-transactions"],
        queryFn: async () => {
            const { data: payments } = await supabase
                .from("payments")
                .select("amount, vehicle_no, paid_at, payment_type")
                .eq("payment_status", "Paid")
                .order("amount", { ascending: false })
                .limit(5);

            const { data: purchases } = await (supabase as any)
                .from("garage_requisitions")
                .select("total_price, item_name, created_at, status")
                .in("status", ["Purchased", "Paid"])
                .order("total_price", { ascending: false })
                .limit(5);

            return { payments, purchases };
        },
        refetchInterval: 10000
    });

    const chartData = [
        { name: "Revenue", value: revenueData?.total || 0, color: "#10b981" },
        { name: "Expenditure", value: spendData?.total || 0, color: "#ef4444" },
    ];

    return (
        <div className="p-6 space-y-6 bg-slate-50/30 min-h-screen">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Finance Overview</h1>
                    <p className="text-slate-500">Financial health and performance tracking</p>
                </div>
                <div className="flex items-center gap-2 bg-white p-1 rounded-lg border shadow-sm">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
                    >
                        Previous
                    </Button>
                    <div className="px-4 font-semibold text-sm">
                        {format(selectedMonth, "MMMM yyyy")}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedMonth(new Date())}
                        disabled={format(selectedMonth, "MMMM yyyy") === format(new Date(), "MMMM yyyy")}
                    >
                        Current
                    </Button>
                </div>
            </div>

            {/* KPI CARDS */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-emerald-100 shadow-sm bg-emerald-50/10">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-emerald-900">Total Revenue</CardTitle>
                        <Banknote className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                        {isLoadingRevenue ? <Skeleton className="h-8 w-24" /> : (
                            <div className="text-2xl font-bold text-emerald-700">
                                {revenueData?.total.toLocaleString()} <span className="text-xs font-normal opacity-70">TShs</span>
                            </div>
                        )}
                        <p className="text-[10px] text-emerald-600/70 mt-1 flex items-center gap-1">
                            <ArrowUpRight className="h-2.5 w-2.5" /> Includes Payments & Penalties
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-rose-100 shadow-sm bg-rose-50/10">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-rose-900">Procurement Spend</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-rose-600" />
                    </CardHeader>
                    <CardContent>
                        {isLoadingSpend ? <Skeleton className="h-8 w-24" /> : (
                            <div className="text-2xl font-bold text-rose-700">
                                {spendData?.total.toLocaleString()} <span className="text-xs font-normal opacity-70">TShs</span>
                            </div>
                        )}
                        <p className="text-[10px] text-rose-600/70 mt-1 flex items-center gap-1">
                            <ArrowDownRight className="h-2.5 w-2.5" /> Total from {spendData?.count} purchases
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-blue-100 shadow-sm bg-blue-50/10">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-blue-900">Inventory Value</CardTitle>
                        <Package className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        {isLoadingInventory ? <Skeleton className="h-8 w-24" /> : (
                            <div className="text-2xl font-bold text-blue-700">
                                {inventoryValue?.toLocaleString()} <span className="text-xs font-normal opacity-70">TShs</span>
                            </div>
                        )}
                        <p className="text-[10px] text-blue-600/70 mt-1">Total assets in garage store</p>
                    </CardContent>
                </Card>

                <Card className="border-amber-100 shadow-sm bg-amber-50/10">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-amber-900">Weighbridge Activity</CardTitle>
                        <TrendingUp className="h-4 w-4 text-amber-600" />
                    </CardHeader>
                    <CardContent>
                        {isLoadingActivity ? <Skeleton className="h-8 w-24" /> : (
                            <div className="text-2xl font-bold text-amber-700">
                                {activityData?.toLocaleString()} <span className="text-xs font-normal opacity-70">Entries</span>
                            </div>
                        )}
                        <p className="text-[10px] text-amber-600/70 mt-1">Vehicles processed this month</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* REVENUE VS SPEND */}
                <Card className="shadow-sm border-slate-200">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-primary" />
                            Revenue vs. Expenditure
                        </CardTitle>
                        <CardDescription>Comparison of income and procurement costs</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip
                                    cursor={{ fill: '#f1f5f9' }}
                                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar
                                    dataKey="value"
                                    radius={[4, 4, 0, 0]}
                                    barSize={60}
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* PAYMENT METHODS */}
                <Card className="shadow-sm border-slate-200">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <CreditCard className="h-5 w-5 text-primary" />
                            Payment Method Breakdown
                        </CardTitle>
                        <CardDescription>How customers are paying (Collections)</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={revenueData?.methodData || []}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {(revenueData?.methodData || []).map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* RECENT LARGE TRANSACTIONS */}
            <div className="grid gap-6 md:grid-cols-2">
                <Card className="shadow-sm border-slate-200">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">Top Revenue (Recent)</CardTitle>
                        <CardDescription>Highest individual payments</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Vehicle</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentTransactions?.payments?.map((p, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="font-medium">{p.vehicle_no}</TableCell>
                                        <TableCell>{p.payment_type}</TableCell>
                                        <TableCell className="text-right font-bold text-emerald-600">
                                            {p.amount.toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold">Top Purchases (Recent)</CardTitle>
                        <CardDescription>Highest procurement expenses</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Item</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Total Cost</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentTransactions?.purchases?.map((p, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="font-medium">{p.item_name}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-[10px] uppercase">
                                                {p.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-rose-600">
                                            {p.total_price.toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
