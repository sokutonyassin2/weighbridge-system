import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Loader2, Package, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";

export default function WeighbridgeRequisitions() {
    const { user, userProfile } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newReq, setNewReq] = useState({ item_name: "", quantity: 1, notes: "" });

    const sb = supabase as any;

    // Fetch requisitions specifically for the weighbridge
    const { data: requisitions, isLoading } = useQuery({
        queryKey: ["weighbridge-requisitions"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_requisitions")
                .select("*, profiles!requested_by(full_name)")
                .eq("target_company", "Energy Feeds Weighbridge")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        },
    });

    const createReqMutation = useMutation({
        mutationFn: async (req: typeof newReq) => {
            const { data, error } = await sb
                .from("garage_requisitions")
                .insert([{
                    item_name: req.item_name,
                    quantity_requested: req.quantity,
                    notes: req.notes,
                    target_company: "Energy Feeds Weighbridge",
                    status: "Pending",
                    requested_by: user?.id,
                    request_type: "General",
                }])
                .select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["weighbridge-requisitions"] });
            toast({ title: "Request Sent", description: "Your procurement request has been logged successfully." });
            setIsDialogOpen(false);
            setNewReq({ item_name: "", quantity: 1, notes: "" });
        },
        onError: (err: any) => {
            toast({ variant: "destructive", title: "Error", description: err.message });
        }
    });

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex items-center gap-4 mb-2">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="print:hidden">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-xl font-bold text-slate-500 uppercase tracking-widest">Internal Procurement</h1>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">WEIGHBRIDGE REQUISITIONS</h1>
                    <p className="text-slate-500 font-medium text-sm tracking-wide">SUDSUD GROUP</p>
                </div>
                <Button onClick={() => setIsDialogOpen(true)} className="bg-slate-900 hover:bg-slate-800 h-10 px-6 font-medium transition-all active:scale-95">
                    <Plus className="mr-2 h-4 w-4" /> NEW REQUEST
                </Button>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
                <Card className="border-slate-100 shadow-sm bg-blue-50/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Total Requests</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-black text-slate-900 text-center">{requisitions?.length || 0}</p>
                    </CardContent>
                </Card>
                <Card className="border-emerald-100 shadow-sm bg-emerald-50/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-emerald-600 uppercase tracking-wider text-center">Approved</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-black text-emerald-700 text-center">
                            {requisitions?.filter(r => r.status === 'Approved').length || 0}
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-amber-100 shadow-sm bg-amber-50/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold text-amber-600 uppercase tracking-wider text-center">Pending</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-black text-amber-700 text-center">
                            {requisitions?.filter(r => r.status === 'Pending').length || 0}
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-slate-100 shadow-sm">
                    <CardHeader className="pb-2 text-center">
                        <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider">Module</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm font-bold text-slate-600 text-center">WB-LOGISTICS</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-100 shadow-xl overflow-hidden rounded-2xl">
                <CardHeader className="bg-slate-900 text-white py-4 px-6">
                    <div className="flex justify-between items-center w-full">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                                <FileText className="h-5 w-5 text-blue-400" />
                                PROCUREMENT LOGS
                            </CardTitle>
                        </div>
                        <Badge variant="outline" className="text-blue-400 border-blue-400/50">SYSTEM PROTECTED</Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50 border-b border-slate-100">
                            <TableRow>
                                <TableHead className="font-bold text-slate-900 h-14">DATE LOGGED</TableHead>
                                <TableHead className="font-bold text-slate-900 h-14">ITEM DESCRIPTION</TableHead>
                                <TableHead className="font-bold text-slate-900 h-14">QUANTITY</TableHead>
                                <TableHead className="font-bold text-slate-900 h-14 text-center">REQUESTED BY</TableHead>
                                <TableHead className="font-bold text-slate-900 h-14 text-center">STATUS</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-20">
                                        <Loader2 className="h-10 w-10 animate-spin mx-auto text-blue-500" />
                                        <p className="mt-2 text-slate-400 font-medium tracking-wide">Securely loading logs...</p>
                                    </TableCell>
                                </TableRow>
                            ) : requisitions?.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-20 text-slate-400">
                                        <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                        <p className="font-bold uppercase tracking-widest text-xs">No procurement data found for Weighbridge</p>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                requisitions?.map((req) => (
                                    <TableRow key={req.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50">
                                        <TableCell className="font-medium text-slate-500">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-900">{format(new Date(req.created_at), "MMM dd, yyyy")}</span>
                                                <span className="text-[10px] text-slate-400 font-mono tracking-tighter">{format(new Date(req.created_at), "HH:mm:ss")}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-bold text-slate-800 uppercase text-xs">{req.item_name}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-lg">{req.quantity_requested}</span>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase">units</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-bold text-slate-600 uppercase text-[10px] text-center">
                                            {req.profiles?.full_name || "System"}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge className={`px-3 py-1 rounded-full font-bold text-[10px] uppercase tracking-widest ${req.status === 'Approved' ? 'bg-emerald-500 text-white' :
                                                req.status === 'Pending' ? 'bg-amber-500 text-white' :
                                                    'bg-rose-500 text-white'
                                                }`}>
                                                {req.status}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <footer className="text-center pt-10">
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.4em]">SUDSUD GROUP | Weighbridge Management System v2.0</p>
            </footer>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md border-slate-100 shadow-2xl rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3 text-slate-900 text-xl font-black">
                            <div className="p-2 bg-blue-600 rounded-lg">
                                <Package className="h-5 w-5 text-white" />
                            </div>
                            INTERNAL REQUISITION
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-6 border-y border-slate-100 my-2">
                        <div className="space-y-2">
                            <Label className="font-bold text-slate-700 text-xs uppercase tracking-wider">Item Name / Description</Label>
                            <Input
                                placeholder="e.g. Printer Toner, Weighbridge Tickets"
                                value={newReq.item_name}
                                onChange={(e) => setNewReq({ ...newReq, item_name: e.target.value })}
                                className="h-12 bg-slate-50 border-slate-200 focus:ring-blue-600 rounded-xl"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-bold text-slate-700 text-xs uppercase tracking-wider">Quantity Required</Label>
                            <Input
                                type="number"
                                min="1"
                                value={newReq.quantity}
                                onChange={(e) => setNewReq({ ...newReq, quantity: parseInt(e.target.value) || 1 })}
                                className="h-12 bg-slate-50 border-slate-200 focus:ring-blue-600 rounded-xl"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-bold text-slate-700 text-xs uppercase tracking-wider">Additional Notes (Optional)</Label>
                            <Textarea
                                placeholder="Any specific details..."
                                value={newReq.notes}
                                onChange={(e) => setNewReq({ ...newReq, notes: e.target.value })}
                                className="bg-slate-50 border-slate-200 focus:ring-blue-600 rounded-xl"
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl font-bold">CANCEL</Button>
                        <Button
                            onClick={() => createReqMutation.mutate(newReq)}
                            disabled={!newReq.item_name || createReqMutation.isPending}
                            className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 rounded-xl font-bold h-12 flex-1"
                        >
                            {createReqMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "SUBMIT REQUEST"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
