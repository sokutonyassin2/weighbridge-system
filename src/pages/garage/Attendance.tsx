import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Users, CalendarCheck2, FileCheck, Plus, Trash2, Clock, UserCheck, UserX, Loader2 } from "lucide-react";

const GarageAttendance = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const sb = supabase as any;
    const [isAddPersonnelOpen, setIsAddPersonnelOpen] = useState(false);
    const [newPersonnel, setNewPersonnel] = useState({ name: "", position: "" });
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    // Fetch Personnel
    const { data: personnel, isLoading: isLoadingPersonnel } = useQuery({
        queryKey: ["garage-personnel"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_personnel")
                .select("*")
                .eq("is_active", true)
                .order("name");
            if (error) throw error;
            return data;
        }
    });

    // Fetch Attendance for selected date
    const { data: attendance, isLoading: isLoadingAttendance } = useQuery({
        queryKey: ["garage-attendance", selectedDate],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_attendance")
                .select("*")
                .eq("date", selectedDate);
            if (error) throw error;
            return data;
        }
    });

    // Fetch Monthly Attendance for Reports
    const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const { data: monthlyAttendance, isLoading: isLoadingMonthly } = useQuery({
        queryKey: ["garage-attendance-monthly"],
        queryFn: async () => {
            const { data, error } = await sb
                .from("garage_attendance")
                .select("*")
                .gte("date", currentMonthStart);
            if (error) throw error;
            return data;
        }
    });

    const getMonthlyStats = (personnelId: string) => {
        if (!monthlyAttendance) return { present: 0, absent: 0, late: 0, leave: 0 };
        const records = monthlyAttendance.filter((a: any) => a.personnel_id === personnelId);
        return {
            present: records.filter((r: any) => r.status === 'Present').length,
            absent: records.filter((r: any) => r.status === 'Absent').length,
            late: records.filter((r: any) => r.status === 'Late').length,
            leave: records.filter((r: any) => r.status === 'On Leave').length,
        };
    };

    // Mutations
    const addPersonnelMutation = useMutation({
        mutationFn: async (person: typeof newPersonnel) => {
            const { data, error } = await sb.from("garage_personnel").insert([person]).select();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-personnel"] });
            toast({ title: "Success", description: "Personnel added successfully." });
            setIsAddPersonnelOpen(false);
            setNewPersonnel({ name: "", position: "" });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message })
    });

    const markAttendanceMutation = useMutation({
        mutationFn: async ({ personnel_id, status, time_in, time_out }: any) => {
            const { error } = await sb.from("garage_attendance").upsert({
                personnel_id,
                date: selectedDate,
                status,
                time_in: time_in || null,
                time_out: time_out || null
            }, { onConflict: "personnel_id,date" });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["garage-attendance", selectedDate] });
            toast({ title: "Updated", description: "Attendance status recorded." });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message })
    });

    return (
        <div className="space-y-6 p-6 animate-fade-in bg-slate-50/30 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Users className="w-6 h-6 text-indigo-600" />
                        Personnel Attendance Management
                    </h1>
                    <p className="text-[11px] text-slate-500 mt-1">Daily tracking and reporting for garage staff.</p>
                </div>
            </div>

            <Tabs defaultValue="daily" className="w-full">
                <TabsList className="bg-white border-slate-200 p-1 rounded-xl shadow-sm mb-6">
                    <TabsTrigger value="daily" className="rounded-lg px-6 py-2 gap-2 text-[11px] font-bold uppercase tracking-wider">
                        <CalendarCheck2 className="w-4 h-4" /> Daily Log
                    </TabsTrigger>
                    <TabsTrigger value="personnel" className="rounded-lg px-6 py-2 gap-2 text-[11px] font-bold uppercase tracking-wider">
                        <UserCheck className="w-4 h-4" /> Personnel List
                    </TabsTrigger>
                    <TabsTrigger value="reports" className="rounded-lg px-6 py-2 gap-2 text-[11px] font-bold uppercase tracking-wider">
                        <FileCheck className="w-4 h-4" /> Attendance Reports
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="daily">
                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between py-4">
                            <CardTitle className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                <Clock className="w-5 h-5 text-indigo-500" />
                                Daily Attendance Log
                            </CardTitle>
                            <Input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-40 h-9 text-[11px] bg-white border-slate-200"
                            />
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/40 border-b border-slate-100">
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6 text-center">Status</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Personnel Name</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Position</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Time In</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Time Out</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingPersonnel ? (
                                        <TableRow><TableCell colSpan={5} className="h-40 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500" /></TableCell></TableRow>
                                    ) : personnel?.map((p) => {
                                        const record = attendance?.find(a => a.personnel_id === p.id);
                                        return (
                                            <TableRow key={p.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                                <TableCell className="py-4 px-6 text-center">
                                                    <Select
                                                        value={record?.status || "PENDING"}
                                                        onValueChange={(status) => markAttendanceMutation.mutate({ personnel_id: p.id, status })}
                                                    >
                                                        <SelectTrigger className={`w-36 h-8 text-[11px] font-bold uppercase mx-auto ${record?.status === 'Present' ? 'bg-green-50 text-green-700 border-green-200' :
                                                            record?.status === 'Absent' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                record?.status === 'Late' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                    record?.status === 'On Leave' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                                        'bg-white border-slate-200'
                                                            }`}>
                                                            <SelectValue placeholder="MARK STATUS" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="Present" className="text-[11px]">PRESENT</SelectItem>
                                                            <SelectItem value="Absent" className="text-[11px]">ABSENT</SelectItem>
                                                            <SelectItem value="Late" className="text-[11px]">LATE</SelectItem>
                                                            <SelectItem value="On Leave" className="text-[11px]">ON LEAVE</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell className="text-[11px] font-bold text-slate-800 py-4 px-6">{p.name}</TableCell>
                                                <TableCell className="py-4 px-6">
                                                    <Badge variant="outline" className="text-[11px] font-medium py-0.5 px-2 bg-slate-50 text-slate-500 border-slate-200">
                                                        {p.position}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="py-4 px-6">
                                                    <Input
                                                        type="time"
                                                        value={record?.time_in || ""}
                                                        onChange={(e) => markAttendanceMutation.mutate({ personnel_id: p.id, status: record?.status || 'Present', time_in: e.target.value, time_out: record?.time_out })}
                                                        className="h-8 w-28 text-[11px] bg-white border-slate-100"
                                                    />
                                                </TableCell>
                                                <TableCell className="py-4 px-6">
                                                    <Input
                                                        type="time"
                                                        value={record?.time_out || ""}
                                                        onChange={(e) => markAttendanceMutation.mutate({ personnel_id: p.id, status: record?.status || 'Present', time_in: record?.time_in, time_out: e.target.value })}
                                                        className="h-8 w-28 text-[11px] bg-white border-slate-100"
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="personnel">
                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between py-4">
                            <CardTitle className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                <Users className="w-5 h-5 text-indigo-500" />
                                Personnel Roster
                            </CardTitle>
                            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-[11px] font-bold h-9 gap-2" onClick={() => setIsAddPersonnelOpen(true)}>
                                <Plus className="w-4 h-4" /> Add Personnel
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/40 border-b border-slate-100">
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Name</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Position</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Status</TableHead>
                                        <TableHead className="text-right text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {personnel?.map((p) => (
                                        <TableRow key={p.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                            <TableCell className="text-[11px] font-bold text-slate-800 py-4 px-6">{p.name}</TableCell>
                                            <TableCell className="py-4 px-6">
                                                <Badge variant="outline" className="text-[11px] font-medium py-0.5 px-2 bg-slate-50 text-slate-500 border-slate-200 uppercase tracking-wider">
                                                    {p.position}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-4 px-6">
                                                <Badge className="bg-green-500 text-white text-[10px] font-bold uppercase px-2 shadow-sm border-none">Active</Badge>
                                            </TableCell>
                                            <TableCell className="text-right py-4 px-6">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50">
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

                <TabsContent value="reports">
                    <Card className="border-none shadow-sm bg-white overflow-hidden">
                        <CardHeader className="bg-slate-50/50 border-b flex flex-row items-center justify-between py-4">
                            <CardTitle className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                <FileCheck className="w-5 h-5 text-indigo-500" />
                                Monthly Attendance Summary ({new Date().toLocaleString('default', { month: 'long', year: 'numeric' })})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50/40 border-b border-slate-100">
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Name</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-400 py-4 px-6">Position</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-green-600 py-4 px-6 text-center">Present</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-red-600 py-4 px-6 text-center">Absent</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-amber-600 py-4 px-6 text-center">Late</TableHead>
                                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-blue-600 py-4 px-6 text-center">Leave</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingPersonnel || isLoadingMonthly ? (
                                        <TableRow><TableCell colSpan={6} className="h-40 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500" /></TableCell></TableRow>
                                    ) : personnel?.map((p) => {
                                        const stats = getMonthlyStats(p.id);
                                        return (
                                            <TableRow key={p.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50">
                                                <TableCell className="text-[11px] font-bold text-slate-800 py-4 px-6">{p.name}</TableCell>
                                                <TableCell className="py-4 px-6 text-[11px] text-slate-500 uppercase">{p.position}</TableCell>
                                                <TableCell className="text-center font-bold text-green-600 py-4 px-6 bg-green-50/10">{stats.present}</TableCell>
                                                <TableCell className="text-center font-bold text-red-600 py-4 px-6 bg-red-50/10">{stats.absent}</TableCell>
                                                <TableCell className="text-center font-bold text-amber-600 py-4 px-6 bg-amber-50/10">{stats.late}</TableCell>
                                                <TableCell className="text-center font-bold text-blue-600 py-4 px-6 bg-blue-50/10">{stats.leave}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {!isLoadingMonthly && personnel?.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="py-20 text-center text-slate-400 text-[11px] italic">
                                                No personnel records found to generate reports.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <Dialog open={isAddPersonnelOpen} onOpenChange={setIsAddPersonnelOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Users className="w-5 h-5 text-indigo-600" />
                            Registered New Staff
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">Personnel Name</Label>
                            <Input
                                placeholder="Full Name"
                                value={newPersonnel.name}
                                onChange={(e) => setNewPersonnel({ ...newPersonnel, name: e.target.value })}
                                className="h-10 text-sm border-slate-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase">Position / Role</Label>
                            <Input
                                placeholder="e.g. Mechanic, Electrician"
                                value={newPersonnel.position}
                                onChange={(e) => setNewPersonnel({ ...newPersonnel, position: e.target.value })}
                                className="h-10 text-sm border-slate-200"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddPersonnelOpen(false)} className="h-10 text-[11px] font-bold uppercase">Cancel</Button>
                        <Button
                            className="h-10 text-[11px] font-bold uppercase bg-indigo-600 hover:bg-indigo-700"
                            onClick={() => addPersonnelMutation.mutate(newPersonnel)}
                            disabled={!newPersonnel.name || !newPersonnel.position || addPersonnelMutation.isPending}
                        >
                            {addPersonnelMutation.isPending ? "Adding..." : "Add Personnel"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default GarageAttendance;
