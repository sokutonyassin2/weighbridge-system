import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase as sb } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
    Loader2, 
    Truck, 
    Package, 
    Calendar, 
    Wrench, 
    Search, 
    X, 
    Layers, 
    ChevronDown, 
    ChevronRight, 
    DollarSign, 
    ExternalLink, 
    CheckCircle2,
    ClipboardCheck,
    FileCheck,
    BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const ReplacedVehicleParts = () => {
    const navigate = useNavigate();
    const { userProfile, userRole } = useAuth();
    const isAdmin = userRole === 'admin' || userRole === 'super_admin' || userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [expandedVehicles, setExpandedVehicles] = useState<string[]>([]);

    // Fetch all closed requisitions for vehicles
    const { data: replacedParts, isLoading } = useQuery({
        queryKey: ["replaced-vehicle-parts"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_requisitions")
                .select(`
                    *,
                    vehicle:logistics_fleet(id, vehicle_no, horse_number, make_model),
                    garage_suppliers(name)
                `)
                .eq("status", "Closed")
                .not("vehicle_id", "is", null)
                .order("status_updated_at", { ascending: false });

            if (error) throw error;
            return data;
        },
    });

    // Filter and group parts by vehicle
    const groupedParts = useMemo(() => {
        if (!replacedParts) return {};
        
        let filteredParts = replacedParts;

        // Apply Search Filter (Plate number, item name)
        if (searchTerm.trim() !== '') {
            const lowerSearch = searchTerm.toLowerCase();
            filteredParts = filteredParts.filter(part => {
                const vehicle = part.vehicle;
                const plateNo = (vehicle?.vehicle_no || vehicle?.horse_number || `Vehicle ID: ${vehicle?.id}`).toLowerCase();
                const makeModel = (vehicle?.make_model || '').toLowerCase();
                const itemName = (part.item_name || '').toLowerCase();
                return plateNo.includes(lowerSearch) || makeModel.includes(lowerSearch) || itemName.includes(lowerSearch);
            });
        }

        // Apply Date Filter
        if (dateFrom) {
            filteredParts = filteredParts.filter(part => {
                if (!part.status_updated_at) return false;
                return new Date(part.status_updated_at) >= new Date(dateFrom);
            });
        }
        if (dateTo) {
            filteredParts = filteredParts.filter(part => {
                if (!part.status_updated_at) return false;
                const toDate = new Date(dateTo);
                toDate.setHours(23, 59, 59, 999);
                return new Date(part.status_updated_at) <= toDate;
            });
        }
        
        return filteredParts.reduce((acc, part) => {
            const vehicle = part.vehicle;
            if (!vehicle) return acc;
            
            const vehicleIdentifier = vehicle.vehicle_no || vehicle.horse_number || `Vehicle ID: ${vehicle.id}`;
            
            if (!acc[vehicleIdentifier]) {
                acc[vehicleIdentifier] = [];
            }
            acc[vehicleIdentifier].push(part);
            return acc;
        }, {} as Record<string, any[]>);
    }, [replacedParts, searchTerm, dateFrom, dateTo]);

    const vehicleKeys = useMemo(() => Object.keys(groupedParts), [groupedParts]);

    // Financial & Operational Metrics
    const totalPartsCount = useMemo(() => {
        return Object.values(groupedParts).reduce((sum, parts) => sum + parts.length, 0);
    }, [groupedParts]);

    const totalExpenditure = useMemo(() => {
        return Object.values(groupedParts).reduce((sum, parts) => {
            return sum + parts.reduce((pSum, part) => pSum + (Number(part.total_price) || 0), 0);
        }, 0);
    }, [groupedParts]);

    const avgSpendPerVehicle = useMemo(() => {
        if (vehicleKeys.length === 0) return 0;
        return Math.round(totalExpenditure / vehicleKeys.length);
    }, [totalExpenditure, vehicleKeys.length]);

    const isAllExpanded = vehicleKeys.length > 0 && vehicleKeys.every(k => expandedVehicles.includes(k));

    const handleToggleAll = () => {
        if (isAllExpanded) {
            setExpandedVehicles([]);
        } else {
            setExpandedVehicles(vehicleKeys);
        }
    };

    const toggleVehicle = (vehicleId: string) => {
        setExpandedVehicles(prev =>
            prev.includes(vehicleId) ? prev.filter(v => v !== vehicleId) : [...prev, vehicleId]
        );
    };

    const clearFilters = () => {
        setSearchTerm('');
        setDateFrom('');
        setDateTo('');
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
                            variant="default"
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shadow-xs shrink-0"
                        >
                            <Wrench className="w-4 h-4" />
                            <span>Replaced Parts Archive</span>
                            <Badge className="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0 h-4 border-none">
                                {vehicleKeys.length}
                            </Badge>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/procurement/reports")}
                            className="text-slate-700 hover:text-blue-900 hover:bg-blue-50 border-slate-200 font-bold text-xs h-9 px-3.5 rounded-xl gap-2 shrink-0"
                        >
                            <BarChart3 className="w-4 h-4 text-blue-900" />
                            <span>Procurement Reports</span>
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        </Button>
                    </div>
                    <div className="text-[11px] text-slate-400 font-semibold hidden md:block shrink-0">
                        Lifecycle & Asset Maintenance Logs
                    </div>
                </div>
            )}

            {/* Header Title */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Wrench className="w-6 h-6 md:w-7 md:h-7 text-emerald-600" />
                        Replaced Vehicle Parts
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-bold">
                            {totalPartsCount} Parts Replaced
                        </Badge>
                    </h1>
                    <p className="text-xs md:text-sm text-slate-500 mt-0.5">
                        Track historically closed garage requisitions and decommissioned spare parts per fleet vehicle.
                    </p>
                </div>
            </div>

            {/* ── 1. Executive Top Metric Cards ────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Serviced Vehicles */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Serviced Fleet</span>
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                            <Truck size={16} />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900">{vehicleKeys.length}</span>
                        <span className="text-xs font-bold text-emerald-600">Trucks</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Vehicles with recorded parts replacements
                    </div>
                </Card>

                {/* 2. Replaced Parts */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Replaced Parts</span>
                        <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                            <Package size={16} />
                        </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900">{totalPartsCount}</span>
                        <span className="text-xs font-bold text-teal-600">Total Items</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Old parts removed & refreshed by workshop
                    </div>
                </Card>

                {/* 3. Total Maintenance Spend */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Replacement Spend</span>
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                            <DollarSign size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-lg font-black text-slate-900 leading-tight">
                            {totalExpenditure.toLocaleString()} <span className="text-xs font-medium text-slate-500">TZS</span>
                        </div>
                        <div className="text-[11px] font-bold text-blue-600 mt-0.5">
                            Realized Replacement Value
                        </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Closed maintenance requisitions expenditure
                    </div>
                </Card>

                {/* 4. Average Cost per Truck */}
                <Card className="border border-slate-200 bg-white p-4 rounded-2xl shadow-xs hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Average / Truck</span>
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <CheckCircle2 size={16} />
                        </div>
                    </div>
                    <div className="mt-2">
                        <div className="text-lg font-black text-slate-900 leading-tight">
                            {avgSpendPerVehicle.toLocaleString()} <span className="text-xs font-medium text-slate-500">TZS</span>
                        </div>
                        <div className="text-[11px] font-bold text-indigo-600 mt-0.5">
                            Spend Per Truck
                        </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-medium">
                        Mean parts replacement maintenance cost
                    </div>
                </Card>
            </div>

            {/* ── 2. Operations Control Toolbar ────────────────────────────── */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                {/* Universal Search Input */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                        placeholder="Search by vehicle plate, model, part name..."
                        className="pl-9 pr-8 h-9 bg-slate-50 border-slate-200 focus:bg-white text-xs font-medium rounded-xl"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            onClick={() => setSearchTerm("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>

                {/* Date Filters & Controls */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                        <Calendar size={13} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase">From:</span>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="bg-transparent border-none text-xs text-slate-700 outline-none p-0 cursor-pointer"
                        />
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
                        <Calendar size={13} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase">To:</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="bg-transparent border-none text-xs text-slate-700 outline-none p-0 cursor-pointer"
                        />
                    </div>

                    {(searchTerm || dateFrom || dateTo) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearFilters}
                            className="h-8 px-2.5 text-xs font-bold text-slate-500 hover:text-slate-800"
                        >
                            Clear
                        </Button>
                    )}

                    {/* Master Expand / Collapse All */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleToggleAll}
                        className="h-8 px-3 text-xs font-bold text-slate-600 border-slate-200 hover:bg-slate-50 gap-1.5 rounded-xl ml-auto lg:ml-0"
                    >
                        <Layers size={13} className="text-slate-400" />
                        <span>{isAllExpanded ? "Collapse All" : "Expand All"}</span>
                    </Button>
                </div>
            </div>

            {/* ── 3. Content List (Active Operations Card Layout) ────────────── */}
            {isLoading ? (
                <Card className="border border-slate-200 bg-white p-16 rounded-2xl text-center shadow-xs">
                    <Loader2 size={28} className="mx-auto text-emerald-600 animate-spin mb-3" />
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Loading Replaced Parts Records...
                    </p>
                </Card>
            ) : vehicleKeys.length === 0 ? (
                <Card className="border border-slate-200 bg-white p-16 rounded-2xl text-center shadow-xs">
                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <Package size={28} className="text-slate-400" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                        No Replaced Parts Found
                    </h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 font-medium">
                        {searchTerm || dateFrom || dateTo
                            ? "No closed maintenance requisitions match your search and date filters."
                            : "There are currently no closed requisitions for vehicle parts in the system."}
                    </p>
                    {(searchTerm || dateFrom || dateTo) && (
                        <div className="mt-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={clearFilters}
                                className="h-8 px-4 text-xs font-bold rounded-xl"
                            >
                                Reset Filters
                            </Button>
                        </div>
                    )}
                </Card>
            ) : (
                <div className="space-y-4">
                    {vehicleKeys.map((vehicleId) => {
                        const parts = groupedParts[vehicleId];
                        const totalSpent = parts.reduce((sum, part) => sum + (Number(part.total_price) || 0), 0);
                        const isExpanded = expandedVehicles.includes(vehicleId);
                        const firstPart = parts[0];
                        const makeModel = firstPart?.vehicle?.make_model;

                        return (
                            <Card
                                key={vehicleId}
                                className="border border-slate-200 bg-white shadow-xs rounded-2xl overflow-hidden transition-all duration-200"
                            >
                                {/* Accordion Header */}
                                <div
                                    onClick={() => toggleVehicle(vehicleId)}
                                    className="p-4 sm:p-5 bg-gradient-to-r from-emerald-50/40 via-white to-slate-50/50 hover:from-emerald-100/40 hover:to-slate-100/60 border-b border-slate-200 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none"
                                >
                                    <div className="flex items-center gap-3.5 flex-1">
                                        <div className="text-slate-400 transition-transform duration-200">
                                            {isExpanded ? <ChevronDown size={20} className="text-slate-700" /> : <ChevronRight size={20} />}
                                        </div>

                                        <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-xs">
                                            <Truck size={18} />
                                        </div>

                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-base font-black text-slate-900 tracking-tight uppercase">
                                                    {vehicleId}
                                                </h3>
                                                {makeModel && (
                                                    <span className="text-xs text-slate-500 font-medium">
                                                        ({makeModel})
                                                    </span>
                                                )}
                                                <Badge className="bg-emerald-600 text-white border-none text-[10px] font-black px-2 h-5 rounded-md">
                                                    {parts.length} {parts.length === 1 ? 'Part Replaced' : 'Parts Replaced'}
                                                </Badge>
                                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                                                    CLOSED & ARCHIVED
                                                </Badge>
                                            </div>
                                            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                                                Fleet Vehicle Maintenance • Latest Replaced: {parts[0]?.status_updated_at ? format(new Date(parts[0].status_updated_at), 'dd/MM/yyyy') : 'N/A'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Financial Total & Toggle Button */}
                                    <div className="flex items-center gap-4 sm:gap-6 self-end sm:self-center">
                                        <div className="space-y-0.5 text-right">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total Maintenance Spend</span>
                                            <div className="text-sm font-black text-emerald-600 leading-none">
                                                {totalSpent.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">TZS</span>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400 block">
                                                {parts.length} Spare Units
                                            </span>
                                        </div>

                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleVehicle(vehicleId);
                                            }}
                                            className="h-8 text-xs font-bold text-slate-600 border-slate-200 hover:bg-slate-50 rounded-xl"
                                        >
                                            {isExpanded ? "Collapse" : "View Parts"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Expanded Item Cards (Active Operations Style) */}
                                {isExpanded && (
                                    <div className="p-4 sm:p-5 bg-slate-50/40 space-y-3">
                                        {parts.map((part: any, pIdx: number) => {
                                            const qty = part.quantity_approved || part.quantity_requested || 1;
                                            const unitPrice = part.unit_price || 0;
                                            const lineTotal = Number(part.total_price) || (qty * unitPrice);

                                            return (
                                                <div
                                                    key={part.id}
                                                    className="relative group/card bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:shadow-md hover:border-emerald-300 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 overflow-hidden"
                                                >
                                                    {/* Emerald Left Accent Bar */}
                                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />

                                                    {/* 1. Item Details */}
                                                    <div className="flex items-start gap-3 flex-1 min-w-[260px]">
                                                        <span className="text-[10px] font-black text-slate-300 tabular-nums mt-1">
                                                            {(pIdx + 1).toString().padStart(2, '0')}
                                                        </span>

                                                        <div className="space-y-1.5 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-black text-slate-900 text-sm tracking-tight flex items-center gap-1.5">
                                                                    <Wrench size={14} className="text-emerald-600" />
                                                                    {part.item_name || 'Unnamed Spare Part'}
                                                                </span>

                                                                <Badge className="bg-slate-100 text-slate-700 border-slate-200 font-mono text-[10px] font-bold">
                                                                    {part.po_number ? `PO: ${part.po_number}` : `REQ-${part.id.substring(0, 8).toUpperCase()}`}
                                                                </Badge>

                                                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold uppercase">
                                                                    Replaced
                                                                </Badge>
                                                            </div>

                                                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-medium">
                                                                <span>Decommissioned Date: <strong className="text-slate-700">
                                                                    {part.status_updated_at ? format(new Date(part.status_updated_at), 'dd MMM yyyy') : 'N/A'}
                                                                </strong></span>
                                                                {part.supplier_id && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span>Vendor: <strong className="text-slate-700">{part.garage_suppliers?.name || 'Verified Supplier'}</strong></span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 2. Quantities & Financial Breakdown */}
                                                    <div className="flex items-center justify-between lg:justify-end gap-6 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-6 w-full lg:w-auto">
                                                        <div className="space-y-0.5 min-w-[90px]">
                                                            <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Replaced Qty</span>
                                                            <div className="text-xs font-black text-slate-800">
                                                                {qty} Units
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                Installed
                                                            </span>
                                                        </div>

                                                        <div className="space-y-0.5 pl-4 border-l border-slate-100 min-w-[100px]">
                                                            <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Unit Price</span>
                                                            <div className="text-xs font-black text-slate-800">
                                                                {unitPrice.toLocaleString()} TZS
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                Cost / unit
                                                            </span>
                                                        </div>

                                                        <div className="space-y-0.5 pl-4 border-l border-slate-100 text-right min-w-[110px]">
                                                            <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Total Spent</span>
                                                            <div className="text-xs font-black text-emerald-600 leading-none">
                                                                {lineTotal.toLocaleString()} TZS
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                Realized
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ReplacedVehicleParts;
