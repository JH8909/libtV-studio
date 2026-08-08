import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = { title: "LibTV Studio", description: "API-first AI video canvas and timeline" };
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
