import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Package, ShoppingCart, Calendar, FileBarChart, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const InventoryReports = () => {
    const sb = supabase as any;
    const [timeframe, setTimeframe] = useState<"daily" | "monthly">("daily");

    // Fetch Usage Logs
    const { data: usageLogs, isLoading } = useQuery({
        queryKey: ["inventory-reports-usage", timeframe],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_inventory_usage")
                .select("*, item:garage_inventory(category, unit_price)");
            if (error) throw error;
            return data;
        }
    });

    // Calculate Metrics
    const metrics = useMemo(() => {
        if (!usageLogs) return { totalItems: 0, totalValue: 0, topItem: "---" };

        const now = new Date();
        const filtered = usageLogs.filter((log: any) => {
            const date = new Date(log.created_at);
            if (timeframe === "daily") {
                return date.toDateString() === now.toDateString();
            } else {
                return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
            }
        });

        const totalItems = filtered.reduce((acc: number, log: any) => acc + (log.quantity_used || 0), 0);
        const totalValue = filtered.reduce((acc: number, log: any) => acc + ((log.quantity_used || 0) * (log.item?.unit_price || 0)), 0);

        // Top Item
        const itemCounts: Record<string, number> = {};
        filtered.forEach((log: any) => {
            itemCounts[log.item_name] = (itemCounts[log.item_name] || 0) + log.quantity_used;
        });
        const topItem = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "---";

        return { totalItems, totalValue, topItem };
    }, [usageLogs, timeframe]);

    const handlePrint = () => window.print();

    return (
        <div className="space-y-6 p-6 animate-fade-in bg-slate-50/30 min-h-screen">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <FileBarChart className="w-6 h-6 text-indigo-600" />
                        Inventory Consumption Analytics
                    </h1>
                    <p className="text-[11px] text-slate-500 mt-1">Superuser view: Detailed usage and stock valuation reports.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Select value={timeframe} onValueChange={(v: any) => setTimeframe(v)}>
                        <SelectTrigger className="w-44 bg-white shadow-sm border-slate-200 h-10 text-sm font-medium">
                            <SelectValue placeholder="Select Timeframe" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="daily" className="text-[11px]">Daily Summary</SelectItem>
                            <SelectItem value="monthly" className="text-[11px]">Monthly Report</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="bg-white h-10 px-4 text-sm font-medium border-slate-200 hover:bg-slate-50" onClick={handlePrint}>
                        <Printer className="w-4 h-4 mr-2" />
                        Print Report
                    </Button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-none shadow-sm bg-white overflow-hidden group">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Total Units Issued</CardTitle>
                        <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 group-hover:scale-105 transition-transform">
                            <ShoppingCart className="h-5 w-5" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900 tracking-tight">{metrics.totalItems}</div>
                        <p className="text-[11px] text-slate-500 mt-2">Total quantity utilized in current period</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white overflow-hidden group">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Consumption Value</CardTitle>
                        <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600 group-hover:scale-105 transition-transform">
                            <TrendingUp className="h-5 w-5" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900 tracking-tight">TZS {metrics.totalValue.toLocaleString()}</div>
                        <p className="text-[11px] text-slate-500 mt-2 font-medium">Estimated cost of items taken from store</p>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white overflow-hidden group border-l-4 border-amber-400">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Top In-Demand Part</CardTitle>
                        <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600 group-hover:scale-105 transition-transform">
                            <Package className="h-5 w-5" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold text-slate-900 truncate tracking-tight">{metrics.topItem}</div>
                        <p className="text-[11px] text-slate-500 mt-2">Most frequently issued item</p>
                    </CardContent>
                </Card>
            </div>

            {/* Detailed Usage Table */}
            <Card className="border-none shadow-sm bg-white overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between py-4">
                    <CardTitle className="text-sm font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-indigo-500" />
                        Detailed Consumption Log ({timeframe})
                    </CardTitle>
                    <Badge variant="outline" className="bg-white text-[11px] uppercase font-bold text-indigo-600 py-1 px-3 border-indigo-100 shadow-sm">
                        {timeframe === 'daily' ? 'Live Day Data' : 'Current Month Data'}
                    </Badge>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50/40 border-b border-slate-100">
                                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Date & Time</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Issued To</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Category</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Item Name</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Qty</TableHead>
                                <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Est. Value (TZS)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {usageLogs && usageLogs.length > 0 ? usageLogs
                                .filter((log: any) => {
                                    const date = new Date(log.created_at);
                                    if (timeframe === "daily") {
                                        return date.toDateString() === new Date().toDateString();
                                    }
                                    return true;
                                })
                                .map((log: any) => (
                                    <TableRow key={log.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                        <TableCell className="text-[11px] text-slate-600 font-medium py-3 px-6">
                                            {new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </TableCell>
                                        <TableCell className="text-[11px] font-bold text-slate-800 py-3 px-6">
                                            {log.issued_to}
                                        </TableCell>
                                        <TableCell className="py-3 px-6">
                                            <Badge variant="outline" className="text-[11px] font-medium py-0.5 px-2 bg-slate-50 text-slate-500 border-slate-200">
                                                {log.item?.category || 'General'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-[11px] font-semibold text-slate-700 py-3 px-6">
                                            {log.item_name}
                                        </TableCell>
                                        <TableCell className="text-[11px] font-bold text-slate-900 py-3 px-6">
                                            {log.quantity_used}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-[11px] text-emerald-600 py-3 px-6">
                                            {((log.quantity_used || 0) * (log.item?.unit_price || 0)).toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-40 text-center text-sm text-slate-400 italic font-medium">
                                        No usage activity found for this period.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Management Footer Branding */}
            <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl flex items-center justify-between overflow-hidden relative group">
                <div className="relative z-10">
                    <h3 className="text-xl font-bold flex items-center gap-2 tracking-tight">
                        <TrendingUp className="w-6 h-6 text-indigo-400" />
                        Operational Intelligence
                    </h3>
                    <p className="text-[11px] text-slate-300 max-w-xl mt-3 font-medium leading-relaxed opacity-90">
                        Detailed store analytics provided for management oversight. This data ensures zero-loss accountability and optimized part procurement cycles for Energy Feeds SudSud Group.
                    </p>
                </div>
                <div className="absolute right-[-40px] bottom-[-40px] opacity-10 group-hover:scale-105 transition-transform duration-1000 ease-out">
                    <BarChart3 className="w-64 h-64" />
                </div>
            </div>
        </div >
    );
};

export default InventoryReports;
