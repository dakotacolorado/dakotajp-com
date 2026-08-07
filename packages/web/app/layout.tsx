import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { AdminBar } from "@/components/admin/AdminBar";
import { SITE } from "@/lib/config/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: SITE.name,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
};

const NAV = [
  { href: "/", label: "about" },
  { href: "/blog", label: "blog" },
  { href: "/chat", label: "ask ai" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <AdminBar />

        <header className="border-b border-stone-200 dark:border-stone-800">
          <nav className="mx-auto flex max-w-2xl items-baseline justify-between gap-6 px-6 py-5">
            <Link
              href="/"
              className="font-serif text-lg tracking-tight text-stone-900 dark:text-stone-100"
            >
              {SITE.wordmark}
            </Link>
            <div className="flex gap-5 text-sm text-stone-500 dark:text-stone-400">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="transition-colors hover:text-stone-900 dark:hover:text-stone-100"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
          {children}
        </main>

        <footer className="border-t border-stone-200 dark:border-stone-800">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-6 text-xs text-stone-500">
            <span>
              © {new Date().getFullYear()} {SITE.name}
            </span>
            <div className="flex items-center gap-x-6">
              <a
                href={SITE.repo}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-stone-300 underline-offset-4 transition-colors hover:text-stone-900 hover:decoration-stone-500 dark:decoration-stone-700 dark:hover:text-stone-100 dark:hover:decoration-stone-500"
              >
                how this site is built
              </a>
              <span className="font-mono tracking-tight">{SITE.domain}</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
