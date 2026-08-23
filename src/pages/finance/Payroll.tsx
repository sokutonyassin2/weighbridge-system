import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Banknote, Calendar, CheckCircle, AlertTriangle, FileText, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

export default function Payroll() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<string>("");
  const [salaryAmount, setSalaryAmount] = useState("");
  const [period, setPeriod] = useState("1 Month");
  const [notes, setNotes] = useState("");

  // Fetch Drivers
  const { data: drivers, isLoading: isLoadingDrivers } = useQuery({
    queryKey: ["logistics-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("logistics_drivers").select("*").order("full_name");
      if (error) throw error;
      return data;
    }
  });

  // Fetch Payroll History (mocking with local storage for now if table doesn't exist, but we will try supabase)
  const { data: payrollHistory = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ["finance-payroll"],
    queryFn: async () => {
      // Try fetching from supabase, fallback to local storage if table doesn't exist
      const { data, error } = await supabase.from("finance_payroll").select("*").order("created_at", { ascending: false });
      if (error) {
         console.warn("Table finance_payroll might not exist yet. Falling back to local storage.");
         const local = localStorage.getItem("mock_finance_payroll");
         return local ? JSON.parse(local) : [];
      }
      return data || [];
    }
  });

  const generateSlip = async () => {
    if (!selectedDriver || !salaryAmount) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const driver = drivers?.find(d => d.id === selectedDriver);
    const newRecord = {
      id: crypto.randomUUID(),
      driver_id: selectedDriver,
      driver_name: driver?.full_name,
      amount: parseFloat(salaryAmount),
      period: period,
      notes: notes,
      status: "Paid",
      created_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase.from("finance_payroll").insert([newRecord]);
      if (error) throw error;
    } catch (err) {
       // Fallback to local storage
       const existing = JSON.parse(localStorage.getItem("mock_finance_payroll") || "[]");
       localStorage.setItem("mock_finance_payroll", JSON.stringify([newRecord, ...existing]));
    }

    toast({ title: "Success", description: "Salary slip generated successfully." });
    setIsDialogOpen(false);
    setSelectedDriver("");
    setSalaryAmount("");
    setNotes("");
    queryClient.invalidateQueries({ queryKey: ["finance-payroll"] });
  };

  const deleteSlip = async (id: string) => {
    try {
      const { error } = await supabase.from("finance_payroll").delete().eq("id", id);
      if (error) throw error;
    } catch (err) {
      // Fallback to local storage deletion
      const existing = JSON.parse(localStorage.getItem("mock_finance_payroll") || "[]");
      const updated = existing.filter((record: any) => record.id !== id);
      localStorage.setItem("mock_finance_payroll", JSON.stringify(updated));
    }
    toast({ title: "Deleted", description: "Salary slip has been removed." });
    queryClient.invalidateQueries({ queryKey: ["finance-payroll"] });
  };

  const fmtTZS = (v: number) => `TShs ${v.toLocaleString()}`;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-600" />
            Payroll Management
          </h1>
          <p className="text-slate-500">Manage salaries for drivers and staff outside of trip sheets</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-2" /> Generate Salary Slip
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Process New Payment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Employee / Driver</label>
                <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose driver..." />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers?.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.full_name} ({d.id_number || 'No ID'})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Payment Period</label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1 Month">1 Month</SelectItem>
                    <SelectItem value="2 Months">2 Months</SelectItem>
                    <SelectItem value="Bi-Weekly">Bi-Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Total Amount (TShs)</label>
                <Input type="number" placeholder="e.g. 800000" value={salaryAmount} onChange={e => setSalaryAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes (Optional)</label>
                <Input placeholder="e.g. August & September Salary" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
              <Button className="w-full bg-indigo-600" onClick={generateSlip}>Confirm Payment</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 shadow-sm border-indigo-100">
          <CardHeader className="bg-white border-b">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-500" /> Recent Salary Slips
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">No payroll records found.</TableCell>
                  </TableRow>
                ) : (
                  payrollHistory.map((record: any) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{new Date(record.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>{record.driver_name || 'Unknown'}</TableCell>
                      <TableCell>{record.period}</TableCell>
                      <TableCell className="font-bold text-slate-700">{fmtTZS(record.amount)}</TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          {record.status || 'Paid'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="text-rose-500 hover:text-rose-700 hover:bg-rose-50" onClick={() => deleteSlip(record.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-indigo-100 h-fit">
          <CardHeader className="bg-white border-b">
            <CardTitle className="text-lg font-bold">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Payroll Disbursed</p>
              <h3 className="text-2xl font-bold text-indigo-700 mt-1">
                {fmtTZS(payrollHistory.reduce((sum: number, r: any) => sum + (parseFloat(r.amount) || 0), 0))}
              </h3>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Employees Paid</p>
              <h3 className="text-2xl font-bold text-slate-700 mt-1">
                {new Set(payrollHistory.map((r: any) => r.driver_id)).size}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
