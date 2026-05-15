"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Props {
  data: { name: string; talkRatio: number; engagement: number; actionItems: number }[];
}

export function TeamKpiChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -20 }} barGap={4}>
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6C7278" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#6C7278" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 12 }}
          cursor={{ fill: "#F7F5F2" }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: "#6C7278" }} />
        <Bar dataKey="talkRatio" name="Talk %" fill="#1A1C1E" radius={[2, 2, 0, 0]} maxBarSize={32} />
        <Bar dataKey="engagement" name="Engagement %" fill="#B8422E" radius={[2, 2, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}
