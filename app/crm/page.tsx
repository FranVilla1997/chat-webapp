import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  buildSellerRanking,
  currentArgentinaMonthKey,
  getAllLeads,
  getAllSales,
  saleMonthKey,
} from "@/lib/airtable";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { AirtableLead, AirtableSale } from "@/lib/types";
import { CrmSaleButton } from "@/components/crm/CrmSaleButton";
import { CrmMonthPicker, type CrmMonthOption } from "@/components/crm/CrmMonthPicker";
import { getSellerProfile } from "@/lib/auth";
import { hasCrmAccess } from "@/lib/crm-access";

export const dynamic = "force-dynamic";

const MONO = `'SF Mono', 'Consolas', 'Liberation Mono', monospace`;
const FOLLOWUP_MESSAGE_MATCH_WINDOW_MS = 3 * 60 * 1000;
const RESPONSE_TIME_WINDOW_MS = 4 * 60 * 60 * 1000;
const CRM_LIVE_CACHE_TTL_MS = 45 * 1000;
const CRM_HISTORY_CACHE_TTL_MS = 10 * 60 * 1000;

type CrmMessage = {
  id: string | number;
  lead_id: string;
  role: "user" | "assistant" | "human_agent" | "system" | string;
  created_at: string;
};

type CrmFollowup = {
  lead_id: string;
  status: string;
  sent_at: string | null;
};

type SourceResult<T> = {
  data: T;
  error: string;
};

type MonthRange = {
  month: string;
  label: string;
  startIso: string;
  endIso: string;
  daysInMonth: number;
  elapsedDays: number;
  isCurrentMonth: boolean;
};

type DailySalesPoint = {
  day: number;
  amount: number;
  count: number;
  cumulative: number;
};

type MetricTrend = {
  value: number;
  label: string;
  isGood: boolean;
};

type FollowupStats = {
  sent: number;
  responded: number;
  responseRate: number;
};

type CrmCacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

declare global {
  // eslint-disable-next-line no-var
  var __scalaCrmDataCache: Map<string, CrmCacheEntry<unknown>> | undefined;
}

function crmCacheStore() {
  globalThis.__scalaCrmDataCache ??= new Map<string, CrmCacheEntry<unknown>>();
  return globalThis.__scalaCrmDataCache;
}

function cacheTtlForRange(range: MonthRange) {
  return range.isCurrentMonth ? CRM_LIVE_CACHE_TTL_MS : CRM_HISTORY_CACHE_TTL_MS;
}

async function cachedCrmData<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const store = crmCacheStore();
  const now = Date.now();
  const cached = store.get(key) as CrmCacheEntry<T> | undefined;

  if (cached && cached.expiresAt > now) return cached.value;

  let value: Promise<T>;
  value = loader().catch((error) => {
    if (store.get(key)?.value === value) store.delete(key);
    throw error;
  });

  store.set(key, {
    expiresAt: now + ttlMs,
    value,
  });

  return value;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(
    value || 0,
  );
}

function formatAverage(value: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function formatAxisCurrency(value: number) {
  const absolute = Math.abs(value);
  const compact = (amount: number) =>
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(amount);

  if (absolute >= 1_000_000_000)
    return `$${compact(value / 1_000_000_000)} mil M`;
  if (absolute >= 1_000_000) return `$${compact(value / 1_000_000)} M`;
  if (absolute >= 1_000) return `$${compact(value / 1_000)} mil`;
  return `$${compact(value)}`;
}

function niceCurrencyScale(value: number, segments = 4) {
  const safeValue = Math.max(1, value);
  const roughStep = safeValue / Math.max(1, segments);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const fraction = roughStep / magnitude;
  const niceFraction =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  const step = niceFraction * magnitude;

  return {
    max: Math.ceil(safeValue / step) * step,
    step,
    segments,
  };
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function formatMinutes(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function safeMonth(value?: string) {
  return /^\d{4}-\d{2}$/.test(String(value ?? ""))
    ? String(value)
    : currentArgentinaMonthKey();
}

function crmAccessNextPath(searchParams?: {
  month?: string;
  airtable_base_id?: string;
  airtable_table_id?: string;
  base_id?: string;
  table_id?: string;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value) params.set(key, value);
  }

  return params.size ? `/crm?${params.toString()}` : "/crm";
}

function crmMonthHref(
  month: string,
  searchParams?: {
    airtable_base_id?: string;
    airtable_table_id?: string;
    base_id?: string;
    table_id?: string;
  },
) {
  const params = new URLSearchParams();
  params.set("month", month);

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value) params.set(key, value);
  }

  return `/crm?${params.toString()}`;
}

function airtableSourceCacheKey(source: { baseId?: string; tableId?: string }) {
  return `${source.baseId || process.env.AIRTABLE_BASE_ID || "default"}:${source.tableId || process.env.AIRTABLE_LEADS_TABLE_ID || "default"}`;
}

