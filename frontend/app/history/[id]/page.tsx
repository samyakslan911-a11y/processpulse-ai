"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { renderMarkdown, ChartCard } from "@/lib/markdown";

// ── Print styles ──────────────────────────────────────────────────────────────
const PRINT_CSS = `
  @page {
    size: A4 portrait;
    margin: 0;
  }
  @media screen {
    .print-view { display: none !important; }
  }
  @media print {
    .screen-view { display: none !important; }
    .print-view  { display: block !important; padding: 2.2cm 2.5cm 2cm 2.5cm; }
    body { background: #fff !important; }

    /* Typography override */
    .pr-body p    { color: #1a1a2e !important; font-size: 10.5pt !important; line-height: 1.75 !important; margin: 0 0 8pt !important; }
    .pr-body h1   { color: #002060 !important; font-size: 17pt !important; font-weight: 700 !important; margin: 0 0 14pt !important; }
    .pr-body h2   { color: #002060 !important; font-size: 13pt !important; font-weight: 700 !important; margin: 20pt 0 8pt !important; border-bottom: 0.5pt solid #c0c8d8; padding-bottom: 4pt; }
    .pr-body h3   { color: #003399 !important; font-size: 11pt !important; font-weight: 700 !important; margin: 14pt 0 6pt !important; }
    .pr-body hr   { border: none !important; border-top: 0.5pt solid #ccc !important; margin: 14pt 0 !important; }
    .pr-body ul, .pr-body ol { color: #1a1a2e !important; font-size: 10.5pt !important; padding-left: 18pt !important; margin: 6pt 0 10pt !important; }
    .pr-body li   { color: #1a1a2e !important; margin-bottom: 4pt !important; line-height: 1.65 !important; }
    .pr-body strong { color: #1a1a2e !important; }

    /* Tables */
    .pr-body table { width: 100% !important; border-collapse: collapse !important; font-size: 9.5pt !important; margin: 10pt 0 16pt !important; }
    .pr-body th    { background: #002060 !important; color: #fff !important; padding: 6pt 9pt !important; text-align: left !important; font-weight: 600 !important; font-size: 9pt !important; border: none !important; }
    .pr-body td    { color: #1a1a2e !important; padding: 5pt 9pt !important; border-bottom: 0.4pt solid #dde0e8 !important; font-variant-numeric: tabular-nums !important; }
    .pr-body tr:nth-child(even) td { background: #f4f6fb !important; }

    /* Page breaks */
    .pr-page-break { page-break-before: always; }
    .pr-figure     { page-break-inside: avoid; margin: 0 0 28pt; }
    .pr-figure img { width: 100%; height: auto; border: 0.5pt solid #d0d5e0; border-radius: 3pt; display: block; }
    .pr-caption    { font-size: 8.5pt; color: #555 !important; margin-top: 5pt; font-style: italic; text-align: center; }
    .pr-section    { page-break-inside: avoid; }
  }
`;

// ── Smart chart placement ─────────────────────────────────────────────────────
type Chart = { title: string; image_b64: string };

