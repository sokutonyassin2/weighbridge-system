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
        refetchInterval: 10000 // Real-time updates
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
        <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in bg-slate-50/50 min-h-screen">
            <div className="flex items-center gap-2 mb-2">
                <Button variant="link" size="sm" onClick={() => navigate(-1)} className="p-0 text-slate-600 hover:no-underline">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    <span className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Internal Procurement</span>
                </Button>
            </div>

            <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm transition-all hover:shadow-md">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-[#1e293b] flex items-center gap-2">
                            <FileText className="h-5 w-5 text-slate-400" />
                            Weighbridge Requisitions
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">Manage and track procurement requests</p>
                    </div>
                    <Button onClick={() => setIsDialogOpen(true)} className="bg-[#1e293b] hover:bg-slate-800 h-9 px-6 font-semibold rounded text-xs transition-all active:scale-95 shadow-sm">
                        <Plus className="mr-2 h-4 w-4" /> NEW REQUEST
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <Card className="border-slate-200 shadow-sm bg-white">
                    <CardHeader className="py-4 px-4">
                        <CardTitle className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Requests</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 flex justify-start pb-6 px-4">
                        <p className="text-2xl font-bold text-[#1e293b]">{requisitions?.length || 0}</p>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm bg-white border-t-2 border-t-emerald-500">
                    <CardHeader className="py-4 px-4">
                        <CardTitle className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Approved</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 flex justify-start pb-6 px-4">
                        <p className="text-2xl font-bold text-emerald-600">
                            {requisitions?.filter(r => r.status === 'Approved').length || 0}
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm bg-white border-t-2 border-t-amber-500">
                    <CardHeader className="py-4 px-4">
                        <CardTitle className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">Pending</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 flex justify-start pb-6 px-4">
                        <p className="text-2xl font-bold text-amber-600">
                            {requisitions?.filter(r => r.status === 'Pending').length || 0}
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm bg-white border-t-2 border-t-slate-400">
                    <CardHeader className="py-4 px-4">
                        <CardTitle className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Module</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 flex justify-start pb-6 px-4">
                        <p className="text-[12px] font-bold text-slate-600 uppercase tracking-widest">WB-LOGISTICS</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 shadow-sm overflow-hidden rounded-lg bg-white">
                <CardHeader className="bg-[#1e293b] text-white py-3 px-6 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-slate-400" />
                        <CardTitle className="text-xs font-semibold uppercase tracking-widest">Procurement Logs</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-[9px] font-semibold text-slate-400 border-slate-700 uppercase">Secure</Badge>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50/50 border-b border-slate-200">
                            <TableRow>
                                <TableHead className="font-semibold text-slate-600 h-12 text-[11px] uppercase tracking-wider px-6">DATE LOGGED</TableHead>
                                <TableHead className="font-semibold text-slate-600 h-12 text-[11px] uppercase tracking-wider">ITEM DESCRIPTION</TableHead>
                                <TableHead className="font-semibold text-slate-600 h-12 text-[11px] uppercase tracking-wider">QUANTITY</TableHead>
                                <TableHead className="font-semibold text-slate-600 h-12 text-[11px] uppercase tracking-wider">REQUESTED BY</TableHead>
                                <TableHead className="font-semibold text-slate-600 h-12 text-[11px] uppercase tracking-wider text-center px-6">STATUS</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-20">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                                        <p className="mt-2 text-slate-400 font-medium text-[11px] uppercase tracking-widest">Loading Records...</p>
                                    </TableCell>
                                </TableRow>
                            ) : requisitions?.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-20 text-slate-400">
                                        <Package className="h-10 w-10 mx-auto mb-3 opacity-20" />
                                        <p className="font-semibold uppercase tracking-widest text-[11px]">No requisition data found</p>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                requisitions?.map((req) => (
                                    <TableRow key={req.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100">
                                        <TableCell className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-900 text-[13px]">{format(new Date(req.created_at), "MMM dd, yyyy")}</span>
                                                <span className="text-[10px] text-slate-400 font-mono">{format(new Date(req.created_at), "HH:mm:ss")}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <span className="font-semibold text-slate-700 uppercase text-[12px]">{req.item_name}</span>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <div className="flex items-center gap-1">
                                                <span className="font-bold text-sm text-slate-900">{req.quantity_requested}</span>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase">PCS</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <span className="font-medium text-slate-500 uppercase text-[11px]">
                                                {req.profiles?.full_name || "System"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-center px-6 py-4">
                                            <div className="flex flex-col items-center gap-1">
                                                <Badge className={`px-4 py-1 rounded-full font-bold text-[9px] uppercase tracking-widest border-none shadow-sm ${req.status === 'Approved' ? 'bg-indigo-500 text-white' :
                                                    req.status === 'Pending' ? 'bg-slate-500 text-white' :
                                                        req.status === 'Awaiting Approval' ? 'bg-amber-500 text-white' :
                                                            req.status === 'Paid' ? 'bg-emerald-500 text-white' :
                                                                req.status === 'Stocked' ? 'bg-green-600 text-white shadow' :
                                                                    req.status === 'Delivered' ? 'bg-blue-500 text-white' :
                                                                        'bg-rose-500 text-white'
                                                    }`}>
                                                    {req.status}
                                                </Badge>
                                                {req.status === 'Revoked' && req.revoke_reason && (
                                                    <span className="text-[9px] text-rose-500 font-bold italic max-w-[120px] text-center leading-tight">Reason: {req.revoke_reason}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md border-slate-200 shadow-2xl rounded-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-slate-900 text-lg font-bold">
                            <Package className="h-5 w-5 text-slate-400" />
                            Internal Requisition
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4 border-y border-slate-100 my-2">
                        <div className="space-y-1.5">
                            <Label className="font-semibold text-slate-700 text-xs">Item Description</Label>
                            <Input
                                placeholder="e.g. Printer Toner, Tickets"
                                value={newReq.item_name}
                                onChange={(e) => setNewReq({ ...newReq, item_name: e.target.value })}
                                className="h-10 bg-slate-50 border-slate-200 focus:ring-slate-400 rounded"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="font-semibold text-slate-700 text-xs">Quantity</Label>
                            <Input
                                type="number"
                                min="1"
                                value={newReq.quantity}
                                onChange={(e) => setNewReq({ ...newReq, quantity: parseInt(e.target.value) || 1 })}
                                className="h-10 bg-slate-50 border-slate-200 focus:ring-slate-400 rounded"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="font-semibold text-slate-700 text-xs">Notes</Label>
                            <Textarea
                                placeholder="Additional details..."
                                value={newReq.notes}
                                onChange={(e) => setNewReq({ ...newReq, notes: e.target.value })}
                                className="bg-slate-50 border-slate-200 focus:ring-slate-400 rounded"
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded font-semibold text-xs h-10 px-6">CANCEL</Button>
                        <Button
                            onClick={() => createReqMutation.mutate(newReq)}
                            disabled={!newReq.item_name || createReqMutation.isPending}
                            className="bg-[#1e293b] hover:bg-slate-800 shadow shadow-slate-200 rounded font-bold h-10 px-8 text-xs"
                        >
                            {createReqMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "SUBMIT REQUEST"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <footer className="text-center pt-8">
                <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">SUDSUD GROUP | WB-LOGISTICS SYSTEM</p>
            </footer>
        </div>
    );
}
