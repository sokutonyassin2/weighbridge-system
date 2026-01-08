import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Clock, User, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export default function ActivityLogs() {
  const { userRole } = useAuth();
  const navigate = useNavigate();

  // Redirect non-admins
  if (userRole !== "admin") {
    navigate("/");
    return null;
  }

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["activity-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
  });

  const { data: activeUsers = [] } = useQuery({
    queryKey: ["active-users"],
    queryFn: async () => {
      // Get users who logged in within the last 8 hours
      const eightHoursAgo = new Date();
      eightHoursAgo.setHours(eightHoursAgo.getHours() - 8);

      const { data: loginLogs, error } = await supabase
        .from("activity_logs")
        .select("user_id, user_name, user_role, created_at")
        .eq("action", "login")
        .gte("created_at", eightHoursAgo.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filter out users who have logged out after their last login
      const activeUserMap = new Map();
      
      for (const log of loginLogs) {
        if (!activeUserMap.has(log.user_id)) {
          // Check if there's a logout after this login
          const { data: logoutLog } = await supabase
            .from("activity_logs")
            .select("created_at")
            .eq("user_id", log.user_id)
            .eq("action", "logout")
            .gt("created_at", log.created_at)
            .maybeSingle();

          if (!logoutLog) {
            activeUserMap.set(log.user_id, log);
          }
        }
      }

      return Array.from(activeUserMap.values());
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Activity Logs</h1>
        <p className="text-muted-foreground">Monitor user activity and system events</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Currently Active Users
          </CardTitle>
          <CardDescription>Users logged in within the last 8 hours</CardDescription>
        </CardHeader>
        <CardContent>
          {activeUsers.length === 0 ? (
            <p className="text-muted-foreground">No active users</p>
          ) : (
            <div className="space-y-2">
              {activeUsers.map((user: any) => (
                <div key={user.user_id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                    <div>
                      <p className="font-medium">{user.user_name}</p>
                      <p className="text-sm text-muted-foreground">
                        Logged in {format(new Date(user.created_at), "MMM dd, HH:mm")}
                      </p>
                    </div>
                  </div>
                  <Badge variant={user.user_role === "admin" ? "default" : "secondary"}>
                    {user.user_role}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>Last 100 system events</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading...</p>
          ) : logs.length === 0 ? (
            <p className="text-muted-foreground">No activity logs found</p>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(log.created_at), "MMM dd, HH:mm:ss")}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{log.user_name}</TableCell>
                      <TableCell>
                        <Badge variant={log.user_role === "admin" ? "default" : "secondary"}>
                          {log.user_role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.action === "login" ? "default" : "outline"}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{log.details}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
