// Logistics Accounting & Vehicle Statement Service
// Provides calculations and state persistence for:
// 1. Vehicle Trip Statements & Tanker Shortage Deductions / Driver Recoveries
// 2. Client Accounts (Opening Balance, Invoiced, Received, Closing Balance)

export interface TankerShortageRecovery {
  applicable: boolean;
  cargo_type?: string; // e.g. "Fuel / Petroleum", "Crude Oil", "Chemicals", "Bulk Liquid"
  agreed_amount: number; // e.g. 700 USD
  agreed_currency: "USD" | "TZS";
  shortage_liters?: number; // e.g. 150 L
  shortage_rate?: number;
  shortage_amount: number; // e.g. 200 USD
  net_client_amount: number; // e.g. 500 USD (agreed - shortage)
  driver_recovered_amount: number; // e.g. 200 USD
  driver_recovery_status: "Pending" | "Partially Recovered" | "Fully Recovered";
  driver_payment_method: "Allowance Deduction" | "Cash Deposit" | "Bank Transfer" | "Mobile Money";
  driver_receipt_no?: string;
  driver_payment_date?: string;
  notes?: string;
}

export interface ClientBalanceSummary {
  client_name: string;
  opening_balance_usd: number;
  total_invoiced_usd: number;
  total_received_usd: number;
  closing_balance_usd: number;
  currency: string;
  invoices_count: number;
}

export interface ClientLedgerEntry {
  id: string;
  date: string;
  type: "OPENING_BALANCE" | "INVOICE" | "PAYMENT" | "SHORTAGE_ADJUSTMENT";
  reference_no: string;
  description: string;
  debit: number; // Amount billed to client (+)
  credit: number; // Amount paid by client (-)
  running_balance: number;
}

const STORAGE_KEY_CLIENT_OPENING = "logistics_client_opening_balances";
const STORAGE_KEY_TRIP_SHORTAGE = "logistics_trip_shortage_recoveries";

// Client Opening Balances Helpers
export function getClientOpeningBalances(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLIENT_OPENING);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to load client opening balances:", e);
    return {};
  }
}

export function saveClientOpeningBalance(clientName: string, amountUSD: number): void {
  try {
    const current = getClientOpeningBalances();
    current[clientName] = Math.max(0, amountUSD);
    localStorage.setItem(STORAGE_KEY_CLIENT_OPENING, JSON.stringify(current));
    window.dispatchEvent(new Event("client_balances_updated"));
  } catch (e) {
    console.warn("Failed to save client opening balance:", e);
  }
}

// Trip Tanker Shortage & Driver Recovery Helpers
export function getAllShortageRecoveries(): Record<string, TankerShortageRecovery> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRIP_SHORTAGE);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to load trip shortage recoveries:", e);
    return {};
  }
}

export function getTripShortageRecovery(tripIdOrRef: string, tripDoc?: any): TankerShortageRecovery {
  // 1. Check if stored in tripDoc.country_rates?.shortage_recovery (persisted in DB)
  if (tripDoc?.country_rates?.shortage_recovery) {
    return sanitizeShortageRecovery(tripDoc.country_rates.shortage_recovery);
  }

  // 2. Check localStorage
  const all = getAllShortageRecoveries();
  const idKey = tripDoc?.id || tripIdOrRef;
  const refKey = tripDoc?.reference_number || tripDoc?.trip_number;

  if (idKey && all[idKey]) return sanitizeShortageRecovery(all[idKey]);
  if (refKey && all[refKey]) return sanitizeShortageRecovery(all[refKey]);

  // Default empty
  const defaultAgreed = parseFloat(tripDoc?.revenue_amount) || 0;
  return {
    applicable: false,
    cargo_type: tripDoc?.cargo_outbound || "Fuel / Bulk",
    agreed_amount: defaultAgreed,
    agreed_currency: tripDoc?.revenue_currency || "USD",
    shortage_liters: 0,
    shortage_rate: 0,
    shortage_amount: 0,
    net_client_amount: defaultAgreed,
    driver_recovered_amount: 0,
    driver_recovery_status: "Pending",
    driver_payment_method: "Allowance Deduction",
    driver_receipt_no: "",
    driver_payment_date: "",
    notes: ""
  };
}

export function saveTripShortageRecovery(
  tripIdOrRef: string,
  recovery: TankerShortageRecovery,
  additionalRefKey?: string
): void {
  try {
    const all = getAllShortageRecoveries();
    all[tripIdOrRef] = recovery;
    if (additionalRefKey) {
      all[additionalRefKey] = recovery;
    }
    localStorage.setItem(STORAGE_KEY_TRIP_SHORTAGE, JSON.stringify(all));
    window.dispatchEvent(new Event("trip_shortages_updated"));
  } catch (e) {
    console.warn("Failed to save trip shortage recovery:", e);
  }
}

