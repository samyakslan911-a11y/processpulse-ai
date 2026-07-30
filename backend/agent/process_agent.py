"""
Process Agent â€” Lean AI.

Arquitectura: Gemini 2.5 Flash + tool use (execute_python) + subprocess sandbox.
El agente recibe un CSV de logs de producciÃ³n, decide quÃ© analizar, escribe
cÃ³digo Python, lo ejecuta en un subprocess aislado con timeout, y produce un
informe con KPIs, grÃ¡ficas y recomendaciones Lean.

DecisiÃ³n de modelo: Gemini 2.5 Flash â€” ya en el stack, free tier, suficiente
para code generation con pandas/matplotlib en loop de 6 iteraciones.

DecisiÃ³n de sandbox: subprocess Python con timeout=30s en lugar de E2B.
Mismo patrÃ³n que ChatGPT Advanced Analysis en su base. El CSV y los charts
se guardan en un directorio temporal que persiste durante el run del agente.
"""
import base64
import json
import os
import subprocess
import sys
import tempfile
import textwrap
import time

from google import genai
from google.genai import types

from backend.config import settings
from backend.db.analyses import update_analysis
from backend.api.stream import emit, ensure_queue

MODEL = "gemini-2.0-flash"
MAX_ITERATIONS = 12
EXEC_TIMEOUT = 30  # segundos por ejecuciÃ³n de cÃ³digo

SYSTEM_PROMPT = """You are a Lean manufacturing process analyst with expertise in OEE,
waste detection (MUDA), and production optimization.

You have access to a Python sandbox. pandas, matplotlib, numpy, scipy are available.
The variable `df` is pre-loaded with the CSV data (auto-detected encoding and separator).
DATA_PATH contains the file path if you need to reload.

YOUR PROCESS (follow this order):
1. EXPLORE: Print df.shape, df.dtypes, df.head(), and df.columns.tolist(). This is mandatory â€” you must understand the actual structure before any analysis.
2. IDENTIFY: Based on the columns found, map them to concepts:
   - Production counts: columns with ok/good/buenas/aceptadas/piezas_ok or similar
   - Defects: columns with def/malo/rechazadas/piezas_def or similar
   - Downtime: columns with paro/downtime/tiempo or similar
   - Causes: columns with causa/reason/motivo or similar
   - Machine/equipment: columns with maquina/machine/equipo or similar
   - Shift/turn: columns with turno/shift or similar
   - Timestamp: any date/time column
3. COMPUTE: Calculate whatever KPIs the available columns allow. Adapt â€” if OEE columns don't exist, analyze what IS there (quality rate, throughput, trends, etc.).
4. VISUALIZE: Generate 1-3 relevant charts. Call plt.show() after each (captured automatically as PNG). One chart per execute_python call.
   Chart rules (design system is pre-configured â€” do not override rcParams):
   - Set fig, ax = plt.subplots(figsize=(9,5)) at the start of each chart.
   - Bar charts: use ax.bar() with width=0.6, add value labels with ax.bar_label().
   - Grouped bars: use width=0.25, loop over groups.
   - Pareto: bars left axis only â€” NEVER dual y-axis. Draw the cumulative % line as ax.plot() on the same axis, annotate the 80% threshold with ax.axhline().
   - Line charts: ax.plot() with markers='o', markersize=5.
   - Always set ax.set_title(), ax.set_xlabel(), ax.set_ylabel() in Spanish.
   - Rotate x-labels 30Â° if more than 4 categories: ax.tick_params(axis='x', rotation=30).
   - Add plt.tight_layout() before plt.show().
5. REPORT: Write a professional enterprise markdown report WITHOUT calling execute_python.
   Use formal business Spanish. Numbers must include units. Follow this exact structure:

   ## Resumen Ejecutivo
   3-4 sentences: total volume analyzed, overall quality rate, primary operational bottleneck,
   and the single most critical finding with its quantified impact.

   ## Indicadores Clave de DesempeÃ±o
   One markdown table per category found in the data. Columns: Indicador | Valor | Estado.
   Use âœ“ for acceptable values, âš  for warning, âœ— for critical.
   Example categories: ProducciÃ³n General, Calidad, Tiempos de Paro, DesempeÃ±o por MÃ¡quina.

   ## AnÃ¡lisis de Causas Principales
   For each major problem identified: root cause using 5-Why or Ishikawa reasoning,
   quantified impact (%, minutes, units lost), affected equipment/shift/process.
   Write in complete paragraphs, not bullet points.

   ## Hallazgos CrÃ­ticos
   Numbered list, maximum 5. Each item:
   **Hallazgo N â€” [TÃ­tulo breve]:** Description with specific numbers.
   *Impacto:* Quantified business impact. *Causa identificada:* Root cause.

   ## Plan de AcciÃ³n Recomendado
   A markdown table: | AcciÃ³n | MetodologÃ­a Lean | Prioridad | Impacto Estimado |
   List 4-6 concrete actions referencing specific Lean tools (TPM, 5S, SMED, Poka-Yoke,
   Kaizen, Andon, etc.). Priority: Alta / Media / Baja.

RULES:
- NEVER assume column names â€” always inspect first.
- If a column doesn't exist, say so and skip that metric gracefully.
- Use Spanish for all output: chart titles, axis labels, and the final report.
- One chart per execute_python call.
- df is pre-loaded and ready. Each call is isolated â€” df resets to the original each call.
- End with plain text report â€” do NOT call execute_python for the report.
- Handle NaN gracefully: use .fillna(), .dropna(), or .notna() as needed.
"""


