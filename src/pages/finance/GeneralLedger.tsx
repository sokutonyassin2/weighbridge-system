import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookOpen, FileCheck, Landmark, Plus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GeneralLedger() {
  const [ledgerEntries, setLedgerEntries] = useState([
    { id: 1, date: new Date().toISOString(), desc: "Trip Revenue Deposit (Trip #T-1002)", type: "Credit", amount: 1500000, balance: 1500000 },
    { id: 2, date: new Date().toISOString(), desc: "Fuel Payment to Vendor", type: "Debit", amount: -400000, balance: 1100000 },
    { id: 3, date: new Date().toISOString(), desc: "Driver Salary Disbursement", type: "Debit", amount: -800000, balance: 300000 }
  ]);

  const fmtTZS = (v: number) => `TShs ${Math.abs(v).toLocaleString()}`;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-blue-600" />
            General Ledger
          </h1>
          <p className="text-slate-500">Centralized view of all financial transactions and bank reconciliations</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <FileCheck className="w-4 h-4 mr-2" /> Start Reconciliation
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="md:col-span-3 shadow-sm border-blue-100">
          <CardHeader className="bg-white border-b">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Landmark className="w-5 h-5 text-blue-500" /> Ledger Entries
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Debit / Credit</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Running Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgerEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium text-slate-600">{new Date(entry.date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium text-slate-800">{entry.desc}</TableCell>
                    <TableCell>
                      {entry.type === 'Credit' ? (
                        <span className="flex items-center text-emerald-600 text-xs font-bold"><ArrowUpRight className="w-3 h-3 mr-1" /> CR</span>
                      ) : (
                        <span className="flex items-center text-rose-600 text-xs font-bold"><ArrowDownRight className="w-3 h-3 mr-1" /> DR</span>
                      )}
                    </TableCell>
                    <TableCell className={entry.amount > 0 ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"}>
                      {entry.amount > 0 ? '+' : '-'}{fmtTZS(entry.amount)}
                    </TableCell>
                    <TableCell className="font-bold text-blue-900">{fmtTZS(entry.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-blue-100 h-fit">
          <CardHeader className="bg-white border-b">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Landmark className="w-5 h-5 text-blue-500" /> Bank Balances
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div>
              <p className="text-sm font-medium text-slate-500">Main Operating Account</p>
              <h3 className="text-2xl font-bold text-blue-700 mt-1">TShs 300,000</h3>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Last Reconciled</p>
              <h3 className="text-sm font-bold text-slate-700 mt-1">Never</h3>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