function sanitizeShortageRecovery(data: any): TankerShortageRecovery {
  const agreed = parseFloat(data.agreed_amount) || 0;
  const shortage = parseFloat(data.shortage_amount) || 0;
  const netClient = data.net_client_amount !== undefined 
    ? parseFloat(data.net_client_amount) 
    : Math.max(0, agreed - shortage);
  const driverPaid = parseFloat(data.driver_recovered_amount) || 0;

  let status = data.driver_recovery_status;
  if (!status) {
    if (shortage <= 0) status = "Fully Recovered";
    else if (driverPaid >= shortage - 0.01) status = "Fully Recovered";
    else if (driverPaid > 0) status = "Partially Recovered";
    else status = "Pending";
  }

  return {
    applicable: !!data.applicable,
    cargo_type: data.cargo_type || "Fuel / Petroleum",
    agreed_amount: agreed,
    agreed_currency: data.agreed_currency || "USD",
    shortage_liters: parseFloat(data.shortage_liters) || 0,
    shortage_rate: parseFloat(data.shortage_rate) || 0,
    shortage_amount: shortage,
    net_client_amount: netClient,
    driver_recovered_amount: driverPaid,
    driver_recovery_status: status,
    driver_payment_method: data.driver_payment_method || "Allowance Deduction",
    driver_receipt_no: data.driver_receipt_no || "",
    driver_payment_date: data.driver_payment_date || "",
    notes: data.notes || ""
  };
}

