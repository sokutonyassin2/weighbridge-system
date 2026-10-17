// Smart PDF Statement Parser & Importer for Cash & Bank Books
// Automatically extracts transactions from Sudenergy statement PDFs
// (Cash Account Book, NMB USD Currency, NMB Local 614 TZ Currency, Amana USD Account)
// and uploads them directly to Supabase accounting_vouchers with batching and duplication protection.

import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "@/integrations/supabase/client";

// Use local unpkg or cdn worker for browser pdf rendering
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export interface StatementParsedEntry {
  date: string;
  type: "Cr" | "Dr";
  particulars: string;
  voucherNo: string;
  rawVoucherNo: string;
  voucherType: string;
  amount: number;
  currency: "USD" | "TZS";
  narration: string;
}

export interface StatementParseResult {
  detectedTarget: "CASH" | "BANK" | "SUPPLIER";
  detectedAccountName: string;
  currency: "USD" | "TZS";
  openingBalance: number;
  closingBalance: number;
  entries: StatementParsedEntry[];
}

/**
 * Extracts visual plain text lines from all pages of an uploaded PDF file,
 * grouping text items by Y coordinate and sorting by X coordinate ascending (left-to-right).
 */
export async function extractLinesFromPdf(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Group text items by roughly their Y coordinate
    const items = textContent.items as Array<{ str: string; transform: number[] }>;
    const linesMap: { [y: number]: Array<{ x: number; str: string }> } = {};

    for (const item of items) {
      if (!item.str || !item.str.trim()) continue;
      // Y position is index 5 of transform matrix, X position is index 4
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      // Find matching Y within +/- 3 pixels
      let foundY = Object.keys(linesMap).find(k => Math.abs(Number(k) - y) <= 3);
      if (!foundY) {
        foundY = String(y);
        linesMap[Number(foundY)] = [];
      }
      linesMap[Number(foundY)].push({ x, str: item.str });
    }

    // Sort lines from top (higher Y) to bottom (lower Y)
    const sortedY = Object.keys(linesMap).map(Number).sort((a, b) => b - a);
    for (const y of sortedY) {
      // Sort items within this visual line by X coordinate ascending (left-to-right)
      linesMap[y].sort((a, b) => a.x - b.x);
      const lineStr = linesMap[y].map(it => it.str).join(" ").trim();
      if (lineStr) {
        allLines.push(lineStr);
      }
    }
  }

  return allLines;
}

/**
 * Parses statement lines into structured vouchers
 */
