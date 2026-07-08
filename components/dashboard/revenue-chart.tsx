"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { RevenuePoint } from "@/types/domain";

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 0, top: 12, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="#C4F24E" stopOpacity={0.45} />
              <stop offset="95%" stopColor="#C4F24E" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="label" stroke="rgba(245,241,232,0.42)" tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ background: "#111111", borderRadius: 24, border: "1px solid rgba(196, 242, 78,0.18)", color: "#f5f1e8", boxShadow: "0 20px 40px rgba(0,0,0,0.35)" }} />
          <Area type="monotone" dataKey="revenue" stroke="#C4F24E" fill="url(#revenueFill)" strokeWidth={3} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}