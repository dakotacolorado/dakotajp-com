import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { AdminBar } from "@/components/AdminBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dakota James Parker",
  description: "Personal website of Dakota James Parker.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-gray-900 dark:bg-black dark:text-gray-100">
        <AdminBar />
        <header className="border-b border-gray-200 dark:border-gray-800">
          <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-semibold tracking-tight">
              Dakota James Parker
            </Link>
            <div className="flex gap-5 text-sm text-gray-600 dark:text-gray-400">
              <Link href="/" className="hover:text-gray-900 dark:hover:text-gray-100">
                About
              </Link>
              <Link href="/resume" className="hover:text-gray-900 dark:hover:text-gray-100">
                Resume
              </Link>
              <Link href="/blog" className="hover:text-gray-900 dark:hover:text-gray-100">
                Blog
              </Link>
            </div>
          </nav>
        </header>
        <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
          {children}
        </div>
        <footer className="border-t border-gray-200 py-6 text-center text-sm text-gray-500 dark:border-gray-800">
          © {new Date().getFullYear()} Dakota James Parker
        </footer>
      </body>
    </html>
  );
}
