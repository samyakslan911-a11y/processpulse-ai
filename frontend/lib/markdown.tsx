"use client";
import React from "react";

function bold(s: string): React.ReactNode[] {
  const parts = s.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, idx) => idx % 2 === 1 ? <strong key={idx}>{p}</strong> : p as any);
}

export function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      nodes.push(<h3 key={i} style={{ fontSize: 16, fontWeight: 700, color: "#22D3A4", margin: "20px 0 8px" }}>{bold(line.slice(4))}</h3>);
      i++; continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(<h2 key={i} style={{ fontSize: 18, fontWeight: 700, color: "#F0F6FF", margin: "24px 0 10px" }}>{bold(line.slice(3))}</h2>);
      i++; continue;
    }
    if (line.startsWith("# ")) {
      nodes.push(<h1 key={i} style={{ fontSize: 22, fontWeight: 700, color: "#F0F6FF", margin: "28px 0 12px" }}>{bold(line.slice(2))}</h1>);
      i++; continue;
    }

    if (/^-{3,}$/.test(line.trim())) {
      nodes.push(<hr key={i} style={{ border: "none", borderTop: "1px solid #1A2744", margin: "20px 0" }} />);
      i++; continue;
    }

    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { tableLines.push(lines[i]); i++; }
      const rows = tableLines.filter(r => !/^\|[\s|:-]+\|$/.test(r.trim()));
      if (rows.length === 0) continue;
      const parse = (r: string) => r.split("|").slice(1, -1).map(c => c.trim());
      const [header, ...body] = rows;
      nodes.push(
        <div key={`t${i}`} style={{ overflowX: "auto", margin: "12px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>{parse(header).map((h, ci) => (
                <th key={ci} style={{ padding: "8px 12px", background: "#0D1629", color: "#22D3A4", fontWeight: 600, textAlign: "left", borderBottom: "1px solid #1A2744", whiteSpace: "nowrap" }}>{bold(h)}</th>
              ))}</tr>
            </thead>
            <tbody>{body.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: "1px solid #1A274466" }}>
                {parse(row).map((cell, ci) => (
                  <td key={ci} style={{ padding: "7px 12px", color: ci === 0 ? "#CBD5E1" : "#94A3B8", fontVariantNumeric: "tabular-nums" }}>{bold(cell)}</td>
                ))}
              </tr>
            ))}</tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, "")); i++; }
      nodes.push(<ol key={`ol${i}`} style={{ paddingLeft: 20, margin: "8px 0", color: "#CBD5E1", fontSize: 14, lineHeight: 1.8 }}>
        {items.map((it, idx) => <li key={idx} style={{ marginBottom: 6 }}>{bold(it)}</li>)}
      </ol>);
      continue;
    }

    if (/^[-*]\s/.test(line.trim())) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) { items.push(lines[i].replace(/^[-*]\s/, "").trim()); i++; }
      nodes.push(<ul key={`ul${i}`} style={{ paddingLeft: 20, margin: "8px 0", color: "#CBD5E1", fontSize: 14, lineHeight: 1.8 }}>
        {items.map((it, idx) => <li key={idx} style={{ marginBottom: 4 }}>{bold(it)}</li>)}
      </ul>);
      continue;
    }

    if (/^\s{3,}/.test(line) && line.trim()) {
      nodes.push(<p key={i} style={{ fontSize: 13, color: "#64748B", margin: "2px 0 4px", paddingLeft: 20 }}>{bold(line.trim())}</p>);
      i++; continue;
    }

    if (!line.trim()) { i++; continue; }
    nodes.push(<p key={i} style={{ fontSize: 14, color: "#CBD5E1", lineHeight: 1.8, margin: "6px 0" }}>{bold(line)}</p>);
    i++;
  }
  return nodes;
}

export function Lightbox({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
        <button onClick={onClose} style={{ position: "absolute", top: -36, right: 0, background: "transparent", border: "none", color: "#94A3B8", fontSize: 24, cursor: "pointer" }}>✕</button>
        <p style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: 2, color: "#64748B", marginBottom: 8 }}>{title.toUpperCase()}</p>
        <img src={src} alt={title} style={{ maxWidth: "85vw", maxHeight: "80vh", borderRadius: 8, display: "block" }} />
      </div>
    </div>
  );
}

export function ChartCard({ title, image_b64 }: { title: string; image_b64: string }) {
  const [open, setOpen] = React.useState(false);
  const src = `data:image/png;base64,${image_b64}`;
  return (
    <>
      <div onClick={() => setOpen(true)} style={{ background: "#060D1A", border: "1px solid #1A2744", borderRadius: 10, padding: 12, marginBottom: 12, cursor: "zoom-in" }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "#22D3A466")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "#1A2744")}>
        <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8, fontFamily: "monospace", letterSpacing: 1 }}>
          {title.toUpperCase()} <span style={{ color: "#22D3A4" }}>🔍</span>
        </div>
        <img src={src} alt={title} style={{ width: "100%", borderRadius: 6 }} />
      </div>
      {open && <Lightbox src={src} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}
