// Tally-Style Double-Entry Accounting Service for Logistics
// Connected directly to Supabase so all offices, branches, and countries
// see live accounting vouchers, bank balances, and ledgers in real-time.

import { supabase } from "@/integrations/supabase/client";

export type AccountCategory = "ASSETS" | "LIABILITIES" | "INCOME" | "EXPENSES";
export type VoucherParentType = "CONTRA" | "PAYMENT" | "RECEIPT" | "JOURNAL";

export interface AccountLedger {
  id: string;
  code: string;
  name: string;
  category: AccountCategory;
  sub_category: string;
  currency: string;
  opening_balance: number;
  current_balance: number;
  is_system?: boolean;
}

export interface VoucherTypeConfig {
  id: string;
  code: string;
  name: string;
  parent_type: VoucherParentType;
  description?: string;
  is_system?: boolean;
}

export interface AccountingBank {
  id: string;
  name: string;
  account_number?: string;
  currency: "USD" | "TZS" | string;
  opening_balance: number;
  created_at?: string;
}

export interface AccountingSupplier {
  id: string;
  name: string;
  category?: string;
  opening_balance?: number;
  created_at?: string;
}

export interface AccountingVoucher {
  id: string;
  voucher_no: string;
  voucher_type_code: string;
  parent_type: VoucherParentType;
  date: string;
  dr_ledger_code: string;
  cr_ledger_code: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  narration: string;
  reference_no?: string;
  bank_name?: string;
  bank_id?: string;
  supplier_name?: string;
  supplier_id?: string;
  client_name?: string;
  trip_id?: string;
  invoice_no?: string;
  status?: string;
  reconciliation_status?: "pending" | "cleared";
  reconciled_date?: string;
  created_by?: string;
  created_at: string;
}

export const DEFAULT_LEDGERS: AccountLedger[] = [
  // 1. ASSETS
  { id: "led-1010", code: "1010", name: "Cash in Hand", category: "ASSETS", sub_category: "Cash", currency: "USD", opening_balance: 0, current_balance: 0, is_system: true },
  { id: "led-1020", code: "1020", name: "Bank Account (CRDB / NMB)", category: "ASSETS", sub_category: "Bank", currency: "USD", opening_balance: 0, current_balance: 0, is_system: true },
  { id: "led-1030", code: "1030", name: "Customer Receivables", category: "ASSETS", sub_category: "Receivables", currency: "USD", opening_balance: 0, current_balance: 0, is_system: true },
  { id: "led-1040", code: "1040", name: "Korridor Account Balance", category: "ASSETS", sub_category: "Bank / Wallet", currency: "USD", opening_balance: 0, current_balance: 0, is_system: true },
  
  // 2. LIABILITIES
  { id: "led-2010", code: "2010", name: "Supplier Payables", category: "LIABILITIES", sub_category: "Payables", currency: "USD", opening_balance: 0, current_balance: 0, is_system: true },
  { id: "led-2020", code: "2020", name: "Korridor Clearance Dues", category: "LIABILITIES", sub_category: "Payables", currency: "USD", opening_balance: 0, current_balance: 0, is_system: true },
  
  // 3. INCOME / REVENUE
  { id: "led-3010", code: "3010", name: "Transit Freight Invoice Account", category: "INCOME", sub_category: "Transit Freight", currency: "USD", opening_balance: 0, current_balance: 0, is_system: true },
  { id: "led-3020", code: "3020", name: "Local Income Account", category: "INCOME", sub_category: "Local Freight", currency: "USD", opening_balance: 0, current_balance: 0, is_system: true },
  { id: "led-3030", code: "3030", name: "Driver Shortage Recoveries", category: "INCOME", sub_category: "Recoveries", currency: "USD", opening_balance: 0, current_balance: 0, is_system: true },
  
  // 4. EXPENSES / COSTS
  { id: "led-4010", code: "4010", name: "Direct Costs (Fuel, Driver & Clearance)", category: "EXPENSES", sub_category: "Direct Costs", currency: "USD", opening_balance: 0, current_balance: 0, is_system: true },
  { id: "led-4020", code: "4020", name: "Operating Costs (Repairs & Yard)", category: "EXPENSES", sub_category: "Operating Costs", currency: "USD", opening_balance: 0, current_balance: 0, is_system: true },
  { id: "led-4030", code: "4030", name: "Finance & Other Costs", category: "EXPENSES", sub_category: "Finance Costs", currency: "USD", opening_balance: 0, current_balance: 0, is_system: true },
];

