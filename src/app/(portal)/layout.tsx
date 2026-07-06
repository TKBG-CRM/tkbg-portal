"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, Menu, X, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// Client-facing navigation only. Internal CRM concepts — tasks, the
// activity timeline, messages — are deliberately absent: clients must
// never see internal follow-up tasks ("Call within 12 hours", "Order
// gift hamper", etc.). Keep this list to client-safe surfaces only.
const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/documents", label: "Documents" },
  { href: "/variations", label: "Variations" },
  { href: "/deposits", label: "Deposits" },
  { href: "/profile", label: "Profile" },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [adminPreviewName, setAdminPreviewName] = useState<string | null>(null);

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

  useEffect(() => {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith("ap_banner="));
    if (match) {
      setAdminPreviewName(decodeURIComponent(match.split("=")[1]));
    }
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-[#f7f5f2] flex flex-col font-body">
      {/* Header (+ optional admin preview banner, all sticky together) */}
      <div className="sticky top-0 z-50">
        {adminPreviewName && (
          <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>
                <strong>Admin Preview Mode</strong> — You are viewing as{" "}
                <strong>{adminPreviewName}</strong>
              </span>
            </div>
            <button
              aria-label="Exit admin preview"
              onClick={() => {
                document.cookie = "ap_banner=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                setAdminPreviewName(null);
              }}
              className="shrink-0 hover:opacity-75 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <header>
          {/* Brand bar — large centered white wordmark on black, matching
              the login header + branded email shell. The wordmark is the
              primary mark; "Client Portal" sits beneath as a small, muted
              secondary caption so it never competes with the logo. */}
          <div className="bg-black px-4 py-8 sm:py-10 text-center">
            <Link href="/" className="inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logos/TURNKEY_WORDMARK_WHITE.svg"
                alt="Turnkey Building Group"
                className="h-8 sm:h-10 md:h-12 w-auto mx-auto"
              />
            </Link>
            <p className="mt-3 text-[9px] uppercase tracking-[0.3em] text-white/40 font-body">
              Client Portal
            </p>
          </div>

          {/* Gold accent line */}
          <div className="h-[2px] bg-brand-gold" />

          {/* Navigation bar */}
          <div className="bg-white border-b border-neutral-200">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-11">
                {/* Desktop nav */}
                <nav className="hidden md:flex items-center gap-1">
                  {navItems.map((item) => {
                    const isActive =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "px-3 py-1.5 text-xs font-medium uppercase tracking-wider rounded transition-colors",
                          isActive
                            ? "text-brand-gold"
                            : "text-neutral-500 hover:text-black"
                        )}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>

                {/* Desktop sign out */}
                <div className="hidden md:flex items-center gap-3">
                  {clientName && (
                    <span className="text-[11px] text-neutral-400 max-w-[180px] truncate">
                      {clientName}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSignOut}
                    className="text-xs text-neutral-500 hover:text-black h-7 px-2"
                  >
                    <LogOut className="h-3 w-3 mr-1.5" /> Sign out
                  </Button>
                </div>

                {/* Mobile menu toggle */}
                <button
                  className="md:hidden p-2 text-neutral-600 ml-auto"
                  onClick={() => setMobileOpen((v) => !v)}
                  aria-label="Toggle menu"
                >
                  {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </div>

              {/* Mobile nav */}
              {mobileOpen && (
                <div className="md:hidden pb-3 border-t border-neutral-100 pt-2">
                  <nav className="flex flex-col gap-0.5">
                    {navItems.map((item) => {
                      const isActive =
                        item.href === "/"
                          ? pathname === "/"
                          : pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "px-3 py-2.5 text-sm rounded-md transition-colors",
                            isActive
                              ? "text-brand-gold font-medium"
                              : "text-neutral-600 hover:bg-neutral-50"
                          )}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                    <button
                      onClick={handleSignOut}
                      className="px-3 py-2.5 text-sm text-left text-neutral-500 hover:bg-neutral-50 rounded-md flex items-center gap-2 mt-1"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                      {clientName && (
                        <span className="ml-auto text-xs text-neutral-400 truncate">
                          {clientName}
                        </span>
                      )}
                    </button>
                  </nav>
                </div>
              )}
            </div>
          </div>
        </header>
      </div>{/* end sticky wrapper */}

      {/* Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="border-t border-neutral-200 bg-white py-6 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-neutral-500">
          <span>
            &copy; {new Date().getFullYear()} Turnkey Building Group. All rights
            reserved.
          </span>
          <span className="tracking-wide">The Art of Creating Homes.</span>
        </div>
      </footer>
    </div>
  );
}