def _build_tool() -> list[types.Tool]:
    return [types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name="execute_python",
            description=(
                "Execute Python code. pandas, matplotlib, numpy, scipy available. "
                "DATA_PATH points to the CSV file. "
                "Use plt.show() to capture charts â€” they are saved automatically."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "code": types.Schema(
                        type=types.Type.STRING,
                        description="Python code to execute"
                    ),
                    "description": types.Schema(
                        type=types.Type.STRING,
                        description="One line: what this code does"
                    ),
                },
                required=["code", "description"],
            ),
        )
    ])]


def _extract_chart_title(code: str) -> str | None:
    """Extract the matplotlib title from ax.set_title('...') in the code."""
    import re
    m = re.search(r'\.set_title\s*\(\s*[\'"](.+?)[\'"]\s*[\),]', code)
    return m.group(1) if m else None


def _run_code(code: str, csv_path: str, chart_dir: str) -> dict:
    """
    Execute LLM-generated Python in a subprocess with timeout.
    - DATA_PATH and plt.show() chart capture are injected via preamble.
    - Charts saved to chart_dir as chart_NN.png.
    - Returns {stdout, error, images: [base64, ...]}.
    """
    preamble = textwrap.dedent(f"""\
        import sys
        sys.stdout.reconfigure(encoding='utf-8')
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import matplotlib as mpl
        import pandas as pd
        import numpy as np
        import scipy.stats as stats
        import os, warnings, re
        from pathlib import Path
        try:
            import seaborn as sns
        except ImportError:
            sns = None
        warnings.filterwarnings('ignore')

        # â”€â”€ Design system: ProcessPulse dark theme â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        _SURFACE   = '#0D1629'
        _CANVAS    = '#060D1A'
        _GRID      = '#1A2744'
        _INK_PRI   = '#E2E8F0'
        _INK_SEC   = '#94A3B8'
        _INK_MUT   = '#64748B'
        # Categorical palette â€” validated dark adjacent pairs (dataviz skill)
        _PALETTE   = ['#22D3A4','#3987e5','#d95926','#c98500','#d55181','#9085e9','#e66767']

        mpl.rcParams.update({{
            'figure.facecolor':     _SURFACE,
            'figure.dpi':           120,
            'figure.figsize':       (9, 5),
            'axes.facecolor':       _CANVAS,
            'axes.edgecolor':       _GRID,
            'axes.labelcolor':      _INK_SEC,
            'axes.titlecolor':      _INK_PRI,
            'axes.titlesize':       13,
            'axes.titleweight':     'bold',
            'axes.titlepad':        14,
            'axes.labelsize':       11,
            'axes.grid':            True,
            'axes.spines.top':      False,
            'axes.spines.right':    False,
            'axes.prop_cycle':      mpl.cycler('color', _PALETTE),
            'grid.color':           _GRID,
            'grid.linewidth':       0.5,
            'grid.alpha':           0.7,
            'xtick.color':          _INK_MUT,
            'ytick.color':          _INK_MUT,
            'xtick.labelsize':      10,
            'ytick.labelsize':      10,
            'xtick.major.pad':      6,
            'ytick.major.pad':      6,
            'text.color':           _INK_PRI,
            'lines.linewidth':      2,
            'patch.linewidth':      0,
            'legend.facecolor':     _SURFACE,
            'legend.edgecolor':     _GRID,
            'legend.labelcolor':    _INK_SEC,
            'legend.fontsize':      10,
            'savefig.facecolor':    _SURFACE,
            'savefig.dpi':          120,
        }})

        DATA_PATH = r'{csv_path}'
        path = Path(r'{csv_path}')

        # Auto-detect encoding and separator
        df = None
        for _enc in ['utf-8', 'latin-1', 'cp1252', 'utf-8-sig']:
            for _sep in [',', ';', '\t', '|']:
                try:
                    _tmp = pd.read_csv(DATA_PATH, encoding=_enc, sep=_sep)
                    if len(_tmp.columns) > 1:
                        df = _tmp
                        break
                except Exception:
                    continue
            if df is not None:
                break
        if df is None:
            df = pd.read_csv(DATA_PATH)

        # Normalize column names: strip whitespace
        df.columns = df.columns.str.strip()

        # Fix date columns
        for _col in df.columns:
            if any(kw in _col.lower() for kw in ['timestamp', 'fecha', 'date', 'time', 'hora']):
                df[_col] = pd.to_datetime(df[_col], errors='coerce')

        # Fill NaN in text columns
        for _col in df.select_dtypes(include='object').columns:
            df[_col] = df[_col].fillna('').astype(str).str.strip()
        _CHART_DIR = r'{chart_dir}'
        _chart_n = [len([f for f in os.listdir(_CHART_DIR) if f.endswith('.png')])]

        def _capture_chart():
            _chart_n[0] += 1
            _out = os.path.join(_CHART_DIR, f'chart_{{_chart_n[0]:02d}}.png')
            plt.savefig(_out, bbox_inches='tight', dpi=100)
            plt.close('all')
            print(f'[CHART:{{_out}}]')

        plt.show = _capture_chart
    """)

    # Count existing charts so we know which ones are new after this run
    existing = set(os.listdir(chart_dir))

    script = preamble + "\n" + code

    try:
        result = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=EXEC_TIMEOUT,
        )
        stdout = result.stdout.strip()
        stderr = result.stderr.strip() if result.returncode != 0 else ""
    except subprocess.TimeoutExpired:
        return {"stdout": "", "error": f"Timeout despuÃ©s de {EXEC_TIMEOUT}s", "images": []}

    # Collect new charts produced by this execution
    images = []
    new_files = sorted(f for f in os.listdir(chart_dir) if f not in existing and f.endswith(".png"))
    for fname in new_files:
        with open(os.path.join(chart_dir, fname), "rb") as f:
            images.append(base64.b64encode(f.read()).decode())

    return {
        "stdout": stdout[:3000],
        "error": stderr[:1000] if stderr else None,
        "images": images,
    }


