"use client";

import React, { useEffect } from "react";
import { C, FM } from "@/lib/tokens";

export function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2200);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 80,
        background: C.mist,
        color: C.cream,
        padding: "14px 16px",
        fontFamily: FM,
        fontSize: 11,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        zIndex: 80,
        maxWidth: 398,
        margin: "0 auto",
        animation: "toastIn 200ms ease-out",
      }}
    >
      <span>{msg}</span>
      <span style={{ opacity: 0.6 }}>×</span>
    </div>
  );
}
