import { Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { ProtectedRoute, PublicOnlyRoute, UserOnlyRoute } from "./components/layout/ProtectedRoute";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { ForgotPassword } from "./pages/ForgotPassword";
import { Verify } from "./pages/Verify";
import { Dashboard } from "./pages/Dashboard";
import { MarketPage } from "./pages/MarketPage";
import { ChartAnalyzer } from "./pages/ChartAnalyzer";
import { ForexAnalysis } from "./pages/ForexAnalysis";
import { ChartMind } from "./pages/ChartMind";
import { AdminDashboard } from "./pages/AdminDashboard";
import { Settings } from "./pages/Settings";
import { NotFound } from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnlyRoute>
            <Signup />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicOnlyRoute>
            <ForgotPassword />
          </PublicOnlyRoute>
        }
      />

      {/* Authenticated but not necessarily verified */}
      <Route
        path="/verify"
        element={
          <ProtectedRoute requireVerified={false}>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Verify />} />
      </Route>

      {/* Verified user shell (admins not allowed here; redirected by UserOnlyRoute) */}
      <Route
        element={
          <ProtectedRoute>
            <UserOnlyRoute>
              <AppLayout />
            </UserOnlyRoute>
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/market/:category" element={<MarketPage />} />
        <Route path="/analyze" element={<ChartAnalyzer />} />
        <Route path="/forex" element={<ForexAnalysis />} />
        <Route path="/chartmind" element={<ChartMind />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Admin shell */}
      <Route
        element={
          <ProtectedRoute requireAdmin>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin" element={<AdminDashboard />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
