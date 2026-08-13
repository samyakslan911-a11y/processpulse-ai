import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProcessPulse AI — Lean Process Agent",
  description: "Análisis inteligente de procesos de producción con IA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ background: "#060D1A", color: "#F0F6FF", fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <nav style={{ borderBottom: "1px solid #1A2744", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href="/" style={{ fontWeight: 700, letterSpacing: 1, textDecoration: "none", color: "inherit" }}>
            <span style={{ color: "#22D3A4" }}>Process</span>Pulse AI
          </a>
          <div style={{ display: "flex", gap: 24, fontSize: 14 }}>
            <a href="/analyze" style={{ color: "#94A3B8", textDecoration: "none" }}>Analizar</a>
            <a href="/history" style={{ color: "#94A3B8", textDecoration: "none" }}>Historial</a>
          </div>
        </nav>
        <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
