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
    ArrowRight,
    Trash2,
    ChevronDown,
    ChevronRight,
    Layers
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

    // Group dropdown accordion expansion state
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    const toggleGroupExpand = (groupKey: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupKey]: !prev[groupKey]
        }));
    };

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

    // Multi-vehicle assignment state
    interface VehicleAssignment {
        id: string;
        vehicle_id: string;
        truck_reg: string;
        trailer_id: string;
        trailer_reg: string;
        driver_id: string;
        driver_name: string;
        contact_no: string;
        license_no: string;
        passport_no: string;
        trip_number: string;
        journey_type: string;
    }

    const initialVehicleItem: VehicleAssignment = {
        id: "veh-1",
        vehicle_id: "",
        truck_reg: "",
        trailer_id: "",
        trailer_reg: "",
        driver_id: "",
        driver_name: "",
        contact_no: "",
        license_no: "",
        passport_no: "",
        trip_number: "",
        journey_type: "Go & Return (Full Cycle)"
    };

    const [vehicleAssignments, setVehicleAssignments] = useState<VehicleAssignment[]>([initialVehicleItem]);

    const handleAddVehicleSlot = () => {
        setVehicleAssignments(prev => [
            ...prev,
            {
                ...initialVehicleItem,
                id: `veh-${Date.now()}`
            }
        ]);
    };

    const handleRemoveVehicleSlot = (index: number) => {
        if (vehicleAssignments.length <= 1) {
            toast({ variant: "destructive", title: "At least 1 vehicle is required." });
            return;
        }
        setVehicleAssignments(prev => prev.filter((_, i) => i !== index));
    };

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

    // Fetch Real Routes from Database
    const { data: dbRoutes = [] } = useQuery({
        queryKey: ["logistics_routes_for_orders"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("logistics_routes" as any)
                .select("location_name")
                .eq("is_active", true)
                .order("location_name", { ascending: true });
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

    // Helper to extract driver details from driver record and documents
    const extractDriverDetails = (driver: any) => {
        if (!driver) return { phone: "", license: "", passport: "" };
        let resolvedLicense = driver.license_no || "";
        let resolvedPassport = driver.passport_no || driver.id_number || "";

        if (driver.logistics_driver_documents && Array.isArray(driver.logistics_driver_documents)) {
            const licenseDoc = driver.logistics_driver_documents.find((doc: any) =>
                doc.document_type?.toLowerCase().includes("licen")
            );
            if (licenseDoc?.document_number) {
                resolvedLicense = licenseDoc.document_number;
            }

            const passportDoc = driver.logistics_driver_documents.find((doc: any) =>
                doc.document_type?.toLowerCase().includes("pass") || doc.document_type?.toLowerCase().includes("id")
            );
            if (passportDoc?.document_number) {
                resolvedPassport = passportDoc.document_number;
            }
        }

        const resolvedPhone = driver.phone_no || driver.phone_secondary || driver.phone || "";
        return { phone: resolvedPhone, license: resolvedLicense, passport: resolvedPassport };
    };

    // Handle Manual Driver Selection for a vehicle row
    const handleSelectDriverForVehicle = (driver: any, index: number = 0) => {
        const details = extractDriverDetails(driver);
        setVehicleAssignments(prev => {
            const copy = [...prev];
            if (copy[index]) {
                copy[index] = {
                    ...copy[index],
                    driver_id: driver.id,
                    driver_name: driver.full_name,
                    contact_no: details.phone || copy[index].contact_no,
                    license_no: details.license || copy[index].license_no,
                    passport_no: details.passport || copy[index].passport_no
                };
            }
            return copy;
        });

        if (index === 0) {
            setFormData(prev => ({
                ...prev,
                driver_id: driver.id,
                driver_name: driver.full_name,
                contact_no: details.phone || prev.contact_no,
                license_no: details.license || prev.license_no,
                passport_no: details.passport || prev.passport_no
            }));
        }

        toast({
            title: "Driver Assigned",
            description: `Assigned driver ${driver.full_name} to vehicle slot #${index + 1}.`
        });
    };

    // Handle Horse Vehicle Selection for a specific vehicle row slot
    const handleSelectVehicle = async (v: any, index: number = 0) => {
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
        const totalTrips = (sheetsCount || 0) + (ordersCount || 0) + index;
        const seq = String(totalTrips + 1).padStart(3, '0');
        const legIndicator = isTanker ? "T" : "G";
        const currentYear = new Date().getFullYear();
        const generatedTripId = `${cleanHorse}/${currentYear}/${legIndicator}${seq}`;

        // Find driver assigned to vehicle
        const assignedDriver = drivers.find((d: any) => 
            String(d.assigned_vehicle_id).toLowerCase().trim() === String(v.id).toLowerCase().trim()
        );

        const details = extractDriverDetails(assignedDriver);

        const updatedItem: VehicleAssignment = {
            id: vehicleAssignments[index]?.id || `veh-${Date.now()}`,
            vehicle_id: v.id,
            truck_reg: v.vehicle_no,
            trailer_id: activeCoupling ? activeCoupling.trailer_id : "",
            trailer_reg: trailerFound ? (trailerFound.vehicle_no || trailerFound.trailer_number) : (activeCoupling?.trailer_id || ""),
            driver_id: assignedDriver ? assignedDriver.id : "",
            driver_name: assignedDriver ? assignedDriver.full_name : "",
            contact_no: details.phone,
            license_no: details.license,
            passport_no: details.passport,
            trip_number: generatedTripId,
            journey_type: journeyType
        };

        setVehicleAssignments(prev => {
            const copy = [...prev];
            copy[index] = updatedItem;
            return copy;
        });

        // Also sync primary vehicle to formData for backwards compatibility
        if (index === 0) {
            setFormData(prev => ({
                ...prev,
                vehicle_id: v.id,
                truck_reg: v.vehicle_no,
                trailer_id: activeCoupling ? activeCoupling.trailer_id : "",
                trailer_reg: trailerFound ? (trailerFound.vehicle_no || trailerFound.trailer_number) : (activeCoupling?.trailer_id || ""),
                driver_id: assignedDriver ? assignedDriver.id : prev.driver_id,
                driver_name: assignedDriver ? assignedDriver.full_name : prev.driver_name,
                contact_no: details.phone || prev.contact_no,
                license_no: details.license || prev.license_no,
                passport_no: details.passport || prev.passport_no,
                trip_number: generatedTripId,
                journey_type: journeyType
            }));
        }

        toast({
            title: "Vehicle & Trip Assigned",
            description: `Assigned ${v.vehicle_no} with Trip #${generatedTripId}.`
        });
    };

    const updateVehicleSlotField = (index: number, field: keyof VehicleAssignment, value: string) => {
        setVehicleAssignments(prev => {
            const copy = [...prev];
            if (copy[index]) {
                copy[index] = { ...copy[index], [field]: value };
            }
            return copy;
        });
        if (index === 0 && field in formData) {
            setFormData(prev => ({ ...prev, [field]: value }));
        }
    };

    // Submit Order Mutation (Supports batch insertions for multiple vehicles)
    const createOrderMutation = useMutation({
        mutationFn: async (payloads: any[]) => {
            const { data, error } = await supabase
                .from("logistics_trip_orders" as any)
                .insert(payloads)
                .select();
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_orders"] });
            const count = data?.length || 1;
            toast({
                title: "Order Created Successfully",
                description: `${count} vehicle trip order${count > 1 ? 's' : ''} registered and submitted for Admin Approval.`
            });
            setIsCreateOpen(false);
            setFormData(initialFormState);
            setVehicleAssignments([initialVehicleItem]);
        },
        onError: (err: any) => {
            toast({
                variant: "destructive",
                title: "Failed to create order",
                description: err.message
            });
        }
    });

    const handleCreateOrderSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.client_name) {
            toast({ variant: "destructive", title: "Client Required", description: "Please choose or register a client." });
            return;
        }

        const validVehicles = vehicleAssignments.filter(v => v.vehicle_id && v.truck_reg);
        if (validVehicles.length === 0) {
            toast({ variant: "destructive", title: "Vehicle Required", description: "Please select at least one vehicle/horse." });
            return;
        }

        if (!formData.destination) {
            toast({ variant: "destructive", title: "Destination Required", description: "Please select a delivery destination." });
            return;
        }

        // Validate that no vehicle has an empty trip number
        for (let i = 0; i < validVehicles.length; i++) {
            if (!validVehicles[i].trip_number?.trim()) {
                toast({
                    variant: "destructive",
                    title: "Trip Number Required",
                    description: `Vehicle #${i + 1} (${validVehicles[i].truck_reg}) must have a Trip Reference Number.`
                });
                return;
            }
        }

        // Check for duplicate trip numbers across vehicles within the same order
        const enteredTripNumbers = validVehicles.map(v => v.trip_number.trim().toUpperCase());
        const uniqueSet = new Set(enteredTripNumbers);
        if (uniqueSet.size < enteredTripNumbers.length) {
            toast({
                variant: "destructive",
                title: "Duplicate Trip Number Detected",
                description: "Two or more vehicles in this order have the exact same Trip Reference Number. Please make sure each vehicle has a unique Trip Number."
            });
            return;
        }

        // Check for duplicate Trip Numbers against existing database records (both orders and trip sheets)
        try {
            const { data: existingOrders, error: orderCheckErr } = await supabase
                .from("logistics_trip_orders" as any)
                .select("trip_number")
                .in("trip_number", enteredTripNumbers);
            
            if (orderCheckErr) throw orderCheckErr;

            if (existingOrders && existingOrders.length > 0) {
                const dupNumber = existingOrders[0].trip_number;
                toast({
                    variant: "destructive",
                    title: "Trip Number Already Exists!",
                    description: `Trip Reference "${dupNumber}" is already in use by an existing Trip Order. Please edit and specify a unique Trip Number.`
                });
                return;
            }

            const { data: existingSheets, error: sheetCheckErr } = await supabase
                .from("logistics_trip_sheets" as any)
                .select("trip_number")
                .in("trip_number", enteredTripNumbers);

            if (sheetCheckErr) throw sheetCheckErr;

            if (existingSheets && existingSheets.length > 0) {
                const dupNumber = existingSheets[0].trip_number;
                toast({
                    variant: "destructive",
                    title: "Trip Number Already Exists!",
                    description: `Trip Reference "${dupNumber}" already exists in active Trip Sheets. Please edit and specify a unique Trip Number.`
                });
                return;
            }
        } catch (err: any) {
            console.error("Trip number check error:", err);
        }

        // Calculate next SEL-xxxx sequential order number
        let nextOrderSeq = 1;
        try {
            const { data: allExistingOrders } = await supabase
                .from("logistics_trip_orders" as any)
                .select("order_number");
            
            if (allExistingOrders && allExistingOrders.length > 0) {
                let maxNum = 0;
                allExistingOrders.forEach((o: any) => {
                    const match = o.order_number?.match(/SEL-(\d+)/i);
                    if (match && match[1]) {
                        const parsed = parseInt(match[1], 10);
                        if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
                    }
                });
                nextOrderSeq = maxNum > 0 ? maxNum + 1 : allExistingOrders.length + 1;
            }
        } catch (err) {
            nextOrderSeq = (orders?.length || 0) + 1;
        }

        const formattedOrderNumber = `SEL-${String(nextOrderSeq).padStart(4, '0')}`;

        const usdAmount = parseFloat(formData.agreed_amount_usd) || 0;
        const clientRate = parseFloat(formData.agreed_client_rate) || 1.0;
        const localTotal = usdAmount * clientRate;

        // Create an order record for each assigned vehicle so each can follow its individual trip lifecycle
        const payloads = validVehicles.map((v, i) => ({
            order_number: formattedOrderNumber,
            trip_number: v.trip_number.trim(),
            client_name: formData.client_name,
            agreed_amount_usd: usdAmount,
            agreed_client_rate: clientRate,
            agreed_amount_local: localTotal,
            currency: "USD",
            vehicle_id: v.vehicle_id || null,
            truck_reg: v.truck_reg,
            trailer_id: v.trailer_id || null,
            trailer_reg: v.trailer_reg || null,
            driver_id: v.driver_id || null,
            driver_name: v.driver_name || null,
            contact_no: v.contact_no || null,
            license_no: v.license_no || null,
            passport_no: v.passport_no || null,
            origin: formData.origin || "DAR ES SALAAM",
            destination: formData.destination,
            agreed_days: parseInt(formData.agreed_days) || 0,
            daily_penalty_fine: parseFloat(formData.daily_penalty_fine) || 0,
            journey_type: v.journey_type || formData.journey_type,
            cargo_description: formData.cargo_description || null,
            bl_number: formData.bl_number || null,
            container_no: formData.container_no || null,
            notes: formData.notes || null,
            status: "Pending Approval",
            created_by: user?.id
        }));

        createOrderMutation.mutate(payloads);
    };

    // Approval / Rejection Action Mutation (Supports single ID or array of IDs)
    const approveOrderMutation = useMutation({
        mutationFn: async ({ orderIds, status, rejectionReason }: { orderIds: string[], status: string, rejectionReason?: string }) => {
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
                .in("id", orderIds);
            if (error) throw error;
        },
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_orders"] });
            queryClient.invalidateQueries({ queryKey: ["approved_trip_orders"] });
            const count = vars.orderIds.length;
            toast({
                title: vars.status === "Approved" ? "Orders Approved!" : "Orders Rejected",
                description: vars.status === "Approved" 
                    ? `${count} order(s) approved and ready for Finance to generate Trip Sheets.` 
                    : `${count} order(s) have been rejected.`
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

    // Super Admin Delete Order Mutation (Supports deleting multiple IDs)
    const deleteOrderMutation = useMutation({
        mutationFn: async (orderIds: string[]) => {
            const { error } = await supabase
                .from("logistics_trip_orders" as any)
                .delete()
                .in("id", orderIds);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["logistics_trip_orders"] });
            toast({
                title: "Order(s) Deleted",
                description: "The selected trip order(s) have been removed successfully."
            });
        },
        onError: (err: any) => {
            toast({
                variant: "destructive",
                title: "Delete Failed",
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

    // Grouped Orders for Accordion Table Display
    const groupedOrderList = useMemo(() => {
        // Group by `${o.client_name || 'Unknown'}__${o.order_number || 'Single'}`
        const groupMap: { [key: string]: { key: string, order_number: string, client_name: string, items: any[] } } = {};
        
        filteredOrders.forEach((o: any) => {
            const groupKey = `${(o.client_name || "UNKNOWN").trim().toUpperCase()}__${(o.order_number || o.id).trim().toUpperCase()}`;
            if (!groupMap[groupKey]) {
                groupMap[groupKey] = {
                    key: groupKey,
                    order_number: o.order_number || "—",
                    client_name: o.client_name || "—",
                    items: []
                };
            }
            groupMap[groupKey].items.push(o);
        });

        return Object.values(groupMap);
    }, [filteredOrders]);

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
                            ) : groupedOrderList.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                                        No trip orders found matching your filters. Click "New Trip Order" to create one.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                groupedOrderList.map((group: any, gIdx: number) => {
                                    const isMulti = group.items.length > 1;
                                    // If only 1 order in group, render as standard row
                                    if (!isMulti) {
                                        const order = group.items[0];
                                        const isPending = order.status === "Pending Approval";
                                        const isApproved = order.status === "Approved" || order.status === "Trip Sheet Created";
                                        const isRejected = order.status === "Rejected";

                                        return (
                                            <TableRow key={order.id} className="hover:bg-slate-50/60 transition-colors">
                                                <TableCell className="text-center text-xs font-semibold text-slate-400">
                                                    {(gIdx + 1).toString().padStart(2, '0')}
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

                                                        {isSuperAdmin && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => {
                                                                    if (window.confirm(`Are you sure you want to delete order "${order.trip_number || order.order_number}"? This cannot be undone.`)) {
                                                                        deleteOrderMutation.mutate([order.id]);
                                                                    }
                                                                }}
                                                                className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                                                title="Delete Order (Super Admin Only)"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    }

                                    // Multi-vehicle group: render expandable parent header row + sub-rows
                                    const isExpanded = expandedGroups[group.key] !== false; // default expanded
                                    const totalGroupUSD = group.items.reduce((sum: number, o: any) => sum + (parseFloat(o.agreed_amount_usd) || 0), 0);
                                    const totalGroupLocal = group.items.reduce((sum: number, o: any) => sum + (parseFloat(o.agreed_amount_local) || 0), 0);
                                    const sampleOrder = group.items[0];
                                    const allPending = group.items.every((o: any) => o.status === "Pending Approval");
                                    const allApproved = group.items.every((o: any) => o.status === "Approved" || o.status === "Trip Sheet Created");
                                    const hasPending = group.items.some((o: any) => o.status === "Pending Approval");

                                    return (
                                        <div key={group.key} className="contents">
                                            {/* Group Parent Row */}
                                            <TableRow 
                                                className="bg-indigo-50/50 hover:bg-indigo-50/80 border-y border-indigo-100/80 transition-colors cursor-pointer select-none font-medium"
                                                onClick={() => toggleGroupExpand(group.key)}
                                            >
                                                <TableCell className="text-center text-xs font-bold text-indigo-700">
                                                    {(gIdx + 1).toString().padStart(2, '0')}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 w-6 p-0 text-indigo-700 hover:text-indigo-950 hover:bg-indigo-100 rounded-md"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleGroupExpand(group.key);
                                                            }}
                                                        >
                                                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                        </Button>
                                                        <div>
                                                            <div className="font-black text-indigo-900 text-xs flex items-center gap-1.5">
                                                                {group.order_number}
                                                                <Badge className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0 h-4 border-none">
                                                                    {group.items.length} Vehicles
                                                                </Badge>
                                                            </div>
                                                            <div className="text-[10px] text-indigo-600 font-semibold mt-0.5">
                                                                Click to {isExpanded ? 'collapse' : 'expand'} order drop-down
                                                            </div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                                        <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                                                        {group.client_name}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                                        <Truck className="w-3.5 h-3.5 text-slate-500" />
                                                        {group.items.map((it: any) => it.truck_reg).filter(Boolean).join(", ")}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500">
                                                        {group.items.length} assigned driver(s)
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-semibold text-slate-800 text-xs">{sampleOrder.destination}</div>
                                                    <div className="text-[10px] text-slate-500 font-medium">From: {sampleOrder.origin || 'DAR ES SALAAM'}</div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="font-black text-indigo-950 text-xs">
                                                        ${totalGroupUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 font-medium">
                                                        Rate: @{sampleOrder.agreed_client_rate || "2700"}
                                                    </div>
                                                    <div className="text-[10px] font-bold text-emerald-700">
                                                        {totalGroupLocal.toLocaleString(undefined, { minimumFractionDigits: 0 })} Local Total
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                    <Badge
                                                        className={cn(
                                                            "text-[10px] font-bold px-2 py-0.5 border shadow-none",
                                                            allPending && "bg-amber-50 text-amber-700 border-amber-200",
                                                            allApproved && "bg-emerald-50 text-emerald-700 border-emerald-200",
                                                            !allPending && !allApproved && "bg-slate-100 text-slate-700 border-slate-300"
                                                        )}
                                                    >
                                                        {allPending ? "Pending All" : allApproved ? "All Approved" : "Mixed Status"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {isAdmin && hasPending && (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setOrderToApprove({
                                                                            order_number: group.order_number,
                                                                            trip_number: `${group.order_number} (${group.items.length} vehicles)`,
                                                                            items: group.items.filter((it: any) => it.status === "Pending Approval")
                                                                        });
                                                                        setApprovalAction("Approve");
                                                                        setIsApprovalDialogOpen(true);
                                                                    }}
                                                                    className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg shadow-sm"
                                                                    title="Approve all vehicles in this order"
                                                                >
                                                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                                                    Approve All
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setOrderToApprove({
                                                                            order_number: group.order_number,
                                                                            trip_number: `${group.order_number} (${group.items.length} vehicles)`,
                                                                            items: group.items.filter((it: any) => it.status === "Pending Approval")
                                                                        });
                                                                        setApprovalAction("Reject");
                                                                        setIsApprovalDialogOpen(true);
                                                                    }}
                                                                    className="h-8 px-2.5 border-rose-200 text-rose-600 hover:bg-rose-50 text-[11px] font-bold rounded-lg"
                                                                    title="Reject all vehicles in this order"
                                                                >
                                                                    <XCircle className="w-3.5 h-3.5 mr-1" />
                                                                    Reject All
                                                                </Button>
                                                            </>
                                                        )}

                                                        {isSuperAdmin && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => {
                                                                    if (window.confirm(`Are you sure you want to delete entire Order "${group.order_number}" with all ${group.items.length} vehicles? This cannot be undone.`)) {
                                                                        const allIds = group.items.map((it: any) => it.id);
                                                                        deleteOrderMutation.mutate(allIds);
                                                                    }
                                                                }}
                                                                className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                                                title="Delete Grouped Order (Super Admin Only)"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>

                                            {/* Sub-Rows (Child Vehicles) inside Drop-down Accordion */}
                                            {isExpanded && group.items.map((subOrder: any, subIdx: number) => {
                                                const isSubPending = subOrder.status === "Pending Approval";
                                                const isSubApproved = subOrder.status === "Approved" || subOrder.status === "Trip Sheet Created";
                                                const isSubRejected = subOrder.status === "Rejected";

                                                return (
                                                    <TableRow key={subOrder.id} className="bg-slate-50/40 hover:bg-slate-100/60 border-b border-slate-100 transition-colors">
                                                        <TableCell className="text-center text-[11px] font-semibold text-slate-400 pl-4">
                                                            ↳ {subIdx + 1}
                                                        </TableCell>
                                                        <TableCell className="pl-6">
                                                            <div className="font-black text-indigo-900 text-xs">{subOrder.trip_number || "—"}</div>
                                                            <div className="text-[10px] text-slate-400 font-medium">{subOrder.order_number}</div>
                                                            <div className="text-[9px] font-semibold text-indigo-600 mt-0.5">{subOrder.journey_type}</div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-semibold text-slate-600 text-xs flex items-center gap-1">
                                                                <Building2 className="w-3 h-3 text-slate-400" />
                                                                {subOrder.client_name}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="space-y-0.5">
                                                                <div className="font-bold text-slate-800 text-xs flex items-center gap-1">
                                                                    <Truck className="w-3 h-3 text-indigo-500" />
                                                                    {subOrder.truck_reg} {subOrder.trailer_reg && <span className="text-slate-400 font-normal">/ {subOrder.trailer_reg}</span>}
                                                                </div>
                                                                <div className="text-[11px] text-slate-600 flex items-center gap-1">
                                                                    <User className="w-3 h-3 text-slate-400" />
                                                                    {subOrder.driver_name || "No driver assigned"}
                                                                </div>
                                                                {subOrder.contact_no && (
                                                                    <div className="text-[10px] text-slate-400">{subOrder.contact_no}</div>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="space-y-0.5">
                                                                <div className="font-semibold text-slate-800 text-xs">{subOrder.destination}</div>
                                                                <div className="text-[10px] text-slate-500 font-medium">From: {subOrder.origin || 'DAR ES SALAAM'}</div>
                                                                {subOrder.cargo_description && (
                                                                    <div className="text-[10px] text-indigo-600 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100/50 w-fit">
                                                                        {subOrder.cargo_description}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="font-black text-slate-900 text-xs">
                                                                ${(parseFloat(subOrder.agreed_amount_usd) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 font-medium">
                                                                Rate: @{subOrder.agreed_client_rate || "2700"}
                                                            </div>
                                                            <div className="text-[10px] font-semibold text-emerald-700">
                                                                {(parseFloat(subOrder.agreed_amount_local) || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })} Local
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Badge
                                                                className={cn(
                                                                    "text-[10px] font-bold px-2 py-0.5 border shadow-none",
                                                                    isSubPending && "bg-amber-50 text-amber-700 border-amber-200",
                                                                    isSubApproved && "bg-emerald-50 text-emerald-700 border-emerald-200",
                                                                    isSubRejected && "bg-rose-50 text-rose-700 border-rose-200"
                                                                )}
                                                            >
                                                                {subOrder.status}
                                                            </Badge>
                                                            {subOrder.approved_at && (
                                                                <div className="text-[9px] text-slate-400 mt-1">
                                                                    {format(new Date(subOrder.approved_at), "dd MMM yy")}
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setSelectedOrderDetails(subOrder)}
                                                                    className="h-8 px-2.5 text-[11px] text-slate-600 hover:text-slate-900"
                                                                >
                                                                    <Eye className="w-3.5 h-3.5 mr-1" />
                                                                    View
                                                                </Button>

                                                                {isAdmin && isSubPending && (
                                                                    <>
                                                                        <Button
                                                                            size="sm"
                                                                            onClick={() => {
                                                                                setOrderToApprove(subOrder);
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
                                                                                setOrderToApprove(subOrder);
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

                                                                {isSuperAdmin && (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            if (window.confirm(`Are you sure you want to delete order "${subOrder.trip_number || subOrder.order_number}"? This cannot be undone.`)) {
                                                                                deleteOrderMutation.mutate([subOrder.id]);
                                                                            }
                                                                        }}
                                                                        className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                                                        title="Delete Order (Super Admin Only)"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </div>
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

                        {/* Section 2: Vehicle Selection & Auto-generated Trip Number (Supports Multi-Vehicle Assignment) */}
                        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Truck className="w-4 h-4 text-indigo-600" />
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                        Vehicle Assignment & Trip Reference
                                    </h4>
                                    {vehicleAssignments.length > 1 && (
                                        <Badge className="bg-indigo-100 text-indigo-800 text-[10px] font-bold border-none px-2">
                                            {vehicleAssignments.length} Vehicles
                                        </Badge>
                                    )}
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={handleAddVehicleSlot}
                                    className="h-7 text-[11px] font-bold text-indigo-700 border-indigo-200 bg-white hover:bg-indigo-50 gap-1.5 shadow-xs"
                                    title="Add another vehicle to this order"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Add Vehicle
                                </Button>
                            </div>

                            <div className="space-y-4">
                                {vehicleAssignments.map((veh, vIdx) => (
                                    <div 
                                        key={veh.id} 
                                        className={cn(
                                            "p-3.5 rounded-xl border transition-all",
                                            vehicleAssignments.length > 1 
                                                ? "bg-white border-indigo-100 shadow-xs relative" 
                                                : "bg-transparent border-transparent p-0"
                                        )}
                                    >
                                        {vehicleAssignments.length > 1 && (
                                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                                                <span className="text-[11px] font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                                                    <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px]">
                                                        {vIdx + 1}
                                                    </span>
                                                    Vehicle #{vIdx + 1} {veh.truck_reg ? `• ${veh.truck_reg}` : ''}
                                                </span>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleRemoveVehicleSlot(vIdx)}
                                                    className="h-6 px-2 text-[10px] text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                                >
                                                    <Trash2 className="w-3 h-3 mr-1" /> Remove
                                                </Button>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-600">Vehicle (Horse) *</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            role="combobox"
                                                            className={cn(
                                                                "w-full h-9 justify-between bg-white border-slate-200 text-xs font-bold",
                                                                !veh.vehicle_id && "text-slate-400 font-normal"
                                                            )}
                                                        >
                                                            {veh.vehicle_id
                                                                ? `${veh.truck_reg} ${fleet.find(f => f.id === veh.vehicle_id)?.make_model ? `(${fleet.find(f => f.id === veh.vehicle_id)?.make_model})` : ''}`
                                                                : "Search Vehicle / Horse..."}
                                                            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
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
                                                                                onSelect={() => handleSelectVehicle(v, vIdx)}
                                                                                className="text-xs font-medium cursor-pointer"
                                                                            >
                                                                                <Check
                                                                                    className={cn(
                                                                                        "mr-2 h-3.5 w-3.5 text-indigo-600",
                                                                                        veh.vehicle_id === v.id ? "opacity-100" : "opacity-0"
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

                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-600">Trip Reference Number (Auto-Generated)</Label>
                                                <Input
                                                    value={veh.trip_number}
                                                    onChange={e => updateVehicleSlotField(vIdx, "trip_number", e.target.value)}
                                                    placeholder="Auto-generated on vehicle select..."
                                                    className="h-9 bg-indigo-50/40 border-indigo-200 text-xs font-bold text-indigo-900"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-600">Linked Trailer</Label>
                                                <Input
                                                    value={veh.trailer_reg}
                                                    onChange={e => updateVehicleSlotField(vIdx, "trailer_reg", e.target.value)}
                                                    placeholder="Linked Trailer plate..."
                                                    className="h-9 bg-white border-slate-200 text-xs font-medium text-slate-800"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-600">Driver Name *</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            role="combobox"
                                                            className={cn(
                                                                "w-full h-9 justify-between bg-white border-slate-200 text-xs font-semibold",
                                                                !veh.driver_name && "text-slate-400 font-normal"
                                                            )}
                                                        >
                                                            <span className="truncate">
                                                                {veh.driver_name || "Select / Search Driver..."}
                                                            </span>
                                                            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-[300px] p-0 z-[9999]" align="start">
                                                        <Command>
                                                            <CommandInput placeholder="Search driver name..." className="h-8 text-xs" />
                                                            <CommandList>
                                                                <CommandEmpty className="p-2 text-xs text-center text-slate-500">No driver found.</CommandEmpty>
                                                                <CommandGroup className="max-h-[220px] overflow-auto">
                                                                    {drivers.map((d: any) => {
                                                                        const isExpired = d.license_expiry && new Date(d.license_expiry) < new Date();
                                                                        return (
                                                                            <CommandItem
                                                                                key={d.id}
                                                                                value={`${d.full_name} ${d.license_no || ''}`}
                                                                                onSelect={() => handleSelectDriverForVehicle(d, vIdx)}
                                                                                className="text-xs font-medium cursor-pointer"
                                                                            >
                                                                                <Check
                                                                                    className={cn(
                                                                                        "mr-2 h-3.5 w-3.5 text-indigo-600",
                                                                                        (veh.driver_id === d.id || veh.driver_name === d.full_name) ? "opacity-100" : "opacity-0"
                                                                                    )}
                                                                                />
                                                                                <div className="flex flex-col flex-1">
                                                                                    <span className="font-semibold text-slate-800">{d.full_name}</span>
                                                                                    <span className="text-[10px] text-slate-400">{d.phone_no || d.license_no || "No phone listed"}</span>
                                                                                </div>
                                                                                {isExpired && (
                                                                                    <Badge variant="outline" className="text-[8px] text-red-500 border-red-200">Expired</Badge>
                                                                                )}
                                                                            </CommandItem>
                                                                        );
                                                                    })}
                                                                </CommandGroup>
                                                            </CommandList>
                                                        </Command>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-600">Contact No</Label>
                                                <Input
                                                    value={veh.contact_no}
                                                    onChange={e => updateVehicleSlotField(vIdx, "contact_no", e.target.value)}
                                                    placeholder="e.g. +255..."
                                                    className="h-9 bg-white border-slate-200 text-xs font-medium"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-600">License No</Label>
                                                <Input
                                                    value={veh.license_no}
                                                    onChange={e => updateVehicleSlotField(vIdx, "license_no", e.target.value)}
                                                    placeholder="License #"
                                                    className="h-9 bg-white border-slate-200 text-xs font-medium"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-600">Passport No</Label>
                                                <Input
                                                    value={veh.passport_no}
                                                    onChange={e => updateVehicleSlotField(vIdx, "passport_no", e.target.value)}
                                                    placeholder="Passport #"
                                                    className="h-9 bg-white border-slate-200 text-xs font-medium"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
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
                                        onValueChange={v => {
                                            let autoRate = formData.agreed_amount_usd;
                                            let autoDays = formData.agreed_days;
                                            let autoCargo = formData.cargo_description;
                                            
                                            // Check Master Collection
                                            try {
                                                const savedRoutes = localStorage.getItem("master_collection_routes");
                                                if (savedRoutes) {
                                                    const parsed = JSON.parse(savedRoutes);
                                                    const matched = parsed.find((r: any) => r.destination?.toUpperCase() === v?.toUpperCase());
                                                    if (matched) {
                                                        if (matched.default_rate_usd) autoRate = String(matched.default_rate_usd);
                                                        if (matched.agreed_days) autoDays = String(matched.agreed_days);
                                                        if (matched.default_cargo && !formData.cargo_description) autoCargo = matched.default_cargo;
                                                    }
                                                }
                                            } catch (e) {}

                                            setFormData(prev => ({ 
                                                ...prev, 
                                                destination: v,
                                                agreed_amount_usd: autoRate,
                                                agreed_days: autoDays,
                                                cargo_description: autoCargo
                                            }));
                                        }}
                                    >
                                        <SelectTrigger className="h-10 bg-white border-slate-200 text-xs font-semibold">
                                            <SelectValue placeholder="Select Destination..." />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[220px]">
                                            {(() => {
                                                const dbNames = (dbRoutes as any[]).map((r: any) => r.location_name?.toUpperCase()).filter(Boolean);
                                                const allDests = [...new Set([...dbNames, ...STANDARD_DESTINATIONS])].sort();
                                                return allDests.map(d => (
                                                    <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
                                                ));
                                            })()}
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

                                <div className="space-y-1.5 md:col-span-2">
                                    <Label className="text-xs font-semibold text-slate-600">Agreed Duration (Days)</Label>
                                    <Input
                                        type="number"
                                        value={formData.agreed_days}
                                        onChange={e => setFormData(prev => ({ ...prev, agreed_days: e.target.value }))}
                                        placeholder="e.g. 5"
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
                                    Approve Trip Order{orderToApprove?.items?.length > 1 ? `s (${orderToApprove.items.length} Vehicles)` : ''}
                                </>
                            ) : (
                                <>
                                    <XCircle className="w-5 h-5 text-rose-600" />
                                    Reject Trip Order{orderToApprove?.items?.length > 1 ? `s (${orderToApprove.items.length} Vehicles)` : ''}
                                </>
                            )}
                        </DialogTitle>
                        <p className="text-xs text-slate-500">
                            {approvalAction === "Approve" 
                                ? `Are you sure you want to approve Order ${orderToApprove?.order_number || orderToApprove?.trip_number}? This will release the order${orderToApprove?.items?.length > 1 ? ` (${orderToApprove.items.length} vehicles)` : ''} to Finance for Trip Sheet creation.`
                                : `Please specify why you are rejecting Order ${orderToApprove?.order_number || orderToApprove?.trip_number}.`
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
                                    const idsToProcess = orderToApprove.items 
                                        ? orderToApprove.items.map((it: any) => it.id)
                                        : [orderToApprove.id];
                                    approveOrderMutation.mutate({
                                        orderIds: idsToProcess,
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