// Generate Detailed Client Statement Ledger
export function buildClientStatement(
  clientName: string,
  invoices: any[],
  openingBalanceUSD: number = 0
): {
  entries: ClientLedgerEntry[];
  openingBalance: number;
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
} {
  const entries: ClientLedgerEntry[] = [];
  let running = openingBalanceUSD;

  // 1. Initial Opening Balance entry
  entries.push({
    id: `ob-${clientName}`,
    date: invoices.length > 0 && invoices[0].invoice_date 
      ? invoices[0].invoice_date 
      : new Date().toISOString().split("T")[0],
    type: "OPENING_BALANCE",
    reference_no: "BAL-BF",
    description: "Opening Balance Brought Forward",
    debit: openingBalanceUSD > 0 ? openingBalanceUSD : 0,
    credit: openingBalanceUSD < 0 ? Math.abs(openingBalanceUSD) : 0,
    running_balance: running
  });

  let totalDebits = openingBalanceUSD > 0 ? openingBalanceUSD : 0;
  let totalCredits = openingBalanceUSD < 0 ? Math.abs(openingBalanceUSD) : 0;

  // 2. Group by invoice_no so a multi-vehicle batch invoice shows as ONE consolidated line
  const invoiceGroupMap: Record<string, {
    invoice_no: string;
    invoice_date: string;
    currency: string;
    exchange_rate: number;
    total_amount_usd: number;
    amount_paid_usd: number;
    trips: any[];
    payments: any[];
    shortage_agreed_usd: number;
    shortage_deducted_usd: number;
    has_shortage: boolean;
    shortage_liters_text?: string;
  }> = {};

  invoices.forEach((inv) => {
    const invNo = inv.invoice_no || "UNINVOICED";
    const rate = parseFloat(inv.exchange_rate) || 2700;
    const isUSD = (inv.currency || "USD") === "USD";
    const totalAmtUSD = isUSD ? (parseFloat(inv.total_amount) || 0) : ((parseFloat(inv.total_amount) || 0) / rate);
    const paidAmtUSD = isUSD ? (parseFloat(inv.amount_paid) || 0) : ((parseFloat(inv.amount_paid) || 0) / rate);

    const tripList = inv.trips && Array.isArray(inv.trips) && inv.trips.length > 0 
      ? inv.trips 
      : [inv];

    const shortageData = tripList[0] ? getTripShortageRecovery(tripList[0].id, tripList[0]) : null;

    if (!invoiceGroupMap[invNo]) {
      invoiceGroupMap[invNo] = {
        invoice_no: invNo,
        invoice_date: inv.invoice_date || "",
        currency: inv.currency || "USD",
        exchange_rate: rate,
        total_amount_usd: 0,
        amount_paid_usd: 0,
        trips: [],
        payments: inv.payments || [],
        shortage_agreed_usd: 0,
        shortage_deducted_usd: 0,
        has_shortage: false,
        shortage_liters_text: ""
      };
    }

    const group = invoiceGroupMap[invNo];
    if (!group.invoice_date && inv.invoice_date) {
      group.invoice_date = inv.invoice_date;
    }
    group.total_amount_usd += totalAmtUSD;
    group.amount_paid_usd += paidAmtUSD;
    group.trips.push(...tripList);

    if (shortageData && shortageData.applicable && shortageData.shortage_amount > 0) {
      group.has_shortage = true;
      group.shortage_agreed_usd += shortageData.agreed_amount;
      group.shortage_deducted_usd += shortageData.shortage_amount;
      if (shortageData.shortage_liters) {
        group.shortage_liters_text = `${shortageData.shortage_liters}L`;
      }
    }
  });

  // Sort unique consolidated invoices by date
  const sortedConsolidatedInvoices = Object.values(invoiceGroupMap).sort((a, b) => {
    const da = a.invoice_date || "";
    const db = b.invoice_date || "";
    return da.localeCompare(db);
  });

  sortedConsolidatedInvoices.forEach((inv) => {
    const totalAmtUSD = inv.total_amount_usd;
    const paidAmtUSD = inv.amount_paid_usd;

    // Unique vehicle plates string
    const vehiclesSet = new Set<string>();
    inv.trips.forEach((t: any) => {
      const vNo = t.vehicle?.vehicle_no || t.vehicle_no;
      if (vNo) vehiclesSet.add(vNo);
    });
    const vehicleCount = vehiclesSet.size;
    const vehiclesLabel = vehicleCount > 0 
      ? (vehicleCount === 1 ? Array.from(vehiclesSet)[0] : `${vehicleCount} Vehicles / Trips`)
      : "Fleet Convoys";

    if (inv.has_shortage && inv.shortage_deducted_usd > 0) {
      // Show Agreed Gross Freight
      running += inv.shortage_agreed_usd;
      totalDebits += inv.shortage_agreed_usd;
      entries.push({
        id: `inv-gross-${inv.invoice_no}`,
        date: inv.invoice_date || new Date().toISOString().split("T")[0],
        type: "INVOICE",
        reference_no: inv.invoice_no,
        description: `Agreed Freight Charge (${vehiclesLabel})`,
        debit: inv.shortage_agreed_usd,
        credit: 0,
        running_balance: running
      });

      // Show Cargo Shortage Loss Deduction by Client
      running -= inv.shortage_deducted_usd;
      totalCredits += inv.shortage_deducted_usd;
      entries.push({
        id: `shortage-adj-${inv.invoice_no}`,
        date: inv.invoice_date || new Date().toISOString().split("T")[0],
        type: "SHORTAGE_ADJUSTMENT",
        reference_no: `DED-${inv.invoice_no}`,
        description: `Offloading Shortage / Evaporation Loss Deducted by Client (${inv.shortage_liters_text || 'Shortage'} - Driver Liable)`,
        debit: 0,
        credit: inv.shortage_deducted_usd,
        running_balance: running
      });
    } else {
      // Standard Consolidated Invoice Debit (ONE single line for the whole invoice!)
      running += totalAmtUSD;
      totalDebits += totalAmtUSD;
      entries.push({
        id: `inv-${inv.invoice_no}`,
        date: inv.invoice_date || new Date().toISOString().split("T")[0],
        type: "INVOICE",
        reference_no: inv.invoice_no,
        description: `Freight Invoiced (${vehiclesLabel})`,
        debit: totalAmtUSD,
        credit: 0,
        running_balance: running
      });
    }

    // Client Payments / Receipts for this invoice
    if (inv.payments && inv.payments.length > 0) {
      inv.payments.forEach((p: any, idx: number) => {
        const payUSD = parseFloat(p.amount_paid) || 0;
        running -= payUSD;
        totalCredits += payUSD;
        entries.push({
          id: `pay-${inv.invoice_no}-${idx}`,
          date: p.payment_date || inv.invoice_date || new Date().toISOString().split("T")[0],
          type: "PAYMENT",
          reference_no: p.receipt_no || `REC-${inv.invoice_no}-${idx + 1}`,
          description: `Payment Received: ${p.notes || "Customer settlement"}`,
          debit: 0,
          credit: payUSD,
          running_balance: running
        });
      });
    } else if (paidAmtUSD > 0) {
      running -= paidAmtUSD;
      totalCredits += paidAmtUSD;
      entries.push({
        id: `pay-settled-${inv.invoice_no}`,
        date: inv.invoice_date || new Date().toISOString().split("T")[0],
        type: "PAYMENT",
        reference_no: `REC-${inv.invoice_no}`,
        description: `Payment Settled on Account`,
        debit: 0,
        credit: paidAmtUSD,
        running_balance: running
      });
    }
  });

  return {
    entries,
    openingBalance: openingBalanceUSD,
    totalDebits,
    totalCredits,
    closingBalance: running
  };
}