export function parseStatementLines(
  lines: string[], 
  fileName: string, 
  targetHint?: "CASH" | "BANK" | "SUPPLIER",
  defaultAccountOrSupplier?: string,
  defaultCurrency?: "USD" | "TZS"
): StatementParseResult {
  let detectedTarget: "CASH" | "BANK" | "SUPPLIER" = targetHint || "CASH";
  let detectedAccountName = defaultAccountOrSupplier || "Cash in Hand";
  let currency: "USD" | "TZS" = defaultCurrency || "USD";
  let accountTag = "CSH";
  let openingBalance = 0;
  let closingBalance = 0;

  const headerSnippet = lines.slice(0, 35).join(" ").toLowerCase() + " " + fileName.toLowerCase();

  // If explicit hint was provided, honor it
  if (targetHint === "SUPPLIER") {
    detectedTarget = "SUPPLIER";
    detectedAccountName = defaultAccountOrSupplier || "Supplier Account";
    currency = defaultCurrency || (headerSnippet.includes("tzs") || headerSnippet.includes("tsh") ? "TZS" : "USD");
    const cleanTag = detectedAccountName.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "") || "SPL";
    accountTag = `SPL-${cleanTag}`;
  } else if (targetHint === "BANK" || headerSnippet.includes("21210076615") || (headerSnippet.includes("nmb") && headerSnippet.includes("usd"))) {
    detectedTarget = "BANK";
    detectedAccountName = defaultAccountOrSupplier || "21210076615 - NMB USD Currency";
    currency = "USD";
    accountTag = "USD615";
  } else if (
    headerSnippet.includes("212110076614") || 
    headerSnippet.includes("21210076614") || 
    headerSnippet.includes("614") || 
    (headerSnippet.includes("nmb") && (headerSnippet.includes("tz") || headerSnippet.includes("local")))
  ) {
    detectedTarget = "BANK";
    detectedAccountName = defaultAccountOrSupplier || "21210076614 - NMB TZ Currency";
    currency = "TZS";
    accountTag = "TZ614";
  } else if (headerSnippet.includes("amana") || headerSnippet.includes("003113610740001")) {
    detectedTarget = "BANK";
    detectedAccountName = defaultAccountOrSupplier || "Amana 003113610740001 - USD Account";
    currency = "USD";
    accountTag = "AMN";
  } else if (headerSnippet.includes("cash account") || fileName.toLowerCase().includes("cash") || targetHint === "CASH") {
    detectedTarget = "CASH";
    detectedAccountName = "Cash in Hand";
    currency = "TZS";
    accountTag = "CSH";
  }

  // Also try to detect specific supplier name from header if in SUPPLIER mode and default was not specific
  if (detectedTarget === "SUPPLIER") {
    // Look for lines like "Ledger: Mantrac" or "Particulars: TotalEnergies" or top line after company name
    for (let h = 0; h < Math.min(15, lines.length); h++) {
      const line = lines[h].trim();
      const matchLedger = line.match(/(?:ledger|account|supplier|vendor|m\/s)\s*[:\-]?\s*([A-Za-z0-9\s&.,'/-]+)/i);
      if (matchLedger && matchLedger[1] && !matchLedger[1].toLowerCase().includes("sudenergy") && matchLedger[1].length > 3) {
        if (!defaultAccountOrSupplier || defaultAccountOrSupplier === "all" || defaultAccountOrSupplier === "Supplier Account") {
          detectedAccountName = matchLedger[1].trim();
          const cleanTag = detectedAccountName.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "") || "SPL";
          accountTag = `SPL-${cleanTag}`;
        }
        break;
      }
    }
  }

  const entries: StatementParsedEntry[] = [];
  let currentDate = "2026-01-01";

  const entries: StatementParsedEntry[] = [];
  let currentDate = "2026-01-01";

  // Strict Voucher Type pattern: only real Tally vouchers
  const vchTypePattern = "(?:Bank Deposit Receipt|Cash Receipt|Payment|Purchase|General Journal|Journal|Debit Note|Credit Note|Korridor Transfer|Contra|Receipt)";
  
  // Format 1: Standard Tally statement line with Voucher Type before Voucher No and Amount
  // e.g. "4-10-2026 Dr Fuel and Oil Expenses Account General Journal SLC /GJRN/01513 997,500.00"
  // or   "Dr Fuel and Oil Expenses Account General Journal SLC /GJRN/01510 997,500.00"
  // or   "13-7-2026 NMB USD Currency Payment SLC/PTY/00506 115,000,000.00"
  const tallyVchRegex = new RegExp(
    "^(?:(\\d{1,2}-(?:[A-Za-z]{3}|\\d{1,2})-\\d{2,4})\\s+)?(.*?)\\s+(" + vchTypePattern + ")\\s+(SLC\\s*\\/\\s*[A-Za-z0-9_-]+(?:\\s*\\/\\s*[A-Za-z0-9_-]+)*|SLC[A-Za-z0-9/_-]+|\\d{4,}|[A-Za-z0-9/_-]{3,})\\s+([\\d,]+(?:\\.\\d{1,2})?)(?:\\s+(Cr|Dr))?$",
    "i"
  );

  // Format 2: Tally Cash/Bank line where Cr/Dr is leading
  // e.g. "01-01-2026 Cr Opening Balance 37.57" or "01-01-2026 Cr Cash Account Contra 10000"
  const leadingCrDrRegex = new RegExp(
    "^(?:(\\d{1,2}-(?:[A-Za-z]{3}|\\d{1,2})-\\d{2,4})\\s+)?(Cr|Dr)\\s+(.*?)\\s+(" + vchTypePattern + ")\\s+(SLC\\s*\\/\\s*[A-Za-z0-9_-]+(?:\\s*\\/\\s*[A-Za-z0-9_-]+)*|SLC[A-Za-z0-9/_-]+|\\d{4,}|[A-Za-z0-9/_-]{3,})\\s+([\\d,]+(?:\\.\\d{1,2})?)$",
    "i"
  );

  let currentEntry: StatementParsedEntry | null = null;
  const narrationLines: string[] = [];

  const finalizeEntry = () => {
    if (currentEntry) {
      if (narrationLines.length > 0) {
        currentEntry.narration = narrationLines.join(" ").trim();
      }
      entries.push(currentEntry);
      currentEntry = null;
      narrationLines.length = 0;
    }
  };

  const parseTallyDate = (dStr: string): string => {
    const parts = dStr.split("-");
    if (parts.length === 3) {
      const day = parts[0].padStart(2, "0");
      let month = parts[1];
      const monthsMap: Record<string, string> = {
        jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
        jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
      };
      const mLower = month.toLowerCase().slice(0, 3);
      if (monthsMap[mLower]) {
        month = monthsMap[mLower];
      } else {
        month = month.padStart(2, "0");
      }
      const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${year}-${month}-${day}`;
    }
    return currentDate;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Skip headers, date ranges, page titles and stationery footers
    if (
      rawLine.startsWith("Brought Forward") || 
      rawLine.startsWith("Carried Over") || 
      rawLine.startsWith("Page ") ||
      rawLine.includes("Page ") ||
      rawLine.startsWith("Date Particulars") ||
      rawLine.startsWith("Sudenergy Logistics") ||
      rawLine.includes("Sudenergy Logistics") ||
      rawLine.includes("Ledger Account :") ||
      rawLine.includes("Ledger Account:") ||
      rawLine.match(/\d{1,2}-[A-Za-z]{3}-\d{4}\s+to\s+\d{1,2}-[A-Za-z]{3}-\d{4}/i) ||
      rawLine.startsWith("TIN NO") ||
      rawLine.startsWith("KONGOWE") ||
      rawLine.startsWith("P.OBOX") ||
      rawLine.startsWith("SIMU -") ||
      rawLine.startsWith("DAR ES") ||
      rawLine.startsWith("TANZANIA") ||
      rawLine.startsWith("continued ...")
    ) {
      continue;
    }

    // Opening Balance check
    if (rawLine.includes("Opening Balance")) {
      const matchAmt = rawLine.match(/(?:Cr|Dr)?\s*Opening Balance\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
                       rawLine.match(/Opening Balance\s*[:\-]?\s*(?:Cr|Dr)?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
                       rawLine.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:Cr|Dr)?\s*Opening Balance/i);
      if (matchAmt) {
        openingBalance = parseFloat(matchAmt[1].replace(/,/g, "")) || 0;
      }
      continue;
    }

    // Closing Balance check
    if (rawLine.includes("Closing Balance")) {
      const matchAmt = rawLine.match(/(?:Cr|Dr)?\s*Closing Balance\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
                       rawLine.match(/Closing Balance\s*[:\-]?\s*(?:Cr|Dr)?\s*([\d,]+(?:\.\d{1,2})?)/i) ||
                       rawLine.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:Cr|Dr)?\s*Closing Balance/i);
      if (matchAmt) {
        closingBalance = parseFloat(matchAmt[1].replace(/,/g, "")) || 0;
      } else {
        // Amount might be following token on same line or numbers on line
        const nums = rawLine.match(/[\d,]+(?:\.\d{1,2})?/g);
        if (nums && nums.length > 0) {
          const cand = parseFloat(nums[nums.length - 1].replace(/,/g, "")) || 0;
          if (cand > 0) closingBalance = cand;
        }
      }
      continue;
    }

    // Match real Tally voucher line
    const match = rawLine.match(tallyVchRegex) || rawLine.match(leadingCrDrRegex);
    if (match) {
      finalizeEntry();

      let datePart: string | undefined;
      let particulars: string;
      let voucherType: string;
      let rawVchNo: string;
      let amountStr: string;
      let trailingCrDr: string | undefined;

      if (rawLine.match(leadingCrDrRegex)) {
        datePart = match[1];
        trailingCrDr = match[2];
        particulars = match[3].trim();
        voucherType = match[4].trim();
        rawVchNo = match[5].replace(/\s+/g, "").trim();
        amountStr = match[6];
      } else {
        datePart = match[1];
        particulars = match[2].trim();
        voucherType = match[3].trim();
        rawVchNo = match[4].replace(/\s+/g, "").trim();
        amountStr = match[5];
        trailingCrDr = match[6];
      }

      if (datePart) {
        currentDate = parseTallyDate(datePart);
      }

      const amount = parseFloat(amountStr.replace(/,/g, "")) || 0;
      const vtLower = voucherType.toLowerCase();

      let type: "Cr" | "Dr" = "Cr";
      if (detectedTarget === "SUPPLIER") {
        // In a Supplier Ledger Statement:
        // Payment / Debit Note = DEBIT to Supplier (reduces payable owed)
        // General Journal / Journal / Purchase / Credit Note = CREDIT to Supplier (increases payable owed)
        if (vtLower.includes("payment") || vtLower.includes("debit note")) {
          type = "Dr";
        } else if (vtLower.includes("journal") || vtLower.includes("purchase") || vtLower.includes("credit note")) {
          type = "Cr";
        } else if (trailingCrDr) {
          type = trailingCrDr.toUpperCase() === "DR" ? "Dr" : "Cr";
        } else {
          type = "Cr";
        }
      } else {
        // In Cash or Bank Statement:
        // Receipt / Deposit = CREDIT (deposit into account)
        // Payment = DEBIT (withdrawal out of account)
        if (vtLower.includes("receipt") || (trailingCrDr && trailingCrDr.toUpperCase() === "CR")) {
          type = "Cr";
        } else if (vtLower.includes("payment") || (trailingCrDr && trailingCrDr.toUpperCase() === "DR")) {
          type = "Dr";
        } else {
          type = "Dr";
        }
      }

      currentEntry = {
        date: currentDate,
        type,
        particulars,
        rawVoucherNo: rawVchNo,
        voucherNo: `${accountTag}-${rawVchNo}`,
        voucherType,
        amount,
        currency,
        narration: particulars
      };
    } else if (currentEntry) {
      // Line didn't match a voucher header: it is a multi-line narration for current voucher
      narrationLines.push(rawLine);
    }
  }

  finalizeEntry();

  return {
    detectedTarget,
    detectedAccountName,
    currency,
    openingBalance,
    closingBalance,
    entries
  };
}

/**
 * Uploads parsed statement entries to Supabase accounting_vouchers in batches
 */
export async function importStatementEntriesToSupabase(
  parseResult: StatementParseResult,
  onProgress?: (processed: number, total: number) => void
): Promise<{ success: boolean; insertedCount: number; errors: string[] }> {
  const { entries, detectedTarget, detectedAccountName, currency } = parseResult;
  const errors: string[] = [];
  let insertedCount = 0;

  const BATCH_SIZE = 50;
  const total = entries.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);

    const payloads = chunk.map(entry => {
      // 1. Handling for SUPPLIER statements
      if (detectedTarget === "SUPPLIER") {
        const supplierName = detectedAccountName;
        const isPayment = entry.type === "Dr" || entry.voucherType?.toLowerCase().includes("payment");
        
        let parentType: "CONTRA" | "PAYMENT" | "RECEIPT" | "JOURNAL" = isPayment ? "PAYMENT" : "JOURNAL";
        let voucherTypeCode = isPayment ? "PAY_GENERAL" : "JOURNAL_GEN";
        let drCode = isPayment ? "2010" : "4020"; // Dr Payables (reduce owed) or Dr Costs (new expense)
        let crCode = isPayment ? "1020" : "2010"; // Cr Bank (money paid) or Cr Payables (increase owed)

        const pLower = (entry.particulars + " " + entry.narration).toLowerCase();
        if (isPayment && pLower.includes("cash")) {
          crCode = "1010"; // Cash
        }

        return {
          voucher_no: entry.voucherNo,
          voucher_type_code: voucherTypeCode,
          parent_type: parentType,
          date: entry.date,
          dr_ledger_code: drCode,
          cr_ledger_code: crCode,
          amount: entry.amount,
          currency: entry.currency,
          exchange_rate: entry.currency === "USD" ? 2700 : 1,
          narration: entry.narration || entry.particulars,
          reference_no: entry.rawVoucherNo || entry.voucherNo,
          bank_name: isPayment ? (crCode === "1020" ? "Corporate Bank Account" : null) : null,
          supplier_name: supplierName,
          status: "posted",
          reconciliation_status: "cleared"
        };
      }

      // 2. Handling for CASH and BANK statements
      let drCode = detectedTarget === "CASH" ? "1010" : "1020";
      let crCode = detectedTarget === "CASH" ? "1010" : "1020";
      let parentType: "CONTRA" | "PAYMENT" | "RECEIPT" | "JOURNAL" = "PAYMENT";
      let voucherTypeCode = "PAY_GENERAL";

      const pLower = (entry.particulars + " " + entry.narration).toLowerCase();

      // Determine opposing ledger
      let opposingLedger = "4010"; // Default Direct Costs
      if (pLower.includes("salaries") || pLower.includes("wages") || pLower.includes("allowance") || pLower.includes("per diem")) {
        opposingLedger = "4010"; // Driver Trip Advances & Allowances
      } else if (pLower.includes("repair") || pLower.includes("spare") || pLower.includes("parking") || pLower.includes("tracking") || pLower.includes("gate")) {
        opposingLedger = "4020"; // Operating Costs
      } else if (pLower.includes("bank charge") || pLower.includes("vat payable") || pLower.includes("commission") || pLower.includes("fee")) {
        opposingLedger = "4030"; // Finance Costs
      } else if (pLower.includes("tra payable") || pLower.includes("withholding") || pLower.includes("wcf") || pLower.includes("gf vehicle") || pLower.includes("suhara")) {
        opposingLedger = "2010"; // Supplier / Govt Payables
      } else if (pLower.includes("alister") || pLower.includes("alm transport") || pLower.includes("african wakawaka") || pLower.includes("barrel haulage") || pLower.includes("polytra") || pLower.includes("steinweg") || pLower.includes("nova esperanza")) {
        opposingLedger = "1030"; // Customer Receivables
      } else if (pLower.includes("energy oil") || pLower.includes("korridor") || pLower.includes("corridor")) {
        opposingLedger = "1040"; // Korridor / Contra account
      }

      if (entry.voucherType?.toLowerCase().includes("contra") || pLower.includes("contra") || pLower.includes("cash account")) {
        parentType = "CONTRA";
        voucherTypeCode = "CONTRA_MAIN";
        if (entry.type === "Dr") {
          drCode = "1010";
          crCode = "1020";
        } else {
          drCode = "1020";
          crCode = "1010";
        }
      } else if (entry.type === "Cr") {
        // Money received into Cash or Bank
        parentType = "RECEIPT";
        voucherTypeCode = detectedTarget === "CASH" ? "REC_CASH" : "REC_BANK";
        drCode = detectedTarget === "CASH" ? "1010" : "1020";
        crCode = opposingLedger;
      } else {
        // Money paid out of Cash or Bank
        parentType = "PAYMENT";
        voucherTypeCode = "PAY_GENERAL";
        drCode = opposingLedger;
        crCode = detectedTarget === "CASH" ? "1010" : "1020";
      }

      return {
        voucher_no: entry.voucherNo,
        voucher_type_code: voucherTypeCode,
        parent_type: parentType,
        date: entry.date,
        dr_ledger_code: drCode,
        cr_ledger_code: crCode,
        amount: entry.amount,
        currency: entry.currency,
        exchange_rate: entry.currency === "USD" ? 2700 : 1,
        narration: entry.narration || entry.particulars,
        reference_no: entry.rawVoucherNo || entry.voucherNo,
        bank_name: detectedTarget === "BANK" ? detectedAccountName : null,
        status: "posted",
        reconciliation_status: "cleared"
      };
    });

    try {
      const { data, error } = await supabase
        .from("accounting_vouchers" as any)
        .upsert(payloads, { onConflict: "voucher_no" })
        .select();

      if (error) {
        errors.push(`Batch ${i / BATCH_SIZE + 1}: ${error.message}`);
      } else {
        insertedCount += (data?.length || payloads.length);
      }
    } catch (e: any) {
      errors.push(`Batch error: ${e.message || String(e)}`);
    }

    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, total), total);
    }
  }

  return {
    success: errors.length === 0,
    insertedCount,
    errors
  };
}
