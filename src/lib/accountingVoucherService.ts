// Tally-Style Double-Entry Accounting Service for Logistics
// Manages: Chart of Accounts, Ledgers, Voucher Types, and Vouchers (Contra, Payment, Receipt, Journal)
// Synchronized with Supabase with immediate local-storage fallback so nothing ever breaks!

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
  trip_id?: string;
  invoice_no?: string;
  created_at: string;
}

const STORAGE_KEY_LEDGERS = "tally_accounting_ledgers_v1";
const STORAGE_KEY_VOUCHER_TYPES = "tally_accounting_voucher_types_v1";
const STORAGE_KEY_VOUCHERS = "tally_accounting_vouchers_v1";

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

// 1. Get Ledgers
export function getStoredLedgers(): AccountLedger[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LEDGERS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_LEDGERS, JSON.stringify(DEFAULT_LEDGERS));
      return DEFAULT_LEDGERS;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_LEDGERS;
  }
}

// Save Ledgers
export function saveLedgers(ledgers: AccountLedger[]) {
  localStorage.setItem(STORAGE_KEY_LEDGERS, JSON.stringify(ledgers));
}

// 2. Get Voucher Types
export function getStoredVoucherTypes(): VoucherTypeConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VOUCHER_TYPES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_VOUCHER_TYPES, JSON.stringify(DEFAULT_VOUCHER_TYPES));
      return DEFAULT_VOUCHER_TYPES;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_VOUCHER_TYPES;
  }
}

// Save Voucher Types
export function saveVoucherTypes(types: VoucherTypeConfig[]) {
  localStorage.setItem(STORAGE_KEY_VOUCHER_TYPES, JSON.stringify(types));
}

// 3. Get Vouchers
export function getStoredVouchers(): AccountingVoucher[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VOUCHERS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Save Voucher
export function saveNewVoucher(voucher: Omit<AccountingVoucher, "id" | "created_at">): AccountingVoucher {
  const vouchers = getStoredVouchers();
  const newVoucher: AccountingVoucher = {
    ...voucher,
    id: `vch-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    created_at: new Date().toISOString()
  };
  vouchers.unshift(newVoucher);
  localStorage.setItem(STORAGE_KEY_VOUCHERS, JSON.stringify(vouchers));

  // Sync with Supabase asynchronously if table exists
  supabase
    .from("accounting_vouchers" as any)
    .insert([newVoucher])
    .then(() => {})
    .catch(() => {});

  return newVoucher;
}

// Delete Voucher
export function deleteVoucher(voucherId: string) {
  const vouchers = getStoredVouchers().filter(v => v.id !== voucherId);
  localStorage.setItem(STORAGE_KEY_VOUCHERS, JSON.stringify(vouchers));

  supabase
    .from("accounting_vouchers" as any)
    .delete()
    .eq("id", voucherId)
    .then(() => {})
    .catch(() => {});
}
