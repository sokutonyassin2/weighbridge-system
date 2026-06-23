import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
    TrendingUp,
    DollarSign,
    ArrowRight,
    Map,
    Plus,
    Trash2,
    Truck,
    Calculator,
    Save,
    User,
    Package,
    FileText,
    Building2,
    Calendar,
    Route,
    TrendingDown,
    MapPin,
    Navigation,
    Globe,
    Fuel,
    Calculator as TotalIcon,
    ShieldCheck,
    Zap,
    Download,
    Search,
    Check,
    ChevronsUpDown,
    CreditCard,
    FileCheck,
    AlertCircle,
    CheckCircle,
    Printer,
    Settings2
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

function ManageExpensesDialog() {
    const [open, setOpen] = useState(false);
    const [newItem, setNewItem] = useState("");
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: items, isLoading } = useQuery({
        queryKey: ["logistics-expense-items"],
        queryFn: async () => {
            const { data, error } = await supabase.from("logistics_expense_items").select("*").order("item_name", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    const handleAdd = async () => {
        if (!newItem.trim()) return;
        try {
            const { error } = await supabase.from("logistics_expense_items").insert([{ item_name: newItem.trim() }]);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ["logistics-expense-items"] });
            setNewItem("");
            toast({ title: "Expense item added" });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Failed to add", description: error.message });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase.from("logistics_expense_items").delete().eq("id", id);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ["logistics-expense-items"] });
            toast({ title: "Expense item removed" });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Failed to delete", description: error.message });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[10px] font-semibold border-dashed text-slate-500 hover:text-slate-800">
                    <Settings2 className="w-3 h-3 mr-1" />
                    Manage Expenses List
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Manage Expense Items</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="New expense description..."
                            value={newItem}
                            onChange={(e) => setNewItem(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        />
                        <Button onClick={handleAdd} size="icon"><Plus className="w-4 h-4" /></Button>
                    </div>
                    <div className="max-h-[300px] overflow-auto border rounded-md divide-y">
                        {isLoading ? (
                            <div className="p-4 text-center text-sm text-slate-500">Loading...</div>
                        ) : (
                            items?.map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-2 hover:bg-slate-50">
                                    <span className="text-sm font-medium">{item.item_name}</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-destructive" onClick={() => handleDelete(item.id)}>
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function ExpenseCombobox({ 
    value, 
    onChange, 
    disabled, 
    items 
}: { 
    value: string; 
    onChange: (val: string) => void; 
    disabled: boolean; 
    items: any[]; 
}) {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn("w-full h-7 justify-between bg-slate-50/20 border-none hover:bg-slate-100 font-normal !text-[12px] print:hidden", !value && "text-slate-400")}
                >
                    <span className="truncate">{value || "Select expense..."}</span>
                    <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 z-[100]" align="start">
                <Command>
                    <CommandInput placeholder="Search expense..." className="h-8 text-xs" />
                    <CommandList>
                        <CommandEmpty>No expense item found.</CommandEmpty>
                        <CommandGroup className="max-h-[250px] overflow-auto">
                            {items.map((expItem) => (
                                <CommandItem
                                    key={expItem.id}
                                    value={expItem.item_name}
                                    onSelect={(currentValue) => {
                                        onChange(currentValue);
                                        setOpen(false);
                                    }}
                                    className="text-xs"
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-3 w-3",
                                            value === expItem.item_name ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {expItem.item_name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

function RouteCombobox({ 
    value, 
    onChange, 
    disabled,
    placeholder,
    items 
}: { 
    value: string; 
    onChange: (val: string) => void; 
    disabled: boolean;
    placeholder?: string;
    items: any[]; 
}) {
    const [open, setOpen] = useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn("w-full h-11 justify-between bg-slate-50 border-slate-200 shadow-sm font-medium text-slate-700 hover:bg-slate-100", !value && "text-slate-400")}
                >
                    <span className="truncate">{value || (placeholder ?? "Select location...")}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 z-[100]" align="start">
                <Command>
                    <CommandInput placeholder="Search location..." className="h-8 text-xs" />
                    <CommandList>
                        <CommandEmpty>No location found.</CommandEmpty>
                        <CommandGroup className="max-h-[250px] overflow-auto">
                            {items.map((route) => (
                                <CommandItem
                                    key={route.id}
                                    value={route.location_name}
                                    onSelect={(currentValue) => {
                                        onChange(currentValue.toUpperCase());
                                        setOpen(false);
                                    }}
                                    className="text-xs"
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-3 w-3",
                                            value?.toUpperCase() === route.location_name?.toUpperCase() ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    {route.location_name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

function ManageRoutesDialog() {
    const [open, setOpen] = useState(false);
    const [newLocation, setNewLocation] = useState("");
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: routes, isLoading } = useQuery({
        queryKey: ["logistics-routes"],
        queryFn: async () => {
            const { data, error } = await supabase.from("logistics_routes" as any).select("*").order("location_name", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    const handleAdd = async () => {
        if (!newLocation.trim()) return;
        try {
            const { error } = await supabase.from("logistics_routes" as any).insert([{ location_name: newLocation.trim().toUpperCase() }]);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ["logistics-routes"] });
            setNewLocation("");
            toast({ title: "Route location added" });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Failed to add", description: error.message });
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase.from("logistics_routes" as any).delete().eq("id", id);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ["logistics-routes"] });
            toast({ title: "Route location removed" });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Failed to delete", description: error.message });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-[10px] font-semibold border-dashed text-slate-500 hover:text-slate-800">
                    <Settings2 className="w-3 h-3 mr-1" />
                    Manage Routes List
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Manage Route Locations</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="New location name..."
                            value={newLocation}
                            onChange={(e) => setNewLocation(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        />
                        <Button onClick={handleAdd} size="icon"><Plus className="w-4 h-4" /></Button>
                    </div>
                    <div className="max-h-[300px] overflow-auto border rounded-md divide-y">
                        {isLoading ? (
                            <div className="p-4 text-center text-sm text-slate-500">Loading...</div>
                        ) : (
                            routes?.map((route: any) => (
                                <div key={route.id} className="flex items-center justify-between p-2 hover:bg-slate-50">
                                    <span className="text-sm font-medium">{route.location_name}</span>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-destructive" onClick={() => handleDelete(route.id)}>
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

interface TripSheetProps {
    tripId?: string;
    duplicateData?: any;
    onSaveSuccess?: () => void;
}

interface ExpenseItem {
    id?: string;
    item_name: string;
    amount: string;
    category: 'TZ' | 'Zambia' | 'DRC' | 'Rwanda' | 'Burundi' | 'Fixed';
    currency: 'USD' | 'TZS';
    nature: string;
    is_extra?: boolean;
}

export const TripSheet = ({ tripId, duplicateData, onSaveSuccess }: TripSheetProps) => {
    const { toast } = useToast();
    const { userRole, user, userProfile } = useAuth();
    const isSuperAdmin = userRole === 'super_admin';
    const isManager = userRole === 'logistics_manager' || userRole === 'admin' || userRole === 'super_admin';
    const [isSaving, setIsSaving] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [isActivating, setIsActivating] = useState(false);
    const [currentStatus, setCurrentStatus] = useState<string>('Planned');
    const [isLoading, setIsLoading] = useState(true);
    const [auditTrail, setAuditTrail] = useState<{
        created_by_name?: string;
        created_at?: string;
        approved_by_name?: string;
        approved_at?: string;
        activated_by_name?: string;
        activated_at?: string;
    }>({});

    const [activeCountries, setActiveCountries] = useState<string[]>(['TZ']);
    const [settlements, setSettlements] = useState<any[]>([]);
    const [auditLoading, setAuditLoading] = useState(false);



    // Trip Planning State (For New Sheets)
    const [tripData, setTripData] = useState({
        trip_number: "",
        vehicle_id: "",
        trailer_id: "",
        driver_id: "",
        license_no: "",
        passport_no: "",
        origin: "Headquarters",
        destination: "",
        client_name: "", // Mandatory for grouping
        journey_type: "Go & Return",
        cargo_outbound: "",
        notes: "",
        agreed_days: "",
        daily_fine_amount: "",
        invoice_no: "",
        invoice_date: "",
        payment_status: "Pending" as "Pending" | "Paid" | "Partial" | "Overdue",
        return_cargo: "",
        return_revenue_amount: "",
        return_revenue_currency: "TZS",
        return_invoice_no: "",
        return_invoice_date: "",
        return_payment_status: "Pending" as "Pending" | "Paid" | "Partial" | "Overdue"
    });

    // Summary State
    const [revenueData, setRevenueData] = useState({
        revenue_type: 'Without Fuel' as 'With Fuel' | 'Without Fuel',
        revenue_amount: '',
        revenue_currency: 'TZS' as 'USD' | 'TZS',
        fuel_liters: '',
        fuel_price: '',
        fuel_amount: '0' // Total fuel cost in USD (calculated)
    });

    const [countryRates, setCountryRates] = useState<Record<string, number>>(() => {
        try {
            const savedRates = localStorage.getItem('latest_market_rates');
            if (savedRates) {
                const parsed = JSON.parse(savedRates);
                if (Object.keys(parsed).length > 0) {
                    return {
                        "TZ": parsed["TZ"] || 2700,
                        "Zambia": parsed["Zambia"] || 25.5,
                        "DRC": parsed["DRC"] || 1.0,
                        "Rwanda": parsed["Rwanda"] || 1250,
                        "Burundi": parsed["Burundi"] || 2850,
                        ...parsed
                    };
                }
            }
        } catch (e) {
            console.warn("Could not load latest_market_rates");
        }
        return {
            "TZ": 2700,
            "Zambia": 25.5,
            "DRC": 1.0,
            "Rwanda": 1250,
            "Burundi": 2850
        };
    });
    // Predefined Expense Items Query
    const { data: expenseItemsList } = useQuery({
        queryKey: ["logistics-expense-items"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_expense_items")
                .select("*")
                .eq("is_active", true)
                .order("item_name", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    // Predefined Routes Query
    const { data: routesList } = useQuery({
        queryKey: ["logistics-routes"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_routes" as any)
                .select("*")
                .eq("is_active", true)
                .order("location_name", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    // Expenses State
    const [expenses, setExpenses] = useState<ExpenseItem[]>([
        { item_name: "Driver Allowance", amount: "", category: "TZ", currency: "USD", nature: "Go & Return", is_extra: false }
    ]);

    // Workflow lock (EVERYONE locked out after Approval/Activation for transparency)
    const workflowLocked = currentStatus === 'Approved' || currentStatus === 'Active' || currentStatus === 'Completed';
    
    // Invoice field lock (Ensures citation cannot be changed once saved)
    const isInvoiceCaptured = !!tripId && !!tripData.invoice_no;
    
    // Global lock for budget/planning sections
    const isLocked = workflowLocked;

    // 📅 Auto-capture Invoice Date
    useEffect(() => {
        if (tripData.invoice_no && !tripData.invoice_date) {
            setTripData(prev => ({ 
                ...prev, 
                invoice_date: new Date().toISOString().split('T')[0] 
            }));
        }
    }, [tripData.invoice_no, tripData.invoice_date]);

    // 💾 Auto-save to LocalStorage
    useEffect(() => {
        if (tripId) {
            const draft = {
                expenses,
                countryRates,
                revenueData
            };
            localStorage.setItem(`trip_draft_${tripId}`, JSON.stringify(draft));
        }
    }, [expenses, countryRates, revenueData, tripId]);

    // 🔄 Load Draft on Mount
    useEffect(() => {
        if (tripId) {
            const savedDraft = localStorage.getItem(`trip_draft_${tripId}`);
            if (savedDraft && expenses.length === 0) {
                try {
                    const draft = JSON.parse(savedDraft);
                    setExpenses(draft.expenses || []);
                    setCountryRates(draft.countryRates || {});
                    if (draft.revenueData) setRevenueData(draft.revenueData);
                } catch (e) {
                    console.error("Failed to load draft", e);
                }
            }
        }
    }, [tripId]);

    // Fetch Settlements for Audit (Superadmin only)
    useEffect(() => {
        if (!tripId || !isSuperAdmin) return;

        const fetchSettlements = async () => {
            setAuditLoading(true);
            try {
                const { data, error } = await supabase
                    .from('logistics_trip_settlements')
                    .select('*')
                    .eq('trip_id', tripId);

                if (error) throw error;
                setSettlements(data || []);
            } catch (err) {
                console.error("Error fetching settlements:", err);
            } finally {
                setAuditLoading(false);
            }
        };

        fetchSettlements();
    }, [tripId, isSuperAdmin]);

    // ⚠️ Prevent accidental closing
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    const [fleet, setFleet] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [couplings, setCouplings] = useState<any[]>([]);

    const [trailerPlate, setTrailerPlate] = useState<string>("");
    const lastResolvedId = useRef<string | null>(null);

    // 🔗 Trailer Plate Resolver (Stabilized)
    useEffect(() => {
        if (!tripData.trailer_id || tripData.trailer_id === 'none') {
            setTrailerPlate("");
            lastResolvedId.current = null;
            return;
        }

        // Avoid clearing if we've already resolved this ID to prevent "flicker"
        if (lastResolvedId.current === tripData.trailer_id && trailerPlate) {
            return;
        }

        const found = fleet.find(f => String(f.id).toLowerCase().trim() === String(tripData.trailer_id).toLowerCase().trim());
        if (found) {
            setTrailerPlate(found.vehicle_no || found.trailer_number);
            lastResolvedId.current = tripData.trailer_id;
        } else {
            const resolveTrailer = async () => {
                try {
                    const { data } = await supabase
                        .from('logistics_fleet' as any)
                        .select('vehicle_no, trailer_number')
                        .eq('id', tripData.trailer_id)
                        .single();
                    
                    if (data) {
                        const plate = data.vehicle_no || data.trailer_number;
                        setTrailerPlate(plate);
                        lastResolvedId.current = tripData.trailer_id;
                        // Silently update cache without triggering recursive refetch
                        setFleet(prev => prev.some(f => f.id === tripData.trailer_id) ? prev : [...prev, { id: tripData.trailer_id, vehicle_no: plate }]);
                    } else {
                        setTrailerPlate(tripData.trailer_id); // Show ID if name fetch fails
                    }
                } catch (err) {
                    console.error("Trailer resolution failed", err);
                }
            };
            resolveTrailer();
        }
    }, [tripData.trailer_id]); // Only re-run when the selected trailer ID changes

    // Financial Totals
    const [totals, setTotals] = useState({
        totalExpensesTZS: 0,
        totalExpensesUSD: 0,
        netProfitUSD: 0,
        extraExpensesTZS: 0,
        extraExpensesUSD: 0,
        finalNetProfitUSD: 0,
        categoryTotals: {} as Record<string, { usd: number, tzs: number }>,
        extraCategoryTotals: {} as Record<string, { usd: number, tzs: number }>
    });

    // 👤 Driver Credentials Auto-fill
    useEffect(() => {
        if (tripData.driver_id) {
            const driver = drivers.find(d => d.id === tripData.driver_id);
            if (driver) {
                setTripData(prev => ({
                    ...prev,
                    license_no: driver.license_no || "",
                    passport_no: driver.id_number || ""
                }));
            }
        }
    }, [tripData.driver_id, drivers]);

    // Fetch existing data
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                setIsLoading(true);

                // 1. Parallel Fetch EVERYTHING (Meta + Trip Details + Expenses)
                // Using separate calls for drivers to allow robust fallback logic
                const [fleetRes, couplingRes, categoryRes, sheetRes, expenseRes] = await Promise.all([
                    supabase.from('logistics_fleet' as any).select('id, vehicle_no, asset_type, fleet_category, assignment_status, make_model, trailer_number'),
                    supabase.from('logistics_couplings' as any).select('id, horse_id, trailer_id, is_active').eq('is_active', true),
                    supabase.from('logistics_drivers' as any).select('id, name').order('name'), // Category labels
                    tripId ? supabase.from('logistics_trip_sheets' as any).select('*').eq('id', tripId).single() : Promise.resolve({ data: null, error: null }),
                    tripId ? supabase.from('logistics_trip_expenses' as any).select('*').eq('trip_sheet_id', tripId) : Promise.resolve({ data: [], error: null })
                ]);

                // 2. Specialized Driver Fetch with Fallback Logic
                let driverData = [];
                try {
                    // Try preferred columns first
                    const { data, error: dError } = await supabase
                        .from('logistics_drivers' as any)
                        .select('id, full_name, license_expiry, license_no, id_number, is_active, assigned_vehicle_id')
                        .order('full_name');
                    
                    if (dError) {
                        console.warn("Driver fetch with full fields failed, attempting fallback...", dError);
                        // Fallback to basic columns if database schema is lagging
                        const { data: fallbackData, error: fError } = await supabase
                            .from('logistics_drivers' as any)
                            .select('id, full_name')
                            .order('full_name');
                        
                        if (fError) throw fError;
                        driverData = fallbackData || [];
                    } else {
                        driverData = data || [];
                    }
                } catch (err: any) {
                    console.error("Driver fetch failed completely", err);
                    toast({
                        variant: "destructive",
                        title: "Driver Load Failed",
                        description: "Could not retrieve driver list. Please check if the 'logistics_drivers' table exists."
                    });
                }

                if (fleetRes.data) setFleet(fleetRes.data);
                if (couplingRes.data) setCouplings(couplingRes.data);

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                // Show ALL active drivers — expired licences are flagged visually, not hidden
                setDrivers(driverData);

                if (!tripId) {
                    setIsLoading(false);
                    return;
                }

                if (sheetRes.error) throw sheetRes.error;
                const doc = sheetRes.data as any;

                if (doc) {
                    setCurrentStatus(doc.status || 'Planned');
                    setTripData({
                        trip_number: doc.reference_number || "",
                        vehicle_id: doc.vehicle_id || "",
                        trailer_id: doc.trailer_id || "",
                        driver_id: doc.driver_id || "",
                        license_no: doc.license_no || "",
                        passport_no: doc.passport_no || "",
                        origin: doc.origin,
                        destination: doc.destination,
                        client_name: doc.client_name || "",
                        journey_type: doc.journey_type || "Go & Return (Full Cycle)",
                        cargo_outbound: doc.cargo_outbound,
                        notes: doc.notes || "",
                        agreed_days: (doc.agreed_days || '').toString(),
                        daily_fine_amount: (doc.daily_fine_amount || '').toString(),
                        invoice_no: doc.invoice_no || "",
                        invoice_date: doc.invoice_date || "",
                        payment_status: doc.payment_status || "Pending",
                        return_cargo: doc.return_cargo || "",
                        return_revenue_amount: (doc.return_revenue_amount || '').toString(),
                        return_revenue_currency: doc.return_revenue_currency || "TZS",
                        return_invoice_no: doc.return_invoice_no || "",
                        return_invoice_date: doc.return_invoice_date || "",
                        return_payment_status: doc.return_payment_status || "Pending"
                    });

                    setRevenueData({
                        revenue_type: doc.revenue_type || 'Without Fuel',
                        revenue_amount: (doc.revenue_amount || 0).toString(),
                        revenue_currency: (doc.revenue_currency || 'USD') as 'USD' | 'TZS',
                        fuel_liters: (doc.fuel_liters || '').toString(),
                        fuel_price: (doc.fuel_price || '').toString(),
                        fuel_amount: (doc.fuel_amount || 0).toString()
                    });

                    if (doc.country_rates) {
                        setCountryRates(doc.country_rates);
                    } else if (doc.exchange_rate) {
                        setCountryRates(prev => ({ ...prev, "TZ": doc.exchange_rate }));
                    }

                    setAuditTrail({
                        created_by_name: doc.created_by_name,
                        created_at: doc.created_at,
                        approved_by_name: doc.approved_by_name,
                        approved_at: doc.approved_at,
                        activated_by_name: doc.activated_by_name,
                        activated_at: doc.activated_at,
                    });

                    if (doc.active_countries && Array.isArray(doc.active_countries)) {
                        setActiveCountries(doc.active_countries);
                    }

                    // Handle Expenses
                    const expenseData = expenseRes.data;
                    if (expenseData && expenseData.length > 0) {
                        const rate = parseFloat(doc.exchange_rate) || 2700;
                        const docExpenses = (expenseData as any[]).map(e => {
                            // Removed forced conversion to TZS on load
                            return {
                                id: e.id,
                                item_name: e.item_name,
                                amount: (parseFloat(e.amount) || 0).toString(),
                                category: e.category,
                                currency: e.currency || (e.category === 'Zambia' ? 'ZMW' : e.category === 'DRC' ? 'USD' : e.category === 'Rwanda' ? 'RWF' : e.category === 'Burundi' ? 'BIF' : 'TZS'),
                                nature: e.nature || e.category,
                                is_extra: e.is_extra || false
                            };
                        }) as ExpenseItem[];

                        setExpenses(docExpenses);

                        const countriesWithData = [...new Set(docExpenses.map(e => e.category))].filter(c => c !== 'Fixed');
                        if (countriesWithData.length > 0) {
                            setActiveCountries(countriesWithData as string[]);
                        }
                    }
                }
            } catch (error: any) {
                console.error("Error fetching financials:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadInitialData();
    }, [tripId]);

    // Pre-fill from duplicate source
    useEffect(() => {
        if (!duplicateData) return;
        const doc = duplicateData;

        // NEW: Helper to normalize legacy or descriptive category names from DB to internal keys
        const normalizeCategory = (cat: string): 'TZ' | 'Zambia' | 'DRC' | 'Rwanda' | 'Burundi' | 'Fixed' => {
            const c = cat ? cat.trim() : 'Fixed';
            if (c === 'Tanzania') return 'TZ';
            if (c === 'DR Congo' || c === 'Congo') return 'DRC';
            if (['TZ', 'Zambia', 'DRC', 'Rwanda', 'Burundi', 'Fixed'].includes(c)) return c as any;
            return 'Fixed';
        };

        const fetchDuplicateExpenses = async () => {
            try {
                const { data: expenseData } = await supabase
                    .from('logistics_trip_expenses' as any)
                    .select('*')
                    .eq('trip_sheet_id', doc.id);

                if (expenseData && expenseData.length > 0) {
                    const docExpenses = (expenseData as any[]).map(e => {
                        const rate = parseFloat(doc.exchange_rate) || 2700;
                        const isUSD = e.currency === 'USD';
                        let amountInUI = parseFloat(e.amount) || 0;
                        if (isUSD) {
                            amountInUI = amountInUI * rate;
                        } else {
                            if (normalizeCategory(e.category) === 'Zambia') amountInUI = amountInUI / (doc.country_rates?.["Zambia"] || 100);
                            else if (normalizeCategory(e.category) === 'DRC') amountInUI = amountInUI / (doc.country_rates?.["DRC"] || 1.0);
                            else if (normalizeCategory(e.category) === 'Rwanda') amountInUI = amountInUI / (doc.country_rates?.["Rwanda"] || 2);
                            else if (normalizeCategory(e.category) === 'Burundi') amountInUI = amountInUI / (doc.country_rates?.["Burundi"] || 1);
                        }
                        return {
                            item_name: e.item_name || e.description || "",
                            amount: amountInUI.toString(),
                            category: normalizeCategory(e.category),
                            currency: 'TZS'
                        };
                    }) as ExpenseItem[];

                    setExpenses(docExpenses);

                    // Auto-enable countries that have expenses
                    const countriesWithData = [...new Set(docExpenses.map(e => e.category))].filter(c => c !== 'Fixed');
                    if (countriesWithData.length > 0) {
                        setActiveCountries(countriesWithData as string[]);
                    }
                }
            } catch (err) {
                console.error("Scale-out error fetching duplicate expenses:", err);
            }
        };

        setTripData({
            trip_number: doc.reference_number || "",
            vehicle_id: "", // Must be re-assigned for new trip
            trailer_id: doc.trailer_id || "", // PRESERVE TRAILER
            driver_id: "",  // Must be re-assigned for new trip
            license_no: "",
            passport_no: "",
            origin: doc.origin || "Headquarters",
            destination: doc.destination || "",
            client_name: doc.client_name || "",
            journey_type: doc.journey_type || "Go & Return",
            cargo_outbound: doc.cargo_outbound || "",
            notes: doc.notes || "",
            agreed_days: (doc.agreed_days || '').toString(),
            daily_fine_amount: (doc.daily_fine_amount || '').toString(),
            invoice_no: doc.invoice_no || "",
            invoice_date: doc.invoice_date || "",
            payment_status: doc.payment_status || "Pending",
            return_cargo: doc.return_cargo || "",
            return_revenue_amount: (doc.return_revenue_amount || '').toString(),
            return_revenue_currency: doc.return_revenue_currency || "TZS",
            return_invoice_no: doc.return_invoice_no || "",
            return_invoice_date: doc.return_invoice_date || "",
            return_payment_status: doc.return_payment_status || "Pending"
        });
        setRevenueData({
            revenue_type: doc.revenue_type || 'Without Fuel',
            revenue_amount: (doc.revenue_amount || 0).toString(),
            revenue_currency: (doc.revenue_currency || 'USD') as 'USD' | 'TZS',
            fuel_liters: (doc.fuel_liters || '').toString(),
            fuel_price: (doc.fuel_price || '').toString(),
            fuel_amount: (doc.fuel_amount || 0).toString()
        });

        if (doc.country_rates) {
            setCountryRates(doc.country_rates);
        } else if (doc.exchange_rate) {
            setCountryRates(prev => ({ ...prev, "TZ": doc.exchange_rate }));
        }

        // Ensure and set active countries (Regional Scope) from copied data
        if (doc.active_countries && Array.isArray(doc.active_countries)) {
            setActiveCountries(doc.active_countries);
        }

        fetchDuplicateExpenses();
        setIsLoading(false);
    }, [duplicateData]);

    // Form Persistence (Save to LocalStorage)
    useEffect(() => {
        if (tripId || isLoading) return; // Don't persist if editing an existing record or loading
        const draft = {
            tripData,
            revenueData,
            expenses,
            countryRates
        };
        localStorage.setItem('trip_sheet_draft', JSON.stringify(draft));
        localStorage.setItem('latest_market_rates', JSON.stringify(countryRates));
    }, [tripData, revenueData, expenses, countryRates, tripId, isLoading]);

    // Load Persistence
    useEffect(() => {
        if (tripId || duplicateData) return; // SKIP draft load if duplicating a trip!
        const saved = localStorage.getItem('trip_sheet_draft');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setTripData(prev => ({ ...prev, ...parsed.tripData }));
                setRevenueData(prev => ({ ...prev, ...parsed.revenueData }));
                setExpenses(parsed.expenses || []);
                if (parsed.countryRates) {
                    setCountryRates(parsed.countryRates);
                }

                // Auto-enable countries that have expenses from draft
                const countriesWithData = [...new Set((parsed.expenses || []).map((e: ExpenseItem) => e.category))].filter(c => c !== 'Fixed');
                if (countriesWithData.length > 0) {
                    setActiveCountries(countriesWithData as string[]);
                }
            } catch (e) {
                console.error("Failed to parse draft", e);
            }
        }
    }, [tripId]);

    // --------------------------------------------------------------------------------

    // Calculate Totals
    useEffect(() => {
        const rate = countryRates["TZ"] || 2700;

        // Fuel Calculation: Liters * Price = Total TZS -> / Rate = Total USD
        const liters = parseFloat(revenueData.fuel_liters) || 0;
        const pricePerLiter = parseFloat(revenueData.fuel_price) || 0;
        const fuelTotalTZS = liters * pricePerLiter;
        const fuelTotalUSD = fuelTotalTZS / rate;

        // Split budgeted vs extra expenses (EXCLUDE 'Fixed' from Trip Budget totals)
        const budgetedExpenses = expenses.filter(e => !e.is_extra && e.category !== 'Fixed');
        const extraExpensesArr = expenses.filter(e => e.is_extra && e.category !== 'Fixed');

        const buildCategoryTotals = (list: ExpenseItem[]) =>
            list.reduce((acc, curr) => {
                const amt = parseFloat(curr.amount) || 0;
                let inTZS = 0;
                let inUSD = 0;
                
                if (curr.currency === 'USD') {
                    inUSD = amt;
                    inTZS = amt * rate;
                } else {
                    if (curr.category === 'TZ' || curr.category === 'Fixed') {
                        inTZS = amt;
                        inUSD = amt / rate;
                    } else if (curr.category === 'Zambia') {
                        inTZS = amt * (countryRates["Zambia"] || 100);
                        inUSD = inTZS / rate;
                    } else if (curr.category === 'DRC') {
                        inTZS = amt * (countryRates["DRC"] || 1.0);
                        inUSD = inTZS / rate;
                    } else if (curr.category === 'Rwanda') {
                        inTZS = amt * (countryRates["Rwanda"] || 2);
                        inUSD = inTZS / rate;
                    } else if (curr.category === 'Burundi') {
                        inTZS = amt * (countryRates["Burundi"] || 1);
                        inUSD = inTZS / rate;
                    }
                }
                
                acc[curr.category] = {
                    usd: (acc[curr.category]?.usd || 0) + inUSD,
                    tzs: (acc[curr.category]?.tzs || 0) + inTZS
                };
                return acc;
            }, {} as Record<string, { usd: number, tzs: number }>);

        const catTotals = buildCategoryTotals(budgetedExpenses);
        const extraCatTotals = buildCategoryTotals(extraExpensesArr);

        // This represents the actual road variable costs
        const totalOperationalUSD = Object.values(catTotals).reduce((sum, cat) => sum + cat.usd, 0);
        const totalExtraUSD = Object.values(extraCatTotals).reduce((sum, cat) => sum + cat.usd, 0);

        const revenueAmount = parseFloat(revenueData.revenue_amount) || 0;
        const revenueInUSD = revenueData.revenue_currency === 'USD'
            ? revenueAmount
            : (revenueAmount / rate);

        // Final Logic: Profit = Revenue - Operational - (isWithFuel ? Fuel : 0)
        const activeFuelUSD = revenueData.revenue_type === 'With Fuel' ? fuelTotalUSD : 0;
        const totalBudgetedExpensesUSD = totalOperationalUSD + activeFuelUSD;
        const expectedNetProfitUSD = revenueInUSD - totalBudgetedExpensesUSD;

        setTotals({
            totalExpensesTZS: totalBudgetedExpensesUSD * rate,
            totalExpensesUSD: totalBudgetedExpensesUSD,
            netProfitUSD: expectedNetProfitUSD,
            extraExpensesTZS: totalExtraUSD * rate,
            extraExpensesUSD: totalExtraUSD,
            finalNetProfitUSD: expectedNetProfitUSD - totalExtraUSD,
            categoryTotals: catTotals,
            extraCategoryTotals: extraCatTotals
        });
    }, [expenses, revenueData, countryRates]);

    const getDefaultCurrency = (category: string) => {
        if (category === 'Zambia') return 'ZMW';
        if (category === 'DRC') return 'USD';
        if (category === 'Rwanda') return 'RWF';
        if (category === 'Burundi') return 'BIF';
        return 'TZS';
    };

    const addExpense = (category: 'TZ' | 'Zambia' | 'DRC' | 'Rwanda' | 'Burundi' | 'Fixed') => {
        setExpenses([...expenses, {
            item_name: "",
            amount: "",
            category,
            currency: getDefaultCurrency(category),
            nature: "Go & Return",
            is_extra: false
        }]);
    };

    const addExtraExpense = (category: 'TZ' | 'Zambia' | 'DRC' | 'Rwanda' | 'Burundi' | 'Fixed') => {
        setExpenses([...expenses, {
            item_name: "",
            amount: "",
            category,
            currency: getDefaultCurrency(category),
            nature: "Unbudgeted",
            is_extra: true
        }]);
    };

    const formatWithCommas = (val: string | number) => {
        if (val === undefined || val === null || val === '') return '';
        const num = val.toString().replace(/,/g, '');
        if (isNaN(Number(num))) return val.toString();
        return Number(num).toLocaleString();
    };

    const removeExpense = (index: number) => {
        const newExpenses = [...expenses];
        newExpenses.splice(index, 1);
        setExpenses(newExpenses);
    };

    const updateExpense = (index: number, field: string, value: any) => {
        const newExpenses = [...expenses];
        let finalValue = value;
        
        if (field === 'amount' && typeof value === 'string') {
            // Remove commas before parsing
            const cleanVal = value.replace(/,/g, '');
            const numValue = parseFloat(cleanVal);
            if (!isNaN(numValue)) {
                finalValue = Math.round(numValue).toString();
            } else {
                finalValue = cleanVal;
            }
        }
        
        newExpenses[index] = { ...newExpenses[index], [field]: finalValue };
        setExpenses(newExpenses);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (!tripData.destination) {
                throw new Error("Please specify at least the Route Destination to save this plan.");
            }

            const sheetPayload = {
                vehicle_id: tripData.vehicle_id || null,
                trailer_id: tripData.trailer_id || null,
                driver_id: tripData.driver_id || null,
                origin: tripData.origin,
                destination: tripData.destination,
                client_name: tripData.client_name,
                journey_type: tripData.journey_type,
                cargo_outbound: tripData.cargo_outbound,
                notes: tripData.notes,
                agreed_days: parseInt(tripData.agreed_days) || null,
                daily_fine_amount: parseFloat(tripData.daily_fine_amount) || 0,
                revenue_type: revenueData.revenue_type,
                revenue_amount: parseFloat(revenueData.revenue_amount) || 0,
                revenue_currency: revenueData.revenue_currency,
                exchange_rate: countryRates["TZ"] || 2700, // Sync legacy field for compatibility
                country_rates: countryRates, // New professional JSONB field
                fuel_liters: parseFloat(revenueData.fuel_liters) || 0,
                fuel_price: parseFloat(revenueData.fuel_price) || 0,
                fuel_amount: parseFloat(revenueData.fuel_amount) || 0, // Calculated USD value
                total_expenses_tzs: totals.totalExpensesTZS,
                total_expenses_usd: totals.totalExpensesUSD,
                net_profit_usd: totals.netProfitUSD,
                status: currentStatus,
                reference_number: tripData.trip_number, // Fix: This is the verified column name in the DB schema
                license_no: tripData.license_no,
                passport_no: tripData.passport_no,
                active_countries: activeCountries, // PERSIST LAYOUT
                invoice_no: tripData.invoice_no,
                invoice_date: tripData.invoice_date || null,
                payment_status: tripData.payment_status,
                return_cargo: tripData.return_cargo || null,
                return_revenue_amount: tripData.return_revenue_amount ? parseFloat(tripData.return_revenue_amount) : null,
                return_revenue_currency: tripData.return_revenue_currency,
                return_invoice_no: tripData.return_invoice_no || null,
                return_invoice_date: tripData.return_invoice_date || null,
                return_payment_status: tripData.return_payment_status,
                updated_at: new Date().toISOString()
            } as any;

            // Set creation metadata if first time saving
            if (!tripId && !duplicateData) {
                sheetPayload.created_by = user?.id;
                sheetPayload.created_by_name = userProfile?.full_name || user?.email;
            }

            let activeSheetId = tripId;

            if (!activeSheetId) {
                // Create New Standalone Trip Sheet
                const { data: newSheet, error: insertError } = await supabase
                    .from('logistics_trip_sheets' as any)
                    .insert(sheetPayload)
                    .select()
                    .single();

                if (insertError) throw insertError;
                activeSheetId = (newSheet as any).id;
            } else {
                // Update Existing
                const { error: updateError } = await supabase
                    .from('logistics_trip_sheets' as any)
                    .update(sheetPayload)
                    .eq('id', activeSheetId);

                if (updateError) throw updateError;
            }

            // Sync Expenses
            const { error: deleteError } = await supabase
                .from('logistics_trip_expenses' as any)
                .delete()
                .eq('trip_sheet_id', activeSheetId);

            if (deleteError) throw deleteError;

            if (expenses.length > 0) {
                const { error: expensesError } = await supabase
                    .from('logistics_trip_expenses' as any)
                    .insert(expenses.map(e => {
                        return {
                            trip_sheet_id: activeSheetId,
                            category: e.category,
                            nature: e.nature || e.category,
                            item_name: e.item_name,
                            description: e.item_name,
                            amount: parseFloat(e.amount.toString().replace(/,/g, '')) || 0,
                            currency: e.currency,
                            is_extra: e.is_extra || false
                        };
                    }));

                if (expensesError) {
                    if (!tripId) {
                        await supabase.from('logistics_trip_sheets' as any).delete().eq('id', activeSheetId);
                    }
                    throw expensesError;
                }
            }

            toast({
                title: "Trip Sheet Saved",
                description: activeSheetId === tripId ? "Plan updated successfully." : "New standalone trip sheet created.",
            });

            // Clear draft if it was a new sheet
            if (!tripId) {
                localStorage.removeItem('trip_sheet_draft');
            }

            if (onSaveSuccess) onSaveSuccess();
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Save Failed",
                description: error.message,
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleExportExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Trip Budget');

        // Styles
        const titleStyle: Partial<ExcelJS.Style> = {
            font: { bold: true, size: 16, color: { argb: '000000' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC000' } }, // Gold/Amber
            alignment: { horizontal: 'center', vertical: 'middle' }
        };

        const headerStyle: Partial<ExcelJS.Style> = {
            font: { bold: true, color: { argb: '000000' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } },
            border: {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            }
        };

        const subtotalStyle: Partial<ExcelJS.Style> = {
            font: { bold: true },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } }
        };

        const borderStyle: Partial<ExcelJS.Borders> = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };

        // Column widths
        sheet.getColumn(1).width = 30; // Item Description (Increased)
        sheet.getColumn(2).width = 20; // Nature
        sheet.getColumn(3).width = 20; // TZS Amount
        sheet.getColumn(4).width = 15; // USD Equivalent
        sheet.getColumn(5).width = 20; // Other Currency (ZMW/RWF/BIF)
        // 1. Title
        sheet.mergeCells('A1:E2');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'TRIP BUDGET & CLEARANCE SHEET';
        titleCell.style = titleStyle;

        let currRow = 4;

        // 2. Trip Details Headers
        const addProjectInfo = (label: string, value: string) => {
            const rowIdx = currRow++;
            const row = sheet.getRow(rowIdx);
            row.getCell(1).value = label;
            row.getCell(1).font = { bold: true };
            row.getCell(1).border = borderStyle;
            row.getCell(2).value = value;
            row.getCell(2).border = borderStyle;
            row.getCell(3).border = borderStyle;
            row.getCell(4).border = borderStyle;
            row.getCell(5).border = borderStyle;
            sheet.mergeCells(`B${rowIdx}:E${rowIdx}`);
        };

        addProjectInfo('Trip Reference:', tripData.trip_number || (auditTrail as any)?.reference_number || 'STANDALONE-BUDGET');
        addProjectInfo('Date Generated:', new Date().toLocaleDateString());
        addProjectInfo('Vehicle (Horse):', fleet.find(f => f.id === tripData.vehicle_id)?.vehicle_no || 'Pending');
        addProjectInfo('Linked Trailer:', fleet.find(f => f.id === tripData.trailer_id)?.vehicle_no || 'None Coupled');
        addProjectInfo('Driver:', drivers.find(d => d.id === tripData.driver_id)?.full_name || 'Pending');
        addProjectInfo('Route / Destination:', tripData.destination || 'Not Specified');
        addProjectInfo('Exchange Rates:', `1 USD = ${countryRates["TZ"] || 2700} TZS${activeCountries.includes('Zambia') ? ` | 1 USD = ${countryRates["Zambia"] || 25.5} ZMW` : ''}`);
        if (activeCountries.includes('Zambia')) {
            addProjectInfo('Zambia Rate (USD to ZMW):', `1 USD = ${countryRates["Zambia"] || 25.5} ZMW`);
        }

        currRow += 2;

        // 3. Financial Summary
        sheet.mergeCells(`A${currRow}:E${currRow}`);
        sheet.getRow(currRow).getCell(1).value = 'FINANCIAL SUMMARY';
        sheet.getRow(currRow).getCell(1).font = { bold: true, size: 12 };
        sheet.getRow(currRow).getCell(1).alignment = { horizontal: 'center' };
        currRow++;

        const addSummaryLine = (label: string, usd: number, tzs: number, color?: string) => {
            const rowIdx = currRow++;
            const row = sheet.getRow(rowIdx);
            row.getCell(1).value = label;
            row.getCell(3).value = tzs;
            row.getCell(3).numFmt = '#,##0 "TSHS"';
            row.getCell(3).font = { bold: true };
            
            row.getCell(4).value = usd;
            row.getCell(4).numFmt = '"$"#,##0.00';
            
            row.eachCell({ includeEmpty: true }, (c, colNumber) => {
                if (colNumber <= 5) c.border = borderStyle;
            });
            
            if (color) row.getCell(1).font = { bold: true, color: { argb: color } };
            // Merge description and nature columns for financial summary for a cleaner look
            sheet.mergeCells(`A${rowIdx}:B${rowIdx}`);
        };

        const tzR = countryRates["TZ"] || 2700;
        const zmwR = countryRates["Zambia"] || 25.5;
        const revTzs = parseFloat(revenueData.revenue_amount || '0');
        const revUsd = revenueData.revenue_currency === 'TZS' ? revTzs / tzR : parseFloat(revenueData.revenue_amount || '0');

        addSummaryLine('GROSS TRIP REVENUE', revUsd, revTzs);
        addSummaryLine('CUMULATIVE TRIP COSTS', totals.totalExpensesUSD, totals.totalExpensesTZS, 'C0504D');
        addSummaryLine('PROJECTED NET PROFIT', totals.netProfitUSD, totals.netProfitUSD * (countryRates["TZ"] || 2700), totals.netProfitUSD < 0 ? 'C0504D' : '107C10');

        currRow += 2;

        // 4. Detailed Expenses Breakdown
        const categories = [
            { id: 'TZ', label: 'TANZANIA OPERATIONS' },
            { id: 'Zambia', label: 'ZAMBIA OPERATIONS' },
            { id: 'DRC', label: 'DR CONGO OPERATIONS' },
            { id: 'Rwanda', label: 'RWANDA OPERATIONS' },
            { id: 'Burundi', label: 'BURUNDI OPERATIONS' },
            { id: 'Fixed', label: 'FIXED EXPENSES & OVERHEAD' }
        ];

        categories.forEach(cat => {
            if (!activeCountries.includes(cat.id) && cat.id !== 'Fixed') return;

            const sectionHeaderIdx = currRow++;
            const sectionHeader = sheet.getRow(sectionHeaderIdx);
            sectionHeader.getCell(1).value = cat.label;
            sectionHeader.getCell(1).style = headerStyle;
            sheet.mergeCells(`A${sectionHeaderIdx}:E${sectionHeaderIdx}`);

            const tableHeader = sheet.getRow(currRow++);
            tableHeader.getCell(1).value = 'Item Description';
            tableHeader.getCell(2).value = 'Nature';
            tableHeader.getCell(3).value = 'Amount (USD)';
            tableHeader.getCell(3).alignment = { horizontal: 'right' };
            
            let tzsCol = 4;
            if (cat.id === 'Zambia') {
                tableHeader.getCell(4).value = 'Amount (ZMW)';
                tableHeader.getCell(4).alignment = { horizontal: 'right' };
                tzsCol = 5;
            } else if (cat.id === 'Rwanda') {
                tableHeader.getCell(4).value = 'Amount (RWF)';
                tableHeader.getCell(4).alignment = { horizontal: 'right' };
                tzsCol = 5;
            } else if (cat.id === 'Burundi') {
                tableHeader.getCell(4).value = 'Amount (BIF)';
                tableHeader.getCell(4).alignment = { horizontal: 'right' };
                tzsCol = 5;
            }
            
            tableHeader.getCell(tzsCol).value = 'Amount (TZS)';
            tableHeader.getCell(tzsCol).alignment = { horizontal: 'right' };
            
            tableHeader.eachCell({ includeEmpty: true }, (c, colNumber) => {
                const limit = ['Zambia', 'Rwanda', 'Burundi'].includes(cat.id) ? 5 : 4;
                if (colNumber <= limit) {
                    c.font = { bold: true };
                    c.border = borderStyle;
                    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8FAFC' } };
                }
            });

            const catExpenses = expenses.filter(e => e.category === cat.id);
            catExpenses.forEach(exp => {
                const rowIdx = currRow++;
                const row = sheet.getRow(rowIdx);
                
                const amt = parseFloat(exp.amount) || 0;
                let amtUsd = 0;
                let amtTzs = 0;
                let amtLocal = 0;

                if (exp.currency === 'USD') {
                    amtUsd = amt;
                    amtTzs = amt * tzR;
                    if (cat.id === 'Zambia') amtLocal = amt * (countryRates["Zambia"] || 100);
                    else if (cat.id === 'Rwanda') amtLocal = amt * (countryRates["Rwanda"] || 2);
                    else if (cat.id === 'Burundi') amtLocal = amt * (countryRates["Burundi"] || 1);
                } else if (exp.currency === 'TZS' || exp.currency === 'TZ') {
                    amtTzs = amt;
                    amtUsd = amt / tzR;
                    if (cat.id === 'Zambia') amtLocal = amtUsd * (countryRates["Zambia"] || 100);
                    else if (cat.id === 'Rwanda') amtLocal = amtUsd * (countryRates["Rwanda"] || 2);
                    else if (cat.id === 'Burundi') amtLocal = amtUsd * (countryRates["Burundi"] || 1);
                } else {
                    amtLocal = amt;
                    if (cat.id === 'Zambia') amtUsd = amt / (countryRates["Zambia"] || 100);
                    else if (cat.id === 'Rwanda') amtUsd = amt / (countryRates["Rwanda"] || 2);
                    else if (cat.id === 'Burundi') amtUsd = amt / (countryRates["Burundi"] || 1);
                    else amtUsd = amt;
                    amtTzs = amtUsd * tzR;
                }

                row.getCell(1).value = exp.item_name;
                row.getCell(2).value = exp.nature || 'General';
                
                row.getCell(3).value = amtUsd;
                row.getCell(3).numFmt = '"$"#,##0.00';
                
                if (cat.id === 'Zambia') {
                    row.getCell(4).value = Math.round(amtLocal);
                    row.getCell(4).numFmt = '#,##0 "K"';
                } else if (cat.id === 'Rwanda') {
                    row.getCell(4).value = Math.round(amtLocal);
                    row.getCell(4).numFmt = '#,##0 "RWF"';
                } else if (cat.id === 'Burundi') {
                    row.getCell(4).value = Math.round(amtLocal);
                    row.getCell(4).numFmt = '#,##0 "BIF"';
                }

                row.getCell(tzsCol).value = Math.round(amtTzs);
                row.getCell(tzsCol).numFmt = '#,##0';
                
                row.eachCell({ includeEmpty: true }, (c, colNumber) => {
                    const limit = ['Zambia', 'Rwanda', 'Burundi'].includes(cat.id) ? 5 : 4;
                    if (colNumber <= limit) c.border = borderStyle;
                });
            });

            const subTotalRowIdx = currRow++;
            const subTotalRow = sheet.getRow(subTotalRowIdx);
            subTotalRow.getCell(1).value = `SUBTOTAL ${cat.label}`;
            subTotalRow.getCell(1).style = subtotalStyle;
            
            subTotalRow.getCell(3).value = totals.categoryTotals[cat.id]?.usd || 0;
            subTotalRow.getCell(3).numFmt = '"$"#,##0.00';
            
            if (cat.id === 'Zambia') {
                subTotalRow.getCell(4).value = Math.round((totals.categoryTotals[cat.id]?.usd || 0) * (countryRates["Zambia"] || 100));
                subTotalRow.getCell(4).numFmt = '#,##0 "K"';
            } else if (cat.id === 'Rwanda') {
                subTotalRow.getCell(4).value = Math.round((totals.categoryTotals[cat.id]?.usd || 0) * (countryRates["Rwanda"] || 2));
                subTotalRow.getCell(4).numFmt = '#,##0 "RWF"';
            } else if (cat.id === 'Burundi') {
                subTotalRow.getCell(4).value = Math.round((totals.categoryTotals[cat.id]?.usd || 0) * (countryRates["Burundi"] || 1));
                subTotalRow.getCell(4).numFmt = '#,##0 "BIF"';
            }
            
            subTotalRow.getCell(tzsCol).value = totals.categoryTotals[cat.id]?.tzs || 0;
            subTotalRow.getCell(tzsCol).numFmt = '#,##0';
            
            sheet.mergeCells(`A${subTotalRowIdx}:B${subTotalRowIdx}`);

            subTotalRow.eachCell({ includeEmpty: true }, (c, colNumber) => {
                const limit = ['Zambia', 'Rwanda', 'Burundi'].includes(cat.id) ? 5 : 4;
                if (colNumber <= limit) {
                    c.font = { bold: true };
                    c.border = borderStyle;
                }
            });

            currRow += 1;
        });

        currRow += 2;

        // 5. Signature Section (THE RELEVANT TABLE)
        const addSignatureTable = (title: string, name: string, pos: string) => {
            const headRow = sheet.getRow(currRow++);
            headRow.getCell(1).value = title.toUpperCase();
            headRow.getCell(2).value = 'POSITION';
            headRow.getCell(3).value = 'SIGNATURE & DATE';
            headRow.eachCell(c => {
                c.style = titleStyle;
                c.border = borderStyle;
                c.font = { bold: true, size: 10 };
            });
            sheet.mergeCells(`C${currRow - 1}:E${currRow - 1}`);

            const dataRow = sheet.getRow(currRow++);
            dataRow.height = 40;
            dataRow.getCell(1).value = name;
            dataRow.getCell(2).value = pos;
            dataRow.eachCell(c => {
                c.alignment = { vertical: 'middle' };
                c.border = borderStyle;
            });
            sheet.mergeCells(`C${currRow - 1}:E${currRow - 1}`);
            currRow++;
        };

        sheet.getColumn(4).width = 25; // TZS / Date Column

        addSignatureTable('Prepared By', 'KONYA PAUL', 'Fleet Manager');
        addSignatureTable('First Approved By', 'YAHYA KILUA', 'Operations Manager');
        addSignatureTable('Final Approved By', 'SOOD M. SOOD', 'Managing Director');

        // 6. Lock the sheet (Read-only protection)
        sheet.protect('budget_locked', {
            selectLockedCells: true,
            selectUnlockedCells: false,
            insertRows: false,
            deleteRows: false,
            formatCells: false,
            formatColumns: false,
            formatRows: false
        });

        // Generate & Download
        // 🔒 Protect the sheet to prevent data manipulation
        sheet.protect('qoder123', {
            formatColumns: true,
            formatRows: true,
            formatCells: true,
            selectLockedCells: true,
            selectUnlockedCells: true,
            insertColumns: false,
            insertRows: false,
            deleteColumns: false,
            deleteRows: false
        });

        const workbookBuffer = await workbook.xlsx.writeBuffer();
        const tripRef = tripData.trip_number || (auditTrail as any)?.reference_number || 'New';
        const routeSlug = tripData.destination ? `_${tripData.destination.replace(/[^a-zA-Z0-9]/g, '-')}` : '';
        saveAs(new Blob([workbookBuffer]), `${tripRef}${routeSlug}.xlsx`);
    };

     const handleApprove = async () => {
        if (!tripId) return;
        
        // Strict Validation Check
        if (!tripData.vehicle_id || !tripData.trailer_id || tripData.trailer_id === 'none') {
            toast({ variant: "destructive", title: "Approval Blocked", description: "You cannot approve a trip without an assigned Horse and a Linked Trailer." });
            return;
        }

        if (!tripData.trip_number) {
            toast({ variant: "destructive", title: "Approval Blocked", description: "Trip Reference Number is required for approval." });
            return;
        }

        if (!tripData.journey_type) {
            toast({ variant: "destructive", title: "Approval Blocked", description: "Journey Type must be specified before approval." });
            return;
        }

        setIsApproving(true);
        try {
            const approverName = (userProfile as any)?.full_name || (userProfile as any)?.username || 'Super Admin';
            const { error } = await supabase
                .from('logistics_trip_sheets' as any)
                .update({
                    status: 'Approved',
                    approved_by: user?.id,
                    approved_by_name: userProfile?.full_name || user?.email,
                    approved_at: new Date().toISOString()
                })
                .eq('id', tripId);
            if (error) throw error;
            setCurrentStatus('Approved');
            setAuditTrail(prev => ({
                ...prev,
                approved_by_name: userProfile?.full_name || user?.email,
                approved_at: new Date().toISOString()
            }));
            toast({ title: "Budget Approved ✅", description: "This budget is now officially locked and ready for activation." });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Approve Failed", description: error.message });
        } finally {
            setIsApproving(false);
        }
    };

    const handleActivate = async () => {
        if (!tripId) return;
        if (!tripData.vehicle_id || !tripData.driver_id) {
            toast({ variant: "destructive", title: "Missing Assignment", description: "Please assign a Vehicle and Driver before activating the trip." });
            return;
        }
        setIsActivating(true);
        try {
            // 1. Update the Trip Sheet Status to Active
            const { error: sheetError } = await supabase
                .from('logistics_trip_sheets' as any)
                .update({
                    status: 'Active',
                    vehicle_id: tripData.vehicle_id,
                    driver_id: tripData.driver_id,
                    trailer_id: tripData.trailer_id || null,
                    activated_by: user?.id,
                    activated_by_name: userProfile?.full_name || user?.email,
                    activated_at: new Date().toISOString()
                })
                .eq('id', tripId);
            if (sheetError) throw sheetError;

            // 2. CREATE THE OFFICIAL TRIP in logistics_trips
            // This makes it show up in the "Trip Management" (Planned) column.
            const tripFormattedData = {
                vehicle_id: tripData.vehicle_id,
                driver_id: tripData.driver_id,
                trailer_id: tripData.trailer_id || null,
                origin: tripData.origin,
                destination: tripData.destination,
                cargo_outbound: tripData.cargo_outbound,
                notes: tripData.notes,
                status: 'Planned', // Becomes Planned in the main board
                trip_sheet_id: tripId, // Link them
                fuel_liters: parseFloat(revenueData.fuel_liters) || 0,
                trip_allowance: totals.totalExpensesTZS, // Use the TZS subtotal for allowance
                created_by: user?.id // Track who activated/created this operational record
            };

            const { error: tripError } = await supabase
                .from('logistics_trips' as any)
                .insert([tripFormattedData]);

            if (tripError) {
                console.warn("Trip created in logistics_trips but failed to link correctly:", tripError.message);
                // We don't throw here to avoid Rollback confusion, but we notify.
            }

            setCurrentStatus('Active');
            setAuditTrail(prev => ({
                ...prev,
                activated_by_name: userProfile?.full_name || user?.email,
                activated_at: new Date().toISOString()
            }));
            toast({ title: "Trip Activated 🚛", description: "The plan is now an active trip in Trip Management." });
            if (onSaveSuccess) onSaveSuccess();
        } catch (error: any) {
            toast({ variant: "destructive", title: "Activation Failed", description: error.message });
        } finally {
            setIsActivating(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Planned':
                return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Unapproved Draft</Badge>;
            case 'Approved':
                return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Budget Approved</Badge>;
            case 'Active':
                return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Trip Active</Badge>;
            case 'Completed':
                return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">Completed</Badge>;
            default:
                return null;
        }
    };

    if (isLoading) return <div className="p-8 text-center text-slate-400">Loading Trip Financials...</div>;

    const renderExpenseSection = (title: string, category: 'TZ' | 'Zambia' | 'DRC' | 'Rwanda' | 'Burundi' | 'Fixed', icon: any) => {
        const filteredExpenses = expenses
            .map((e, i) => ({ ...e, originalIndex: i }))
            .filter(e => e.category === category && !e.is_extra);

        return (
            <div className="space-y-4 print:space-y-1">
                {/* Professional Table Header */}
                <div className="flex gap-4 px-4 py-2 bg-slate-100/50 rounded-lg text-[9px] font-bold text-slate-400 uppercase tracking-widest print:hidden">
                    <div className="flex-[8] min-w-[200px]">Expense Description</div>
                    <div className="w-28 text-center">Nature</div>
                    <div className="w-40 text-right pr-4">Currency & Amount</div>
                    {category === 'TZ' ? (
                        <div className="w-20 text-right">USD</div>
                    ) : (
                        <div className="w-20 text-right">TZS Equiv.</div>
                    )}
                    <div className="w-6"></div>
                </div>

                <div className="grid gap-1.5 print:gap-1 max-h-[450px] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
                    {filteredExpenses.map((item) => {
                        const inputAmount = parseFloat(item.amount) || 0;
                        const tzRate = countryRates["TZ"] || 2700;
                        const zambiaRate = countryRates["Zambia"] || 100;
                        const rwandaRate = countryRates["Rwanda"] || 2;
                        const burundiRate = countryRates["Burundi"] || 1;
                        const drcRate = countryRates["DRC"] || 1.0;

                        let amountTSh = 0;
                        let amountUSD = 0;
                        let amountZMW = 0;
                        let amountRWF = 0;
                        let amountBIF = 0;
                        let amountDRC = 0;

                        if (item.currency === 'USD') {
                            amountTSh = inputAmount * tzRate;
                            amountUSD = inputAmount;
                            amountZMW = amountTSh / zambiaRate;
                            amountRWF = amountTSh / rwandaRate;
                            amountBIF = amountTSh / burundiRate;
                            amountDRC = amountTSh / drcRate;
                        } else {
                            if (category === 'TZ' || category === 'Fixed') {
                                amountTSh = inputAmount;
                                amountUSD = inputAmount / tzRate;
                            } else if (category === 'Zambia') {
                                amountTSh = inputAmount * zambiaRate;
                                amountZMW = inputAmount;
                                amountUSD = amountTSh / tzRate;
                            } else if (category === 'DRC') {
                                amountTSh = inputAmount * drcRate;
                                amountDRC = inputAmount;
                                amountUSD = amountTSh / tzRate;
                            } else if (category === 'Rwanda') {
                                amountTSh = inputAmount * rwandaRate;
                                amountRWF = inputAmount;
                                amountUSD = amountTSh / tzRate;
                            } else if (category === 'Burundi') {
                                amountTSh = inputAmount * burundiRate;
                                amountBIF = inputAmount;
                                amountUSD = amountTSh / tzRate;
                            }
                        }

                        const inputCurrencyLabel = category === 'TZ' ? 'TZS' :
                                                   category === 'Zambia' ? 'ZMW' :
                                                   category === 'DRC' ? 'USD' :
                                                   category === 'Rwanda' ? 'RWF' :
                                                   category === 'Burundi' ? 'BIF' : 'TZS';

                        return (
                            <div key={item.originalIndex} className="group flex gap-2 items-center bg-white p-1 md:p-1.5 rounded-xl border border-slate-100 hover:border-slate-200 transition-all animate-fade-in print:gap-1 print:border-none print:p-0 print:border-b print:border-slate-50">
                                <div className="flex-[8] min-w-[200px]">
                                    <div className="hidden print:block text-[9px] font-medium text-slate-700">{item.item_name}</div>
                                    <ExpenseCombobox
                                        value={item.item_name}
                                        onChange={(val) => updateExpense(item.originalIndex, 'item_name', val)}
                                        disabled={isLocked}
                                        items={expenseItemsList || []}
                                    />
                                </div>

                                <div className="w-28 print:hidden">
                                     <Select
                                        value={item.nature}
                                        onValueChange={(val) => updateExpense(item.originalIndex, 'nature', val)}
                                        disabled={isLocked}
                                    >
                                        <SelectTrigger className="h-7 !text-[12px] bg-white border-slate-100 shadow-none font-normal text-slate-500 hover:text-slate-700">
                                            <SelectValue placeholder="Nature" />
                                        </SelectTrigger>
                                        <SelectContent className="z-[100]">
                                            <SelectItem value="Go & Return">Go & Return</SelectItem>
                                            <SelectItem value="Going Only">Going Only</SelectItem>
                                            <SelectItem value="Returning Only">Returning Only</SelectItem>
                                            <SelectItem value="Single Trip">Single Trip</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="w-40 flex items-center gap-1 print:w-fit">
                                    <div className="hidden print:flex items-center justify-end gap-2 text-[9px] whitespace-nowrap">
                                        <span className="text-slate-900 font-bold">{item.currency === 'USD' ? 'USD' : inputCurrencyLabel} {Math.round(inputAmount).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center gap-1 print:hidden w-full">
                                        {category === 'Fixed' && <Badge variant="outline" className="text-[7px] h-4 px-1 border-red-200 text-red-500 bg-red-50 mr-1">EXCLUDED</Badge>}
                                        <Select
                                            value={item.currency === 'USD' ? 'USD' : inputCurrencyLabel}
                                            onValueChange={(val) => updateExpense(item.originalIndex, 'currency', val)}
                                            disabled={isLocked}
                                        >
                                            <SelectTrigger className="h-7 w-14 shrink-0 text-[9px] font-bold bg-slate-100 border-none shadow-none px-1.5 text-slate-500 hover:bg-slate-200 focus:ring-0">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="z-[100]">
                                                <SelectItem value={inputCurrencyLabel} className="text-xs font-bold">{inputCurrencyLabel}</SelectItem>
                                                {inputCurrencyLabel !== 'USD' && (
                                                    <SelectItem value="USD" className="text-xs font-bold text-emerald-700">USD $</SelectItem>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            className="h-7 text-right font-medium text-slate-800 bg-slate-50 border-slate-200/50 focus-visible:ring-1 ring-primary pr-1.5 !text-[12px] w-full tabular-nums"
                                            type="text"
                                            placeholder="0"
                                            value={formatWithCommas(item.amount || '')}
                                            onChange={(e) => updateExpense(item.originalIndex, 'amount', e.target.value)}
                                            disabled={isLocked}
                                        />
                                    </div>
                                </div>
                                
                                {category === 'TZ' ? (
                                    <div className="w-20 text-right print:hidden shrink-0">
                                        <p className="text-[11px] font-semibold text-slate-400">
                                            ${Math.round(amountUSD).toLocaleString()}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="w-20 text-right print:hidden shrink-0">
                                        <p className="text-[10px] font-bold text-slate-600">
                                            TShs {Math.round(amountTSh).toLocaleString()}
                                        </p>
                                    </div>
                                )}

                                <div className="w-6 flex justify-end shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-slate-200 hover:text-destructive hover:bg-destructive/5 opacity-0 group-hover:opacity-100 transition-opacity print:hidden"
                                        onClick={() => removeExpense(item.originalIndex)}
                                        disabled={isLocked}
                                    >
                                        <Trash2 size={12} />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {filteredExpenses.length === 0 && (
                    <div className="text-center py-4 border-2 border-dashed rounded-lg text-muted-foreground text-[10px]">
                        No {title} expenses recorded yet
                    </div>
                )}
            </div>
        );
    };

    return (
        <div id="print-logistics" className="space-y-8 w-full max-w-none pb-8 px-1 md:px-2 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* 🔒 INVOICE LOCK NOTIFICATION */}
            {isLocked && (
                <div className="bg-red-600 text-white p-4 rounded-2xl flex items-center justify-center gap-4 shadow-xl border-4 border-white/20 animate-in slide-in-from-top-4 print:hidden">
                    <div className="bg-white/20 p-2 rounded-full">
                        <ShieldCheck size={24} className="text-white" />
                    </div>
                    <div>
                        <p className="text-sm font-black uppercase tracking-[0.1em]">⚠️ RECORD PERMANENTLY LOCKED: INVOICE GENERATED</p>
                        <p className="text-[10px] font-bold opacity-80 uppercase">This record is finalized and cannot be modified by any user to ensure top-level financial integrity.</p>
                    </div>
                </div>
            )}
            {/* 📄 Header for Printing Only */}
            <div className="hidden print:block p-4 border-b-2 border-slate-900 mb-6 bg-white">
                <div className="flex justify-between items-center text-slate-900 font-bold">
                    <div>
                        <h1 className="text-xl font-black uppercase tracking-tight">Pro-Forma Trip Budget</h1>
                        <div className="flex gap-4 mt-1 text-[10px] text-slate-600 uppercase tracking-wider">
                            <p>Date: {new Date().toLocaleDateString()}</p>
                            <p className="text-primary">Rate: $1 = {countryRates["TZ"] || 2700} TSh</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xl font-black">{tripData.vehicle_id ? (fleet.find(f => f.id === tripData.vehicle_id)?.vehicle_no) : 'N/A'}</div>
                        <p className="text-xs uppercase tracking-widest">{tripData.destination || 'Unplanned Route'}</p>
                    </div>
                </div>
            </div>

            {/* 📊 Financial Summary Bar (Stays on screen, hidden in print) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden sticky top-0 z-40 bg-slate-50/80 backdrop-blur-md p-4 rounded-2xl border shadow-lg">
                <div className="bg-white p-3 rounded-xl border shadow-sm col-span-1 sm:col-span-2 lg:col-span-1">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Globe size={10} className="text-primary opacity-70" />
                        Market Exchange Rates
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <div className="space-y-1 flex-1 min-w-[120px]">
                            <Label className="text-[10px] font-medium text-slate-400 uppercase">TZ (USD to TZS)</Label>
                            <div className="relative">
                                <span className="absolute left-2.5 top-2 text-slate-400 font-semibold text-[10px]">$1 =</span>
                                <Input
                                    className="pl-8 h-8 bg-slate-50/50 border-slate-200 font-medium text-slate-900 text-xs focus-visible:ring-1 ring-primary"
                                    type="number"
                                    value={countryRates["TZ"]}
                                    onChange={(e) => setCountryRates({ ...countryRates, "TZ": parseFloat(e.target.value) || 0 })}
                                    disabled={isLocked}
                                />
                            </div>
                        </div>
                        {activeCountries.includes('Zambia') && (
                            <div className="space-y-1 flex-1 min-w-[120px] animate-in slide-in-from-left-2">
                                <Label className="text-[8px] font-medium text-slate-400 uppercase tracking-tighter">Zambia (1 ZMW = TZS)</Label>
                                <div className="relative">
                                    <span className="absolute left-2.5 top-2 text-slate-400 font-medium text-[10px]">K1 =</span>
                                    <Input
                                        className="pl-8 h-8 bg-slate-50/50 border-slate-200 font-normal text-slate-700 text-xs focus-visible:ring-1 ring-emerald-500"
                                        type="number"
                                        value={countryRates["Zambia"]}
                                        onChange={(e) => setCountryRates({ ...countryRates, "Zambia": parseFloat(e.target.value) || 0 })}
                                        disabled={isLocked}
                                    />
                                </div>
                            </div>
                        )}
                        {activeCountries.includes('DRC') && (
                            <div className="space-y-1 flex-1 min-w-[120px] animate-in slide-in-from-left-2">
                                <Label className="text-[8px] font-medium text-slate-400 uppercase tracking-tighter">DRC ($ Price)</Label>
                                <div className="relative">
                                    <span className="absolute left-2.5 top-2 text-slate-400 font-medium text-[10px]">$1 =</span>
                                    <Input
                                        className="pl-8 h-8 bg-slate-50/50 border-slate-200 font-normal text-slate-700 text-xs focus-visible:ring-1 ring-amber-500"
                                        type="number"
                                        value={countryRates["DRC"]}
                                        onChange={(e) => setCountryRates({ ...countryRates, "DRC": parseFloat(e.target.value) || 0 })}
                                        disabled={isLocked}
                                    />
                                </div>
                            </div>
                        )}
                        {activeCountries.includes('Rwanda') && (
                            <div className="space-y-1 flex-1 min-w-[120px] animate-in slide-in-from-left-2">
                                <Label className="text-[8px] font-medium text-slate-400 uppercase tracking-tighter">Rwanda (1 RWF = TZS)</Label>
                                <div className="relative">
                                    <span className="absolute left-2.5 top-2 text-slate-400 font-medium text-[10px]">RWF 1 =</span>
                                    <Input
                                        className="pl-14 h-8 bg-slate-50/50 border-slate-200 font-normal text-slate-700 text-xs focus-visible:ring-1 ring-purple-500"
                                        type="number"
                                        value={countryRates["Rwanda"]}
                                        onChange={(e) => setCountryRates({ ...countryRates, "Rwanda": parseFloat(e.target.value) || 0 })}
                                        disabled={isLocked}
                                    />
                                </div>
                            </div>
                        )}
                        {activeCountries.includes('Burundi') && (
                            <div className="space-y-1 flex-1 min-w-[120px] animate-in slide-in-from-left-2">
                                <Label className="text-[8px] font-medium text-slate-400 uppercase tracking-tighter">Burundi (1 BIF = TZS)</Label>
                                <div className="relative">
                                    <span className="absolute left-2.5 top-2 text-slate-400 font-medium text-[10px]">BIF 1 =</span>
                                    <Input
                                        className="pl-12 h-8 bg-slate-50/50 border-slate-200 font-normal text-slate-700 text-xs focus-visible:ring-1 ring-rose-500"
                                        type="number"
                                        value={countryRates["Burundi"]}
                                        onChange={(e) => setCountryRates({ ...countryRates, "Burundi": parseFloat(e.target.value) || 0 })}
                                        disabled={isLocked}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-slate-900 p-3 rounded-xl shadow-lg">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">Gross Revenue</p>
                        <div className="px-2 py-0.5 bg-slate-800 rounded text-white text-[9px] font-semibold uppercase">
                            {revenueData.revenue_currency}
                        </div>
                    </div>
                    <div className="relative">
                        <span className="absolute left-2.5 top-2.5 text-slate-400 font-bold text-[10px]">{revenueData.revenue_currency === 'TZS' ? 'TShs' : 'USD'}.</span>
                        <div className="h-9 rounded-md bg-slate-800/50 text-white font-bold text-lg pl-12 flex items-center w-full select-none cursor-not-allowed opacity-80">
                            {revenueData.revenue_amount ? Number(revenueData.revenue_amount).toLocaleString() : '0'}
                        </div>
                    </div>
                    <p className="text-[9px] font-medium text-slate-500 mt-1.5 text-right">
                        {revenueData.revenue_currency === 'TZS' 
                            ? `Approx $${((parseFloat(revenueData.revenue_amount) || 0) / (countryRates["TZ"] || 2700)).toLocaleString()} USD`
                            : `Approx TShs ${(parseFloat(revenueData.revenue_amount || '0') * (countryRates["TZ"] || 2700)).toLocaleString()}`
                        }
                    </p>
                </div>

                <div className="bg-orange-500 p-3 rounded-xl shadow-md">
                    <p className="text-[10px] font-semibold text-orange-100 uppercase tracking-wider mb-1 text-right opacity-80">Operational Cost</p>
                    <div className="text-right">
                        <p className="text-lg font-bold text-white leading-tight">TShs {totals.totalExpensesTZS.toLocaleString()}</p>
                        <p className="text-[10px] text-orange-100 font-medium mt-1 opacity-80">Approx. ${totals.totalExpensesUSD.toLocaleString()} USD</p>
                    </div>
                </div>

                <div className="bg-emerald-500 p-3 rounded-xl shadow-md">
                    <p className="text-[10px] font-semibold text-emerald-100 uppercase tracking-wider mb-1 text-right opacity-80">Expected Surplus</p>
                    <div className="text-right">
                        <p className={`text-xl font-bold text-white leading-none ${totals.netProfitUSD < 0 ? 'text-red-100' : ''}`}>
                            TSh { (totals.netProfitUSD * (countryRates["TZ"] || 2700)).toLocaleString() }
                        </p>
                        <p className="text-[10px] text-emerald-100 font-medium mt-1.5 opacity-80">
                            Est. ${totals.netProfitUSD.toLocaleString()} USD
                        </p>
                    </div>
                </div>
            </div>

            {/* 🔒 Locking Badge Indicator */}
            {isLocked && (
                <div className="sticky top-0 z-50 bg-amber-500 text-white text-[10px] font-bold py-1 px-4 flex items-center justify-center gap-2 rounded-t-lg -mx-6 -mt-6">
                    <ShieldCheck size={14} />
                    READ-ONLY MODE: Budget is locked after Superadmin Approval. For accountability, no more changes are allowed.
                </div>
            )}

            {/* 🕰 Audit Trail Header */}
            <div className="grid grid-grid-cols-1 md:grid-cols-3 gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 border-dashed mb-4">
                <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Prepared By</span>
                    <span className="text-[11px] font-medium text-slate-700">
                        {auditTrail.created_by_name || userProfile?.full_name || user?.email || "Unknown"}
                        {(auditTrail.created_at || (!tripId && !duplicateData)) && (
                            <span className="ml-1 text-slate-400 font-normal">
                                on {new Date(auditTrail.created_at || new Date()).toLocaleDateString()}
                            </span>
                        )}
                    </span>
                </div>
                {auditTrail.approved_by_name && (
                    <div className="flex flex-col border-l border-slate-200 pl-4">
                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Approved By</span>
                        <span className="text-[11px] font-bold text-blue-700">
                            {auditTrail.approved_by_name}
                            {auditTrail.approved_at && <span className="ml-1 text-slate-400 font-normal">on {new Date(auditTrail.approved_at).toLocaleDateString()}</span>}
                        </span>
                    </div>
                )}
                {auditTrail.activated_by_name && (
                    <div className="flex flex-col border-l border-slate-200 pl-4">
                        <span className="text-[10px] font-semibold text-emerald-500 pb-0.5">Activated By</span>
                        <span className="text-xs font-bold text-emerald-700">
                            {auditTrail.activated_by_name}
                            {auditTrail.activated_at && <span className="ml-1 text-slate-400 font-normal">on {new Date(auditTrail.activated_at).toLocaleDateString()}</span>}
                        </span>
                    </div>
                )}
            </div>

            <Tabs defaultValue="planning" className="w-full">
                <TabsList className={cn("grid w-full md:w-[400px]", isSuperAdmin ? "grid-cols-3" : "grid-cols-1 md:w-[150px]")}>
                    <TabsTrigger value="planning">Planning</TabsTrigger>
                    {isSuperAdmin && <TabsTrigger value="revenue">Revenue</TabsTrigger>}
                    {isSuperAdmin && <TabsTrigger value="audit">Accountability</TabsTrigger>}
                </TabsList>

                <TabsContent value="planning" className="mt-6">
                    {/* 📍 Section 1: Asset Assignment & Route Details */}
                    <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200 print:shadow-none print:ring-1 print:ring-slate-900">
                        <CardHeader className="bg-slate-50/80 border-b border-slate-200 py-4 px-8 print:bg-white print:border-b-2 print:border-slate-900">
                            <CardTitle className="text-[15px] font-bold text-slate-800 flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg text-primary print:hidden">
                                    <Navigation size={18} />
                                </div>
                                1. Asset Assignment & Route Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                {/* LEFT COLUMN: Assets & IDs */}
                                <div className="space-y-6">
                                    {/* NEW: Client Name (Mandatory) */}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                                            Client / Company Name <span className="text-red-500">*</span>
                                        </Label>
                                        <div className="relative group">
                                            <div className="absolute left-3 top-3 text-primary opacity-50">
                                                <Building2 size={16} />
                                            </div>
                                            <Input 
                                                className="h-11 bg-white border-slate-200 pl-10 font-medium text-slate-700 shadow-sm focus:ring-primary/20"
                                                value={tripData.client_name || ''}
                                                onChange={(e) => setTripData({ ...tripData, client_name: e.target.value })}
                                                placeholder="Who is paying for this trip?"
                                                disabled={isLocked}
                                            />
                                        </div>
                                        <p className="text-[9px] text-slate-400 font-medium italic">Used for automatic grouping of vehicles.</p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold text-slate-500">Trip Reference Number</Label>
                                        <div className="relative">
                                            <FileText size={16} className="absolute left-3 top-3 text-primary opacity-50" />
                                            <Input 
                                                className="h-11 bg-slate-50 border-slate-200 pl-10 font-semibold text-slate-900 shadow-sm"
                                                value={tripData.trip_number}
                                                onChange={(e) => setTripData({...tripData, trip_number: e.target.value})}
                                                placeholder="Generating ID..."
                                                readOnly={isLocked}
                                            />
                                        </div>
                                    </div>



                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-semibold text-slate-500">Vehicle (Horse)</Label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        role="combobox"
                                                        disabled={isLocked && !isSuperAdmin}
                                                        className={cn(
                                                            "h-11 w-full justify-between bg-white border-slate-200 shadow-sm print:h-8 print:border-none print:p-0",
                                                            !tripData.vehicle_id && "text-muted-foreground"
                                                        )}
                                                    >
                                                        {tripData.vehicle_id
                                                            ? (fleet.find((v) => v.id === tripData.vehicle_id)?.vehicle_no || 'Unknown')
                                                            : "Select Horse"}
                                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[var(--radix-popover-trigger-width)] sm:w-[300px] p-0 z-[100]" align="start">
                                                    <Command>
                                                        <CommandInput placeholder="Search vehicle..." />
                                                        <CommandList className="max-h-[350px]">
                                                            <CommandEmpty>No vehicle found.</CommandEmpty>
                                                            <CommandGroup>
                                                                <div className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] bg-slate-50 border-y border-slate-100">Horse / Tractor</div>
                                                                {fleet
                                                                    .filter(f => f.asset_type === 'Truck' || f.asset_type === 'Horse')
                                                                    .map((v) => {
                                                                        const isBusy = v.assignment_status === 'Active';
                                                                        return (
                                                                        <CommandItem
                                                                            key={v.id}
                                                                            value={v.vehicle_no + " " + v.make_model}
                                                                            disabled={isBusy}
                                                                            onSelect={async () => {
                                                                                if (isBusy) return;
                                                                                
                                                                                // Check for Active Coupling
                                                                                const activeCoupling = couplings.find(c => c.horse_id === v.id);
                                                                                if (!activeCoupling) {
                                                                                    toast({
                                                                                        variant: "destructive",
                                                                                        title: "Trailer Link Missing",
                                                                                        description: `${v.vehicle_no} is not linked to any trailer in the Registry. Please link them first.`
                                                                                    });
                                                                                    return;
                                                                                }

                                                                                const trailerFound = fleet.find(f => String(f.id).toLowerCase().trim() === String(activeCoupling.trailer_id).toLowerCase().trim());
                                                                                const trailerIsTanker = trailerFound?.asset_type?.toLowerCase().includes('tanker') || trailerFound?.fleet_category?.toLowerCase() === 'tanker';
                                                                                const isTanker = v.asset_type?.toLowerCase().includes('tanker') || v.fleet_category?.toLowerCase() === 'tanker' || trailerIsTanker;
                                                                                const journeyType = isTanker ? "Go Only (Return Empty)" : "Go & Return (Full Cycle)";
                                                                                
                                                                                // Generate Trip ID logic
                                                                                const cleanHorse = v.vehicle_no.replace(/\s*[A-Z]+$/, "").trim();
                                                                                const { count } = await supabase.from('logistics_trip_sheets' as any).select('*', { count: 'exact', head: true });
                                                                                const { count: transitCount } = await supabase.from('logistics_transit_trips' as any).select('*', { count: 'exact', head: true });
                                                                                const totalTrips = (count || 0) + (transitCount || 0);
                                                                                const seq = String(totalTrips + 1).padStart(3, '0');
                                                                                const legIndicator = isTanker ? "T" : "G";
                                                                                const newTripId = `${cleanHorse}/2025/${legIndicator}${seq}`;

                                                                                // Auto-fill driver assigned to this vehicle
                                                                                const assignedDriver = drivers.find((d: any) => d.assigned_vehicle_id === v.id);

                                                                                setTripData({
                                                                                    ...tripData,
                                                                                    vehicle_id: v.id,
                                                                                    trailer_id: activeCoupling.trailer_id,
                                                                                    trip_number: newTripId,
                                                                                    journey_type: journeyType,
                                                                                    driver_id: assignedDriver ? assignedDriver.id : tripData.driver_id
                                                                                });

                                                                                const trailerDisplay = trailerFound ? (trailerFound.vehicle_no || trailerFound.trailer_number) : activeCoupling.trailer_id;

                                                                                toast({
                                                                                    title: "Vehicle Assigned",
                                                                                    description: `Linked with Trailer ${trailerDisplay}`
                                                                                });
                                                                            }}
                                                                            className={cn(
                                                                                "flex flex-col items-start gap-1 py-2.5 px-3 transition-all",
                                                                                isBusy ? "opacity-40 cursor-not-allowed" : "hover:bg-slate-50"
                                                                            )}
                                                                        >
                                                                            <div className="flex justify-between w-full items-center">
                                                                                <span className="text-xs font-semibold text-slate-800 tracking-wide uppercase">{v.vehicle_no}</span>
                                                                                <Badge variant="outline" className="text-[8px] font-bold uppercase py-0 px-1 border-slate-200 text-slate-400">{v.fleet_category || 'Local'}</Badge>
                                                                            </div>
                                                                            <span className="text-[10px] text-slate-400 uppercase tracking-wide">{v.asset_type || 'Truck'}</span>
                                                                        </CommandItem>
                                                                        );
                                                                    })}
                                                            </CommandGroup>
                                                        </CommandList>
                                                    </Command>
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-semibold text-slate-500">Linked Trailer</Label>
                                            <div className="relative group">
                                                <div className="absolute left-3 top-2.5 text-primary opacity-50">
                                                    <Package size={16} />
                                                </div>
                                                <Input
                                                    className="h-11 bg-slate-100/50 border-slate-200 pl-10 font-medium text-slate-700 cursor-not-allowed shadow-inner"
                                                    readOnly
                                                    value={
                                                        tripData.vehicle_id 
                                                            ? (tripData.trailer_id && tripData.trailer_id !== 'none'
                                                                ? trailerPlate
                                                                : "No Coupling Found")
                                                            : "Select Horse First..."
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2 pt-4 border-t border-slate-100">
                                        <Label className="text-xs font-semibold text-slate-500">Journey Type</Label>
                                        <Select
                                            value={tripData.journey_type}
                                            onValueChange={(v) => setTripData({ ...tripData, journey_type: v })}
                                            disabled={isLocked || (fleet.find(v => v.id === tripData.vehicle_id)?.asset_type?.toLowerCase().includes('tanker'))}
                                        >
                                            <SelectTrigger className="h-11 bg-slate-50 border-slate-200 shadow-sm font-medium text-slate-700">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="z-[100]">
                                                <SelectItem value="Go & Return (Full Cycle)">Go & Return (Full Cycle)</SelectItem>
                                                <SelectItem value="Go Only (Return Empty)">Go Only (Return Empty)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* RIGHT COLUMN: Route & Cargo */}
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs font-semibold text-slate-500">Route Origin</Label>
                                                <ManageRoutesDialog />
                                            </div>
                                            <RouteCombobox
                                                value={tripData.origin}
                                                onChange={(val) => setTripData({ ...tripData, origin: val })}
                                                disabled={isLocked}
                                                placeholder="Select Origin..."
                                                items={routesList || []}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-semibold text-slate-500">Route Destination</Label>
                                            <RouteCombobox
                                                value={tripData.destination}
                                                onChange={(val) => setTripData({ ...tripData, destination: val })}
                                                disabled={isLocked}
                                                placeholder="Target City/Port"
                                                items={routesList || []}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold text-slate-500">Cargo Description</Label>
                                        <Input
                                            className="h-11 bg-white border-slate-200 shadow-sm font-medium text-slate-700"
                                            value={tripData.cargo_outbound}
                                            onChange={(e) => setTripData({ ...tripData, cargo_outbound: e.target.value })}
                                            placeholder="e.g. 30 Tons of Copper Ore"
                                            disabled={isLocked}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-semibold text-slate-500">Agreed Duration (Days)</Label>
                                            <Input
                                                className="h-11 bg-slate-50 border-slate-200 shadow-sm font-medium text-slate-700"
                                                type="number"
                                                placeholder="e.g. 5"
                                                value={tripData.agreed_days}
                                                onChange={(e) => setTripData({ ...tripData, agreed_days: e.target.value })}
                                                disabled={isLocked}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-semibold text-slate-500">Daily Penalty Fine (TShs)</Label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-3 text-slate-400 font-semibold text-[10px]">TShs</span>
                                                <Input
                                                    className="pl-12 h-11 bg-slate-50 border-slate-200 shadow-sm font-medium text-slate-700"
                                                    type="number"
                                                    value={tripData.daily_fine_amount}
                                                    onChange={(e) => setTripData({ ...tripData, daily_fine_amount: e.target.value })}
                                                    placeholder="0"
                                                    disabled={isLocked}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2 pt-4 border-t border-slate-100">
                                        <Label className="text-xs font-semibold text-slate-500">Assigned Driver</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    disabled={isLocked}
                                                    className={cn(
                                                        "h-11 w-full justify-between bg-white border-slate-200 shadow-sm font-bold text-slate-800 ring-2 ring-primary/10 transition-all hover:bg-slate-50",
                                                        !tripData.driver_id && "text-muted-foreground"
                                                    )}
                                                >
                                                    {tripData.driver_id
                                                        ? drivers.find(d => d.id === tripData.driver_id)?.full_name
                                                        : "Assign Driver"}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] sm:w-[300px] p-0 z-[100]" align="start">
                                                <Command>
                                                    <CommandInput placeholder="Search driver name..." />
                                                    <CommandList className="max-h-[300px]">
                                                        <CommandEmpty>No driver found.</CommandEmpty>
                                                        <CommandGroup>
                                                            <div className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] bg-slate-50 border-y border-slate-100">Company Drivers</div>
                                                            {drivers.map(d => {
                                                                const isExpired = d.license_expiry && new Date(d.license_expiry) < new Date();
                                                                return (
                                                                    <CommandItem
                                                                        key={d.id}
                                                                        value={d.full_name}
                                                                        onSelect={() => setTripData({ ...tripData, driver_id: d.id })}
                                                                        className="flex items-center gap-2 py-2.5 px-3"
                                                                    >
                                                                        <Check className={cn("h-4 w-4", d.id === tripData.driver_id ? "opacity-100" : "opacity-0")} />
                                                                        <div className="flex flex-col flex-1">
                                                                            <span className="text-sm font-medium text-slate-700">{d.full_name}</span>
                                                                            {isExpired && (
                                                                                <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide">⚠ Licence Expired</span>
                                                                            )}
                                                                        </div>
                                                                    </CommandItem>
                                                                );
                                                            })}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* 💰 REVENUE DETAILS TAB */}
                {isSuperAdmin && (
                    <TabsContent value="revenue" className="mt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Revenue Entry form - same as before */}
                        <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200">
                            <CardHeader className="bg-emerald-50/50 border-b border-emerald-100 py-4 px-8">
                                <CardTitle className="text-sm font-bold text-emerald-800 flex items-center gap-3">
                                    <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-600">
                                        <TrendingUp size={18} />
                                    </div>
                                    Revenue Management
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-8 space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold text-slate-500 truncate">Revenue Type</Label>
                                        <Select 
                                            value={revenueData.revenue_type}
                                            onValueChange={(val) => setRevenueData({...revenueData, revenue_type: val as any})}
                                            disabled={isLocked}
                                        >
                                            <SelectTrigger className="h-11 bg-white border-slate-200 font-medium">
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="With Fuel">With Fuel</SelectItem>
                                                <SelectItem value="Without Fuel">Without Fuel</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold text-slate-500 truncate">Total Revenue</Label>
                                        <div className="flex gap-2">
                                            <Input 
                                                className="h-11 font-bold text-slate-800 bg-white"
                                                value={formatWithCommas(revenueData.revenue_amount)}
                                                onChange={(e) => setRevenueData({...revenueData, revenue_amount: e.target.value})}
                                                placeholder="0.00"
                                                disabled={isLocked}
                                            />
                                            <Select 
                                                value={revenueData.revenue_currency}
                                                onValueChange={(val) => setRevenueData({...revenueData, revenue_currency: val as any})}
                                                disabled={isLocked}
                                            >
                                                <SelectTrigger className="w-20 h-11">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="USD">USD</SelectItem>
                                                    <SelectItem value="TZS">TZS</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                                

                            </CardContent>
                        </Card>

                        {/* Live Profitability Forecast Card */}
                        <Card className={`border-none shadow-xl overflow-hidden ring-1 ${totals.netProfitUSD < 0 ? 'bg-red-50 ring-red-200' : 'bg-emerald-50 ring-emerald-200'}`}>
                            <CardHeader className={`border-b border-emerald-100 py-4 px-8 ${totals.netProfitUSD < 0 ? 'bg-red-100/30' : 'bg-emerald-100/30'}`}>
                                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${totals.netProfitUSD < 0 ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
                                        <Calculator size={18} />
                                    </div>
                                    Profitability Analysis
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-8 space-y-6">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-slate-600">
                                        <span className="text-xs font-medium">Total Operational Budget:</span>
                                        <span className="text-sm font-bold">TShs {Math.round(totals.totalExpensesTZS).toLocaleString()}</span>
                                    </div>
                                    {totals.extraExpensesUSD > 0 && (
                                        <div className="flex justify-between items-center text-red-500">
                                            <span className="text-xs font-semibold italic">Additional Expenses Incurred:</span>
                                            <span className="text-sm font-bold">+ TShs {Math.round(totals.extraExpensesTZS).toLocaleString()}</span>
                                        </div>
                                    )}
                                    <Separator className="bg-slate-200" />
                                    <div className="pt-2">
                                        <div className="flex items-baseline justify-between">
                                            <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">Projected Trip Profit</span>
                                            <div className="text-right">
                                                <p className={`text-4xl font-black ${totals.finalNetProfitUSD < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    TShs {Math.round(totals.finalNetProfitUSD * (countryRates["TZ"] || 2700)).toLocaleString()}
                                                </p>
                                                <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                                                    ${totals.finalNetProfitUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        </div>
                    </TabsContent>
                )}

                {/* 🕵️‍♂️ ACCOUNTABILITY AUDIT TAB (Super Admin Only) */}
                {isSuperAdmin && tripId && (
                    <TabsContent value="audit" className="mt-6">
                        <Card className="border-none shadow-2xl bg-white overflow-hidden ring-1 ring-primary/20">
                            <CardHeader className="bg-slate-900 text-white py-6 px-8">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <CardTitle className="text-xl font-black tracking-tight flex items-center gap-3">
                                            <ShieldCheck className="text-primary h-6 w-6" />
                                            Financial Reconciliation & Audit
                                        </CardTitle>
                                        <CardDescription className="text-slate-400 font-medium">Comparing official budget vs. actual receipts submitted by Clerk.</CardDescription>
                                    </div>
                                    <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/50">
                                        Verification Active
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-8">
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    {/* Left: Planning Pillar */}
                                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col h-full">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">I. Planned Disbursment</h4>
                                        <div className="space-y-4 flex-1">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium text-slate-500">Original Budget</span>
                                                <span className="text-sm font-bold text-slate-900">{Math.round(totals.totalExpensesTZS).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium text-slate-500 italic">Extra Emergency Funds</span>
                                                <span className="text-sm font-bold text-red-600">+{Math.round(totals.extraExpensesTZS).toLocaleString()}</span>
                                            </div>
                                            <Separator className="bg-slate-200 border-dashed" />
                                            <div className="pt-2 flex justify-between items-baseline">
                                                <span className="text-xs font-black text-slate-900 uppercase">Total Cash Given</span>
                                                <div className="text-right">
                                                    <p className="text-2xl font-black text-slate-900">
                                                        {(Math.round(totals.totalExpensesTZS) + Math.round(totals.extraExpensesTZS)).toLocaleString()}
                                                    </p>
                                                    <p className="text-[9px] text-slate-400">TShs Total</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Center: Receipts Pillar */}
                                    <div className="bg-white p-6 rounded-3xl border-2 border-primary/20 flex flex-col h-full shadow-inner shadow-slate-50">
                                        <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4">II. Justified (Receipts)</h4>
                                        {auditLoading ? (
                                            <div className="animate-pulse space-y-4">
                                                <div className="h-4 bg-slate-100 rounded w-full"></div>
                                                <div className="h-4 bg-slate-100 rounded w-5/6"></div>
                                            </div>
                                        ) : settlements.length === 0 ? (
                                            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                                                <AlertCircle className="text-slate-300 h-8 w-8 mb-2" />
                                                <p className="text-xs font-medium text-slate-400">No receipts have been entered by the Clerk yet.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-4 flex-1">
                                                <div className="max-h-[180px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                                    {settlements.map((s, idx) => (
                                                        <div key={s.id} className="flex justify-between items-center py-1.5 border-b border-slate-50 last:border-none">
                                                            <span className="text-[11px] font-medium text-slate-600 truncate max-w-[120px]">{s.receipt_description}</span>
                                                            <span className="text-[11px] font-bold text-slate-900">{s.amount_tzs.toLocaleString()}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <Separator className="bg-primary/20" />
                                                <div className="pt-2 flex justify-between items-baseline">
                                                    <span className="text-xs font-black text-primary uppercase">Total Proven Spend</span>
                                                    <div className="text-right">
                                                        <p className="text-2xl font-black text-primary">
                                                            {settlements.reduce((sum, s) => sum + (s.amount_tzs || 0), 0).toLocaleString()}
                                                        </p>
                                                        <p className="text-[9px] text-primary/60">TShs Total</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right: The Gap (Verdict) */}
                                    <div className={`p-6 rounded-3xl border flex flex-col h-full shadow-lg ${
                                        (Math.round(totals.totalExpensesTZS) + Math.round(totals.extraExpensesTZS)) - settlements.reduce((sum, s) => sum + (s.amount_tzs || 0), 0) > 0 
                                        ? 'bg-red-50 border-red-200' 
                                        : 'bg-emerald-50 border-emerald-200'
                                    }`}>
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">III. Audit Gap/Balance</h4>
                                        <div className="flex-1 flex flex-col justify-center items-center text-center">
                                            {(() => {
                                                const totalOut = Math.round(totals.totalExpensesTZS) + Math.round(totals.extraExpensesTZS);
                                                const totalProven = settlements.reduce((sum, s) => sum + (s.amount_tzs || 0), 0);
                                                const gap = totalOut - totalProven;

                                                return (
                                                    <>
                                                        <div className={`p-4 rounded-full mb-4 ${gap > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                                            {gap > 0 ? <AlertCircle size={32} /> : <CheckCircle size={32} />}
                                                        </div>
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Unaccounted Funds</p>
                                                        <p className={`text-4xl font-black ${gap > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                                            TShs {Math.abs(gap).toLocaleString()}
                                                        </p>
                                                        <p className="text-xs font-semibold text-slate-500 mt-3 max-w-[150px]">
                                                            {gap > 0 
                                                                ? "Driver must return this balance to the accounts office." 
                                                                : "All funds are fully justified by receipts."}
                                                        </p>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="mt-10 p-4 bg-slate-900/5 border border-slate-200 border-dashed rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Audit Trail Active: Every change and viewing is logged for Superadmin transparency.</p>
                                    </div>
                                    <Button variant="ghost" size="sm" className="text-[10px] font-bold uppercase tracking-widest hover:bg-slate-100" onClick={() => window.print()}>
                                        <Printer size={14} className="mr-2" /> Print Audit Report
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>

            {/* ⛽ Section 2: Fuel Allocation & Logic Calculator */}
            <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200 print:shadow-none print:ring-1 print:ring-slate-900 break-inside-avoid">
                <CardHeader className="bg-orange-50/80 border-b border-orange-100 py-4 px-8 print:bg-white print:border-b-2 print:border-slate-900">
                    <CardTitle className="text-[15px] font-bold text-orange-800 flex items-center gap-3">
                        <div className="p-2 bg-orange-200/50 rounded-lg text-orange-700 print:hidden">
                            <Fuel size={18} />
                        </div>
                        2. Fuel Allocation & Logic Calculator
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-slate-500">Fuel Liters (Qty)</Label>
                            <div className="relative">
                                <Fuel size={14} className="absolute left-3 top-3.5 text-slate-400" />
                                <Input
                                    className="pl-10 h-12 bg-slate-50 border-slate-200 font-semibold text-lg focus-visible:ring-1 ring-orange-500"
                                    type="number"
                                    placeholder="e.g. 2575"
                                    value={revenueData.fuel_liters}
                                    onChange={(e) => setRevenueData({ ...revenueData, fuel_liters: e.target.value })}
                                    disabled={isLocked}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-slate-500">Price Per Liter (TSh)</Label>
                            <div className="relative">
                                <span className="absolute left-2.5 top-3.5 text-slate-400 font-semibold text-[10px]">TShs</span>
                                <Input
                                    className="pl-10 h-12 bg-slate-50 border-slate-200 font-semibold text-lg focus-visible:ring-1 ring-orange-500"
                                    type="number"
                                    placeholder="e.g. 2780"
                                    value={revenueData.fuel_price}
                                    onChange={(e) => setRevenueData({ ...revenueData, fuel_price: e.target.value })}
                                    disabled={isLocked}
                                />
                            </div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-orange-200 flex flex-col items-end justify-center h-20 print:flex-row print:justify-between print:w-full print:h-auto print:border-none print:p-1 print:bg-white">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-600 mb-1 print:mb-0">Calculated Fuel Total</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-base font-semibold text-slate-900 print:text-xs">
                                    TShs. {(parseFloat(revenueData.fuel_liters) * parseFloat(revenueData.fuel_price) || 0).toLocaleString()}
                                </span>
                                <span className="text-[10px] font-medium text-slate-400 print:text-[8px]">
                                    (~ ${((parseFloat(revenueData.fuel_liters) * parseFloat(revenueData.fuel_price) || 0) / (countryRates["TZ"] || 2700)).toLocaleString(undefined, { maximumFractionDigits: 0 })} USD)
                                </span>
                            </div>
                        </div>
                    </div>
                    {/* Fuel Budget Toggle — moved from header into body */}
                    <div className="mt-6 pt-6 border-t border-orange-100 flex items-center justify-between print:hidden">
                        <div>
                            <p className="text-sm font-semibold text-slate-700">Include Fuel Cost in Trip Budget?</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                                When <span className="font-semibold text-orange-600">included</span>, fuel cost is deducted from profit. When <span className="font-semibold text-slate-500">excluded</span>, client covers fuel separately.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge
                                variant={revenueData.revenue_type === 'With Fuel' ? 'default' : 'outline'}
                                className={`cursor-pointer text-sm px-4 py-1.5 transition-all ${revenueData.revenue_type === 'With Fuel' ? 'bg-orange-600 hover:bg-orange-700 border-orange-600' : 'hover:bg-orange-50'} ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                onClick={() => !isLocked && setRevenueData({ ...revenueData, revenue_type: 'With Fuel' })}
                            >
                                ✓ Include in Budget
                            </Badge>
                            <Badge
                                variant={revenueData.revenue_type === 'Without Fuel' ? 'default' : 'outline'}
                                className={`cursor-pointer text-sm px-4 py-1.5 transition-all ${revenueData.revenue_type === 'Without Fuel' ? 'bg-slate-700 hover:bg-slate-800 border-slate-700 text-white' : 'hover:bg-slate-50'}`}
                                onClick={() => setRevenueData({ ...revenueData, revenue_type: 'Without Fuel' })}
                            >
                                Exclude from Budget
                            </Badge>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 🌍 Section 3: Regional Expense Breakdown */}
            <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200 print:hidden mb-6">
                <div className="flex justify-between items-center mb-4">
                    <p className="text-[10px] font-semibold text-slate-500 flex items-center gap-2 m-0">
                        <Globe size={12} />
                        Regional Scope: Select countries involved in this journey
                    </p>
                    <ManageExpensesDialog />
                </div>
                <div className="flex flex-wrap gap-2">
                    {[
                        { id: 'TZ', name: 'Tanzania' },
                        { id: 'Zambia', name: 'Zambia' },
                        { id: 'DRC', name: 'DR Congo' },
                        { id: 'Rwanda', name: 'Rwanda' },
                        { id: 'Burundi', name: 'Burundi' }
                    ].map(country => (
                        <Badge
                            key={country.id}
                            variant={activeCountries.includes(country.id) ? 'default' : 'outline'}
                            className={`cursor-pointer px-4 py-2 text-xs transition-all ${activeCountries.includes(country.id) ? 'bg-slate-900' : 'hover:bg-slate-100'}`}
                            onClick={() => {
                                if (isLocked) return;
                                if (activeCountries.includes(country.id)) {
                                    // Don't remove if it's the last one? Or just allow it.
                                    setActiveCountries(prev => prev.filter(c => c !== country.id));
                                } else {
                                    setActiveCountries(prev => [...prev, country.id]);
                                }
                            }}
                        >
                            {country.name}
                        </Badge>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {activeCountries.includes('TZ') && (
                    <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200">
                        <CardHeader className="bg-blue-50/50 border-b py-4 px-8">
                            <CardTitle className="text-xs font-bold flex items-center justify-between text-blue-900">
                                <div className="flex items-center gap-3">
                                    <span>Tanzania Operations</span>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => addExpense('TZ')} 
                                        className="h-6 px-2 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-100/50 border border-blue-200/50 print:hidden" 
                                        disabled={isLocked}
                                    >
                                        <Plus size={10} className="mr-1" /> Add Item
                                    </Button>
                                </div>
                                <div className="flex flex-col items-end gap-0.5">
                                    <div className="flex gap-2 text-[10px] items-baseline">
                                        <span className="text-slate-400 font-semibold uppercase tracking-wider">TZS Subtotal:</span>
                                        <span className="text-blue-700 font-bold">{Math.round(totals.categoryTotals['TZ']?.tzs || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex gap-2 text-[10px] items-baseline font-medium text-slate-400">
                                        <span>USD: ${(totals.categoryTotals['TZ']?.usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            {renderExpenseSection("Tanzania Operations", "TZ", MapPin)}
                        </CardContent>
                    </Card>
                )}

                {activeCountries.includes('Zambia') && (
                    <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200">
                        <CardHeader className="bg-green-50/50 border-b py-4 px-8">
                            <CardTitle className="text-xs font-bold flex items-center justify-between text-green-900">
                                <div className="flex items-center gap-3">
                                    <span>Zambia Operations</span>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => addExpense('Zambia')} 
                                        className="h-6 px-2 text-[10px] text-green-600 hover:text-green-700 hover:bg-green-100/50 border border-green-200/50 print:hidden" 
                                        disabled={isLocked}
                                    >
                                        <Plus size={10} className="mr-1" /> Add Item
                                    </Button>
                                </div>
                                <div className="flex flex-col items-end gap-0.5">
                                    <div className="flex gap-2 text-[10px] items-baseline">
                                        <span className="text-slate-400 font-semibold uppercase tracking-wider">TZS Subtotal:</span>
                                        <span className="text-green-700 font-bold">{Math.round(totals.categoryTotals['Zambia']?.tzs || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex gap-2 text-[10px] items-baseline font-medium text-slate-400">
                                        <span className="text-green-600 font-bold">ZMW: {Math.round((totals.categoryTotals['Zambia']?.tzs || 0) / (countryRates["Zambia"] || 100)).toLocaleString()}</span>
                                    </div>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            {renderExpenseSection("Zambia Operations", "Zambia", Globe)}
                        </CardContent>
                    </Card>
                )}

                {activeCountries.includes('DRC') && (
                    <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200">
                        <CardHeader className="bg-yellow-50/50 border-b py-4 px-8">
                            <CardTitle className="text-xs font-bold flex items-center justify-between text-yellow-900">
                                <div className="flex items-center gap-3">
                                    <span>DR Congo Operations</span>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => addExpense('DRC')} 
                                        className="h-6 px-2 text-[10px] text-yellow-600 hover:text-yellow-700 hover:bg-yellow-100/50 border border-yellow-200/50 print:hidden" 
                                        disabled={isLocked}
                                    >
                                        <Plus size={10} className="mr-1" /> Add Item
                                    </Button>
                                </div>
                                <div className="flex flex-col items-end gap-0.5">
                                    <div className="flex gap-2 text-[10px] items-baseline">
                                        <span className="text-slate-400 font-semibold uppercase tracking-wider">TZS Subtotal:</span>
                                        <span className="text-yellow-700 font-bold">{Math.round(totals.categoryTotals['DRC']?.tzs || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex gap-2 text-[10px] items-baseline font-medium text-slate-400">
                                        <span>USD: ${(totals.categoryTotals['DRC']?.usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            {renderExpenseSection("DR Congo Operations", "DRC", MapPin)}
                        </CardContent>
                    </Card>
                )}

                {activeCountries.includes('Rwanda') && (
                    <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200">
                        <CardHeader className="bg-purple-50/50 border-b py-4 px-8">
                            <CardTitle className="text-xs font-semibold flex items-center justify-between text-purple-900">
                                <div className="flex items-center gap-3">
                                    <span>Rwanda Operations</span>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => addExpense('Rwanda')} 
                                        className="h-6 px-2 text-[10px] text-purple-600 hover:text-purple-700 hover:bg-purple-100/50 border border-purple-200/50 print:hidden" 
                                        disabled={isLocked}
                                    >
                                        <Plus size={10} className="mr-1" /> Add Item
                                    </Button>
                                </div>
                                <div className="flex flex-col items-end gap-0.5">
                                    <div className="flex gap-2 text-[10px] items-baseline">
                                        <span className="text-slate-400 font-semibold uppercase tracking-wider">TZS Subtotal:</span>
                                        <span className="text-purple-700 font-bold">{Math.round(totals.categoryTotals['Rwanda']?.tzs || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex gap-2 text-[10px] items-baseline font-medium text-slate-400">
                                        <span className="text-purple-600 font-bold">RWF: {Math.round((totals.categoryTotals['Rwanda']?.tzs || 0) / (countryRates["Rwanda"] || 2)).toLocaleString()}</span>
                                    </div>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            {renderExpenseSection("Rwanda Operations", "Rwanda", Navigation)}
                        </CardContent>
                    </Card>
                )}

                {activeCountries.includes('Burundi') && (
                    <Card className="border-none shadow-xl bg-white overflow-hidden ring-1 ring-slate-200">
                        <CardHeader className="bg-rose-50/50 border-b py-4 px-8">
                            <CardTitle className="text-xs font-semibold flex items-center justify-between text-rose-900">
                                <div className="flex items-center gap-3">
                                    <span>Burundi Operations</span>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => addExpense('Burundi')} 
                                        className="h-6 px-2 text-[10px] text-rose-600 hover:text-rose-700 hover:bg-rose-100/50 border border-rose-200/50 print:hidden" 
                                        disabled={isLocked}
                                    >
                                        <Plus size={10} className="mr-1" /> Add Item
                                    </Button>
                                </div>
                                <div className="flex flex-col items-end gap-0.5">
                                    <div className="flex gap-2 text-[10px] items-baseline">
                                        <span className="text-slate-400 font-semibold uppercase tracking-wider">TZS Subtotal:</span>
                                        <span className="text-rose-700 font-bold">{Math.round(totals.categoryTotals['Burundi']?.tzs || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex gap-2 text-[10px] items-baseline font-medium text-slate-400">
                                        <span className="text-rose-600 font-bold">BIF: {Math.round((totals.categoryTotals['Burundi']?.tzs || 0) / (countryRates["Burundi"] || 1)).toLocaleString()}</span>
                                    </div>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-8">
                            {renderExpenseSection("Burundi Operations", "Burundi", Navigation)}
                        </CardContent>
                    </Card>
                )}

                <Card className="border-none shadow-xl bg-slate-50/50 overflow-hidden ring-1 ring-slate-200 border-dashed">
                    <CardHeader className="bg-slate-200/50 border-b py-4 px-8">
                        <div className="flex items-center gap-2 mb-1">
                            <ShieldCheck size={12} className="text-red-500" />
                            <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest">Informational / Non-Budgeted</span>
                        </div>
                        <CardTitle className="text-xs font-bold flex items-center justify-between text-slate-800">
                            <div className="flex items-center gap-3">
                                <span>Fixed Expenses</span>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => addExpense('Fixed')} 
                                    className="h-6 px-2 text-[10px] text-slate-600 hover:text-slate-700 hover:bg-slate-100/50 border border-slate-200/50 print:hidden" 
                                    disabled={isLocked}
                                >
                                    <Plus size={10} className="mr-1" /> Add Item
                                </Button>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                                <div className="flex gap-2 text-[10px] items-baseline">
                                    <span className="text-slate-400 font-semibold uppercase tracking-wider">TZS Subtotal:</span>
                                    <span className="text-slate-900 font-bold">{Math.round(totals.categoryTotals['Fixed']?.tzs || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex gap-2 text-[10px] items-baseline font-medium text-slate-400">
                                    <span>USD: ${(totals.categoryTotals['Fixed']?.usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                        {renderExpenseSection("Fixed Expenses", "Fixed", Calculator)}
                    </CardContent>
                </Card>
            </div>


            {/* 🏆 Final Summary & Signature Footer */}
            <div className="mt-8 bg-slate-900 p-8 rounded-2xl shadow-xl text-white print:bg-gray-50 print:text-black print:border print:border-slate-200 print:shadow-none print:rounded-xl print:p-4 print:mt-4 break-inside-avoid">
                <div className="flex flex-col md:flex-row justify-between gap-8 print:gap-4">
                    <div className="space-y-6 flex-1 print:space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 max-w-lg print:gap-x-6 gap-y-6">
                             <div className="space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Gross Trip Revenue</p>
                                <p className="text-lg font-bold print:text-sm">TShs {revenueData.revenue_currency === 'TZS' ? parseFloat(revenueData.revenue_amount || '0').toLocaleString() : (parseFloat(revenueData.revenue_amount || '0') * (countryRates["TZ"] || 2700)).toLocaleString()}</p>
                                <p className="text-[10px] text-slate-400 font-medium">
                                    Est. ${revenueData.revenue_currency === 'USD' ? parseFloat(revenueData.revenue_amount || '0').toLocaleString() : (parseFloat(revenueData.revenue_amount || '0') / (countryRates["TZ"] || 2700)).toLocaleString(undefined, { maximumFractionDigits: 0 })} USD
                                </p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Budgeted Costs</p>
                                <p className="text-lg font-bold text-orange-400 print:text-sm print:text-slate-900">TShs {totals.totalExpensesTZS.toLocaleString()}</p>
                                <p className="text-[10px] text-slate-400 font-medium">
                                    Est. ${totals.totalExpensesUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD
                                </p>
                            </div>
                        </div>
                        {/* Extra Expenses row — only show when tripsheet is locked */}
                        {totals.extraExpensesUSD > 0 && (
                            <div className="flex gap-6 bg-red-900/30 px-4 py-3 rounded-xl border border-red-800/40">
                                <div className="space-y-0.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400">Extra / Unbudgeted</p>
                                    <p className="text-base font-bold text-red-300">- TShs {Math.round(totals.extraExpensesTZS).toLocaleString()}</p>
                                    <p className="text-[10px] text-red-500 font-medium">- ${totals.extraExpensesUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD</p>
                                </div>
                            </div>
                        )}
                        <div className="pt-6 border-t border-slate-800 print:border-slate-300 print:pt-3 space-y-4 print:space-y-2">
                            <div className="h-12 w-64 border-b border-slate-700 border-dashed print:border-slate-300 print:h-8 print:w-48"></div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 print:text-[8px]">AUTHORIZED BUDGET OFFICER SIGNATURE</p>
                        </div>
                    </div>
                    <div className="bg-white/5 p-6 rounded-xl text-right md:w-80 flex flex-col justify-center print:bg-white print:border print:border-slate-200 print:p-3 print:w-56">
                        <p className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-500 mb-1">BUDGETED NET PROFIT</p>
                        <div className={`text-2xl font-black print:text-lg ${totals.netProfitUSD < 0 ? 'text-red-400' : 'text-slate-300'}`}>
                            TShs {(totals.netProfitUSD * (countryRates["TZ"] || 2700)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <p className={`text-[10px] font-bold opacity-70 mb-4 ${totals.netProfitUSD < 0 ? 'text-red-300' : 'text-slate-400'}`}>
                            ${totals.netProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                        </p>
                        {totals.extraExpensesUSD > 0 && (
                            <>
                                <div className="border-t border-red-800/50 pt-4 mt-2">
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-400 mb-1">FINAL NET PROFIT</p>
                                    <div className={`text-3xl font-black print:text-xl ${totals.finalNetProfitUSD < 0 ? 'text-red-400' : 'text-emerald-400 print:text-emerald-700'}`}>
                                        TShs {(totals.finalNetProfitUSD * (countryRates["TZ"] || 2700)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </div>
                                    <p className={`text-xs font-bold mt-1 ${totals.finalNetProfitUSD < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                                        ${totals.finalNetProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                    </p>
                                </div>
                            </>
                        )}
                        {totals.extraExpensesUSD === 0 && (
                            <div className={`text-3xl font-black print:text-xl ${totals.netProfitUSD < 0 ? 'text-red-400' : 'text-emerald-400 print:text-emerald-700'}`}>
                                TShs {(totals.netProfitUSD * (countryRates["TZ"] || 2700)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                        )}
                        <p className="text-[9px] font-bold text-slate-400 mt-4 uppercase tracking-tighter print:hidden">Budget valid for current exchange rates</p>
                    </div>
                </div>
            </div>


            {/* 💾 Actions Floating Footer (Sticky bottom) */}
            <div className="sticky bottom-6 flex flex-col md:flex-row items-center justify-end gap-3 p-4 bg-white/70 backdrop-blur-xl rounded-2xl shadow-2xl border ring-1 ring-slate-200 z-50 animate-in slide-in-from-bottom-8 duration-1000 print:hidden mx-4 md:mx-auto">
                <div className="hidden md:flex flex-col items-start mr-auto px-4 border-r pr-6 border-slate-100">
                    <div className="flex items-center gap-2 text-emerald-600">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Draft Saved Locally</span>
                    </div>
                    <p className="text-[8px] text-slate-400 font-medium italic">Refresh safely anytime</p>
                </div>

                <Button
                    variant="ghost"
                    size="lg"
                    className="font-bold text-slate-500 hover:text-slate-900 w-full md:w-auto h-12 order-last md:order-first"
                    onClick={() => {
                        if (confirm("Are you sure? Unsaved changes will be lost.")) {
                            if (onSaveSuccess) onSaveSuccess();
                        }
                    }}
                >
                    Cancel Edit
                </Button>

                <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                    <Button
                        variant="outline"
                        size="lg"
                        className="font-black border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all px-8 h-12 rounded-xl w-full md:w-auto"
                        onClick={handleExportExcel}
                        disabled={isSaving}
                    >
                        <Download size={20} className="mr-2" />
                        Download Excel
                    </Button>


                    {/* Superadmin: Approve Budget (only visible when status is Planned) */}
                    {isSuperAdmin && tripId && currentStatus === 'Planned' && (
                        <Button
                            size="lg"
                            className="font-black bg-blue-600 hover:bg-blue-700 text-white px-10 h-12 rounded-xl shadow-xl active:scale-95 transition-all w-full md:w-auto"
                            onClick={handleApprove}
                            disabled={isApproving}
                        >
                            <ShieldCheck size={20} className="mr-2" />
                            {isApproving ? "Approving..." : "Approve Budget"}
                        </Button>
                    )}

                    {/* Manager: Activate Trip (only visible when status is Approved) */}
                    {isManager && tripId && currentStatus === 'Approved' && (
                        <Button
                            size="lg"
                            className="font-black bg-emerald-600 hover:bg-emerald-700 text-white px-10 h-12 rounded-xl shadow-xl active:scale-95 transition-all w-full md:w-auto"
                            onClick={handleActivate}
                            disabled={isActivating}
                        >
                            <Zap size={20} className="mr-2" />
                            {isActivating ? "Activating..." : "Activate Trip"}
                        </Button>
                    )}

                    {/* Save Plan (always visible unless Active/Completed) */}
                    {currentStatus !== 'Active' && currentStatus !== 'Completed' && !isLocked && (
                        <Button
                            size="lg"
                            className="font-black bg-primary hover:bg-primary/90 text-white px-8 md:px-12 h-12 rounded-xl shadow-xl active:scale-95 transition-all w-full md:w-auto"
                            onClick={handleSave}
                            disabled={isSaving}
                        >
                            {isSaving ? "Finalizing..." : "Commit & Save Plan"}
                            {!isSaving && <Save size={20} className="ml-2" />}
                        </Button>
                    )}
                </div>
            </div>


            {/* 🔴 OUT-OF-BUDGET / EXTRA EXPENSES — Only visible when trip is Approved/Active/Completed */}
            {isLocked && (
                <div className="mt-8 border-2 border-dashed border-red-200 rounded-2xl p-6 bg-red-50/30">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                    <TrendingDown size={18} className="text-red-600" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-red-900">Unbudgeted / Extra Expenses</h3>
                                    <p className="text-[10px] text-red-500 font-medium mt-0.5">Expenses incurred beyond the approved budget. These reduce the final net profit.</p>
                                </div>
                            </div>
                        </div>
                        {totals.extraExpensesUSD > 0 && (
                            <div className="text-right bg-red-100 px-4 py-2 rounded-xl">
                                <p className="text-[9px] font-bold text-red-500 uppercase tracking-wider">Total Extra Spend</p>
                                <p className="text-base font-black text-red-700">TShs {Math.round(totals.extraExpensesTZS).toLocaleString()}</p>
                                <p className="text-[10px] text-red-400 font-medium">${totals.extraExpensesUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD</p>
                            </div>
                        )}
                    </div>

                    {/* Per-country extra expense cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {[
                            { id: 'TZ', label: 'Tanzania', color: 'blue' },
                            { id: 'Zambia', label: 'Zambia', color: 'green' },
                            { id: 'DRC', label: 'DR Congo', color: 'yellow' },
                            { id: 'Rwanda', label: 'Rwanda', color: 'purple' },
                            { id: 'Burundi', label: 'Burundi', color: 'rose' }
                        ]
                            .filter(c => activeCountries.includes(c.id))
                            .map(country => {
                                const extraForCountry = expenses
                                    .map((e, i) => ({ ...e, originalIndex: i }))
                                    .filter(e => e.is_extra && e.category === country.id);
                                const subtotalTZS = extraForCountry.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
                                const subtotalUSD = subtotalTZS / (countryRates['TZ'] || 2700);

                                return (
                                    <div key={country.id} className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
                                        <div className="flex items-center justify-between px-5 py-3 bg-red-50/60 border-b border-red-100">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-red-900">{country.label}</span>
                                                <button
                                                    onClick={() => addExtraExpense(country.id as any)}
                                                    className="flex items-center gap-1 text-[10px] text-red-600 hover:text-red-700 bg-red-100 hover:bg-red-200 rounded-md px-2 py-1 font-semibold transition-colors"
                                                >
                                                    <Plus size={10} /> Add Extra
                                                </button>
                                            </div>
                                            {subtotalTZS > 0 && (
                                                <div className="text-right">
                                                    <p className="text-[10px] font-bold text-red-700">TShs {Math.round(subtotalTZS).toLocaleString()}</p>
                                                    <p className="text-[9px] text-red-400">${subtotalUSD.toFixed(2)}</p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-3 space-y-2">
                                            {extraForCountry.length === 0 ? (
                                                <div className="text-center py-4 text-[10px] text-slate-300 border-2 border-dashed border-slate-100 rounded-lg">
                                                    No extra expenses for {country.label} yet
                                                </div>
                                            ) : extraForCountry.map(item => {
                                                const amt = parseFloat(item.amount) || 0;
                                                const usd = amt / (countryRates['TZ'] || 2700);
                                                return (
                                                    <div key={item.originalIndex} className="group flex gap-2 items-center bg-red-50/30 border border-red-100 p-1.5 rounded-lg hover:border-red-200 transition-all">
                                                        <Input
                                                            className="flex-1 h-7 bg-white border-none text-[12px] text-slate-700 font-normal focus-visible:ring-1 ring-red-200"
                                                            placeholder="What was the expense?"
                                                            value={item.item_name}
                                                            onChange={(e) => updateExpense(item.originalIndex, 'item_name', e.target.value)}
                                                        />
                                                        <Select
                                                            value={item.nature}
                                                            onValueChange={(val) => updateExpense(item.originalIndex, 'nature', val)}
                                                        >
                                                            <SelectTrigger className="w-28 h-7 !text-[11px] bg-white border-red-100 shadow-none text-red-500">
                                                                <SelectValue placeholder="Nature" />
                                                            </SelectTrigger>
                                                            <SelectContent className="z-[100]">
                                                                <SelectItem value="Unbudgeted">Unbudgeted</SelectItem>
                                                                <SelectItem value="Emergency">Emergency</SelectItem>
                                                                <SelectItem value="Breakdown">Breakdown</SelectItem>
                                                                <SelectItem value="Fine / Penalty">Fine / Penalty</SelectItem>
                                                                <SelectItem value="Extra Fuel">Extra Fuel</SelectItem>
                                                                <SelectItem value="Other">Other</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <div className="flex items-center gap-1 w-28">
                                                            {country.id === 'Fixed' && <Badge variant="outline" className="text-[7px] h-4 px-1 border-red-200 text-red-500 bg-red-50">NON-BUDGET</Badge>}
                                                            <span className="text-[8px] text-red-300 font-bold shrink-0">TZS</span>
                                                            <Input
                                                                className="h-7 text-right text-[12px] font-medium text-red-700 bg-white border-red-100 focus-visible:ring-1 ring-red-300 w-full"
                                                                type="text"
                                                                placeholder="0"
                                                                value={formatWithCommas(item.amount || '')}
                                                                onChange={(e) => updateExpense(item.originalIndex, 'amount', e.target.value)}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] text-slate-400 w-12 text-right shrink-0">${usd.toFixed(0)}</span>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-red-300 hover:text-destructive hover:bg-destructive/5 transition-opacity shrink-0"
                                                            onClick={() => removeExpense(item.originalIndex)}
                                                        >
                                                            <Trash2 size={12} />
                                                        </Button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })
                        }
                    </div>
                </div>
            )}

        </div>
    );
};