function previousMonthKey(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const previous = new Date(year, monthNumber - 2, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string): MonthRange {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextMonthYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = `${nextMonthYear}-${String(nextMonthNumber).padStart(2, "0")}`;
  const start = new Date(`${month}-01T00:00:00-03:00`);
  const end = new Date(`${nextMonth}-01T00:00:00-03:00`);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const currentMonth = currentArgentinaMonthKey();
  const now = new Date();
  const elapsedDays =
    month === currentMonth
      ? Math.max(1, Math.min(daysInMonth, now.getDate()))
      : daysInMonth;

  return {
    month,
    label: new Date(year, monthNumber - 1, 1).toLocaleDateString("es-AR", {
      month: "long",
      year: "numeric",
    }),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    daysInMonth,
    elapsedDays,
    isCurrentMonth: month === currentMonth,
  };
}

function parseMoney(value: string) {
  const normalized = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function leadMonthKey(lead: AirtableLead) {
  const raw = lead.created_at || lead.qualified_at || lead.stage_changed_at;
  if (!raw) return "";
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

function normalizeStage(stage: string) {
  const value = String(stage ?? "").trim();
  const lower = value.toLowerCase();
  if (lower === "propuesta_enviada" || lower === "propuesta enviada")
    return "Propuesta enviada";
  return lower || "sin etapa";
}

function isProposalStage(stage: string) {
  return normalizeStage(stage) === "Propuesta enviada";
}

function isWonStage(stage: string) {
  const key = normalizeStage(stage);
  return key === "cerrado_ganado" || key === "ganado";
}

function isLostStage(stage: string) {
  const key = normalizeStage(stage);
  return (
    key === "cerrado_perdido" || key === "perdido" || key === "descalificado"
  );
}

function isNoResponseStage(stage: string) {
  return normalizeStage(stage) === "no_responde";
}

function isQualifiedStage(stage: string) {
  const key = normalizeStage(stage);
  return (
    key === "calificado" ||
    key === "en_proceso" ||
    key === "Propuesta enviada" ||
    key === "cerrado_ganado" ||
    key === "ganado"
  );
}

function percent(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function percentageChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatDeltaPercent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function metricTrend(
  current: number,
  previous: number,
  label = "vs mes anterior",
  lowerIsBetter = false,
): MetricTrend {
  const value = percentageChange(current, previous);
  const isGood = lowerIsBetter ? value <= 0 : value >= 0;
  return { value, label, isGood };
}

function isConfirmedSale(sale: AirtableSale) {
  return sale.status.toLowerCase().includes("confirm");
}

function saleTimestamp(sale: AirtableSale) {
  const source = sale.purchaseDate || sale.registeredAt || sale.createdTime;
  if (!source) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(source))
    return new Date(`${source}T12:00:00-03:00`).getTime();
  return new Date(source).getTime() || 0;
}

function sellerOfSale(sale: AirtableSale) {
  return sale.sellerName || "Sin vendedor";
}

function dateLabel(value: string) {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayOfDateInMonth(source: string, range: MonthRange) {
  if (!source) return 0;

  if (/^\d{4}-\d{2}-\d{2}/.test(source)) {
    const month = source.slice(0, 7);
    if (month !== range.month) return 0;
    return Number(source.slice(8, 10)) || 0;
  }

  const date = new Date(source);
  if (!Number.isFinite(date.getTime())) return 0;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (`${year}-${month}` !== range.month) return 0;
  return Number.isFinite(day) ? day : 0;
}

function saleDayOfMonth(sale: AirtableSale, range: MonthRange) {
  return dayOfDateInMonth(
    sale.purchaseDate || sale.registeredAt || sale.createdTime,
    range,
  );
}

function leadDayOfMonth(lead: AirtableLead, range: MonthRange) {
  return dayOfDateInMonth(
    lead.created_at || lead.qualified_at || lead.stage_changed_at,
    range,
  );
}

function isInMonthToDay(day: number, dayLimit: number) {
  return day >= 1 && day <= dayLimit;
}

function buildDailySalesSeries(
  sales: AirtableSale[],
  range: MonthRange,
): DailySalesPoint[] {
  const points = Array.from({ length: range.daysInMonth }, (_, index) => ({
    day: index + 1,
    amount: 0,
    count: 0,
    cumulative: 0,
  }));

  for (const sale of sales) {
    const day = saleDayOfMonth(sale, range);
    if (day < 1 || day > range.daysInMonth) continue;
    points[day - 1].amount += sale.amount || 0;
    points[day - 1].count += 1;
  }

  let cumulative = 0;
  return points.map((point) => {
    cumulative += point.amount;
    return { ...point, cumulative };
  });
}

function saleTitle(sale: AirtableSale) {
  return (
    sale.description
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\*/g, ""))
      .find(Boolean) ?? "Venta sin descripcion"
  );
}

function stageWeight(stage: string) {
  const key = normalizeStage(stage);
  if (key === "Propuesta enviada") return 0.45;
  if (key === "calificado") return 0.28;
  if (key === "en_proceso") return 0.22;
  if (key === "en_calificacion") return 0.08;
  return 0;
}

function isOpenLead(lead: AirtableLead) {
  const stage = normalizeStage(lead.current_stage);
  return (
    stage !== "cerrado_ganado" &&
    stage !== "cerrado_perdido" &&
    stage !== "perdido" &&
    stage !== "ganado"
  );
}

function timestampOf(value: string) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function leadActivityTimestamp(lead: AirtableLead) {
  const candidates = [
    lead.proposal_sent_at,
    lead.stage_changed_at,
    lead.last_message_at,
    lead.qualified_at,
    lead.created_at,
  ];

  return Math.max(
    0,
    ...candidates.map((value) => {
      return timestampOf(value);
    }),
  );
}

function isTimestampInRange(timestamp: number, range: MonthRange) {
  return (
    timestamp >= new Date(range.startIso).getTime() &&
    timestamp < new Date(range.endIso).getTime()
  );
}

function isRecentTimestamp(timestamp: number, days: number) {
  return timestamp > 0 && timestamp >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function hasProposalInRange(lead: AirtableLead, range: MonthRange) {
  const proposalSentAt = timestampOf(lead.proposal_sent_at);
  if (isTimestampInRange(proposalSentAt, range)) return true;

  if (!isProposalStage(lead.current_stage) && !isWonStage(lead.current_stage))
    return false;
  return isTimestampInRange(leadActivityTimestamp(lead), range);
}

function isLeadActiveForProjection(lead: AirtableLead, range: MonthRange) {
  if (!isOpenLead(lead)) return false;
  const stage = normalizeStage(lead.current_stage);
  if (stageWeight(stage) <= 0) return false;

  const proposalSentAt = timestampOf(lead.proposal_sent_at);
  const stageChangedAt = timestampOf(lead.stage_changed_at);
  const lastMessageAt = timestampOf(lead.last_message_at);
  const qualifiedAt = timestampOf(lead.qualified_at);
  const createdAt = timestampOf(lead.created_at);
  const activityTime = Math.max(
    proposalSentAt,
    stageChangedAt,
    lastMessageAt,
    qualifiedAt,
    createdAt,
  );
  const movedThisMonth =
    isTimestampInRange(proposalSentAt, range) ||
    isTimestampInRange(stageChangedAt, range) ||
    isTimestampInRange(lastMessageAt, range) ||
    isTimestampInRange(qualifiedAt, range) ||
    isTimestampInRange(createdAt, range);

  if (!range.isCurrentMonth) return movedThisMonth;

  if (stage === "Propuesta enviada") {
    return movedThisMonth || isRecentTimestamp(activityTime, 21);
  }

  if (stage === "calificado") {
    return movedThisMonth || isRecentTimestamp(activityTime, 14);
  }

  if (stage === "en_proceso" || stage === "en_calificacion") {
    return movedThisMonth || isRecentTimestamp(activityTime, 7);
  }

  return false;
}

function pipelineAmountForLead(lead: AirtableLead, averageTicket: number) {
  const proposalAmount = parseMoney(lead.proposal_amount);
  if (proposalAmount > 0) return proposalAmount;

  const key = normalizeStage(lead.current_stage);
  if (key === "Propuesta enviada") return averageTicket;
  if (key === "calificado") return averageTicket * 0.7;
  if (key === "en_proceso") return averageTicket * 0.55;
  if (key === "en_calificacion") return averageTicket * 0.35;
  return 0;
}

function projectionFromPipeline(
  leads: AirtableLead[],
  averageTicket: number,
  range: MonthRange,
) {
  const activeLeads = leads.filter((lead) =>
    isLeadActiveForProjection(lead, range),
  );
  const value = activeLeads.reduce((sum, lead) => {
    const amount = pipelineAmountForLead(lead, averageTicket);
    return sum + amount * stageWeight(lead.current_stage);
  }, 0);

  return {
    value,
    activeLeads,
  };
}

function buildFollowupMessageMatcher(followups: CrmFollowup[]) {
  const byLead = new Map<string, number[]>();
  for (const followup of followups) {
    if (!followup.sent_at) continue;
    const sentAt = new Date(followup.sent_at).getTime();
    if (!Number.isFinite(sentAt)) continue;
    const list = byLead.get(followup.lead_id) ?? [];
    list.push(sentAt);
    byLead.set(followup.lead_id, list);
  }

  return (message: CrmMessage) => {
    if (message.role !== "assistant") return false;
    const timestamp = new Date(message.created_at).getTime();
    if (!Number.isFinite(timestamp)) return false;
    const sentTimes = byLead.get(message.lead_id) ?? [];
    return sentTimes.some(
      (sentAt) =>
        Math.abs(timestamp - sentAt) <= FOLLOWUP_MESSAGE_MATCH_WINDOW_MS,
    );
  };
}

function responseStats(messages: CrmMessage[], followups: CrmFollowup[] = []) {
  const byLead = new Map<string, CrmMessage[]>();
  for (const message of messages) {
    const list = byLead.get(message.lead_id) ?? [];
    list.push(message);
    byLead.set(message.lead_id, list);
  }

  const isFollowupMessage = buildFollowupMessageMatcher(followups);
  const responseTimes: number[] = [];
  const humanResponseTimes: number[] = [];
  let lateResponses = 0;
  let lateHumanResponses = 0;
  let unresolved = 0;

  for (const list of byLead.values()) {
    const ordered = list
      .filter((message) => message.role !== "system")
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

    let pendingUserAt: number | null = null;
    let pendingHumanAt: number | null = null;

    for (const message of ordered) {
      if (isFollowupMessage(message)) continue;

      const timestamp = new Date(message.created_at).getTime();
      if (!Number.isFinite(timestamp)) continue;

      if (message.role === "user") {
        if (pendingUserAt === null) pendingUserAt = timestamp;
        pendingHumanAt = timestamp;
        continue;
      }

      if (
        (message.role === "assistant" || message.role === "human_agent") &&
        pendingUserAt !== null
      ) {
        const responseTime = timestamp - pendingUserAt;
        if (responseTime >= 0 && responseTime <= RESPONSE_TIME_WINDOW_MS) {
          responseTimes.push(responseTime);
        } else if (responseTime > RESPONSE_TIME_WINDOW_MS) {
          lateResponses += 1;
        }
        pendingUserAt = null;
      }

      if (message.role === "human_agent" && pendingHumanAt !== null) {
        const humanResponseTime = timestamp - pendingHumanAt;
        if (
          humanResponseTime >= 0 &&
          humanResponseTime <= RESPONSE_TIME_WINDOW_MS
        ) {
          humanResponseTimes.push(humanResponseTime);
        } else if (humanResponseTime > RESPONSE_TIME_WINDOW_MS) {
          lateHumanResponses += 1;
        }
        pendingHumanAt = null;
      }
    }

    const last = [...ordered]
      .reverse()
      .find((message) => !isFollowupMessage(message));
    if (last?.role === "user") unresolved += 1;
  }

  const avg = (values: number[]) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;

  return {
    averageResponseMs: avg(responseTimes),
    averageHumanResponseMs: avg(humanResponseTimes),
    lateResponses,
    lateHumanResponses,
    unresolved,
    conversations: byLead.size,
  };
}

function followupStats(
  messages: CrmMessage[],
  followups: CrmFollowup[],
): FollowupStats {
  const sentFollowups = followups
    .map((followup) => ({
      leadId: followup.lead_id,
      sentAt: followup.sent_at ? new Date(followup.sent_at).getTime() : 0,
    }))
    .filter(
      (followup) => Number.isFinite(followup.sentAt) && followup.sentAt > 0,
    )
    .sort((a, b) => a.sentAt - b.sentAt);

  const userMessagesByLead = new Map<string, number[]>();
  for (const message of messages) {
    if (message.role !== "user") continue;
    const timestamp = new Date(message.created_at).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const list = userMessagesByLead.get(message.lead_id) ?? [];
    list.push(timestamp);
    userMessagesByLead.set(message.lead_id, list);
  }

  for (const list of userMessagesByLead.values()) {
    list.sort((a, b) => a - b);
  }

  let responded = 0;
  for (let index = 0; index < sentFollowups.length; index += 1) {
    const followup = sentFollowups[index];
    const nextFollowup = sentFollowups.find((candidate, candidateIndex) => {
      return candidateIndex > index && candidate.leadId === followup.leadId;
    });
    const responseDeadline = nextFollowup?.sentAt ?? Infinity;
    const userMessages = userMessagesByLead.get(followup.leadId) ?? [];
    const hasResponse = userMessages.some((timestamp) => {
      return timestamp > followup.sentAt && timestamp < responseDeadline;
    });

    if (hasResponse) responded += 1;
  }

  return {
    sent: sentFollowups.length,
    responded,
    responseRate: percent(responded, sentFollowups.length),
  };
}

async function readSource<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<SourceResult<T>> {
  try {
    return { data: await loader(), error: "" };
  } catch (err) {
    return {
      data: fallback,
      error: err instanceof Error ? err.message : "No se pudo leer la fuente.",
    };
  }
}

async function getMessagesForMonth(
  clientId: string,
  range: MonthRange,
): Promise<CrmMessage[]> {
  const service = createSupabaseServiceClient();
  const messages: CrmMessage[] = [];
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await service
      .from("messages")
      .select("id, lead_id, role, created_at")
      .eq("client_id", clientId)
      .gte("created_at", range.startIso)
      .lt("created_at", range.endIso)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);
    messages.push(...((data ?? []) as CrmMessage[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return messages;
}

async function getFollowupsForMonth(
  clientId: string,
  range: MonthRange,
): Promise<CrmFollowup[]> {
  const service = createSupabaseServiceClient();
  const followups: CrmFollowup[] = [];
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await service
      .from("followup_queue")
      .select("lead_id, status, sent_at")
      .eq("client_id", clientId)
      .eq("status", "sent")
      .gte("sent_at", range.startIso)
      .lt("sent_at", range.endIso)
      .order("sent_at", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);
    followups.push(...((data ?? []) as CrmFollowup[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return followups;
}

export default async function CrmControlPage({
  searchParams,
}: {
  searchParams?: {
    month?: string;
    airtable_base_id?: string;
    airtable_table_id?: string;
    base_id?: string;
    table_id?: string;
  };
}) {
  const profile = await getSellerProfile();
  if (!profile) redirect("/login");
  if (!hasCrmAccess(profile.user_id)) {
    redirect(`/crm/access?next=${encodeURIComponent(crmAccessNextPath(searchParams))}`);
  }

  const selectedMonth = safeMonth(searchParams?.month);
  const range = monthRange(selectedMonth);
  const previousMonth = previousMonthKey(selectedMonth);
  const previousRange = monthRange(previousMonth);
  const airtableSource = {
    baseId: searchParams?.airtable_base_id ?? searchParams?.base_id,
    tableId: searchParams?.airtable_table_id ?? searchParams?.table_id,
  };
  const sourceCacheKey = airtableSourceCacheKey(airtableSource);
  const selectedCacheScope = range.isCurrentMonth ? "live" : "history";
  const selectedTtl = cacheTtlForRange(range);
  const previousTtl = cacheTtlForRange(previousRange);

  const [
    leadsResult,
    salesResult,
    messagesResult,
    previousMessagesResult,
    followupsResult,
    previousFollowupsResult,
  ] = await Promise.all([
    readSource(
      () =>
        cachedCrmData(
          `leads:${selectedCacheScope}:${sourceCacheKey}`,
          selectedTtl,
          () => getAllLeads(airtableSource),
        ),
      [] as AirtableLead[],
    ),
    readSource(
      () =>
        cachedCrmData(
          `sales:${selectedCacheScope}`,
          selectedTtl,
          () => getAllSales(),
        ),
      [] as AirtableSale[],
    ),
    readSource(
      () =>
        cachedCrmData(
          `messages:${profile.client_id}:${range.month}`,
          selectedTtl,
          () => getMessagesForMonth(profile.client_id, range),
        ),
      [] as CrmMessage[],
    ),
    readSource(
      () =>
        cachedCrmData(
          `messages:${profile.client_id}:${previousRange.month}`,
          previousTtl,
          () => getMessagesForMonth(profile.client_id, previousRange),
        ),
      [] as CrmMessage[],
    ),
    readSource(
      () =>
        cachedCrmData(
          `followups:${profile.client_id}:${range.month}`,
          selectedTtl,
          () => getFollowupsForMonth(profile.client_id, range),
        ),
      [] as CrmFollowup[],
    ),
    readSource(
      () =>
        cachedCrmData(
          `followups:${profile.client_id}:${previousRange.month}`,
          previousTtl,
          () => getFollowupsForMonth(profile.client_id, previousRange),
        ),
      [] as CrmFollowup[],
    ),
  ]);

  const leads = leadsResult.data;
  const sales = salesResult.data;
  const messages = messagesResult.data;
  const previousMessages = previousMessagesResult.data;
  const followups = followupsResult.data;
  const previousFollowups = previousFollowupsResult.data;
  const comparisonDay = Math.max(1, range.elapsedDays);
  const previousComparisonDay = Math.min(
    previousRange.daysInMonth,
    comparisonDay,
  );
  const trendLabel = `vs mes ant. dia ${previousComparisonDay}`;
  const confirmedMonthSales = sales.filter(
    (sale) => isConfirmedSale(sale) && saleMonthKey(sale) === selectedMonth,
  );
  const previousConfirmedMonthSales = sales.filter(
    (sale) => isConfirmedSale(sale) && saleMonthKey(sale) === previousMonth,
  );
  const previousComparableConfirmedMonthSales =
    previousConfirmedMonthSales.filter((sale) => {
      return isInMonthToDay(
        saleDayOfMonth(sale, previousRange),
        previousComparisonDay,
      );
    });
  const allMonthSales = sales.filter(
    (sale) => saleMonthKey(sale) === selectedMonth,
  );
  const totalSold = confirmedMonthSales.reduce(
    (sum, sale) => sum + (sale.amount || 0),
    0,
  );
  const previousComparableTotalSold =
    previousComparableConfirmedMonthSales.reduce(
      (sum, sale) => sum + (sale.amount || 0),
      0,
    );
  const averageTicket = confirmedMonthSales.length
    ? totalSold / confirmedMonthSales.length
    : 0;
  const monthLeads = leads.filter(
    (lead) => leadMonthKey(lead) === selectedMonth,
  );
  const previousMonthLeads = leads.filter(
    (lead) => leadMonthKey(lead) === previousMonth,
  );
  const previousComparableMonthLeads = previousMonthLeads.filter((lead) => {
    return isInMonthToDay(
      leadDayOfMonth(lead, previousRange),
      previousComparisonDay,
    );
  });
  const wonLeads = leads.filter(
    (lead) => normalizeStage(lead.current_stage) === "cerrado_ganado",
  );
  const proposalLeads = leads.filter(
    (lead) => normalizeStage(lead.current_stage) === "Propuesta enviada",
  );
  const monthStageCounts = monthLeads.reduce<Record<string, number>>(
    (acc, lead) => {
      const key = normalizeStage(lead.current_stage);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const monthStageRows = Object.entries(monthStageCounts)
    .map(([stage, count]) => ({
      stage,
      count,
      percentage: percent(count, monthLeads.length),
    }))
    .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage));
  const qualifiedMonthLeads = monthLeads.filter((lead) =>
    isQualifiedStage(lead.current_stage),
  );
  const disqualifiedMonthLeads = monthLeads.filter(
    (lead) =>
      isLostStage(lead.current_stage) || isNoResponseStage(lead.current_stage),
  );
  const proposalMonthLeads = leads.filter((lead) =>
    hasProposalInRange(lead, range),
  );
  const qualifiedFunnelLeadIds = new Set([
    ...qualifiedMonthLeads.map((lead) => lead.RecordID),
    ...proposalMonthLeads.map((lead) => lead.RecordID),
  ]);
  const qualifiedRate = percent(qualifiedMonthLeads.length, monthLeads.length);
  const disqualifiedRate = percent(
    disqualifiedMonthLeads.length,
    monthLeads.length,
  );
  const proposalOnQualifiedRate = percent(
    proposalMonthLeads.length,
    qualifiedFunnelLeadIds.size,
  );
  const proposalConversionRate = percent(
    confirmedMonthSales.length,
    proposalMonthLeads.length,
  );
  const stageCounts = leads.reduce<Record<string, number>>((acc, lead) => {
    const key = normalizeStage(lead.current_stage);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const ranking = buildSellerRanking(sales, selectedMonth);
  const stats = responseStats(messages, followups);
  const previousComparableMessages = previousMessages.filter((message) => {
    return isInMonthToDay(
      dayOfDateInMonth(message.created_at, previousRange),
      previousComparisonDay,
    );
  });
  const previousComparableFollowups = previousFollowups.filter((followup) => {
    return isInMonthToDay(
      dayOfDateInMonth(followup.sent_at ?? "", previousRange),
      previousComparisonDay,
    );
  });
  const previousStats = responseStats(
    previousComparableMessages,
    previousComparableFollowups,
  );
  const currentFollowupStats = followupStats(messages, followups);
  const previousFollowupStats = followupStats(
    previousComparableMessages,
    previousComparableFollowups,
  );
  const messageCounts = messages.reduce<Record<string, number>>(
    (acc, message) => {
      acc[message.role] = (acc[message.role] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const previousMessageCounts = previousComparableMessages.reduce<
    Record<string, number>
  >((acc, message) => {
    acc[message.role] = (acc[message.role] ?? 0) + 1;
    return acc;
  }, {});
  const inboundMessages = messageCounts.user ?? 0;
  const previousInboundMessages = previousMessageCounts.user ?? 0;
  const averageInboundMessagesPerDay =
    inboundMessages / Math.max(1, range.elapsedDays);
  const previousAverageInboundMessagesPerDay =
    previousInboundMessages / Math.max(1, previousComparisonDay);

  const currentRunRateProjection = range.isCurrentMonth
    ? (totalSold / range.elapsedDays) * range.daysInMonth
    : totalSold;
  const pipelineProjection = projectionFromPipeline(
    leads,
    averageTicket || 250000,
    range,
  );
  const weightedPipeline = pipelineProjection.value;
  const pipelineUpsideUsed = range.isCurrentMonth
    ? Math.min(
        weightedPipeline * 0.35,
        Math.max(totalSold * 0.75, currentRunRateProjection * 0.5),
      )
    : 0;
  const blendedProjection = range.isCurrentMonth
    ? Math.max(totalSold, currentRunRateProjection + pipelineUpsideUsed)
    : totalSold;
  const previousComparableProjection =
    previousComparableTotalSold > 0
      ? (previousComparableTotalSold / Math.max(1, previousComparisonDay)) *
        previousRange.daysInMonth
      : 0;
  const conversionRate = monthLeads.length
    ? (confirmedMonthSales.length / monthLeads.length) * 100
    : 0;
  const proposalToSaleRate = proposalLeads.length
    ? (confirmedMonthSales.length / proposalLeads.length) * 100
    : 0;
  const responseTime = stats.averageResponseMs;
  const previousResponseTime = previousStats.averageResponseMs;
  const humanResponseTime = stats.averageHumanResponseMs;
  const previousHumanResponseTime = previousStats.averageHumanResponseMs;
  const soldTrend = metricTrend(
    totalSold,
    previousComparableTotalSold,
    trendLabel,
  );
  const projectionTrend = metricTrend(
    blendedProjection,
    previousComparableProjection,
    trendLabel,
  );
  const leadsTrend = metricTrend(
    monthLeads.length,
    previousComparableMonthLeads.length,
    trendLabel,
  );
  const responseTrend = metricTrend(
    responseTime,
    previousResponseTime,
    trendLabel,
    true,
  );
  const humanResponseTrend = metricTrend(
    humanResponseTime,
    previousHumanResponseTime,
    trendLabel,
    true,
  );
  const followupsSentTrend = metricTrend(
    currentFollowupStats.sent,
    previousFollowupStats.sent,
    trendLabel,
  );
  const followupsRespondedTrend = metricTrend(
    currentFollowupStats.responded,
    previousFollowupStats.responded,
    trendLabel,
  );
  const inboundMessagesTrend = metricTrend(
    averageInboundMessagesPerDay,
    previousAverageInboundMessagesPerDay,
    trendLabel,
  );
  const dailySales = buildDailySalesSeries(confirmedMonthSales, range);
  const bestSalesDay = dailySales.reduce<DailySalesPoint | null>(
    (best, point) => {
      if (!best || point.amount > best.amount) return point;
      return best;
    },
    null,
  );
  const daysRemaining = range.isCurrentMonth
    ? Math.max(0, range.daysInMonth - range.elapsedDays)
    : 0;
  const remainingToProjection = Math.max(0, blendedProjection - totalSold);
  const dailyNeededForProjection = daysRemaining
    ? remainingToProjection / daysRemaining
    : 0;
  const dailyAverageSold = totalSold / Math.max(1, range.elapsedDays);

  const availableMonths = [
    ...new Set([
      currentArgentinaMonthKey(),
      ...sales.map(saleMonthKey).filter(Boolean),
      ...leads.map(leadMonthKey).filter(Boolean),
    ]),
  ].sort((a, b) => b.localeCompare(a));
  const monthOptions: CrmMonthOption[] = availableMonths.map((month) => ({
    month,
    href: crmMonthHref(month, {
      airtable_base_id: searchParams?.airtable_base_id,
      airtable_table_id: searchParams?.airtable_table_id,
      base_id: searchParams?.base_id,
      table_id: searchParams?.table_id,
    }),
  }));

  const latestSales = [...allMonthSales]
    .sort((a, b) => saleTimestamp(b) - saleTimestamp(a))
    .slice(0, 16);
  const warnings = [
    leadsResult.error,
    salesResult.error,
    messagesResult.error,
    previousMessagesResult.error,
    followupsResult.error,
    previousFollowupsResult.error,
  ].filter(Boolean);

  return (
    <main
      style={{
        height: "100svh",
        background: "#050508",
        color: "#e4e4e8",
        padding: "28px min(4vw, 44px) 42px",
        overflowX: "hidden",
        overflowY: "auto",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          marginBottom: 24,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 16,
            }}
          >
            <Image
              src="/logo/scala-logo.svg"
              alt="SCALA"
              width={92}
              height={12}
              priority
              style={{ filter: "brightness(0) invert(1)", opacity: 0.92 }}
            />
            <span style={{ width: 1, height: 22, background: "#1e1e2a" }} />
            <p
              style={{
                margin: 0,
                color: "#8ab4ff",
                fontSize: 10,
                fontWeight: 900,
                fontFamily: MONO,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Control CRM
            </p>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 34,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            Centro de control comercial
          </h1>
          <p style={{ margin: "8px 0 0", color: "#848494", fontSize: 13 }}>
            Ventas, ranking, embudo, conversaciones y proyecciones para{" "}
            {range.label}.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <CrmSaleButton />
          <Link href="/chats" style={navButtonStyle}>
            Volver al chat
          </Link>
          <Link href="/sales" style={navButtonStyle}>
            Ventas
          </Link>
          <Link href="/sales/ranking" style={navButtonStyle}>
            Ranking
          </Link>
        </div>
      </header>

      {warnings.length ? (
        <section
          style={{
            border: "1px solid rgba(245,158,11,0.30)",
            background: "rgba(245,158,11,0.08)",
            color: "#f59e0b",
            borderRadius: 8,
            padding: 14,
            marginBottom: 18,
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          Algunas fuentes no respondieron: {warnings.join(" | ")}
        </section>
      ) : null}

      <section
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          border: "1px solid #1e1e2a",
          background: "#0a0a0f",
          borderRadius: 8,
          padding: 14,
          marginBottom: 18,
        }}
      >
        <div>
          <strong style={{ color: "#f2f2f4", fontSize: 14 }}>Periodo</strong>
          <p style={{ margin: "4px 0 0", color: "#666676", fontSize: 12 }}>
            Cambiar mes recalcula ventas, ranking y proyeccion.
          </p>
        </div>
        <CrmMonthPicker months={monthOptions} selectedMonth={selectedMonth} />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <MetricCard
          label="Vendido confirmado"
          value={formatCurrency(totalSold)}
          detail={`${confirmedMonthSales.length} ventas confirmadas`}
          tone="green"
          trend={soldTrend}
        />
        <MetricCard
          label="Proyeccion cierre mes"
          value={formatCurrency(blendedProjection)}
          detail={`Run-rate: ${formatCurrency(currentRunRateProjection)} - ${pipelineProjection.activeLeads.length} oportunidades`}
          tone="blue"
          trend={projectionTrend}
        />
        <MetricCard
          label="Leads del mes"
          value={formatNumber(monthLeads.length)}
          detail={`Conversion estimada: ${formatPercent(conversionRate)}`}
          tone="neutral"
          trend={leadsTrend}
        />
        <MetricCard
          label="Mensajes nuevos por dia"
          value={formatAverage(averageInboundMessagesPerDay)}
          detail={`${formatNumber(inboundMessages)} mensajes recibidos del cliente`}
          tone="blue"
          trend={inboundMessagesTrend}
        />
        <MetricCard
          label="Tiempo respuesta"
          value={formatMinutes(responseTime)}
          detail={`Sentinel o vendedor - ${stats.unresolved} sin responder - ${stats.lateResponses} tardias`}
          tone={stats.unresolved ? "warm" : "green"}
          trend={responseTrend}
        />
        <MetricCard
          label="Respuesta humana"
          value={formatMinutes(humanResponseTime)}
          detail={`Vendedor <=4h - ${stats.lateHumanResponses} tardias`}
          tone="warm"
          trend={humanResponseTrend}
        />
        <MetricCard
          label="Follow-ups enviados"
          value={formatNumber(currentFollowupStats.sent)}
          detail="Seguimientos automaticos enviados"
          tone="blue"
          trend={followupsSentTrend}
        />
        <MetricCard
          label="Follow-ups respondidos"
          value={formatNumber(currentFollowupStats.responded)}
          detail={`${formatPercent(currentFollowupStats.responseRate)} tasa de respuesta`}
          tone="green"
          trend={followupsRespondedTrend}
        />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <Panel
          title="Ventas diarias"
          subtitle="Monto confirmado por dia dentro del periodo seleccionado."
        >
          <DailySalesBarChart points={dailySales} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 10,
              marginTop: 14,
            }}
          >
            <MiniStat
              label="Mejor dia"
              value={
                bestSalesDay && bestSalesDay.amount > 0
                  ? `${bestSalesDay.day} - ${formatCurrency(bestSalesDay.amount)}`
                  : "-"
              }
            />
            <MiniStat
              label="Promedio diario"
              value={formatCurrency(dailyAverageSold)}
            />
            <MiniStat
              label="Dias con venta"
              value={`${dailySales.filter((point) => point.amount > 0).length}/${range.daysInMonth}`}
            />
          </div>
        </Panel>

        <Panel
          title="Avance vs proyeccion"
          subtitle="Acumulado real comparado con la curva esperada de cierre."
        >
          <ProjectionLineChart
            points={dailySales}
            projectedTotal={blendedProjection}
            range={range}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 10,
              marginTop: 14,
            }}
          >
            <MiniStat label="Vendido hoy" value={formatCurrency(totalSold)} />
            <MiniStat
              label="Falta proyectado"
              value={formatCurrency(remainingToProjection)}
            />
            <MiniStat
              label="Necesario/dia"
              value={
                range.isCurrentMonth
                  ? formatCurrency(dailyNeededForProjection)
                  : "-"
              }
            />
          </div>
        </Panel>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "0.95fr 1.05fr",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <Panel
          title="Ratios comerciales del mes"
          subtitle="Indicadores de calidad del embudo para el periodo seleccionado."
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            <RatioCard
              label="Conversion sobre propuestas"
              value={formatPercent(proposalConversionRate)}
              detail={`${confirmedMonthSales.length} ventas / ${proposalMonthLeads.length} propuestas`}
              tone="green"
            />
            <RatioCard
              label="Propuestas sobre calificados"
              value={formatPercent(proposalOnQualifiedRate)}
              detail={`${proposalMonthLeads.length} propuestas / ${qualifiedFunnelLeadIds.size} calificados`}
              tone="blue"
            />
            <RatioCard
              label="Leads calificados"
              value={formatPercent(qualifiedRate)}
              detail={`${qualifiedMonthLeads.length} de ${monthLeads.length} leads del mes`}
              tone="neutral"
            />
            <RatioCard
              label="Leads descalificados"
              value={formatPercent(disqualifiedRate)}
              detail={`${disqualifiedMonthLeads.length} de ${monthLeads.length} leads del mes`}
              tone={disqualifiedRate > 35 ? "warm" : "neutral"}
            />
          </div>
        </Panel>

        <Panel
          title="Distribucion mensual por etapa"
          subtitle="Porcentaje de leads del mes en cada etapa actual."
        >
          {monthStageRows.length ? (
            <div style={{ display: "grid", gap: 9 }}>
              {monthStageRows.map((row) => (
                <StagePercentageRow
                  key={row.stage}
                  label={row.stage.replace(/_/g, " ")}
                  count={row.count}
                  percentage={row.percentage}
                />
              ))}
            </div>
          ) : (
            <EmptyText>Sin leads registrados en este mes.</EmptyText>
          )}
        </Panel>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <Panel
          title="Proyeccion comercial"
          subtitle="Modelo simple: ventas reales + run-rate + pipeline ponderado."
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            <MiniStat
              label="Run-rate mensual"
              value={formatCurrency(currentRunRateProjection)}
            />
            <MiniStat
              label={`Pipeline activo (${pipelineProjection.activeLeads.length})`}
              value={formatCurrency(weightedPipeline)}
            />
            <MiniStat
              label="Pipeline usado"
              value={formatCurrency(pipelineUpsideUsed)}
            />
            <MiniStat
              label="Ticket promedio"
              value={formatCurrency(averageTicket)}
            />
          </div>
          <div
            style={{
              marginTop: 14,
              height: 10,
              borderRadius: 999,
              background: "#12121a",
              overflow: "hidden",
              border: "1px solid #1e1e2a",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, totalSold > 0 && blendedProjection > 0 ? (totalSold / blendedProjection) * 100 : 0)}%`,
                height: "100%",
                background: "linear-gradient(90deg, #185de8, #6bdda1)",
              }}
            />
          </div>
          <p style={{ margin: "9px 0 0", color: "#666676", fontSize: 12 }}>
            Ya vendido: {formatCurrency(totalSold)} sobre una proyeccion de{" "}
            {formatCurrency(blendedProjection)}.
          </p>
        </Panel>

        <Panel
          title="Salud operativa"
          subtitle="Mensajes y velocidad de atencion del periodo."
        >
          <div style={{ display: "grid", gap: 9 }}>
            <HealthRow
              label="Conversaciones activas"
              value={formatNumber(stats.conversations)}
            />
            <HealthRow
              label="Mensajes del cliente"
              value={formatNumber(messageCounts.user ?? 0)}
            />
            <HealthRow
              label="Promedio mensajes nuevos por dia"
              value={formatAverage(averageInboundMessagesPerDay)}
            />
            <HealthRow
              label="Mensajes Sentinel"
              value={formatNumber(messageCounts.assistant ?? 0)}
            />
            <HealthRow
              label="Mensajes vendedor"
              value={formatNumber(messageCounts.human_agent ?? 0)}
            />
            <HealthRow
              label="Respuesta promedio Sentinel/humano"
              value={formatMinutes(responseTime)}
            />
            <HealthRow
              label="Respuesta promedio humana"
              value={formatMinutes(humanResponseTime)}
            />
            <HealthRow
              label="Respuestas fuera de 4h"
              value={formatNumber(stats.lateResponses)}
            />
            <HealthRow
              label="Respuestas humanas fuera de 4h"
              value={formatNumber(stats.lateHumanResponses)}
            />
            <HealthRow
              label="Follow-ups enviados"
              value={formatNumber(currentFollowupStats.sent)}
            />
            <HealthRow
              label="Follow-ups respondidos"
              value={`${formatNumber(currentFollowupStats.responded)} (${formatPercent(currentFollowupStats.responseRate)})`}
            />
          </div>
        </Panel>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "0.95fr 1.05fr",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <Panel
          title="Ranking vendedores"
          subtitle="Ordenado por monto vendido confirmado."
        >
          {ranking.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {ranking.slice(0, 8).map((entry) => (
                <div
                  key={entry.sellerName}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr 118px 70px",
                    gap: 10,
                    alignItems: "center",
                    border: "1px solid #1e1e2a",
                    background:
                      entry.position === 1
                        ? "rgba(245,158,11,0.08)"
                        : "#0f0f16",
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  <strong
                    style={{
                      color: entry.position === 1 ? "#f59e0b" : "#f2f2f4",
                      fontFamily: MONO,
                    }}
                  >
                    #{entry.position}
                  </strong>
                  <span
                    style={{ color: "#f2f2f4", fontSize: 13, fontWeight: 800 }}
                  >
                    {entry.sellerName}
                  </span>
                  <strong
                    style={{
                      textAlign: "right",
                      color: "#f2f2f4",
                      fontSize: 13,
                    }}
                  >
                    {formatCurrency(entry.totalAmount)}
                  </strong>
                  <span
                    style={{
                      textAlign: "right",
                      color: "#848494",
                      fontSize: 12,
                    }}
                  >
                    {entry.confirmedSales} ventas
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyText>
              Sin ventas confirmadas para rankear en este mes.
            </EmptyText>
          )}
        </Panel>

        <Panel
          title="Embudo actual"
          subtitle="Estado vivo de todos los leads en Airtable."
        >
          <div style={{ display: "grid", gap: 8 }}>
            {Object.entries(stageCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 9)
              .map(([stage, count]) => (
                <div key={stage}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      color: "#a8a8b3",
                      fontSize: 12,
                      marginBottom: 5,
                    }}
                  >
                    <span style={{ textTransform: "capitalize" }}>
                      {stage.replace(/_/g, " ")}
                    </span>
                    <strong style={{ color: "#f2f2f4" }}>{count}</strong>
                  </div>
                  <div
                    style={{
                      height: 7,
                      borderRadius: 999,
                      background: "#12121a",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${leads.length ? (count / leads.length) * 100 : 0}%`,
                        background:
                          stage === "cerrado_ganado"
                            ? "#6bdda1"
                            : stage === "Propuesta enviada"
                              ? "#185de8"
                              : "#333848",
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </Panel>
      </section>

      <section
        style={{
          border: "1px solid #1e1e2a",
          background: "#0a0a0f",
          borderRadius: 8,
          overflowX: "auto",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "126px 1.3fr 150px 120px 120px 110px",
            minWidth: 900,
            gap: 12,
            padding: "12px 14px",
            background: "#12121a",
            borderBottom: "1px solid #1e1e2a",
            color: "#848494",
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          <span>Fecha</span>
          <span>Venta</span>
          <span>Vendedor</span>
          <span>Pago</span>
          <span>Estado</span>
          <span style={{ textAlign: "right" }}>Monto</span>
        </div>
        {latestSales.length ? (
          latestSales.map((sale) => (
            <article
              key={sale.id}
              style={{
                display: "grid",
                gridTemplateColumns: "126px 1.3fr 150px 120px 120px 110px",
                minWidth: 900,
                gap: 12,
                alignItems: "center",
                padding: "13px 14px",
                borderBottom: "1px solid #1e1e2a",
              }}
            >
              <span style={{ color: "#a8a8b3", fontSize: 12 }}>
                {dateLabel(
                  sale.purchaseDate || sale.registeredAt || sale.createdTime,
                )}
              </span>
              <strong
                title={sale.description}
                style={{
                  color: "#f2f2f4",
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {saleTitle(sale)}
              </strong>
              <span
                style={{
                  color: "#a8a8b3",
                  fontSize: 12,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {sellerOfSale(sale)}
              </span>
              <span style={{ color: "#a8a8b3", fontSize: 12 }}>
                {sale.paymentMethod || "-"}
              </span>
              <span
                style={{
                  color: isConfirmedSale(sale) ? "#6bdda1" : "#f59e0b",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {sale.status || "-"}
              </span>
              <strong
                style={{ textAlign: "right", color: "#f2f2f4", fontSize: 13 }}
              >
                {formatCurrency(sale.amount)}
              </strong>
            </article>
          ))
        ) : (
          <div style={{ padding: 36, textAlign: "center" }}>
            <EmptyText>Sin ventas registradas para este periodo.</EmptyText>
          </div>
        )}
      </section>
    </main>
  );
}

const navButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "#12121a",
  color: "#e4e4e8",
  borderRadius: 6,
  padding: "10px 14px",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 800,
};

function MetricCard({
  label,
  value,
  detail,
  tone,
  trend,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "green" | "blue" | "warm" | "neutral";
  trend?: MetricTrend;
}) {
  const color =
    tone === "green"
      ? "#6bdda1"
      : tone === "blue"
        ? "#8ab4ff"
        : tone === "warm"
          ? "#f59e0b"
          : "#a8a8b3";
  const trendColor = trend?.isGood ? "#6bdda1" : "#f59e0b";
  const trendBackground = trend?.isGood
    ? "rgba(107,221,161,0.10)"
    : "rgba(245,158,11,0.10)";
  const trendBorder = trend?.isGood
    ? "rgba(107,221,161,0.28)"
    : "rgba(245,158,11,0.28)";
  return (
    <div
      style={{
        border: "1px solid #1e1e2a",
        background: "#0a0a0f",
        borderRadius: 8,
        padding: 16,
        minWidth: 0,
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          color,
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <strong
          style={{
            display: "block",
            color: "#f2f2f4",
            fontSize: 24,
            lineHeight: 1.05,
            overflowWrap: "anywhere",
          }}
        >
          {value}
        </strong>
        {trend ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              border: `1px solid ${trendBorder}`,
              background: trendBackground,
              color: trendColor,
              borderRadius: 999,
              padding: "4px 8px",
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
            }}
          >
            {formatDeltaPercent(trend.value)}
            <span style={{ color: "#848494", fontWeight: 700 }}>
              {trend.label}
            </span>
          </span>
        ) : null}
      </div>
      <span
        style={{
          display: "block",
          color: "#666676",
          fontSize: 11,
          marginTop: 8,
        }}
      >
        {detail}
      </span>
    </div>
  );
}

function RatioCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "green" | "blue" | "warm" | "neutral";
}) {
  const color =
    tone === "green"
      ? "#6bdda1"
      : tone === "blue"
        ? "#8ab4ff"
        : tone === "warm"
          ? "#f59e0b"
          : "#a8a8b3";
  return (
    <div
      style={{
        border: "1px solid #1e1e2a",
        background: "#101018",
        borderRadius: 8,
        padding: 13,
        minWidth: 0,
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          color: "#848494",
          fontSize: 11,
          lineHeight: 1.25,
        }}
      >
        {label}
      </p>
      <strong
        style={{
          display: "block",
          color,
          fontSize: 24,
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </strong>
      <span
        style={{
          display: "block",
          color: "#666676",
          fontSize: 11,
          marginTop: 8,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {detail}
      </span>
    </div>
  );
}

function StagePercentageRow({
  label,
  count,
  percentage,
}: {
  label: string;
  count: number;
  percentage: number;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "baseline",
          marginBottom: 5,
        }}
      >
        <span
          style={{
            color: "#a8a8b3",
            fontSize: 12,
            textTransform: "capitalize",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <strong style={{ color: "#f2f2f4", fontSize: 12, fontFamily: MONO }}>
          {formatPercent(percentage)} · {count}
        </strong>
      </div>
      <div
        style={{
          height: 7,
          borderRadius: 999,
          background: "#12121a",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, percentage)}%`,
            background: percentage >= 35 ? "#185de8" : "#333848",
          }}
        />
      </div>
    </div>
  );
}

function DailySalesBarChart({ points }: { points: DailySalesPoint[] }) {
  const hasData = points.some((point) => point.amount > 0);
  if (!hasData)
    return (
      <ChartEmpty>
        Sin ventas confirmadas para graficar en este periodo.
      </ChartEmpty>
    );

  const width = 680;
  const height = 230;
  const left = 54;
  const right = 18;
  const top = 18;
  const bottom = 36;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maxAmount = Math.max(1, ...points.map((point) => point.amount));
  const slot = chartWidth / Math.max(1, points.length);
  const barWidth = Math.max(5, slot * 0.62);
  const labelDays = new Set([1, 5, 10, 15, 20, 25, points.length]);

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Ventas diarias del mes"
        style={{ width: "100%", minWidth: 520, display: "block" }}
      >
        <style>{`.chart-node .chart-tooltip{opacity:0;transition:opacity .12s ease;pointer-events:none}.chart-node:hover .chart-tooltip{opacity:1}.chart-node:hover .chart-focus{stroke:#f2f2f4;stroke-width:1.5}`}</style>
        <defs>
          <linearGradient id="daily-sales-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6bdda1" />
            <stop offset="100%" stopColor="#185de8" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((ratio) => {
          const y = top + chartHeight - chartHeight * ratio;
          return (
            <g key={ratio}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                stroke="#1e1e2a"
                strokeWidth="1"
              />
              <text
                x={left - 10}
                y={y + 4}
                textAnchor="end"
                fill="#666676"
                fontSize="10"
                fontFamily={MONO}
              >
                {ratio === 0 ? "$0" : formatCurrency(maxAmount * ratio)}
              </text>
            </g>
          );
        })}

        {points.map((point, index) => {
          const barHeight =
            point.amount > 0
              ? Math.max(4, (point.amount / maxAmount) * chartHeight)
              : 0;
          const x = left + index * slot + (slot - barWidth) / 2;
          const y = top + chartHeight - barHeight;
          const tooltipWidth = 176;
          const tooltipX = Math.max(
            left,
            Math.min(
              width - right - tooltipWidth,
              left + index * slot + slot / 2 - tooltipWidth / 2,
            ),
          );
          const tooltipY = Math.max(
            top + 2,
            Math.min(height - bottom - 54, y - 58),
          );

          return (
            <g key={point.day} className="chart-node">
              {point.amount > 0 ? (
                <rect
                  className="chart-focus"
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx="3"
                  fill="url(#daily-sales-gradient)"
                />
              ) : null}
              <rect
                x={left + index * slot}
                y={top}
                width={slot}
                height={chartHeight}
                fill="transparent"
              />
              <ChartTooltip
                x={tooltipX}
                y={tooltipY}
                width={tooltipWidth}
                title={`Dia ${point.day}`}
                detail={`${formatCurrency(point.amount)} - ${point.count} venta${point.count === 1 ? "" : "s"}`}
              />
              {labelDays.has(point.day) ? (
                <text
                  x={left + index * slot + slot / 2}
                  y={height - 12}
                  textAnchor="middle"
                  fill="#666676"
                  fontSize="10"
                  fontFamily={MONO}
                >
                  {point.day}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ProjectionLineChart({
  points,
  projectedTotal,
  range,
}: {
  points: DailySalesPoint[];
  projectedTotal: number;
  range: MonthRange;
}) {
  const actualLimit = range.isCurrentMonth
    ? range.elapsedDays
    : range.daysInMonth;
  const actualPoints = points.slice(0, Math.max(1, actualLimit));
  const hasActual = actualPoints.some((point) => point.cumulative > 0);
  const rawYMax = Math.max(
    1,
    projectedTotal,
    ...points.map((point) => point.cumulative),
  );
  const yScale = niceCurrencyScale(rawYMax);
  const yMax = yScale.max;

  if (!hasActual && projectedTotal <= 0)
    return (
      <ChartEmpty>
        Sin base suficiente para mostrar avance contra proyeccion.
      </ChartEmpty>
    );

  const width = 680;
  const height = 240;
  const left = 72;
  const right = 18;
  const top = 28;
  const bottom = 36;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const xForDay = (day: number) =>
    left +
    ((Math.max(1, day) - 1) / Math.max(1, range.daysInMonth - 1)) * chartWidth;
  const yForValue = (value: number) =>
    top + chartHeight - (Math.max(0, value) / yMax) * chartHeight;
  const projectedPoints = points.map((point) => ({
    day: point.day,
    cumulative: (projectedTotal / Math.max(1, range.daysInMonth)) * point.day,
  }));
  const linePath = (linePoints: { day: number; cumulative: number }[]) =>
    linePoints
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"} ${xForDay(point.day).toFixed(1)} ${yForValue(point.cumulative).toFixed(1)}`,
      )
      .join(" ");
  const areaPath = actualPoints.length
    ? `${linePath(actualPoints)} L ${xForDay(actualPoints[actualPoints.length - 1].day).toFixed(1)} ${top + chartHeight} L ${xForDay(actualPoints[0].day).toFixed(1)} ${top + chartHeight} Z`
    : "";
  const projectionHoverDays = [
    ...new Set([1, Math.ceil(range.daysInMonth / 2), range.daysInMonth]),
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <ChartLegend color="#6bdda1" label="Real acumulado" />
        <ChartLegend color="#8ab4ff" label="Proyeccion" dashed />
      </div>
      <div style={{ width: "100%", overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Avance real contra proyeccion"
          style={{ width: "100%", minWidth: 520, display: "block" }}
        >
          <style>{`.chart-node .chart-tooltip{opacity:0;transition:opacity .12s ease;pointer-events:none}.chart-node:hover .chart-tooltip{opacity:1}.chart-node:hover .chart-focus{stroke:#f2f2f4;stroke-width:2}`}</style>
          <defs>
            <linearGradient
              id="projection-area-gradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#6bdda1" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#6bdda1" stopOpacity="0" />
            </linearGradient>
          </defs>

          <text
            x={left}
            y={12}
            fill="#848494"
            fontSize="9"
            fontFamily={MONO}
          >
            MONTO ACUMULADO (ARS)
          </text>

          {Array.from({ length: yScale.segments + 1 }, (_, index) => index).map((index) => {
            const value = yScale.step * index;
            const ratio = value / yMax;
            const y = top + chartHeight - chartHeight * ratio;
            return (
              <g key={value}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y}
                  y2={y}
                  stroke="#1e1e2a"
                  strokeWidth="1"
                />
                <text
                  x={left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fill="#666676"
                  fontSize="10"
                  fontFamily={MONO}
                >
                  {formatAxisCurrency(value)}
                </text>
              </g>
            );
          })}

          <path
            d={linePath(projectedPoints)}
            fill="none"
            stroke="#8ab4ff"
            strokeWidth="2"
            strokeDasharray="6 7"
            strokeLinecap="round"
          />
          {areaPath ? (
            <path d={areaPath} fill="url(#projection-area-gradient)" />
          ) : null}
          {hasActual ? (
            <path
              d={linePath(actualPoints)}
              fill="none"
              stroke="#6bdda1"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {projectionHoverDays.map((day) => {
            const projectedValue =
              (projectedTotal / Math.max(1, range.daysInMonth)) * day;
            const cx = xForDay(day);
            const cy = yForValue(projectedValue);
            const tooltipWidth = 198;
            const tooltipX = Math.max(
              left,
              Math.min(width - right - tooltipWidth, cx - tooltipWidth / 2),
            );
            const tooltipY = Math.max(
              top + 2,
              Math.min(height - bottom - 54, cy - 58),
            );

            return (
              <g key={`projected-${day}`} className="chart-node">
                <circle
                  className="chart-focus"
                  cx={cx}
                  cy={cy}
                  r="4"
                  fill="#0a0a0f"
                  stroke="#8ab4ff"
                  strokeWidth="2"
                />
                <circle cx={cx} cy={cy} r="12" fill="transparent" />
                <ChartTooltip
                  x={tooltipX}
                  y={tooltipY}
                  width={tooltipWidth}
                  title={`Proyeccion dia ${day}`}
                  detail={formatCurrency(projectedValue)}
                />
              </g>
            );
          })}

          {actualPoints.map((point) =>
            point.cumulative > 0
              ? (() => {
                  const cx = xForDay(point.day);
                  const cy = yForValue(point.cumulative);
                  const tooltipWidth = 190;
                  const tooltipX = Math.max(
                    left,
                    Math.min(
                      width - right - tooltipWidth,
                      cx - tooltipWidth / 2,
                    ),
                  );
                  const tooltipY = Math.max(
                    top + 2,
                    Math.min(height - bottom - 54, cy - 58),
                  );

                  return (
                    <g key={point.day} className="chart-node">
                      <circle
                        className="chart-focus"
                        cx={cx}
                        cy={cy}
                        r="4"
                        fill="#6bdda1"
                      />
                      <circle cx={cx} cy={cy} r="12" fill="transparent" />
                      <ChartTooltip
                        x={tooltipX}
                        y={tooltipY}
                        width={tooltipWidth}
                        title={`Real dia ${point.day}`}
                        detail={`Acumulado ${formatCurrency(point.cumulative)}`}
                      />
                    </g>
                  );
                })()
              : null,
          )}

          {[1, Math.ceil(range.daysInMonth / 2), range.daysInMonth].map(
            (day) => (
              <text
                key={day}
                x={xForDay(day)}
                y={height - 12}
                textAnchor="middle"
                fill="#666676"
                fontSize="10"
                fontFamily={MONO}
              >
                {day}
              </text>
            ),
          )}
        </svg>
      </div>
    </div>
  );
}

function ChartTooltip({
  x,
  y,
  width,
  title,
  detail,
}: {
  x: number;
  y: number;
  width: number;
  title: string;
  detail: string;
}) {
  return (
    <g className="chart-tooltip">
      <rect
        x={x}
        y={y}
        width={width}
        height="46"
        rx="7"
        fill="#050508"
        stroke="#2f3444"
        strokeWidth="1"
      />
      <text
        x={x + 11}
        y={y + 18}
        fill="#f2f2f4"
        fontSize="11"
        fontWeight="800"
        fontFamily={MONO}
      >
        {title}
      </text>
      <text
        x={x + 11}
        y={y + 34}
        fill="#a8a8b3"
        fontSize="10"
        fontFamily={MONO}
      >
        {detail}
      </text>
    </g>
  );
}

function ChartLegend({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        color: "#848494",
        fontSize: 11,
      }}
    >
      <span
        style={{
          width: 24,
          height: 2,
          background: dashed ? "transparent" : color,
          borderTop: dashed ? `2px dashed ${color}` : 0,
        }}
      />
      {label}
    </span>
  );
}

function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: 230,
        display: "grid",
        placeItems: "center",
        border: "1px dashed #1e1e2a",
        background: "#08080d",
        borderRadius: 8,
      }}
    >
      <EmptyText>{children}</EmptyText>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        border: "1px solid #1e1e2a",
        background: "#0a0a0f",
        borderRadius: 8,
        padding: 16,
        minWidth: 0,
      }}
    >
      <h2 style={{ margin: 0, color: "#f2f2f4", fontSize: 18 }}>{title}</h2>
      <p style={{ margin: "6px 0 16px", color: "#666676", fontSize: 12 }}>
        {subtitle}
      </p>
      {children}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid #1e1e2a",
        background: "#101018",
        borderRadius: 8,
        padding: 12,
      }}
    >
      <p style={{ margin: "0 0 8px", color: "#666676", fontSize: 11 }}>
        {label}
      </p>
      <strong style={{ color: "#f2f2f4", fontSize: 16 }}>{value}</strong>
    </div>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        borderBottom: "1px solid #1e1e2a",
        paddingBottom: 8,
      }}
    >
      <span style={{ color: "#a8a8b3", fontSize: 12 }}>{label}</span>
      <strong style={{ color: "#f2f2f4", fontSize: 12 }}>{value}</strong>
    </div>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: 0, color: "#848494", fontSize: 13 }}>{children}</p>
  );
}
