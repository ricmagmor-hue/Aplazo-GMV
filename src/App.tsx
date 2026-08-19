import { useMemo, useRef, useState } from "react";
import {
  applyBalance,
  buildProcessedDataFromStore,
  emptyStore,
  EVENT_COLS,
  fmtMoney,
  fmtPct,
  ingestFiles,
  MERCHANT_COLS,
  normalizeStore,
  SESSION_COLS,
  funnelStagesFromCounts,
  MIN_SESSIONS_RANKED,
  MIN_SESSIONS_STABLE,
  type DataStore,
  type FileStatus,
  type MerchantMetrics,
} from "./engine";

const STORE_KEY = "aplazo-gmv-store-v2";

function loadPersistedStore(): DataStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? normalizeStore(JSON.parse(raw)) : emptyStore();
  } catch {
    return emptyStore();
  }
}

function persistStore(store: DataStore) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* quota — keep in memory */
  }
}

function BarChart({
  items,
  warn,
}: {
  items: { label: string; value: number }[];
  warn?: boolean;
}) {
  return (
    <div className="bar-wrap">
      {items.map((item) => (
        <div className="bar-row" key={item.label}>
          <span>{item.label}</span>
          <div className={warn ? "bar warn" : "bar"}>
            <span style={{ width: `${Math.max(0, Math.min(100, item.value))}%` }} />
          </div>
          <span className="num">{item.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [store, setStore] = useState<DataStore>(loadPersistedStore);
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState("");
  const [processing, setProcessing] = useState(false);
  const [gmvBalance, setGmvBalance] = useState(0.65);
  const [selectedId, setSelectedId] = useState("");

  const processed = useMemo(() => buildProcessedDataFromStore(store), [store]);
  const metrics = useMemo(
    () => (processed ? applyBalance(processed.metrics, gmvBalance) : []),
    [processed, gmvBalance],
  );
  const selected: MerchantMetrics | undefined =
    metrics.find((m) => m.merchantId === selectedId) ?? metrics[0];
  const top15 = metrics.slice(0, 15);
  const hasData = store.loadCount > 0 && Boolean(processed);

  const globalFunnel = processed
    ? [
        { label: "Sesiones", value: 100 },
        ...funnelStagesFromCounts(processed.globalFunnel.stepCounts, processed.globalFunnel.total).map((s) => ({
          label: s.label,
          value: s.rate * 100,
        })),
      ]
    : [];

  async function onFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setProcessing(true);
    setProgress("Leyendo y homologando CSVs…");
    const result = await ingestFiles(Array.from(list), store);
    persistStore(result.store);
    setStore(result.store);
    setStatuses(result.statuses);
    setErrors(result.errors);
    setProgress("");
    setProcessing(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function reset() {
    const next = emptyStore();
    persistStore(next);
    setStore(next);
    setStatuses([]);
    setErrors([]);
    setSelectedId("");
  }

  return (
    <div className="app stack gap-20">
      <header>
        <h1>GMV Funnel — Priorización de Merchants</h1>
        <p className="lead">
          Carga CSVs de merchants, sesiones de checkout y eventos de integración. La herramienta limpia
          la data, calcula el funnel con <code>funnel_step_reached</code> y rankea merchants por impacto vs. acciones escalables.
        </p>
      </header>

      <section className="card">
        <div className="card-h">{hasData ? "Agregar más datos CSV" : "Carga inicial de archivos CSV"}</div>
        <div className="card-b stack gap-12">
          <p className="muted">
            {hasData
              ? `Base activa: ${Object.keys(store.merchants).length} merchants · ${Object.keys(store.seenSessionIds).length.toLocaleString()} sesiones · ${Object.keys(store.seenEventIds).length.toLocaleString()} eventos. Puedes subir 1, 2 o 3 archivos. Obligatorios para ver un merchant nuevo: catálogo + sesiones. Integración es opcional.`
              : "No hace falta subir los 3 siempre. Para ver ranking y funnel: merchants.csv + checkout_sessions.csv. integration_events.csv es opcional (errores técnicos y tickets)."}
          </p>
          <div className="row gap-8">
            <button className="btn btn-primary" disabled={processing} onClick={() => inputRef.current?.click()}>
              {processing ? "Procesando…" : hasData ? "Agregar archivos CSV" : "Cargar archivos CSV"}
            </button>
            {hasData && (
              <button className="btn btn-danger" onClick={reset}>
                Reiniciar base
              </button>
            )}
          </div>
          <input ref={inputRef} type="file" accept=".csv" multiple onChange={(e) => onFiles(e.target.files)} />
          {progress && <p className="caption">{progress}</p>}
          {statuses.length > 0 && (
            <div className="row gap-8">
              {statuses.map((s) => (
                <span key={s.name} className={s.ok ? "pill pill-ok" : "pill pill-warn"}>
                  {s.name}: {s.ok ? `${s.rows.toLocaleString()} filas` : "rechazado"}
                </span>
              ))}
            </div>
          )}
          {errors.length > 0 && (
            <div className="callout warn">
              <h3>Advertencias de validación</h3>
              <p>{errors.slice(0, 8).join(" · ")}</p>
            </div>
          )}
        </div>
      </section>

      {!hasData && (
        <section className="card">
          <div className="card-h">Esquema esperado</div>
          <div className="card-b stack gap-8">
            <p className="caption">merchants.csv: {MERCHANT_COLS.join(", ")}</p>
            <p className="caption">checkout_sessions.csv: {SESSION_COLS.join(", ")}</p>
            <p className="caption">integration_events.csv: {EVENT_COLS.join(", ")}</p>
            <p className="caption">
              Campos críticos: merchant_id, amount_requested, funnel_step_reached, completed, device.
              El funnel se calcula con funnel_step_reached (etapas acumulativas).
            </p>
          </div>
        </section>
      )}

      {hasData && processed && selected && (
        <>
          <section className="card">
            <div className="card-h">Balance de priorización</div>
            <div className="card-b stack gap-8">
              <div className="row gap-12">
                <span className="caption" style={{ minWidth: 140 }}>Quick wins escalables</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(gmvBalance * 100)}
                  onChange={(e) => setGmvBalance(Number(e.target.value) / 100)}
                />
                <span className="caption" style={{ minWidth: 140, textAlign: "right" }}>Alta concentración GMV</span>
              </div>
              <p className="caption" style={{ textAlign: "center" }}>
                Peso ranking: {Math.round(gmvBalance * 100)}% GMV perdido · {Math.round((1 - gmvBalance) * 100)}% escalabilidad
              </p>
            </div>
          </section>

          <div className="row gap-16">
            <div className="stat"><div className="label">Merchants analizados</div><div className="value">{metrics.length}</div></div>
            <div className="stat"><div className="label">Sesiones totales</div><div className="value">{processed.globalFunnel.total.toLocaleString()}</div></div>
            <div className="stat warn"><div className="label">Severidad promedio</div><div className="value">{(metrics.reduce((a, m) => a + m.severityScore, 0) / metrics.length).toFixed(0)}</div></div>
            <div className="stat danger"><div className="label">GMV en riesgo</div><div className="value">{fmtMoney(processed.totalLostGmv)}</div></div>
          </div>

          <section className="card">
            <div className="card-h">
              Escalabilidad de la acción recomendada
              <span className="pill pill-info">{selected.actionLabel}</span>
            </div>
            <div className="card-b stack gap-12">
              <div className="row gap-16">
                <div className="stat info"><div className="label">Merchants del cohorte</div><div className="value">{selected.actionMerchantsCount} de {metrics.length}</div></div>
                <div className="stat"><div className="label">Cobertura</div><div className="value">{Math.round((selected.actionMerchantsCount / metrics.length) * 100)}%</div></div>
                <div className="stat danger"><div className="label">GMV del cohorte</div><div className="value">{fmtMoney(selected.actionTotalLostGmv)}</div></div>
                <div className="stat ok"><div className="label">Score escalabilidad</div><div className="value">{selected.scalability.toFixed(0)}</div></div>
              </div>
              <p className="caption">{selected.actionCohort}. Solo merchants con misma plataforma, integración, device foco e issue comparten escalabilidad.</p>
            </div>
          </section>

          <section className="card">
            <div className="card-h">Funnel global — tasa de conversión por etapa</div>
            <div className="card-b stack gap-8">
              <BarChart items={globalFunnel} />
              <p className="caption">Fuente: checkout_sessions.csv · {processed.globalFunnel.total.toLocaleString()} sesiones acumuladas</p>
            </div>
          </section>

          {processed.insufficientMerchants.length > 0 && (
            <div className="callout warn">
              <h3>Merchants excluidos del ranking — datos insuficientes</h3>
              <p>
                Los siguientes merchants tienen menos de {MIN_SESSIONS_RANKED} sesiones y fueron excluidos del ranking.
                Con tan pocas sesiones, la tasa de completion tiene una variabilidad estadística de ±{Math.round(Math.sqrt(0.22 * 0.78 / MIN_SESSIONS_RANKED) * 100 * 1.96)}pp (95% confianza), lo que haría que su posición en el ranking sea aleatoria.
                Cuando acumulen al menos {MIN_SESSIONS_RANKED} sesiones serán incluidos automáticamente al recargar la data.
              </p>
              <p className="caption" style={{ marginTop: 6 }}>
                {processed.insufficientMerchants.map((m) => `${m.merchantName} (${m.merchantId}): ${m.sessions} sesiones`).join(" · ")}
              </p>
            </div>
          )}

          <section className="card">
            <div className="card-h">Ranking de merchants — priorización</div>
            <div className="card-b">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Merchant</th>
                    <th>Plataforma</th>
                    <th className="center">Foco</th>
                    <th className="num">Escalab.</th>
                    <th className="center">Cohorte</th>
                    <th className="num">Score</th>
                    <th className="num">GMV perdido</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {top15.map((m, i) => (
                    <tr key={m.merchantId} className={m.merchantId === selected.merchantId ? "active" : ""}>
                      <td>{i + 1}</td>
                      <td>
                        {m.merchantName}
                        {m.dataQuality === "low_data" && (
                          <span className="pill pill-warn" style={{ marginLeft: 6, fontSize: "0.7rem" }} title={`Solo ${m.sessions} sesiones — ranking orientativo (±${Math.round(Math.sqrt(0.22 * 0.78 / m.sessions) * 100 * 1.96)}pp)`}>
                            datos bajos
                          </span>
                        )}
                      </td>
                      <td>{m.platform} ({m.integrationType})</td>
                      <td className="center">{m.focusDevice}</td>
                      <td className="num">{m.scalability.toFixed(0)}</td>
                      <td className="center">{m.actionMerchantsCount}</td>
                      <td className="num score">{m.compositeScore.toFixed(1)}</td>
                      <td className="num">{fmtMoney(m.lostGmv)}</td>
                      <td>
                        <button
                          className={m.merchantId === selected.merchantId ? "btn btn-primary" : "btn btn-ghost"}
                          onClick={() => setSelectedId(m.merchantId)}
                        >
                          {m.merchantId === selected.merchantId ? "Seleccionado" : "Ver detalle"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="caption" style={{ marginTop: 8 }}>
                Score = slider × GMV perdido normalizado + (1 − slider) × escalabilidad. Cohorte = merchants con la misma acción granular.
                Merchants con menos de {MIN_SESSIONS_RANKED} sesiones se excluyen. Entre {MIN_SESSIONS_RANKED}–{MIN_SESSIONS_STABLE - 1} sesiones se marcan como "datos bajos".
              </p>
            </div>
          </section>

          <section className="card">
            <div className="card-h">
              Diagnóstico del merchant
              <span className="pill pill-info">Merchant activo</span>
            </div>
            <div className="card-b stack gap-12">
              <div className="row gap-12">
                <span className="muted">Seleccionar merchant:</span>
                <select value={selected.merchantId} onChange={(e) => setSelectedId(e.target.value)}>
                  {metrics.map((m) => (
                    <option key={m.merchantId} value={m.merchantId}>
                      {m.merchantName} ({m.merchantId}) · Score {m.compositeScore.toFixed(1)}
                    </option>
                  ))}
                </select>
              </div>
              <hr className="hr" />
              <h2>{selected.merchantName}</h2>
              <p className="muted">
                {selected.merchantId} · {selected.platform} · {selected.integrationType} · {selected.gmvTier} · {selected.status}
                {selected.kamAssigned ? ` · KAM: ${selected.kamAssigned}` : ""}
              </p>
              {selected.dataQuality === "low_data" && (
                <div className="callout warn" style={{ padding: "10px 14px" }}>
                  <strong>Datos bajos ({selected.sessions} sesiones).</strong> El diagnóstico y el score son orientativos.
                  La tasa de completion tiene un margen de ±{Math.round(Math.sqrt(0.22 * 0.78 / selected.sessions) * 100 * 1.96)}pp (95% confianza).
                  Este merchant subirá al ranking estable cuando acumule {MIN_SESSIONS_STABLE}+ sesiones.
                </div>
              )}
              <div className="row gap-16">
                <div className="stat"><div className="label">Sesiones</div><div className="value">{selected.sessions.toLocaleString()}</div></div>
                <div className="stat info"><div className="label">Completion</div><div className="value">{fmtPct(selected.completionRate)}</div></div>
                <div className="stat"><div className="label">Desktop completion</div><div className="value">{fmtPct(selected.desktopCompletionRate)}</div></div>
                <div className="stat warn"><div className="label">Mobile completion</div><div className="value">{fmtPct(selected.mobileCompletionRate)}</div></div>
                <div className="stat warn"><div className="label">Foco diagnóstico</div><div className="value">{selected.focusDevice}</div></div>
                <div className="stat danger"><div className="label">GMV perdido</div><div className="value">{fmtMoney(selected.lostGmv)}</div></div>
              </div>
            </div>
          </section>

          <div className="grid2">
            <section className="card">
              <div className="card-h">Métricas de funnel</div>
              <div className="card-b stack gap-12">
                <table>
                  <thead><tr><th>Etapa (funnel_step_reached)</th><th className="num">Llegaron</th><th className="num">% sesiones</th></tr></thead>
                  <tbody>
                    {selected.funnelSteps.map((s) => (
                      <tr key={s.key}>
                        <td>{s.label}</td>
                        <td className="num">{s.reached.toLocaleString()}</td>
                        <td className="num">{fmtPct(s.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="caption">
                  Cada tasa es el % de sesiones que llegaron <strong>al menos</strong> a esa etapa. Las barras son acumulativas y no pueden superar 100%.
                  Drop-off principal: {selected.topDropOff.replace(/_/g, " ")}
                  {selected.topError ? ` · Error: ${selected.topError}` : ""}
                </p>
              </div>
            </section>
            <div className="stack gap-16">
              <div className="callout warn">
                <h3>Diagnóstico — causa raíz</h3>
                <p>{selected.rootCause}</p>
              </div>
              <div className="callout info">
                <h3>Acción recomendada — {selected.actionLabel}</h3>
                <p>{selected.recommendedAction}</p>
              </div>
              <div className="callout">
                <h3>Cohorte de escalabilidad</h3>
                <p>
                  {selected.actionCohort}. {selected.actionMerchantsCount} merchant{selected.actionMerchantsCount !== 1 ? "s" : ""} comparten esta acción
                  ({Math.round((selected.actionMerchantsCount / metrics.length) * 100)}% del portafolio) con GMV combinado de {fmtMoney(selected.actionTotalLostGmv)}.
                </p>
              </div>
            </div>
          </div>

          <section className="card">
            <div className="card-h">Funnel — {selected.merchantName}</div>
            <div className="card-b stack gap-8">
              <BarChart
                warn
                items={selected.funnelSteps.map((s) => ({ label: s.label, value: s.rate * 100 }))}
              />
              <p className="caption">Fuente: checkout_sessions.funnel_step_reached · {selected.merchantId} · {selected.sessions.toLocaleString()} sesiones</p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
