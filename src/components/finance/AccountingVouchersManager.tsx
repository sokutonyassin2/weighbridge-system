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
  deleteVouchersByAccount,
  fetchAccountingVouchers,
  fetchAccountingBanks,
  saveNewBank,
  updateBankOpeningBalance,
  deleteBank,
  fetchAccountingSuppliers,
  saveNewSupplier,
  updateSupplierOpeningBalance,
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
  TableRow,
  TableFooter 
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
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Settings,
  CheckCircle2,
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
  RefreshCw,
  UploadCloud,
  FileText,
  Loader2
} from "lucide-react";
import { 
  extractLinesFromPdf, 
  parseStatementLines, 
  importStatementEntriesToSupabase,
  StatementParseResult 
} from "@/lib/pdfStatementParser";

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

  // Supplier Opening Balance Modal
  const [editingSupplierOpening, setEditingSupplierOpening] = useState<AccountingSupplier | null>(null);
  const [editSupplierOpeningModalOpen, setEditSupplierOpeningModalOpen] = useState(false);
  const [supplierOpeningInput, setSupplierOpeningInput] = useState("");

  // Statement Supplier States
  const [statementSelectedSupplier, setStatementSelectedSupplier] = useState<string>("");
  const [statementCustomSupplierName, setStatementCustomSupplierName] = useState<string>("");

  // Active filter for specific bank or specific supplier inside dedicated views
  const [activeSelectedBank, setActiveSelectedBank] = useState<string | null>(null);
  const [activeSelectedSupplier, setActiveSelectedSupplier] = useState<string | null>(null);

  // Dedicated section top inline inputs (separate from modal inputs)
  const [dedicatedInlineBankInput, setDedicatedInlineBankInput] = useState<string>("");
  const [dedicatedInlineSupplierInput, setDedicatedInlineSupplierInput] = useState<string>("");

  // Statement display options
  const [statementSortOrder, setStatementSortOrder] = useState<"chronological" | "newest">("chronological");
  const [statementPageSize, setStatementPageSize] = useState<number>(100);
  const [statementCurrentPage, setStatementCurrentPage] = useState<number>(1);

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

  // Statement PDF Upload Modal & Processing States
  const [statementUploadModalOpen, setStatementUploadModalOpen] = useState(false);
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [isStatementParsing, setIsStatementParsing] = useState(false);
  const [statementParseResult, setStatementParseResult] = useState<StatementParseResult | null>(null);
  const [isStatementImporting, setIsStatementImporting] = useState(false);
  const [statementImportProgress, setStatementImportProgress] = useState({ processed: 0, total: 0 });
  const [statementSelectedBank, setStatementSelectedBank] = useState<string>("");

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

    // Determine active entity for Bank / Cash / Payables
    const effectiveBank = dedicatedCategoryInfo.key === "bank"
      ? (activeSelectedBank || companyBankObjects[0]?.name || "21210076615 - NMB USD Currency")
      : null;

    const selectedBankObj = effectiveBank ? companyBankObjects.find(b => b.name === effectiveBank) : null;
    const bankOpening = selectedBankObj ? (selectedBankObj.opening_balance || 0) : 0;
    const bankCurrency = selectedBankObj?.currency || (effectiveBank?.includes("TZ") ? "TZS" : "USD");

    const cashOpening = ledgerMap["1010"]?.opening_balance || 37.57;

    // Filter rows strictly for the active account
    const effectiveRows = rows.filter(r => {
      if (dedicatedCategoryInfo.key === "bank" && effectiveBank) {
        if (r.bank_name) {
          return r.bank_name === effectiveBank;
        }
        const bLower = effectiveBank.toLowerCase();
        return (
          r.narration.toLowerCase().includes(bLower) ||
          (r.reference_no && r.reference_no.toLowerCase().includes(bLower))
        );
      }
      if (dedicatedCategoryInfo.key === "cash") {
        // Tally Cash in Hand account is in TZS local currency
        return (r.currency || "").toUpperCase() === "TZS";
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

    const selectedSupplierObj = dedicatedCategoryInfo.key === "payables" && activeSelectedSupplier
      ? companySupplierObjects.find(s => s.name.toLowerCase() === activeSelectedSupplier.toLowerCase())
      : null;

    const opening = dedicatedCategoryInfo.key === "bank" 
      ? bankOpening 
      : dedicatedCategoryInfo.key === "cash" 
        ? cashOpening 
        : selectedSupplierObj
          ? (selectedSupplierObj.opening_balance || 0)
          : (targetLedger?.opening_balance || 0);

    const activeCurrency = dedicatedCategoryInfo.key === "cash"
      ? "TZS"
      : dedicatedCategoryInfo.key === "bank"
        ? bankCurrency
        : (effectiveRows[0]?.currency || targetLedger?.currency || "USD");

    const isAssetOrExpense = targetLedger?.category === "ASSETS" || targetLedger?.category === "EXPENSES";

    // Sort chronologically (oldest first) to compute standard running balance
    const sortedChronological = [...effectiveRows].sort((a, b) => {
      const dCmp = (a.date || "").localeCompare(b.date || "");
      if (dCmp !== 0) return dCmp;
      return (a.voucher_no || "").localeCompare(b.voucher_no || "");
    });

    let running = opening;
    let displayDr = 0;
    let displayCr = 0;

    const rowsWithBalance = sortedChronological.map(r => {
      displayDr += r.debitAmt;
      displayCr += r.creditAmt;

      if (isAssetOrExpense) {
        running = running + r.debitAmt - r.creditAmt;
      } else {
        running = running + r.creditAmt - r.debitAmt;
      }

      return {
        ...r,
        runningBalance: running
      };
    });

    const closingBalance = running;

    return {
      targetLedger,
      effectiveBank,
      selectedSupplierObj,
      activeCurrency,
      rows: rowsWithBalance,
      allRows: rows,
      totalDr: displayDr,
      totalCr: displayCr,
      opening,
      closingBalance,
      netBalance: closingBalance,
      isAssetOrExpense
    };
  }, [dedicatedCategoryInfo, vouchers, ledgerMap, activeSelectedBank, activeSelectedSupplier, companyBankObjects, companySupplierObjects]);

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
        return (
          explicit === bLower || 
          ((v.dr_ledger_code === "1020" || v.cr_ledger_code === "1020") && (nar.includes(bLower) || ref.includes(bLower)))
        );
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

  // Live calculated statistics for Cash in Hand (Ledger 1010)
  const cashStats = useMemo(() => {
    let dr = 0;
    let cr = 0;
    let count = 0;
    vouchers.forEach(v => {
      const isCash = (v.currency || "").toUpperCase() === "TZS";
      if (v.dr_ledger_code === "1010" && isCash) {
        dr += (v.amount || 0);
        count++;
      }
      if (v.cr_ledger_code === "1010" && isCash) {
        cr += (v.amount || 0);
        count++;
      }
    });
    const cashLedger = ledgerMap["1010"];
    const opening = cashLedger?.opening_balance || 37.57;
    const net = opening + dr - cr;
    return {
      opening,
      drTotal: dr,
      crTotal: cr,
      netBalance: net,
      vouchersCount: count
    };
  }, [vouchers, ledgerMap]);

  // Currency detection and formatting for dedicated views
  const isDedicatedTZS = useMemo(() => {
    if (dedicatedCategoryInfo?.key === "cash") return true;
    if (dedicatedCategoryInfo?.key === "bank") {
      return (dedicatedLedgerData?.activeCurrency || "").toUpperCase() === "TZS";
    }
    return (dedicatedLedgerData?.targetLedger?.currency || "").toUpperCase() === "TZS";
  }, [dedicatedCategoryInfo, dedicatedLedgerData]);

  const formatDedicatedCurrency = (val: number, forceCurrency?: string) => {
    const isTZS = forceCurrency ? forceCurrency.toUpperCase() === "TZS" : isDedicatedTZS;
    if (isTZS) {
      return `${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TZS`;
    }
    return `$${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

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

  const handleSaveSupplierOpeningBalance = async () => {
    if (!editingSupplierOpening) return;
    const ob = parseFloat(supplierOpeningInput) || 0;
    try {
      await updateSupplierOpeningBalance(editingSupplierOpening.id, ob);
      refetchSuppliers();
      refetchVouchers();
      toast({
        title: "Supplier Opening Balance Updated",
        description: `Set opening balance for ${editingSupplierOpening.name} to ${ob.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`
      });
      setEditSupplierOpeningModalOpen(false);
      setEditingSupplierOpening(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error Updating Balance", description: err.message });
    }
  };

  // PDF Statement Processing Handlers
  const handleProcessStatementFile = async (file: File) => {
    setStatementFile(file);
    setIsStatementParsing(true);
    setStatementParseResult(null);

    try {
      const lines = await extractLinesFromPdf(file);
      if (!lines || lines.length === 0) {
        throw new Error("No readable text found in PDF. Make sure it is an account book statement.");
      }

      // Pass target hint to parser
      const targetHint = dedicatedCategoryInfo?.key === "payables" 
        ? "SUPPLIER" 
        : dedicatedCategoryInfo?.key === "bank" 
          ? "BANK" 
          : "CASH";

      const defaultEntity = dedicatedCategoryInfo?.key === "payables"
        ? (statementSelectedSupplier || activeSelectedSupplier || undefined)
        : (statementSelectedBank || activeSelectedBank || undefined);

      const parsed = parseStatementLines(lines, file.name, targetHint, defaultEntity);

      // Auto-adapt target to currently active view if in Cash, Bank or Payables
      if (dedicatedCategoryInfo?.key === "cash") {
        parsed.detectedTarget = "CASH";
        parsed.detectedAccountName = "Cash in Hand";
      } else if (dedicatedCategoryInfo?.key === "bank") {
        parsed.detectedTarget = "BANK";
        const chosenBank = statementSelectedBank || activeSelectedBank || parsed.detectedAccountName || companyBanks[0];
        parsed.detectedAccountName = chosenBank;
        setStatementSelectedBank(chosenBank);
      } else if (dedicatedCategoryInfo?.key === "payables") {
        parsed.detectedTarget = "SUPPLIER";
        const chosenSupplier = statementSelectedSupplier || activeSelectedSupplier || parsed.detectedAccountName || companySuppliers[0] || "General Supplier";
        parsed.detectedAccountName = chosenSupplier;
        setStatementSelectedSupplier(chosenSupplier);
      }

      setStatementParseResult(parsed);
      toast({
        title: "Statement Analyzed",
        description: `Found ${parsed.entries.length} transactions for ${parsed.detectedAccountName} (${parsed.currency}).`
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "PDF Parsing Error",
        description: err.message || "Failed to parse PDF statement."
      });
    } finally {
      setIsStatementParsing(false);
    }
  };

  const handleExecuteStatementImport = async () => {
    if (!statementParseResult || statementParseResult.entries.length === 0) return;

    // Use current dynamic selection
    const effectiveResult = { ...statementParseResult };
    if (effectiveResult.detectedTarget === "BANK" && statementSelectedBank) {
      effectiveResult.detectedAccountName = statementSelectedBank;
      const bankObj = companyBankObjects.find(b => b.name === statementSelectedBank);
      if (bankObj?.currency) {
        effectiveResult.currency = bankObj.currency as any;
      }
    } else if (effectiveResult.detectedTarget === "SUPPLIER") {
      const chosenSupplier = statementSelectedSupplier || activeSelectedSupplier || effectiveResult.detectedAccountName;
      effectiveResult.detectedAccountName = chosenSupplier;

      // Ensure supplier exists in database
      let supplierObj = companySupplierObjects.find(s => s.name.toLowerCase() === chosenSupplier.toLowerCase());
      if (!supplierObj && chosenSupplier && chosenSupplier !== "all" && chosenSupplier !== "General Supplier") {
        try {
          supplierObj = await saveNewSupplier(chosenSupplier);
        } catch {}
      }

      // If statement had opening balance, update supplier's opening balance
      if (supplierObj && effectiveResult.openingBalance > 0) {
        try {
          await updateSupplierOpeningBalance(supplierObj.id, effectiveResult.openingBalance);
        } catch {}
      }
    }

    setIsStatementImporting(true);
    setStatementImportProgress({ processed: 0, total: effectiveResult.entries.length });

    try {
      const res = await importStatementEntriesToSupabase(
        effectiveResult,
        (processed, total) => {
          setStatementImportProgress({ processed, total });
        }
      );

      // If opening balance was found in statement and we're importing a Bank, update the bank's opening balance
      if (effectiveResult.detectedTarget === "BANK" && effectiveResult.openingBalance > 0) {
        const matchingBank = companyBankObjects.find(b => b.name === effectiveResult.detectedAccountName);
        if (matchingBank) {
          try {
            await updateBankOpeningBalance(matchingBank.id, effectiveResult.openingBalance);
          } catch {}
        }
      }

      await refetchVouchers();
      await refetchBanks();
      await refetchSuppliers();

      toast({
        title: "Import Complete!",
        description: `Successfully uploaded ${res.insertedCount} vouchers to ${effectiveResult.detectedAccountName}.`
      });

      setStatementUploadModalOpen(false);
      setStatementFile(null);
      setStatementParseResult(null);
      setStatementSelectedBank("");
      setStatementSelectedSupplier("");
      setStatementCustomSupplierName("");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Import Error",
        description: err.message || "Failed to insert vouchers into Supabase."
      });
    } finally {
      setIsStatementImporting(false);
    }
  };

  const handleWipeStatementTransactions = (accountType: "cash" | "bank" | "supplier", accountName?: string) => {
    const targetName = accountType === "cash" 
      ? "Cash Account" 
      : accountType === "bank"
        ? (accountName ? accountName : "All Banks")
        : (accountName ? accountName : "All Supplier Payables");

    // Gather exact voucher IDs currently in this ledger view so we guarantee every single one is deleted
    const targetVoucherIds = (dedicatedLedgerData?.rows || []).map(r => r.id).filter(Boolean);

    setDeleteConfirmDialog({
      open: true,
      title: `Wipe ${targetName} Statement Transactions?`,
      description: `Are you sure you want to delete all transactions for ${targetName}? This will wipe the statement transactions without touching suppliers, banks configuration, or other accounts. This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const res = await deleteVouchersByAccount(accountType, accountName, targetVoucherIds);
          // Also clear any browser cache item if present
          try {
            localStorage.removeItem("accounting_vouchers_cache");
          } catch {}

          await queryClient.invalidateQueries({ queryKey: ["accounting-vouchers"] });
          await refetchVouchers();
          await refetchBanks();
          await refetchSuppliers();
          toast({ 
            title: "Transactions Wiped", 
            description: `Successfully wiped ${res.deletedCount} transaction(s) for ${targetName}.` 
          });
        } catch (err: any) {
          toast({ 
            variant: "destructive", 
            title: "Wipe Failed", 
            description: err.message || "Failed to wipe transactions." 
          });
        }
      }
    });
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
      {/* DEDICATED SECTION VIEW (Cash, Bank, Supplier Payables, etc.) */}
      {dedicatedCategoryInfo && dedicatedLedgerData ? (
        <div className="space-y-4">
          {/* Executive Header Banner */}
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 shrink-0">
                <dedicatedCategoryInfo.icon className="w-5 h-5 text-slate-800" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50 border-slate-300">
                    {dedicatedCategoryInfo.categoryTitle}
                  </Badge>
                  <span className="text-xs font-mono font-bold text-slate-600">
                    Ledger [{dedicatedCategoryInfo.ledgerCode}]
                  </span>
                  <Badge variant="outline" className="text-[10px] font-bold text-slate-800 bg-white border-slate-300">
                    Currency: {dedicatedLedgerData.activeCurrency}
                  </Badge>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight mt-1">
                  {dedicatedCategoryInfo.key === "bank" && dedicatedLedgerData.effectiveBank
                    ? dedicatedLedgerData.effectiveBank
                    : dedicatedCategoryInfo.title}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {dedicatedCategoryInfo.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {(dedicatedCategoryInfo.key === "cash" || dedicatedCategoryInfo.key === "bank" || dedicatedCategoryInfo.key === "payables") && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setStatementSelectedSupplier(activeSelectedSupplier || "");
                      setStatementUploadModalOpen(true);
                      setStatementFile(null);
                      setStatementParseResult(null);
                    }}
                    className="text-xs font-bold border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  >
                    <UploadCloud className="w-3.5 h-3.5 mr-1.5 text-slate-600" /> 
                    {dedicatedCategoryInfo.key === "payables" && activeSelectedSupplier
                      ? `Upload ${activeSelectedSupplier} PDF`
                      : "Upload Statement PDF"}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handleWipeStatementTransactions(
                        dedicatedCategoryInfo.key as "cash" | "bank" | "supplier",
                        dedicatedCategoryInfo.key === "bank" 
                          ? (dedicatedLedgerData.effectiveBank || undefined) 
                          : dedicatedCategoryInfo.key === "payables"
                            ? (activeSelectedSupplier || undefined)
                            : undefined
                      );
                    }}
                    className="text-xs font-bold border-slate-300 bg-white text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5 text-rose-600" /> Reset Transactions
                  </Button>
                </>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newParams = new URLSearchParams(searchParams);
                  newParams.delete("category");
                  newParams.delete("sub");
                  setSearchParams(newParams);
                }}
                className="text-xs font-bold border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              >
                <X className="w-3.5 h-3.5 mr-1.5 text-slate-400" /> View All General Vouchers
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
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Record Entry
              </Button>
            </div>
          </div>

          {/* Clean Bank Account Selector (Only in Bank Section) */}
          {dedicatedCategoryInfo.key === "bank" && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Select Bank Account:</span>
                {companyBankObjects.map((bankObj) => {
                  const isSelected = dedicatedLedgerData.effectiveBank === bankObj.name;
                  const bCurrency = bankObj.currency || (bankObj.name.includes("TZ") ? "TZS" : "USD");
                  return (
                    <Button
                      key={bankObj.id || bankObj.name}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setActiveSelectedBank(bankObj.name);
                        setStatementCurrentPage(1);
                      }}
                      className={`h-8 text-xs font-bold transition-all ${
                        isSelected 
                          ? "bg-slate-900 text-white shadow-xs" 
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                      <span>{bankObj.name}</span>
                      <span className={`ml-2 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                        isSelected ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-600"
                      }`}>
                        {bCurrency}
                      </span>
                    </Button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const currentBankObj = companyBankObjects.find(b => b.name === dedicatedLedgerData.effectiveBank);
                    if (currentBankObj) {
                      setEditingBankOpening(currentBankObj);
                      setBankOpeningInput(String(currentBankObj.opening_balance || 0));
                      setEditBankOpeningModalOpen(true);
                    }
                  }}
                  className="h-8 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  title="Edit opening balance for active bank"
                >
                  <Pencil className="w-3.5 h-3.5 mr-1 text-slate-400" /> Edit Opening Balance
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setManageBanksModalOpen(true)}
                  className="h-8 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                >
                  <Settings className="w-3.5 h-3.5 mr-1 text-slate-400" /> Manage Accounts
                </Button>
              </div>
            </div>
          )}

          {/* Supplier Selector & Individual Statement Actions (Only in Supplier Payables Section) */}
          {dedicatedCategoryInfo.key === "payables" && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Filter by Supplier:</span>
                <Select
                  value={activeSelectedSupplier || "all"}
                  onValueChange={(val) => {
                    const nextVal = val === "all" ? null : val;
                    setActiveSelectedSupplier(nextVal);
                    setStatementSelectedSupplier(nextVal || "");
                    setStatementCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-64 h-8 text-xs font-semibold bg-white border-slate-200">
                    <SelectValue placeholder="All Suppliers & Vendors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers ({companySuppliers.length})</SelectItem>
                    {companySuppliers.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {activeSelectedSupplier && (
                  <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-bold">
                    Individual Statement Active
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Upload Supplier Statement PDF Button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatementSelectedSupplier(activeSelectedSupplier || "");
                    setStatementFile(null);
                    setStatementParseResult(null);
                    setStatementUploadModalOpen(true);
                  }}
                  className="h-8 text-xs font-bold border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-100/70"
                >
                  <UploadCloud className="w-3.5 h-3.5 mr-1.5 text-indigo-600" /> 
                  {activeSelectedSupplier ? `Upload ${activeSelectedSupplier} PDF` : "Upload Supplier PDF"}
                </Button>

                {/* Edit Opening Balance (when specific supplier selected) */}
                {activeSelectedSupplier && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const suppObj = companySupplierObjects.find(s => s.name.toLowerCase() === activeSelectedSupplier.toLowerCase());
                      if (suppObj) {
                        setEditingSupplierOpening(suppObj);
                        setSupplierOpeningInput(String(suppObj.opening_balance || 0));
                        setEditSupplierOpeningModalOpen(true);
                      }
                    }}
                    className="h-8 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    title="Edit opening balance for this supplier"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1 text-slate-400" /> Edit Opening Balance
                  </Button>
                )}

                {/* Reset Vouchers for this supplier */}
                {activeSelectedSupplier && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      handleWipeStatementTransactions("supplier", activeSelectedSupplier);
                    }}
                    className="h-8 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    title="Wipe vouchers only for this supplier"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1 text-rose-500" /> Reset Supplier Vouchers
                  </Button>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setManageSuppliersModalOpen(true)}
                  className="h-8 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                >
                  <Settings className="w-3.5 h-3.5 mr-1 text-slate-400" /> Manage Suppliers
                </Button>
              </div>
            </div>
          )}

          {/* 3 Clean Executive KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Card 1: Opening Balance */}
            <Card className="border border-slate-200 bg-white shadow-xs">
              <CardHeader className="p-4 pb-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {dedicatedCategoryInfo.key === "payables" && activeSelectedSupplier 
                      ? `${activeSelectedSupplier} Starting Balance`
                      : "Opening Balance"}
                  </span>
                  <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600">
                    <Wallet className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 text-xl font-black text-slate-900 font-mono">
                  {formatDedicatedCurrency(dedicatedLedgerData.opening)}
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Starting Balance as of 1-Jan-2026
                </p>
              </CardHeader>
            </Card>

            {/* Card 2: Period Inflow & Outflow / Bills vs Payments */}
            <Card className="border border-slate-200 bg-white shadow-xs">
              <CardHeader className="p-4 pb-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {dedicatedCategoryInfo.key === "payables" 
                      ? "Period Activity (Bills / Payments)" 
                      : "Period Activity (Inflows / Outflows)"}
                  </span>
                  <div className="flex items-center gap-1 text-slate-400">
                    <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                    <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2 text-sm font-black font-mono">
                  {dedicatedCategoryInfo.key === "payables" ? (
                    <>
                      <span className="text-emerald-700" title="Bills & Invoices from Supplier (Credits)">
                        +{formatDedicatedCurrency(dedicatedLedgerData.totalCr)}
                      </span>
                      <span className="text-slate-300">/</span>
                      <span className="text-rose-700" title="Payments made to Supplier (Debits)">
                        -{formatDedicatedCurrency(dedicatedLedgerData.totalDr)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-emerald-700">+{formatDedicatedCurrency(dedicatedLedgerData.totalDr)}</span>
                      <span className="text-slate-300">/</span>
                      <span className="text-rose-700">-{formatDedicatedCurrency(dedicatedLedgerData.totalCr)}</span>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  {dedicatedCategoryInfo.key === "payables"
                    ? `${dedicatedLedgerData.rows.length} bills and settlements recorded`
                    : `${dedicatedLedgerData.rows.length} transactions recorded`}
                </p>
              </CardHeader>
            </Card>

            {/* Card 3: Verified Closing Balance */}
            <Card className="border border-slate-200 bg-white shadow-xs">
              <CardHeader className="p-4 pb-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    {dedicatedCategoryInfo.key === "payables" ? "Closing Balance (Payable)" : "Verified Closing Balance"}
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </span>
                  <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                    <Scale className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 text-xl font-black text-slate-900 font-mono">
                  {formatDedicatedCurrency(dedicatedLedgerData.closingBalance)}
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  {dedicatedCategoryInfo.key === "payables"
                    ? "Opening + Invoices (Cr) - Payments (Dr)"
                    : "Opening + Inflows - Outflows (Tally Verified)"}
                </p>
              </CardHeader>
            </Card>
          </div>

          {/* Statement of Transactions Table */}
          <Card className="border border-slate-200 bg-white overflow-hidden shadow-xs">
            <CardHeader className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-600" />
                  {dedicatedCategoryInfo.title} — Statement of Transactions
                </CardTitle>
                <Badge variant="outline" className="text-[10px] font-bold border-slate-300 bg-white text-slate-700">
                  {dedicatedLedgerData.rows.length} Entries
                </Badge>
                <Badge variant="outline" className="text-[10px] font-mono font-bold border-slate-300 bg-white text-slate-800">
                  {dedicatedLedgerData.activeCurrency}
                </Badge>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="relative w-44 sm:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <Input 
                    placeholder="Search voucher, ref, details..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setStatementCurrentPage(1);
                    }}
                    className="pl-8 h-8 text-xs font-medium bg-white border-slate-200"
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStatementSortOrder(statementSortOrder === "chronological" ? "newest" : "chronological")}
                  className="h-8 text-xs font-semibold border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  title="Switch between statement chronological order and newest first"
                >
                  <ArrowUpDown className="w-3 h-3 mr-1 text-slate-400" />
                  {statementSortOrder === "chronological" ? "Statement Order (Oldest → Newest)" : "Newest First"}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {(() => {
                const searchLower = searchTerm.toLowerCase();
                const matchedRows = dedicatedLedgerData.rows.filter(r => {
                  if (!searchTerm) return true;
                  return (
                    r.voucher_no.toLowerCase().includes(searchLower) ||
                    r.narration.toLowerCase().includes(searchLower) ||
                    r.opposingName.toLowerCase().includes(searchLower) ||
                    (r.reference_no && r.reference_no.toLowerCase().includes(searchLower))
                  );
                });

                const displayRows = statementSortOrder === "newest" ? [...matchedRows].reverse() : matchedRows;

                const totalPages = statementPageSize === 0 ? 1 : Math.ceil(displayRows.length / statementPageSize) || 1;
                const startIndex = statementPageSize === 0 ? 0 : (statementCurrentPage - 1) * statementPageSize;
                const paginatedRows = statementPageSize === 0 ? displayRows : displayRows.slice(startIndex, startIndex + statementPageSize);

                return (
                  <div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                          <TableRow>
                            <TableHead className="py-2.5 px-3">Date</TableHead>
                            <TableHead className="py-2.5 px-3">Voucher / Ref No</TableHead>
                            <TableHead className="py-2.5 px-3">Type</TableHead>
                            <TableHead className="py-2.5 px-3">Contra / Opposing Account</TableHead>
                            <TableHead className="py-2.5 px-3">Particulars / Narration</TableHead>
                            <TableHead className="py-2.5 px-3 text-right text-emerald-700">Inflow / Debit (Dr)</TableHead>
                            <TableHead className="py-2.5 px-3 text-right text-rose-700">Outflow / Credit (Cr)</TableHead>
                            <TableHead className="py-2.5 px-3 text-right font-black text-slate-900">Running Balance</TableHead>
                            <TableHead className="py-2.5 px-3 text-center w-12">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-slate-100 text-xs">
                          {/* Opening Balance Row (displayed when on page 1 in chronological mode or without search filter) */}
                          {statementCurrentPage === 1 && !searchTerm && (
                            <TableRow className="bg-slate-50/60 font-medium">
                              <TableCell className="py-2.5 px-3 font-mono text-slate-600 font-bold">01-01-2026</TableCell>
                              <TableCell className="py-2.5 px-3 font-mono text-slate-400 font-bold">-</TableCell>
                              <TableCell className="py-2.5 px-3">
                                <Badge variant="outline" className="text-[10px] font-bold text-slate-600 border-slate-300 bg-white">
                                  OPENING
                                </Badge>
                              </TableCell>
                              <TableCell className="py-2.5 px-3 font-semibold text-slate-400">-</TableCell>
                              <TableCell className="py-2.5 px-3 font-bold text-slate-800">
                                Opening Balance Brought Forward
                              </TableCell>
                              <TableCell className="py-2.5 px-3 text-right font-mono text-slate-400">-</TableCell>
                              <TableCell className="py-2.5 px-3 text-right font-mono text-slate-400">-</TableCell>
                              <TableCell className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                                {formatDedicatedCurrency(dedicatedLedgerData.opening)}
                              </TableCell>
                              <TableCell className="py-2.5 px-3 text-center font-mono text-slate-400">-</TableCell>
                            </TableRow>
                          )}

                          {paginatedRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={9} className="py-12 text-center text-slate-500">
                                <div className="flex flex-col items-center justify-center space-y-2">
                                  <div className="p-3 bg-slate-100 text-slate-400 rounded-full">
                                    <dedicatedCategoryInfo.icon className="w-6 h-6" />
                                  </div>
                                  <p className="text-sm font-bold text-slate-700">No transactions found</p>
                                  <p className="text-xs text-slate-400 max-w-sm">
                                    {searchTerm ? "No entries match your search query." : `No transactions posted to this account yet.`}
                                  </p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginatedRows.map((v, idx) => {
                              const typeName = voucherTypes.find(t => t.code === v.voucher_type_code)?.name || v.parent_type;
                              return (
                                <TableRow key={`stmt-${v.id || idx}-${idx}`} className="hover:bg-slate-50/70">
                                  <TableCell className="py-2 px-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                                    {v.date}
                                  </TableCell>
                                  <TableCell className="py-2 px-3 font-mono font-bold text-slate-800 text-[11px] whitespace-nowrap">
                                    {v.reference_no || v.voucher_no}
                                  </TableCell>
                                  <TableCell className="py-2 px-3 whitespace-nowrap">
                                    <Badge variant="outline" className={`text-[9px] font-bold ${
                                      v.parent_type === "CONTRA" ? "text-slate-700 border-slate-300 bg-slate-50" :
                                      v.parent_type === "PAYMENT" ? "text-rose-700 border-rose-200 bg-rose-50/40" :
                                      v.parent_type === "RECEIPT" ? "text-emerald-700 border-emerald-200 bg-emerald-50/40" :
                                      "text-slate-700 border-slate-200 bg-slate-50"
                                    }`}>
                                      {typeName}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="py-2 px-3 font-semibold text-slate-700 text-xs">
                                    <span className="text-[10px] text-slate-400 mr-1 font-mono">[{v.opposingCode}]</span> {v.opposingName}
                                  </TableCell>
                                  <TableCell className="py-2 px-3 text-slate-600 max-w-[280px] truncate text-xs" title={v.narration}>
                                    {v.narration}
                                  </TableCell>
                                  <TableCell className="py-2 px-3 text-right font-mono font-bold text-emerald-700 text-xs whitespace-nowrap">
                                    {v.isDr ? formatDedicatedCurrency(v.debitAmt) : "-"}
                                  </TableCell>
                                  <TableCell className="py-2 px-3 text-right font-mono font-bold text-rose-700 text-xs whitespace-nowrap">
                                    {v.isCr ? formatDedicatedCurrency(v.creditAmt) : "-"}
                                  </TableCell>
                                  <TableCell className="py-2 px-3 text-right font-mono font-black text-slate-900 text-xs whitespace-nowrap">
                                    {formatDedicatedCurrency(v.runningBalance)}
                                  </TableCell>
                                  <TableCell className="py-2 px-3 text-center">
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => handleDeleteVoucherWithConfirm(v)}
                                      className="h-6 w-6 p-0 text-slate-300 hover:text-rose-600 hover:bg-rose-50"
                                      title="Delete voucher"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>

                        {/* Statement Table Footer with Totals and Visible Closing Balance */}
                        <TableFooter className="bg-slate-50/90 border-t-2 border-slate-300">
                          <TableRow className="border-b border-slate-200 text-xs">
                            <TableCell colSpan={5} className="py-2.5 px-3 font-black uppercase text-[11px] text-slate-700">
                              Total Period Transactions ({displayRows.length} items)
                            </TableCell>
                            <TableCell className="py-2.5 px-3 text-right font-mono font-black text-emerald-700">
                              +{formatDedicatedCurrency(dedicatedLedgerData.totalDr)}
                            </TableCell>
                            <TableCell className="py-2.5 px-3 text-right font-mono font-black text-rose-700">
                              -{formatDedicatedCurrency(dedicatedLedgerData.totalCr)}
                            </TableCell>
                            <TableCell colSpan={2} className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-500 font-semibold">
                              Net Change: {formatDedicatedCurrency(dedicatedLedgerData.totalDr - dedicatedLedgerData.totalCr)}
                            </TableCell>
                          </TableRow>
                          <TableRow className="bg-slate-100/90">
                            <TableCell colSpan={5} className="py-3 px-3 font-black uppercase text-xs text-slate-900 tracking-wider">
                              Closing Balance (Carried Forward)
                            </TableCell>
                            <TableCell colSpan={2} className="py-3 px-3 text-right text-[11px] font-semibold text-slate-500">
                              Opening Balance + Inflows - Outflows =
                            </TableCell>
                            <TableCell className="py-3 px-3 text-right font-mono font-black text-sm text-slate-900 whitespace-nowrap">
                              {formatDedicatedCurrency(dedicatedLedgerData.closingBalance)}
                            </TableCell>
                            <TableCell className="py-3 px-3 text-center">
                              <Badge variant="outline" className="text-[9px] font-black border-slate-300 bg-white text-slate-700">
                                RECONCILED
                              </Badge>
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>

                    {/* Pagination Controls */}
                    {displayRows.length > 50 && (
                      <div className="p-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="text-slate-500 font-medium">
                          Showing <span className="font-bold text-slate-700">{startIndex + 1}</span> to <span className="font-bold text-slate-700">{Math.min(startIndex + statementPageSize, displayRows.length)}</span> of <span className="font-bold text-slate-900">{displayRows.length}</span> transactions
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-medium">Per page:</span>
                          <select
                            value={statementPageSize}
                            onChange={(e) => {
                              setStatementPageSize(Number(e.target.value));
                              setStatementCurrentPage(1);
                            }}
                            className="h-7 text-xs border border-slate-200 rounded px-1.5 bg-white font-medium cursor-pointer"
                          >
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={250}>250</option>
                            <option value={0}>All</option>
                          </select>

                          {statementPageSize > 0 && totalPages > 1 && (
                            <div className="flex items-center gap-1 ml-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={statementCurrentPage <= 1}
                                onClick={() => setStatementCurrentPage(p => Math.max(1, p - 1))}
                                className="h-7 px-2 text-xs border-slate-200"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </Button>
                              <span className="text-xs font-semibold px-1 text-slate-600">
                                {statementCurrentPage} / {totalPages}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={statementCurrentPage >= totalPages}
                                onClick={() => setStatementCurrentPage(p => Math.min(totalPages, p + 1))}
                                className="h-7 px-2 text-xs border-slate-200"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
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
                filteredVouchers.map((v, idx) => {
                  const typeName = voucherTypes.find(t => t.code === v.voucher_type_code)?.name || v.parent_type;
                  const drName = ledgerMap[v.dr_ledger_code]?.name || v.dr_ledger_code;
                  const crName = ledgerMap[v.cr_ledger_code]?.name || v.cr_ledger_code;

                  return (
                    <TableRow key={`voucher-${v.id || idx}-${idx}`} className="hover:bg-slate-50/60">
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
                {voucherTypes.map((vt, idx) => (
                  <TableRow key={`vt-${vt.id || vt.code || idx}-${idx}`}>
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
                {ledgers.map((l, idx) => (
                  <TableRow key={`ldr-${l.id || l.code || idx}-${idx}`}>
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
      {/* MODAL 7B: EDIT SUPPLIER OPENING BALANCE                         */}
      {/* ============================================================== */}
      <Dialog open={editSupplierOpeningModalOpen} onOpenChange={setEditSupplierOpeningModalOpen}>
        <DialogContent className="max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-amber-600" />
              Set Supplier Opening Balance
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Set the starting payable balance owed to <span className="font-bold text-slate-800">{editingSupplierOpening?.name}</span> in Supabase.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <div>
              <Label className="text-xs font-bold text-slate-700">Supplier Name</Label>
              <Input 
                value={editingSupplierOpening?.name || ""} 
                disabled 
                className="h-9 text-xs bg-slate-50 font-bold text-slate-700 mt-1" 
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-700">
                Opening Balance Amount (USD / TZS)
              </Label>
              <Input 
                type="number"
                step="any"
                value={supplierOpeningInput}
                onChange={(e) => setSupplierOpeningInput(e.target.value)}
                placeholder="e.g. 25000"
                className="h-9 text-xs font-mono font-bold mt-1"
                autoFocus
              />
              <p className="text-[10px] text-slate-400 mt-1">
                This starting amount will be saved to Supabase and added to all live bills and payments to determine this supplier's exact live balance.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditSupplierOpeningModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              size="sm" 
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
              onClick={handleSaveSupplierOpeningBalance}
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

      {/* ============================================================== */}
      {/* MODAL 8: SMART PDF STATEMENT UPLOADER                          */}
      {/* ============================================================== */}
      <Dialog open={statementUploadModalOpen} onOpenChange={setStatementUploadModalOpen}>
        <DialogContent className="max-w-[550px] p-6 max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-1">
              <UploadCloud className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-black text-slate-900">
              Upload Account Statement PDF
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 leading-relaxed">
              Upload any Tally statement PDF (e.g. <i>Supplier Ledger</i>, <i>CASH ACCOUNT.pdf</i>, <i>NMB USD</i>, <i>NMB TZS</i>, <i>Amana</i>). 
              The system will automatically extract every transaction, match dates, amounts, and voucher numbers, and import them directly into Supabase.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2 flex-1 overflow-y-auto">
            {/* File Drop / Select Area */}
            <div 
              className="border-2 border-dashed border-indigo-200 rounded-xl p-6 text-center bg-indigo-50/30 hover:bg-indigo-50/50 transition-colors cursor-pointer relative"
              onClick={() => document.getElementById("statement-pdf-input")?.click()}
            >
              <input 
                id="statement-pdf-input"
                type="file" 
                accept="application/pdf"
                className="hidden" 
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleProcessStatementFile(f);
                }}
              />
              <FileText className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-800">
                {statementFile ? statementFile.name : "Click to select statement PDF"}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Supports Supplier Payables, Cash Account Book, NMB Bank Statements, Amana USD, etc.
              </p>
            </div>

            {/* Parsing Spinner */}
            {isStatementParsing && (
              <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/50 flex items-center justify-center gap-3 text-xs text-indigo-800 font-bold">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                Reading and analyzing statement pages...
              </div>
            )}

            {/* Parsed Summary Preview */}
            {statementParseResult && !isStatementParsing && (
              <div className="space-y-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" /> Statement Analyzed
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Badge className="bg-emerald-600 text-white text-[10px] font-bold">
                      {statementParseResult.entries.length} Total
                    </Badge>
                    {statementParseResult.detectedTarget === "SUPPLIER" && (
                      <Badge variant="outline" className="text-[10px] font-bold border-indigo-300 text-indigo-700 bg-white">
                        Supplier Statement
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Target Supplier Selector */}
                {statementParseResult.detectedTarget === "SUPPLIER" ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-700">Target Supplier / Vendor:</Label>
                      <span className="text-[11px] text-indigo-600 font-semibold">Match to existing supplier or add new</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select 
                        value={statementSelectedSupplier || statementParseResult.detectedAccountName} 
                        onValueChange={(val) => {
                          if (val === "custom_new") {
                            setStatementSelectedSupplier("custom_new");
                          } else {
                            setStatementSelectedSupplier(val);
                            if (statementParseResult) {
                              statementParseResult.detectedAccountName = val;
                            }
                          }
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs font-bold bg-white border-indigo-200 flex-1">
                          <SelectValue placeholder="Select target supplier..." />
                        </SelectTrigger>
                        <SelectContent>
                          {companySuppliers.map((sName) => (
                            <SelectItem key={sName} value={sName} className="text-xs font-medium">
                              {sName}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom_new" className="text-xs font-bold text-indigo-600">
                            + Add New Supplier Name...
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={statementParseResult.currency}
                        onValueChange={(cur: "USD" | "TZS") => {
                          if (statementParseResult) {
                            statementParseResult.currency = cur;
                            statementParseResult.entries.forEach(e => { e.currency = cur; });
                          }
                          setRefreshKey(k => k + 1);
                        }}
                      >
                        <SelectTrigger className="h-9 w-24 text-xs font-mono font-bold bg-white border-indigo-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="TZS">TZS (Shs)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {statementSelectedSupplier === "custom_new" && (
                      <div className="mt-2 flex items-center gap-2">
                        <Input 
                          placeholder="Type new supplier name (e.g. Mantrac Ltd)..."
                          value={statementCustomSupplierName}
                          onChange={(e) => {
                            setStatementCustomSupplierName(e.target.value);
                            if (statementParseResult) {
                              statementParseResult.detectedAccountName = e.target.value;
                            }
                          }}
                          className="h-8 text-xs font-bold bg-white border-indigo-300"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                ) : statementParseResult.detectedTarget === "BANK" ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-700">Target Bank Account:</Label>
                      <span className="text-[11px] text-indigo-600 font-semibold">Choose which bank this statement belongs to</span>
                    </div>
                    <Select 
                      value={statementSelectedBank || statementParseResult.detectedAccountName} 
                      onValueChange={(val) => {
                        setStatementSelectedBank(val);
                        if (statementParseResult) {
                          statementParseResult.detectedAccountName = val;
                          const bObj = companyBankObjects.find(b => b.name === val);
                          if (bObj?.currency) {
                            statementParseResult.currency = bObj.currency as any;
                          }
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 text-xs font-bold bg-white border-indigo-200">
                        <SelectValue placeholder="Select target bank..." />
                      </SelectTrigger>
                      <SelectContent>
                        {companyBanks.map((bName) => (
                          <SelectItem key={bName} value={bName} className="text-xs font-medium">
                            {bName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-white border border-emerald-100">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Target Account</p>
                    <p className="font-bold text-slate-900 mt-0.5 truncate">
                      {statementParseResult.detectedTarget === "SUPPLIER"
                        ? (statementCustomSupplierName || statementSelectedSupplier || statementParseResult.detectedAccountName)
                        : (statementSelectedBank || statementParseResult.detectedAccountName)}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-emerald-100">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Currency</p>
                    <p className="font-bold text-slate-900 mt-0.5 font-mono">{statementParseResult.currency}</p>
                  </div>
                </div>

                {statementParseResult.detectedTarget === "SUPPLIER" && (
                  <div className="flex items-center justify-between text-[11px] p-2 bg-indigo-50/60 rounded-lg border border-indigo-100">
                    <span className="font-semibold text-indigo-900">
                      Bills / Invoices: <b className="text-emerald-700">+{statementParseResult.entries.filter(e => e.type === "Cr").length}</b>
                    </span>
                    <span className="font-semibold text-indigo-900">
                      Payments Made: <b className="text-rose-700">-{statementParseResult.entries.filter(e => e.type === "Dr").length}</b>
                    </span>
                  </div>
                )}

                {statementParseResult.openingBalance > 0 && (
                  <p className="text-[11px] text-emerald-800 font-medium">
                    Opening Balance Detected: <b>{statementParseResult.currency} {statementParseResult.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b>
                  </p>
                )}

                {statementParseResult.closingBalance > 0 && (
                  <p className="text-[11px] text-emerald-800 font-medium">
                    Closing Balance Detected: <b>{statementParseResult.currency} {statementParseResult.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</b>
                  </p>
                )}

                {/* First 5 preview items */}
                <div className="border border-slate-200 rounded-lg p-2.5 bg-white divide-y divide-slate-100 text-[11px] max-h-36 overflow-y-auto">
                  {statementParseResult.entries.slice(0, 5).map((e, idx) => (
                    <div key={idx} className="py-1.5 flex items-center justify-between gap-2">
                      <div className="truncate">
                        <span className="font-mono text-[10px] text-slate-400 mr-2">{e.date}</span>
                        <span className="font-bold text-slate-800">{e.particulars}</span>
                        <span className="text-[10px] text-slate-400 ml-1.5 font-mono">({e.voucherType})</span>
                      </div>
                      <span className={`font-mono font-bold shrink-0 ${e.type === 'Cr' ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {e.type === 'Cr' ? '+ ' : '- '}{e.currency === 'USD' ? '$' : 'TZS '}{e.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {statementParseResult.entries.length > 5 && (
                    <p className="text-[10px] text-slate-400 pt-1 text-center font-medium">
                      + {statementParseResult.entries.length - 5} more transactions will be imported
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Importing Progress */}
            {isStatementImporting && (
              <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/70 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    Uploading vouchers to Supabase...
                  </span>
                  <span>{statementImportProgress.processed} / {statementImportProgress.total}</span>
                </div>
                <div className="w-full bg-indigo-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-2 transition-all duration-300"
                    style={{ width: `${(statementImportProgress.processed / statementImportProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-3 gap-2">
            <Button 
              type="button"
              variant="outline" 
              size="sm"
              disabled={isStatementImporting}
              onClick={() => setStatementUploadModalOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              type="button"
              size="sm"
              disabled={!statementParseResult || isStatementParsing || isStatementImporting}
              onClick={handleExecuteStatementImport}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
            >
              {isStatementImporting ? "Importing..." : `Import ${statementParseResult?.entries.length || 0} Transactions`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