export const DEFAULT_VOUCHER_TYPES: VoucherTypeConfig[] = [
  // CONTRA
  { id: "vt-contra-1", code: "CONTRA_MAIN", name: "Contra", parent_type: "CONTRA", description: "Internal transfers between Cash and Bank accounts", is_system: true },
  { id: "vt-contra-2", code: "CONTRA_KORRIDOR", name: "Korridor Transfers", parent_type: "CONTRA", description: "Transfers into Korridor fleet clearance cards", is_system: true },
  
  // PAYMENTS
  { id: "vt-pay-1", code: "PAY_GENERAL", name: "Payment", parent_type: "PAYMENT", description: "Direct supplier or company expenses payment", is_system: true },
  { id: "vt-pay-2", code: "PAY_KORRIDOR", name: "Korridor Payments", parent_type: "PAYMENT", description: "Fuel and trip allowance payment via Korridor", is_system: true },
  
  // RECEIPTS
  { id: "vt-rec-1", code: "REC_BANK", name: "Bank Deposits", parent_type: "RECEIPT", description: "Direct wire / TT payments received from clients", is_system: true },
  { id: "vt-rec-2", code: "REC_CASH", name: "Cash Deposits", parent_type: "RECEIPT", description: "Cash received at cashier or physical office", is_system: true },
  
  // GENERAL JOURNAL
  { id: "vt-jou-1", code: "JOURNAL_GEN", name: "General Journal", parent_type: "JOURNAL", description: "Double-entry debit/credit adjustments and provisions", is_system: true },
];

const STORAGE_KEY_LEDGERS = "tally_accounting_ledgers_v1";
const STORAGE_KEY_VOUCHER_TYPES = "tally_accounting_voucher_types_v1";
const STORAGE_KEY_VOUCHERS = "tally_accounting_vouchers_v1";

export function getStoredLedgers(): AccountLedger[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LEDGERS);
    if (!raw) return DEFAULT_LEDGERS;
    return JSON.parse(raw);
  } catch {
    return DEFAULT_LEDGERS;
  }
}

export function saveLedgers(ledgers: AccountLedger[]) {
  try {
    localStorage.setItem(STORAGE_KEY_LEDGERS, JSON.stringify(ledgers));
  } catch {}
}

export function getStoredVoucherTypes(): VoucherTypeConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VOUCHER_TYPES);
    if (!raw) return DEFAULT_VOUCHER_TYPES;
    return JSON.parse(raw);
  } catch {
    return DEFAULT_VOUCHER_TYPES;
  }
}

export function saveVoucherTypes(types: VoucherTypeConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEY_VOUCHER_TYPES, JSON.stringify(types));
  } catch {}
}

