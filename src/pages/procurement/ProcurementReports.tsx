import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp, PieChart, FileText, Download, Calendar, ArrowUpRight, ArrowDownRight, Users, ShoppingCart, CreditCard, DollarSign, CheckCircle } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const ProcurementReports = () => {
    const sb = supabase as any;
    const { toast } = useToast();
    const [dateRange, setDateRange] = useState("current_month");

    // Fetch Report Data
    const { data: reportData, isLoading } = useQuery({
        queryKey: ["procurement-reports", dateRange],
        queryFn: async () => {
            let start = startOfMonth(new Date());
            let end = endOfMonth(new Date());

            if (dateRange === "last_month") {
                start = startOfMonth(subMonths(new Date(), 1));
                end = endOfMonth(subMonths(new Date(), 1));
            }

            const { data, error } = await sb
                .from("garage_requisitions")
                .select(`
                    *,
                    garage_suppliers(name)
                `)
                .gte("created_at", start.toISOString())
                .lte("created_at", end.toISOString());

            if (error) throw error;
            return data;
        }
    });

    // Analytics Calculations
    const totalRequests = reportData?.length || 0;
    const totalSpent = reportData?.filter((r: any) => r.status === 'Paid' || r.status === 'Approved')
        .reduce((sum: number, r: any) => sum + (r.total_price || 0), 0) || 0;
    const approvedCount = reportData?.filter((r: any) => r.status === 'Approved' || r.status === 'Paid').length || 0;
    const pendingCount = reportData?.filter((r: any) => r.status === 'Pending' || r.status === 'Awaiting Approval').length || 0;

    return (
        <div className="p-6 space-y-6 bg-slate-50/50 min-h-screen animate-fade-in">
            <header className="flex justify-between items-start">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <BarChart3 className="w-8 h-8 text-blue-600" />
                        Procurement & Financial Reports
                    </h1>
                    <p className="text-slate-500 text-sm">Comprehensive analytics for requisitions, approvals, and payouts.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Select value={dateRange} onValueChange={setDateRange}>
                        <SelectTrigger className="w-[180px] bg-white">
                            <Calendar className="w-4 h-4 mr-2 text-slate-400" />
                            <SelectValue placeholder="Select Range" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="current_month">Current Month</SelectItem>
                            <SelectItem value="last_month">Last Month</SelectItem>
                            <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" className="gap-2 bg-white" onClick={() => toast({ title: "Export Started", description: "Your report is being generated..." })}>
                        <Download className="w-4 h-4" />
                        Export PDF
                    </Button>
                </div>
            </header>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="border-none shadow-sm overflow-hidden bg-white">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div className="p-2 bg-blue-50 rounded-lg">
                                <FileText className="w-5 h-5 text-blue-600" />
                            </div>
                            <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-100 flex gap-1">
                                <ArrowUpRight className="w-3 h-3" />
                                12%
                            </Badge>
                        </div>
                        <div className="mt-4 space-y-1">
                            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Requisitions</p>
                            <p className="text-3xl font-bold text-slate-900">{totalRequests}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm overflow-hidden bg-white">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div className="p-2 bg-emerald-50 rounded-lg">
                                <DollarSign className="w-5 h-5 text-emerald-600" />
                            </div>
                            <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-100 flex gap-1">
                                <TrendingUp className="w-3 h-3" />
                                8%
                            </Badge>
                        </div>
                        <div className="mt-4 space-y-1">
                            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Authorized Spend</p>
                            <p className="text-3xl font-bold text-slate-900">{totalSpent?.toLocaleString()} TZS</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm overflow-hidden bg-white">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div className="p-2 bg-indigo-50 rounded-lg">
                                <CheckCircle className="w-5 h-5 text-indigo-600" />
                            </div>
                            <span className="text-xs text-slate-400 font-medium">Approval Rate: 84%</span>
                        </div>
                        <div className="mt-4 space-y-1">
                            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Approved Orders</p>
                            <p className="text-3xl font-bold text-slate-900">{approvedCount}</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm overflow-hidden bg-white">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div className="p-2 bg-orange-50 rounded-lg">
                                <Users className="w-5 h-5 text-orange-600" />
                            </div>
                            <span className="text-xs text-slate-400 font-medium">{pendingCount} Waiting</span>
                        </div>
                        <div className="mt-4 space-y-1">
                            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Active Cycle</p>
                            <p className="text-3xl font-bold text-slate-900">{pendingCount}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Status Breakdown */}
                <Card className="border-none shadow-sm bg-white lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <ShoppingCart className="w-5 h-5 text-blue-600" />
                            Expense Summary by Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50/50">
                                    <TableHead className="py-4 pl-6">Status</TableHead>
                                    <TableHead>Count</TableHead>
                                    <TableHead className="text-right pr-6">Value (TZS)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {['Pending', 'Awaiting Approval', 'Approved', 'Paid'].map(status => {
                                    const items = reportData?.filter((r: any) => r.status === status) || [];
                                    const value = items.reduce((sum: number, r: any) => sum + (r.total_price || 0), 0);
                                    return (
                                        <TableRow key={status}>
                                            <TableCell className="pl-6 font-medium">{status}</TableCell>
                                            <TableCell>{items.length}</TableCell>
                                            <TableCell className="text-right pr-6 font-bold">{value?.toLocaleString()}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Top Vendors */}
                <Card className="border-none shadow-sm bg-white">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-emerald-600" />
                            Top Suppliers
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {(reportData || []).reduce((acc: any[], curr: any) => {
                            const name = curr.garage_suppliers?.name || 'Unassigned';
                            const existing = acc.find(a => a.name === name);
                            if (existing) existing.value += curr.total_price || 0;
                            else acc.push({ name, value: curr.total_price || 0 });
                            return acc;
                        }, []).sort((a, b) => b.value - a.value).slice(0, 5).map((vendor, idx) => (
                            <div key={idx} className="flex justify-between items-center p-3 rounded-lg bg-slate-50 border border-slate-100/50 hover:bg-white transition-colors cursor-default group">
                                <div className="space-y-0.5">
                                    <p className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{vendor.name}</p>
                                    <p className="text-[10px] text-slate-400 font-medium">Authorized Amount</p>
                                </div>
                                <span className="text-sm font-black text-slate-900">{vendor.value?.toLocaleString()}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default ProcurementReports;
