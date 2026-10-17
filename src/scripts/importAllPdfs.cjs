const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");

// Read Supabase credentials from .env
const env = Object.fromEntries(
  fs.readFileSync(".env", "utf-8")
    .split("\n")
    .filter(l => l.includes("="))
    .map(l => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "")];
    })
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const lineRegex = /^(?:(\d{1,2}-\d{1,2}-\d{4})\s+)?(Cr|Dr)\s+(.+?)\s+(Bank Deposit Receipt|Cash Receipt|Payment|General Journal|Korridor Transfer|Contra)\s+(SLC\s*\/[A-Z0-9/_-]+|SLC[A-Z0-9/_-]+|\d+)\s+([\d,]+(?:\.\d{1,2})?)(?:UnUsd)?$/i;

async function extractLines(filename) {
  const data = new Uint8Array(fs.readFileSync(filename));
  const pdf = await pdfjs.getDocument({ data }).promise;
  const allLines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items;

    const linesMap = {};
    for (const item of items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);
      let foundY = Object.keys(linesMap).find(k => Math.abs(Number(k) - y) <= 3);
      if (!foundY) {
        foundY = String(y);
        linesMap[Number(foundY)] = [];
      }
      linesMap[Number(foundY)].push({ x, str: item.str });
    }
    const sortedY = Object.keys(linesMap).map(Number).sort((a, b) => b - a);
    for (const y of sortedY) {
      linesMap[y].sort((a, b) => a.x - b.x);
      const lineStr = linesMap[y].map(it => it.str).join(" ").trim();
      if (lineStr) allLines.push(lineStr);
    }
  }

  return allLines;
}

