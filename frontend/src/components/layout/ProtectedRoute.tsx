import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { LoadingState } from "../ui/Spinner";

export function ProtectedRoute({
  children,
  requireVerified = true,
  requireAdmin = false,
}: {
  children: ReactNode;
  requireVerified?: boolean;
  requireAdmin?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-950">
        <LoadingState label="Checking your session…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const onVerify = location.pathname === "/verify";

  if (!user.is_active && !onVerify) {
    return <Navigate to="/verify" replace />;
  }

  if (requireAdmin && !user.is_admin) {
    return <Navigate to="/" replace />;
  }

  if (requireVerified && !user.is_verified && !onVerify) {
    return <Navigate to="/verify" replace />;
  }

  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-950">
        <LoadingState label="Loading…" />
      </div>
    );
  }
  if (user) return <Navigate to={user.is_admin ? "/admin" : "/"} replace />;
  return <>{children}</>;
}

export function UserOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-950">
        <LoadingState label="Checking your session…" />
      </div>
    );
  }
  if (user?.is_admin) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
