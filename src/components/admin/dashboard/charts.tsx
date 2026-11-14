"use client";

import type { ReactNode } from "react";
import { useLocale } from "next-intl";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { intlLocale } from "@/lib/format";

/*
 * PST palette as CSS variables so marks re-step for dark mode instead of
 * flipping automatically: red → lighter red, gold stays, ink → slate-300.
 */
const PALETTE_VARS =
  "[--c-red:#D91C1F] [--c-gold:#CA8A04] [--c-ink:#0F172A] dark:[--c-red:#F05252] dark:[--c-gold:#FACC15] dark:[--c-ink:#CBD5E1]";
const RED = "var(--c-red)";
const GOLD = "var(--c-gold)";
const INK = "var(--c-ink)";

const axisTick = { fill: "currentColor", fontSize: 11 };
const tooltipStyle = {
  contentStyle: {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    color: "var(--color-card-foreground)",
    fontSize: 12,
    boxShadow: "0 4px 12px rgb(0 0 0 / 0.12)",
  },
  labelStyle: { fontWeight: 700, marginBottom: 4 },
  itemStyle: { color: "var(--color-card-foreground)", padding: 0 },
  cursor: { fill: "var(--color-muted)", opacity: 0.6 },
};

function Frame({ children, height = 260, label }: { children: ReactNode; height?: number; label: string }) {
  return (
    <div className={`${PALETTE_VARS} text-muted-foreground`} style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

function useNum() {
  const locale = useLocale();
  const nf = new Intl.NumberFormat(intlLocale(locale));
  return (v: unknown) => nf.format(Number(v) || 0);
}

export function RegistrationsChart({ data, label, seriesLabel }: { data: { day: string; count: number }[]; label: string; seriesLabel: string }) {
  const locale = useLocale();
  const num = useNum();
  const df = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" });
  const fmtDay = (d: string) => df.format(new Date(`${d}T00:00:00Z`));
  return (
    <Frame label={label}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="regFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={RED} stopOpacity={0.28} />
            <stop offset="100%" stopColor={RED} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
        <XAxis dataKey="day" tickFormatter={fmtDay} tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={44} />
        <Tooltip {...tooltipStyle} cursor={{ stroke: "var(--color-muted-foreground)", strokeDasharray: "3 3" }} labelFormatter={(d) => fmtDay(String(d))} formatter={(v) => [num(v), seriesLabel]} />
        <Area type="monotone" dataKey="count" stroke={RED} strokeWidth={2} fill="url(#regFill)" activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-card)" }} />
      </AreaChart>
    </Frame>
  );
}

export function MunicipalityChart({
  data,
  label,
  labels,
}: {
  data: { name: string; verified: number; pending: number; other: number }[];
  label: string;
  labels: { verified: string; pending: string; other: string };
}) {
  const num = useNum();
  const height = Math.max(220, data.length * 30 + 60);
  return (
    <Frame label={label} height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke="var(--color-border)" />
        <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" tick={axisTick} tickLine={false} axisLine={false} width={96} interval={0} />
        <Tooltip {...tooltipStyle} formatter={(v, name) => [num(v), name]} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="verified" name={labels.verified} stackId="m" fill={RED} stroke="var(--color-card)" strokeWidth={1} />
        <Bar dataKey="pending" name={labels.pending} stackId="m" fill={GOLD} stroke="var(--color-card)" strokeWidth={1} />
        <Bar dataKey="other" name={labels.other} stackId="m" fill={INK} stroke="var(--color-card)" strokeWidth={1} radius={[0, 4, 4, 0]} />
      </BarChart>
    </Frame>
  );
}

export function SimpleBarChart({
  data,
  label,
  seriesLabel,
  horizontal,
}: {
  data: { name: string; value: number }[];
  label: string;
  seriesLabel: string;
  horizontal?: boolean;
}) {
  const num = useNum();
  if (horizontal) {
    return (
      <Frame label={label} height={Math.max(180, data.length * 32 + 30)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="var(--color-border)" />
          <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" tick={axisTick} tickLine={false} axisLine={false} width={104} interval={0} />
          <Tooltip {...tooltipStyle} formatter={(v) => [num(v), seriesLabel]} />
          <Bar dataKey="value" fill={RED} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </Frame>
    );
  }
  return (
    <Frame label={label}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
        <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} interval={0} />
        <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={44} />
        <Tooltip {...tooltipStyle} formatter={(v) => [num(v), seriesLabel]} />
        <Bar dataKey="value" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </Frame>
  );
}

export function GenderChart({ data, label }: { data: { name: string; value: number }[]; label: string }) {
  const num = useNum();
  const total = data.reduce((a, b) => a + b.value, 0);
  const colors = [INK, RED];
  return (
    <div className="grid items-center gap-4 sm:grid-cols-2">
      <Frame label={label} height={200}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="var(--color-card)" strokeWidth={2}>
            {data.map((d, i) => (
              <Cell key={d.name} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(v, name) => [num(v), name]} />
        </PieChart>
      </Frame>
      <ul className={`${PALETTE_VARS} space-y-3`}>
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span aria-hidden className="size-3 rounded-full" style={{ background: colors[i % colors.length] }} />
              {d.name}
            </span>
            <span className="font-semibold tabular-nums">
              {num(d.value)} <span className="font-normal text-muted-foreground">({total ? Math.round((d.value / total) * 100) : 0}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
