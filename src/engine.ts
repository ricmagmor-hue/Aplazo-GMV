export const MERCHANT_COLS = [
  "merchant_id",
  "merchant_name",
  "platform",
  "integration_type",
  "vertical",
  "region",
  "gmv_tier",
  "kam_assigned",
  "status",
  "signup_date",
] as const;

export const SESSION_COLS = [
  "session_id",
  "merchant_id",
  "session_timestamp",
  "device",
  "platform",
  "region",
  "vertical",
  "gmv_tier",
  "widget_shown",
  "widget_interacted",
  "payment_method_selected",
  "amount_requested",
  "plan_months",
  "funnel_step_reached",
  "drop_off_reason",
  "approved",
  "completed",
] as const;

export const EVENT_COLS = [
  "event_id",
  "merchant_id",
  "event_name",
  "event_timestamp",
  "completed",
  "attempt_number",
  "support_ticket_opened",
  "error_code",
] as const;

export type MerchantRow = Record<(typeof MERCHANT_COLS)[number], string>;

export const FUNNEL_STEPS = [
  "widget",
  "widget_shown",
  "widget_interacted",
  "kyc",
  "underwriting",
  "confirmation",
  "completed",
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const FUNNEL_LABELS: Record<FunnelStep, string> = {
  widget: "Inicio",
  widget_shown: "Widget visible",
  widget_interacted: "Interacción",
  kyc: "KYC",
  underwriting: "Underwriting",
  confirmation: "Confirmación",
  completed: "Completado",
};

export type FunnelStage = {
  key: FunnelStep;
  label: string;
  reached: number;
  rate: number;
};

export const MIN_SESSIONS_RANKED = 50;
export const MIN_SESSIONS_STABLE = 150;

export type DataQuality = "stable" | "low_data" | "insufficient";

export type MerchantMetrics = {
  merchantId: string;
  merchantName: string;
  platform: string;
  integrationType: string;
  vertical: string;
  region: string;
  gmvTier: string;
  status: string;
  kamAssigned: string;
  sessions: number;
  dataQuality: DataQuality;
  totalGmv: number;
  lostGmv: number;
  completedGmv: number;
  completionRate: number;
  widgetShowRate: number;
  interactionRate: number;
  kycRate: number;
  underwritingRate: number;
  confirmationRate: number;
  funnelSteps: FunnelStage[];
  severityScore: number;
  businessImpact: number;
  confidence: number;
  scalability: number;
  compositeScore: number;
  actionKey: string;
  actionLabel: string;
  actionMerchantsCount: number;
  actionTotalLostGmv: number;
  focusDevice: string;
  desktopCompletionRate: number;
  mobileCompletionRate: number;
  actionCohort: string;
  topDropOff: string;
  topError: string;
  supportTickets: number;
  integrationFailures: number;
  rootCause: string;
  recommendedAction: string;
};

type DiagnosisResult = {
  rootCause: string;
  recommendedAction: string;
  actionKey: string;
  actionLabel: string;
  actionCohort: string;
  focusDevice: string;
  desktopCompletionRate: number;
  mobileCompletionRate: number;
};

type DeviceAgg = {
  total: number;
  completed: number;
  lostGmv: number;
  dropCounts: Record<string, number>;
  stepCounts: Record<string, number>;
};

type SessionAgg = {
  total: number;
  completed: number;
  totalGmv: number;
  lostGmv: number;
  stepSeveritySum: number;
  dropCounts: Record<string, number>;
  stepCounts: Record<string, number>;
  byDevice: Record<string, DeviceAgg>;
};

type EventAgg = {
  errorCounts: Record<string, number>;
  supportTickets: number;
  integrationFailures: number;
};

export type GlobalFunnel = {
  total: number;
  stepCounts: Record<string, number>;
};

export type DataStore = {
  merchants: Record<string, MerchantRow>;
  sessionAggs: Record<string, SessionAgg>;
  eventAggs: Record<string, EventAgg>;
  seenSessionIds: Record<string, true>;
  seenEventIds: Record<string, true>;
  globalFunnel: GlobalFunnel;
  loadCount: number;
};

export type InsufficientMerchant = {
  merchantId: string;
  merchantName: string;
  sessions: number;
};

export type ProcessedData = {
  merchants: MerchantRow[];
  metrics: Omit<MerchantMetrics, "compositeScore">[];
  globalFunnel: GlobalFunnel;
  totalLostGmv: number;
  insufficientMerchants: InsufficientMerchant[];
};

export type FileStatus = {
  name: string;
  kind: "merchants" | "sessions" | "events";
  rows: number;
  ok: boolean;
  errors: string[];
};

export function emptyStore(): DataStore {
  return {
    merchants: {},
    sessionAggs: {},
    eventAggs: {},
    seenSessionIds: {},
    seenEventIds: {},
    globalFunnel: { total: 0, stepCounts: {} },
    loadCount: 0,
  };
}

function emptyDeviceAgg(): DeviceAgg {
  return { total: 0, completed: 0, lostGmv: 0, dropCounts: {}, stepCounts: {} };
}

function normalizeStepCounts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function normalizeSessionAgg(raw: Partial<SessionAgg>): SessionAgg {
  const base: SessionAgg = {
    total: 0, completed: 0, totalGmv: 0, lostGmv: 0, stepSeveritySum: 0,
    dropCounts: {}, stepCounts: {}, byDevice: {},
  };
  if (!raw || typeof raw !== "object") return base;
  const byDevice: Record<string, DeviceAgg> = {};
  if (raw.byDevice && typeof raw.byDevice === "object") {
    for (const [k, v] of Object.entries(raw.byDevice)) {
      if (v && typeof v === "object") {
        byDevice[k] = {
          ...emptyDeviceAgg(),
          ...v,
          dropCounts: { ...(v.dropCounts ?? {}) },
          stepCounts: normalizeStepCounts(v.stepCounts),
        };
      }
    }
  }
  return {
    ...base,
    ...raw,
    dropCounts: raw.dropCounts ?? {},
    stepCounts: normalizeStepCounts(raw.stepCounts),
    byDevice,
  };
}

export function normalizeStore(raw: unknown): DataStore {
  const base = emptyStore();
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Partial<DataStore>;
  const gf = s.globalFunnel;
  return {
    merchants: s.merchants && typeof s.merchants === "object" ? s.merchants : base.merchants,
    sessionAggs: s.sessionAggs && typeof s.sessionAggs === "object"
      ? Object.fromEntries(Object.entries(s.sessionAggs).map(([k, v]) => [k, normalizeSessionAgg(v as Partial<SessionAgg>)]))
      : base.sessionAggs,
    eventAggs: s.eventAggs && typeof s.eventAggs === "object" ? s.eventAggs : base.eventAggs,
    seenSessionIds: s.seenSessionIds && typeof s.seenSessionIds === "object" ? s.seenSessionIds : base.seenSessionIds,
    seenEventIds: s.seenEventIds && typeof s.seenEventIds === "object" ? s.seenEventIds : base.seenEventIds,
    globalFunnel:
      gf && typeof gf === "object"
        ? {
            total: typeof gf.total === "number" ? gf.total : 0,
            stepCounts: normalizeStepCounts((gf as GlobalFunnel).stepCounts),
          }
        : base.globalFunnel,
    loadCount: typeof s.loadCount === "number" ? s.loadCount : 0,
  };
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map(splitCsvLine);
  return { headers, rows };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function toBool(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}

function toNum(v: string): number | null {
  const n = parseFloat(v.trim().replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function titlePlatform(p: string): string {
  const s = p.trim().toLowerCase();
  if (!s) return "";
  if (s === "custom api") return "Custom API";
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function validateHeaders(headers: string[], expected: readonly string[], fileLabel: string): string[] {
  const norm = headers.map(normalizeHeader);
  const missing = expected.filter((c) => !norm.includes(c));
  if (missing.length) return [`${fileLabel}: faltan columnas: ${missing.join(", ")}`];
  return [];
}

function rowsToObjects(headers: string[], rows: string[][]): Record<string, string>[] {
  const norm = headers.map(normalizeHeader);
  return rows.map((cells) => {
    const obj: Record<string, string> = {};
    norm.forEach((h, i) => {
      obj[h] = (cells[i] ?? "").trim();
    });
    return obj;
  });
}

function cleanMerchants(raw: Record<string, string>[]): { data: MerchantRow[]; errors: string[] } {
  const errors: string[] = [];
  const data: MerchantRow[] = [];
  raw.forEach((r, idx) => {
    const rowNum = idx + 2;
    if (!r.merchant_id) {
      errors.push(`merchants fila ${rowNum}: merchant_id vacío`);
      return;
    }
    if (!r.gmv_tier) errors.push(`merchants fila ${rowNum}: gmv_tier vacío (afecta impacto)`);
    if (!r.platform) errors.push(`merchants fila ${rowNum}: platform vacío`);
    data.push({
      merchant_id: r.merchant_id,
      merchant_name: r.merchant_name || r.merchant_id,
      platform: titlePlatform(r.platform),
      integration_type: (r.integration_type || "").toLowerCase(),
      vertical: r.vertical || "",
      region: r.region || "",
      gmv_tier: (r.gmv_tier || "").toUpperCase(),
      kam_assigned: r.kam_assigned || "",
      status: (r.status || "").toLowerCase(),
      signup_date: r.signup_date || "",
    });
  });
  return { data, errors };
}

const TIER_WEIGHT: Record<string, number> = { XL: 1, L: 0.75, M: 0.5, S: 0.25 };

function funnelStepSeverity(step: string): number {
  const map: Record<string, number> = {
    widget: 0.95,
    widget_not_shown: 0.95,
    widget_shown: 0.7,
    widget_interacted: 0.55,
    kyc: 0.4,
    payment_method_selected: 0.4,
    underwriting: 0.28,
    confirmation: 0.12,
    approved: 0.12,
    completed: 0,
  };
  return map[step] ?? 0.6;
}

function normalizeFunnelStep(raw: string): string {
  const s = (raw || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (s === "widget_not_shown") return "widget";
  if (s === "payment_method_selected" || s === "payment") return "kyc";
  if (s === "approved") return "confirmation";
  return s || "widget";
}

export function reachedAtLeast(stepCounts: Record<string, number>, step: FunnelStep): number {
  const idx = FUNNEL_STEPS.indexOf(step);
  if (idx < 0) return 0;
  let n = 0;
  for (let i = idx; i < FUNNEL_STEPS.length; i++) n += stepCounts[FUNNEL_STEPS[i]] ?? 0;
  return n;
}

export function funnelStagesFromCounts(stepCounts: Record<string, number>, total: number): FunnelStage[] {
  return FUNNEL_STEPS.filter((step) => step !== "widget").map((step) => {
    const reached = reachedAtLeast(stepCounts, step);
    return {
      key: step,
      label: FUNNEL_LABELS[step],
      reached,
      rate: total > 0 ? reached / total : 0,
    };
  });
}

function normalizeDevice(raw: string): string {
  const s = (raw || "").trim().toLowerCase();
  if (s.includes("mobile") || s === "phone" || s === "mweb") return "mobile";
  if (s.includes("desktop") || s === "web" || s === "pc") return "desktop";
  if (s.includes("tablet") || s === "ipad") return "tablet";
  return s || "unknown";
}

function deviceCompletion(d: DeviceAgg): number {
  return d.total > 0 ? reachedAtLeast(d.stepCounts, "completed") / d.total : 0;
}
function stageRate(steps: FunnelStage[], key: FunnelStep): number {
  return steps.find((s) => s.key === key)?.rate ?? 0;
}

function largestDropStep(steps: FunnelStage[]): FunnelStep {
  let prev = 1;
  let best: FunnelStep = "widget_shown";
  let bestDrop = -1;
  for (const s of steps) {
    const drop = prev - s.rate;
    if (drop > bestDrop) {
      bestDrop = drop;
      best = s.key;
    }
    prev = s.rate;
  }
  return best;
}

function mergeSessionRows(raw: Record<string, string>[], store: DataStore): { errors: string[]; added: number; skipped: number } {
  const errors: string[] = [];
  const maxErrors = 5;
  let added = 0;
  let skipped = 0;

  for (let idx = 0; idx < raw.length; idx++) {
    const r = raw[idx];
    const rowNum = idx + 2;
    const sid = r.session_id?.trim();
    if (sid && store.seenSessionIds[sid]) {
      skipped++;
      continue;
    }
    if (!r.merchant_id) {
      if (errors.length < maxErrors) errors.push(`checkout_sessions fila ${rowNum}: merchant_id vacío`);
      continue;
    }
    const amount = toNum(r.amount_requested);
    if (amount === null) {
      if (errors.length < maxErrors) errors.push(`checkout_sessions fila ${rowNum}: amount_requested vacío o inválido`);
      continue;
    }
    const completed = toBool(r.completed);
    if (
      toBool(r.widget_shown) === null ||
      toBool(r.widget_interacted) === null ||
      toBool(r.approved) === null ||
      completed === null
    ) {
      if (errors.length < maxErrors) errors.push(`checkout_sessions fila ${rowNum}: campos booleanos inválidos`);
      continue;
    }

    const mid = r.merchant_id;
    let agg = store.sessionAggs[mid];
    if (!agg) {
      agg = {
        total: 0, completed: 0, totalGmv: 0, lostGmv: 0, stepSeveritySum: 0,
        dropCounts: {}, stepCounts: {}, byDevice: {},
      };
      store.sessionAggs[mid] = agg;
    }

    const deviceKey = normalizeDevice(r.device || "");
    let dev = agg.byDevice[deviceKey];
    if (!dev) {
      dev = emptyDeviceAgg();
      agg.byDevice[deviceKey] = dev;
    }

    const step = normalizeFunnelStep(r.funnel_step_reached);

    agg.total++;
    dev.total++;
    agg.stepCounts[step] = (agg.stepCounts[step] ?? 0) + 1;
    dev.stepCounts[step] = (dev.stepCounts[step] ?? 0) + 1;
    if (completed || step === "completed") {
      agg.completed++;
      dev.completed++;
    }
    agg.totalGmv += amount;
    if (!(completed || step === "completed")) {
      agg.lostGmv += amount;
      dev.lostGmv += amount;
      agg.stepSeveritySum += funnelStepSeverity(step);
      const drop = (r.drop_off_reason || "none").toLowerCase();
      agg.dropCounts[drop] = (agg.dropCounts[drop] ?? 0) + 1;
      dev.dropCounts[drop] = (dev.dropCounts[drop] ?? 0) + 1;
    }

    store.globalFunnel.total++;
    store.globalFunnel.stepCounts[step] = (store.globalFunnel.stepCounts[step] ?? 0) + 1;

    if (sid) store.seenSessionIds[sid] = true;
    added++;
  }

  return { errors, added, skipped };
}

function mergeEventRows(raw: Record<string, string>[], store: DataStore): { errors: string[]; added: number; skipped: number } {
  const errors: string[] = [];
  const maxErrors = 5;
  let added = 0;
  let skipped = 0;

  for (let idx = 0; idx < raw.length; idx++) {
    const r = raw[idx];
    const rowNum = idx + 2;
    const eid = r.event_id?.trim();
    if (eid && store.seenEventIds[eid]) {
      skipped++;
      continue;
    }
    if (!r.merchant_id) {
      if (errors.length < maxErrors) errors.push(`integration_events fila ${rowNum}: merchant_id vacío`);
      continue;
    }
    const completed = toBool(r.completed);
    if (completed === null) {
      if (errors.length < maxErrors) errors.push(`integration_events fila ${rowNum}: completed inválido`);
      continue;
    }
    const ticket = toBool(r.support_ticket_opened) ?? false;
    const mid = r.merchant_id;
    let agg = store.eventAggs[mid];
    if (!agg) {
      agg = { errorCounts: {}, supportTickets: 0, integrationFailures: 0 };
      store.eventAggs[mid] = agg;
    }
    if (!completed) agg.integrationFailures++;
    if (ticket) agg.supportTickets++;
    const code = (r.error_code || "").trim().replace(/\s+/g, " ");
    if (code && code.toLowerCase() !== "null") {
      agg.errorCounts[code] = (agg.errorCounts[code] ?? 0) + 1;
    }
    if (eid) store.seenEventIds[eid] = true;
    added++;
  }

  return { errors, added, skipped };
}

function cloneSessionAggs(aggs: Record<string, SessionAgg>): Record<string, SessionAgg> {
  const out: Record<string, SessionAgg> = {};
  for (const [k, v] of Object.entries(aggs)) {
    const byDevice: Record<string, DeviceAgg> = {};
    for (const [dk, dv] of Object.entries(v.byDevice ?? {})) {
      byDevice[dk] = { ...dv, dropCounts: { ...dv.dropCounts }, stepCounts: { ...dv.stepCounts } };
    }
    out[k] = { ...v, dropCounts: { ...v.dropCounts }, stepCounts: { ...v.stepCounts }, byDevice };
  }
  return out;
}

function cloneEventAggs(aggs: Record<string, EventAgg>): Record<string, EventAgg> {
  const out: Record<string, EventAgg> = {};
  for (const [k, v] of Object.entries(aggs)) {
    out[k] = { ...v, errorCounts: { ...v.errorCounts } };
  }
  return out;
}

function mergeMerchants(rows: MerchantRow[], store: DataStore): number {
  let added = 0;
  for (const m of rows) {
    const isNew = !store.merchants[m.merchant_id];
    store.merchants[m.merchant_id] = m;
    if (isNew) added++;
  }
  return added;
}

function topDropOffFromCounts(counts: Record<string, number>): string {
  let best = "none";
  let max = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > max) {
      max = v;
      best = k;
    }
  }
  return best;
}

function topErrorFromCounts(counts: Record<string, number>): string {
  let best = "";
  let max = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > max) {
      max = v;
      best = k;
    }
  }
  return best;
}

export function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function diagnose(
  m: MerchantRow,
  agg: SessionAgg,
  topDropOff: string,
  topError: string,
  integrationFailures: number,
  supportTickets: number,
): DiagnosisResult {
  const MIN_DEV = 25;
  const desktop = agg.byDevice.desktop ?? emptyDeviceAgg();
  const mobile = agg.byDevice.mobile ?? emptyDeviceAgg();
  const desktopComp = deviceCompletion(desktop);
  const mobileComp = deviceCompletion(mobile);

  let focusDevice = "all";
  let deviceNote = "";

  if (desktop.total >= MIN_DEV && mobile.total >= MIN_DEV) {
    const gap = desktopComp - mobileComp;
    if (gap >= 0.08) {
      focusDevice = "mobile";
      deviceNote = `Brecha mobile vs desktop: completion mobile ${fmtPct(mobileComp)} vs desktop ${fmtPct(desktopComp)} (−${fmtPct(gap)}).`;
    } else if (gap <= -0.08) {
      focusDevice = "desktop";
      deviceNote = `Brecha desktop vs mobile: completion desktop ${fmtPct(desktopComp)} vs mobile ${fmtPct(mobileComp)}.`;
    }
  } else if (mobile.total >= MIN_DEV && mobile.total >= desktop.total * 1.5) {
    focusDevice = "mobile";
    deviceNote = `${Math.round((mobile.total / agg.total) * 100)}% de sesiones en mobile.`;
  } else if (desktop.total >= MIN_DEV && desktop.total >= mobile.total * 1.5) {
    focusDevice = "desktop";
    deviceNote = `${Math.round((desktop.total / agg.total) * 100)}% de sesiones en desktop.`;
  }

  const merchantFunnel = funnelStagesFromCounts(agg.stepCounts, agg.total);
  const src = focusDevice === "mobile" ? mobile : focusDevice === "desktop" ? desktop : agg;
  const leakFunnel = funnelStagesFromCounts(src.stepCounts, src.total);
  const leakStep = largestDropStep(leakFunnel);
  const devTopDropOff = focusDevice === "all" ? topDropOff : topDropOffFromCounts(src.dropCounts);

  const widgetShow = stageRate(merchantFunnel, "widget_shown");
  const interaction = stageRate(merchantFunnel, "widget_interacted");
  const kyc = stageRate(merchantFunnel, "kyc");
  const underwriting = stageRate(merchantFunnel, "underwriting");
  const confirmation = stageRate(merchantFunnel, "confirmation");
  const completion = stageRate(merchantFunnel, "completed");

  const platSlug = m.platform.replace(/\s+/g, "_").toLowerCase();
  const integ = m.integration_type || "unknown";
  const ctx = `${m.platform} · integración ${integ}${focusDevice !== "all" ? ` · ${focusDevice}` : ""}`;
  const prefix = deviceNote ? `${deviceNote} ` : "";

  let issueCode = "funnel_gap";
  let issueLabel = "Caída de funnel";
  let rootCause = "";
  let recommendedAction = "";

  const knownDrop =
    devTopDropOff.includes("widget_not_shown") ||
    devTopDropOff.includes("widget_no_interaction") ||
    devTopDropOff.includes("payment_method_not_selected") ||
    devTopDropOff.includes("kyc") ||
    devTopDropOff.includes("declined") ||
    devTopDropOff.includes("underwriting") ||
    devTopDropOff.includes("confirmation");

  if (devTopDropOff.includes("widget_not_shown") || (!knownDrop && leakStep === "widget_shown")) {
    issueCode = "widget_not_shown";
    issueLabel = "Widget no visible";
    rootCause = `${prefix}En ${ctx}, el widget es visible en ${fmtPct(widgetShow)} de las sesiones${focusDevice !== "all" ? ` (foco ${focusDevice})` : ""}. Drop-off: ${devTopDropOff.replace(/_/g, " ")}.`;
    recommendedAction =
      focusDevice === "mobile"
        ? `Revisar snippet en checkout mobile de ${m.platform} (${integ}): viewport, lazy-load, condiciones CSS que oculten el widget, y timeout de render JS. Comparar con desktop donde completion es ${fmtPct(desktopComp)}. Validar en Safari iOS y Chrome Android.`
        : focusDevice === "desktop"
          ? `Auditar render del widget en desktop ${m.platform} (${integ}): conflictos con otros scripts, ad-blockers, y reglas de monto mínimo. Mobile tiene ${fmtPct(mobileComp)} completion — usar como referencia.`
          : `Auditar condiciones de render del widget en ${m.platform} (${integ}): monto mínimo, región, device. Escalar a integraciones si es custom API.`;
  } else if (devTopDropOff.includes("widget_no_interaction") || (!knownDrop && leakStep === "widget_interacted")) {
    issueCode = "widget_no_interaction";
    issueLabel = "Widget sin interacción";
    rootCause = `${prefix}Widget visible en ${fmtPct(widgetShow)} de las sesiones en ${ctx}, pero solo ${fmtPct(interaction)} interactúan.`;
    recommendedAction =
      focusDevice === "mobile"
        ? `Optimizar widget mobile en ${m.platform}: tamaño touch-target, copy above-the-fold, contraste, y posición antes del botón de pago. A/B test en ${integ} checkout mobile.`
        : `A/B test de placement y copy en ${m.platform} (${integ}). Revisar competencia de métodos de pago en checkout${focusDevice !== "all" ? ` ${focusDevice}` : ""}.`;
  } else if (devTopDropOff.includes("payment_method_not_selected") || (!knownDrop && leakStep === "kyc")) {
    issueCode = "payment_not_selected";
    issueLabel = "Sin avance a KYC";
    rootCause = `${prefix}En ${ctx}, ${fmtPct(interaction)} de las sesiones interactúan y solo ${fmtPct(kyc)} llegan a KYC.`;
    recommendedAction =
      focusDevice === "mobile"
        ? `Simplificar selector de plazos en mobile ${m.platform} (${integ}): pre-seleccionar plan recomendado, reducir taps, revisar teclado numérico y scroll en modal BNPL.`
        : `Simplificar selector de plazos en ${m.platform} (${integ}). Revisar errores JS en consola del checkout ${focusDevice !== "all" ? focusDevice : ""}.`;
  } else if (devTopDropOff.includes("kyc") || (!knownDrop && leakStep === "underwriting")) {
    issueCode = "kyc_drop";
    issueLabel = "Caída en KYC";
    rootCause = `${prefix}En ${ctx}, ${fmtPct(kyc)} de las sesiones llegan a KYC y ${fmtPct(underwriting)} a underwriting.`;
    recommendedAction = `Reducir fricción de KYC en ${m.platform} (${integ}): documentos, selfies, timeouts y reintentos${focusDevice === "mobile" ? " — priorizar flujo mobile" : ""}.`;
  } else if (devTopDropOff.includes("declined") || devTopDropOff.includes("underwriting") || (!knownDrop && leakStep === "confirmation")) {
    issueCode = "underwriting_drop";
    issueLabel = "Caída en underwriting";
    rootCause = `${prefix}En ${ctx}, ${fmtPct(underwriting)} de las sesiones llegan a underwriting y ${fmtPct(confirmation)} a confirmación. Vertical: ${m.vertical}.`;
    recommendedAction = `Analizar montos vs. límites de crédito en ${m.platform} (${integ}). Ajustar messaging de montos elegibles${focusDevice === "mobile" ? " — en mobile el ticket promedio puede diferir" : ""}. Revisar reglas de riesgo para ${m.vertical}.`;
  } else if (devTopDropOff.includes("confirmation") || (!knownDrop && leakStep === "completed")) {
    issueCode = "confirmation_drop";
    issueLabel = "Caída en confirmación";
    rootCause = `${prefix}En ${ctx}, ${fmtPct(confirmation)} de las sesiones llegan a confirmación y ${fmtPct(completion)} completan.`;
    recommendedAction = `Revisar pantallas de confirmación y errores post-aprobación en ${m.platform} (${integ})${focusDevice !== "all" ? ` (${focusDevice})` : ""}.`;
  } else if (integrationFailures > 0 || topError) {
    issueCode = "integration_error";
    issueLabel = "Error de integración";
    rootCause = `${prefix}Errores técnicos en ${ctx}: ${topError || "eventos incompletos"}. ${supportTickets} tickets de soporte.`;
    recommendedAction = `Remediar ${topError || "API"} en ${m.platform} (${integ}). Revisar logs sandbox vs producción${focusDevice !== "all" ? ` filtrando por ${focusDevice}` : ""}. Sprint de estabilización antes de growth.`;
  } else {
    issueCode = "completion_gap";
    issueLabel = "Brecha de completion";
    rootCause = `${prefix}Completion ${fmtPct(completion)} en ${ctx} con caída distribuida. Desktop ${fmtPct(desktopComp)} · Mobile ${fmtPct(mobileComp)}.`;
    recommendedAction = `Deep-dive en ${m.platform} (${integ}) por device y región (${m.region}). Priorizar ${focusDevice !== "all" ? focusDevice : "el device con peor completion"}. Monitoreo de funnel segmentado.`;
  }

  const actionKey = `${platSlug}|${integ}|${focusDevice}|${issueCode}|${devTopDropOff}`;
  const actionLabel = `${m.platform} · ${integ} · ${focusDevice} · ${issueLabel}`;
  const actionCohort = `Merchants ${m.platform} + ${integ} + foco ${focusDevice} + ${issueLabel}`;

  return { rootCause, recommendedAction, actionKey, actionLabel, actionCohort, focusDevice, desktopCompletionRate: desktopComp, mobileCompletionRate: mobileComp };
}

export function buildProcessedDataFromStore(rawStore: unknown): ProcessedData | null {
  const store = normalizeStore(rawStore);
  const merchants = Object.values(store.merchants);
  const sessionAggs = store.sessionAggs;
  const eventAggs = store.eventAggs;
  const global = store.globalFunnel;

  if (merchants.length === 0 || Object.keys(sessionAggs).length === 0) return null;

  const maxLostGmv = Math.max(1, ...Object.values(sessionAggs).map((a) => a.lostGmv));
  type MetricDraft = Omit<MerchantMetrics, "compositeScore" | "scalability" | "actionMerchantsCount" | "actionTotalLostGmv">;
  const drafts: MetricDraft[] = [];
  const insufficientMerchants: { merchantId: string; merchantName: string; sessions: number }[] = [];

  for (const [merchantId, agg] of Object.entries(sessionAggs)) {
    const m = store.merchants[merchantId];
    if (!m) continue;

    if (agg.total < MIN_SESSIONS_RANKED) {
      insufficientMerchants.push({ merchantId, merchantName: m.merchant_name, sessions: agg.total });
      continue;
    }

    const evts = eventAggs[merchantId] ?? { errorCounts: {}, supportTickets: 0, integrationFailures: 0 };
    const topDropOff = topDropOffFromCounts(agg.dropCounts);
    const topError = topErrorFromCounts(evts.errorCounts);
    const incomplete = Math.max(1, agg.total - reachedAtLeast(agg.stepCounts, "completed"));
    const funnelSteps = funnelStagesFromCounts(agg.stepCounts, agg.total);
    const widgetShowRate = agg.total ? reachedAtLeast(agg.stepCounts, "widget_shown") / agg.total : 0;
    const interactionRate = agg.total ? reachedAtLeast(agg.stepCounts, "widget_interacted") / agg.total : 0;
    const kycRate = agg.total ? reachedAtLeast(agg.stepCounts, "kyc") / agg.total : 0;
    const underwritingRate = agg.total ? reachedAtLeast(agg.stepCounts, "underwriting") / agg.total : 0;
    const confirmationRate = agg.total ? reachedAtLeast(agg.stepCounts, "confirmation") / agg.total : 0;
    const completionRate = agg.total ? reachedAtLeast(agg.stepCounts, "completed") / agg.total : 0;
    const avgStepSeverity = agg.stepSeveritySum / incomplete;

    const severityScore = Math.min(
      100,
      avgStepSeverity * 40 +
        (1 - completionRate) * 35 +
        (topDropOff.includes("widget_not_shown") ? 15 : 0) +
        (evts.integrationFailures > 0 ? 10 : 0),
    );

    const tierW = TIER_WEIGHT[m.gmv_tier] ?? 0.3;
    const businessImpact = Math.min(100, tierW * 30 + (agg.lostGmv / maxLostGmv) * 50 + (agg.totalGmv / maxLostGmv) * 20);
    const confidence = Math.min(100, Math.log10(agg.total + 1) * 25 + (m.status === "live" ? 15 : 0));

    const diagnosis = diagnose(
      m, agg, topDropOff, topError, evts.integrationFailures, evts.supportTickets,
    );

    const dataQuality: DataQuality =
      agg.total >= MIN_SESSIONS_STABLE ? "stable" : "low_data";

    drafts.push({
      merchantId,
      merchantName: m.merchant_name,
      platform: m.platform,
      integrationType: m.integration_type,
      vertical: m.vertical,
      region: m.region,
      gmvTier: m.gmv_tier,
      status: m.status,
      kamAssigned: m.kam_assigned,
      sessions: agg.total,
      dataQuality,
      totalGmv: agg.totalGmv,
      lostGmv: agg.lostGmv,
      completedGmv: agg.totalGmv - agg.lostGmv,
      completionRate,
      widgetShowRate,
      interactionRate,
      kycRate,
      underwritingRate,
      confirmationRate,
      funnelSteps,
      severityScore,
      businessImpact,
      confidence,
      actionKey: diagnosis.actionKey,
      actionLabel: diagnosis.actionLabel,
      actionCohort: diagnosis.actionCohort,
      focusDevice: diagnosis.focusDevice,
      desktopCompletionRate: diagnosis.desktopCompletionRate,
      mobileCompletionRate: diagnosis.mobileCompletionRate,
      topDropOff,
      topError,
      supportTickets: evts.supportTickets,
      integrationFailures: evts.integrationFailures,
      rootCause: diagnosis.rootCause,
      recommendedAction: diagnosis.recommendedAction,
    });
  }

  const actionGroups = new Map<string, { count: number; lostGmv: number }>();
  for (const d of drafts) {
    const g = actionGroups.get(d.actionKey) ?? { count: 0, lostGmv: 0 };
    g.count++;
    g.lostGmv += d.lostGmv;
    actionGroups.set(d.actionKey, g);
  }

  const totalMerchants = drafts.length;
  const maxGroupCount = Math.max(1, ...Array.from(actionGroups.values()).map((g) => g.count));
  const maxGroupLostGmv = Math.max(1, ...Array.from(actionGroups.values()).map((g) => g.lostGmv));

  const metrics: Omit<MerchantMetrics, "compositeScore">[] = drafts.map((d) => {
    const group = actionGroups.get(d.actionKey)!;
    const reachNorm = group.count / totalMerchants;
    const reachVsMax = group.count / maxGroupCount;
    const impactNorm = group.lostGmv / maxGroupLostGmv;
    const scalability = Math.min(100, reachNorm * 50 + reachVsMax * 25 + impactNorm * 25);
    return { ...d, actionMerchantsCount: group.count, actionTotalLostGmv: group.lostGmv, scalability };
  });

  const totalLostGmv = metrics.reduce((a, m) => a + m.lostGmv, 0);
  return { merchants, metrics, globalFunnel: global, totalLostGmv, insufficientMerchants };
}

export function applyBalance(
  metrics: Omit<MerchantMetrics, "compositeScore">[],
  gmvBalance: number,
): MerchantMetrics[] {
  const maxLostGmv = Math.max(1, ...metrics.map((m) => m.lostGmv));
  return metrics
    .map((m) => {
      const gmvNorm = m.lostGmv / maxLostGmv;
      const scaleNorm = m.scalability / 100;
      const compositeScore = (gmvBalance * gmvNorm + (1 - gmvBalance) * scaleNorm) * 100;
      return { ...m, compositeScore };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore);
}

export function detectKind(filename: string): "merchants" | "sessions" | "events" | null {
  const f = filename.toLowerCase();
  if (f.includes("merchant")) return "merchants";
  if (f.includes("checkout") || f.includes("session")) return "sessions";
  if (f.includes("integration") || f.includes("event")) return "events";
  return null;
}

function cloneStore(store: DataStore): DataStore {
  return {
    merchants: { ...store.merchants },
    sessionAggs: cloneSessionAggs(store.sessionAggs),
    eventAggs: cloneEventAggs(store.eventAggs),
    seenSessionIds: { ...store.seenSessionIds },
    seenEventIds: { ...store.seenEventIds },
    globalFunnel: { ...store.globalFunnel, stepCounts: { ...store.globalFunnel.stepCounts } },
    loadCount: store.loadCount,
  };
}

export async function ingestFiles(
  files: File[],
  currentStore: DataStore,
): Promise<{ store: DataStore; statuses: FileStatus[]; errors: string[] }> {
  const store = cloneStore(normalizeStore(currentStore));
  const statuses: FileStatus[] = [];
  const allErrors: string[] = [];
  const buckets: Record<"merchants" | "sessions" | "events", { name: string; text: string }[]> = {
    merchants: [],
    sessions: [],
    events: [],
  };

  for (const file of files) {
    const kind = detectKind(file.name);
    if (!kind) {
      allErrors.push(`${file.name}: no se reconoce el tipo (esperado: merchants, checkout_sessions, integration_events)`);
      continue;
    }
    buckets[kind].push({ name: file.name, text: await file.text() });
  }

  for (const kind of ["merchants", "sessions", "events"] as const) {
    const expected = kind === "merchants" ? MERCHANT_COLS : kind === "sessions" ? SESSION_COLS : EVENT_COLS;
    for (const { name, text } of buckets[kind]) {
      const { headers } = parseCsv(text);
      const headerErrors = validateHeaders(headers, expected, name);
      if (headerErrors.length) {
        statuses.push({ name, kind, rows: 0, ok: false, errors: headerErrors });
        allErrors.push(...headerErrors);
      }
    }
  }

  if (allErrors.length && statuses.every((s) => !s.ok) && buckets.merchants.length + buckets.sessions.length + buckets.events.length > 0) {
    const anyOk = !allErrors.some((e) => e.includes("faltan columnas"));
    if (!anyOk && statuses.some((s) => !s.ok && s.errors.some((e) => e.includes("faltan columnas")))) {
      return { store: currentStore, statuses, errors: allErrors };
    }
  }

  let filesProcessed = 0;

  for (const { name, text } of buckets.merchants) {
    if (statuses.some((s) => s.name === name && !s.ok)) continue;
    const { headers, rows } = parseCsv(text);
    const { data, errors } = cleanMerchants(rowsToObjects(headers, rows));
    if (errors.length) {
      statuses.push({ name, kind: "merchants", rows: 0, ok: false, errors });
      allErrors.push(...errors);
    } else {
      const added = mergeMerchants(data, store);
      statuses.push({ name, kind: "merchants", rows: data.length, ok: true, errors: [`${added} nuevos, ${data.length - added} actualizados`] });
      filesProcessed++;
    }
  }

  for (const { name, text } of buckets.sessions) {
    if (statuses.some((s) => s.name === name && !s.ok)) continue;
    const { headers, rows } = parseCsv(text);
    const { errors, added, skipped } = mergeSessionRows(rowsToObjects(headers, rows), store);
    if (errors.length) {
      statuses.push({ name, kind: "sessions", rows: 0, ok: false, errors });
      allErrors.push(...errors);
    } else {
      statuses.push({ name, kind: "sessions", rows: added, ok: true, errors: [`${added} nuevas, ${skipped} duplicadas omitidas`] });
      filesProcessed++;
    }
  }

  for (const { name, text } of buckets.events) {
    if (statuses.some((s) => s.name === name && !s.ok)) continue;
    const { headers, rows } = parseCsv(text);
    const { errors, added, skipped } = mergeEventRows(rowsToObjects(headers, rows), store);
    if (errors.length) {
      statuses.push({ name, kind: "events", rows: 0, ok: false, errors });
      allErrors.push(...errors);
    } else {
      statuses.push({ name, kind: "events", rows: added, ok: true, errors: [`${added} nuevos, ${skipped} duplicados omitidos`] });
      filesProcessed++;
    }
  }

  if (filesProcessed > 0) store.loadCount++;
  return { store, statuses, errors: allErrors };
}
