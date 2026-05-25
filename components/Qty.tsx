"use client";

import React from "react";
import { C, FM } from "@/lib/tokens";

export function Qty({
  qty,
  onChange,
}: {
  qty: number;
  onChange: (q: number) => void;
}) {
  const b: React.CSSProperties = {
    background: "transparent",
    color: C.mist,
    border: "none",
    width: 34,
    height: 34,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "stretch",
        border: `1px solid ${C.bdr}`,
        borderRadius: 2,
      }}
    >
      <button onClick={() => onChange(Math.max(1, qty - 1))} style={b}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 34,
          fontFamily: FM,
          fontWeight: 500,
          color: C.negro,
          fontSize: 13,
        }}
      >
        {qty}
      </div>
      <button onClick={() => onChange(qty + 1)} style={b}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}
