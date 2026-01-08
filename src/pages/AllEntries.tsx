import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { StatusBadge } from "@/components/StatusBadge";

const AllEntries = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { userRole } = useAuth();

  // Filter states
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedShift, setSelectedShift] = useState("all");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const { data: shifts } = useQuery({
    queryKey: ["shifts-for-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .order("shift_date", { ascending: false })
        .limit(30);
      
      if (error) throw error;
      return data;
    },
  });

  const { data: entries, isLoading } = useQuery({
    queryKey: ["all-entries", startDate, endDate, selectedShift, startTime, endTime, selectedStatus],
    queryFn: async () => {
      let query = supabase
        .from("vehicle_entries")
        .select(`
          *,
          vehicle_types (type_name, category)
        `);

      // Apply date range filter
      if (startDate) {
        query = query.gte("entry_time", new Date(startDate).toISOString());
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        query = query.lte("entry_time", endDateTime.toISOString());
      }

      // Apply shift filter
      if (selectedShift !== "all") {
        query = query.eq("shift_id", selectedShift);
      }

      // Apply status filter
      if (selectedStatus !== "all") {
        query = query.eq("status", selectedStatus);
      }

      query = query.order("entry_time", { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      // Apply time range filter client-side (more flexible)
      let filteredData = data;
      if (startTime || endTime) {
        filteredData = data?.filter(entry => {
          const entryDate = new Date(entry.entry_time);
          const entryHour = entryDate.getHours();
          const entryMinute = entryDate.getMinutes();
          const entryTimeValue = entryHour * 60 + entryMinute;

          if (startTime) {
            const [startHour, startMinute] = startTime.split(":").map(Number);
            const startTimeValue = startHour * 60 + startMinute;
            if (entryTimeValue < startTimeValue) return false;
          }

          if (endTime) {
            const [endHour, endMinute] = endTime.split(":").map(Number);
            const endTimeValue = endHour * 60 + endMinute;
            if (entryTimeValue > endTimeValue) return false;
          }

          return true;
        });
      }

      return filteredData;
    },
  });

  const { data: penalties } = useQuery({
    queryKey: ["penalties-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("penalties")
        .select("*");

      if (error) throw error;
      return data;
    },
  });

  const getPenaltyInfo = (entryId: string) => {
    const entryPenalties = penalties?.filter(p => p.entry_id === entryId) || [];
    const count = entryPenalties.length;
    const total = entryPenalties.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);
    return { count, total };
  };

  const deleteMutation = useMutation({
    mutationFn: async (entryId: string) => {
      // Delete related records first
      await supabase.from("payments").delete().eq("entry_id", entryId);
      await supabase.from("weigh_records").delete().eq("entry_id", entryId);
      await supabase.from("pending_weighs").delete().eq("entry_id", entryId);
      
      // Then delete the entry
      const { error } = await supabase
        .from("vehicle_entries")
        .delete()
        .eq("id", entryId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-entries"] });
      toast({
        title: "Entry deleted",
        description: "The entry and all related records have been deleted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete entry: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const bulkDeleteMutation = useMutation({
    mutationFn: async (entryIds: string[]) => {
      setIsBulkDeleting(true);
      for (const entryId of entryIds) {
        // Delete related records first
        await supabase.from("payments").delete().eq("entry_id", entryId);
        await supabase.from("weigh_records").delete().eq("entry_id", entryId);
        await supabase.from("pending_weighs").delete().eq("entry_id", entryId);
        
        // Then delete the entry
        const { error } = await supabase
          .from("vehicle_entries")
          .delete()
          .eq("id", entryId);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-entries"] });
      queryClient.invalidateQueries({ queryKey: ["pending-entries"] });
      queryClient.invalidateQueries({ queryKey: ["overdue-pending"] });
      toast({
        title: "Entries deleted",
        description: "All filtered entries and their related records have been deleted.",
      });
      setIsBulkDeleting(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete entries: ${error.message}`,
        variant: "destructive",
      });
      setIsBulkDeleting(false);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setSelectedShift("all");
    setStartTime("");
    setEndTime("");
    setSelectedStatus("all");
  };

  return (
    <div className="p-6 space-y-6">
      {/* Filters Section */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Date Range */}
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {/* Shift Filter */}
            <div className="space-y-2">
              <Label>Shift</Label>
              <Select value={selectedShift} onValueChange={setSelectedShift}>
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shifts</SelectItem>
                  {shifts?.map((shift) => (
                    <SelectItem key={shift.id} value={shift.id}>
                      {shift.shift_name} - {format(new Date(shift.shift_date), "dd/MM/yyyy")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time Range */}
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="AwaitingSecondWeigh">Awaiting Second Weigh</SelectItem>
                  <SelectItem value="AwaitingFirstWeigh">Awaiting First Weigh</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={clearFilters}>
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Entries Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Vehicle Entries ({entries?.length || 0})</CardTitle>
          {userRole === "admin" && entries && entries.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isBulkDeleting}
                >
                  {isBulkDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete All ({entries.length})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete All Filtered Entries?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      This will permanently delete <strong>{entries.length}</strong> entries and all their related records.
                    </p>
                    <div className="p-3 bg-muted rounded-md text-sm space-y-1">
                      <p className="font-medium">This action will also delete:</p>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                        <li>Associated payment records</li>
                        <li>Associated weigh records</li>
                        <li>Associated pending weigh records</li>
                      </ul>
                    </div>
                    <p className="text-destructive font-medium">⚠️ This action cannot be undone.</p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => bulkDeleteMutation.mutate(entries.map(e => e.id))}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle No</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Entry Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Penalties</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No entries found
                  </TableCell>
                </TableRow>
              ) : (
                entries?.map((entry) => {
                  const penaltyInfo = getPenaltyInfo(entry.id);
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.vehicle_no}</TableCell>
                      <TableCell>{entry.vehicle_types?.type_name || "N/A"}</TableCell>
                      <TableCell>{entry.vehicle_types?.category || "N/A"}</TableCell>
                      <TableCell>{entry.driver_name || "N/A"}</TableCell>
                      <TableCell>
                        {format(new Date(entry.entry_time), "dd/MM/yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={entry.status} category={entry.category} />
                      </TableCell>
                      <TableCell>
                        {penaltyInfo.count > 0 ? (
                          <div className="text-sm">
                            <Badge variant="destructive" className="mb-1">{penaltyInfo.count}</Badge>
                            <div className="text-muted-foreground">{penaltyInfo.total.toLocaleString()} TShs</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">None</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                      {userRole === "admin" && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteMutation.isPending}
                            >
                              {deleteMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this entry and all related records (weigh records, payments, etc.). This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(entry.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AllEntries;
