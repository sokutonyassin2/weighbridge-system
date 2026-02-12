import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from "@/hooks/use-toast";
import { useEffect } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
  allowedRoles?: string[]; // NEW: Flexible role support
}

export const ProtectedRoute = ({
  children,
  requireAdmin = false,
  requireSuperAdmin = false,
  allowedRoles = []
}: ProtectedRouteProps) => {
  const { user, userRole, loading } = useAuth();
  const { toast } = useToast();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-600"></div>
          <p className="text-slate-500 text-sm font-medium animate-pulse">Verifying Access...</p>
        </div>
      </div>
    );
  }

  // 1. Check Authentication
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // 2. Super Admin Bypass (Always Allowed everywhere)
  if ((userRole as string) === 'super_admin') {
    return <>{children}</>;
  }

  // 3. Check Super Admin Strict Requirement
  if (requireSuperAdmin && (userRole as string) !== 'super_admin') {
    return <Navigate to="/" replace />;
  }

  // 4. Check Admin Requirement (Operations Manager)
  // Note: "admin" role is now "Operations Manager"
  if (requireAdmin && userRole !== 'admin') {
    return <Navigate to="/" replace />;
  }

  // 5. Check Granular Roles (allowedRoles array)
  // If allowedRoles is provided, user must have one of them
  if (allowedRoles.length > 0) {
    if (!userRole || !allowedRoles.includes(userRole)) {
      // Optional: Toast notification for better UX
      /* 
      useEffect(() => {
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: "You do not have permission to view this page."
        });
      }, []); 
      */
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};
