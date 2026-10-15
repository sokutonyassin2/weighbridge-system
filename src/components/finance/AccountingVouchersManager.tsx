import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  getStoredLedgers, 
  saveLedgers, 
  getStoredVoucherTypes, 
  saveVoucherTypes, 
  saveNewVoucher, 
  deleteVoucher,
  fetchAccountingVouchers,
  fetchAccountingBanks,
  saveNewBank,
  updateBankOpeningBalance,
  deleteBank,
  fetchAccountingSuppliers,
  saveNewSupplier,
  deleteSupplier,
  AccountLedger, 
  VoucherTypeConfig, 
  AccountingVoucher,
  AccountingBank,
  AccountingSupplier,
  AccountCategory,
  VoucherParentType,
  DEFAULT_LEDGERS,
  DEFAULT_VOUCHER_TYPES
} from "@/lib/accountingVoucherService";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
  Briefcase, 
  FolderPlus,
  Scale,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  DollarSign,
  TrendingDown,
  TrendingUp,
  X,
  Sparkles,
  Copy,
  Check,
  Edit,
  Database,
  RefreshCw
} from "lucide-react";

interface AccountingVouchersManagerProps {
  onVoucherCreated?: () => void;
}

export const AccountingVouchersManager: React.FC<AccountingVouchersManagerProps> = ({ onVoucherCreated }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL query parameters for dedicated view routing
  const paramCategory = searchParams.get("category");
  const paramSub = searchParams.get("sub");

  const [refreshKey, setRefreshKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedParentFilter, setSelectedParentFilter] = useState<string>("ALL");

  // Modals
  const [newVoucherModalOpen, setNewVoucherModalOpen] = useState(false);
  const [manageTypesModalOpen, setManageTypesModalOpen] = useState(false);
  const [manageLedgersModalOpen, setManageLedgersModalOpen] = useState(false);
  const [manageBanksModalOpen, setManageBanksModalOpen] = useState(false);
  const [manageSuppliersModalOpen, setManageSuppliersModalOpen] = useState(false);
  const [sqlMigrationModalOpen, setSqlMigrationModalOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Bank Opening Balance Modal
  const [editingBankOpening, setEditingBankOpening] = useState<AccountingBank | null>(null);
  const [editBankOpeningModalOpen, setEditBankOpeningModalOpen] = useState(false);
  const [bankOpeningInput, setBankOpeningInput] = useState("");

  // Active filter for specific bank or specific supplier inside dedicated views
  const [activeSelectedBank, setActiveSelectedBank] = useState<string | null>(null);
  const [activeSelectedSupplier, setActiveSelectedSupplier] = useState<string | null>(null);

  // Dedicated section top inline inputs (separate from modal inputs)
  const [dedicatedInlineBankInput, setDedicatedInlineBankInput] = useState<string>("");
  const [dedicatedInlineSupplierInput, setDedicatedInlineSupplierInput] = useState<string>("");

  // Confirmation dialog state for safe deletions
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {}
  });

  // Live Supabase Queries
  const { 
    data: dbVouchers, 
    refetch: refetchVouchers, 
    isLoading: isVouchersLoading,
    isFetching: isVouchersFetching 
  } = useQuery<AccountingVoucher[]>({
    queryKey: ["accounting-vouchers"],
    queryFn: fetchAccountingVouchers,
    staleTime: 5000,
  });

  const { 
    data: dbBanks, 
    refetch: refetchBanks 
  } = useQuery<AccountingBank[]>({
    queryKey: ["accounting-banks"],
    queryFn: fetchAccountingBanks,
    staleTime: 10000,
  });

  const { 
    data: dbSuppliers, 
    refetch: refetchSuppliers 
  } = useQuery<AccountingSupplier[]>({
    queryKey: ["accounting-suppliers"],
    queryFn: fetchAccountingSuppliers,
    staleTime: 10000,
  });

  const vouchers = useMemo(() => dbVouchers || [], [dbVouchers]);
  const companyBankObjects = useMemo(() => dbBanks || [], [dbBanks]);
  const companyBanks = useMemo(() => companyBankObjects.map(b => b.name), [companyBankObjects]);
  const companySupplierObjects = useMemo(() => dbSuppliers || [], [dbSuppliers]);
  const companySuppliers = useMemo(() => companySupplierObjects.map(s => s.name), [companySupplierObjects]);

  // New Voucher Form State
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
  const [selectedSupplierName, setSelectedSupplierName] = useState<string>("");
  const [newSupplierInput, setNewSupplierInput] = useState<string>("");
  const [showAddSupplierBox, setShowAddSupplierBox] = useState<boolean>(false);

  // Selected Bank in Voucher Form
  const [selectedBankName, setSelectedBankName] = useState<string>("");
  const [newBankInput, setNewBankInput] = useState<string>("");
  const [showAddBankBox, setShowAddBankBox] = useState<boolean>(false);

  // New Custom Voucher Type Form
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeParent, setNewTypeParent] = useState<VoucherParentType>("CONTRA");
  const [newTypeDesc, setNewTypeDesc] = useState("");

  // New Custom Ledger Form
  const [newLedgerCode, setNewLedgerCode] = useState("");
  const [newLedgerName, setNewLedgerName] = useState("");
  const [newLedgerCategory, setNewLedgerCategory] = useState<AccountCategory>("EXPENSES");
  const [newLedgerSubCat, setNewLedgerSubCat] = useState("Operating Cost");

  // Load clients from logistics trip sheets
  useEffect(() => {
    fetchCleanLogisticsTripSheets().then((sheets) => {
      const set = new Set<string>();
      (sheets || []).forEach((s) => {
        if (s.client_name && s.client_name.trim()) set.add(s.client_name.trim());
        if (s.return_client_name && s.return_client_name.trim()) set.add(s.return_client_name.trim());
      });
      setLogisticsClients(Array.from(set).sort());
    }).catch(() => {});
  }, []);

  const ledgers = useMemo(() => getStoredLedgers(), [refreshKey]);
  const voucherTypes = useMemo(() => getStoredVoucherTypes(), [refreshKey]);

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

  // Helper mapping to determine if an account section is active
  const dedicatedCategoryInfo = useMemo(() => {
    if (!paramSub && !paramCategory) return null;
    const sub = paramSub || "";
    const cat = paramCategory || "";

    if (sub.toLowerCase() === "cash" || (cat === "ASSETS" && sub === "Cash")) {
      return {
        key: "cash",
        title: "Cash in Hand Ledger",
        categoryTitle: "Assets",
        ledgerCode: "1010",
        description: "Official Cash Book & Physical Cash Disbursement / Deposit transactions",
        icon: Wallet,
        colorTheme: "emerald",
        defaultVoucherType: "REC_CASH" as const,
        defaultParentType: "RECEIPT" as const
      };
    }
    if (sub.toLowerCase() === "bank" || (cat === "ASSETS" && sub === "Bank")) {
      return {
        key: "bank",
        title: "Bank Accounts Ledger",
        categoryTitle: "Assets",
        ledgerCode: "1020",
        description: "CRDB, NMB, Wire Transfers, TTs, and Bank settlements",
        icon: CreditCard,
        colorTheme: "blue",
        defaultVoucherType: "REC_BANK" as const,
        defaultParentType: "RECEIPT" as const
      };
    }
    if (sub.toLowerCase() === "payables" || (cat === "LIABILITIES" && sub === "Payables")) {
      return {
        key: "payables",
        title: "Supplier & Vendor Payables",
        categoryTitle: "Liabilities",
        ledgerCode: "2010",
        description: "Fuel suppliers, port authorities, clearance agents, spares, and vendor bills",
        icon: Briefcase,
        colorTheme: "amber",
        defaultVoucherType: "PAY_GENERAL" as const,
        defaultParentType: "PAYMENT" as const
      };
    }
    if (sub.toLowerCase() === "localfreight" || (cat === "INCOME" && sub === "LocalFreight")) {
      return {
        key: "localfreight",
        title: "Local Freight Account",
        categoryTitle: "Income / Revenues",
        ledgerCode: "3020",
        description: "Local haulage, inland cargo runs, and local invoicing income",
        icon: BookOpen,
        colorTheme: "emerald",
        defaultVoucherType: "JOURNAL_GEN" as const,
        defaultParentType: "JOURNAL" as const
      };
    }
    if (sub.toLowerCase() === "directcosts" || (cat === "EXPENSES" && sub === "DirectCosts")) {
      return {
        key: "directcosts",
        title: "Direct Costs Ledger",
        categoryTitle: "Expenses / Costs",
        ledgerCode: "4010",
        description: "Fuel, road tolls, driver trip allowances, and border clearance expenses",
        icon: DollarSign,
        colorTheme: "rose",
        defaultVoucherType: "PAY_KORRIDOR" as const,
        defaultParentType: "PAYMENT" as const
      };
    }
    if (sub.toLowerCase() === "financecosts" || (cat === "EXPENSES" && sub === "FinanceCosts")) {
      return {
        key: "financecosts",
        title: "Finance & Other Costs",
        categoryTitle: "Expenses / Costs",
        ledgerCode: "4030",
        description: "Bank fees, forex losses, interest, and non-operational costs",
        icon: Scale,
        colorTheme: "purple",
        defaultVoucherType: "PAY_GENERAL" as const,
        defaultParentType: "PAYMENT" as const
      };
    }
    return null;
  }, [paramCategory, paramSub]);

  // Ledger Lookup Map
  const ledgerMap = useMemo(() => {
    const map: Record<string, AccountLedger> = {};
    ledgers.forEach(l => { map[l.code] = l; });
    return map;
  }, [ledgers]);

  // Dedicated Ledger Transactions & Balance
  const dedicatedLedgerData = useMemo(() => {
    if (!dedicatedCategoryInfo) return null;
    const targetCode = dedicatedCategoryInfo.ledgerCode;
    const targetLedger = ledgerMap[targetCode];

    // Filter all vouchers touching this ledger
    const relevantVouchers = vouchers.filter(v => {
      const isTargetDr = v.dr_ledger_code === targetCode;
      const isTargetCr = v.cr_ledger_code === targetCode;
      return isTargetDr || isTargetCr;
    });

    let totalDr = 0;
    let totalCr = 0;

    const rows = relevantVouchers.map(v => {
      const isDr = v.dr_ledger_code === targetCode;
      const isCr = v.cr_ledger_code === targetCode;
      const debitAmt = isDr ? v.amount : 0;
      const creditAmt = isCr ? v.amount : 0;
      totalDr += debitAmt;
      totalCr += creditAmt;

      const opposingCode = isDr ? v.cr_ledger_code : v.dr_ledger_code;
      const opposingName = ledgerMap[opposingCode]?.name || opposingCode;

      return {
        ...v,
        isDr,
        isCr,
        debitAmt,
        creditAmt,
        opposingCode,
        opposingName
      };
    });

    // If a specific bank or supplier is clicked in the cards, filter to that entity!
    const effectiveRows = rows.filter(r => {
      if (dedicatedCategoryInfo.key === "bank" && activeSelectedBank) {
        const b = activeSelectedBank.toLowerCase();
        return (
          (r.bank_name && r.bank_name.toLowerCase() === b) ||
          r.narration.toLowerCase().includes(b) ||
          (r.reference_no && r.reference_no.toLowerCase().includes(b))
        );
      }
      if (dedicatedCategoryInfo.key === "payables" && activeSelectedSupplier) {
        const s = activeSelectedSupplier.toLowerCase();
        return (
          (r.supplier_name && r.supplier_name.toLowerCase() === s) ||
          r.narration.toLowerCase().includes(s) ||
          (r.reference_no && r.reference_no.toLowerCase().includes(s))
        );
      }
      return true;
    });

    let displayDr = 0;
    let displayCr = 0;
    effectiveRows.forEach(r => {
      displayDr += r.debitAmt;
      displayCr += r.creditAmt;
    });

    // Opening Balance
    const selectedBankObj = companyBankObjects.find(b => b.name === activeSelectedBank);
    const bankOpening = selectedBankObj ? (selectedBankObj.opening_balance || 0) : 0;
    const opening = activeSelectedBank ? bankOpening : (targetLedger?.opening_balance || 0);

    // Current balance: for ASSETS/EXPENSES Normal Balance is Debit (Debit - Credit).
    // For LIABILITIES/INCOME Normal Balance is Credit (Credit - Debit).
    const isAssetOrExpense = targetLedger?.category === "ASSETS" || targetLedger?.category === "EXPENSES";
    const netBalance = isAssetOrExpense 
      ? (activeSelectedBank ? bankOpening + displayDr - displayCr : (activeSelectedSupplier ? displayDr - displayCr : opening + totalDr - totalCr))
      : (activeSelectedBank || activeSelectedSupplier ? displayCr - displayDr : opening + totalCr - totalDr);

    return {
      targetLedger,
      rows: effectiveRows,
      allRows: rows,
      totalDr: activeSelectedBank || activeSelectedSupplier ? displayDr : totalDr,
      totalCr: activeSelectedBank || activeSelectedSupplier ? displayCr : totalCr,
      opening,
      netBalance,
      isAssetOrExpense
    };
  }, [dedicatedCategoryInfo, vouchers, ledgerMap, activeSelectedBank, activeSelectedSupplier, companyBankObjects]);

  // Live calculated balance map for all corporate banks in Supabase
  const bankBalancesMap = useMemo(() => {
    const map: Record<string, {
      id: string;
      name: string;
      account_number?: string;
      currency: string;
      opening_balance: number;
      drTotal: number;
      crTotal: number;
      netBalance: number;
      vouchersCount: number;
    }> = {};

    companyBankObjects.forEach(bank => {
      const bLower = bank.name.toLowerCase();
      const relevant = vouchers.filter(v => {
        const explicit = (v.bank_name || "").toLowerCase();
        const nar = (v.narration || "").toLowerCase();
        const ref = (v.reference_no || "").toLowerCase();
        return explicit === bLower || nar.includes(bLower) || ref.includes(bLower);
      });

      let dr = 0;
      let cr = 0;
      relevant.forEach(v => {
        if (v.dr_ledger_code === "1020") dr += (v.amount || 0);
        if (v.cr_ledger_code === "1020") cr += (v.amount || 0);
      });

      const opening = bank.opening_balance || 0;
      const net = opening + dr - cr;

      map[bank.name] = {
        id: bank.id,
        name: bank.name,
        account_number: bank.account_number,
        currency: bank.currency || "USD",
        opening_balance: opening,
        drTotal: dr,
        crTotal: cr,
        netBalance: net,
        vouchersCount: relevant.length,
      };
    });

    return map;
  }, [companyBankObjects, vouchers]);

  // Filtered Vouchers List for general vouchers view
  const filteredVouchers = useMemo(() => {
    return vouchers.filter(v => {
      const matchesParent = selectedParentFilter === "ALL" || v.parent_type === selectedParentFilter;
      const q = searchTerm.toLowerCase();
      const matchesSearch = 
        v.voucher_no.toLowerCase().includes(q) ||
        v.narration.toLowerCase().includes(q) ||
        (v.bank_name && v.bank_name.toLowerCase().includes(q)) ||
        (v.supplier_name && v.supplier_name.toLowerCase().includes(q)) ||
        (v.client_name && v.client_name.toLowerCase().includes(q)) ||
        (v.reference_no && v.reference_no.toLowerCase().includes(q)) ||
        v.dr_ledger_code.toLowerCase().includes(q) ||
        v.cr_ledger_code.toLowerCase().includes(q);
      return matchesParent && matchesSearch;
    });
  }, [vouchers, selectedParentFilter, searchTerm]);

  // Handle Safe Deletes with Confirmation Dialog
  const handleDeleteSupplier = (e: React.MouseEvent, supplierToDelete: string) => {
    e.stopPropagation();
    e.preventDefault();
    handleDeleteSupplierWithConfirm(supplierToDelete);
  };

  const handleDeleteBank = (e: React.MouseEvent, bankToDelete: string) => {
    e.stopPropagation();
    e.preventDefault();
    handleDeleteBankWithConfirm(bankToDelete);
  };
  
  const handleDeleteSupplierWithConfirm = async (supplierToDelete: string) => {
    setDeleteConfirmDialog({
      open: true,
      title: "Remove Supplier?",
      description: `Are you sure you want to remove "${supplierToDelete}" from your registered suppliers? Existing voucher records will remain safe in Supabase.`,
      onConfirm: async () => {
        try {
          await deleteSupplier("", supplierToDelete);
          refetchSuppliers();
          if (selectedSupplierName === supplierToDelete) setSelectedSupplierName("");
          if (activeSelectedSupplier === supplierToDelete) setActiveSelectedSupplier(null);
          toast({ title: "Supplier Removed", description: `"${supplierToDelete}" was removed.` });
        } catch (err: any) {
          toast({ variant: "destructive", title: "Error", description: err.message });
        }
      }
    });
  };

  const handleAddNewSupplier = async (e: React.MouseEvent) => {
    e.preventDefault();
    const trimmed = newSupplierInput.trim();
    if (!trimmed) return;
    try {
      await saveNewSupplier(trimmed);
      refetchSuppliers();
      setSelectedSupplierName(trimmed);
      if (!voucherNarration) {
        setVoucherNarration("Payment made to " + trimmed);
      }
      setNewSupplierInput("");
      setShowAddSupplierBox(false);
      toast({ title: "Supplier Added", description: `"${trimmed}" is saved in Supabase.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const handleAddInlineSupplier = async () => {
    const trimmed = dedicatedInlineSupplierInput.trim();
    if (!trimmed) {
      toast({ variant: "destructive", title: "Empty Name", description: "Please enter a supplier name." });
      return;
    }
    try {
      await saveNewSupplier(trimmed);
      refetchSuppliers();
      toast({ title: "Supplier Added", description: `"${trimmed}" is saved in Supabase.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
    setDedicatedInlineSupplierInput("");
  };

  const handleDeleteBankWithConfirm = (bankToDelete: string) => {
    setDeleteConfirmDialog({
      open: true,
      title: "Remove Bank Account?",
      description: `Are you sure you want to remove "${bankToDelete}" from your bank list? Existing voucher records will remain safe in Supabase.`,
      onConfirm: async () => {
        try {
          await deleteBank("", bankToDelete);
          refetchBanks();
          if (selectedBankName === bankToDelete) setSelectedBankName("");
          if (activeSelectedBank === bankToDelete) setActiveSelectedBank(null);
          toast({ title: "Bank Removed", description: `"${bankToDelete}" was removed.` });
        } catch (err: any) {
          toast({ variant: "destructive", title: "Error", description: err.message });
        }
      }
    });
  };

  const handleAddNewBank = async (e: React.MouseEvent) => {
    e.preventDefault();
    const trimmed = newBankInput.trim();
    if (!trimmed) return;
    try {
      await saveNewBank({ name: trimmed, currency: "USD" });
      refetchBanks();
      setSelectedBankName(trimmed);
      if (!voucherNarration) {
        setVoucherNarration(trimmed + " transaction");
      }
      setNewBankInput("");
      setShowAddBankBox(false);
      toast({
        title: "Bank Account Saved",
        description: `"${trimmed}" is now configured in Supabase.`
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error Saving Bank", description: err.message });
    }
  };

  const handleAddInlineBank = async () => {
    const trimmed = dedicatedInlineBankInput.trim();
    if (!trimmed) {
      toast({ variant: "destructive", title: "Empty Name", description: "Please enter a bank account name." });
      return;
    }
    try {
      await saveNewBank({ name: trimmed, currency: "USD" });
      refetchBanks();
      toast({ title: "Bank Added", description: `"${trimmed}" is saved in Supabase.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
    setDedicatedInlineBankInput("");
  };

  const handleSaveBankOpeningBalance = async () => {
    if (!editingBankOpening) return;
    const ob = parseFloat(bankOpeningInput) || 0;
    try {
      await updateBankOpeningBalance(editingBankOpening.id, ob);
      refetchBanks();
      refetchVouchers();
      toast({
        title: "Bank Opening Balance Updated",
        description: `Set opening balance for ${editingBankOpening.name} to ${editingBankOpening.currency || 'USD'} ${ob.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`
      });
      setEditBankOpeningModalOpen(false);
      setEditingBankOpening(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error Updating Balance", description: err.message });
    }
  };

  const handleDeleteVoucherWithConfirm = (voucher: AccountingVoucher) => {
    setDeleteConfirmDialog({
      open: true,
      title: `Delete Voucher ${voucher.voucher_no}?`,
      description: `Are you sure you want to delete voucher ${voucher.voucher_no} ($${voucher.amount.toLocaleString()})? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          await deleteVoucher(voucher.id);
          refetchVouchers();
          refetchBanks();
          toast({ title: "Voucher Deleted", description: `Removed ${voucher.voucher_no}` });
        } catch (err: any) {
          toast({ variant: "destructive", title: "Delete Failed", description: err.message });
        }
      }
    });
  };

  const handleCreateVoucher = async (e: React.FormEvent) => {
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

    try {
      await saveNewVoucher({
        voucher_no: voucherNo,
        voucher_type_code: selectedTypeCode,
        parent_type: voucherParentType,
        date: voucherDate,
        dr_ledger_code: drLedgerCode,
        cr_ledger_code: crLedgerCode,
        amount: amountNum,
        currency: "USD",
        exchange_rate: 2700,
        narration: voucherNarration || (
          selectedClientName 
            ? `Payment received from ${selectedClientName}` 
            : selectedSupplierName 
              ? `Payment made to ${selectedSupplierName}` 
              : selectedBankName
                ? `Bank transaction via ${selectedBankName}`
                : `${typeConfig?.name || voucherParentType} voucher`
        ),
        reference_no: voucherReference || undefined,
        bank_name: selectedBankName || undefined,
        supplier_name: selectedSupplierName || undefined,
        client_name: selectedClientName || undefined,
      });

      queryClient.invalidateQueries({ queryKey: ["accounting-vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-banks"] });
      refetchVouchers();
      refetchBanks();

      toast({
        title: "Voucher Saved Successfully",
        description: `Created ${voucherNo} ($${amountNum.toLocaleString()}) Dr: ${ledgerMap[drLedgerCode]?.name || drLedgerCode} | Cr: ${ledgerMap[crLedgerCode]?.name || crLedgerCode}`
      });

      setVoucherAmount("");
      setVoucherNarration("");
      setVoucherReference("");
      setSelectedClientName("");
      setSelectedSupplierName("");
      setSelectedBankName("");
      setShowAddSupplierBox(false);
      setShowAddBankBox(false);
      setNewSupplierInput("");
      setNewVoucherModalOpen(false);
      if (onVoucherCreated) onVoucherCreated();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error Saving Voucher",
        description: err.message || "Failed to persist voucher to Supabase."
      });
    }
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
      {/* DEDICATED SECTION VIEW (when clicked from sidebar e.g. Cash, Bank, Supplier Payables, etc.) */}
      {dedicatedCategoryInfo && dedicatedLedgerData ? (
        <div className="space-y-5">
          {/* Dedicated Header Banner */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div className="flex items-start gap-3.5">
              <div className={`p-3 rounded-xl ${
                dedicatedCategoryInfo.colorTheme === "emerald" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                dedicatedCategoryInfo.colorTheme === "blue" ? "bg-blue-50 text-blue-600 border border-blue-100" :
                dedicatedCategoryInfo.colorTheme === "amber" ? "bg-amber-50 text-amber-600 border border-amber-100" :
                dedicatedCategoryInfo.colorTheme === "purple" ? "bg-purple-50 text-purple-600 border border-purple-100" :
                "bg-rose-50 text-rose-600 border border-rose-100"
              }`}>
                <dedicatedCategoryInfo.icon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {dedicatedCategoryInfo.categoryTitle}
                  </Badge>
                  <span className="text-xs font-mono font-bold text-indigo-700">
                    Code [{dedicatedCategoryInfo.ledgerCode}]
                  </span>
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight mt-0.5">
                  {dedicatedCategoryInfo.title}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {dedicatedCategoryInfo.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {dedicatedCategoryInfo.key === "bank" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setManageBanksModalOpen(true)}
                  className="text-xs font-bold border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Manage Bank Accounts ({companyBanks.length})
                </Button>
              )}

              {dedicatedCategoryInfo.key === "payables" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setManageSuppliersModalOpen(true)}
                  className="text-xs font-bold border-amber-200 text-amber-700 hover:bg-amber-50"
                >
                  <Briefcase className="w-3.5 h-3.5 mr-1.5" /> Manage Suppliers ({companySuppliers.length})
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Clear query params to view general vouchers list
                  const newParams = new URLSearchParams(searchParams);
                  newParams.delete("category");
                  newParams.delete("sub");
                  setSearchParams(newParams);
                }}
                className="text-xs font-bold border-slate-200"
              >
                <X className="w-3.5 h-3.5 mr-1.5 text-slate-400" /> View All Vouchers
              </Button>

              <Button
                size="sm"
                onClick={() => {
                  handleParentTypeChange(dedicatedCategoryInfo.defaultParentType);
                  if (dedicatedCategoryInfo.defaultParentType === "RECEIPT") {
                    setDrLedgerCode(dedicatedCategoryInfo.ledgerCode);
                    setCrLedgerCode("1030");
                  } else if (dedicatedCategoryInfo.defaultParentType === "PAYMENT") {
                    setDrLedgerCode(dedicatedCategoryInfo.ledgerCode === "2010" ? "2010" : "4010");
                    setCrLedgerCode(dedicatedCategoryInfo.ledgerCode === "2010" ? "1020" : dedicatedCategoryInfo.ledgerCode);
                  }
                  setNewVoucherModalOpen(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Record {dedicatedCategoryInfo.title.split(" ")[0]} Entry
              </Button>
            </div>
          </div>

          {/* 3 Dedicated Metric Cards: Total In / Total Out / Net Balance */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card 1: Total Debits (Money In / Additions) */}
            <Card className="border-slate-200 bg-white shadow-xs">
              <CardHeader className="p-4 pb-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Total Debits (Dr)
                  </span>
                  <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                    <ArrowDownLeft className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 text-xl font-black text-emerald-700">
                  ${dedicatedLedgerData.totalDr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Debited across {dedicatedLedgerData.rows.filter(r => r.isDr).length} voucher transactions
                </p>
              </CardHeader>
            </Card>

            {/* Card 2: Total Credits (Money Out / Reductions) */}
            <Card className="border-slate-200 bg-white shadow-xs">
              <CardHeader className="p-4 pb-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Total Credits (Cr)
                  </span>
                  <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 text-xl font-black text-rose-700">
                  ${dedicatedLedgerData.totalCr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Credited across {dedicatedLedgerData.rows.filter(r => r.isCr).length} voucher transactions
                </p>
              </CardHeader>
            </Card>

            {/* Card 3: Closing Balance */}
            <Card className="border-slate-200 bg-white shadow-xs">
              <CardHeader className="p-4 pb-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Current Closing Balance
                  </span>
                  <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                    <Scale className="w-4 h-4" />
                  </div>
                </div>
                <div className={`mt-2 text-xl font-black ${dedicatedLedgerData.netBalance >= 0 ? "text-slate-900" : "text-rose-600"}`}>
                  ${dedicatedLedgerData.netBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Opening Balance: ${dedicatedLedgerData.opening.toLocaleString()} • Status: Active
                </p>
              </CardHeader>
            </Card>
          </div>

          {/* BANK ACCOUNTS DIRECT OVERVIEW & CONFIGURATION (when in Bank dedicated view) */}
          {dedicatedCategoryInfo.key === "bank" && (
            <Card className="border-blue-200/80 bg-blue-50/30 overflow-hidden shadow-2xs">
              <CardHeader className="p-4 bg-white border-b border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                      Configured Corporate Bank Accounts ({companyBanks.length})
                    </CardTitle>
                    {activeSelectedBank && (
                      <Badge className="bg-blue-600 text-white text-[10px] font-bold">
                        Filtering: {activeSelectedBank}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-[11px] text-slate-500">
                    Click any bank card below to view its specific transactions and running balance.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input 
                    value={dedicatedInlineBankInput}
                    onChange={(e) => setDedicatedInlineBankInput(e.target.value)}
                    placeholder="Enter new bank name..."
                    className="h-8 text-xs bg-white border-blue-200 w-52 sm:w-64 font-medium"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddInlineBank();
                      }
                    }}
                  />
                  <Button 
                    type="button"
                    size="sm"
                    onClick={handleAddInlineBank}
                    className="h-8 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shrink-0 px-3.5 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Bank
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  {companyBankObjects.map((bankObj) => {
                    const bankName = bankObj.name;
                    const stats = bankBalancesMap[bankName] || {
                      id: bankObj.id,
                      name: bankName,
                      currency: bankObj.currency || "USD",
                      opening_balance: bankObj.opening_balance || 0,
                      drTotal: 0,
                      crTotal: 0,
                      netBalance: bankObj.opening_balance || 0,
                      vouchersCount: 0,
                    };

                    const isSelected = activeSelectedBank === bankName;
                    const isTZS = (stats.currency || "USD") === "TZS";
                    const formattedNet = isTZS
                      ? `TZS ${stats.netBalance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                      : `$${stats.netBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                    return (
                      <div 
                        key={bankObj.id || bankName}
                        onClick={() => {
                          setActiveSelectedBank(isSelected ? null : bankName);
                        }}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group ${
                          isSelected 
                            ? "bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/30 shadow-xs" 
                            : "bg-white border-slate-200/90 hover:border-blue-300 hover:shadow-xs"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <div className={`p-2 rounded-lg shrink-0 ${isSelected ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"}`}>
                              <CreditCard className="w-4 h-4" />
                            </div>
                            <div className="overflow-hidden">
                              <p className="text-xs font-black text-slate-900 truncate" title={bankName}>{bankName}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Badge variant="outline" className="text-[9px] font-black uppercase tracking-wider py-0 px-1 border-blue-200 bg-blue-50/50 text-blue-700">
                                  {stats.currency}
                                </Badge>
                                <span className="text-[10px] text-slate-500 font-semibold">
                                  {stats.vouchersCount > 0 ? `${stats.vouchersCount} vouchers` : "No vouchers"}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button 
                              type="button"
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingBankOpening(bankObj);
                                setBankOpeningInput(String(bankObj.opening_balance || 0));
                                setEditBankOpeningModalOpen(true);
                              }}
                              className="h-6 px-1.5 text-[10px] font-bold text-blue-700 hover:bg-blue-100 rounded"
                              title="Set or update opening balance in Supabase"
                            >
                              Opening
                            </Button>
                            <Button 
                              type="button"
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteBankWithConfirm(bankName);
                              }}
                              className="h-6 w-6 p-0 text-slate-300 hover:text-rose-600 hover:bg-rose-50 opacity-60 group-hover:opacity-100 transition-opacity"
                              title="Remove bank"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Live Net Balance Display */}
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400">Live Bank Balance</span>
                            <div className={`text-sm font-black tracking-tight ${stats.netBalance >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                              {formattedNet}
                            </div>
                          </div>
                          <div className="text-right text-[10px] text-slate-500 font-medium">
                            <div>Opening: <span className="font-bold text-slate-700">{isTZS ? `TZS ${stats.opening_balance.toLocaleString()}` : `$${stats.opening_balance.toLocaleString()}`}</span></div>
                            <div className="text-emerald-600 font-bold">+{isTZS ? `${stats.drTotal.toLocaleString()}` : `$${stats.drTotal.toLocaleString()}`} in</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {activeSelectedBank && (
                  <div className="mt-3 pt-2 border-t border-blue-100 flex items-center justify-between text-xs">
                    <span className="text-blue-700 font-bold">
                      Showing statement for <span className="underline">{activeSelectedBank}</span> only
                    </span>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setActiveSelectedBank(null)}
                      className="text-xs text-blue-600 h-7 px-2 font-bold hover:bg-blue-100/50"
                    >
                      Clear Bank Filter (Show All Banks)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* SUPPLIERS DIRECT OVERVIEW & CONFIGURATION (when in Supplier Payables dedicated view) */}
          {dedicatedCategoryInfo.key === "payables" && (
            <Card className="border-amber-200/80 bg-amber-50/30 overflow-hidden shadow-2xs">
              <CardHeader className="p-4 bg-white border-b border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-amber-600" />
                      Configured Company Suppliers & Vendors ({companySuppliers.length})
                    </CardTitle>
                    {activeSelectedSupplier && (
                      <Badge className="bg-amber-600 text-white text-[10px] font-bold">
                        Filtering: {activeSelectedSupplier}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-[11px] text-slate-500">
                    Click any supplier card below to view all payments and invoices for that vendor.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input 
                    value={dedicatedInlineSupplierInput}
                    onChange={(e) => setDedicatedInlineSupplierInput(e.target.value)}
                    placeholder="Enter new supplier name..."
                    className="h-8 text-xs bg-white border-amber-200 w-52 sm:w-64 font-medium"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddInlineSupplier();
                      }
                    }}
                  />
                  <Button 
                    type="button"
                    size="sm"
                    onClick={handleAddInlineSupplier}
                    className="h-8 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shrink-0 px-3.5 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Supplier
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {companySuppliers.map((supplierName) => {
                    const supVouchersCount = (dedicatedLedgerData.allRows || dedicatedLedgerData.rows).filter(r => 
                      r.narration.toLowerCase().includes(supplierName.toLowerCase()) || 
                      (r.reference_no && r.reference_no.toLowerCase().includes(supplierName.toLowerCase()))
                    ).length;

                    const isSelected = activeSelectedSupplier === supplierName;

                    return (
                      <div 
                        key={supplierName}
                        onClick={() => {
                          setActiveSelectedSupplier(isSelected ? null : supplierName);
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                          isSelected 
                            ? "bg-amber-50 border-amber-500 ring-2 ring-amber-500/30 shadow-xs" 
                            : "bg-white border-slate-200/90 hover:border-amber-300 hover:shadow-2xs"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div className={`p-2 rounded-lg shrink-0 ${isSelected ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-600"}`}>
                            <Briefcase className="w-4 h-4" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs font-bold text-slate-900 truncate" title={supplierName}>{supplierName}</p>
                            <span className="text-[10px] text-slate-500 font-semibold">
                              {supVouchersCount > 0 ? `${supVouchersCount} voucher entries` : "No entries yet"}
                            </span>
                          </div>
                        </div>
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSupplierWithConfirm(supplierName);
                          }}
                          className="h-7 w-7 p-0 text-slate-300 hover:text-rose-600 hover:bg-rose-50 opacity-60 group-hover:opacity-100 transition-opacity shrink-0 ml-1"
                          title="Remove supplier"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
                {activeSelectedSupplier && (
                  <div className="mt-3 pt-2 border-t border-amber-100 flex items-center justify-between text-xs">
                    <span className="text-amber-700 font-bold">
                      Showing statement for <span className="underline">{activeSelectedSupplier}</span> only
                    </span>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setActiveSelectedSupplier(null)}
                      className="text-xs text-amber-600 h-7 px-2 font-bold hover:bg-amber-100/50"
                    >
                      Clear Supplier Filter (Show All Suppliers)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Dedicated Account Statement Table */}
          <Card className="border-slate-200 bg-white overflow-hidden shadow-xs">
            <CardHeader className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-black text-slate-900">
                  {dedicatedCategoryInfo.title} — Statement of Transactions
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-bold">
                  {dedicatedLedgerData.rows.length} Entries
                </Badge>
              </div>

              <div className="relative w-48 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <Input 
                  placeholder="Filter transactions, ref..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-xs font-semibold bg-white border-slate-200"
                />
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-100/70 text-[11px] font-black uppercase text-slate-600">
                  <TableRow>
                    <TableHead className="py-2.5 px-4">Date</TableHead>
                    <TableHead className="py-2.5 px-4">Voucher No</TableHead>
                    <TableHead className="py-2.5 px-4">Type</TableHead>
                    <TableHead className="py-2.5 px-4">Opposing (Contra) Account</TableHead>
                    <TableHead className="py-2.5 px-4">Narration / Particulars</TableHead>
                    <TableHead className="py-2.5 px-4 text-right text-emerald-700">Debit (Dr)</TableHead>
                    <TableHead className="py-2.5 px-4 text-right text-rose-700">Credit (Cr)</TableHead>
                    <TableHead className="py-2.5 px-4 text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 text-xs">
                  {dedicatedLedgerData.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <div className="p-3 bg-slate-50 text-slate-400 rounded-full">
                            <dedicatedCategoryInfo.icon className="w-6 h-6" />
                          </div>
                          <p className="text-sm font-bold text-slate-700">
                            No transactions posted to {dedicatedCategoryInfo.title} yet
                          </p>
                          <p className="text-xs text-slate-400 max-w-sm">
                            Any vouchers created under Accounting Vouchers targeting this account will automatically appear here.
                          </p>
                          <Button 
                            size="sm" 
                            onClick={() => {
                              handleParentTypeChange(dedicatedCategoryInfo.defaultParentType);
                              if (dedicatedCategoryInfo.defaultParentType === "RECEIPT") {
                                setDrLedgerCode(dedicatedCategoryInfo.ledgerCode);
                                setCrLedgerCode("1030");
                              } else if (dedicatedCategoryInfo.defaultParentType === "PAYMENT") {
                                setDrLedgerCode(dedicatedCategoryInfo.ledgerCode === "2010" ? "2010" : "4010");
                                setCrLedgerCode(dedicatedCategoryInfo.ledgerCode === "2010" ? "1020" : dedicatedCategoryInfo.ledgerCode);
                              }
                              setNewVoucherModalOpen(true);
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold mt-2"
                          >
                            <Plus className="w-3.5 h-3.5 mr-1.5" /> Create First Entry
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    dedicatedLedgerData.rows
                      .filter(r => {
                        if (!searchTerm) return true;
                        const q = searchTerm.toLowerCase();
                        return (
                          r.voucher_no.toLowerCase().includes(q) ||
                          r.narration.toLowerCase().includes(q) ||
                          r.opposingName.toLowerCase().includes(q)
                        );
                      })
                      .map((v) => {
                        const typeName = voucherTypes.find(t => t.code === v.voucher_type_code)?.name || v.parent_type;
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
                              <span className="text-[10px] text-slate-400 mr-1 font-mono">[{v.opposingCode}]</span> {v.opposingName}
                            </TableCell>
                            <TableCell className="py-2.5 px-4 text-slate-600 max-w-[240px] truncate" title={v.narration}>
                              {v.narration}
                            </TableCell>
                            <TableCell className="py-2.5 px-4 text-right font-black text-emerald-700">
                              {v.isDr ? `$${v.debitAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
                            </TableCell>
                            <TableCell className="py-2.5 px-4 text-right font-black text-rose-700">
                              {v.isCr ? `$${v.creditAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
                            </TableCell>
                            <TableCell className="py-2.5 px-4 text-center">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleDeleteVoucherWithConfirm(v)}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                                title="Delete voucher"
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
        </div>
      ) : (
        <>
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

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refetchVouchers();
                  refetchBanks();
                  refetchSuppliers();
                  toast({ title: "Synced with Supabase", description: "Vouchers, banks, and suppliers refreshed live." });
                }}
                className="text-xs font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                title="Refresh latest data across all branches and countries"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isVouchersFetching ? 'animate-spin' : ''}`} /> Sync Live
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSqlMigrationModalOpen(true)}
                className="text-xs font-bold border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100"
                title="View or copy Supabase SQL migration script"
              >
                <Database className="w-3.5 h-3.5 mr-1.5 text-amber-700" /> Supabase SQL
              </Button>

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
        </>
      )}

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
                          onClick={() => handleDeleteVoucherWithConfirm(v)}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                          title="Delete voucher"
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

        
        {/* Supplier / Vendor Selector when recording Payments (F5) or Supplier Payables [2010] */}
        {(voucherParentType === "PAYMENT" || drLedgerCode === "2010" || crLedgerCode === "2010") && (
          <div className="p-2.5 rounded-lg border border-rose-200 bg-rose-50/70 space-y-2 transition-all">
            <div className="flex justify-between items-center">
              <Label className="text-[11px] font-bold text-rose-900 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-rose-600" />
                Company Supplier / Vendor Paid *
              </Label>
              <button
                type="button"
                onClick={() => setShowAddSupplierBox(!showAddSupplierBox)}
                className="text-[10px] text-rose-700 hover:text-rose-900 font-bold underline cursor-pointer"
              >
                {showAddSupplierBox ? "Cancel" : "+ Add New Supplier"}
              </button>
            </div>

            {showAddSupplierBox ? (
              <div className="flex gap-2 items-center pt-1">
                <Input
                  value={newSupplierInput}
                  onChange={(e) => setNewSupplierInput(e.target.value)}
                  placeholder="e.g. Scania Spares, TotalEnergies, Clearing Agent..."
                  className="h-8 text-xs bg-white border-rose-300"
                />
                <Button 
                  type="button" 
                  size="sm" 
                  onClick={handleAddNewSupplier}
                  className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 shrink-0"
                >
                  Save & Select
                </Button>
              </div>
            ) : (
              <Select value={selectedSupplierName} onValueChange={(val) => {
                setSelectedSupplierName(val);
                if (val && !voucherNarration) {
                  setVoucherNarration("Payment made to " + val);
                }
              }}>
                <SelectTrigger className="h-9 text-xs font-bold bg-white border-rose-300">
                  <SelectValue placeholder="-- Pick Supplier / Payee --" />
                </SelectTrigger>
                <SelectContent>
                  {companySuppliers.map((s) => (
                    <div key={s} className="flex items-center justify-between px-1.5 py-1 hover:bg-slate-100 rounded text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSupplierName(s);
                          if (!voucherNarration) {
                            setVoucherNarration("Payment made to " + s);
                          }
                        }}
                        className="flex-1 text-left font-medium text-slate-800 hover:text-indigo-600 truncate py-1"
                      >
                        {s}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSupplier(e, s)}
                        title="Delete this supplier"
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors ml-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Bank Account Selector when Bank Account [1020] or CONTRA is selected */}
        {(drLedgerCode === "1020" || crLedgerCode === "1020" || voucherParentType === "CONTRA") && (
          <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/70 space-y-2 transition-all">
            <div className="flex justify-between items-center">
              <Label className="text-[11px] font-bold text-blue-900 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                Company Bank Account Involved *
              </Label>
              <button
                type="button"
                onClick={() => setShowAddBankBox(!showAddBankBox)}
                className="text-[10px] text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer"
              >
                {showAddBankBox ? "Cancel" : "+ Add New Bank"}
              </button>
            </div>

            {showAddBankBox ? (
              <div className="flex gap-2 items-center pt-1">
                <Input
                  value={newBankInput}
                  onChange={(e) => setNewBankInput(e.target.value)}
                  placeholder="e.g. CRDB (USD Collection), NMB, Standard Chartered..."
                  className="h-8 text-xs bg-white border-blue-300"
                />
                <Button 
                  type="button" 
                  size="sm" 
                  onClick={handleAddNewBank}
                  className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 shrink-0"
                >
                  Save & Select
                </Button>
              </div>
            ) : (
              <Select value={selectedBankName} onValueChange={(val) => {
                setSelectedBankName(val);
                if (val && !voucherNarration) {
                  setVoucherNarration("Bank transaction via " + val);
                }
              }}>
                <SelectTrigger className="h-9 text-xs font-bold bg-white border-blue-300">
                  <SelectValue placeholder="-- Pick Company Bank Account --" />
                </SelectTrigger>
                <SelectContent>
                  {companyBanks.map((b) => (
                    <div key={b} className="flex items-center justify-between px-1.5 py-1 hover:bg-slate-100 rounded text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBankName(b);
                          if (!voucherNarration) {
                            setVoucherNarration("Bank transaction via " + b);
                          }
                        }}
                        className="flex-1 text-left font-medium text-slate-800 hover:text-indigo-600 truncate py-1"
                      >
                        {b}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteBank(e, b)}
                        title="Delete this bank"
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors ml-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </SelectContent>
              </Select>
            )}
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

      {/* ============================================================== */}
      {/* MODAL 4: MANAGE COMPANY BANK ACCOUNTS                         */}
      {/* ============================================================== */}
      <Dialog open={manageBanksModalOpen} onOpenChange={setManageBanksModalOpen}>
        <DialogContent className="max-w-[550px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              Company Bank Accounts
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Add and manage your corporate bank accounts (CRDB, NMB, Stanbic, etc.) for vouchers and bank reconciliations.
            </DialogDescription>
          </DialogHeader>

          {/* Quick Add Bank Input */}
          <div className="flex gap-2 items-center bg-blue-50/70 p-3 rounded-xl border border-blue-200">
            <Input 
              value={newBankInput}
              onChange={(e) => setNewBankInput(e.target.value)}
              placeholder="e.g. CRDB (USD Collection), NMB, KCB..."
              className="h-9 text-xs bg-white border-blue-300"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddNewBank(e as any);
                }
              }}
            />
            <Button 
              type="button"
              size="sm"
              onClick={handleAddNewBank}
              className="h-9 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shrink-0 px-4"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Bank
            </Button>
          </div>

          {/* Banks List */}
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[350px]">
            {companyBanks.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 font-medium">
                No bank accounts added yet. Enter a bank name above.
              </div>
            ) : (
              companyBanks.map((b) => (
                <div key={b} className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{b}</p>
                      <p className="text-[10px] text-slate-400">Code [1020] • Bank Asset Account</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={(e) => handleDeleteBank(e, b)}
                    className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageBanksModalOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 5: MANAGE COMPANY SUPPLIERS & VENDORS                   */}
      {/* ============================================================== */}
      <Dialog open={manageSuppliersModalOpen} onOpenChange={setManageSuppliersModalOpen}>
        <DialogContent className="max-w-[550px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-amber-600" />
              Company Suppliers & Vendors
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Add and manage fuel suppliers, spare parts providers, port authorities, and agents for payment vouchers.
            </DialogDescription>
          </DialogHeader>

          {/* Quick Add Supplier Input */}
          <div className="flex gap-2 items-center bg-amber-50/70 p-3 rounded-xl border border-amber-200">
            <Input 
              value={newSupplierInput}
              onChange={(e) => setNewSupplierInput(e.target.value)}
              placeholder="e.g. Scania Spares, Oryx Energies, TPA..."
              className="h-9 text-xs bg-white border-amber-300"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddNewSupplier(e as any);
                }
              }}
            />
            <Button 
              type="button"
              size="sm"
              onClick={handleAddNewSupplier}
              className="h-9 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shrink-0 px-4"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Supplier
            </Button>
          </div>

          {/* Suppliers List */}
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[350px]">
            {companySuppliers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 font-medium">
                No suppliers configured yet.
              </div>
            ) : (
              companySuppliers.map((s) => (
                <div key={s} className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                      <Briefcase className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{s}</p>
                      <p className="text-[10px] text-slate-400">Code [2010] • Supplier Payable Account</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={(e) => handleDeleteSupplier(e, s)}
                    className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageSuppliersModalOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 6: ARE YOU SURE? CONFIRMATION MODAL POPUP                */}
      {/* ============================================================== */}
      <Dialog 
        open={deleteConfirmDialog.open} 
        onOpenChange={(open) => setDeleteConfirmDialog(prev => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-[420px] p-6">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-2">
              <Trash2 className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-black text-slate-900">
              {deleteConfirmDialog.title || "Confirm Deletion"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1 leading-relaxed">
              {deleteConfirmDialog.description || "Are you sure? This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex sm:flex-row gap-2 sm:justify-end">
            <Button 
              type="button"
              variant="outline" 
              size="sm"
              onClick={() => setDeleteConfirmDialog(prev => ({ ...prev, open: false }))}
              className="text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button 
              type="button"
              variant="destructive" 
              size="sm"
              onClick={() => {
                deleteConfirmDialog.onConfirm();
                setDeleteConfirmDialog(prev => ({ ...prev, open: false }));
              }}
              className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
            >
              Yes, Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 7: EDIT BANK OPENING BALANCE                             */}
      {/* ============================================================== */}
      <Dialog open={editBankOpeningModalOpen} onOpenChange={setEditBankOpeningModalOpen}>
        <DialogContent className="max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              Set Opening Balance
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Set the starting ledger balance for <span className="font-bold text-slate-800">{editingBankOpening?.name}</span> in Supabase.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <div>
              <Label className="text-xs font-bold text-slate-700">Bank Account</Label>
              <Input 
                value={editingBankOpening?.name || ""} 
                disabled 
                className="h-9 text-xs bg-slate-50 font-bold text-slate-700 mt-1" 
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-700">
                Opening Balance Amount ({editingBankOpening?.currency || "USD"})
              </Label>
              <Input 
                type="number"
                step="any"
                value={bankOpeningInput}
                onChange={(e) => setBankOpeningInput(e.target.value)}
                placeholder="e.g. 50000"
                className="h-9 text-xs font-mono font-bold mt-1"
                autoFocus
              />
              <p className="text-[10px] text-slate-400 mt-1">
                This starting amount will be saved to Supabase and added to all live debits/credits to determine this bank's exact live balance.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditBankOpeningModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              size="sm" 
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
              onClick={handleSaveBankOpeningBalance}
            >
              Save to Supabase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* MODAL 8: SUPABASE SQL MIGRATION VIEW & 1-CLICK COPY            */}
      {/* ============================================================== */}
      <Dialog open={sqlMigrationModalOpen} onOpenChange={setSqlMigrationModalOpen}>
        <DialogContent className="max-w-[650px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-600" />
              Supabase SQL Migration Script
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Run this SQL script in your Supabase SQL Editor so all your tables have opening balances, relational bank/client fields, and performance indexes.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono border border-slate-800 space-y-1 select-all">
            <pre className="whitespace-pre-wrap">{`-- 1. Ensure accounting_banks table exists with opening balance & account info
CREATE TABLE IF NOT EXISTS public.accounting_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    account_number TEXT,
    currency TEXT DEFAULT 'USD',
    opening_balance NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.accounting_banks ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE public.accounting_banks ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE public.accounting_banks ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0;

-- 2. Ensure accounting_suppliers table exists
CREATE TABLE IF NOT EXISTS public.accounting_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'Vendor',
    opening_balance NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.accounting_suppliers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0;

-- 3. Ensure accounting_vouchers has relational linking
CREATE TABLE IF NOT EXISTS public.accounting_vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_no TEXT NOT NULL UNIQUE,
    voucher_type_code TEXT NOT NULL,
    parent_type TEXT NOT NULL CHECK (parent_type IN ('CONTRA', 'PAYMENT', 'RECEIPT', 'JOURNAL')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    dr_ledger_code TEXT NOT NULL,
    cr_ledger_code TEXT NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    currency TEXT DEFAULT 'USD',
    exchange_rate NUMERIC DEFAULT 2700,
    narration TEXT,
    reference_no TEXT,
    bank_name TEXT,
    bank_id UUID,
    supplier_name TEXT,
    supplier_id UUID,
    client_name TEXT,
    trip_id UUID,
    invoice_no TEXT,
    status TEXT DEFAULT 'posted',
    reconciliation_status TEXT DEFAULT 'pending',
    reconciled_date DATE,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS bank_id UUID;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS supplier_id UUID;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'posted';
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS reconciliation_status TEXT DEFAULT 'pending';
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS reconciled_date DATE;

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_date ON public.accounting_vouchers(date);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_parent ON public.accounting_vouchers(parent_type);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_dr ON public.accounting_vouchers(dr_ledger_code);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_cr ON public.accounting_vouchers(cr_ledger_code);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_bank ON public.accounting_vouchers(bank_name);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_client ON public.accounting_vouchers(client_name);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_supplier ON public.accounting_vouchers(supplier_name);`}</pre>
          </div>

          <DialogFooter className="flex sm:flex-row justify-between items-center gap-2">
            <span className="text-[11px] text-slate-500">
              Also saved in file: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">SUPABASE_ACCOUNTING_SYNC_MIGRATION.sql</code>
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSqlMigrationModalOpen(false)}>
                Close
              </Button>
              <Button 
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                onClick={() => {
                  navigator.clipboard.writeText(`CREATE TABLE IF NOT EXISTS public.accounting_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    account_number TEXT,
    currency TEXT DEFAULT 'USD',
    opening_balance NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.accounting_banks ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE public.accounting_banks ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE public.accounting_banks ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.accounting_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    category TEXT DEFAULT 'Vendor',
    opening_balance NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.accounting_suppliers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.accounting_vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_no TEXT NOT NULL UNIQUE,
    voucher_type_code TEXT NOT NULL,
    parent_type TEXT NOT NULL CHECK (parent_type IN ('CONTRA', 'PAYMENT', 'RECEIPT', 'JOURNAL')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    dr_ledger_code TEXT NOT NULL,
    cr_ledger_code TEXT NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    currency TEXT DEFAULT 'USD',
    exchange_rate NUMERIC DEFAULT 2700,
    narration TEXT,
    reference_no TEXT,
    bank_name TEXT,
    bank_id UUID,
    supplier_name TEXT,
    supplier_id UUID,
    client_name TEXT,
    trip_id UUID,
    invoice_no TEXT,
    status TEXT DEFAULT 'posted',
    reconciliation_status TEXT DEFAULT 'pending',
    reconciled_date DATE,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS bank_id UUID;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS supplier_id UUID;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'posted';
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS reconciliation_status TEXT DEFAULT 'pending';
ALTER TABLE public.accounting_vouchers ADD COLUMN IF NOT EXISTS reconciled_date DATE;
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_date ON public.accounting_vouchers(date);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_parent ON public.accounting_vouchers(parent_type);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_dr ON public.accounting_vouchers(dr_ledger_code);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_cr ON public.accounting_vouchers(cr_ledger_code);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_bank ON public.accounting_vouchers(bank_name);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_client ON public.accounting_vouchers(client_name);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_supplier ON public.accounting_vouchers(supplier_name);`);
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 3000);
                  toast({ title: "Copied to Clipboard!", description: "Paste and run in your Supabase SQL Editor." });
                }}
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                {copiedSql ? "Copied!" : "Copy SQL Script"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
