import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "MeetingMind", description: "The only meeting bot that knows who's who" };

const NAV = [
  { href: "/",          label: "Overview" },
  { href: "/meetings",  label: "Meetings" },
  { href: "/people",    label: "People" },
  { href: "/kpi",       label: "KPIs" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/settings",  label: "Settings" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden bg-stone">
        {/* Sidebar */}
        <aside className="w-52 shrink-0 flex flex-col border-r border-slate/20 bg-ink">
          <div className="px-5 py-5 border-b border-white/10">
            <span className="text-white text-sm font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              MEETINGMIND
            </span>
          </div>
          <nav className="flex-1 py-4 flex flex-col gap-0.5 px-2">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-2 rounded-sm text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="px-5 py-4 border-t border-white/10">
            <p className="text-[10px] text-white/30" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              AGENT FORGE · 2026
            </p>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
