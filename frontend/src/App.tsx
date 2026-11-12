import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { LiveProvider } from "@/context/LiveContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AddAssetPage } from "@/pages/AddAssetPage";
import { AssetDetailPage } from "@/pages/AssetDetailPage";
import { AssetsPage } from "@/pages/AssetsPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { InventoryPage } from "@/pages/InventoryPage";
import { LocationsPage } from "@/pages/LocationsPage";
import { LoginPage } from "@/pages/LoginPage";
import { MaintenancePage } from "@/pages/MaintenancePage";
import { MovementsPage } from "@/pages/MovementsPage";
import { QRScannerPage } from "@/pages/QRScannerPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { UsersPage } from "@/pages/UsersPage";
import type { RoleName } from "@/types";

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: RoleName[] }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Verifying CMRL ITAM session...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (roles && !roles.includes(user.role.name)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LiveProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="assets" element={<AssetsPage />} />
                <Route
                  path="assets/new"
                  element={
                    <ProtectedRoute roles={["ADMIN", "STORE_KEEPER"]}>
                      <AddAssetPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="assets/:assetId" element={<AssetDetailPage />} />
                <Route path="scanner" element={<QRScannerPage />} />
                <Route path="movements" element={<MovementsPage />} />
                <Route path="maintenance" element={<MaintenancePage />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="locations" element={<LocationsPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route
                  path="users"
                  element={
                    <ProtectedRoute roles={["ADMIN"]}>
                      <UsersPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </LiveProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
