import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Briefly — brief comercial para SDRs",
  description:
    "Gere em segundos um brief de abordagem estruturado antes do primeiro contato com um prospect.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
