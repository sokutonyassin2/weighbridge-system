import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Package, ShoppingCart, Calendar, FileBarChart, Printer, Truck, Tag, Store, CreditCard, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const InventoryReports = () => {
    const sb = supabase as any;
    const now = new Date();
    const [selectedMonth, setSelectedMonth] = useState<string>(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    );
    const [activeTab, setActiveTab] = useState<"all" | "store" | "procurement">("all");

    // Dynamic Month Options (Last 12 Months + Daily Option)
    const monthOptions = useMemo(() => {
        const opts: { value: string; label: string }[] = [
            { value: "daily", label: "Today (Daily Live)" }
        ];
        const d = new Date();
        for (let i = 0; i < 12; i++) {
            const year = d.getFullYear();
            const month = d.getMonth();
            const val = `${year}-${String(month + 1).padStart(2, '0')}`;
            const label = d.toLocaleString('en', { month: 'long', year: 'numeric' });
            opts.push({ value: val, label });
            d.setMonth(d.getMonth() - 1);
        }
        return opts;
    }, []);

    // Fetch Fleet Vehicles to resolve vehicle plates
    const { data: fleetVehicles = [] } = useQuery({
        queryKey: ["all-fleet-vehicles-lookup"],
        queryFn: async () => {
            try {
                const { data } = await sb.from("logistics_fleet").select("id, plate_number, vehicle_no, horse_number, trailer_number");
                return data || [];
            } catch {
                return [];
            }
        }
    });

    // Fetch Inventory Catalog to resolve unit prices and categories
    const { data: inventoryCatalog = [] } = useQuery({
        queryKey: ["all-inventory-catalog-lookup"],
        queryFn: async () => {
            try {
                const { data } = await sb.from("garage_inventory").select("id, item_name, category, unit_price, selling_price");
                return data || [];
            } catch {
                return [];
            }
        }
    });

    // Fetch Profiles to resolve UUIDs
    const { data: userProfiles = [] } = useQuery({
        queryKey: ["all-profiles-lookup"],
        queryFn: async () => {
            try {
                const { data } = await sb.from("profiles").select("id, full_name, email");
                return data || [];
            } catch {
                return [];
            }
        }
    });

    // Fetch Garage Personnel to resolve mechanic names
    const { data: garagePersonnel = [] } = useQuery({
        queryKey: ["all-personnel-lookup"],
        queryFn: async () => {
            try {
                const { data } = await sb.from("garage_personnel").select("id, name");
                return data || [];
            } catch {
                return [];
            }
        }
    });

    // Name Resolution Helper
    const resolveUserName = (rawRecord: any) => {
        if (!rawRecord) return "Garage Staff";

        if (typeof rawRecord === "string") {
            const trimmed = rawRecord.trim();
            if (!trimmed) return "Garage Staff";
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
            if (isUUID) {
                const foundUser = userProfiles.find((p: any) => p.id === trimmed);
                if (foundUser?.full_name) return foundUser.full_name;
                const foundPersonnel = garagePersonnel.find((p: any) => p.id === trimmed);
                if (foundPersonnel?.name) return foundPersonnel.name;
                return "Garage Staff";
            }
            return trimmed;
        }

        const candidates = [
            rawRecord.issued_to,
            rawRecord.requested_by_name,
            rawRecord.driver_name,
            rawRecord.mechanic_name,
            rawRecord.created_by_name
        ];

        for (const c of candidates) {
            if (c && typeof c === 'string' && c.trim() && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.trim())) {
                return c.trim();
            }
        }

        const uuidCandidates = [
            rawRecord.requested_by,
            rawRecord.created_by,
            rawRecord.mechanic_id,
            rawRecord.issued_to
        ];

        for (const uid of uuidCandidates) {
            if (uid && typeof uid === 'string') {
                const trimmed = uid.trim();
                const foundUser = userProfiles.find((p: any) => p.id === trimmed);
                if (foundUser?.full_name) return foundUser.full_name;
                const foundPersonnel = garagePersonnel.find((p: any) => p.id === trimmed);
                if (foundPersonnel?.name) return foundPersonnel.name;
            }
        }

        return "Garage Staff";
    };

    const resolveVehiclePlate = (vehicleId: string) => {
        if (!vehicleId) return "-";
        const v = fleetVehicles.find((veh: any) => veh.id === vehicleId);
        return v?.plate_number || v?.vehicle_no || v?.horse_number || v?.trailer_number || "-";
    };

    // Fetch Combined Logs: Storeroom Usage + Procured / Paid Requisitions
    const { data: usageLogs = [], isLoading } = useQuery({
        queryKey: ["inventory-reports-usage-all", selectedMonth, inventoryCatalog.length, fleetVehicles.length],
        queryFn: async () => {
            const [usageRes, reqRes] = await Promise.all([
                sb
                    .from("garage_inventory_usage")
                    .select("*")
                    .eq("is_deleted", false)
                    .order("created_at", { ascending: false }),
                sb
                    .from("garage_requisitions")
                    .select("*")
                    .eq("is_deleted", false)
                    .in("status", ["Closed", "Completed", "Approved", "Paid"])
                    .order("created_at", { ascending: false })
            ]);

            const usageData = (!usageRes.error && usageRes.data) ? usageRes.data : [];
            const reqData = (!reqRes.error && reqRes.data) ? reqRes.data : [];

            // Price fallback map from inventory & requisitions
            const priceMap: Record<string, number> = {};
            const catMap: Record<string, string> = {};

            inventoryCatalog.forEach((inv: any) => {
                const price = inv.unit_price || inv.selling_price || 0;
                if (inv.id && price > 0) priceMap[inv.id] = price;
                if (inv.item_name && price > 0) priceMap[inv.item_name.toLowerCase().trim()] = price;
                if (inv.id && inv.category) catMap[inv.id] = inv.category;
                if (inv.item_name && inv.category) catMap[inv.item_name.toLowerCase().trim()] = inv.category;
            });

            reqData.forEach((r: any) => {
                if (r.item_id && r.unit_price > 0 && !priceMap[r.item_id]) priceMap[r.item_id] = r.unit_price;
                if (r.item_name && r.unit_price > 0 && !priceMap[r.item_name.toLowerCase().trim()]) {
                    priceMap[r.item_name.toLowerCase().trim()] = r.unit_price;
                }
            });

            // 1. Process Storeroom Usage
            const formattedUsage = usageData.map((log: any) => {
                const itemName = log.item_name || "Store Item";
                const unitPrice = priceMap[log.item_id] || priceMap[itemName.toLowerCase().trim()] || 0;
                const category = catMap[log.item_id] || catMap[itemName.toLowerCase().trim()] || "Garage Store";
                const qty = log.quantity_used || 1;
                return {
                    id: `usage-${log.id}`,
                    source: "store",
                    created_at: log.created_at,
                    issued_to: log.issued_to || resolveUserName(log),
                    category,
                    item_name: itemName,
                    quantity: qty,
                    unit_price: unitPrice,
                    total_value: qty * unitPrice,
                    vehicle_id: log.vehicle_id,
                    vehicle_plate: resolveVehiclePlate(log.vehicle_id),
                    status: log.status || "Approved"
                };
            });

            // 2. Process Procured / Paid Items
            const formattedProcurement = reqData.map((req: any) => {
                const itemName = req.item_name || "Procured Item";
                const unitPrice = req.unit_price || priceMap[req.item_id] || priceMap[itemName.toLowerCase()?.trim()] || 0;
                const qty = req.quantity_requested || req.quantity || 1;
                return {
                    id: `req-${req.id}`,
                    source: "procurement",
                    created_at: req.status_updated_at || req.created_at,
                    issued_to: resolveUserName(req),
                    category: req.category || "Procured Parts",
                    item_name: itemName,
                    quantity: qty,
                    unit_price: unitPrice,
                    total_value: qty * unitPrice,
                    vehicle_id: req.vehicle_id,
                    vehicle_plate: resolveVehiclePlate(req.vehicle_id),
                    status: req.status || "Paid"
                };
            });

            const combined = [...formattedUsage, ...formattedProcurement];
            return combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
    });

    // Filter Logs by Selected Timeframe
    const filteredLogs = useMemo(() => {
        if (!usageLogs || usageLogs.length === 0) return [];
        const todayStr = new Date().toDateString();

        return usageLogs.filter((log: any) => {
            const date = new Date(log.created_at);
            if (selectedMonth === "daily") {
                return date.toDateString() === todayStr;
            }
            const [y, m] = selectedMonth.split('-').map(Number);
            return date.getMonth() === (m - 1) && date.getFullYear() === y;
        });
    }, [usageLogs, selectedMonth]);

    // Calculate Metrics for Current Filter
    const metrics = useMemo(() => {
        const totalItems = filteredLogs.reduce((acc: number, log: any) => acc + (log.quantity || 0), 0);
        const totalValue = filteredLogs.reduce((acc: number, log: any) => acc + (log.total_value || 0), 0);
        
        const storeLogs = filteredLogs.filter((l: any) => l.source === 'store');
        const procLogs = filteredLogs.filter((l: any) => l.source === 'procurement');

        const storeUnits = storeLogs.reduce((acc: number, l: any) => acc + (l.quantity || 0), 0);
        const storeValue = storeLogs.reduce((acc: number, l: any) => acc + (l.total_value || 0), 0);

        const procUnits = procLogs.reduce((acc: number, l: any) => acc + (l.quantity || 0), 0);
        const procValue = procLogs.reduce((acc: number, l: any) => acc + (l.total_value || 0), 0);

        // Top Item
        const itemCounts: Record<string, number> = {};
        filteredLogs.forEach((log: any) => {
            itemCounts[log.item_name] = (itemCounts[log.item_name] || 0) + log.quantity;
        });
        const topItem = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "---";

        return { 
            totalItems, totalValue, topItem, 
            storeUnits, storeValue, storeCount: storeLogs.length,
            procUnits, procValue, procCount: procLogs.length 
        };
    }, [filteredLogs]);

    const displayLogs = useMemo(() => {
        if (activeTab === "store") return filteredLogs.filter((l: any) => l.source === "store");
        if (activeTab === "procurement") return filteredLogs.filter((l: any) => l.source === "procurement");
        return filteredLogs;
    }, [filteredLogs, activeTab]);

    const handlePrint = () => window.print();

    return (
        <div className="space-y-6 p-4 sm:p-6 animate-fade-in bg-slate-50/30 min-h-screen">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <FileBarChart className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 shrink-0" />
                        <span>Inventory Consumption & Procurement</span>
                    </h1>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">
                        Track parts issued from the garage storeroom and direct purchases paid via procurement portal.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-full sm:w-56 bg-white shadow-sm border-slate-200 h-10 text-xs font-semibold">
                            <Calendar className="w-3.5 h-3.5 mr-1.5 text-indigo-600 shrink-0" />
                            <SelectValue placeholder="Select Month" />
                        </SelectTrigger>
                        <SelectContent>
                            {monthOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value} className="text-xs font-medium">
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="bg-white h-10 px-4 text-xs font-bold border-slate-200 hover:bg-slate-50 shadow-sm" onClick={handlePrint}>
                        <Printer className="w-4 h-4 mr-2" />
                        Print Report
                    </Button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                <Card className="border-none shadow-sm bg-white overflow-hidden group">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Total Units Consumed</CardTitle>
                        <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 group-hover:scale-105 transition-transform">
                            <ShoppingCart className="h-5 w-5" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{metrics.totalItems.toLocaleString()}</div>
                        <div className="flex items-center gap-2 mt-2 text-[10px] font-semibold text-slate-500 flex-wrap">
                            <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">
                                Store: {metrics.storeUnits} ({metrics.storeCount} logs)
                            </span>
                            <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">
                                Procured: {metrics.procUnits} ({metrics.procCount} logs)
                            </span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm bg-white overflow-hidden group">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Total Expenditure / Valuation</CardTitle>
                        <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600 group-hover:scale-105 transition-transform">
                            <TrendingUp className="h-5 w-5" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl sm:text-3xl font-bold text-emerald-600 tracking-tight">TZS {metrics.totalValue.toLocaleString()}</div>
                        <p className="text-[10px] text-slate-500 mt-2 font-medium">
                            Store: TZS {metrics.storeValue.toLocaleString()} | Procured: TZS {metrics.procValue.toLocaleString()}
                        </p>
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
                        <div className="text-lg sm:text-xl font-bold text-slate-900 truncate tracking-tight">{metrics.topItem}</div>
                        <p className="text-[11px] text-slate-500 mt-2 font-medium">Most frequently utilized in selected period</p>
                    </CardContent>
                </Card>
            </div>

            {/* Dedicated Tabs Navigation */}
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-xl border shadow-sm">
                    <TabsList className="bg-slate-100 p-1 flex flex-wrap h-auto w-full sm:w-auto gap-1">
                        <TabsTrigger value="all" className="text-xs font-bold gap-1.5 flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
                            <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>All Records ({filteredLogs.length})</span>
                        </TabsTrigger>
                        <TabsTrigger value="store" className="text-xs font-bold gap-1.5 flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm">
                            <Store className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Store Issued ({metrics.storeCount})</span>
                        </TabsTrigger>
                        <TabsTrigger value="procurement" className="text-xs font-bold gap-1.5 flex-1 sm:flex-initial data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                            <CreditCard className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>Procured & Paid ({metrics.procCount})</span>
                        </TabsTrigger>
                    </TabsList>

                    <Badge variant="outline" className="bg-slate-50 text-[11px] font-bold text-slate-700 py-1 px-3 border-slate-200 self-start sm:self-auto shrink-0">
                        {monthOptions.find(o => o.value === selectedMonth)?.label || selectedMonth}
                    </Badge>
                </div>

                {/* Table Content */}
                <TabsContent value={activeTab} className="m-0">
                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between py-4">
                            <div>
                                <CardTitle className="text-sm font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-indigo-600" />
                                    {activeTab === 'store' && 'Garage Store Issue Logs'}
                                    {activeTab === 'procurement' && 'Direct Procurement & Paid Purchases'}
                                    {activeTab === 'all' && 'Combined Consumption & Procurement Log'}
                                </CardTitle>
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                    Showing {displayLogs.length} items for {monthOptions.find(o => o.value === selectedMonth)?.label}
                                </p>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0 overflow-x-auto">
                            <Table className="min-w-[700px]">
                                <TableHeader>
                                    <TableRow className="bg-slate-50/40 border-b border-slate-100">
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-4 sm:px-6">Date & Time</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-4 sm:px-6">Source</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-4 sm:px-6">
                                            {activeTab === 'store' ? 'Issued To' : activeTab === 'procurement' ? 'Requested By' : 'Issued / Requested By'}
                                        </TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-4 sm:px-6">Vehicle</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-4 sm:px-6">Category</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-4 sm:px-6">Item Name</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-4 sm:px-6">Qty</TableHead>
                                        <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-4 sm:px-6">Total Value (TZS)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {displayLogs.length > 0 ? (
                                        displayLogs.map((log: any) => (
                                            <TableRow key={log.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                                <TableCell className="text-[11px] text-slate-600 font-medium py-3 px-4 sm:px-6 whitespace-nowrap">
                                                    {new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                </TableCell>
                                                <TableCell className="py-3 px-4 sm:px-6 whitespace-nowrap">
                                                    {log.source === 'procurement' ? (
                                                        <Badge variant="outline" className="text-[10px] font-bold py-0.5 px-2 bg-indigo-50 text-indigo-700 border-indigo-200">
                                                            Procured / Paid
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-[10px] font-bold py-0.5 px-2 bg-emerald-50 text-emerald-700 border-emerald-200">
                                                            Garage Store
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-[11px] font-bold text-slate-800 py-3 px-4 sm:px-6">
                                                    {log.issued_to}
                                                </TableCell>
                                                <TableCell className="text-[11px] font-semibold text-indigo-600 py-3 px-4 sm:px-6 whitespace-nowrap">
                                                    {log.vehicle_plate || "-"}
                                                </TableCell>
                                                <TableCell className="py-3 px-4 sm:px-6">
                                                    <Badge variant="outline" className="text-[11px] font-medium py-0.5 px-2 bg-slate-50 text-slate-600 border-slate-200">
                                                        {log.category || 'General'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-[11px] font-semibold text-slate-700 py-3 px-4 sm:px-6">
                                                    {log.item_name}
                                                </TableCell>
                                                <TableCell className="text-[11px] font-bold text-slate-900 py-3 px-4 sm:px-6">
                                                    {log.quantity}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-[11px] text-emerald-600 py-3 px-4 sm:px-6 whitespace-nowrap">
                                                    {log.total_value > 0 ? log.total_value.toLocaleString() : "0"}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-40 text-center text-sm text-slate-400 italic font-medium">
                                                No records found for the selected timeframe.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Management Footer Branding */}
            <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl flex items-center justify-between overflow-hidden relative group">
                <div className="relative z-10">
                    <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2 tracking-tight">
                        <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400" />
                        Operational Intelligence
                    </h3>
                    <p className="text-[11px] text-slate-300 max-w-xl mt-3 font-medium leading-relaxed opacity-90">
                        Detailed store and procurement analytics provided for management oversight. This data ensures zero-loss accountability and optimized part procurement cycles for Energy Feeds SudSud Group.
                    </p>
                </div>
                <div className="absolute right-[-40px] bottom-[-40px] opacity-10 group-hover:scale-105 transition-transform duration-1000 ease-out">
                    <BarChart3 className="w-64 h-64" />
                </div>
            </div>
        </div>
    );
};

export default InventoryReports;
