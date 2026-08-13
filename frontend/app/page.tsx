export default function Home() {
  return (
    <div>
      <p style={{ fontSize: 12, fontFamily: "monospace", letterSpacing: 2, color: "#64748B", marginBottom: 4 }}>MÓDULO 03 · LEAN AI</p>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
        <span style={{ color: "#22D3A4" }}>Process</span>Pulse AI
      </h1>
      <p style={{ color: "#94A3B8", marginBottom: 40, maxWidth: 520 }}>
        Agente IA que analiza datos de producción, detecta desperdicios y calcula KPIs Lean
        — OEE, tiempos muertos, Pareto de causas — ejecutando código Python en sandbox.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 40 }}>
        {[
          { icon: "📊", title: "OEE", desc: "Disponibilidad × Rendimiento × Calidad" },
          { icon: "⏱", title: "Tiempos muertos", desc: "Pareto de causas de paro" },
          { icon: "📉", title: "Defectos", desc: "Tasa de calidad por turno y máquina" },
        ].map(card => (
          <div key={card.title} style={{ background: "#0D1629", border: "1px solid #1A2744", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{card.icon}</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{card.title}</div>
            <div style={{ fontSize: 13, color: "#64748B" }}>{card.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <a href="/analyze" style={{
          background: "#22D3A4", color: "#060D1A", padding: "10px 24px",
          borderRadius: 8, fontWeight: 700, textDecoration: "none", fontSize: 14,
        }}>
          Subir CSV y analizar →
        </a>
        <a href="/history" style={{
          background: "#0D1629", color: "#94A3B8", padding: "10px 24px",
          borderRadius: 8, fontWeight: 600, textDecoration: "none", fontSize: 14,
          border: "1px solid #1A2744",
        }}>
          Ver historial
        </a>
      </div>
    </div>
  );
}
