import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter 
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
    Search,
    Plus,
    Truck,
    AlertTriangle,
    CheckCircle2,
    Clock,
    User,
    ChevronsUpDown,
    Check,
    FileText,
    DollarSign,
    ShieldCheck,
    XCircle,
    Building2,
    Eye,
    TrendingUp,
    Filter,
    Calendar,
    ArrowRight
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const STANDARD_DESTINATIONS = [
    "LUSAKA / CHAMBISHI",
    "NDOLA / KITWE",
    "LUBUMBASHI / DRC",
    "KOLWEZI / DRC",
    "KIGALI / RWANDA",
    "BUJUMBURA / BURUNDI",
    "KAMPALA / UGANDA",
    "MUTARE / HARARE",
    "LILONGWE / MALAWI",
    "BLANTYRE / MALAWI",
    "MOMBASA / KENYA",
    "LOCAL / DAR ES SALAAM"
];

export default function TripOrders() {
    const { userRole, user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const isSuperAdmin = userRole === "super_admin";
    const isAdmin = userRole === "admin" || isSuperAdmin;

    // Filters & Search
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [clientFilter, setClientFilter] = useState<string>("ALL");

    // Modal state
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedOrderDetails, setSelectedOrderDetails] = useState<any>(null);
    const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
    const [orderToApprove, setOrderToApprove] = useState<any>(null);
    const [approvalAction, setApprovalAction] = useState<"Approve" | "Reject">("Approve");
    const [rejectionReason, setRejectionReason] = useState("");

    // Add Client inline
    const [isAddingClient, setIsAddingClient] = useState(false);
    const [newClientName, setNewClientName] = useState("");
    const [clientComboboxOpen, setClientComboboxOpen] = useState(false);

    // Order Form State
    const initialFormState = {
        client_name: "",
        agreed_amount_usd: "",
        agreed_client_rate: "2700",
        vehicle_id: "",
        truck_reg: "",
        trailer_id: "",
        trailer_reg: "",
        driver_id: "",
        driver_name: "",
        contact_no: "",
        license_no: "",
        passport_no: "",
        origin: "DAR ES SALAAM",
        destination: "",
        agreed_days: "5",
        daily_penalty_fine: "0",
        journey_type: "Go & Return (Full Cycle)",
        cargo_description: "",
        bl_number: "",
        container_no: "",
        trip_number: "",
        notes: ""
    };
    const [formData, setFormData] = useState(initialFormState);

    // Fetch Trip Orders
    const { data: orders = [], isLoading: isLoadingOrders } = useQuery({
        queryKey: ["logistics_trip_orders"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_trip_orders" as any)
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data || [];
        }
    });

    // Fetch Fleet for selection
    const { data: fleet = [] } = useQuery({
        queryKey: ["logistics_fleet_for_orders"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_fleet")
                .select("*")
                .order("vehicle_no", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    // Fetch Drivers with documents & credentials
    const { data: drivers = [] } = useQuery({
        queryKey: ["logistics_drivers_for_orders"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_drivers")
                .select(`
                    *,
                    logistics_driver_documents(*)
                `)
                .order("full_name", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    // Fetch Active Couplings
    const { data: couplings = [] } = useQuery({
        queryKey: ["logistics_couplings_for_orders"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_couplings")
                .select("*");
            if (error) throw error;
            // Filter active couplings safely checking is_active or status
            return (data || []).filter((c: any) => c.is_active === true || c.status === "Active");
        }
    });

    // Fetch Clients List
    const { data: clientsList = [], refetch: refetchClients } = useQuery({
        queryKey: ["logistics_clients_list"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_clients")
                .select("*")
                .order("name", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    // Handle Register New Client
    const handleAddClient = async () => {
        if (!newClientName.trim()) return;
        setIsAddingClient(true);
        try {
            const { error } = await supabase
                .from("logistics_clients")
                .insert([{ name: newClientName.trim().toUpperCase() }]);
            if (error) throw error;
            toast({
                title: "Client Added",
                description: `Successfully registered "${newClientName.trim().toUpperCase()}".`
            });
            await refetchClients();
            setFormData(prev => ({ ...prev, client_name: newClientName.trim().toUpperCase() }));
            setNewClientName("");
            setClientComboboxOpen(false);
        } catch (err: any) {
            toast({
                variant: "destructive",
                title: "Error adding client",
                description: err.message
            });
        } finally {
            setIsAddingClient(false);
        }
    };

    // Auto-calculate local currency agreed total
    const agreedAmountLocal = useMemo(() => {
        const usd = parseFloat(formData.agreed_amount_usd) || 0;
        const rate = parseFloat(formData.agreed_client_rate) || 0;
        return (usd * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }, [formData.agreed_amount_usd, formData.agreed_client_rate]);

    // Handle Horse Vehicle Selection (Auto-generates Trip Ref & links Trailer + Driver)
    const handleSelectVehicle = async (v: any) => {
        // Find trailer coupling
        const activeCoupling = couplings.find((c: any) => 
            String(c.horse_id).toLowerCase().trim() === String(v.id).toLowerCase().trim()
        );
        const trailerFound = activeCoupling 
            ? fleet.find((f: any) => String(f.id).toLowerCase().trim() === String(activeCoupling.trailer_id).toLowerCase().trim())
            : null;
        
        const trailerIsTanker = trailerFound?.asset_type?.toLowerCase().includes('tanker') || trailerFound?.fleet_category?.toLowerCase() === 'tanker';
        const isTanker = v.asset_type?.toLowerCase().includes('tanker') || v.fleet_category?.toLowerCase() === 'tanker' || trailerIsTanker;
        const journeyType = isTanker ? "Go Only (Return Empty)" : "Go & Return (Full Cycle)";

        // Generate Trip Number using standard system numbering
        const cleanHorse = v.vehicle_no.replace(/\s*[A-Z]+$/, "").trim();
        const { count: sheetsCount } = await supabase.from('logistics_trip_sheets' as any).select('*', { count: 'exact', head: true });
        const { count: ordersCount } = await supabase.from('logistics_trip_orders' as any).select('*', { count: 'exact', head: true });
        const totalTrips = (sheetsCount || 0) + (ordersCount || 0);
        const seq = String(totalTrips + 1).padStart(3, '0');
        const legIndicator = isTanker ? "T" : "G";
        const currentYear = new Date().getFullYear();
        const generatedTripId = `${cleanHorse}/${currentYear}/${legIndicator}${seq}`;

        // Find driver assigned to vehicle
        const assignedDriver = drivers.find((d: any) => 
            String(d.assigned_vehicle_id).toLowerCase().trim() === String(v.id).toLowerCase().trim()
        );

        // Extract License Number & Passport Number from Driver Docs
        let resolvedLicense = assignedDriver?.license_no || "";
        let resolvedPassport = assignedDriver?.passport_no || assignedDriver?.id_number || "";

        if (assignedDriver?.logistics_driver_documents && Array.isArray(assignedDriver.logistics_driver_documents)) {
            const licenseDoc = assignedDriver.logistics_driver_documents.find((doc: any) =>
                doc.document_type?.toLowerCase().includes("licen")
            );
            if (licenseDoc?.document_number) {
                resolvedLicense = licenseDoc.document_number;
            }

            const passportDoc = assignedDriver.logistics_driver_documents.find((doc: any) =>
                doc.document_type?.toLowerCase().includes("pass") || doc.document_type?.toLowerCase().includes("id")
            );
            if (passportDoc?.document_number) {
                resolvedPassport = passportDoc.document_number;
            }
        }

        const resolvedPhone = assignedDriver?.phone_no || assignedDriver?.phone_secondary || assignedDriver?.phone || "";

        setFormData(prev => ({
            ...prev,
            vehicle_id: v.id,
            truck_reg: v.vehicle_no,
            trailer_id: activeCoupling ? activeCoupling.trailer_id : "",
            trailer_reg: trailerFound ? (trailerFound.vehicle_no || trailerFound.trailer_number) : (activeCoupling?.trailer_id || ""),
            driver_id: assignedDriver ? assignedDriver.id : prev.driver_id,
            driver_name: assignedDriver ? assignedDriver.full_name : prev.driver_name,
            contact_no: resolvedPhone || prev.contact_no,
            license_no: resolvedLicense || prev.license_no,
            passport_no: resolvedPassport || prev.passport_no,
            trip_number: generatedTripId,
            journey_type: journeyType
        }));

        toast({
            title: "Vehicle & Trip Assigned",
            description: `Trip Reference ${generatedTripId} generated with ${assignedDriver?.full_name || 'driver'} and trailer ${trailerFound?.vehicle_no || 'linked'}.`
        });
    };

    // Submit Order Mutation
    const createOrderMutation = useMutation({
        mutationFn: async (payload: any) => {
            const { data, error } = await supabase
                .from("logistics_trip_orders" as any)
                .insert([payload])
                .select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_orders"] });
            toast({
                title: "Order Created Successfully",
                description: "Trip Order has been registered and submitted for Admin Approval."
            });
            setIsCreateOpen(false);
            setFormData(initialFormState);
        },
        onError: (err: any) => {
            toast({
                variant: "destructive",
                title: "Failed to create order",
                description: err.message
            });
        }
    });

    const handleCreateOrderSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.client_name) {
            toast({ variant: "destructive", title: "Client Required", description: "Please choose or register a client." });
            return;
        }
        if (!formData.vehicle_id || !formData.truck_reg) {
            toast({ variant: "destructive", title: "Vehicle Required", description: "Please select a vehicle/horse." });
            return;
        }
        if (!formData.destination) {
            toast({ variant: "destructive", title: "Destination Required", description: "Please select a delivery destination." });
            return;
        }

        const usdAmount = parseFloat(formData.agreed_amount_usd) || 0;
        const clientRate = parseFloat(formData.agreed_client_rate) || 1.0;
        const localTotal = usdAmount * clientRate;

        const payload = {
            order_number: `ORD-${Date.now().toString().slice(-6)}`,
            trip_number: formData.trip_number || `TRP-${Date.now().toString().slice(-6)}`,
            client_name: formData.client_name,
            agreed_amount_usd: usdAmount,
            agreed_client_rate: clientRate,
            agreed_amount_local: localTotal,
            currency: "USD",
            vehicle_id: formData.vehicle_id || null,
            truck_reg: formData.truck_reg,
            trailer_id: formData.trailer_id || null,
            trailer_reg: formData.trailer_reg || null,
            driver_id: formData.driver_id || null,
            driver_name: formData.driver_name || null,
            contact_no: formData.contact_no || null,
            license_no: formData.license_no || null,
            passport_no: formData.passport_no || null,
            origin: formData.origin || "DAR ES SALAAM",
            destination: formData.destination,
            agreed_days: parseInt(formData.agreed_days) || 0,
            daily_penalty_fine: parseFloat(formData.daily_penalty_fine) || 0,
            journey_type: formData.journey_type,
            cargo_description: formData.cargo_description || null,
            bl_number: formData.bl_number || null,
            container_no: formData.container_no || null,
            notes: formData.notes || null,
            status: "Pending Approval",
            created_by: user?.id
        };

        createOrderMutation.mutate(payload);
    };

    // Approval / Rejection Action Mutation
    const approveOrderMutation = useMutation({
        mutationFn: async ({ orderId, status, rejectionReason }: { orderId: string, status: string, rejectionReason?: string }) => {
            const payload: any = {
                status: status,
                updated_at: new Date().toISOString()
            };
            if (status === "Approved") {
                payload.approved_by = user?.id;
                payload.approved_at = new Date().toISOString();
                payload.rejection_reason = null;
            } else if (status === "Rejected") {
                payload.rejection_reason = rejectionReason || "Rejected by Admin";
            }

            const { error } = await supabase
                .from("logistics_trip_orders" as any)
                .update(payload)
                .eq("id", orderId);
            if (error) throw error;
        },
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_orders"] });
            queryClient.invalidateQueries({ queryKey: ["approved_trip_orders"] });
            toast({
                title: vars.status === "Approved" ? "Order Approved!" : "Order Rejected",
                description: vars.status === "Approved" 
                    ? "Order is now approved and ready for Finance to generate the Trip Sheet." 
                    : "The order has been rejected."
            });
            setIsApprovalDialogOpen(false);
            setOrderToApprove(null);
            setRejectionReason("");
        },
        onError: (err: any) => {
            toast({
                variant: "destructive",
                title: "Action Failed",
                description: err.message
            });
        }
    });

    // Filtered Orders
    const filteredOrders = useMemo(() => {
        return orders.filter((o: any) => {
            const matchesSearch = 
                !searchTerm ||
                (o.trip_number && o.trip_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (o.truck_reg && o.truck_reg.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (o.client_name && o.client_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (o.driver_name && o.driver_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (o.destination && o.destination.toLowerCase().includes(searchTerm.toLowerCase()));

            const matchesStatus = statusFilter === "ALL" || o.status === statusFilter;
            const matchesClient = clientFilter === "ALL" || o.client_name === clientFilter;

            return matchesSearch && matchesStatus && matchesClient;
        });
    }, [orders, searchTerm, statusFilter, clientFilter]);

    // Unique clients for filtering
    const uniqueClients = useMemo(() => {
        const set = new Set<string>();
        orders.forEach((o: any) => {
            if (o.client_name) set.add(o.client_name);
        });
        return Array.from(set).sort();
    }, [orders]);

    // Metrics
    const pendingCount = orders.filter((o: any) => o.status === "Pending Approval").length;
    const approvedCount = orders.filter((o: any) => o.status === "Approved" || o.status === "Trip Sheet Created").length;
    const totalOrderUSD = orders.reduce((sum: number, o: any) => sum + (parseFloat(o.agreed_amount_usd) || 0), 0);

    return (
        <div className="space-y-6 pb-12">
            {/* Header banner */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600">
                            <Truck className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Logistics Trip Orders</h1>
                            <p className="text-xs md:text-sm text-slate-500 font-medium">Capture client orders, negotiate exchange rates, auto-generate trip IDs, and submit for Admin approval.</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button 
                        onClick={() => {
                            setFormData(initialFormState);
                            setIsCreateOpen(true);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider h-11 px-5 rounded-xl shadow-md shadow-indigo-100"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        New Trip Order
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-slate-200/80 shadow-sm bg-white">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Admin Approval</p>
                            <h3 className="text-2xl font-black text-amber-600 mt-1">{pendingCount}</h3>
                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Orders awaiting review</p>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-2xl text-amber-600 border border-amber-100">
                            <Clock className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 shadow-sm bg-white">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approved Orders</p>
                            <h3 className="text-2xl font-black text-emerald-600 mt-1">{approvedCount}</h3>
                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Ready for Finance Trip Sheets</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 border border-emerald-100">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200/80 shadow-sm bg-white">
                    <CardContent className="p-5 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Contracted Revenue</p>
                            <h3 className="text-2xl font-black text-indigo-700 mt-1">${totalOrderUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Total USD across all orders</p>
                        </div>
                        <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 border border-indigo-100">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter & Search Bar */}
            <Card className="border-slate-200/80 shadow-sm bg-white">
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="relative w-full md:w-80">
                            <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                            <Input
                                placeholder="Search Trip #, Truck, Client, Driver..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 h-10 border-slate-200 text-xs rounded-xl"
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                            {/* Status Filter */}
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-full sm:w-[170px] h-10 text-xs rounded-xl border-slate-200">
                                    <SelectValue placeholder="Status Filter" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All Statuses</SelectItem>
                                    <SelectItem value="Pending Approval">Pending Approval</SelectItem>
                                    <SelectItem value="Approved">Approved</SelectItem>
                                    <SelectItem value="Trip Sheet Created">Trip Sheet Created</SelectItem>
                                    <SelectItem value="Rejected">Rejected</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Client Filter */}
                            <Select value={clientFilter} onValueChange={setClientFilter}>
                                <SelectTrigger className="w-full sm:w-[200px] h-10 text-xs rounded-xl border-slate-200">
                                    <SelectValue placeholder="Filter Client" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All Clients</SelectItem>
                                    {uniqueClients.map(c => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Orders Table */}
            <Card className="border-slate-200/80 shadow-sm bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/80 border-b border-slate-200">
                            <TableRow>
                                <TableHead className="w-12 text-center text-[11px] font-bold uppercase text-slate-500">#</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase text-slate-500">Trip Reference</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase text-slate-500">Client / Company</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase text-slate-500">Vehicle & Crew</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase text-slate-500">Route & Cargo</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase text-slate-500 text-right">Agreed Amount ($ / Rate)</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase text-slate-500 text-center">Status</TableHead>
                                <TableHead className="text-[11px] font-bold uppercase text-slate-500 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-slate-100">
                            {isLoadingOrders ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                                        Loading trip orders...
                                    </TableCell>
                                </TableRow>
                            ) : filteredOrders.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                                        No trip orders found matching your filters. Click "New Trip Order" to create one.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredOrders.map((order: any, idx: number) => {
                                    const isPending = order.status === "Pending Approval";
                                    const isApproved = order.status === "Approved" || order.status === "Trip Sheet Created";
                                    const isRejected = order.status === "Rejected";

                                    return (
                                        <TableRow key={order.id} className="hover:bg-slate-50/60 transition-colors">
                                            <TableCell className="text-center text-xs font-semibold text-slate-400">
                                                {(idx + 1).toString().padStart(2, '0')}
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-bold text-slate-900 text-xs">{order.trip_number || "—"}</div>
                                                <div className="text-[10px] text-slate-400 font-medium">{order.order_number}</div>
                                                <div className="text-[9px] font-semibold text-indigo-600 mt-0.5">{order.journey_type}</div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                    {order.client_name}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-0.5">
                                                    <div className="font-semibold text-slate-800 text-xs flex items-center gap-1">
                                                        <Truck className="w-3 h-3 text-slate-400" />
                                                        {order.truck_reg} {order.trailer_reg && <span className="text-slate-400 font-normal">/ {order.trailer_reg}</span>}
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                                        <User className="w-3 h-3 text-slate-400" />
                                                        {order.driver_name || "No driver assigned"}
                                                    </div>
                                                    {order.contact_no && (
                                                        <div className="text-[10px] text-slate-400">{order.contact_no}</div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-0.5">
                                                    <div className="font-semibold text-slate-800 text-xs">{order.destination}</div>
                                                    <div className="text-[10px] text-slate-500 font-medium">From: {order.origin || 'DAR ES SALAAM'}</div>
                                                    {order.cargo_description && (
                                                        <div className="text-[10px] text-indigo-600 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100/50 w-fit">
                                                            {order.cargo_description}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="font-black text-slate-900 text-xs">
                                                    ${(parseFloat(order.agreed_amount_usd) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </div>
                                                <div className="text-[10px] text-slate-500 font-medium">
                                                    Rate: @{order.agreed_client_rate || "2700"}
                                                </div>
                                                <div className="text-[10px] font-semibold text-emerald-700">
                                                    {(parseFloat(order.agreed_amount_local) || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })} Local
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge
                                                    className={cn(
                                                        "text-[10px] font-bold px-2 py-0.5 border shadow-none",
                                                        isPending && "bg-amber-50 text-amber-700 border-amber-200",
                                                        isApproved && "bg-emerald-50 text-emerald-700 border-emerald-200",
                                                        isRejected && "bg-rose-50 text-rose-700 border-rose-200"
                                                    )}
                                                >
                                                    {order.status}
                                                </Badge>
                                                {order.approved_at && (
                                                    <div className="text-[9px] text-slate-400 mt-1">
                                                        {format(new Date(order.approved_at), "dd MMM yy")}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setSelectedOrderDetails(order)}
                                                        className="h-8 px-2.5 text-[11px] text-slate-600 hover:text-slate-900"
                                                    >
                                                        <Eye className="w-3.5 h-3.5 mr-1" />
                                                        View
                                                    </Button>

                                                    {isAdmin && isPending && (
                                                        <>
                                                            <Button
                                                                size="sm"
                                                                onClick={() => {
                                                                    setOrderToApprove(order);
                                                                    setApprovalAction("Approve");
                                                                    setIsApprovalDialogOpen(true);
                                                                }}
                                                                className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg shadow-sm"
                                                            >
                                                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                                                Approve
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => {
                                                                    setOrderToApprove(order);
                                                                    setApprovalAction("Reject");
                                                                    setIsApprovalDialogOpen(true);
                                                                }}
                                                                className="h-8 px-2.5 border-rose-200 text-rose-600 hover:bg-rose-50 text-[11px] font-bold rounded-lg"
                                                            >
                                                                <XCircle className="w-3.5 h-3.5 mr-1" />
                                                                Reject
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>

            {/* CREATE NEW ORDER MODAL */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Truck className="w-5 h-5 text-indigo-600" />
                            Create Logistics Trip Order (Order Master)
                        </DialogTitle>
                        <p className="text-xs text-slate-500">
                            Enter the client order details, negotiated USD amount and exchange rate, select vehicle to auto-generate trip reference, and submit for approval.
                        </p>
                    </DialogHeader>

                    <form onSubmit={handleCreateOrderSubmit} className="space-y-6 pt-3">
                        {/* Section 1: Client & Commercial Terms */}
                        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                <DollarSign className="w-4 h-4 text-emerald-600" />
                                Client & Commercial Agreement
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-semibold text-slate-600">Client / Company Name *</Label>
                                    </div>
                                    <Popover open={clientComboboxOpen} onOpenChange={setClientComboboxOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className={cn("w-full h-10 justify-between bg-white border-slate-200 text-xs font-semibold", !formData.client_name && "text-slate-400")}
                                            >
                                                {formData.client_name || "Select Client..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[300px] p-0 z-[9999]" align="start">
                                            <Command>
                                                <CommandInput placeholder="Search client..." className="h-8 text-xs" />
                                                <CommandList>
                                                    <CommandEmpty className="p-2 text-xs text-center text-slate-500">No client found.</CommandEmpty>
                                                    <CommandGroup className="max-h-[200px] overflow-auto">
                                                        {clientsList.map((c: any) => (
                                                            <CommandItem
                                                                key={c.id || c.name}
                                                                value={c.name}
                                                                onSelect={() => {
                                                                    setFormData(prev => ({ ...prev, client_name: c.name }));
                                                                    setClientComboboxOpen(false);
                                                                }}
                                                                className="text-xs font-medium"
                                                            >
                                                                <Check className={cn("mr-2 h-3.5 w-3.5", formData.client_name === c.name ? "opacity-100" : "opacity-0")} />
                                                                {c.name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                            <div className="p-2 border-t border-slate-100 bg-slate-50 flex items-center gap-1.5">
                                                <Input
                                                    placeholder="Register new client..."
                                                    value={newClientName}
                                                    onChange={e => setNewClientName(e.target.value)}
                                                    className="h-8 text-xs bg-white border-slate-200"
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    disabled={isAddingClient || !newClientName.trim()}
                                                    onClick={handleAddClient}
                                                    className="h-8 px-2.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                                                >
                                                    Add
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Agreed Amount ($ USD) *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        placeholder="e.g. 3500.00"
                                        value={formData.agreed_amount_usd}
                                        onChange={e => setFormData(prev => ({ ...prev, agreed_amount_usd: e.target.value }))}
                                        className="h-10 bg-white border-slate-200 text-xs font-bold text-slate-900"
                                        required
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Client Agreed Rate (USD to Local) *</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        placeholder="e.g. 2700"
                                        value={formData.agreed_client_rate}
                                        onChange={e => setFormData(prev => ({ ...prev, agreed_client_rate: e.target.value }))}
                                        className="h-10 bg-white border-slate-200 text-xs font-bold text-slate-900"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-xs bg-white p-3 rounded-lg border border-slate-200/60">
                                <span className="font-semibold text-slate-600">Client Total in Local Currency:</span>
                                <span className="font-black text-emerald-700 text-sm">
                                    {agreedAmountLocal} Local Currency
                                </span>
                            </div>
                        </div>

                        {/* Section 2: Vehicle Selection & Auto-generated Trip Number */}
                        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                <Truck className="w-4 h-4 text-indigo-600" />
                                Vehicle Assignment & Trip Reference
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Vehicle (Horse) *</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                className={cn(
                                                    "w-full h-10 justify-between bg-white border-slate-200 text-xs font-bold",
                                                    !formData.vehicle_id && "text-slate-400 font-normal"
                                                )}
                                            >
                                                {formData.vehicle_id
                                                    ? `${formData.truck_reg} ${fleet.find(f => f.id === formData.vehicle_id)?.make_model ? `(${fleet.find(f => f.id === formData.vehicle_id)?.make_model})` : ''}`
                                                    : "Search Vehicle / Horse..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[300px] p-0 z-[9999]" align="start">
                                            <Command>
                                                <CommandInput placeholder="Type to search vehicle..." className="h-8 text-xs" />
                                                <CommandList>
                                                    <CommandEmpty className="p-2 text-xs text-center text-slate-500">No vehicle found.</CommandEmpty>
                                                    <CommandGroup className="max-h-[220px] overflow-auto">
                                                        {fleet
                                                            .filter(f => f.asset_type === 'Truck' || f.asset_type === 'Horse')
                                                            .map(v => (
                                                                <CommandItem
                                                                    key={v.id}
                                                                    value={`${v.vehicle_no} ${v.make_model || ''}`}
                                                                    onSelect={() => handleSelectVehicle(v)}
                                                                    className="text-xs font-medium cursor-pointer"
                                                                >
                                                                    <Check
                                                                        className={cn(
                                                                            "mr-2 h-3.5 w-3.5 text-indigo-600",
                                                                            formData.vehicle_id === v.id ? "opacity-100" : "opacity-0"
                                                                        )}
                                                                    />
                                                                    <span className="font-bold text-slate-800">{v.vehicle_no}</span>
                                                                    {v.make_model && <span className="ml-1 text-slate-500">({v.make_model})</span>}
                                                                </CommandItem>
                                                            ))
                                                        }
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Trip Reference Number (Auto-Generated)</Label>
                                    <Input
                                        value={formData.trip_number}
                                        onChange={e => setFormData(prev => ({ ...prev, trip_number: e.target.value }))}
                                        placeholder="Auto-generated on vehicle select..."
                                        className="h-10 bg-indigo-50/40 border-indigo-200 text-xs font-bold text-indigo-900"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Linked Trailer</Label>
                                    <Input
                                        value={formData.trailer_reg}
                                        onChange={e => setFormData(prev => ({ ...prev, trailer_reg: e.target.value }))}
                                        placeholder="Linked Trailer plate..."
                                        className="h-10 bg-white border-slate-200 text-xs font-medium text-slate-800"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Driver Name *</Label>
                                    <Input
                                        value={formData.driver_name}
                                        onChange={e => setFormData(prev => ({ ...prev, driver_name: e.target.value }))}
                                        placeholder="Driver full name"
                                        className="h-10 bg-white border-slate-200 text-xs font-semibold text-slate-900"
                                        required
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Contact No</Label>
                                    <Input
                                        value={formData.contact_no}
                                        onChange={e => setFormData(prev => ({ ...prev, contact_no: e.target.value }))}
                                        placeholder="e.g. +255..."
                                        className="h-10 bg-white border-slate-200 text-xs font-medium"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">License No</Label>
                                    <Input
                                        value={formData.license_no}
                                        onChange={e => setFormData(prev => ({ ...prev, license_no: e.target.value }))}
                                        placeholder="License #"
                                        className="h-10 bg-white border-slate-200 text-xs font-medium"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Passport No</Label>
                                    <Input
                                        value={formData.passport_no}
                                        onChange={e => setFormData(prev => ({ ...prev, passport_no: e.target.value }))}
                                        placeholder="Passport #"
                                        className="h-10 bg-white border-slate-200 text-xs font-medium"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Consignment & Routing Details */}
                        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                <FileText className="w-4 h-4 text-indigo-600" />
                                Consignment & Routing Details
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-1.5 sm:col-span-3">
                                    <Label className="text-xs font-semibold text-slate-600">Cargo Description</Label>
                                    <Input
                                        value={formData.cargo_description}
                                        onChange={e => setFormData(prev => ({ ...prev, cargo_description: e.target.value }))}
                                        placeholder="e.g. Copper Cathodes, 40FT Container, Fuel..."
                                        className="h-10 bg-white border-slate-200 text-xs font-medium"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">BL / Consignment No</Label>
                                    <Input
                                        value={formData.bl_number}
                                        onChange={e => setFormData(prev => ({ ...prev, bl_number: e.target.value }))}
                                        placeholder="e.g. BL-984392"
                                        className="h-10 bg-white border-slate-200 text-xs font-medium"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Container No</Label>
                                    <Input
                                        value={formData.container_no}
                                        onChange={e => setFormData(prev => ({ ...prev, container_no: e.target.value }))}
                                        placeholder="e.g. MSKU-129482-1"
                                        className="h-10 bg-white border-slate-200 text-xs font-medium"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Delivery Destination *</Label>
                                    <Select 
                                        value={formData.destination} 
                                        onValueChange={v => setFormData(prev => ({ ...prev, destination: v }))}
                                    >
                                        <SelectTrigger className="h-10 bg-white border-slate-200 text-xs font-semibold">
                                            <SelectValue placeholder="Select Destination..." />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[220px]">
                                            {STANDARD_DESTINATIONS.map(d => (
                                                <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Route Origin</Label>
                                    <Input
                                        value={formData.origin}
                                        onChange={e => setFormData(prev => ({ ...prev, origin: e.target.value }))}
                                        placeholder="DAR ES SALAAM"
                                        className="h-10 bg-white border-slate-200 text-xs font-medium"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Agreed Duration (Days)</Label>
                                    <Input
                                        type="number"
                                        value={formData.agreed_days}
                                        onChange={e => setFormData(prev => ({ ...prev, agreed_days: e.target.value }))}
                                        placeholder="e.g. 5"
                                        className="h-10 bg-white border-slate-200 text-xs font-medium"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600">Daily Penalty Fine</Label>
                                    <Input
                                        type="number"
                                        value={formData.daily_penalty_fine}
                                        onChange={e => setFormData(prev => ({ ...prev, daily_penalty_fine: e.target.value }))}
                                        placeholder="0"
                                        className="h-10 bg-white border-slate-200 text-xs font-medium"
                                    />
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="flex items-center justify-between gap-3 pt-2">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => setIsCreateOpen(false)}
                                className="h-10 text-xs font-bold"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                disabled={createOrderMutation.isPending}
                                className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider px-6 rounded-xl shadow-md"
                            >
                                {createOrderMutation.isPending ? "Submitting..." : "Submit Order For Approval"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ORDER DETAILS VIEW MODAL */}
            {selectedOrderDetails && (
                <Dialog open={!!selectedOrderDetails} onOpenChange={() => setSelectedOrderDetails(null)}>
                    <DialogContent className="max-w-2xl rounded-2xl p-6">
                        <DialogHeader>
                            <div className="flex items-center justify-between">
                                <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-indigo-600" />
                                    Trip Order Details: {selectedOrderDetails.trip_number || selectedOrderDetails.order_number}
                                </DialogTitle>
                                <Badge className="text-xs font-bold">
                                    {selectedOrderDetails.status}
                                </Badge>
                            </div>
                        </DialogHeader>

                        <div className="space-y-4 py-3 text-xs">
                            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div>
                                    <span className="text-slate-400 block font-medium">Client Name</span>
                                    <span className="font-bold text-slate-800 text-sm">{selectedOrderDetails.client_name}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Contracted USD</span>
                                    <span className="font-bold text-indigo-700 text-sm">${(parseFloat(selectedOrderDetails.agreed_amount_usd) || 0).toLocaleString()}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Negotiated Client Rate</span>
                                    <span className="font-semibold text-slate-700">@{selectedOrderDetails.agreed_client_rate}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Local Equivalent</span>
                                    <span className="font-bold text-emerald-700">{(parseFloat(selectedOrderDetails.agreed_amount_local) || 0).toLocaleString()} Local</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 border p-4 rounded-xl border-slate-200">
                                <div>
                                    <span className="text-slate-400 block font-medium">Vehicle Reg (Horse)</span>
                                    <span className="font-bold text-slate-800">{selectedOrderDetails.truck_reg}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Linked Trailer</span>
                                    <span className="font-bold text-slate-800">{selectedOrderDetails.trailer_reg || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Driver Name</span>
                                    <span className="font-bold text-slate-800">{selectedOrderDetails.driver_name || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Driver Contact</span>
                                    <span className="font-medium text-slate-700">{selectedOrderDetails.contact_no || "—"}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 border p-4 rounded-xl border-slate-200">
                                <div>
                                    <span className="text-slate-400 block font-medium">Destination</span>
                                    <span className="font-bold text-slate-800">{selectedOrderDetails.destination}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Cargo</span>
                                    <span className="font-medium text-slate-700">{selectedOrderDetails.cargo_description || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">BL / Consignment #</span>
                                    <span className="font-medium text-slate-700">{selectedOrderDetails.bl_number || "—"}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block font-medium">Container #</span>
                                    <span className="font-medium text-slate-700">{selectedOrderDetails.container_no || "—"}</span>
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button 
                                variant="outline" 
                                onClick={() => setSelectedOrderDetails(null)}
                                className="w-full text-xs font-bold"
                            >
                                Close
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* APPROVAL / REJECTION CONFIRMATION MODAL */}
            <Dialog open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen}>
                <DialogContent className="max-w-md rounded-2xl p-6">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                            {approvalAction === "Approve" ? (
                                <>
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                    Approve Trip Order
                                </>
                            ) : (
                                <>
                                    <XCircle className="w-5 h-5 text-rose-600" />
                                    Reject Trip Order
                                </>
                            )}
                        </DialogTitle>
                        <p className="text-xs text-slate-500">
                            {approvalAction === "Approve" 
                                ? `Are you sure you want to approve Order ${orderToApprove?.trip_number}? This will release the order to Finance for Trip Sheet creation.`
                                : `Please specify why you are rejecting Order ${orderToApprove?.trip_number}.`
                            }
                        </p>
                    </DialogHeader>

                    {approvalAction === "Reject" && (
                        <div className="space-y-2 py-2">
                            <Label className="text-xs font-semibold text-slate-600">Rejection Reason</Label>
                            <Textarea
                                placeholder="Explain why the order is rejected..."
                                value={rejectionReason}
                                onChange={e => setRejectionReason(e.target.value)}
                                className="text-xs border-slate-200 rounded-xl"
                            />
                        </div>
                    )}

                    <DialogFooter className="flex items-center gap-2 pt-2">
                        <Button 
                            variant="outline" 
                            onClick={() => setIsApprovalDialogOpen(false)}
                            className="h-9 text-xs font-bold flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                if (orderToApprove) {
                                    approveOrderMutation.mutate({
                                        orderId: orderToApprove.id,
                                        status: approvalAction === "Approve" ? "Approved" : "Rejected",
                                        rejectionReason: rejectionReason
                                    });
                                }
                            }}
                            disabled={approveOrderMutation.isPending}
                            className={cn(
                                "h-9 text-xs font-bold text-white flex-1 rounded-xl shadow-sm",
                                approvalAction === "Approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                            )}
                        >
                            {approveOrderMutation.isPending ? "Processing..." : `Confirm ${approvalAction}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
