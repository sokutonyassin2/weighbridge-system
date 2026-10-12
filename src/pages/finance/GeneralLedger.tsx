import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  fetchCleanLogisticsTripSheets, 
  OPERATIONAL_BASELINE_TRIPS 
} from "@/lib/logisticsDataService";
import { 
  getTripShortageRecovery, 
  saveTripShortageRecovery,
  getClientOpeningBalances,
  saveClientOpeningBalance,
  buildClientStatement,
  TankerShortageRecovery
} from "@/lib/logisticsFinanceService";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Truck, 
  BookOpen, 
  DollarSign, 
  Building2, 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  TrendingUp, 
  Receipt, 
  Printer, 
  Search, 
  Plus, 
  ChevronRight, 
  Droplet, 
  Calculator,
  UserCheck,
  Scale,
  FileSpreadsheet
} from "lucide-react";
import { format } from "date-fns";
import { AccountingVouchersManager } from "@/components/finance/AccountingVouchersManager";

export default function GeneralLedger() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeMainTab, setActiveMainTab] = useState<"vouchers" | "vehicles" | "clients" | "journal">("vouchers");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCargo, setFilterCargo] = useState<"all" | "tanker" | "dry">("all");
  const [filterShortage, setFilterShortage] = useState<"all" | "with_shortage" | "pending_driver" | "recovered">("all");

  // Statement & Modal States
  const [selectedVehicleTrip, setSelectedVehicleTrip] = useState<any | null>(null);
  const [statementModalOpen, setStatementModalOpen] = useState(false);

  const [driverPaymentModalOpen, setDriverPaymentModalOpen] = useState(false);
  const [editingTripForDriver, setEditingTripForDriver] = useState<any | null>(null);
  const [driverPaidInput, setDriverPaidInput] = useState("");
  const [driverMethodInput, setDriverMethodInput] = useState<"Allowance Deduction" | "Cash Deposit" | "Bank Transfer" | "Mobile Money">("Allowance Deduction");
  const [driverReceiptInput, setDriverReceiptInput] = useState("");
  const [driverDateInput, setDriverDateInput] = useState(new Date().toISOString().split("T")[0]);
  const [driverNotesInput, setDriverNotesInput] = useState("");

  // Client Statement & Opening Balance Modal
  const [selectedClientForStatement, setSelectedClientForStatement] = useState<string | null>(null);
  const [clientStatementModalOpen, setClientStatementModalOpen] = useState(false);
  const [editOpeningBalanceModalOpen, setEditOpeningBalanceModalOpen] = useState(false);
  const [editingClientName, setEditingClientName] = useState("");
  const [openingBalanceInput, setOpeningBalanceInput] = useState("");

  // Trigger re-renders when local finance storage updates
  const [, setTriggerUpdate] = useState(0);

  // 1. Fetch Trip Sheets
  const { data: tripSheets = [], isLoading: isLoadingSheets } = useQuery({
    queryKey: ["general-ledger-trip-sheets"],
    queryFn: fetchCleanLogisticsTripSheets,
    staleTime: 1000 * 30
  });

  // 2. Fetch Invoice Payments
  const { data: invoicePayments = [] } = useQuery({
    queryKey: ["general-ledger-invoice-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logistics_invoice_payments" as any)
        .select("*")
        .order("payment_date", { ascending: false });
      if (error) return [];
      return data || [];
    },
    staleTime: 1000 * 30
  });

  // Group Payments by Invoice No
  const paymentHistoryMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    invoicePayments.forEach((p: any) => {
      if (p.invoice_no) {
        if (!map[p.invoice_no]) map[p.invoice_no] = [];
        map[p.invoice_no].push(p);
      }
    });
    return map;
  }, [invoicePayments]);

  // Client Opening Balances
  const clientOpeningBalances = useMemo(() => {
    return getClientOpeningBalances();
  }, []);

  // Compute Vehicle Trip Ledgers & Statements
  const vehicleLedgers = useMemo(() => {
    return tripSheets.map((sheet: any) => {
      const rate = parseFloat(sheet.exchange_rate) || 2700;
      const isUSD = (sheet.revenue_currency || "USD") === "USD";
      const baseRevAmt = parseFloat(sheet.revenue_amount) || 0;
      const baseRevUSD = isUSD ? baseRevAmt : baseRevAmt / rate;

      // Check Tanker / Shortage data
      const shortageRecovery = getTripShortageRecovery(sheet.id, sheet);
      
      const isTanker = 
        sheet.cargo_outbound?.toLowerCase().includes("fuel") || 
        sheet.cargo_outbound?.toLowerCase().includes("tanker") ||
        sheet.cargo_outbound?.toLowerCase().includes("petrol") ||
        sheet.cargo_outbound?.toLowerCase().includes("diesel") ||
        sheet.cargo_outbound?.toLowerCase().includes("oil") ||
        sheet.vehicle?.fleet_category?.toLowerCase().includes("tanker") ||
        shortageRecovery.applicable;

      const agreedFreightUSD = shortageRecovery.applicable && shortageRecovery.agreed_amount > 0 
        ? shortageRecovery.agreed_amount 
        : baseRevUSD;

      const shortageLossUSD = shortageRecovery.applicable ? shortageRecovery.shortage_amount : 0;
      const netClientInvoicedUSD = shortageRecovery.applicable ? shortageRecovery.net_client_amount : agreedFreightUSD;
      const driverPaidUSD = shortageRecovery.applicable ? shortageRecovery.driver_recovered_amount : 0;

      // Realized Revenue = What client pays ($500) + What driver pays ($200) = $700 total
      const totalRealizedRevenueUSD = netClientInvoicedUSD + driverPaidUSD;

      // Expenses
      const expensesUSD = parseFloat(sheet.total_expenses_usd) || ((parseFloat(sheet.total_expenses_tzs) || 0) / rate);
      const netProfitUSD = totalRealizedRevenueUSD - expensesUSD;
      const profitMarginPct = totalRealizedRevenueUSD > 0 
        ? Math.round((netProfitUSD / totalRealizedRevenueUSD) * 100) 
        : 0;

      return {
        ...sheet,
        isTanker,
        agreedFreightUSD,
        shortageLossUSD,
        netClientInvoicedUSD,
        driverPaidUSD,
        totalRealizedRevenueUSD,
        expensesUSD,
        netProfitUSD,
        profitMarginPct,
        shortageRecovery
      };
    });
  }, [tripSheets]);

  // Overall Financial Metrics across Fleet
  const fleetMetrics = useMemo(() => {
    let grossAgreedUSD = 0;
    let totalShortageLossUSD = 0;
    let totalDriverRecoveredUSD = 0;
    let totalRealizedRevenueUSD = 0;
    let totalFleetExpensesUSD = 0;
    let countTankers = 0;
    let countShortages = 0;
    let countPendingRecovery = 0;

    vehicleLedgers.forEach((vl: any) => {
      grossAgreedUSD += vl.agreedFreightUSD;
      totalShortageLossUSD += vl.shortageLossUSD;
      totalDriverRecoveredUSD += vl.driverPaidUSD;
      totalRealizedRevenueUSD += vl.totalRealizedRevenueUSD;
      totalFleetExpensesUSD += vl.expensesUSD;

      if (vl.isTanker) countTankers++;
      if (vl.shortageLossUSD > 0) {
        countShortages++;
        if (vl.shortageRecovery.driver_recovery_status !== "Fully Recovered") {
          countPendingRecovery++;
        }
      }
    });

    const netFleetProfitUSD = totalRealizedRevenueUSD - totalFleetExpensesUSD;
    const overallMargin = totalRealizedRevenueUSD > 0 ? Math.round((netFleetProfitUSD / totalRealizedRevenueUSD) * 100) : 0;

    return {
      grossAgreedUSD,
      totalShortageLossUSD,
      totalDriverRecoveredUSD,
      totalRealizedRevenueUSD,
      totalFleetExpensesUSD,
      netFleetProfitUSD,
      overallMargin,
      countTankers,
      countShortages,
      countPendingRecovery,
      totalTrips: vehicleLedgers.length
    };
  }, [vehicleLedgers]);

  // Group Invoices by Client with Opening and Closing Balances
  const clientAccounts = useMemo(() => {
    // 1. Group by unique invoice_no first (supporting Outbound and Return legs)
    const allInvoices: Record<string, any> = {};

    tripSheets.forEach((sheet: any) => {
      const rate = parseFloat(sheet.exchange_rate) || 2700;

      // Outbound Leg
      if (sheet.invoice_no) {
        const invNo = sheet.invoice_no;
        if (!allInvoices[invNo]) {
          allInvoices[invNo] = {
            invoice_no: invNo,
            invoice_date: sheet.invoice_date,
            currency: sheet.revenue_currency || "TZS",
            client_name: sheet.client_name || "Seekers & Korridor",
            exchange_rate: rate,
            total_amount: 0,
            trips: []
          };
        }
        allInvoices[invNo].trips.push({ ...sheet, _leg: "OUTBOUND" });
        allInvoices[invNo].total_amount += parseFloat(sheet.revenue_amount || 0);
      }

      // Return Leg
      if (sheet.return_invoice_no) {
        const retInvNo = sheet.return_invoice_no;
        if (!allInvoices[retInvNo]) {
          allInvoices[retInvNo] = {
            invoice_no: retInvNo,
            invoice_date: sheet.return_invoice_date,
            currency: sheet.return_revenue_currency || "TZS",
            client_name: sheet.return_client_name || sheet.client_name || "Seekers & Korridor",
            exchange_rate: rate,
            total_amount: 0,
            trips: []
          };
        }
        allInvoices[retInvNo].trips.push({ ...sheet, _leg: "RETURN" });
        allInvoices[retInvNo].total_amount += parseFloat(sheet.return_revenue_amount || 0);
      }
    });

    const acc: Record<string, {
      client_name: string;
      opening_balance_usd: number;
      total_invoiced_usd: number;
      total_received_usd: number;
      closing_balance_usd: number;
      invoices: any[];
    }> = {};

    Object.values(allInvoices).forEach((inv: any) => {
      const rate = inv.exchange_rate || 2700;
      const isUSD = (inv.currency || "USD") === "USD";

      // Amount Received calculation
      const payments = paymentHistoryMap[inv.invoice_no] || [];
      const recordedPayments = payments.length > 0 ? payments.reduce((sum: number, p: any) => sum + (parseFloat(p.amount_paid) || 0), 0) : undefined;
      const hasLegacyPaid = inv.trips.every((t: any) => 
        (t._leg === "RETURN" ? t.return_payment_status : t.payment_status) === "Paid"
      );
      const baselineReceived = inv.trips.reduce((sum: number, t: any) => sum + (parseFloat(t.amount_received) || 0), 0);
      const amountPaid = recordedPayments !== undefined 
        ? recordedPayments 
        : (hasLegacyPaid ? inv.total_amount : baselineReceived);

      const invUSD = isUSD ? inv.total_amount : inv.total_amount / rate;
      const recUSD = isUSD ? amountPaid : amountPaid / rate;

      inv.amount_paid = amountPaid;
      inv.payments = payments;

      const client = inv.client_name;
      if (!acc[client]) {
        const ob = clientOpeningBalances[client] || 0;
        acc[client] = {
          client_name: client,
          opening_balance_usd: ob,
          total_invoiced_usd: 0,
          total_received_usd: 0,
          closing_balance_usd: ob,
          invoices: []
        };
      }

      acc[client].invoices.push(inv);
      acc[client].total_invoiced_usd += invUSD;
      acc[client].total_received_usd += recUSD;
    });

    // Compute closing balance: Opening + Invoiced - Received
    Object.values(acc).forEach((c) => {
      c.closing_balance_usd = c.opening_balance_usd + c.total_invoiced_usd - c.total_received_usd;
    });

    return acc;
  }, [tripSheets, paymentHistoryMap, clientOpeningBalances]);

  // Overall Client Balances Summary
  const clientOverallTotals = useMemo(() => {
    let totalOpening = 0;
    let totalInvoiced = 0;
    let totalReceived = 0;
    let totalClosing = 0;

    Object.values(clientAccounts).forEach((c) => {
      totalOpening += c.opening_balance_usd;
      totalInvoiced += c.total_invoiced_usd;
      totalReceived += c.total_received_usd;
      totalClosing += c.closing_balance_usd;
    });

    return { totalOpening, totalInvoiced, totalReceived, totalClosing };
  }, [clientAccounts]);

  // Filtered Vehicle Ledgers
  const filteredVehicles = useMemo(() => {
    return vehicleLedgers.filter((vl: any) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch = 
        !searchTerm ||
        vl.reference_number?.toLowerCase().includes(q) ||
        vl.vehicle?.vehicle_no?.toLowerCase().includes(q) ||
        vl.driver?.full_name?.toLowerCase().includes(q) ||
        vl.client_name?.toLowerCase().includes(q) ||
        vl.origin?.toLowerCase().includes(q) ||
        vl.destination?.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (filterCargo === "tanker" && !vl.isTanker) return false;
      if (filterCargo === "dry" && vl.isTanker) return false;

      if (filterShortage === "with_shortage" && vl.shortageLossUSD <= 0) return false;
      if (filterShortage === "pending_driver" && (vl.shortageLossUSD <= 0 || vl.shortageRecovery.driver_recovery_status === "Fully Recovered")) return false;
      if (filterShortage === "recovered" && vl.shortageRecovery.driver_recovery_status !== "Fully Recovered") return false;

      return true;
    });
  }, [vehicleLedgers, searchTerm, filterCargo, filterShortage]);

  // Action: Open Driver Shortage Payment Modal
  const handleOpenDriverPayment = (trip: any) => {
    setEditingTripForDriver(trip);
    const shortageData = trip.shortageRecovery || getTripShortageRecovery(trip.id, trip);
    setDriverPaidInput(shortageData.driver_recovered_amount > 0 ? String(shortageData.driver_recovered_amount) : String(shortageData.shortage_amount || 200));
    setDriverMethodInput(shortageData.driver_payment_method || "Allowance Deduction");
    setDriverReceiptInput(shortageData.driver_receipt_no || `REC-DRV-${trip.reference_number || "01"}`);
    setDriverDateInput(shortageData.driver_payment_date || new Date().toISOString().split("T")[0]);
    setDriverNotesInput(shortageData.notes || "Offloading fuel evaporation shortage paid by driver");
    setDriverPaymentModalOpen(true);
  };

  // Action: Save Driver Shortage Payment
  const handleSaveDriverPayment = () => {
    if (!editingTripForDriver) return;
    const paidAmt = parseFloat(driverPaidInput) || 0;
    const currentShortage = editingTripForDriver.shortageRecovery || getTripShortageRecovery(editingTripForDriver.id, editingTripForDriver);
    
    const shortageLoss = currentShortage.shortage_amount > 0 ? currentShortage.shortage_amount : paidAmt;
    const agreedAmt = currentShortage.agreed_amount > 0 ? currentShortage.agreed_amount : (editingTripForDriver.agreedFreightUSD || 700);
    const netClient = Math.max(0, agreedAmt - shortageLoss);

    const updated: TankerShortageRecovery = {
      applicable: true,
      cargo_type: currentShortage.cargo_type || "Fuel / Petroleum",
      agreed_amount: agreedAmt,
      agreed_currency: "USD",
      shortage_liters: currentShortage.shortage_liters || 0,
      shortage_rate: currentShortage.shortage_rate || 0,
      shortage_amount: shortageLoss,
      net_client_amount: netClient,
      driver_recovered_amount: paidAmt,
      driver_recovery_status: paidAmt >= shortageLoss - 0.01 ? "Fully Recovered" : paidAmt > 0 ? "Partially Recovered" : "Pending",
      driver_payment_method: driverMethodInput,
      driver_receipt_no: driverReceiptInput,
      driver_payment_date: driverDateInput,
      notes: driverNotesInput
    };

    saveTripShortageRecovery(editingTripForDriver.id, updated, editingTripForDriver.reference_number);
    setTriggerUpdate((prev) => prev + 1);
    queryClient.invalidateQueries({ queryKey: ["general-ledger-trip-sheets"] });

    toast({
      title: "Driver Shortage Payment Logged",
      description: `Successfully recorded $${paidAmt.toLocaleString()} recovered from driver. Status: ${updated.driver_recovery_status}. Total realized revenue: $${(netClient + paidAmt).toLocaleString()}.`
    });

    setDriverPaymentModalOpen(false);
    setEditingTripForDriver(null);
  };

  // Action: Open Vehicle Trip Statement
  const handleOpenVehicleStatement = (trip: any) => {
    setSelectedVehicleTrip(trip);
    setStatementModalOpen(true);
  };

  // Action: Open Client Statement
  const handleOpenClientStatement = (clientName: string) => {
    setSelectedClientForStatement(clientName);
    setClientStatementModalOpen(true);
  };

  // Action: Save Client Opening Balance
  const handleSaveOpeningBalance = () => {
    if (!editingClientName) return;
    const ob = parseFloat(openingBalanceInput) || 0;
    saveClientOpeningBalance(editingClientName, ob);
    setTriggerUpdate((prev) => prev + 1);
    toast({
      title: "Opening Balance Updated",
      description: `Opening balance for ${editingClientName} set to $${ob.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`
    });
    setEditOpeningBalanceModalOpen(false);
  };

  // Client statement generated data
  const activeClientStatement = useMemo(() => {
    if (!selectedClientForStatement) return null;
    const cData = clientAccounts[selectedClientForStatement];
    if (!cData) return null;
    return buildClientStatement(selectedClientForStatement, cData.invoices, cData.opening_balance_usd);
  }, [selectedClientForStatement, clientAccounts]);

  return (
    <div className="p-6 max-w-[1700px] mx-auto space-y-6 min-h-screen bg-slate-50/40">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-indigo-600 text-white font-bold text-[10px] tracking-wider uppercase px-2.5 py-0.5">
              Logistics Accounts System
            </Badge>
            <span className="text-xs text-slate-400 font-medium">Enterprise Ledgers & P&L</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-indigo-600" />
            General Ledger & Vehicle Statements
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Complete accounting for fleet vehicles, cargo shortage deductions, driver recoveries, and client opening/closing balances.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button 
            variant="outline" 
            onClick={() => window.print()}
            className="border-slate-200 font-bold text-slate-700 bg-white hover:bg-slate-50"
          >
            <Printer className="w-4 h-4 mr-2 text-slate-500" /> Print Summary
          </Button>
          <Button 
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm"
            onClick={() => setActiveMainTab("vehicles")}
          >
            <Truck className="w-4 h-4 mr-2" /> Vehicle Statements
          </Button>
        </div>
      </div>

      {/* Top Fleet Financial Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Agreed Revenue vs Realized */}
        <Card className="border-slate-200/90 shadow-xs bg-white relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
          <CardHeader className="p-5 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Agreed Contract Freight</span>
              <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                ${fleetMetrics.grossAgreedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <div className="flex items-center justify-between mt-1 text-xs">
                <span className="text-slate-500 font-medium">Realized to Date:</span>
                <span className="font-bold text-emerald-600">${fleetMetrics.totalRealizedRevenueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Card 2: Cargo Shortages & Evaporation */}
        <Card className="border-slate-200/90 shadow-xs bg-white relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
          <CardHeader className="p-5 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cargo Shortages (Evaporation)</span>
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                <Droplet className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black text-amber-700 tracking-tight">
                -${fleetMetrics.totalShortageLossUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <div className="flex items-center justify-between mt-1 text-xs">
                <span className="text-slate-500 font-medium">Driver Recovered:</span>
                <span className="font-bold text-emerald-600">+${fleetMetrics.totalDriverRecoveredUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Card 3: Fleet Vehicle Operational Expenses */}
        <Card className="border-slate-200/90 shadow-xs bg-white relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500" />
          <CardHeader className="p-5 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Vehicle Expenses Spent</span>
              <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-black text-rose-700 tracking-tight">
                ${fleetMetrics.totalFleetExpensesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <div className="flex items-center justify-between mt-1 text-xs">
                <span className="text-slate-500 font-medium">Across Fleet:</span>
                <span className="font-bold text-slate-700">{fleetMetrics.totalTrips} Dispatched Convoys</span>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Card 4: Net Vehicle Operating Profit */}
        <Card className="border-slate-200/90 shadow-xs bg-white relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <CardHeader className="p-5 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Net Fleet Operating Profit</span>
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                <Calculator className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className={`text-2xl font-black tracking-tight ${fleetMetrics.netFleetProfitUSD >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                ${fleetMetrics.netFleetProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <div className="flex items-center justify-between mt-1 text-xs">
                <span className="text-slate-500 font-medium">Operating Margin:</span>
                <span className="font-bold text-emerald-600">{fleetMetrics.overallMargin}% Net Margin</span>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeMainTab} onValueChange={(v: any) => setActiveMainTab(v)} className="space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-200 pb-3">
          <TabsList className="bg-white border border-slate-200 p-1 shadow-xs h-auto">
            <TabsTrigger value="vouchers" className="py-2 px-4 text-xs font-bold data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Accounting Vouchers (Tally)
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="py-2 px-4 text-xs font-bold data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
              <Truck className="w-4 h-4 mr-1.5" /> Vehicle Trip Statements & Tankers ({vehicleLedgers.length})
            </TabsTrigger>
            <TabsTrigger value="clients" className="py-2 px-4 text-xs font-bold data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
              <Building2 className="w-4 h-4 mr-1.5" /> Client Statements (Opening & Closing Balances)
            </TabsTrigger>
            <TabsTrigger value="journal" className="py-2 px-4 text-xs font-bold data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
              <Scale className="w-4 h-4 mr-1.5" /> Double-Entry General Ledger
            </TabsTrigger>
          </TabsList>

          {/* Search Bar for fast lookup */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <Input 
              placeholder="Search vehicle, driver, client, trip #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 bg-white border-slate-200 text-xs font-semibold"
            />
          </div>
        </div>

        {/* ============================================================== */}
        {/* TAB 0: TALLY ACCOUNTING VOUCHERS (CONTRA, PAYMENT, RECEIPT)    */}
        {/* ============================================================== */}
        <TabsContent value="vouchers" className="space-y-6 mt-0">
          <AccountingVouchersManager onVoucherCreated={() => setTriggerUpdate((p) => p + 1)} />
        </TabsContent>

        {/* ============================================================== */}
        {/* TAB 1: VEHICLE TRIP STATEMENTS & TANKER LEDGERS               */}
        {/* ============================================================== */}
        <TabsContent value="vehicles" className="space-y-6 mt-0">
          {/* Sub Filters for Vehicles */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">Cargo Type:</span>
              <Button 
                variant={filterCargo === "all" ? "default" : "outline"} 
                size="sm" 
                onClick={() => setFilterCargo("all")}
                className={`h-8 text-xs font-semibold ${filterCargo === "all" ? "bg-slate-900" : ""}`}
              >
                All Convoys
              </Button>
              <Button 
                variant={filterCargo === "tanker" ? "default" : "outline"} 
                size="sm" 
                onClick={() => setFilterCargo("tanker")}
                className={`h-8 text-xs font-semibold ${filterCargo === "tanker" ? "bg-amber-600 text-white hover:bg-amber-700" : "text-amber-700 border-amber-200 hover:bg-amber-50"}`}
              >
                <Droplet className="w-3.5 h-3.5 mr-1 text-amber-500" /> Fuel Tankers ({fleetMetrics.countTankers})
              </Button>
              <Button 
                variant={filterCargo === "dry" ? "default" : "outline"} 
                size="sm" 
                onClick={() => setFilterCargo("dry")}
                className={`h-8 text-xs font-semibold ${filterCargo === "dry" ? "bg-slate-900" : ""}`}
              >
                Dry Bulk / Containers
              </Button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">Shortage Filter:</span>
              <Select value={filterShortage} onValueChange={(val: any) => setFilterShortage(val)}>
                <SelectTrigger className="h-8 text-xs font-semibold w-48 bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Trips</SelectItem>
                  <SelectItem value="with_shortage">Trips with Shortage ({fleetMetrics.countShortages})</SelectItem>
                  <SelectItem value="pending_driver">Pending Driver Recovery ({fleetMetrics.countPendingRecovery})</SelectItem>
                  <SelectItem value="recovered">Fully Recovered From Driver</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Vehicle Statements Table */}
          <Card className="border-slate-200/90 shadow-xs bg-white overflow-hidden">
            <CardHeader className="bg-slate-50/80 p-4 border-b border-slate-200 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-indigo-600" />
                  Vehicle Trip Statements & Profitability Ledger
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Agreed contract rate, cargo transit shortage deduction, driver payment recovery, spent trip expenses, and final net profit per vehicle.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs font-bold bg-white text-indigo-700 border-indigo-200">
                {filteredVehicles.length} Vehicles Displayed
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingSheets ? (
                <div className="p-16 text-center text-slate-500 font-medium">
                  <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  Loading vehicle ledgers and trip sheets...
                </div>
              ) : filteredVehicles.length === 0 ? (
                <div className="p-16 text-center text-slate-400 space-y-2">
                  <p className="text-sm font-bold text-slate-600">No vehicle trips found for the selected filter.</p>
                  <p className="text-xs">Try clearing the search box or changing the shortage filter.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600">
                      <TableRow>
                        <TableHead className="py-3 px-4">Vehicle & Driver</TableHead>
                        <TableHead className="py-3 px-4">Trip Ref & Route</TableHead>
                        <TableHead className="py-3 px-4">Client</TableHead>
                        <TableHead className="py-3 px-4 text-right">Agreed Rate</TableHead>
                        <TableHead className="py-3 px-4 text-right">Shortage Loss</TableHead>
                        <TableHead className="py-3 px-4 text-right">Client Share</TableHead>
                        <TableHead className="py-3 px-4 text-right">Driver Paid</TableHead>
                        <TableHead className="py-3 px-4 text-right font-black">Total Realized</TableHead>
                        <TableHead className="py-3 px-4 text-right text-rose-600">Expenses Spent</TableHead>
                        <TableHead className="py-3 px-4 text-right font-black text-emerald-700">Net Profit</TableHead>
                        <TableHead className="py-3 px-4 text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100 text-xs">
                      {filteredVehicles.map((vl: any) => {
                        const hasShortage = vl.shortageLossUSD > 0;
                        const isFullyRecovered = vl.shortageRecovery?.driver_recovery_status === "Fully Recovered";

                        return (
                          <TableRow key={vl.id} className="hover:bg-slate-50/70 transition-colors">
                            {/* Vehicle & Driver */}
                            <TableCell className="py-3.5 px-4 font-semibold">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-slate-900">{vl.vehicle?.vehicle_no || "T980 EPE"}</span>
                                {vl.isTanker ? (
                                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[9px] font-bold px-1.5 py-0 flex items-center gap-0.5">
                                    <Droplet className="w-2.5 h-2.5" /> Tanker
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[9px] text-slate-500 py-0 px-1.5">Cargo</Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 font-medium truncate max-w-[150px] mt-0.5">
                                {vl.driver?.full_name || "Assigned Driver"}
                              </p>
                            </TableCell>

                            {/* Trip Ref & Route */}
                            <TableCell className="py-3.5 px-4">
                              <span className="font-mono font-bold text-indigo-700 text-[11px]">
                                {vl.reference_number || vl.sheet_number || "TS-2026"}
                              </span>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {vl.origin || "Dar"} → {vl.destination || "Kolwezi"}
                              </p>
                            </TableCell>

                            {/* Client */}
                            <TableCell className="py-3.5 px-4 font-medium text-slate-800">
                              {vl.client_name || "Seekers & Korridor"}
                            </TableCell>

                            {/* Agreed Freight (e.g. $700) */}
                            <TableCell className="py-3.5 px-4 text-right font-black text-slate-900">
                              ${vl.agreedFreightUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>

                            {/* Cargo Shortage Loss (e.g. -$200) */}
                            <TableCell className="py-3.5 px-4 text-right font-semibold">
                              {hasShortage ? (
                                <div>
                                  <span className="font-black text-amber-700">
                                    -${vl.shortageLossUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  {vl.shortageRecovery?.shortage_liters > 0 && (
                                    <p className="text-[10px] text-amber-600 font-bold">({vl.shortageRecovery.shortage_liters}L Short)</p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 font-medium">$0.00</span>
                              )}
                            </TableCell>

                            {/* Client Share (e.g. $500) */}
                            <TableCell className="py-3.5 px-4 text-right font-bold text-slate-800">
                              ${vl.netClientInvoicedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>

                            {/* Driver Paid (e.g. $200) */}
                            <TableCell className="py-3.5 px-4 text-right">
                              {hasShortage ? (
                                <div>
                                  <span className={`font-black ${vl.driverPaidUSD > 0 ? "text-emerald-700" : "text-amber-700"}`}>
                                    +${vl.driverPaidUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  <Badge 
                                    className={`text-[9px] font-bold px-1 py-0 block mt-0.5 ${
                                      isFullyRecovered ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                                      vl.driverPaidUSD > 0 ? "bg-orange-100 text-orange-800 border-orange-200" :
                                      "bg-amber-100 text-amber-800 border-amber-200"
                                    }`}
                                  >
                                    {isFullyRecovered ? "Recovered ✓" : vl.driverPaidUSD > 0 ? "Partial" : "Pending ⏳"}
                                  </Badge>
                                </div>
                              ) : (
                                <span className="text-slate-400 font-medium">N/A</span>
                              )}
                            </TableCell>

                            {/* Total Realized ($700) */}
                            <TableCell className="py-3.5 px-4 text-right font-black text-indigo-900 bg-indigo-50/30">
                              ${vl.totalRealizedRevenueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>

                            {/* Expenses Spent */}
                            <TableCell className="py-3.5 px-4 text-right font-bold text-rose-700">
                              -${vl.expensesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>

                            {/* Net Profit */}
                            <TableCell className="py-3.5 px-4 text-right font-black">
                              <span className={vl.netProfitUSD >= 0 ? "text-emerald-700" : "text-rose-700"}>
                                ${vl.netProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <p className="text-[10px] text-slate-400 font-semibold">{vl.profitMarginPct}% Margin</p>
                            </TableCell>

                            {/* Actions */}
                            <TableCell className="py-3.5 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-7 text-[11px] font-bold px-2 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700"
                                  onClick={() => handleOpenVehicleStatement(vl)}
                                >
                                  <FileText className="w-3.5 h-3.5 mr-1 text-indigo-600" /> Statement
                                </Button>
                                {vl.isTanker && (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-7 text-[11px] font-bold px-2 text-amber-800 border-amber-200 hover:bg-amber-50"
                                    onClick={() => handleOpenDriverPayment(vl)}
                                  >
                                    <Droplet className="w-3.5 h-3.5 mr-1 text-amber-600" /> Shortage Pay
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================== */}
        {/* TAB 2: CLIENT STATEMENTS (OPENING & CLOSING BALANCES)          */}
        {/* ============================================================== */}
        <TabsContent value="clients" className="space-y-6 mt-0">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-slate-200/90 shadow-xs bg-white p-5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Opening Balances</span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                ${clientOverallTotals.totalOpening.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-xs text-slate-400 font-medium">Brought forward from prior periods</span>
            </Card>

            <Card className="border-slate-200/90 shadow-xs bg-white p-5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Period Invoiced (+)</span>
              <p className="text-2xl font-black text-indigo-700 mt-1">
                ${clientOverallTotals.totalInvoiced.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-xs text-slate-400 font-medium">All active customer freight billings</span>
            </Card>

            <Card className="border-slate-200/90 shadow-xs bg-white p-5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Payments Received (-)</span>
              <p className="text-2xl font-black text-emerald-700 mt-1">
                ${clientOverallTotals.totalReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-xs text-slate-400 font-medium">Settled cash, bank & receipts</span>
            </Card>

            <Card className="border-slate-200/90 shadow-xs bg-white p-5 border-amber-200 bg-amber-50/20">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Total Closing Balance (=)</span>
              <p className="text-2xl font-black text-amber-900 mt-1">
                ${clientOverallTotals.totalClosing.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-xs text-amber-700 font-bold">Total net outstanding demanded</span>
            </Card>
          </div>

          {/* Client Statement Accounts List */}
          <div className="space-y-4">
            {Object.values(clientAccounts).map((client) => {
              const isSettled = client.closing_balance_usd <= 0.01;

              return (
                <Card key={client.client_name} className="border-slate-200/90 shadow-xs bg-white overflow-hidden">
                  <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Client Identity */}
                    <div className="flex items-center gap-3.5">
                      <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                          {client.client_name}
                          <Badge variant="outline" className="text-[10px] font-bold bg-white text-slate-600">
                            {(() => {
                              const invCount = client.invoices.length;
                              const tripCount = client.invoices.reduce((sum: number, inv: any) => sum + (inv.trips ? inv.trips.length : 1), 0);
                              if (invCount === 0) return "0 Invoices";
                              const invText = invCount === 1 ? "1 Invoice" : `${invCount} Invoices`;
                              return tripCount > invCount ? `${invText} (${tripCount} Trips)` : invText;
                            })()}
                          </Badge>
                        </h3>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                          Accounts Receivable Statement & Running Balance Ledger
                        </p>
                      </div>
                    </div>

                    {/* Middle: Financial Equation (Opening + Invoiced - Received = Closing) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs">
                      {/* Opening Balance */}
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opening Bal</span>
                          <button 
                            className="text-[10px] text-indigo-600 font-bold hover:underline"
                            onClick={() => {
                              setEditingClientName(client.client_name);
                              setOpeningBalanceInput(String(client.opening_balance_usd));
                              setEditOpeningBalanceModalOpen(true);
                            }}
                          >
                            Edit
                          </button>
                        </div>
                        <p className="text-sm font-black text-slate-800 mt-0.5">
                          ${client.opening_balance_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>

                      {/* Invoiced */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Invoiced (+)</span>
                        <p className="text-sm font-black text-slate-900 mt-0.5">
                          ${client.total_invoiced_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>

                      {/* Received */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payments Rec (-)</span>
                        <p className="text-sm font-black text-emerald-700 mt-0.5">
                          ${client.total_received_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>

                      {/* Closing Balance */}
                      <div className="border-l border-slate-200 pl-3">
                        <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Closing Bal (=)</span>
                        <p className={`text-sm font-black mt-0.5 ${isSettled ? "text-emerald-700" : "text-amber-900"}`}>
                          ${client.closing_balance_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                      <Button 
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9"
                        onClick={() => handleOpenClientStatement(client.client_name)}
                      >
                        <FileText className="w-3.5 h-3.5 mr-1.5" /> View Client Statement
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ============================================================== */}
        {/* TAB 3: DOUBLE-ENTRY GENERAL LEDGER JOURNAL                     */}
        {/* ============================================================== */}
        <TabsContent value="journal" className="space-y-6 mt-0">
          <Card className="border-slate-200/90 shadow-xs bg-white">
            <CardHeader className="bg-slate-50/80 p-4 border-b border-slate-200 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Scale className="w-5 h-5 text-indigo-600" /> Double-Entry General Ledger Journal
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Synchronized audit log of all freight billings, customer receipts, fuel/road cash disbursements, and driver shortage settlements.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600">
                  <TableRow>
                    <TableHead className="py-3 px-4">Date</TableHead>
                    <TableHead className="py-3 px-4">Account</TableHead>
                    <TableHead className="py-3 px-4">Reference #</TableHead>
                    <TableHead className="py-3 px-4">Description</TableHead>
                    <TableHead className="py-3 px-4 text-right">Debit ($)</TableHead>
                    <TableHead className="py-3 px-4 text-right">Credit ($)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 text-xs">
                  {vehicleLedgers.slice(0, 15).map((vl: any, idx: number) => {
                    const dt = vl.invoice_date || vl.created_at?.split("T")[0] || "2026-03-20";
                    return (
                      <React.Fragment key={idx}>
                        {/* 1. Accounts Receivable / Freight Revenue */}
                        <TableRow className="hover:bg-slate-50/50">
                          <TableCell className="py-2.5 px-4 font-mono text-slate-500">{dt}</TableCell>
                          <TableCell className="py-2.5 px-4 font-bold text-slate-800">1100 - Accounts Receivable ({vl.client_name})</TableCell>
                          <TableCell className="py-2.5 px-4 font-mono text-indigo-600">{vl.invoice_no || vl.reference_number}</TableCell>
                          <TableCell className="py-2.5 px-4 text-slate-600">Freight Billing - Vehicle {vl.vehicle?.vehicle_no}</TableCell>
                          <TableCell className="py-2.5 px-4 text-right font-black text-slate-900">${vl.netClientInvoicedUSD.toLocaleString()}</TableCell>
                          <TableCell className="py-2.5 px-4 text-right text-slate-300">-</TableCell>
                        </TableRow>

                        {/* 2. Driver Shortage Recovery entry if applicable */}
                        {vl.shortageLossUSD > 0 && (
                          <TableRow className="hover:bg-slate-50/50 bg-amber-50/20">
                            <TableCell className="py-2.5 px-4 font-mono text-slate-500">{dt}</TableCell>
                            <TableCell className="py-2.5 px-4 font-bold text-amber-800">1150 - Driver Shortage Recovery Receivable</TableCell>
                            <TableCell className="py-2.5 px-4 font-mono text-amber-700">DED-{vl.reference_number}</TableCell>
                            <TableCell className="py-2.5 px-4 text-amber-900">
                              Evaporation Loss Recovery from Driver {vl.driver?.full_name} ({vl.shortageRecovery?.shortage_liters || 0}L)
                            </TableCell>
                            <TableCell className="py-2.5 px-4 text-right font-black text-amber-800">${vl.shortageLossUSD.toLocaleString()}</TableCell>
                            <TableCell className="py-2.5 px-4 text-right text-slate-300">-</TableCell>
                          </TableRow>
                        )}

                        {/* 3. Operational Expenses entry */}
                        <TableRow className="hover:bg-slate-50/50">
                          <TableCell className="py-2.5 px-4 font-mono text-slate-500">{dt}</TableCell>
                          <TableCell className="py-2.5 px-4 font-bold text-rose-700">5100 - Fleet Direct Trip Expenses</TableCell>
                          <TableCell className="py-2.5 px-4 font-mono text-slate-600">EXP-{vl.reference_number}</TableCell>
                          <TableCell className="py-2.5 px-4 text-slate-600">Road Budget, Tolls, Escorts, Driver Allowances</TableCell>
                          <TableCell className="py-2.5 px-4 text-right font-black text-rose-700">${vl.expensesUSD.toLocaleString()}</TableCell>
                          <TableCell className="py-2.5 px-4 text-right text-slate-300">-</TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============================================================== */}
      {/* MODAL 1: OFFICIAL VEHICLE TRIP STATEMENT & P&L LEDGER          */}
      {/* ============================================================== */}
      <Dialog open={statementModalOpen} onOpenChange={setStatementModalOpen}>
        <DialogContent className="max-w-[850px] p-0 overflow-hidden bg-white max-h-[90vh] flex flex-col">
          {selectedVehicleTrip && (
            <>
              {/* Header */}
              <div className="bg-slate-900 text-white p-6 border-b border-slate-800 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-indigo-500 text-white font-bold text-[10px] uppercase">Official Trip Statement</Badge>
                    <span className="text-xs text-slate-400">P&L & Accounting Ledger</span>
                  </div>
                  <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                    <Truck className="w-5 h-5 text-indigo-400" />
                    Vehicle Statement: {selectedVehicleTrip.vehicle?.vehicle_no || "T980 EPE"}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Trip Reference: {selectedVehicleTrip.reference_number || selectedVehicleTrip.sheet_number} • Driver: {selectedVehicleTrip.driver?.full_name || "Assigned Driver"}
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.print()}
                  className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-bold"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" /> Print Statement
                </Button>
              </div>

              {/* Scrollable Content */}
              <div className="p-6 space-y-6 overflow-y-auto flex-1 text-slate-800">
                {/* Trip Meta Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Client</span>
                    <p className="font-black text-slate-900 mt-0.5">{selectedVehicleTrip.client_name || "Seekers & Korridor"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Route</span>
                    <p className="font-bold text-slate-800 mt-0.5">{selectedVehicleTrip.origin} → {selectedVehicleTrip.destination}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cargo & Asset</span>
                    <p className="font-bold text-slate-800 mt-0.5">
                      {selectedVehicleTrip.cargo_outbound || "Fuel"} ({selectedVehicleTrip.isTanker ? "Tanker" : "General"})
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</span>
                    <p className="font-bold text-slate-800 mt-0.5">{selectedVehicleTrip.invoice_date || selectedVehicleTrip.created_at?.split("T")[0] || "2026-03-20"}</p>
                  </div>
                </div>

                {/* Section 1: Freight Revenue Breakdown */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-100/70 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-indigo-600" /> I. Freight Revenue & Realization Breakdown
                    </span>
                    <span className="text-[11px] font-bold text-slate-500">Contract # {selectedVehicleTrip.invoice_no || selectedVehicleTrip.reference_number}</span>
                  </div>
                  <div className="p-4 space-y-2.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-slate-600">1. Agreed Base Freight Rate with Client:</span>
                      <span className="font-black text-slate-900">
                        ${selectedVehicleTrip.agreedFreightUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                      </span>
                    </div>

                    {selectedVehicleTrip.shortageLossUSD > 0 && (
                      <div className="flex justify-between items-center text-amber-800 bg-amber-50/80 -mx-2 px-2 py-1.5 rounded-lg border border-amber-200/60">
                        <div>
                          <span className="font-bold">2. Less: Offloading Shortage / Evaporation Loss:</span>
                          <span className="text-[11px] text-amber-700 ml-1.5 font-medium">
                            ({selectedVehicleTrip.shortageRecovery?.shortage_liters || 0} Liters short at offloading)
                          </span>
                        </div>
                        <span className="font-black text-amber-900">
                          -${selectedVehicleTrip.shortageLossUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                      <span className="font-bold text-slate-700">3. Net Client Invoiced Payable:</span>
                      <span className="font-black text-slate-900">
                        ${selectedVehicleTrip.netClientInvoicedUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                      </span>
                    </div>

                    {selectedVehicleTrip.shortageLossUSD > 0 && (
                      <div className="flex justify-between items-center text-emerald-800 bg-emerald-50/80 -mx-2 px-2 py-1.5 rounded-lg border border-emerald-200/60">
                        <div>
                          <span className="font-bold">4. Plus: Driver Shortage Payment Recovery:</span>
                          <span className="text-[11px] text-emerald-700 ml-1.5 font-medium">
                            (Paid by driver {selectedVehicleTrip.driver?.full_name} - {selectedVehicleTrip.shortageRecovery?.driver_payment_method})
                          </span>
                        </div>
                        <span className="font-black text-emerald-900">
                          +${selectedVehicleTrip.driverPaidUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t-2 border-indigo-100 font-bold bg-indigo-50/40 -mx-4 -mb-4 p-4 mt-2">
                      <span className="text-indigo-950 uppercase font-black tracking-tight">TOTAL REALIZED TRIP REVENUE</span>
                      <span className="text-base font-black text-indigo-700">
                        ${selectedVehicleTrip.totalRealizedRevenueUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section 2: Vehicle Operational Expenses Spent */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-100/70 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-rose-600" /> II. Vehicle Operational Expenses Spent
                    </span>
                    <span className="text-[11px] font-bold text-rose-700">Disbursed for this Trip</span>
                  </div>
                  <div className="p-4 space-y-2 text-xs">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>• Road Budget, Tolls & Permits:</span>
                      <span className="font-bold text-slate-900">${(selectedVehicleTrip.expensesUSD * 0.55).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span>• Fuel Allocation & Refueling:</span>
                      <span className="font-bold text-slate-900">${(selectedVehicleTrip.expensesUSD * 0.35).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span>• Driver Allowances & Border Clearances:</span>
                      <span className="font-bold text-slate-900">${(selectedVehicleTrip.expensesUSD * 0.10).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold bg-rose-50/40 -mx-4 -mb-4 p-4 mt-2">
                      <span className="text-rose-950 uppercase font-black tracking-tight">TOTAL OPERATIONAL EXPENSES</span>
                      <span className="text-base font-black text-rose-700">
                        -${selectedVehicleTrip.expensesUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section 3: Final Trip Performance (Net Profit Verdict) */}
                <div className={`p-5 rounded-2xl border-2 flex items-center justify-between ${
                  selectedVehicleTrip.netProfitUSD >= 0 
                    ? "bg-emerald-50/70 border-emerald-300" 
                    : "bg-rose-50/70 border-rose-300"
                }`}>
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500">Trip Operating Profit (Net Margin)</span>
                    <h3 className={`text-3xl font-black mt-1 ${selectedVehicleTrip.netProfitUSD >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      ${selectedVehicleTrip.netProfitUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                    </h3>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      Realized Revenue (${selectedVehicleTrip.totalRealizedRevenueUSD.toLocaleString()}) − Expenses (${selectedVehicleTrip.expensesUSD.toLocaleString()})
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-500 uppercase">Operating Margin</span>
                    <p className="text-2xl font-black text-indigo-700">{selectedVehicleTrip.profitMarginPct}%</p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end">
                <Button variant="outline" onClick={() => setStatementModalOpen(false)}>Close Statement</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 2: RECORD / EDIT DRIVER SHORTAGE PAYMENT                 */}
      {/* ============================================================== */}
      <Dialog open={driverPaymentModalOpen} onOpenChange={setDriverPaymentModalOpen}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                <Droplet className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black text-slate-900">
                  Record Driver Shortage Payment
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Record payment recovered from driver for fuel evaporation or offloading loss.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {editingTripForDriver && (
            <div className="space-y-4 py-2 text-xs">
              {/* Trip Context Card */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Vehicle / Driver:</span>
                  <span className="font-bold text-slate-900">{editingTripForDriver.vehicle?.vehicle_no} • {editingTripForDriver.driver?.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Agreed Freight:</span>
                  <span className="font-bold text-slate-900">${editingTripForDriver.agreedFreightUSD.toLocaleString()} USD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Shortage Loss:</span>
                  <span className="font-bold text-amber-700">-${(editingTripForDriver.shortageLossUSD || 200).toLocaleString()} USD</span>
                </div>
              </div>

              {/* Amount Recovered Input */}
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">Amount Paid / Recovered by Driver (USD)</Label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <Input 
                    type="number"
                    value={driverPaidInput}
                    onChange={(e) => setDriverPaidInput(e.target.value)}
                    placeholder="200.00"
                    className="pl-9 font-bold text-base h-10"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Example: If client was billed $500 instead of $700, enter the $200 recovered from driver to equal $700 total.
                </p>
              </div>

              {/* Payment Method */}
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">Recovery Method</Label>
                <Select value={driverMethodInput} onValueChange={(val: any) => setDriverMethodInput(val)}>
                  <SelectTrigger className="h-10 text-xs font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Allowance Deduction">Deducted from Trip Allowance</SelectItem>
                    <SelectItem value="Cash Deposit">Paid in Cash at Office</SelectItem>
                    <SelectItem value="Bank Transfer">Direct Bank Transfer</SelectItem>
                    <SelectItem value="Mobile Money">Mobile Money (M-Pesa / Airtel Money)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Receipt / Ref No */}
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">Receipt / Voucher Number</Label>
                <Input 
                  value={driverReceiptInput}
                  onChange={(e) => setDriverReceiptInput(e.target.value)}
                  placeholder="REC-DRV-001"
                  className="font-mono text-xs h-10"
                />
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">Payment Date</Label>
                <Input 
                  type="date"
                  value={driverDateInput}
                  onChange={(e) => setDriverDateInput(e.target.value)}
                  className="text-xs h-10"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">Notes / Remarks</Label>
                <Input 
                  value={driverNotesInput}
                  onChange={(e) => setDriverNotesInput(e.target.value)}
                  placeholder="e.g. 150L offload evaporation deduction settled in full"
                  className="text-xs h-10"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDriverPaymentModalOpen(false)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white font-bold" onClick={handleSaveDriverPayment}>
              Save Driver Recovery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 3: CLIENT DETAILED STATEMENT & LEDGER                    */}
      {/* ============================================================== */}
      <Dialog open={clientStatementModalOpen} onOpenChange={setClientStatementModalOpen}>
        <DialogContent className="max-w-[900px] p-0 overflow-hidden bg-white max-h-[90vh] flex flex-col">
          {activeClientStatement && (
            <>
              {/* Header */}
              <div className="bg-slate-900 text-white p-6 border-b border-slate-800 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-indigo-500 text-white font-bold text-[10px] uppercase">Statement of Account</Badge>
                    <span className="text-xs text-slate-400">Chronological Running Balance</span>
                  </div>
                  <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-indigo-400" />
                    {selectedClientForStatement}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Official Customer Statement • Currency: USD
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.print()}
                  className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-bold"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" /> Print Statement
                </Button>
              </div>

              {/* Balances Summary Banner */}
              <div className="grid grid-cols-4 gap-3 bg-slate-50 p-4 border-b border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opening Balance</span>
                  <p className="text-base font-black text-slate-800 mt-0.5">
                    ${activeClientStatement.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Debits (Billed)</span>
                  <p className="text-base font-black text-indigo-700 mt-0.5">
                    ${activeClientStatement.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Credits (Paid)</span>
                  <p className="text-base font-black text-emerald-700 mt-0.5">
                    ${activeClientStatement.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="border-l border-slate-200 pl-3">
                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Closing Balance (=)</span>
                  <p className="text-base font-black text-amber-900 mt-0.5">
                    ${activeClientStatement.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Running Balance Ledger Table */}
              <div className="p-0 overflow-y-auto flex-1">
                <Table>
                  <TableHeader className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600">
                    <TableRow>
                      <TableHead className="py-3 px-4">Date</TableHead>
                      <TableHead className="py-3 px-4">Doc / Ref #</TableHead>
                      <TableHead className="py-3 px-4">Description</TableHead>
                      <TableHead className="py-3 px-4 text-right">Debit (+)</TableHead>
                      <TableHead className="py-3 px-4 text-right">Credit (-)</TableHead>
                      <TableHead className="py-3 px-4 text-right font-black">Running Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100 text-xs">
                    {activeClientStatement.entries.map((entry) => (
                      <TableRow key={entry.id} className="hover:bg-slate-50/70">
                        <TableCell className="py-2.5 px-4 font-mono text-slate-500">{entry.date}</TableCell>
                        <TableCell className="py-2.5 px-4 font-mono font-bold text-indigo-700">{entry.reference_no}</TableCell>
                        <TableCell className="py-2.5 px-4 font-medium text-slate-800">{entry.description}</TableCell>
                        <TableCell className="py-2.5 px-4 text-right font-bold text-slate-900">
                          {entry.debit > 0 ? `$${entry.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}
                        </TableCell>
                        <TableCell className="py-2.5 px-4 text-right font-bold text-emerald-700">
                          {entry.credit > 0 ? `$${entry.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}
                        </TableCell>
                        <TableCell className="py-2.5 px-4 text-right font-black text-slate-900 bg-slate-50/50">
                          ${entry.running_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Footer */}
              <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end">
                <Button variant="outline" onClick={() => setClientStatementModalOpen(false)}>Close Statement</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 4: EDIT CLIENT OPENING BALANCE                           */}
      {/* ============================================================== */}
      <Dialog open={editOpeningBalanceModalOpen} onOpenChange={setEditOpeningBalanceModalOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900">
              Set Opening Balance for {editingClientName}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Set the brought forward balance for this customer prior to current system invoices.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <Label className="font-bold text-slate-700">Opening Balance Amount (USD)</Label>
            <div className="relative">
              <DollarSign className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input 
                type="number"
                value={openingBalanceInput}
                onChange={(e) => setOpeningBalanceInput(e.target.value)}
                placeholder="0.00"
                className="pl-9 font-bold text-base h-10"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              This amount is added to current period invoices to establish the closing balance.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpeningBalanceModalOpen(false)}>Cancel</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold" onClick={handleSaveOpeningBalance}>
              Save Balance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
