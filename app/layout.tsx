import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashboard PV Solar",
  description: "Analiza producției fotovoltaice, a consumului și a bateriei la rezoluție de 15 minute, cu plafon de export și analiză AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  );
}
