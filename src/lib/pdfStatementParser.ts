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
  voucherType: string;
  amount: number;
  currency: string;
  narration: string;
}

export interface StatementParseResult {
  detectedTarget: "CASH" | "BANK";
  detectedAccountName: string;
  currency: "USD" | "TZS";
  openingBalance: number;
  closingBalance: number;
  entries: StatementParsedEntry[];
}

/**
 * Extracts plain text lines from all pages of an uploaded PDF file
 */
export async function extractLinesFromPdf(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Group text items by roughly their Y coordinate to reconstruct visual lines
    const items = textContent.items as Array<{ str: string; transform: number[] }>;
    const linesMap: { [y: number]: string[] } = {};

    for (const item of items) {
      if (!item.str || !item.str.trim()) continue;
      // Y position is index 5 of transform matrix
      const y = Math.round(item.transform[5]);
      // Find matching Y within +/- 3 pixels
      let foundY = Object.keys(linesMap).find(k => Math.abs(Number(k) - y) <= 3);
      if (!foundY) {
        foundY = String(y);
        linesMap[Number(foundY)] = [];
      }
      linesMap[Number(foundY)].push(item.str);
    }

    // Sort lines from top (higher Y) to bottom (lower Y)
    const sortedY = Object.keys(linesMap).map(Number).sort((a, b) => b - a);
    for (const y of sortedY) {
      const lineStr = linesMap[y].join(" ").trim();
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
export function parseStatementLines(lines: string[], fileName: string): StatementParseResult {
  let detectedTarget: "CASH" | "BANK" = "CASH";
  let detectedAccountName = "Cash in Hand";
  let currency: "USD" | "TZS" = "TZS";
  let openingBalance = 0;
  let closingBalance = 0;

  const headerSnippet = lines.slice(0, 30).join(" ").toLowerCase() + " " + fileName.toLowerCase();

  if (headerSnippet.includes("21210076615") || (headerSnippet.includes("nmb") && headerSnippet.includes("usd"))) {
    detectedTarget = "BANK";
    detectedAccountName = "NMB Bank (USD Collection)";
    currency = "USD";
  } else if (headerSnippet.includes("212110076614") || headerSnippet.includes("614") || (headerSnippet.includes("nmb") && (headerSnippet.includes("tz") || headerSnippet.includes("local")))) {
    detectedTarget = "BANK";
    detectedAccountName = "NMB Bank (Main Commercial)";
    currency = "TZS";
  } else if (headerSnippet.includes("amana") || headerSnippet.includes("003113610740001")) {
    detectedTarget = "BANK";
    detectedAccountName = "Amana Bank (USD Account)";
    currency = "USD";
  } else if (headerSnippet.includes("cash account") || fileName.toLowerCase().includes("cash")) {
    detectedTarget = "CASH";
    detectedAccountName = "Cash in Hand";
    currency = "TZS";
  }

  const entries: StatementParsedEntry[] = [];
  let currentDate = "2026-01-01";

  // Regex patterns
  // Examples: 
  // "3-1-2026 Cr Kongowe Petrol Stations Account (Cash) 200,000.00 SLC/00001 Cash Receipt"
  // "1-1-2026 Dr GF Vehicle Assembers Ltd 10,000.00UnUsd SLC /PTY/00001 Payment"
  // "Dr (as per details) 20,000.00 SLC /PTY/00005 Payment"
  // "Dr Cash Account 2,078.00UnUsd 7 Contra"
  const entryRegex = /^(?:(\d{1,2}-\d{1,2}-\d{4})\s+)?(Cr|Dr)\s+(.+?)\s+([\d,]+(?:\.\d{1,2})?)(?:UnUsd)?\s*(SLC\s*\/[A-Z0-9/_-]+|\d+)?\s*(Bank Deposit Receipt|Cash Receipt|Payment|General Journal|Korridor Transfer|Contra)?$/i;

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

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Opening Balance check
    if (rawLine.includes("Opening Balance")) {
      const matchAmt = rawLine.match(/([\d,]+(?:\.\d{1,2})?)(?:UnUsd)?/);
      if (matchAmt) {
        openingBalance = parseFloat(matchAmt[1].replace(/,/g, "")) || 0;
      }
      continue;
    }

    // Closing Balance check
    if (rawLine.includes("Closing Balance")) {
      const matchAmt = rawLine.match(/([\d,]+(?:\.\d{1,2})?)(?:UnUsd)?/);
      if (matchAmt) {
        closingBalance = parseFloat(matchAmt[1].replace(/,/g, "")) || 0;
      }
      continue;
    }

    // Skip table headers and pagination lines
    if (
      rawLine.startsWith("Brought Forward") || 
      rawLine.startsWith("Carried Over") || 
      rawLine.startsWith("Page ") ||
      rawLine.startsWith("Date Particulars") ||
      rawLine.startsWith("Sudenergy Logistics") ||
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

    // Check if line contains entry header
    const match = rawLine.match(entryRegex);
    if (match) {
      finalizeEntry();

      const datePart = match[1];
      if (datePart) {
        // Standardize date to YYYY-MM-DD
        const parts = datePart.split("-");
        if (parts.length === 3) {
          const day = parts[0].padStart(2, "0");
          const month = parts[1].padStart(2, "0");
          const year = parts[2];
          currentDate = `${year}-${month}-${day}`;
        }
      }

      const type = (match[2].toUpperCase() === "CR" ? "Cr" : "Dr") as "Cr" | "Dr";
      const particulars = match[3].trim();
      const amount = parseFloat(match[4].replace(/,/g, "")) || 0;
      const voucherNo = (match[5] || "").replace(/\s+/g, "").trim();
      const voucherType = (match[6] || (type === "Cr" ? "Receipt" : "Payment")).trim();

      currentEntry = {
        date: currentDate,
        type,
        particulars,
        voucherNo: voucherNo || `VCH-${Date.now()}-${entries.length}`,
        voucherType,
        amount,
        currency,
        narration: particulars
      };
    } else if (currentEntry) {
      // Collect additional multi-line narration details (e.g. trip number, client name, purpose)
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

  // Ledger Mapping:
  // If CASH target:
  //   Cash ledger code = "1010"
  //   If entry.type === "Cr" (Cash received): DR 1010 (Cash in Hand), CR opposing ledger
  //   If entry.type === "Dr" (Payment disbursed): DR opposing ledger, CR 1010 (Cash in Hand)
  //
  // If BANK target:
  //   Bank ledger code = "1020"
  //   If entry.type === "Cr" (Deposit into bank): DR 1020 (Bank Account), CR opposing ledger
  //   If entry.type === "Dr" (Withdrawal/Cheque paid): DR opposing ledger, CR 1020 (Bank Account)

  const BATCH_SIZE = 50;
  const total = entries.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);

    const payloads = chunk.map(entry => {
      let drCode = "1010";
      let crCode = "1010";
      let parentType: "CONTRA" | "PAYMENT" | "RECEIPT" | "JOURNAL" = "PAYMENT";
      let voucherTypeCode = "PAY_GENERAL";

      const pLower = (entry.particulars + " " + entry.narration).toLowerCase();

      // Determine opposing ledger
      let opposingLedger = "4010"; // Default Direct Costs
      if (pLower.includes("salaries") || pLower.includes("wages") || pLower.includes("allowance")) {
        opposingLedger = "4010"; // Driver Trip Advances & Allowances
      } else if (pLower.includes("repair") || pLower.includes("spare") || pLower.includes("parking") || pLower.includes("tracking")) {
        opposingLedger = "4020"; // Operating Costs
      } else if (pLower.includes("bank charge") || pLower.includes("vat payable") || pLower.includes("commission") || pLower.includes("teller")) {
        opposingLedger = "4030"; // Finance Costs
      } else if (pLower.includes("tra payable") || pLower.includes("withholding") || pLower.includes("wcf")) {
        opposingLedger = "2010"; // Supplier / Govt Payables
      } else if (pLower.includes("alister") || pLower.includes("alm transport") || pLower.includes("african wakawaka") || pLower.includes("barrel haulage") || pLower.includes("polytra") || pLower.includes("steinweg") || pLower.includes("nova esperanza")) {
        opposingLedger = "1030"; // Customer Receivables
      } else if (pLower.includes("gf vehicle") || pLower.includes("saturn") || pLower.includes("super doll") || pLower.includes("suhara")) {
        opposingLedger = "2010"; // Supplier Payables
      } else if (pLower.includes("energy oil") || pLower.includes("korridor")) {
        opposingLedger = "1040"; // Korridor / Contra account
      }

      if (entry.type === "Cr") {
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

      // Check if Contra
      if (entry.voucherType?.toLowerCase().includes("contra") || entry.particulars.toLowerCase().includes("cash account")) {
        parentType = "CONTRA";
        voucherTypeCode = "CONTRA_MAIN";
        if (entry.type === "Dr") {
          drCode = "1010";
          crCode = "1020";
        } else {
          drCode = "1020";
          crCode = "1010";
        }
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
        reference_no: entry.voucherNo,
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
