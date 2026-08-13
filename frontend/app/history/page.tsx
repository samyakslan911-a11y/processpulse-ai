"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Analysis = {
  id: string;
  filename: string;
  status: string;
  iterations: number;
  created_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  done: "#22D3A4",
  running: "#F59E0B",
  failed: "#EF4444",
  pending: "#64748B",
};

export default function HistoryPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/analyze")
      .then(r => r.json())
      .then(data => { setAnalyses(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <p style={{ fontSize: 12, fontFamily: "monospace", letterSpacing: 2, color: "#64748B", marginBottom: 4 }}>MÓDULO 03 · HISTORIAL</p>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Análisis realizados</h1>

      {loading && <p style={{ color: "#64748B" }}>Cargando...</p>}
      {!loading && analyses.length === 0 && (
        <div style={{ background: "#0D1629", border: "1px solid #1A2744", borderRadius: 12, padding: 32, textAlign: "center", color: "#64748B" }}>
          No hay análisis aún. <a href="/analyze" style={{ color: "#22D3A4" }}>Sube tu primer CSV →</a>
        </div>
      )}

      {analyses.map(a => (
        <a key={a.id} href={`/history/${a.id}`} style={{ textDecoration: "none", display: "block" }}>
          <div style={{ background: "#0D1629", border: "1px solid #1A2744", borderRadius: 10, padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>📊 {a.filename}</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>
                {new Date(a.created_at).toLocaleString("es-CL")} · {a.iterations} iteraciones
              </div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLOR[a.status] ?? "#64748B", fontFamily: "monospace" }}>
              {a.status.toUpperCase()}
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
