import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Banknote, Plus, Calendar, Settings, CarFront, FileText, CreditCard, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

export default function CompanyExpenses() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [expenseType, setExpenseType] = useState("");
  const [amount, setAmount] = useState("");
  const [nature, setNature] = useState("");
  
  // Mock data for UI demonstration since table doesn't exist yet
  const [fixedExpenses, setFixedExpenses] = useState<any[]>([
    { id: 1, type: "Insurance", amount: 80000, nature: "Single trip", date: new Date().toISOString() },
    { id: 2, type: "Tracking Device", amount: 70000, nature: "Single trip", date: new Date().toISOString() }
  ]);

  const recordExpense = () => {
    if (!expenseType || !amount) {
      toast({ title: "Error", description: "Please enter type and amount.", variant: "destructive" });
      return;
    }

    const newRecord = {
      id: Date.now(),
      type: expenseType,
      amount: parseFloat(amount),
      nature: nature || "General",
      date: new Date().toISOString()
    };

    setFixedExpenses([newRecord, ...fixedExpenses]);
    toast({ title: "Success", description: "Expense recorded successfully." });
    setIsDialogOpen(false);
    setExpenseType("");
    setAmount("");
    setNature("");
  };

  const deleteExpense = (id: number) => {
    setFixedExpenses(fixedExpenses.filter(e => e.id !== id));
    toast({ title: "Deleted", description: "Expense record removed." });
  };

  const fmtTZS = (v: number) => `TShs ${v.toLocaleString()}`;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <Banknote className="w-8 h-8 text-emerald-600" />
            Company Expenses
          </h1>
          <p className="text-slate-500">Manage Fixed Costs, Petty Cash, and Supplier Payments</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" /> Record Expense
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record New Expense</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Expense Category / Item</label>
                <Input placeholder="e.g. Insurance, Tracking Device, Rent..." value={expenseType} onChange={e => setExpenseType(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount (TShs)</label>
                <Input type="number" placeholder="e.g. 150000" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Nature / Period</label>
                <Input placeholder="e.g. Single trip, Monthly, Yearly" value={nature} onChange={e => setNature(e.target.value)} />
              </div>
              <Button className="w-full bg-emerald-600" onClick={recordExpense}>Save Expense</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="fixed" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3 mb-6 bg-white border border-slate-200">
          <TabsTrigger value="fixed" className="data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700">Fixed Costs</TabsTrigger>
          <TabsTrigger value="petty" className="data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700">Petty Cash</TabsTrigger>
          <TabsTrigger value="ap" className="data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700">Accounts Payable</TabsTrigger>
        </TabsList>

        <TabsContent value="fixed" className="space-y-6 mt-0">
          <Card className="shadow-sm border-emerald-100">
            <CardHeader className="bg-white border-b">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-500" /> Fixed Expenses Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Expense Type</TableHead>
                    <TableHead>Nature</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fixedExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="font-medium text-slate-600">{new Date(expense.date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-bold text-slate-800">{expense.type}</TableCell>
                      <TableCell>{expense.nature}</TableCell>
                      <TableCell className="font-bold text-emerald-700">{fmtTZS(expense.amount)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="text-rose-500 hover:text-rose-700 hover:bg-rose-50" onClick={() => deleteExpense(expense.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="petty" className="mt-0">
          <Card className="p-12 text-center border-2 border-dashed border-slate-200 bg-white">
            <Banknote className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700">Petty Cash Management</h3>
            <p className="text-slate-500 text-sm mt-2">Track daily office and garage cash floats here.</p>
          </Card>
        </TabsContent>

        <TabsContent value="ap" className="mt-0">
          <Card className="p-12 text-center border-2 border-dashed border-slate-200 bg-white">
            <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700">Supplier Payments (AP)</h3>
            <p className="text-slate-500 text-sm mt-2">Manage payments to vendors for fuel, spares, and services.</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
