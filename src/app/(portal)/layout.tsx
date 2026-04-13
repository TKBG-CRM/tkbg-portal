"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Home, FileText, MessageSquare, DollarSign, User, LogOut, Menu, X, FolderKanban,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/deposits", label: "Deposits", icon: DollarSign },
  { href: "/profile", label: "Profile", icon: User },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [clientName, setClientName] = useState("");

  useEffect(() => {
    async function loadClient() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: contact } = await supabase
        .from("contacts")
        .select("first_name, last_name")
        .eq("linked_user_id", user.id)
        .single();
      if (contact) setClientName(`${contact.first_name} ${contact.last_name}`);
    }
    loadClient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Top navigation */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <Link href="/" className="flex items-center">
              <img
                src="/logos/TURNKEY_WORDMARK_GOLD.svg"
                alt="Turnkey"
                className="h-3.5"
              />
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "text-black font-medium"
                        : "text-gray-500 hover:text-black"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", isActive ? "text-black" : "text-gray-400")} />
                    {item.label}
                    {/* Gold underline for active */}
                    {isActive && (
                      <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#957B60] rounded-full" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {clientName && (
                <span className="hidden sm:inline text-sm text-gray-500">
                  {clientName}
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-gray-400 hover:text-black">
                <LogOut className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden text-gray-400"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm",
                    isActive
                      ? "bg-[rgba(149,123,96,0.08)] text-black font-medium"
                      : "text-gray-500 hover:bg-gray-50 hover:text-black"
                  )}
                >
                  <Icon className={cn("h-4 w-4", isActive ? "text-black" : "text-gray-400")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
