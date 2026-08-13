"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUrl } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { renderMarkdown, ChartCard } from "@/lib/markdown";

type AgentEvent =
  | { type: "progress" | "step" | "output"; message: string; iteration?: number }
  | { type: "chart"; title: string; image_b64: string }
  | { type: "done"; message: string; iterations: number; charts_count: number }
  | { type: "failed"; message: string };

export default function AnalyzePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [charts, setCharts] = useState<{ title: string; image_b64: string }[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const [qaHistory, setQaHistory] = useState<{ q: string; a: string }[]>([]);
  const [question, setQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push("/login");
    });
  }, [router]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [qaHistory]);

  const addEvent = useCallback((ev: AgentEvent) => {
    setEvents(prev => [...prev, ev]);
  }, []);

  async function startAnalysis() {
    if (!file) return;
    setLoading(true);
    setEvents([]);
    setCharts([]);
    setReport(null);
    setDone(false);
    setError("");
    setQaHistory([]);
    setQuestion("");

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch("/analyze", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const { analysis_id } = await res.json();
      setAnalysisId(analysis_id);

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? "";
      const evtSource = new EventSource(`${apiUrl(`/stream/${analysis_id}`)}?token=${token}`);

      evtSource.addEventListener("progress", e => {
        const d = JSON.parse(e.data);
        addEvent({ type: "progress", message: d.message });
      });
      evtSource.addEventListener("step", e => {
        const d = JSON.parse(e.data);
        addEvent({ type: "step", message: d.message, iteration: d.iteration });
      });
      evtSource.addEventListener("output", e => {
        const d = JSON.parse(e.data);
        addEvent({ type: "output", message: d.message });
      });
      evtSource.addEventListener("chart", e => {
        const d = JSON.parse(e.data);
        addEvent({ type: "chart", title: d.title, image_b64: d.image_b64 });
        setCharts(prev => [...prev, { title: d.title, image_b64: d.image_b64 }]);
      });
      evtSource.addEventListener("done", e => {
        const d = JSON.parse(e.data);
        addEvent({ type: "done", message: d.message, iterations: d.iterations, charts_count: d.charts_count });
        setDone(true);
        setLoading(false);
        evtSource.close();
        apiFetch(`/analyze/${analysis_id}`)
          .then(r => r.json())
          .then(data => setReport(data.report ?? null));
      });
      evtSource.addEventListener("failed", e => {
        const d = JSON.parse(e.data);
        addEvent({ type: "failed", message: d.message });
        setError(d.message);
        setLoading(false);
        evtSource.close();
      });
    } catch (e: any) {
      setError(e.message ?? "Error al iniciar análisis");
      setLoading(false);
    }
  }

  async function sendQuestion() {
    const q = question.trim();
    if (!q || !analysisId || askLoading) return;
    setQuestion("");
    setAskLoading(true);
    try {
      const res = await apiFetch(`/analyze/${analysisId}/question`, {
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

  const reset = () => {
    setFile(null); setDone(false); setEvents([]); setCharts([]);
    setReport(null); setAnalysisId(null); setError("");
    setQaHistory([]); setQuestion("");
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <p style={{ fontSize: 12, fontFamily: "monospace", letterSpacing: 2, color: "#64748B", marginBottom: 4 }}>MÓDULO 03 · AGENTE</p>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Analizar datos de producción</h1>

      {/* Upload */}
      {!loading && !done && (
        <div style={{ background: "#0D1629", border: "2px dashed #1A2744", borderRadius: 12, padding: 40, textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Sube tu archivo CSV de producción</div>
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>
            Cualquier formato — el agente detecta columnas automáticamente.<br />
            Ejemplos: timestamp, máquina, turno, piezas_ok, piezas_def, downtime, causa…
          </div>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ display: "none" }}
            onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <button onClick={() => fileRef.current?.click()}
            style={{ background: "#1A2744", color: "#F0F6FF", padding: "10px 24px", borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 16, fontSize: 14 }}>
            Seleccionar archivo
          </button>
          {file && <div style={{ fontSize: 13, color: "#22D3A4", marginBottom: 16 }}>✓ {file.name}</div>}
          {file && (
            <button onClick={startAnalysis}
              style={{ background: "#22D3A4", color: "#060D1A", padding: "12px 32px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, display: "block", margin: "0 auto", fontSize: 15 }}>
              Iniciar análisis con IA →
            </button>
          )}
          {error && <p style={{ color: "#EF4444", marginTop: 12, fontSize: 13 }}>{error}</p>}
        </div>
      )}

      {/* Agent running: log + charts side by side */}
      {events.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: charts.length > 0 ? "1fr 1fr" : "1fr", gap: 20, alignItems: "start", marginBottom: 24 }}>
          {/* Log */}
          <div>
            <p style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: 2, color: "#64748B", marginBottom: 8 }}>LOG DEL AGENTE</p>
            <div ref={logRef} style={{ background: "#060D1A", border: "1px solid #1A2744", borderRadius: 10, padding: 16, maxHeight: 460, overflowY: "auto" }}>
              {events.map((ev, i) => {
                if (ev.type === "chart") return null;
                const color = ev.type === "step" ? "#22D3A4" : ev.type === "done" ? "#22D3A4" : ev.type === "failed" ? "#EF4444" : ev.type === "output" ? "#475569" : "#64748B";
                const prefix = ev.type === "step" ? `[${ev.iteration}] ` : ev.type === "done" ? "✓ " : ev.type === "failed" ? "✗ " : "› ";
                return (
                  <div key={i} style={{ fontSize: 12, fontFamily: "monospace", color, marginBottom: 4, lineHeight: 1.5 }}>
                    {prefix}{ev.message}
                  </div>
                );
              })}
              {loading && <div style={{ fontSize: 12, fontFamily: "monospace", color: "#22D3A4" }} className="animate-pulse">▋</div>}
            </div>
            {done && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={reset}
                  style={{ background: "#1A2744", color: "#94A3B8", padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13 }}>
                  Analizar otro CSV
                </button>
                {analysisId && (
                  <a href={`/history/${analysisId}`}
                    style={{ background: "#0D1629", color: "#22D3A4", padding: "8px 16px", borderRadius: 8, border: "1px solid #22D3A433", fontSize: 13, textDecoration: "none" }}>
                    Ver en historial →
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Charts */}
          {charts.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: 2, color: "#64748B", marginBottom: 8 }}>
                GRÁFICAS GENERADAS <span style={{ color: "#475569" }}>· clic para ampliar</span>
              </p>
              {charts.map((c, i) => <ChartCard key={i} title={c.title} image_b64={c.image_b64} />)}
            </div>
          )}
        </div>
      )}

      {/* Final report */}
      {report && report !== "Análisis completado sin informe de texto." && (
        <div style={{ background: "#060D1A", border: "1px solid #22D3A433", borderRadius: 12, padding: 32, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: 2, color: "#22D3A4", margin: 0 }}>INFORME FINAL DEL AGENTE</p>
            <button
              onClick={() => navigator.clipboard?.writeText(report)}
              style={{ background: "#1A2744", color: "#64748B", padding: "4px 12px", borderRadius: 6, border: "none", fontSize: 12, cursor: "pointer" }}>
              Copiar
            </button>
          </div>
          <div>{renderMarkdown(report)}</div>
        </div>
      )}

      {/* Follow-up questions */}
      {done && analysisId && (
        <div style={{ background: "#060D1A", border: "1px solid #1A2744", borderRadius: 12, padding: 24, marginTop: 20 }}>
          <p style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: 2, color: "#64748B", marginBottom: 16 }}>
            PREGUNTAS AL AGENTE
          </p>

          {qaHistory.length === 0 && (
            <p style={{ fontSize: 13, color: "#475569", marginBottom: 16 }}>
              Haz preguntas sobre el análisis — el agente responde con contexto del informe y los datos.
            </p>
          )}

          {qaHistory.map((qa, i) => (
            <div key={i} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ color: "#22D3A4", flexShrink: 0, marginTop: 1 }}>›</span>
                <span>{qa.q}</span>
              </div>
              <div style={{
                fontSize: 14, color: "#CBD5E1", lineHeight: 1.8,
                paddingLeft: 16, borderLeft: "2px solid #1A2744",
                background: "#0D162966", borderRadius: "0 6px 6px 0", padding: "10px 16px",
              }}>
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
              style={{
                flex: 1, background: "#0D1629", border: "1px solid #1A2744",
                borderRadius: 8, padding: "10px 14px", color: "#E2E8F0",
                fontSize: 14, outline: "none", fontFamily: "inherit",
              }}
            />
            <button
              onClick={sendQuestion}
              disabled={askLoading || !question.trim()}
              style={{
                background: askLoading ? "#1A2744" : "#22D3A4",
                color: askLoading ? "#64748B" : "#060D1A",
                padding: "10px 20px", borderRadius: 8, border: "none",
                cursor: askLoading ? "wait" : "pointer",
                fontWeight: 700, fontSize: 16,
                opacity: !question.trim() && !askLoading ? 0.5 : 1,
              }}>
              {askLoading ? "…" : "→"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
