"use client";

import React from "react";
import { C, FM } from "@/lib/tokens";

export function TickRule({
  width = 170,
  height = 10,
  color = C.gris,
}: {
  width?: number;
  height?: number;
  color?: string;
}) {
  const lines = [];
  for (let x = 0.5; x < width; x += 2.2)
    lines.push(
      <line key={x} x1={x} x2={x} y1={0} y2={height} stroke={color} strokeWidth={1} />
    );
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {lines}
    </svg>
  );
}

export function Barcode({
  width = 80,
  height = 10,
  color = C.gris,
}: {
  width?: number;
  height?: number;
  color?: string;
}) {
  const bars = [];
  let s = 7 | 0,
    x = 0;
  while (x < width) {
    s = (s * 1664525 + 1013904223) | 0;
    const r = ((s >>> 0) % 10000) / 10000;
    const w = r * 1.6 + 0.6,
      gap = r * 1.4 + 0.6;
    if (r > 0.18)
      bars.push(<rect key={x} x={x} y={0} width={w} height={height} fill={color} />);
    x += w + gap;
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {bars}
    </svg>
  );
}

export function BracketChain({
  count = 11,
  size = 9,
  gap = 3,
  color = C.gris,
}: {
  count?: number;
  size?: number;
  gap?: number;
  color?: string;
}) {
  const w = (size + gap) * count - gap,
    arm = size * 0.28;
  const els = [];
  for (let i = 0; i < count; i++) {
    const x = i * (size + gap);
    els.push(
      <path
        key={`l${i}`}
        d={`M${x + arm} 0H${x}V${size}H${x + arm}`}
        fill="none"
        stroke={color}
        strokeWidth={1}
      />
    );
    els.push(
      <path
        key={`r${i}`}
        d={`M${x + size - arm} 0H${x + size}V${size}H${x + size - arm}`}
        fill="none"
        stroke={color}
        strokeWidth={1}
      />
    );
  }
  return (
    <svg width={w} height={size} viewBox={`0 0 ${w} ${size}`} style={{ display: "block" }}>
      {els}
    </svg>
  );
}

export function PageStamp({ color = C.gris }: { color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, color }}>
      <span style={{ width: 3, height: 3, background: color, borderRadius: "50%" }} />
      <TickRule width={170} height={10} color={color} />
      <Barcode width={80} height={10} color={color} />
      <span
        style={{
          fontFamily: FM,
          fontSize: 11,
          letterSpacing: "0.06em",
          color,
          fontStyle: "italic",
          fontWeight: 900,
        }}
      >
        »
      </span>
    </div>
  );
}

export function SectHead({ num, label }: { num: string; label: string }) {
  return (
    <div style={{ padding: "14px 16px 6px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontFamily: FM, fontSize: 12, fontWeight: 700, color: C.negro }}>{num}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            border: `1.5px solid ${C.gris}`,
          }}
        />
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.gris }} />
      </span>
      <span
        style={{
          fontFamily: FM,
          fontSize: 11,
          fontWeight: 700,
          color: C.negro,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
    </div>
  );
}

export function MicroDiv() {
  return (
    <div style={{ display: "flex", alignItems: "center", margin: "12px 0 0", color: C.gris }}>
      <span style={{ fontFamily: FM, fontSize: 14, lineHeight: 1 }}>{"[ "}</span>
      <div style={{ flex: 1, height: 0, borderTop: `1px solid ${C.bdr}` }} />
      <span style={{ fontFamily: FM, fontSize: 8, padding: "0 6px", color: C.dis }}>•</span>
      <div style={{ flex: 1, height: 0, borderTop: `1px solid ${C.bdr}` }} />
      <span style={{ fontFamily: FM, fontSize: 14, lineHeight: 1 }}>{" ]"}</span>
    </div>
  );
}