export function getStoredVouchers(): AccountingVoucher[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VOUCHERS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// ==========================================
// 1. SUPABASE VOUCHERS API
// ==========================================

export async function fetchAccountingVouchers(): Promise<AccountingVoucher[]> {
  try {
    const allRows: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("accounting_vouchers" as any)
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.warn("Could not query Supabase accounting_vouchers:", error.message);
        break;
      }

      if (data && data.length > 0) {
        allRows.push(...data);
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    // Deduplicate any overlapping vouchers across pagination boundaries
    const seenIds = new Set<string>();
    const uniqueRows: any[] = [];
    for (const row of allRows) {
      const key = String(row.id || row.voucher_no || "");
      if (key && seenIds.has(key)) continue;
      if (key) seenIds.add(key);
      uniqueRows.push(row);
    }

    return uniqueRows.map((row: any) => ({
      ...row,
      amount: parseFloat(row.amount) || 0,
      exchange_rate: parseFloat(row.exchange_rate) || 2700,
    }));
  } catch (err) {
    console.warn("Exception fetching accounting vouchers:", err);
    return [];
  }
}

export async function saveNewVoucher(voucher: Omit<AccountingVoucher, "id" | "created_at">): Promise<AccountingVoucher> {
  const fullPayload = {
    voucher_no: voucher.voucher_no,
    voucher_type_code: voucher.voucher_type_code,
    parent_type: voucher.parent_type,
    date: voucher.date,
    dr_ledger_code: voucher.dr_ledger_code,
    cr_ledger_code: voucher.cr_ledger_code,
    amount: voucher.amount,
    currency: voucher.currency || "USD",
    exchange_rate: voucher.exchange_rate || 2700,
    narration: voucher.narration,
    reference_no: voucher.reference_no || null,
    bank_name: voucher.bank_name || null,
    bank_id: voucher.bank_id || null,
    supplier_name: voucher.supplier_name || null,
    supplier_id: voucher.supplier_id || null,
    client_name: voucher.client_name || null,
    trip_id: voucher.trip_id || null,
    invoice_no: voucher.invoice_no || null,
    status: voucher.status || "posted",
    reconciliation_status: voucher.reconciliation_status || "pending",
  };

  // 1. Attempt insert with full relational fields
  const { data, error } = await supabase
    .from("accounting_vouchers" as any)
    .insert([fullPayload])
    .select();

  if (!error && data && data.length > 0) {
    return {
      ...data[0],
      amount: parseFloat(data[0].amount) || voucher.amount,
      exchange_rate: parseFloat(data[0].exchange_rate) || voucher.exchange_rate,
    };
  }

  // 2. Fallback: If columns (e.g. bank_name) not yet added to table, retry with standard base schema
  if (error && (error.message?.includes("column") || error.code === "PGRST204")) {
    const basePayload = {
      voucher_no: voucher.voucher_no,
      voucher_type_code: voucher.voucher_type_code,
      parent_type: voucher.parent_type,
      date: voucher.date,
      dr_ledger_code: voucher.dr_ledger_code,
      cr_ledger_code: voucher.cr_ledger_code,
      amount: voucher.amount,
      currency: voucher.currency || "USD",
      exchange_rate: voucher.exchange_rate || 2700,
      narration: voucher.narration,
      reference_no: voucher.reference_no || null,
      trip_id: voucher.trip_id || null,
      invoice_no: voucher.invoice_no || null,
    };

    const { data: fallbackData, error: fallbackErr } = await supabase
      .from("accounting_vouchers" as any)
      .insert([basePayload])
      .select();

    if (fallbackErr) throw fallbackErr;
    if (fallbackData && fallbackData.length > 0) {
      return {
        ...fallbackData[0],
        bank_name: voucher.bank_name,
        supplier_name: voucher.supplier_name,
        client_name: voucher.client_name,
        amount: parseFloat(fallbackData[0].amount) || voucher.amount,
        exchange_rate: parseFloat(fallbackData[0].exchange_rate) || voucher.exchange_rate,
      };
    }
  }

  if (error) throw error;

  return {
    ...voucher,
    id: `vch-${Date.now()}`,
    created_at: new Date().toISOString()
  };
}

export async function deleteVoucher(voucherId: string): Promise<void> {
  const { error } = await supabase
    .from("accounting_vouchers" as any)
    .delete()
    .eq("id", voucherId);

  if (error) {
    throw error;
  }
}

export async function deleteVouchersByAccount(
  accountType: "cash" | "bank" | "supplier", 
  accountName?: string,
  voucherIds?: string[]
): Promise<{ deletedCount: number }> {
  // If specific voucher IDs were passed (e.g. from current view), delete those exact IDs
  if (voucherIds && voucherIds.length > 0) {
    let totalDeleted = 0;
    const CHUNK_SIZE = 200;
    for (let i = 0; i < voucherIds.length; i += CHUNK_SIZE) {
      const chunk = voucherIds.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from("accounting_vouchers" as any)
        .delete()
        .in("id", chunk);
      if (error) throw error;
      totalDeleted += chunk.length;
    }
    return { deletedCount: totalDeleted };
  }

  // Otherwise delete via query filters
  let query = supabase.from("accounting_vouchers" as any).delete({ count: "exact" });

  if (accountType === "cash") {
    // In our system Cash is ledger 1010
    query = query.or("dr_ledger_code.eq.1010,cr_ledger_code.eq.1010");
  } else if (accountType === "bank") {
    if (accountName) {
      query = query.or(`bank_name.eq."${accountName}",narration.ilike."%${accountName}%",reference_no.ilike."%${accountName}%"`);
    } else {
      // Bank ledger is 1020
      query = query.or("dr_ledger_code.eq.1020,cr_ledger_code.eq.1020");
    }
  } else if (accountType === "supplier") {
    if (accountName) {
      query = query.or(`supplier_name.eq."${accountName}",narration.ilike."%${accountName}%",reference_no.ilike."%${accountName}%"`);
    } else {
      // Supplier payables ledger is 2010
      query = query.or("dr_ledger_code.eq.2010,cr_ledger_code.eq.2010");
    }
  }

  const { data, count, error } = await query;
  if (error) {
    throw error;
  }
  return { deletedCount: count || 0 };
}

// ==========================================
// 2. SUPABASE CORPORATE BANKS API
// ==========================================

export async function fetchAccountingBanks(): Promise<AccountingBank[]> {
  try {
    const { data, error } = await supabase
      .from("accounting_banks" as any)
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.warn("Could not query accounting_banks:", error.message);
      return [];
    }

    return (data || []).map((b: any) => ({
      id: b.id,
      name: b.name,
      account_number: b.account_number || "",
      currency: b.currency || "USD",
      opening_balance: parseFloat(b.opening_balance) || 0,
      created_at: b.created_at
    }));
  } catch (err) {
    console.warn("Error in fetchAccountingBanks:", err);
    return [];
  }
}