function buildPrintLayout(report: string, charts: Chart[]) {
  // Split report into sections on each ## heading
  const raw = report.split(/(?=^## )/m);
  const sections = raw.filter(s => s.trim());

  // Match each chart to the section with the most keyword overlap
  const placements = new Map<number, Chart[]>();
  const unmatched: Chart[] = [];

  charts.forEach(chart => {
    const words = chart.title.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    let best = -1;
    let bestScore = 0;

    sections.forEach((sec, idx) => {
      const score = words.filter(w => sec.toLowerCase().includes(w)).length;
      if (score > bestScore) { bestScore = score; best = idx; }
    });

    if (best === -1 || bestScore === 0) {
      unmatched.push(chart);
    } else {
      if (!placements.has(best)) placements.set(best, []);
      placements.get(best)!.push(chart);
    }
  });

  return { sections, placements, unmatched };
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalysisDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [qaHistory, setQaHistory] = useState<{ q: string; a: string }[]>([]);
  const [question, setQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => {
      if (!s.session) router.push("/login");
    });
  }, [router]);

  useEffect(() => {
    apiFetch(`/analyze/${params.id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [qaHistory]);

  async function sendQuestion() {
    const q = question.trim();
    if (!q || askLoading) return;
    setQuestion("");
    setAskLoading(true);
    try {
      const res = await apiFetch(`/analyze/${params.id}/question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { answer } = await res.json();
      setQaHistory(prev => [...prev, { q, a: answer }]);
    } catch (e: any) {
      setQaHistory(prev => [...prev, { q, a: `Error: ${e.message ?? "Sin respuesta"}` }]);
    }
    setAskLoading(false);
  }

  if (loading) return <p style={{ color: "#64748B", padding: 32 }}>Cargando análisis...</p>;
  if (!data) return <p style={{ color: "#EF4444", padding: 32 }}>Análisis no encontrado.</p>;

  const charts: Chart[] = data.charts ?? [];
  const isDone = data.status === "done";
  const statusColor: Record<string, string> = { done: "#22D3A4", running: "#3987e5", failed: "#EF4444" };

  const printDate = new Date(data.created_at).toLocaleDateString("es-CL", {
    year: "numeric", month: "long", day: "numeric",
  });
  const printTime = new Date(data.created_at).toLocaleTimeString("es-CL", {
    hour: "2-digit", minute: "2-digit",
  });

  const layout = data.report ? buildPrintLayout(data.report, charts) : null;
  let figCounter = 0;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* ══ SCREEN VIEW ══════════════════════════════════════════════════════ */}
      <div className="screen-view" style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 16 }}>
          <div>
            <a href="/history" style={{ fontSize: 12, color: "#64748B", textDecoration: "none", fontFamily: "monospace", letterSpacing: 1 }}>
              ← HISTORIAL
            </a>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 0 4px" }}>📊 {data.filename}</h1>
            <p style={{ fontSize: 12, color: "#64748B", margin: 0, fontFamily: "monospace" }}>
              {new Date(data.created_at).toLocaleString("es-CL")}
              {data.iterations ? ` · ${data.iterations} iteraciones` : ""}
              {charts.length > 0 ? ` · ${charts.length} gráfica${charts.length > 1 ? "s" : ""}` : ""}
              {" · "}
              <span style={{ color: statusColor[data.status] ?? "#64748B" }}>{data.status.toUpperCase()}</span>
            </p>
          </div>
          <button
            onClick={() => window.print()}
            style={{ background: "#0D1629", border: "1px solid #1A2744", color: "#94A3B8", padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
            Descargar PDF
          </button>
        </div>

        {/* Charts grid */}
        {charts.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: 2, color: "#64748B", marginBottom: 12 }}>
              GRÁFICAS <span style={{ color: "#475569" }}>· clic para ampliar</span>
            </p>
            <div style={{ display: "grid", gridTemplateColumns: charts.length === 1 ? "1fr" : "1fr 1fr", gap: 16 }}>
              {charts.map((c, i) => <ChartCard key={i} title={c.title} image_b64={c.image_b64} />)}
            </div>
          </div>
        )}

        {/* Report */}
        {data.report && data.report !== "Análisis completado sin informe de texto." && (
          <div style={{ background: "#060D1A", border: "1px solid #22D3A433", borderRadius: 12, padding: 28, marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: 2, color: "#22D3A4", margin: 0 }}>INFORME DEL AGENTE</p>
              <button
                onClick={() => navigator.clipboard?.writeText(data.report)}
                style={{ background: "#1A2744", color: "#64748B", padding: "4px 12px", borderRadius: 6, border: "none", fontSize: 12, cursor: "pointer" }}>
                Copiar
              </button>
            </div>
            <div>{renderMarkdown(data.report)}</div>
          </div>
        )}

        {data.error_message && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid #EF444433", borderRadius: 10, padding: 16, marginBottom: 24 }}>
            <p style={{ color: "#EF4444", fontSize: 13, fontFamily: "monospace", margin: 0 }}>Error: {data.error_message}</p>
          </div>
        )}

        {/* Follow-up questions */}
        {isDone && (
          <div style={{ background: "#060D1A", border: "1px solid #1A2744", borderRadius: 12, padding: 24 }}>
            <p style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: 2, color: "#64748B", marginBottom: 16 }}>PREGUNTAS AL AGENTE</p>

            {qaHistory.length === 0 && (
              <p style={{ fontSize: 13, color: "#475569", marginBottom: 16 }}>
                Haz preguntas sobre el análisis — el agente responde con contexto del informe y los datos.
              </p>
            )}

            {qaHistory.map((qa, i) => (
              <div key={i} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "#22D3A4", flexShrink: 0 }}>›</span>
                  <span>{qa.q}</span>
                </div>
                <div style={{ fontSize: 14, color: "#CBD5E1", lineHeight: 1.8, padding: "10px 16px", borderLeft: "2px solid #1A2744", background: "#0D162966", borderRadius: "0 6px 6px 0" }}>
                  {qa.a}
                </div>
              </div>
            ))}

            <div ref={chatEndRef} />

            <div style={{ display: "flex", gap: 8, marginTop: qaHistory.length > 0 ? 16 : 0 }}>
              <input
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuestion(); } }}
                placeholder="¿Cuál es la causa principal? ¿Qué turno tiene más defectos?…"
                disabled={askLoading}
                style={{ flex: 1, background: "#0D1629", border: "1px solid #1A2744", borderRadius: 8, padding: "10px 14px", color: "#E2E8F0", fontSize: 14, outline: "none", fontFamily: "inherit" }}
              />
              <button
                onClick={sendQuestion}
                disabled={askLoading || !question.trim()}
                style={{ background: askLoading ? "#1A2744" : "#22D3A4", color: askLoading ? "#64748B" : "#060D1A", padding: "10px 20px", borderRadius: 8, border: "none", cursor: askLoading ? "wait" : "pointer", fontWeight: 700, fontSize: 16, opacity: !question.trim() && !askLoading ? 0.5 : 1 }}>
                {askLoading ? "…" : "→"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══ PRINT VIEW ═══════════════════════════════════════════════════════ */}
      <div className="print-view" style={{ fontFamily: "-apple-system, 'Helvetica Neue', Arial, sans-serif", color: "#1a1a2e" }}>

        {/* Cover header */}
        <div style={{ borderBottom: "2pt solid #002060", paddingBottom: 14, marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 8, letterSpacing: 3, color: "#888", marginBottom: 6, textTransform: "uppercase" }}>
                ProcessPulse AI · Módulo de Análisis de Producción
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#002060", lineHeight: 1.2 }}>
                Informe de Análisis de Producción
              </div>
              <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}>{data.filename}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 9, color: "#555", lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, color: "#002060" }}>CONFIDENCIAL</div>
              <div>{printDate} · {printTime}</div>
              <div>{data.iterations} iteraciones · {charts.length} visualizacion{charts.length !== 1 ? "es" : ""}</div>
            </div>
          </div>
        </div>

        {/* Report body — sections interleaved with charts */}
        {layout && (
          <div className="pr-body">
            {layout.sections.map((section, idx) => {
              const sectionCharts = layout.placements.get(idx) ?? [];
              return (
                <div key={idx} className="pr-section">
                  <div>{renderMarkdown(section)}</div>
                  {sectionCharts.map(chart => {
                    figCounter++;
                    const n = figCounter;
                    return (
                      <div key={chart.title} className="pr-figure" style={{ margin: "16pt 0 24pt" }}>
                        <img
                          src={`data:image/png;base64,${chart.image_b64}`}
                          alt={chart.title}
                        />
                        <p className="pr-caption">Figura {n}: {chart.title}</p>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Unmatched charts at the end */}
            {layout.unmatched.length > 0 && (
              <div className="pr-page-break">
                <div style={{ borderBottom: "1pt solid #002060", paddingBottom: 8, marginBottom: 20 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#002060" }}>Visualizaciones Adicionales</span>
                </div>
                {layout.unmatched.map(chart => {
                  figCounter++;
                  const n = figCounter;
                  return (
                    <div key={chart.title} className="pr-figure">
                      <img
                        src={`data:image/png;base64,${chart.image_b64}`}
                        alt={chart.title}
                      />
                      <p className="pr-caption">Figura {n}: {chart.title}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer line */}
        <div style={{ borderTop: "0.5pt solid #ccc", marginTop: 32, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 8, color: "#888" }}>
          <span>ProcessPulse AI — Lean Process Agent</span>
          <span>Generado: {printDate}</span>
        </div>
      </div>
    </>
  );
}
