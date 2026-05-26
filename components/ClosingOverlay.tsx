"use client";

import React, { useEffect } from "react";
import { C, FM } from "@/lib/tokens";
import { CheckIcon } from "./Icons";

export function ClosingOverlay({
  orderNo,
  onReset,
}: {
  orderNo: string;
  onReset: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const liff = (await import("@line/liff")).default;
        if (liff.isInClient()) {
          liff.closeWindow();
          return;
        }
      } catch {
        // not in LIFF client
      }
      // fallback: reset to products screen if not in LIFF
      onReset();
    }, 2500);
    return () => clearTimeout(t);
  }, [onReset]);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: C.cream,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        animation: "fadeIn 300ms ease-out",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          textAlign: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            border: `2px solid ${C.mist}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CheckIcon size={28} />
        </div>
        <div
          style={{
            fontFamily: FM,
            fontSize: 11,
            letterSpacing: "0.16em",
            color: C.sienna,
            textTransform: "uppercase",
          }}
        >
          {orderNo}
        </div>
        <div
          style={{
            fontFamily: FM,
            fontWeight: 800,
            fontSize: 28,
            lineHeight: 1,
            textTransform: "uppercase",
            color: C.negro,
          }}
        >
          ORDER
          <br />
          CONFIRMED
        </div>
        <div
          style={{
            fontFamily: FM,
            fontSize: 10,
            letterSpacing: "0.14em",
            color: C.gris,
            textTransform: "uppercase",
          }}
        >
          {"// กรุณารอ QR PromptPay ใน LINE Chat"}
        </div>
        <div
          style={{
            height: 3,
            width: "100%",
            background: `linear-gradient(90deg,${C.sienna},${C.orange},${C.mustard})`,
            marginTop: 8,
          }}
        />
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
    </div>
  );
}