export async function saveNewBank(bank: {
  name: string;
  account_number?: string;
  currency?: string;
  opening_balance?: number;
}): Promise<AccountingBank> {
  const payload: any = {
    name: bank.name.trim(),
    currency: bank.currency || "USD",
    account_number: bank.account_number || null,
  };
  if (bank.opening_balance !== undefined) {
    payload.opening_balance = bank.opening_balance;
  }

  const { data, error } = await supabase
    .from("accounting_banks" as any)
    .insert([payload])
    .select();

  if (error) {
    // If opening_balance column is not yet present, retry without opening_balance
    if (error.message?.includes("opening_balance")) {
      delete payload.opening_balance;
      const { data: d2, error: err2 } = await supabase
        .from("accounting_banks" as any)
        .insert([payload])
        .select();
      if (err2) throw err2;
      return d2[0];
    }
    throw error;
  }

  return data[0];
}

export async function updateBankOpeningBalance(bankId: string, openingBalance: number): Promise<void> {
  const { error } = await supabase
    .from("accounting_banks" as any)
    .update({ opening_balance: openingBalance })
    .eq("id", bankId);

  if (error) throw error;
}

export async function deleteBank(bankId: string, bankName?: string): Promise<void> {
  let query = supabase.from("accounting_banks" as any).delete();
  if (bankId) {
    query = query.eq("id", bankId);
  } else if (bankName) {
    query = query.eq("name", bankName);
  }
  const { error } = await query;
  if (error) throw error;
}

// ==========================================
// 3. SUPABASE CORPORATE SUPPLIERS API
// ==========================================

export async function fetchAccountingSuppliers(): Promise<AccountingSupplier[]> {
  try {
    const { data, error } = await supabase
      .from("accounting_suppliers" as any)
      .select("*")
      .order("name", { ascending: true });

    if (error) return [];
    return (data || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      category: s.category || "Vendor",
      opening_balance: parseFloat(s.opening_balance) || 0,
      created_at: s.created_at
    }));
  } catch {
    return [];
  }
}

export async function saveNewSupplier(name: string, category = "Vendor"): Promise<AccountingSupplier> {
  const { data, error } = await supabase
    .from("accounting_suppliers" as any)
    .insert([{ name: name.trim(), category }])
    .select();

  if (error) throw error;
  return data[0];
}

export async function deleteSupplier(supplierId: string, supplierName?: string): Promise<void> {
  let query = supabase.from("accounting_suppliers" as any).delete();
  if (supplierId) {
    query = query.eq("id", supplierId);
  } else if (supplierName) {
    query = query.eq("name", supplierName);
  }
  const { error } = await query;
  if (error) throw error;
}

export async function updateSupplierOpeningBalance(supplierId: string, openingBalance: number): Promise<void> {
  const { error } = await supabase
    .from("accounting_suppliers" as any)
    .update({ opening_balance: openingBalance })
    .eq("id", supplierId);

  if (error) throw error;
}