function parseLines(allLines, target, bankName, currency, tag) {
  let openBal = 0;
  let closeBal = 0;

  for (const l of allLines) {
    if (l.includes("Opening Balance")) {
      const m = l.match(/Opening Balance\s+([\d,]+(?:\.\d{1,2})?)/i);
      if (m) openBal = parseFloat(m[1].replace(/,/g, ""));
    }
    if (l.includes("Closing Balance")) {
      const m = l.match(/Closing Balance\s+([\d,]+(?:\.\d{1,2})?)/i);
      if (m) closeBal = parseFloat(m[1].replace(/,/g, ""));
    }
  }

  const entries = [];
  let currentDate = "2026-01-01";
  let currentEntry = null;
  const narrationLines = [];

  const finalize = () => {
    if (currentEntry) {
      if (narrationLines.length > 0) {
        currentEntry.narration = narrationLines.join(" ").trim();
      }
      entries.push(currentEntry);
      currentEntry = null;
      narrationLines.length = 0;
    }
  };

  for (let i = 0; i < allLines.length; i++) {
    const l = allLines[i];
    if (
      l.includes("Opening Balance") ||
      l.includes("Closing Balance") ||
      l.startsWith("Date Particulars") ||
      l.startsWith("Sudenergy") ||
      l.startsWith("TIN NO") ||
      l.startsWith("KONGOWE") ||
      l.startsWith("P.OBOX") ||
      l.startsWith("SIMU -") ||
      l.startsWith("DAR ES") ||
      l.startsWith("TANZANIA") ||
      l.startsWith("Page ") ||
      l.startsWith("Brought Forward") ||
      l.startsWith("Carried Over") ||
      l.startsWith("continued ...")
    ) {
      continue;
    }

    const m = l.match(lineRegex);
    if (m) {
      finalize();
      if (m[1]) {
        const parts = m[1].split("-");
        currentDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
      const type = m[2].toUpperCase(); // CR or DR
      const particulars = m[3].trim();
      const vchType = m[4].trim();
      const rawVchNo = m[5].replace(/\s+/g, "").trim();
      const amt = parseFloat(m[6].replace(/,/g, "")) || 0;

      // Map Opposing Ledger
      const pLower = particulars.toLowerCase();
      let opposingLedger = "4010"; // Direct Costs (default)
      if (pLower.includes("salaries") || pLower.includes("allowance") || pLower.includes("per diem")) {
        opposingLedger = "4010";
      } else if (pLower.includes("repair") || pLower.includes("spare") || pLower.includes("parking") || pLower.includes("tracking") || pLower.includes("gate")) {
        opposingLedger = "4020";
      } else if (pLower.includes("bank charge") || pLower.includes("vat payable") || pLower.includes("commission") || pLower.includes("fee")) {
        opposingLedger = "4030";
      } else if (pLower.includes("tra payable") || pLower.includes("withholding") || pLower.includes("gf vehicle") || pLower.includes("suhara")) {
        opposingLedger = "2010";
      } else if (pLower.includes("alister") || pLower.includes("alm transport") || pLower.includes("barrel haul") || pLower.includes("africa wakawaka") || pLower.includes("nova esperanza") || pLower.includes("steinweg")) {
        opposingLedger = "1030";
      } else if (pLower.includes("korridor") || pLower.includes("corridor")) {
        opposingLedger = "1040";
      }

      let drCode = target === "CASH" ? "1010" : "1020";
      let crCode = target === "CASH" ? "1010" : "1020";
      let parentType = "PAYMENT";
      let voucherTypeCode = "PAY_GENERAL";

      // Precise Voucher Type Mapping:
      if (vchType.toLowerCase() === "contra") {
        parentType = "CONTRA";
        voucherTypeCode = "CONTRA_MAIN";
        if (target === "BANK") {
          // In Bank statement: Dr Cash Account means money transferred from Bank to Cash
          drCode = "1010";
          crCode = "1020";
        } else {
          // In Cash statement: Cr Bank means cash received from Bank
          drCode = "1010";
          crCode = "1020";
        }
      } else if (type === "CR") {
        // Tally Credit in Cash/Bank Book = MONEY IN (Inflow/Receipt into account)
        parentType = "RECEIPT";
        voucherTypeCode = target === "CASH" ? "REC_CASH" : "REC_BANK";
        drCode = target === "CASH" ? "1010" : "1020";
        crCode = opposingLedger;
      } else {
        // Tally Debit in Cash/Bank Book = MONEY OUT (Outflow/Payment from account)
        parentType = "PAYMENT";
        voucherTypeCode = "PAY_GENERAL";
        drCode = opposingLedger;
        crCode = target === "CASH" ? "1010" : "1020";
      }

      currentEntry = {
        voucher_no: `${tag}-${rawVchNo}`,
        voucher_type_code: voucherTypeCode,
        parent_type: parentType,
        date: currentDate,
        dr_ledger_code: drCode,
        cr_ledger_code: crCode,
        amount: amt,
        currency: currency,
        exchange_rate: currency === "USD" ? 2700 : 1,
        narration: particulars,
        reference_no: rawVchNo,
        bank_name: target === "BANK" ? bankName : null,
        status: "posted",
        reconciliation_status: "cleared"
      };
    } else if (currentEntry) {
      narrationLines.push(l);
    }
  }

  finalize();

  return { openBal, closeBal, entries };
}

async function run() {
  console.log("=== STEP 1: Updating Accounting Banks and Ledgers in Supabase ===");

  await supabase
    .from("accounting_banks")
    .update({ currency: "USD", opening_balance: 145349.00 })
    .eq("name", "21210076615 - NMB USD Currency");

  await supabase
    .from("accounting_banks")
    .update({ currency: "TZS", opening_balance: 30305046.21 })
    .eq("name", "21210076614 - NMB TZ Currency");

  await supabase
    .from("accounting_banks")
    .update({ currency: "USD", opening_balance: 0.00 })
    .eq("name", "Amana 003113610740001 - USD Account");

  await supabase
    .from("accounting_ledgers")
    .update({ currency: "TZS", opening_balance: 37.57 })
    .eq("code", "1010");

  console.log("Banks & Ledgers updated.");

  console.log("\n=== STEP 2: Parsing all 4 Statements ===");
  const amanaLines = await extractLines("Amana 003113610740001 - USD Account.pdf");
  const amanaParsed = parseLines(amanaLines, "BANK", "Amana 003113610740001 - USD Account", "USD", "AMN");

  const nmbUsdLines = await extractLines("21210076615 - NMB USD Currency.pdf");
  const nmbUsdParsed = parseLines(nmbUsdLines, "BANK", "21210076615 - NMB USD Currency", "USD", "USD615");

  const nmbTzsLines = await extractLines("212110076614 - NMB TZ Currency.pdf");
  const nmbTzsParsed = parseLines(nmbTzsLines, "BANK", "21210076614 - NMB TZ Currency", "TZS", "TZ614");

  const cashLines = await extractLines("CASH ACCOUNT.pdf");
  const cashParsed = parseLines(cashLines, "CASH", "Cash in Hand", "TZS", "CSH");

  const allVouchers = [
    ...amanaParsed.entries,
    ...nmbUsdParsed.entries,
    ...nmbTzsParsed.entries,
    ...cashParsed.entries
  ];

  console.log(`\n=== STEP 3: Re-uploading ${allVouchers.length} Total Vouchers to Supabase ===`);

  const BATCH_SIZE = 100;
  let inserted = 0;
  for (let i = 0; i < allVouchers.length; i += BATCH_SIZE) {
    const chunk = allVouchers.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("accounting_vouchers")
      .upsert(chunk, { onConflict: "voucher_no" });

    if (error) {
      console.error(`Error at batch ${i}:`, error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    process.stdout.write(`\rProgress: ${inserted} / ${allVouchers.length} uploaded...`);
  }
  console.log("\nDone uploading all vouchers successfully!");
}

run().catch(console.error);
