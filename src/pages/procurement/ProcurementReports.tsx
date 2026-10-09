import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
    BarChart3, 
    TrendingUp, 
    FileText, 
    Download, 
    Calendar, 
    Building2, 
    DollarSign, 
    CheckCircle2, 
    Package, 
    Clock, 
    ExternalLink,
    ClipboardCheck,
    Wrench,
    FileCheck,
    Loader2,
    Search,
    X,
    Layers,
    Truck
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const ProcurementReports = () => {
    const navigate = useNavigate();
    const { userProfile, userRole } = useAuth();
    const isAdmin = userRole === 'admin' || userRole === 'super_admin' || userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
    const sb = supabase as any;
    const { toast } = useToast();
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const [selectedPreset, setSelectedPreset] = useState<'this_month' | 'last_month' | 'last_3_months' | 'ytd'>('this_month');

    const handleApplyPreset = (preset: 'this_month' | 'last_month' | 'last_3_months' | 'ytd') => {
        setSelectedPreset(preset);
        const now = new Date();
        if (preset === 'this_month') {
            setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
            setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
        } else if (preset === 'last_month') {
            const lastM = subMonths(now, 1);
            setStartDate(format(startOfMonth(lastM), 'yyyy-MM-dd'));
            setEndDate(format(endOfMonth(lastM), 'yyyy-MM-dd'));
        } else if (preset === 'last_3_months') {
            const threeMonthsAgo = subMonths(now, 3);
            setStartDate(format(startOfMonth(threeMonthsAgo), 'yyyy-MM-dd'));
            setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
        } else if (preset === 'ytd') {
            setStartDate(format(startOfYear(now), 'yyyy-MM-dd'));
            setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
        }
    };

    // Fetch Report Data
    const { data: reportData, isLoading } = useQuery({
        queryKey: ["procurement-reports", startDate, endDate],
        queryFn: async () => {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            const { data, error } = await sb
                .from("garage_requisitions")
                .select(`
                    *,
                    garage_suppliers(name),
                    vehicle:logistics_fleet(vehicle_no, horse_number)
                `)
                .eq("is_deleted", false)
                .gte("created_at", start.toISOString())
                .lte("created_at", end.toISOString());

            if (error) throw error;
            return data;
        }
    });

    // Analytics Calculations
    const totalRequests = reportData?.length || 0;
    const totalSpent = useMemo(() => {
        return (reportData || [])
            .filter((r: any) => r.status === 'Paid' || r.status === 'Approved' || r.status === 'Closed')
            .reduce((sum: number, r: any) => sum + (Number(r.total_price) || 0), 0);
    }, [reportData]);

    const approvedCount = useMemo(() => {
        return (reportData || []).filter((r: any) => r.status === 'Approved' || r.status === 'Paid' || r.status === 'Closed').length;
    }, [reportData]);

    const pendingCount = useMemo(() => {
        return (reportData || []).filter((r: any) => r.status === 'Pending' || r.status === 'Awaiting Approval' || r.status === 'Waiting Review').length;
    }, [reportData]);

    const approvalRate = totalRequests > 0 ? Math.round((approvedCount / totalRequests) * 100) : 0;

    const vendorLeaderboard = useMemo(() => {
        return (reportData || []).reduce((acc: any[], curr: any) => {
            const name = curr.garage_suppliers?.name || 'Unassigned / Direct';
            const existing = acc.find(a => a.name === name);
            const val = Number(curr.total_price) || 0;
            if (existing) {
                existing.value += val;
                existing.count += 1;
            } else {
                acc.push({ name, value: val, count: 1 });
            }
            return acc;
        }, []).sort((a, b) => b.value - a.value).slice(0, 5);
    }, [reportData]);

    const statusBreakdown = useMemo(() => {
        const statuses = [
            { key: 'Pending', label: 'Pending Review', color: 'amber', bg: 'bg-amber-500' },
            { key: 'Awaiting Approval', label: 'Awaiting Final Approval', color: 'purple', bg: 'bg-purple-600' },
            { key: 'Approved', label: 'Authorized for Payment', color: 'blue', bg: 'bg-blue-600' },
            { key: 'Paid', label: 'Paid & Disbursed', color: 'emerald', bg: 'bg-emerald-600' },
            { key: 'Closed', label: 'Received & Installed', color: 'teal', bg: 'bg-teal-600' },
        ];

        return statuses.map(s => {
            const items = (reportData || []).filter((r: any) => r.status === s.key);
            const val = items.reduce((sum: number, r: any) => sum + (Number(r.total_price) || 0), 0);
            const pct = totalSpent > 0 ? Math.round((val / totalSpent) * 100) : 0;
            return {
                ...s,
                count: items.length,
                value: val,
                percentage: pct
            };
        });
    }, [reportData, totalSpent]);

    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("All");

    const filteredTransactions = useMemo(() => {
        if (!reportData) return [];
        let items = reportData;
        if (statusFilter !== "All") {
            if (statusFilter === "Pending") {
                items = items.filter((r: any) => r.status === 'Pending' || r.status === 'Awaiting Approval' || r.status === 'Waiting Review');
            } else {
                items = items.filter((r: any) => r.status === statusFilter);
            }
        }
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase();
            items = items.filter((r: any) => {
                const item = (r.item_name || '').toLowerCase();
                const po = (r.po_number || '').toLowerCase();
                const supplier = (r.garage_suppliers?.name || '').toLowerCase();
                const plate = (r.vehicle?.vehicle_no || r.vehicle?.horse_number || '').toLowerCase();
                return item.includes(q) || po.includes(q) || supplier.includes(q) || plate.includes(q);
            });
        }
        return items;
    }, [reportData, statusFilter, searchTerm]);

    const handleExportCSV = () => {
        if (!reportData || reportData.length === 0) {
            toast({ title: "No Data", description: "There is no data to export for this period." });
            return;
        }
        const headers = ["ID", "Date", "PO Number", "Item Name", "Vehicle", "Supplier", "Quantity Approved", "Unit Price (TZS)", "Total Price (TZS)", "Status"];
        const rows = (filteredTransactions.length > 0 ? filteredTransactions : reportData).map((r: any) => [
            r.id,
            r.created_at ? format(new Date(r.created_at), 'yyyy-MM-dd') : '',
            r.po_number || 'N/A',
            `"${(r.item_name || '').replace(/"/g, '""')}"`,
            r.vehicle?.vehicle_no || r.vehicle?.horse_number || 'N/A',
            `"${(r.garage_suppliers?.name || 'Unassigned').replace(/"/g, '""')}"`,
            r.quantity_approved || r.quantity_requested || 1,
            r.unit_price || 0,
            r.total_price || 0,
            r.status || 'Pending'
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map((e: any[]) => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `procurement_report_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({ title: "Export Completed", description: "Procurement CSV report downloaded successfully." });
    };

    return (
        <div className="space-y-4 sm:space-y-6 p-2.5 sm:p-4 md:p-6 animate-fade-in bg-slate-50/30 min-h-screen max-w-[100vw] overflow-x-hidden">
            {/* Unified Navigation Bar - Only visible to Admin and Super Admin */}
            {isAdmin && (
                <div className="bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 w-full sm:w-auto">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/procurement")}
                            className="text-slate-700 hover:text-blue-900 hover:bg-blue-50 border-slate-200 font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shrink-0"
                        >
                            <Package className="w-4 h-4 text-blue-900" />
                            <span>Procurement Overview</span>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/procurement/approvals")}
                            className="text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 border-slate-200 font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shrink-0"
                        >
                            <ClipboardCheck className="w-4 h-4 text-indigo-500" />
                            <span>Management Approvals</span>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/procurement/cashier-portal")}
                            className="text-slate-700 hover:text-emerald-600 hover:bg-emerald-50 border-slate-200 font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shrink-0"
                        >
                            <DollarSign className="w-4 h-4 text-emerald-500" />
                            <span>Cashier Hub</span>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/procurement/replaced-parts")}
                            className="text-slate-700 hover:text-teal-600 hover:bg-teal-50 border-slate-200 font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shrink-0"
                        >
                            <Wrench className="w-4 h-4 text-teal-500" />
                            <span>Replaced Parts</span>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            className="bg-blue-900 hover:bg-blue-950 text-white font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shadow-xs shrink-0"
                        >
                            <BarChart3 className="w-4 h-4" />
                            <span>Procurement Reports</span>
                            <Badge className="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0 h-4 border-none">
                                Live
                            </Badge>
                        </Button>
                    </div>
                    <div className="text-[11px] text-slate-400 font-semibold hidden md:block shrink-0">
                        Procurement Intelligence & Expenditure Auditing
                    </div>
                </div>
            )}

            {/* Header Title & Date Range Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 md:w-7 md:h-7 text-blue-900" />
                        Procurement & Financial Reports
                        <Badge className="bg-blue-50 text-blue-900 border-blue-200 text-xs font-bold">
                            {totalRequests} Transactions Analyzed
                        </Badge>
                    </h1>
                    <p className="text-xs md:text-sm text-slate-500 mt-0.5">
                        Comprehensive expenditure metrics for requisitions, approvals, and authorized supplier disbursements.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 bg-white border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50 shadow-xs"
                        onClick={handleExportCSV}
                    >
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        Export CSV Report
                    </Button>
                </div>
            </div>

            {/* Date Preset & Range Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                {/* Preset Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
                    <button
                        type="button"
                        onClick={() => handleApplyPreset('this_month')}
                        className={cn(
                            "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                            selectedPreset === 'this_month'
                                ? "bg-blue-900 text-white shadow-xs"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                    >
                        This Month
                    </button>
                    <button
                        type="button"
                        onClick={() => handleApplyPreset('last_month')}
                        className={cn(
                            "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                            selectedPreset === 'last_month'
                                ? "bg-blue-900 text-white shadow-xs"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                    >
                        Last Month
                    </button>
                    <button
                        type="button"
                        onClick={() => handleApplyPreset('last_3_months')}
                        className={cn(
                            "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                            selectedPreset === 'last_3_months'
                                ? "bg-blue-900 text-white shadow-xs"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                    >
                        Last 3 Months
                    </button>
                    <button
                        type="button"
                        onClick={() => handleApplyPreset('ytd')}
                        className={cn(
                            "h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                            selectedPreset === 'ytd'
                                ? "bg-blue-900 text-white shadow-xs"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                    >
                        Year to Date
                    </button>
                </div>

                {/* Custom Date Pickers */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                        <Calendar size={13} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase">From:</span>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => {
                                setStartDate(e.target.value);
                                setSelectedPreset('this_month');
                            }}
                            className="bg-transparent border-none text-xs text-slate-700 outline-none p-0 cursor-pointer"
                        />
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                        <Calendar size={13} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase">To:</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => {
                                setEndDate(e.target.value);
                                setSelectedPreset('this_month');
                            }}
                            className="bg-transparent border-none text-xs text-slate-700 outline-none p-0 cursor-pointer"
                        />
                    </div>
                </div>
            </div>

            {/* ── 1. Executive Top Metric Cards ────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Requisitions */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Requisitions</span>
                        <div className="p-2 bg-blue-50 text-blue-900 rounded-xl">
                            <FileText size={16} />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900">{totalRequests}</span>
                        <span className="text-xs font-bold text-blue-900">Total Orders</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Requisitions submitted during period
                    </div>
                </Card>

                {/* 2. Total Authorized Spend */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Authorized Spend</span>
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                            <DollarSign size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-lg font-black text-slate-900 leading-tight">
                            {totalSpent.toLocaleString()} <span className="text-xs font-medium text-slate-500">TZS</span>
                        </div>
                        <div className="text-[11px] font-bold text-emerald-600 mt-0.5">
                            Approved & Completed Spend
                        </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Cumulative authorized expenditure
                    </div>
                </Card>

                {/* 3. Approved Orders & Rate */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Approved Orders</span>
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <CheckCircle2 size={16} />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900">{approvedCount}</span>
                        <span className="text-xs font-bold text-indigo-600">{approvalRate}% Approved</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Orders cleared for procurement & payment
                    </div>
                </Card>

                {/* 4. Active Procurement Cycle */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">In Active Pipeline</span>
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                            <Clock size={16} />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900">{pendingCount}</span>
                        <span className="text-xs font-bold text-amber-600">Pending Actions</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Waiting review or management approval
                    </div>
                </Card>
            </div>

            {/* ── 2. Detailed Breakdown Grid ────────────────────────────── */}
            {isLoading ? (
                <Card className="border border-slate-200 bg-white p-16 rounded-2xl text-center shadow-xs">
                    <Loader2 size={28} className="mx-auto text-blue-900 animate-spin mb-3" />
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Generating Financial Analytics...
                    </p>
                </Card>
            ) : (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Status Breakdown Section */}
                    <Card className="border border-slate-200 bg-white rounded-2xl shadow-xs overflow-hidden lg:col-span-2">
                        <CardHeader className="bg-slate-50/50 border-b p-5 flex flex-row items-center justify-between">
                            <div className="space-y-0.5">
                                <CardTitle className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-blue-900" />
                                    Expenditure & Volume by Status
                                </CardTitle>
                                <p className="text-xs text-slate-400 font-medium">
                                    Breakdown across full requisition and fulfillment lifecycle.
                                </p>
                            </div>
                        </CardHeader>
                        <CardContent className="p-5 space-y-3">
                            {statusBreakdown.map((item) => (
                                <div
                                    key={item.key}
                                    className="p-4 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:border-blue-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                >
                                    <div className="flex items-center gap-3 min-w-[200px]">
                                        <div className={cn("w-2.5 h-2.5 rounded-full", item.bg)} />
                                        <div>
                                            <span className="text-xs font-bold text-slate-800 uppercase tracking-tight block">
                                                {item.label}
                                            </span>
                                            <span className="text-[11px] text-slate-400 font-medium">
                                                {item.count} {item.count === 1 ? 'Requisition' : 'Requisitions'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Progress Bar Display */}
                                    <div className="flex-1 max-w-xs hidden md:block">
                                        <div className="h-2 w-full bg-slate-200/70 rounded-full overflow-hidden">
                                            <div
                                                className={cn("h-full rounded-full transition-all duration-500", item.bg)}
                                                style={{ width: `${Math.min(100, item.percentage || (item.count > 0 ? 10 : 0))}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="text-right sm:min-w-[140px]">
                                        <div className="text-xs font-black text-slate-900">
                                            {item.value.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">TZS</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-400">
                                            {item.percentage}% of Spend
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Top Suppliers Leaderboard */}
                    <Card className="border border-slate-200 bg-white rounded-2xl shadow-xs overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b p-5">
                            <CardTitle className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-emerald-600" />
                                Top Suppliers
                            </CardTitle>
                            <p className="text-xs text-slate-400 font-medium">
                                Vendors ranked by total procurement value.
                            </p>
                        </CardHeader>
                        <CardContent className="p-5 space-y-3">
                            {vendorLeaderboard.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 text-xs italic">
                                    No vendor data available for selected period.
                                </div>
                            ) : (
                                vendorLeaderboard.map((vendor, idx) => (
                                    <div
                                        key={idx}
                                        className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:border-emerald-200 transition-all flex items-center justify-between gap-3"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-black flex items-center justify-center">
                                                #{idx + 1}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-800 truncate max-w-[130px]">
                                                    {vendor.name}
                                                </p>
                                                <p className="text-[10px] text-slate-400 font-medium">
                                                    {vendor.count} {vendor.count === 1 ? 'Order' : 'Orders'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <span className="text-xs font-black text-slate-900 block leading-tight">
                                                {vendor.value.toLocaleString()} <span className="text-[9px] text-slate-400 font-normal">TZS</span>
                                            </span>
                                            <span className="text-[9px] font-bold text-emerald-600">
                                                Authorized
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ── 3. Detailed Audited Transactions Log ─────────────────── */}
                <Card className="border border-slate-200 bg-white rounded-2xl shadow-xs overflow-hidden mt-6">
                    <CardHeader className="bg-slate-50/60 border-b p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-0.5">
                            <CardTitle className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                                <FileCheck className="w-4 h-4 text-blue-900" />
                                Detailed Audited Transactions Log
                                <Badge className="bg-blue-50 text-blue-900 border-blue-200 text-xs font-bold">
                                    {filteredTransactions.length} Records
                                </Badge>
                            </CardTitle>
                            <p className="text-xs text-slate-400 font-medium">
                                Individual procurement requisitions and expenditure records for the selected date window.
                            </p>
                        </div>

                        {/* Search & Filter Controls */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                <Input
                                    placeholder="Search item, PO, vehicle, supplier..."
                                    className="pl-9 pr-8 h-8 bg-white border-slate-200 text-xs font-medium rounded-xl"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm("")}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </CardHeader>

                    {/* Status Filter Tabs */}
                    <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/30 flex items-center gap-1.5 overflow-x-auto">
                        {['All', 'Paid', 'Approved', 'Closed', 'Pending'].map((st) => (
                            <button
                                key={st}
                                type="button"
                                onClick={() => setStatusFilter(st)}
                                className={cn(
                                    "h-7 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                                    statusFilter === st
                                        ? "bg-blue-900 text-white shadow-xs"
                                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                                )}
                            >
                                {st === 'All' ? 'All Transactions' : st}
                            </button>
                        ))}
                    </div>

                    <CardContent className="p-5">
                        {filteredTransactions.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 italic text-xs">
                                No transaction records found matching your filters.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {filteredTransactions.map((tx: any, tIdx: number) => {
                                    const qty = tx.quantity_approved || tx.quantity_requested || 1;
                                    const unitPrice = tx.unit_price || 0;
                                    const total = tx.total_price || (qty * unitPrice);

                                    let accentColor = "bg-slate-400";
                                    let statusBadgeClass = "bg-slate-100 text-slate-700 border-slate-200";
                                    if (tx.status === 'Paid') {
                                        accentColor = "bg-emerald-500";
                                        statusBadgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
                                    } else if (tx.status === 'Approved') {
                                        accentColor = "bg-blue-600";
                                        statusBadgeClass = "bg-blue-50 text-blue-700 border-blue-200";
                                    } else if (tx.status === 'Closed') {
                                        accentColor = "bg-teal-600";
                                        statusBadgeClass = "bg-teal-50 text-teal-700 border-teal-200";
                                    } else if (tx.status === 'Pending' || tx.status === 'Awaiting Approval') {
                                        accentColor = "bg-amber-500";
                                        statusBadgeClass = "bg-amber-50 text-amber-700 border-amber-200";
                                    }

                                    return (
                                        <div
                                            key={tx.id}
                                            className="relative group/card bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:shadow-md transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 overflow-hidden"
                                        >
                                            <div className={cn("absolute left-0 top-0 bottom-0 w-1.5", accentColor)} />
                                            <div className="flex items-start gap-3 flex-1 min-w-[260px]">
                                                <span className="text-[10px] font-black text-slate-300 tabular-nums mt-1">
                                                    {(tIdx + 1).toString().padStart(2, '0')}
                                                </span>
                                                <div className="space-y-1.5 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-black text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
                                                            <Package size={14} className="text-blue-900" />
                                                            {tx.item_name}
                                                        </span>
                                                        <Badge variant="outline" className="font-mono text-xs text-blue-900 bg-white border-blue-200 font-bold">
                                                            PO #: {tx.po_number || 'DRAFT'}
                                                        </Badge>
                                                        {tx.vehicle && (
                                                            <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-100 font-bold">
                                                                <Truck className="w-3 h-3 mr-1" />
                                                                {tx.vehicle.vehicle_no || tx.vehicle.horse_number}
                                                            </Badge>
                                                        )}
                                                        <Badge className={cn("text-[10px] font-bold uppercase", statusBadgeClass)}>
                                                            {tx.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-medium">
                                                        <span>Vendor: <strong className="text-slate-700">{tx.garage_suppliers?.name || 'Unassigned / Workshop'}</strong></span>
                                                        <span>•</span>
                                                        <span>Date: <strong className="text-slate-700">{tx.created_at ? format(new Date(tx.created_at), 'dd MMM yyyy') : 'N/A'}</strong></span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between lg:justify-end gap-6 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-6 w-full lg:w-auto">
                                                <div className="space-y-0.5 min-w-[80px]">
                                                    <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Quantity</span>
                                                    <div className="text-xs font-black text-slate-800">
                                                        {qty} Units
                                                    </div>
                                                </div>

                                                <div className="space-y-0.5 pl-4 border-l border-slate-100 min-w-[95px]">
                                                    <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Unit Price</span>
                                                    <div className="text-xs font-black text-slate-800">
                                                        {unitPrice.toLocaleString()} TZS
                                                    </div>
                                                </div>

                                                <div className="space-y-0.5 pl-4 border-l border-slate-100 text-right min-w-[110px]">
                                                    <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Total Amount</span>
                                                    <div className="text-xs font-black text-slate-900 leading-none">
                                                        {total.toLocaleString()} TZS
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </>
            )}
        </div>
    );
};

export default ProcurementReports;
