import React, { useState, useMemo } from "react";
import { 
  getStoredLedgers, 
  saveLedgers, 
  getStoredVoucherTypes, 
  saveVoucherTypes, 
  getStoredVouchers, 
  saveNewVoucher, 
  deleteVoucher,
  AccountLedger, 
  VoucherTypeConfig, 
  AccountingVoucher,
  AccountCategory,
  VoucherParentType
} from "@/lib/accountingVoucherService";
import { useToast } from "@/hooks/use-toast";
import { fetchCleanLogisticsTripSheets } from "@/lib/logisticsDataService";
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
  FileSpreadsheet, 
  Plus, 
  Trash2, 
  ArrowRightLeft, 
  CreditCard, 
  Receipt, 
  BookOpen, 
  Search, 
  Building2, 
  FolderPlus,
  Scale
} from "lucide-react";

interface AccountingVouchersManagerProps {
  onVoucherCreated?: () => void;
}

export const AccountingVouchersManager: React.FC<AccountingVouchersManagerProps> = ({ onVoucherCreated }) => {
  const { toast } = useToast();

  const [refreshKey, setRefreshKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedParentFilter, setSelectedParentFilter] = useState<string>("ALL");

  // Modals
  const [newVoucherModalOpen, setNewVoucherModalOpen] = useState(false);
  const [manageTypesModalOpen, setManageTypesModalOpen] = useState(false);
  const [manageLedgersModalOpen, setManageLedgersModalOpen] = useState(false);

  // New Voucher Form
  const [voucherParentType, setVoucherParentType] = useState<VoucherParentType>("CONTRA");
  const [selectedTypeCode, setSelectedTypeCode] = useState<string>("CONTRA_MAIN");
  const [voucherDate, setVoucherDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [drLedgerCode, setDrLedgerCode] = useState<string>("1040");
  const [crLedgerCode, setCrLedgerCode] = useState<string>("1020");
  const [voucherAmount, setVoucherAmount] = useState<string>("");
  const [voucherNarration, setVoucherNarration] = useState<string>("");
  const [voucherReference, setVoucherReference] = useState<string>("");
  const [selectedClientName, setSelectedClientName] = useState<string>("");
  const [logisticsClients, setLogisticsClients] = useState<string[]>([]);

  // New Custom Voucher Type Form
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeParent, setNewTypeParent] = useState<VoucherParentType>("CONTRA");
  const [newTypeDesc, setNewTypeDesc] = useState("");

  // New Custom Ledger Form
  const [newLedgerCode, setNewLedgerCode] = useState("");
  const [newLedgerName, setNewLedgerName] = useState("");
  const [newLedgerCategory, setNewLedgerCategory] = useState<AccountCategory>("EXPENSES");
  const [newLedgerSubCat, setNewLedgerSubCat] = useState("Operating Cost");

  // Data Loading
  React.useEffect(() => {
    fetchCleanLogisticsTripSheets().then((sheets) => {
      const set = new Set();
      (sheets || []).forEach((s) => {
        if (s.client_name && s.client_name.trim()) set.add(s.client_name.trim());
        if (s.return_client_name && s.return_client_name.trim()) set.add(s.return_client_name.trim());
      });
      setLogisticsClients(Array.from(set).sort());
    }).catch(() => {});
  }, []);

  const ledgers = useMemo(() => getStoredLedgers(), [refreshKey]);
  const voucherTypes = useMemo(() => getStoredVoucherTypes(), [refreshKey]);
  const vouchers = useMemo(() => getStoredVouchers(), [refreshKey]);

  // Filtered Voucher Types for Current Parent Selection
  const availableVoucherTypes = useMemo(() => {
    return voucherTypes.filter(vt => vt.parent_type === voucherParentType);
  }, [voucherTypes, voucherParentType]);

  // Set default type whenever parent type changes
  const handleParentTypeChange = (pType: VoucherParentType) => {
    setVoucherParentType(pType);
    const matching = voucherTypes.filter(vt => vt.parent_type === pType);
    if (matching.length > 0) {
      setSelectedTypeCode(matching[0].code);
    }

    // Smart default DR / CR ledgers based on Tally standards
    if (pType === "CONTRA") {
      setDrLedgerCode("1040"); // Korridor
      setCrLedgerCode("1020"); // Bank
    } else if (pType === "PAYMENT") {
      setDrLedgerCode("4010"); // Direct Costs
      setCrLedgerCode("1040"); // Korridor Balance or Bank
    } else if (pType === "RECEIPT") {
      setDrLedgerCode("1020"); // Bank
      setCrLedgerCode("1030"); // Customer Receivables
    } else if (pType === "JOURNAL") {
      setDrLedgerCode("1030"); // Customer Receivables
      setCrLedgerCode("3010"); // Freight Revenue
    }
  };

  // Filtered Vouchers List
  const filteredVouchers = useMemo(() => {
    return vouchers.filter(v => {
      const matchesParent = selectedParentFilter === "ALL" || v.parent_type === selectedParentFilter;
      const q = searchTerm.toLowerCase();
      const matchesSearch = 
        v.voucher_no.toLowerCase().includes(q) ||
        v.narration.toLowerCase().includes(q) ||
        (v.reference_no && v.reference_no.toLowerCase().includes(q)) ||
        v.dr_ledger_code.toLowerCase().includes(q) ||
        v.cr_ledger_code.toLowerCase().includes(q);
      return matchesParent && matchesSearch;
    });
  }, [vouchers, selectedParentFilter, searchTerm]);

  // Ledger Lookup Map
  const ledgerMap = useMemo(() => {
    const map: Record<string, AccountLedger> = {};
    ledgers.forEach(l => { map[l.code] = l; });
    return map;
  }, [ledgers]);

  // Handle Save New Voucher
  const handleCreateVoucher = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(voucherAmount);
    if (!amountNum || amountNum <= 0) {
      toast({ variant: "destructive", title: "Invalid Amount", description: "Please enter a valid amount greater than 0." });
      return;
    }
    if (drLedgerCode === crLedgerCode) {
      toast({ variant: "destructive", title: "Contra Error", description: "Debit Ledger and Credit Ledger must be different." });
      return;
    }

    const typeConfig = voucherTypes.find(vt => vt.code === selectedTypeCode);
    const voucherPrefix = voucherParentType === "CONTRA" ? "CNTR" : voucherParentType === "PAYMENT" ? "PMT" : voucherParentType === "RECEIPT" ? "RCP" : "JRN";
    const voucherNo = `${voucherPrefix}-${Date.now().toString().slice(-6)}`;

    saveNewVoucher({
      voucher_no: voucherNo,
      voucher_type_code: selectedTypeCode,
      parent_type: voucherParentType,
      date: voucherDate,
      dr_ledger_code: drLedgerCode,
      cr_ledger_code: crLedgerCode,
      amount: amountNum,
      currency: "USD",
      exchange_rate: 2700,
      narration: voucherNarration || (selectedClientName ? `Payment received from ${selectedClientName}` : `${typeConfig?.name || voucherParentType} voucher`),
      reference_no: voucherReference || undefined
    });

    toast({
      title: "Voucher Saved Successfully",
      description: `Created ${voucherNo} ($${amountNum.toLocaleString()}) Dr: ${ledgerMap[drLedgerCode]?.name || drLedgerCode} | Cr: ${ledgerMap[crLedgerCode]?.name || crLedgerCode}`
    });

    setVoucherAmount("");
    setVoucherNarration("");
    setVoucherReference("");
    setSelectedClientName("");
    setNewVoucherModalOpen(false);
    setRefreshKey(k => k + 1);
    if (onVoucherCreated) onVoucherCreated();
  };

  // Handle Add Custom Voucher Type
  const handleAddVoucherType = () => {
    if (!newTypeName.trim()) return;
    const code = `CUSTOM_${newTypeParent}_${Date.now().toString().slice(-4)}`;
    const updated = [
      ...voucherTypes,
      {
        id: `vt-${Date.now()}`,
        code,
        name: newTypeName.trim(),
        parent_type: newTypeParent,
        description: newTypeDesc || "Custom configured accounting voucher",
        is_system: false
      }
    ];
    saveVoucherTypes(updated);
    setNewTypeName("");
    setNewTypeDesc("");
    setRefreshKey(k => k + 1);
    toast({ title: "Voucher Type Added", description: `Added "${newTypeName}" under ${newTypeParent}.` });
  };

  // Handle Delete Custom Voucher Type
  const handleDeleteVoucherType = (typeId: string, isSystem?: boolean) => {
    if (isSystem) {
      toast({ variant: "destructive", title: "System Type", description: "Standard default voucher types cannot be deleted." });
      return;
    }
    const updated = voucherTypes.filter(vt => vt.id !== typeId);
    saveVoucherTypes(updated);
    setRefreshKey(k => k + 1);
    toast({ title: "Type Removed", description: "Custom voucher type has been deleted." });
  };

  // Handle Add Custom Ledger
  const handleAddLedger = () => {
    if (!newLedgerName.trim() || !newLedgerCode.trim()) {
      toast({ variant: "destructive", title: "Missing Fields", description: "Please enter Ledger Code and Name." });
      return;
    }
    if (ledgers.some(l => l.code === newLedgerCode.trim())) {
      toast({ variant: "destructive", title: "Duplicate Code", description: "Ledger Code already exists." });
      return;
    }

    const updated = [
      ...ledgers,
      {
        id: `led-${Date.now()}`,
        code: newLedgerCode.trim(),
        name: newLedgerName.trim(),
        category: newLedgerCategory,
        sub_category: newLedgerSubCat || newLedgerCategory,
        currency: "USD",
        opening_balance: 0,
        current_balance: 0,
        is_system: false
      }
    ];
    saveLedgers(updated);
    setNewLedgerCode("");
    setNewLedgerName("");
    setRefreshKey(k => k + 1);
    toast({ title: "Ledger Added", description: `Added ledger "${newLedgerName}" (${newLedgerCode}).` });
  };

  // Handle Delete Custom Ledger
  const handleDeleteLedger = (ledgerId: string, isSystem?: boolean) => {
    if (isSystem) {
      toast({ variant: "destructive", title: "System Ledger", description: "Default logistics accounts cannot be deleted to maintain integrity." });
      return;
    }
    const updated = ledgers.filter(l => l.id !== ledgerId);
    saveLedgers(updated);
    setRefreshKey(k => k + 1);
    toast({ title: "Ledger Deleted", description: "Custom ledger deleted successfully." });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2.5">
            <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
            Accounting Vouchers (Tally Standard)
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Contra, Payments, Receipts, and General Journal entries linked directly with Logistics fleet operations.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setManageLedgersModalOpen(true)}
            className="text-xs font-bold border-slate-200"
          >
            <FolderPlus className="w-3.5 h-3.5 mr-1.5 text-slate-600" /> Chart of Accounts
          </Button>

          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setManageTypesModalOpen(true)}
            className="text-xs font-bold border-slate-200"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5 text-slate-600" /> Voucher Types
          </Button>

          <Button 
            size="sm"
            onClick={() => {
              handleParentTypeChange("CONTRA");
              setNewVoucherModalOpen(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Record Voucher (F4-F7)
          </Button>
        </div>
      </div>

      {/* 4 Summary Cards for the Voucher Categories */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Contra */}
        <Card 
          onClick={() => { setSelectedParentFilter("CONTRA"); }}
          className={`cursor-pointer transition-all border-slate-200 hover:border-blue-400 ${selectedParentFilter === "CONTRA" ? "ring-2 ring-blue-500 bg-blue-50/20" : "bg-white"}`}
        >
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Contra (F4)</span>
            <div className="p-1.5 rounded-md bg-blue-50 text-blue-600">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-lg font-black text-slate-900">
              {voucherTypes.filter(v => v.parent_type === "CONTRA").length} Types Configured
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Cash ↔ Bank & Korridor Transfers
            </p>
          </CardContent>
        </Card>

        {/* Payments */}
        <Card 
          onClick={() => { setSelectedParentFilter("PAYMENT"); }}
          className={`cursor-pointer transition-all border-slate-200 hover:border-rose-400 ${selectedParentFilter === "PAYMENT" ? "ring-2 ring-rose-500 bg-rose-50/20" : "bg-white"}`}
        >
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Payments (F5)</span>
            <div className="p-1.5 rounded-md bg-rose-50 text-rose-600">
              <CreditCard className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-lg font-black text-slate-900">
              {voucherTypes.filter(v => v.parent_type === "PAYMENT").length} Types Configured
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              General & Korridor Disbursements
            </p>
          </CardContent>
        </Card>

        {/* Receipts */}
        <Card 
          onClick={() => { setSelectedParentFilter("RECEIPT"); }}
          className={`cursor-pointer transition-all border-slate-200 hover:border-emerald-400 ${selectedParentFilter === "RECEIPT" ? "ring-2 ring-emerald-500 bg-emerald-50/20" : "bg-white"}`}
        >
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Receipts (F6)</span>
            <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-600">
              <Receipt className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-lg font-black text-slate-900">
              {voucherTypes.filter(v => v.parent_type === "RECEIPT").length} Types Configured
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Bank Wire & Cash Receipts
            </p>
          </CardContent>
        </Card>

        {/* General Journal */}
        <Card 
          onClick={() => { setSelectedParentFilter("JOURNAL"); }}
          className={`cursor-pointer transition-all border-slate-200 hover:border-purple-400 ${selectedParentFilter === "JOURNAL" ? "ring-2 ring-purple-500 bg-purple-50/20" : "bg-white"}`}
        >
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Journal (F7)</span>
            <div className="p-1.5 rounded-md bg-purple-50 text-purple-600">
              <BookOpen className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1">
            <div className="text-lg font-black text-slate-900">
              {voucherTypes.filter(v => v.parent_type === "JOURNAL").length} Types Configured
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Adjustments & Freight Invoices
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Vouchers Table */}
      <Card className="border-slate-200 bg-white overflow-hidden shadow-xs">
        <CardHeader className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-black text-slate-900">Voucher Transactions Ledger</CardTitle>
            <Badge variant="outline" className="text-[10px] font-bold">
              {filteredVouchers.length} Total Entries
            </Badge>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative w-48 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <Input 
                placeholder="Search voucher #, ref..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs font-semibold bg-white border-slate-200"
              />
            </div>

            <Select value={selectedParentFilter} onValueChange={(v: string) => setSelectedParentFilter(v)}>
              <SelectTrigger className="h-8 text-xs font-bold w-36 bg-white border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                <SelectItem value="CONTRA">Contra Vouchers</SelectItem>
                <SelectItem value="PAYMENT">Payment Vouchers</SelectItem>
                <SelectItem value="RECEIPT">Receipt Vouchers</SelectItem>
                <SelectItem value="JOURNAL">Journal Vouchers</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-100/70 text-[11px] font-black uppercase text-slate-600">
              <TableRow>
                <TableHead className="py-2.5 px-4">Date</TableHead>
                <TableHead className="py-2.5 px-4">Voucher No</TableHead>
                <TableHead className="py-2.5 px-4">Type</TableHead>
                <TableHead className="py-2.5 px-4">Debit (Dr) Account</TableHead>
                <TableHead className="py-2.5 px-4">Credit (Cr) Account</TableHead>
                <TableHead className="py-2.5 px-4">Narration / Remarks</TableHead>
                <TableHead className="py-2.5 px-4 text-right">Amount (USD)</TableHead>
                <TableHead className="py-2.5 px-4 text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100 text-xs">
              {filteredVouchers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-slate-400 font-medium">
                    No vouchers recorded yet. Click "Record Voucher" to create your first entry.
                  </TableCell>
                </TableRow>
              ) : (
                filteredVouchers.map((v) => {
                  const typeName = voucherTypes.find(t => t.code === v.voucher_type_code)?.name || v.parent_type;
                  const drName = ledgerMap[v.dr_ledger_code]?.name || v.dr_ledger_code;
                  const crName = ledgerMap[v.cr_ledger_code]?.name || v.cr_ledger_code;

                  return (
                    <TableRow key={v.id} className="hover:bg-slate-50/60">
                      <TableCell className="py-2.5 px-4 font-mono text-slate-500">{v.date}</TableCell>
                      <TableCell className="py-2.5 px-4 font-mono font-bold text-indigo-700">{v.voucher_no}</TableCell>
                      <TableCell className="py-2.5 px-4">
                        <Badge variant="outline" className={`text-[10px] font-bold ${
                          v.parent_type === "CONTRA" ? "text-blue-700 border-blue-200 bg-blue-50/50" :
                          v.parent_type === "PAYMENT" ? "text-rose-700 border-rose-200 bg-rose-50/50" :
                          v.parent_type === "RECEIPT" ? "text-emerald-700 border-emerald-200 bg-emerald-50/50" :
                          "text-purple-700 border-purple-200 bg-purple-50/50"
                        }`}>
                          {typeName}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 px-4 font-bold text-slate-800">
                        <span className="text-[10px] text-slate-400 mr-1">Dr:</span> {drName}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 font-bold text-slate-600">
                        <span className="text-[10px] text-slate-400 mr-1">Cr:</span> {crName}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-slate-600 max-w-[240px] truncate" title={v.narration}>
                        {v.narration}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-black text-slate-900">
                        ${v.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-center">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            if (confirm(`Delete voucher ${v.voucher_no}?`)) {
                              deleteVoucher(v.id);
                              setRefreshKey(k => k + 1);
                              toast({ title: "Voucher Deleted", description: `Removed ${v.voucher_no}` });
                            }
                          }}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ============================================================== */}
      {/* MODAL 1: CREATE NEW ACCOUNTING VOUCHER (TALLY F4-F7)          */}
      {/* ============================================================== */}
      <Dialog open={newVoucherModalOpen} onOpenChange={setNewVoucherModalOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-600" />
              New Accounting Voucher
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Balanced double-entry journal entry across Chart of Accounts.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateVoucher} className="space-y-4 py-2">
            {/* Step 1: Parent Category Buttons (Contra, Payment, Receipt, Journal) */}
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleParentTypeChange("CONTRA")}
                className={`py-2 px-1 text-center rounded-lg border text-xs font-bold transition-all ${
                  voucherParentType === "CONTRA" ? "bg-blue-600 text-white border-blue-600 shadow-xs" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Contra (F4)
              </button>
              <button
                type="button"
                onClick={() => handleParentTypeChange("PAYMENT")}
                className={`py-2 px-1 text-center rounded-lg border text-xs font-bold transition-all ${
                  voucherParentType === "PAYMENT" ? "bg-rose-600 text-white border-rose-600 shadow-xs" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Payment (F5)
              </button>
              <button
                type="button"
                onClick={() => handleParentTypeChange("RECEIPT")}
                className={`py-2 px-1 text-center rounded-lg border text-xs font-bold transition-all ${
                  voucherParentType === "RECEIPT" ? "bg-emerald-600 text-white border-emerald-600 shadow-xs" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Receipt (F6)
              </button>
              <button
                type="button"
                onClick={() => handleParentTypeChange("JOURNAL")}
                className={`py-2 px-1 text-center rounded-lg border text-xs font-bold transition-all ${
                  voucherParentType === "JOURNAL" ? "bg-purple-600 text-white border-purple-600 shadow-xs" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Journal (F7)
              </button>
            </div>

            {/* Step 2: Specific Sub-Type selection */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">Voucher Type *</Label>
                <Select value={selectedTypeCode} onValueChange={(v: string) => setSelectedTypeCode(v)}>
                  <SelectTrigger className="h-9 text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableVoucherTypes.map(vt => (
                      <SelectItem key={vt.code} value={vt.code}>
                        {vt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">Voucher Date *</Label>
                <Input 
                  type="date"
                  value={voucherDate}
                  onChange={(e) => setVoucherDate(e.target.value)}
                  className="h-9 text-xs font-medium"
                  required
                />
              </div>
            </div>

            {/* Step 3: Debit (Dr) and Credit (Cr) Ledgers */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <Label className="text-[11px] font-bold text-indigo-700">Debit (Dr) Account *</Label>
                  <span className="text-[10px] text-slate-400 font-medium">Money In / Receiving Account</span>
                </div>
                <Select value={drLedgerCode} onValueChange={(v: string) => setDrLedgerCode(v)}>
                  <SelectTrigger className="h-9 text-xs font-bold bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ledgers.map(l => (
                      <SelectItem key={l.code} value={l.code}>
                        [{l.code}] {l.name} ({l.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <Label className="text-[11px] font-bold text-slate-700">Credit (Cr) Account *</Label>
                  <span className="text-[10px] text-slate-400 font-medium">Money Out / Giving Account</span>
                </div>
                <Select value={crLedgerCode} onValueChange={(v: string) => setCrLedgerCode(v)}>
                  <SelectTrigger className="h-9 text-xs font-bold bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ledgers.map(l => (
                      <SelectItem key={l.code} value={l.code}>
                        [{l.code}] {l.name} ({l.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Client / Customer Selector when Customer Receivables [1030] is selected */}
        {(crLedgerCode === "1030" || drLedgerCode === "1030") && (
          <div className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 space-y-1.5 transition-all">
            <div className="flex justify-between items-center">
              <Label className="text-[11px] font-bold text-emerald-900 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                Select Logistics Client / Customer *
              </Label>
              <span className="text-[10px] text-emerald-700 font-semibold">Synced from Logistics</span>
            </div>
            <Select value={selectedClientName} onValueChange={(val) => {
              setSelectedClientName(val);
              if (val && !voucherNarration) {
                setVoucherNarration("Payment received from " + val);
              }
            }}>
              <SelectTrigger className="h-9 text-xs font-bold bg-white border-emerald-300">
                <SelectValue placeholder="-- Pick Client / Customer --" />
              </SelectTrigger>
              <SelectContent>
                {logisticsClients.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs font-medium">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Step 4: Amount & Reference */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">Amount (USD) *</Label>
                <Input 
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={voucherAmount}
                  onChange={(e) => setVoucherAmount(e.target.value)}
                  className="h-9 text-sm font-black text-indigo-700"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-700">Ref / Trip / Invoice #</Label>
                <Input 
                  placeholder="e.g. TR-2026-001 or INV-01"
                  value={voucherReference}
                  onChange={(e) => setVoucherReference(e.target.value)}
                  className="h-9 text-xs font-medium"
                />
              </div>
            </div>

            {/* Step 5: Narration */}
            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-slate-700">Narration / Memo</Label>
              <Input 
                placeholder="Brief explanation of this voucher transaction..."
                value={voucherNarration}
                onChange={(e) => setVoucherNarration(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setNewVoucherModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                Save Voucher
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 2: MANAGE & ADD VOUCHER TYPES                           */}
      {/* ============================================================== */}
      <Dialog open={manageTypesModalOpen} onOpenChange={setManageTypesModalOpen}>
        <DialogContent className="max-w-[650px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
              Configure Voucher Types
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Add new custom voucher types under Contra, Payment, Receipt, or Journal.
            </DialogDescription>
          </DialogHeader>

          {/* Add New Type Bar */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <span className="text-xs font-black text-slate-800 uppercase tracking-tight">Add New Voucher Type</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px] font-bold text-slate-600">Category Group</Label>
                <Select value={newTypeParent} onValueChange={(v: any) => setNewTypeParent(v)}>
                  <SelectTrigger className="h-8 text-xs font-bold bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CONTRA">Contra</SelectItem>
                    <SelectItem value="PAYMENT">Payment</SelectItem>
                    <SelectItem value="RECEIPT">Receipt</SelectItem>
                    <SelectItem value="JOURNAL">General Journal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] font-bold text-slate-600">Voucher Type Name</Label>
                <Input 
                  placeholder="e.g. Fuel Card Reload"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="h-8 text-xs bg-white font-medium"
                />
              </div>

              <div className="flex items-end">
                <Button 
                  type="button" 
                  onClick={handleAddVoucherType}
                  className="h-8 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Type
                </Button>
              </div>
            </div>
          </div>

          {/* Types List */}
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl">
            <Table>
              <TableHeader className="bg-slate-100/70 text-[10px] font-black uppercase text-slate-600">
                <TableRow>
                  <TableHead className="py-2 px-3">Type Name</TableHead>
                  <TableHead className="py-2 px-3">Category</TableHead>
                  <TableHead className="py-2 px-3">Description</TableHead>
                  <TableHead className="py-2 px-3 text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs divide-y divide-slate-100">
                {voucherTypes.map((vt) => (
                  <TableRow key={vt.id}>
                    <TableCell className="py-2 px-3 font-bold text-slate-800">{vt.name}</TableCell>
                    <TableCell className="py-2 px-3">
                      <Badge variant="outline" className="text-[9px] font-bold">
                        {vt.parent_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 px-3 text-slate-500 text-[11px]">{vt.description || "—"}</TableCell>
                    <TableCell className="py-2 px-3 text-center">
                      {vt.is_system ? (
                        <span className="text-[10px] text-slate-400 font-semibold italic">Default</span>
                      ) : (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteVoucherType(vt.id, vt.is_system)}
                          className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageTypesModalOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 3: MANAGE CHART OF ACCOUNTS & LEDGERS                   */}
      {/* ============================================================== */}
      <Dialog open={manageLedgersModalOpen} onOpenChange={setManageLedgersModalOpen}>
        <DialogContent className="max-w-[700px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              Chart of Accounts (Ledgers)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Manage your Assets, Liabilities, Income, and Expense ledgers.
            </DialogDescription>
          </DialogHeader>

          {/* Add Ledger Form */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <span className="text-xs font-black text-slate-800 uppercase tracking-tight">Add New Ledger Account</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <Label className="text-[10px] font-bold text-slate-600">Category</Label>
                <Select value={newLedgerCategory} onValueChange={(v: any) => setNewLedgerCategory(v)}>
                  <SelectTrigger className="h-8 text-xs font-bold bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ASSETS">Assets</SelectItem>
                    <SelectItem value="LIABILITIES">Liabilities</SelectItem>
                    <SelectItem value="INCOME">Income / Revenue</SelectItem>
                    <SelectItem value="EXPENSES">Expenses / Costs</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] font-bold text-slate-600">Account Code</Label>
                <Input 
                  placeholder="e.g. 4040"
                  value={newLedgerCode}
                  onChange={(e) => setNewLedgerCode(e.target.value)}
                  className="h-8 text-xs bg-white font-mono font-bold"
                />
              </div>

              <div>
                <Label className="text-[10px] font-bold text-slate-600">Account Name</Label>
                <Input 
                  placeholder="e.g. Workshop Spares"
                  value={newLedgerName}
                  onChange={(e) => setNewLedgerName(e.target.value)}
                  className="h-8 text-xs bg-white font-medium"
                />
              </div>

              <div className="flex items-end">
                <Button 
                  type="button" 
                  onClick={handleAddLedger}
                  className="h-8 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Ledger
                </Button>
              </div>
            </div>
          </div>

          {/* Ledgers Table */}
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl">
            <Table>
              <TableHeader className="bg-slate-100/70 text-[10px] font-black uppercase text-slate-600">
                <TableRow>
                  <TableHead className="py-2 px-3">Code</TableHead>
                  <TableHead className="py-2 px-3">Account Name</TableHead>
                  <TableHead className="py-2 px-3">Category</TableHead>
                  <TableHead className="py-2 px-3">Sub-Group</TableHead>
                  <TableHead className="py-2 px-3 text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs divide-y divide-slate-100">
                {ledgers.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="py-2 px-3 font-mono font-bold text-indigo-700">{l.code}</TableCell>
                    <TableCell className="py-2 px-3 font-bold text-slate-800">{l.name}</TableCell>
                    <TableCell className="py-2 px-3">
                      <Badge variant="outline" className={`text-[9px] font-bold ${
                        l.category === "ASSETS" ? "text-emerald-700 bg-emerald-50/50 border-emerald-200" :
                        l.category === "LIABILITIES" ? "text-amber-700 bg-amber-50/50 border-amber-200" :
                        l.category === "INCOME" ? "text-blue-700 bg-blue-50/50 border-blue-200" :
                        "text-rose-700 bg-rose-50/50 border-rose-200"
                      }`}>
                        {l.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 px-3 text-slate-500 text-[11px]">{l.sub_category}</TableCell>
                    <TableCell className="py-2 px-3 text-center">
                      {l.is_system ? (
                        <span className="text-[10px] text-slate-400 font-semibold italic">Standard</span>
                      ) : (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteLedger(l.id, l.is_system)}
                          className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageLedgersModalOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
