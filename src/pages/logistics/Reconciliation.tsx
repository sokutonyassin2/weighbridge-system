import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    ArrowRight
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

    // Security Check: Only audit_clerk and super_admin
    if (userRole !== 'super_admin' && userRole !== 'audit_clerk') {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Card className="w-full max-w-md text-center p-8">
                    <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
                    <CardTitle className="text-xl font-bold">Access Restricted</CardTitle>
                    <CardDescription className="mt-2">
                        You do not have permission to access the Trip Reconciliation portal.
                    </CardDescription>
                </Card>
            </div>
        );
    }

    const searchVehicles = async () => {
        if (!searchPlate.trim()) return;
        setIsLoading(true);
        try {
            // Exact Trip ID search for 100% accuracy
            const { data, error } = await supabase
                .from('logistics_trip_sheets')
                .select(`
                    id, 
                    trip_number, 
                    status, 
                    created_at,
                    logistics_fleet!inner (vehicle_no)
                `)
                .ilike('trip_number', `%${searchPlate}%`)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setTrips(data || []);
            if (data?.length === 0) {
                toast({
                    title: "Trip Not Found",
                    description: `No trip found with ID: "${searchPlate}"`,
                    variant: "destructive"
                });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
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
        a.download = `Receipt_Template_${selectedTrip?.trip_number || 'TRIP'}.xlsx`;
        a.click();
    };

    const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

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

            const settlements = items
                .filter(i => i.description && i.amount)
                .map(i => ({
                    trip_id: selectedTrip.id,
                    receipt_description: i.description,
                    amount_tzs: parseFloat(i.amount.replace(/,/g, '')),
                    entered_by: user?.id,
                    is_excel_upload: true // or false if manual, we can track this
                }));

            const { error } = await supabase
                .from('logistics_trip_settlements')
                .insert(settlements);

            if (error) throw error;

            toast({
                title: "Settlements Saved",
                description: "All receipts have been successfully recorded for this trip.",
            });
            
            // Success state - maybe clear form
            setSelectedTrip(null);
            setItems([{ description: "", amount: "" }]);
            setSearchPlate("");
            setTrips([]);

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

    return (
        <div className="container mx-auto py-10 px-4 max-w-5xl">
            <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-primary rounded-2xl text-white shadow-lg">
                    <FileSpreadsheet size={24} />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Trip Reconciliation Portal</h1>
                    <p className="text-slate-500 font-medium">Record and settle actual trip receipts blindly.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Search Sidebar */}
                <div className="md:col-span-1 space-y-6">
                    <Card className="border-slate-200 shadow-sm transition-all hover:shadow-md">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <Plus size={16} className="text-primary" /> 1. Locate Trip
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold">Official Trip ID</Label>
                                <div className="flex gap-2">
                                    <Input 
                                        placeholder="e.g. T 123/2025/G003" 
                                        value={searchPlate}
                                        onChange={(e) => setSearchPlate(e.target.value.toUpperCase())}
                                        onKeyDown={(e) => e.key === 'Enter' && searchVehicles()}
                                    />
                                    <Button onClick={searchVehicles} size="icon" disabled={isLoading}>
                                        <Search size={18} />
                                    </Button>
                                </div>
                            </div>

                            {trips.length > 0 && (
                                <div className="space-y-2 pt-4">
                                    <Label className="text-xs font-semibold text-slate-400 uppercase">Recent Trips found:</Label>
                                    <div className="space-y-2">
                                        {trips.map(trip => (
                                            <button
                                                key={trip.id}
                                                onClick={() => setSelectedTrip(trip)}
                                                className={`w-full text-left p-3 rounded-xl border transition-all ${
                                                    selectedTrip?.id === trip.id 
                                                    ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                                                    : 'border-slate-100 hover:border-slate-300 bg-slate-50'
                                                }`}
                                            >
                                                <p className="text-xs font-bold text-slate-900">{trip.trip_number}</p>
                                                <p className="text-[10px] text-slate-500 mt-1">
                                                    {format(new Date(trip.created_at), "dd MMM yyyy")} • {trip.status}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Entry Form */}
                <div className="md:col-span-2">
                    {!selectedTrip ? (
                        <Card className="h-full flex items-center justify-center border-dashed bg-slate-50/50">
                            <div className="text-center p-10">
                                <Search className="mx-auto h-12 w-12 text-slate-300 mb-4" />
                                <p className="text-slate-500 font-medium">Select a trip from the sidebar to begin entry.</p>
                            </div>
                        </Card>
                    ) : (
                        <div className="space-y-6">
                            <Card className="border-primary/20 shadow-xl bg-white">
                                <CardHeader className="flex flex-row items-center justify-between border-b bg-slate-50/50">
                                    <div>
                                        <CardTitle className="text-lg font-bold">2. Record Receipts</CardTitle>
                                        <CardDescription>Recording actual spending for {selectedTrip.trip_number}</CardDescription>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
                                            <Download size={14} /> Template
                                        </Button>
                                        <div className="relative">
                                            <Input 
                                                type="file" 
                                                className="absolute inset-0 opacity-0 cursor-pointer w-32" 
                                                accept=".xlsx"
                                                onChange={handleExcelUpload}
                                            />
                                            <Button variant="secondary" size="sm" className="gap-2 pointer-events-none">
                                                <FileSpreadsheet size={14} /> Upload Excel
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-6">
                                    <div className="space-y-4">
                                        {items.map((item, index) => (
                                            <div key={index} className="flex gap-3 items-center group">
                                                <div className="flex-1">
                                                    <Input 
                                                        placeholder="e.g. Fuel Shell Dar"
                                                        value={item.description}
                                                        onChange={(e) => handleUpdateItem(index, 'description', e.target.value)}
                                                        className="bg-slate-50"
                                                    />
                                                </div>
                                                <div className="w-40 relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">TShs</span>
                                                    <Input 
                                                        className="pl-12 text-right font-bold text-slate-700 bg-slate-50"
                                                        placeholder="0"
                                                        type="number"
                                                        value={item.amount}
                                                        onChange={(e) => handleUpdateItem(index, 'amount', e.target.value)}
                                                    />
                                                </div>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500 hover:bg-red-50"
                                                    onClick={() => handleRemoveItem(index)}
                                                >
                                                    <Trash2 size={16} />
                                                </Button>
                                            </div>
                                        ))}
                                        
                                        <Button variant="ghost" onClick={handleAddItem} className="w-full border-2 border-dashed border-slate-100 hover:border-primary/20 hover:bg-primary/5 text-primary gap-2 h-12">
                                            <Plus size={16} /> Add Another Receipt
                                        </Button>
                                    </div>

                                    <div className="mt-8 pt-6 border-t flex items-center justify-between">
                                        <div className="text-left">
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Running Total</p>
                                            <p className="text-xl font-black text-slate-900">
                                                {items.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0).toLocaleString()} <span className="text-xs">TShs</span>
                                            </p>
                                        </div>
                                        <Button 
                                            onClick={saveSettlements} 
                                            disabled={isLoading || items.length === 0} 
                                            className="px-10 h-12 bg-primary hover:bg-primary/90 rounded-xl gap-2 shadow-lg"
                                        >
                                            <Save size={18} /> Finalize Reconciliation
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                            
                            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                                <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                                <div>
                                    <p className="text-xs font-bold text-amber-900">Important Note</p>
                                    <p className="text-[11px] text-amber-700 leading-relaxed mt-1">
                                        Once finalized, these receipts will be verified by the Super Admin. Please ensure all values match the physical receipts provided by the driver. This process stays blind to the original budget for security purposes.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
