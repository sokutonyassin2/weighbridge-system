import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
    Search, 
    FileSpreadsheet, 
    Plus, 
    Trash2, 
    Save, 
    CheckCircle2, 
    AlertCircle,
    Download,
    Truck,
    ArrowRight,
    User,
    Calculator,
    Banknote,
    RotateCcw
} from "lucide-react";
import * as ExcelJS from 'exceljs';
import { format } from "date-fns";

interface SettlementItem {
    description: string;
    amount: string;
}

export default function Reconciliation() {
    const { user, userRole } = useAuth();
    const { toast } = useToast();
    const [searchPlate, setSearchPlate] = useState("");
    const [trips, setTrips] = useState<any[]>([]);
    const [selectedTrip, setSelectedTrip] = useState<any>(null);
    const [items, setItems] = useState<SettlementItem[]>([{ description: "", amount: "" }]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingReceipts, setIsLoadingReceipts] = useState(false);

    // Security Check: Super admin, Audit Clerk, Finance, Admin, Accountant
    const allowedRoles = ['super_admin', 'audit_clerk', 'finance', 'admin', 'accountant'];
    const hasAccess = allowedRoles.includes(userRole || '');

    useEffect(() => {
        if (hasAccess) {
            loadRecentTrips();
        }
    }, [hasAccess]);

    const loadRecentTrips = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('logistics_trip_sheets')
                .select(`
                    id, 
                    sheet_number,
                    reference_number, 
                    status, 
                    created_at,
                    expenses,
                    client_name,
                    origin,
                    destination,
                    vehicle:vehicle_id ( vehicle_no ),
                    driver:driver_id ( full_name )
                `)
                .order('created_at', { ascending: false })
                .limit(15);

            if (error) throw error;
            setTrips(data || []);
        } catch (err: any) {
            console.error("Error loading recent trips:", err);
        } finally {
            setIsLoading(false);
        }
    };

    if (!hasAccess) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Card className="w-full max-w-md text-center p-8">
                    <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
                    <CardTitle className="text-xl font-bold">Access Restricted</CardTitle>
                    <CardDescription className="mt-2">
                        You do not have permission to access the Trip Reconciliation portal. Allowed roles: Super Admin, Audit Clerk, Finance & Accounts.
                    </CardDescription>
                </Card>
            </div>
        );
    }

    const searchVehicles = async () => {
        if (!searchPlate.trim()) {
            loadRecentTrips();
            return;
        }
        setIsLoading(true);
        try {
            const query = searchPlate.trim();
            const { data, error } = await supabase
                .from('logistics_trip_sheets')
                .select(`
                    id, 
                    sheet_number,
                    reference_number, 
                    status, 
                    created_at,
                    expenses,
                    client_name,
                    origin,
                    destination,
                    vehicle:vehicle_id ( vehicle_no ),
                    driver:driver_id ( full_name )
                `)
                .or(`sheet_number.ilike.%${query}%,reference_number.ilike.%${query}%,client_name.ilike.%${query}%`)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setTrips(data || []);
            if (!data || data.length === 0) {
                toast({
                    title: "No Trips Found",
                    description: `No trip sheets matching "${query}"`,
                    variant: "destructive"
                });
            }
        } catch (err: any) {
            console.error(err);
            toast({
                title: "Search Error",
                description: err.message,
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectTrip = async (trip: any) => {
        setSelectedTrip(trip);
        setIsLoadingReceipts(true);
        try {
            const { data, error } = await supabase
                .from('logistics_trip_settlements')
                .select('*')
                .eq('trip_id', trip.id)
                .order('created_at', { ascending: true });

            if (error) throw error;

            if (data && data.length > 0) {
                setItems(data.map((s: any) => ({
                    description: s.receipt_description || "",
                    amount: s.amount_tzs ? s.amount_tzs.toString() : ""
                })));
                toast({
                    title: "Existing Receipts Loaded",
                    description: `Loaded ${data.length} previously entered receipt(s) for this trip.`
                });
            } else {
                setItems([{ description: "", amount: "" }]);
            }
        } catch (e: any) {
            console.error("Error loading settlements:", e);
            setItems([{ description: "", amount: "" }]);
        } finally {
            setIsLoadingReceipts(false);
        }
    };

    const calculateBudget = (expenses: any) => {
        if (!expenses) return 0;
        if (Array.isArray(expenses)) {
            return expenses.reduce((sum: number, exp: any) => sum + (parseFloat(exp.amount) || 0), 0);
        }
        return 0;
    };

    const calculateActualTotal = () => {
        return items.reduce((sum, i) => sum + (parseFloat(i.amount.replace(/,/g, '')) || 0), 0);
    };

    const handleAddItem = () => {
        setItems([...items, { description: "", amount: "" }]);
    };

    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const handleUpdateItem = (index: number, field: keyof SettlementItem, value: string) => {
        const newItems = [...items];
        newItems[index][field] = value;
        setItems(newItems);
    };

    const downloadTemplate = async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Receipts');
        
        // Add headers
        sheet.addRow(['Receipt Description', 'Amount (TShs)']);
        
        // Style headers
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFEDF2F7' }
        };

        // Add dummy data for example
        sheet.addRow(['Fuel Shell', '500000']);
        sheet.addRow(['Tolls Tanzania', '45000']);

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Receipt_Template_${selectedTrip?.sheet_number || selectedTrip?.reference_number || 'TRIP'}.xlsx`;
        a.click();
    };

    const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(file);
            const sheet = workbook.getWorksheet(1);
            
            const newItems: SettlementItem[] = [];
            sheet?.eachRow((row, rowNumber) => {
                if (rowNumber > 1) { // Skip header
                    const desc = row.getCell(1).value?.toString() || "";
                    const amt = row.getCell(2).value?.toString() || "";
                    if (desc && amt) {
                        newItems.push({ description: desc, amount: amt });
                    }
                }
            });

            if (newItems.length > 0) {
                setItems(newItems);
                toast({
                    title: "Excel Uploaded",
                    description: `Successfully loaded ${newItems.length} receipts.`
                });
            }
        } catch (err: any) {
            toast({
                title: "Excel Upload Error",
                description: err.message,
                variant: "destructive"
            });
        }
    };

    const saveSettlements = async () => {
        if (!selectedTrip || items.length === 0) return;
        
        setIsLoading(true);
        try {
            // First, delete any existing settlements for this trip to avoid duplicates on re-submission
            await supabase
                .from('logistics_trip_settlements')
                .delete()
                .eq('trip_id', selectedTrip.id);

            const validItems = items.filter(i => i.description && i.amount);
            if (validItems.length === 0) {
                toast({
                    title: "No Valid Receipts",
                    description: "Please enter at least one receipt description and amount.",
                    variant: "destructive"
                });
                return;
            }

            const settlements = validItems.map(i => ({
                trip_id: selectedTrip.id,
                receipt_description: i.description,
                amount_tzs: parseFloat(i.amount.replace(/,/g, '')),
                entered_by: user?.id,
                is_excel_upload: false
            }));

            const { error } = await supabase
                .from('logistics_trip_settlements')
                .insert(settlements);

            if (error) throw error;

            toast({
                title: "Settlement Saved ✓",
                description: `Successfully saved ${settlements.length} receipt(s) totaling TSh ${calculateActualTotal().toLocaleString()}.`,
            });
            
            loadRecentTrips();
        } catch (err: any) {
            toast({
                title: "Error Saving",
                description: err.message,
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const budget = selectedTrip ? calculateBudget(selectedTrip.expenses) : 0;
    const actual = calculateActualTotal();
    const variance = budget - actual;
    const isOverBudget = variance < 0;

    return (
        <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary rounded-xl text-white shadow-md">
                        <FileSpreadsheet size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Trip Reconciliation Portal</h1>
                        <p className="text-slate-500 font-medium text-xs mt-0.5">
                            Verify driver receipts against disbursed road advances to calculate refunds or reimbursements.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={loadRecentTrips} className="text-xs font-semibold gap-1.5">
                        <RotateCcw size={14} /> Refresh Trips
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Search Sidebar */}
                <div className="md:col-span-1 space-y-4">
                    <Card className="border-slate-200 shadow-sm">
                        <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                                <Search size={14} className="text-primary" /> 1. Locate Trip Sheet
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-slate-600">Trip Sheet / Ref / Client</Label>
                                <div className="flex gap-2">
                                    <Input 
                                        placeholder="e.g. TRP-001, Client..." 
                                        value={searchPlate}
                                        onChange={(e) => setSearchPlate(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && searchVehicles()}
                                        className="h-9 text-xs"
                                    />
                                    <Button onClick={searchVehicles} size="sm" className="h-9 px-3" disabled={isLoading}>
                                        <Search size={14} />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2 pt-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                        Available Trips ({trips.length})
                                    </Label>
                                </div>
                                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                                    {trips.length === 0 ? (
                                        <div className="text-center py-8 text-xs text-slate-400">
                                            No trips found.
                                        </div>
                                    ) : (
                                        trips.map(trip => {
                                            const tripBudget = calculateBudget(trip.expenses);
                                            const isSelected = selectedTrip?.id === trip.id;
                                            return (
                                                <button
                                                    key={trip.id}
                                                    onClick={() => handleSelectTrip(trip)}
                                                    className={`w-full text-left p-3 rounded-xl border transition-all text-xs ${
                                                        isSelected 
                                                        ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-sm' 
                                                        : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-slate-900">{trip.sheet_number || trip.reference_number || "Trip"}</span>
                                                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-bold">
                                                            {trip.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-slate-600 mt-1 text-[11px]">
                                                        <Truck size={12} className="text-slate-400 shrink-0" />
                                                        <span className="font-semibold text-slate-800">{trip.vehicle?.vehicle_no || "No Truck"}</span>
                                                        {trip.driver?.full_name && (
                                                            <span className="text-slate-400 truncate">• {trip.driver.full_name}</span>
                                                        )}
                                                    </div>
                                                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                                                        <span>{trip.origin || "Origin"} → {trip.destination || "Dest"}</span>
                                                        {tripBudget > 0 && (
                                                            <span className="font-bold text-emerald-700">Adv: TSh {tripBudget.toLocaleString()}</span>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Entry Form */}
                <div className="md:col-span-2 space-y-4">
                    {!selectedTrip ? (
                        <Card className="h-full min-h-[400px] flex items-center justify-center border-dashed bg-slate-50/50">
                            <div className="text-center p-10 max-w-sm">
                                <Search className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                                <h3 className="text-sm font-bold text-slate-700">No Trip Selected</h3>
                                <p className="text-slate-500 text-xs mt-1">
                                    Choose an active or completed trip from the left sidebar to view its budget and reconcile actual driver receipts.
                                </p>
                            </div>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            {/* Trip Header Banner */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-base font-bold text-slate-900">
                                                {selectedTrip.sheet_number || selectedTrip.reference_number}
                                            </h2>
                                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
                                                {selectedTrip.status}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                                            Client: <span className="font-bold text-slate-700">{selectedTrip.client_name || "Commercial Client"}</span> • Route: {selectedTrip.origin} → {selectedTrip.destination}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-xs font-bold text-slate-700 bg-slate-50 gap-1 px-2.5 py-1">
                                            <Truck size={13} className="text-primary" /> {selectedTrip.vehicle?.vehicle_no || "N/A"}
                                        </Badge>
                                        {selectedTrip.driver?.full_name && (
                                            <Badge variant="outline" className="text-xs font-bold text-slate-700 bg-slate-50 gap-1 px-2.5 py-1">
                                                <User size={13} className="text-slate-500" /> {selectedTrip.driver.full_name}
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                {/* Financial Settlement Balance Card */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                                            <Banknote size={12} /> Disbursed Road Advance
                                        </p>
                                        <p className="text-sm font-black text-slate-800 mt-1">
                                            TSh {budget.toLocaleString()}
                                        </p>
                                    </div>

                                    <div className="p-3 rounded-lg bg-indigo-50/50 border border-indigo-100">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-1">
                                            <FileSpreadsheet size={12} /> Actual Receipts Total
                                        </p>
                                        <p className="text-sm font-black text-indigo-900 mt-1">
                                            TSh {actual.toLocaleString()}
                                        </p>
                                    </div>

                                    <div className={`p-3 rounded-lg border ${
                                        variance === 0 
                                            ? 'bg-slate-50 border-slate-200' 
                                            : isOverBudget 
                                                ? 'bg-rose-50/70 border-rose-200' 
                                                : 'bg-emerald-50/70 border-emerald-200'
                                    }`}>
                                        <p className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                                            isOverBudget ? 'text-rose-600' : 'text-emerald-700'
                                        }`}>
                                            <Calculator size={12} />
                                            {isOverBudget ? 'Driver Reimbursement Due' : variance > 0 ? 'Company Refund Due' : 'Exact Balance'}
                                        </p>
                                        <p className={`text-sm font-black mt-1 ${
                                            isOverBudget ? 'text-rose-700' : 'text-emerald-800'
                                        }`}>
                                            {isOverBudget ? '-' : '+'} TSh {Math.abs(variance).toLocaleString()}
                                        </p>
                                    </div>
                                </div>

                                {/* Settlement Outcome Explainer */}
                                <div className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                                    isOverBudget 
                                        ? 'bg-rose-50 border-rose-200 text-rose-800' 
                                        : variance > 0 
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                                            : 'bg-slate-100 border-slate-200 text-slate-700'
                                }`}>
                                    {isOverBudget ? (
                                        <>
                                            <AlertCircle size={16} className="text-rose-600 shrink-0" />
                                            <span>
                                                <strong>Driver Spent Out-of-Pocket:</strong> Actual expenses exceeded disbursed advance by <strong>TSh {Math.abs(variance).toLocaleString()}</strong>. Cashier must pay reimbursement.
                                            </span>
                                        </>
                                    ) : variance > 0 ? (
                                        <>
                                            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                                            <span>
                                                <strong>Driver Refund to Company:</strong> Actual expenses were less than advance. Driver owes company cashier <strong>TSh {variance.toLocaleString()}</strong> in return cash.
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 size={16} className="text-slate-600 shrink-0" />
                                            <span>
                                                <strong>Perfect Reconciliation:</strong> Actual expenses perfectly match the disbursed advance.
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Receipts Entry Form */}
                            <Card className="border-slate-200 shadow-sm bg-white">
                                <CardHeader className="flex flex-row items-center justify-between border-b bg-slate-50/50 py-3 px-5">
                                    <div>
                                        <CardTitle className="text-sm font-bold text-slate-800">2. Record Itemized Receipts</CardTitle>
                                        <CardDescription className="text-xs">Enter each verified receipt from the physical trip pack</CardDescription>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5 h-8 text-xs font-semibold">
                                            <Download size={13} /> Excel Template
                                        </Button>
                                        <div className="relative">
                                            <Input 
                                                type="file" 
                                                className="absolute inset-0 opacity-0 cursor-pointer w-28" 
                                                accept=".xlsx"
                                                onChange={handleExcelUpload}
                                            />
                                            <Button variant="secondary" size="sm" className="gap-1.5 h-8 text-xs font-semibold pointer-events-none">
                                                <FileSpreadsheet size={13} /> Upload Excel
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-5 space-y-4">
                                    {isLoadingReceipts ? (
                                        <div className="text-center py-6 text-xs text-slate-400">Loading receipts...</div>
                                    ) : (
                                        <div className="space-y-3">
                                            {items.map((item, index) => (
                                                <div key={index} className="flex gap-2.5 items-center group">
                                                    <span className="text-[10px] font-bold text-slate-400 w-5 text-right">{index + 1}.</span>
                                                    <div className="flex-1">
                                                        <Input 
                                                            placeholder="e.g. Fuel Shell Dar, Weighbridge toll, Escort fee..."
                                                            value={item.description}
                                                            onChange={(e) => handleUpdateItem(index, 'description', e.target.value)}
                                                            className="h-9 text-xs bg-slate-50/50 border-slate-200"
                                                        />
                                                    </div>
                                                    <div className="w-44 relative">
                                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">TSh</span>
                                                        <Input 
                                                            className="h-9 pl-9 pr-2.5 text-right font-bold text-xs text-slate-800 bg-slate-50/50 border-slate-200"
                                                            placeholder="0"
                                                            type="number"
                                                            value={item.amount}
                                                            onChange={(e) => handleUpdateItem(index, 'amount', e.target.value)}
                                                        />
                                                    </div>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-8 w-8 text-slate-300 hover:text-red-600 hover:bg-red-50"
                                                        onClick={() => handleRemoveItem(index)}
                                                        disabled={items.length === 1}
                                                    >
                                                        <Trash2 size={14} />
                                                    </Button>
                                                </div>
                                            ))}
                                            
                                            <Button 
                                                variant="ghost" 
                                                onClick={handleAddItem} 
                                                className="w-full border border-dashed border-slate-200 hover:border-primary/40 hover:bg-primary/5 text-primary gap-1.5 h-9 text-xs font-semibold"
                                            >
                                                <Plus size={14} /> Add Another Receipt Row
                                            </Button>
                                        </div>
                                    )}

                                    <div className="mt-6 pt-4 border-t flex flex-wrap items-center justify-between gap-4">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Recorded Actuals</p>
                                            <p className="text-lg font-black text-slate-900">
                                                TSh {actual.toLocaleString()}
                                            </p>
                                        </div>
                                        <Button 
                                            onClick={saveSettlements} 
                                            disabled={isLoading || items.length === 0} 
                                            className="px-6 h-10 bg-primary hover:bg-primary/90 font-bold text-xs gap-2 shadow-md"
                                        >
                                            <Save size={15} /> Save & Finalize Settlement
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