def run_process_agent(analysis_id: str, user_id: str, csv_bytes: bytes, filename: str):
    """Runs in a background thread. One temp dir for CSV + charts, lives for the full run."""
    ensure_queue(analysis_id)

    def _emit(event: str, payload: dict):
        emit(analysis_id, event, json.dumps(payload))

    try:
        _emit("progress", {"message": f"Iniciando anÃ¡lisis de {filename}..."})

        with tempfile.TemporaryDirectory() as tmpdir:
            # Write CSV once â€” all subprocess executions read from this path
            csv_path = os.path.join(tmpdir, "data.csv")
            with open(csv_path, "wb") as f:
                f.write(csv_bytes)

            chart_dir = os.path.join(tmpdir, "charts")
            os.makedirs(chart_dir)

            _emit("progress", {"message": "Sandbox listo. Iniciando agente Gemini..."})

            client = genai.Client(api_key=settings.gemini_api_key)
            tools = _build_tool()

            csv_preview = csv_bytes[:2000].decode("utf-8", errors="replace")
            contents: list[types.Content] = [
                types.Content(role="user", parts=[types.Part(text=(
                    f"Analiza este archivo de producciÃ³n: **{filename}**\n\n"
                    f"Vista previa:\n```\n{csv_preview}\n```\n\n"
                    "Comienza explorando la estructura completa del archivo."
                ))])
            ]

            charts: list[dict] = []
            agent_steps: list[dict] = []
            final_report: str | None = None
            iterations = 0

            for iteration in range(MAX_ITERATIONS):
                iterations += 1

                response = None
                for attempt in range(4):
                    try:
                        response = client.models.generate_content(
                            model=MODEL,
                            contents=contents,
                            config=types.GenerateContentConfig(
                                system_instruction=SYSTEM_PROMPT,
                                tools=tools,
                            ),
                        )
                        break
                    except Exception as e:
                        if "429" in str(e):
                            wait = 30 * (attempt + 1)  # 30s, 60s, 90s, 120s
                            _emit("progress", {"message": f"Cuota Gemini: esperando {wait}s antes de reintentar..."})
                            time.sleep(wait)
                            if attempt == 3:
                                _emit("failed", {"message": "Cuota Gemini: lÃ­mite de velocidad. Espera 2 minutos e intenta de nuevo."})
                                update_analysis(analysis_id, {"status": "failed", "error_message": "quota"})
                                return
                        else:
                            raise
                if response is None:
                    return

                candidate = response.candidates[0]
                model_content = candidate.content
                contents.append(model_content)

                fn_calls = [p for p in model_content.parts if p.function_call]

                # No function calls â†’ agent finished, text = final report
                if not fn_calls:
                    text_parts = [p.text for p in model_content.parts if p.text]
                    final_report = "\n\n".join(text_parts).strip()
                    break

                fn_responses: list[types.Part] = []
                for part in fn_calls:
                    fc = part.function_call
                    args = dict(fc.args)
                    code = args.get("code", "")
                    description = args.get("description", f"Paso {iterations}")

                    t0 = time.monotonic()
                    _emit("step", {"message": description, "iteration": iterations})

                    result = _run_code(code, csv_path, chart_dir)
                    elapsed_ms = int((time.monotonic() - t0) * 1000)

                    # Emit new charts â€” use matplotlib title if available
                    chart_title = _extract_chart_title(code) or description
                    for img_b64 in result["images"]:
                        chart = {"title": chart_title, "image_b64": img_b64}
                        charts.append(chart)
                        _emit("chart", {"title": chart_title, "image_b64": img_b64})

                    agent_steps.append({
                        "step": iterations,
                        "description": description,
                        "code": code[:500],
                        "stdout": result["stdout"],
                        "error": result["error"],
                        "images_count": len(result["images"]),
                        "elapsed_ms": elapsed_ms,
                    })

                    if result["stdout"]:
                        _emit("output", {"message": result["stdout"][:500]})
                    if result["error"]:
                        _emit("output", {"message": f"âš  Error: {result['error'][:300]}"})

                    result_text = result["stdout"] or ""
                    if result["error"]:
                        result_text += f"\nERROR: {result['error']}"
                    if result["images"]:
                        result_text += f"\n[{len(result['images'])} grÃ¡fica(s) generada(s)]"

                    fn_responses.append(types.Part(
                        function_response=types.FunctionResponse(
                            name="execute_python",
                            response={"result": result_text or "OK (sin output)"}
                        )
                    ))

                contents.append(types.Content(role="user", parts=fn_responses))

                # Force final report on second-to-last iteration
                if iteration == MAX_ITERATIONS - 3:
                    _emit("progress", {"message": "Preparando informe final..."})
                    contents.append(types.Content(role="user", parts=[types.Part(text=(
                        "Ya tienes suficientes datos y grÃ¡ficas. "
                        "NO uses mÃ¡s herramientas. Escribe AHORA el informe final completo en markdown."
                    ))]))

        update_analysis(analysis_id, {
            "status": "done",
            "report": final_report or "AnÃ¡lisis completado sin informe de texto.",
            "charts": charts,
            "agent_steps": agent_steps,
            "iterations": iterations,
        })

        _emit("done", {
            "message": "AnÃ¡lisis completado",
            "iterations": iterations,
            "charts_count": len(charts),
        })

    except Exception as exc:
        err = f"{type(exc).__name__}: {exc}"
        update_analysis(analysis_id, {"status": "failed", "error_message": err})
        _emit("failed", {"message": err})
