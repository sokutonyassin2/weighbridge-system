import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { AlertTriangle, DollarSign, Scale } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function AuditTrail() {
  const { userRole } = useAuth();

  const { data: penalties = [] } = useQuery({
    queryKey: ["penalties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("penalties")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const { data: overdueVehicles = [] } = useQuery({
    queryKey: ["overdue-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_weighs")
        .select("*")
        .eq("is_overdue", true)
        .order("expected_return_time", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const { data: exhaustedChances = [] } = useQuery({
    queryKey: ["exhausted-chances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_weighs")
        .select("*")
        .gte("weigh_attempts", 2)
        .eq("return_status", "Pending")
        .order("first_weigh_time", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["all-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
  });

  const totalPenalties = penalties.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  const pendingPayments = payments.filter((p: any) => p.payment_status === "Pending");
  const totalPending = pendingPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Trail & Analytics</h1>
        <p className="text-muted-foreground">
          {userRole === "admin" ? "Complete system audit and analytics" : "Your shift audit trail"}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Overdue Vehicles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overdueVehicles.length}</div>
            <p className="text-xs text-muted-foreground">Past 12-hour window</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Scale className="h-4 w-4 text-orange-500" />
              Exhausted Chances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{exhaustedChances.length}</div>
            <p className="text-xs text-muted-foreground">Used 2 free weighs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              Total Penalties
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">TSh {totalPenalties.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{penalties.length} penalty events</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="penalties">
        <TabsList>
          <TabsTrigger value="penalties">Penalties</TabsTrigger>
          <TabsTrigger value="overdue">Overdue Vehicles</TabsTrigger>
          <TabsTrigger value="exhausted">Exhausted Chances</TabsTrigger>
          <TabsTrigger value="payments">All Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="penalties">
          <Card>
            <CardHeader>
              <CardTitle>Penalty Records</CardTitle>
              <CardDescription>All penalty charges applied to vehicles</CardDescription>
            </CardHeader>
            <CardContent>
              {penalties.length === 0 ? (
                <p className="text-muted-foreground">No penalties recorded</p>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Vehicle No</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {penalties.map((penalty: any) => (
                        <TableRow key={penalty.id}>
                          <TableCell className="font-mono text-sm">
                            {format(new Date(penalty.created_at), "MMM dd, HH:mm")}
                          </TableCell>
                          <TableCell className="font-medium">{penalty.vehicle_no}</TableCell>
                          <TableCell>
                            <Badge variant="destructive">{penalty.penalty_type}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{penalty.reason}</TableCell>
                          <TableCell className="text-right font-bold">
                            TSh {Number(penalty.amount).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overdue">
          <Card>
            <CardHeader>
              <CardTitle>Overdue Vehicles</CardTitle>
              <CardDescription>Vehicles that exceeded the 12-hour return window</CardDescription>
            </CardHeader>
            <CardContent>
              {overdueVehicles.length === 0 ? (
                <p className="text-muted-foreground">No overdue vehicles</p>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vehicle No</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>First Weigh</TableHead>
                        <TableHead>Expected Return</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overdueVehicles.map((vehicle: any) => (
                        <TableRow key={vehicle.id}>
                          <TableCell className="font-medium">{vehicle.vehicle_no}</TableCell>
                          <TableCell>{vehicle.category}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {format(new Date(vehicle.first_weigh_time), "MMM dd, HH:mm")}
                          </TableCell>
                          <TableCell className="font-mono text-sm text-destructive">
                            {format(new Date(vehicle.expected_return_time), "MMM dd, HH:mm")}
                          </TableCell>
                          <TableCell>
                            <Badge variant="destructive">Overdue</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exhausted">
          <Card>
            <CardHeader>
              <CardTitle>Exhausted Free Weighs</CardTitle>
              <CardDescription>Vehicles that used both free weigh attempts</CardDescription>
            </CardHeader>
            <CardContent>
              {exhaustedChances.length === 0 ? (
                <p className="text-muted-foreground">No vehicles with exhausted chances</p>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vehicle No</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Attempts Used</TableHead>
                        <TableHead>First Weigh</TableHead>
                        <TableHead>Payment Status</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exhaustedChances.map((vehicle: any) => (
                        <TableRow key={vehicle.id}>
                          <TableCell className="font-medium">{vehicle.vehicle_no}</TableCell>
                          <TableCell>{vehicle.category}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{vehicle.weigh_attempts} / 2</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {format(new Date(vehicle.first_weigh_time), "MMM dd, HH:mm")}
                          </TableCell>
                          <TableCell>
                            <Badge variant={vehicle.payment_status === "Paid" ? "default" : "secondary"}>
                              {vehicle.payment_status === "Paid" ? "Paid" : "Pending"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">Must Pay for Next Weigh</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>All payments (last 50 records) - Pending: TSh {totalPending.toLocaleString()}</CardDescription>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-muted-foreground">No payments found</p>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Vehicle No</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Penalty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment: any) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-mono text-sm">
                            {format(new Date(payment.created_at), "MMM dd, HH:mm")}
                          </TableCell>
                          <TableCell className="font-medium">{payment.vehicle_no}</TableCell>
                          <TableCell className="text-sm">{payment.payment_type}</TableCell>
                          <TableCell>
                            <Badge variant={payment.payment_status === "Paid" ? "default" : "outline"}>
                              {payment.payment_status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            TSh {Number(payment.amount).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-destructive font-medium">
                            {payment.penalty_fee ? `TSh ${Number(payment.penalty_fee).toLocaleString()}` : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
