"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { ParticipantKpi } from "../lib/butterbase";
import { format } from "date-fns";

interface Props { kpis: ParticipantKpi[] }

export function KpiTrendChart({ kpis }: Props) {
  const data = [...kpis].reverse().map((k) => ({
    date: format(new Date(k.created_at), "MMM d"),
    talkRatio: Math.round(k.talk_ratio * 100),
    engagement: Math.round(k.engagement_score * 100),
    questions: k.questions_asked,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6C7278" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#6C7278" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 12 }}
          cursor={{ stroke: "#6C7278", strokeWidth: 1, strokeDasharray: "4 2" }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: "#6C7278" }} />
        <Line type="monotone" dataKey="talkRatio" name="Talk %" stroke="#1A1C1E" strokeWidth={1.5} dot={{ r: 3, fill: "#1A1C1E" }} />
        <Line type="monotone" dataKey="engagement" name="Engagement %" stroke="#B8422E" strokeWidth={1.5} dot={{ r: 3, fill: "#B8422E" }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
