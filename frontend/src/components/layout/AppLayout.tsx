import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { ChatWidget } from "../chat/ChatWidget";
import { useAuth } from "../../context/AuthContext";
import { AdminSidebar } from "./AdminSidebar";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const location = useLocation();
  const isAdmin = !!user?.is_admin;

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleOpenChat = () => setChatOpen(true);
    window.addEventListener("trb:open-chat", handleOpenChat);
    return () => window.removeEventListener("trb:open-chat", handleOpenChat);
  }, []);

  const lockScreen = location.pathname === "/verify";

  if (lockScreen) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Outlet />
        {!isAdmin && (
          <ChatWidget
            open={chatOpen}
            onOpen={() => setChatOpen(true)}
            onClose={() => setChatOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-navy-950">
      {isAdmin ? (
        <AdminSidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      ) : (
        <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}
      <div className="grid-bg flex min-w-0 flex-1 flex-col">
        <Header onOpenSidebar={() => setSidebarOpen(true)} onOpenChat={() => setChatOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
      {!isAdmin && (
        <ChatWidget
          open={chatOpen}
          onOpen={() => setChatOpen(true)}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
