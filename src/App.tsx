import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useEffect } from 'react';
import OperatorDashboard from "./pages/OperatorDashboard";
import VehicleEntry from "./pages/VehicleEntry";
import WeighEntry from "./pages/WeighEntry";
import PendingWeighs from "./pages/PendingWeighs";
import CashierDashboard from "./pages/CashierDashboard";
import VehicleTypes from "./pages/VehicleTypes";
import AllEntries from "./pages/AllEntries";
import VehicleHistory from "./pages/VehicleHistory";
import CompletedVehicles from "./pages/CompletedVehicles";
import ActivityLogs from "./pages/ActivityLogs";
import UserManagement from "./pages/UserManagement";
import AuditTrail from "./pages/AuditTrail";
import AdminPenalties from "./pages/AdminPenalties";
import AdminCompanyWeights from "./pages/AdminCompanyWeights";
import AdminReceiptSettings from "./pages/AdminReceiptSettings";
import AdminWeightSettings from "./pages/AdminWeightSettings";
import ShiftAnalytics from "./pages/ShiftAnalytics";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import ShiftSummaryReport from "./pages/ShiftSummaryReport";
import OverdueHistory from "./pages/OverdueHistory";
import ReceiptHistory from "./pages/ReceiptHistory";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('SW registered: ', registration);
          })
          .catch((registrationError) => {
            console.log('SW registration failed: ', registrationError);
          });
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout>
                    <OperatorDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/entry"
              element={
                <ProtectedRoute>
                  <Layout>
                    <VehicleEntry />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/weigh/:id"
              element={
                <ProtectedRoute>
                  <Layout>
                    <WeighEntry />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pending"
              element={
                <ProtectedRoute>
                  <Layout>
                    <PendingWeighs />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/cashier"
              element={
                <ProtectedRoute>
                  <Layout>
                    <CashierDashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicle-types"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <VehicleTypes />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/all-entries"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AllEntries />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/vehicle-history"
              element={
                <ProtectedRoute>
                  <Layout>
                    <VehicleHistory />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/completed"
              element={
                <ProtectedRoute>
                  <Layout>
                    <CompletedVehicles />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/overdue-history"
              element={
                <ProtectedRoute>
                  <Layout>
                    <OverdueHistory />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/activity-logs"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <ActivityLogs />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/user-management"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <UserManagement />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-trail"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AuditTrail />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/shift-reports"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <ShiftSummaryReport />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/penalties"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AdminPenalties />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/company-weights"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AdminCompanyWeights />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <ShiftAnalytics />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/receipt-settings"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AdminReceiptSettings />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/weight-settings"
              element={
                <ProtectedRoute requireAdmin>
                  <Layout>
                    <AdminWeightSettings />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/receipt-history"
              element={
                <ProtectedRoute>
                  <Layout>
                    <ReceiptHistory />
                  </Layout>
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
