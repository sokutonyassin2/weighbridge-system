import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle } from "lucide-react";

export default function VehicleTypes() {
  const { data: vehicleTypes, isLoading } = useQuery({
    queryKey: ["vehicle-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_types")
        .select("*")
        .order("type_name");

      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Vehicle Types & Categories</h1>
        <p className="text-muted-foreground">
          Payment rules and configuration for different vehicle categories
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configured Vehicle Types</CardTitle>
          <CardDescription>
            Each type has specific payment rules and time constraints
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>1st Weigh Fee</TableHead>
                  <TableHead>2nd Weigh Fee</TableHead>
                  <TableHead>Return Time</TableHead>
                  <TableHead>Two Weighs</TableHead>
                  <TableHead>Time Sensitive</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicleTypes?.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell className="font-medium">{type.type_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{type.category}</Badge>
                    </TableCell>
                    <TableCell>
                      {parseFloat(type.first_weigh_fee.toString()).toLocaleString()} TShs
                    </TableCell>
                    <TableCell>
                      {parseFloat(type.second_weigh_fee.toString()).toLocaleString()} TShs
                    </TableCell>
                    <TableCell>
                      {type.return_time_hours > 0
                        ? `${type.return_time_hours}h`
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      {type.requires_two_weighs ? (
                        <CheckCircle className="h-4 w-4 text-success" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      {type.is_time_sensitive ? (
                        <Badge variant="secondary">Yes</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">No</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">MV-PublicSeller</p>
              <p className="text-muted-foreground">
                Pays 20,000 UGX before offloading (1st weigh) + 10,000 UGX after offloading (2nd weigh)
              </p>
            </div>
            <div>
              <p className="font-medium">MV-Supplier</p>
              <p className="text-muted-foreground">
                Pays 10,000 UGX once for both weighs
              </p>
            </div>
            <div>
              <p className="font-medium">MV-Company</p>
              <p className="text-muted-foreground">
                No payment required, but must be weighed twice for transparency
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Time-Sensitive Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">JV-Payment</p>
              <p className="text-muted-foreground">
                12 hours return time, 2 weigh chances. If exceeded → sent to cashier
              </p>
            </div>
            <div>
              <p className="font-medium">Transit</p>
              <p className="text-muted-foreground">
                24 hours return time, 2 weigh chances. If exceeded → payment required
              </p>
            </div>
            <div>
              <p className="font-medium">Other Categories</p>
              <p className="text-muted-foreground">
                No time constraints, but still require proper weighing procedures
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
