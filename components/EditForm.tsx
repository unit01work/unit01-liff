"use client";

import React, { useState, useCallback } from "react";
import { C, FM, FT } from "@/lib/tokens";
import { BackIcon, CheckIcon } from "./Icons";
import { SectHead, BracketChain } from "./MicroGraphics";

interface EditFormProps {
  orderId: string;
  initialName: string;
  initialPhone: string;
  initialAddress: string;
  onClose: () => void;
}

// Field component outside to prevent focus loss on re-render
function Fld({
  label,
  field,
  ph,
  area,
  value,
  error,
  onChange,
}: {
  label: string;
  field: string;
  ph: string;
  area?: boolean;
  value: string;
  error: boolean;
  onChange: (field: string, value: string) => void;
}) {
  const style: React.CSSProperties = {
    background: C.white,
    color: C.mist,
    border: `1px solid ${error ? C.err : C.bdr}`,
    padding: "16px 14px",
    borderRadius: 2,
    fontFamily: FT,
    fontSize: 16,
    lineHeight: 1.3,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontFamily: FM, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.oliva, fontWeight: 500 }}>
        {label}
      </label>
      {area ? (
        <textarea value={value} onChange={(e) => onChange(field, e.target.value)} placeholder={ph} rows={3} style={{ ...style, resize: "none" }} />
      ) : (
        <input value={value} onChange={(e) => onChange(field, e.target.value)} placeholder={ph} style={style} />
      )}
    </div>
  );
}

type SaveState = "idle" | "saving" | "done" | "error";

export function EditForm({ orderId, initialName, initialPhone, initialAddress, onClose }: EditFormProps) {
  const [form, setForm] = useState({ name: initialName, phone: initialPhone, address: initialAddress });
  const [err, setErr] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const upd = useCallback((k: string, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErr((p) => (p[k] ? { ...p, [k]: false } : p));
  }, []);

  const validate = () => {
    const e: Record<string, boolean> = {};
    if (!form.name.trim()) e.name = true;
    if (!form.phone.trim()) e.phone = true;
    if (!form.address.trim()) e.address = true;
    setErr(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || saveState === "saving") return;
    setSaveState("saving");

    try {
      const res = await fetch(`/api/order/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error("Failed to update");

      setSaveState("done");

      // Close LIFF after 1.5s
      setTimeout(async () => {
        try {
          const liff = (await import("@line/liff")).default;
          if (liff.isInClient()) {
            liff.closeWindow();
            return;
          }
        } catch { /* not in LIFF */ }
        onClose();
      }, 1500);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2000);
    }
  };

  if (saveState === "done") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.cream, gap: 16 }}>
        <div style={{ width: 56, height: 56, border: `2px solid ${C.mist}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CheckIcon size={28} />
        </div>
        <div style={{ fontFamily: FM, fontWeight: 800, fontSize: 20, color: C.negro, textTransform: "uppercase", letterSpacing: "0.1em" }}>UPDATED</div>
        <div style={{ fontFamily: FM, fontSize: 10, color: C.gris, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          {"// กำลังปิดหน้าต่าง..."}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* HEADER */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: C.cream, borderBottom: `1px solid ${C.light}`, display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center", height: 52 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", height: 44, width: 44, display: "flex", alignItems: "center", justifyContent: "center", color: C.negro, padding: 0 }}>
          <BackIcon />
        </button>
        <div style={{ textAlign: "center", fontFamily: FM, fontSize: 11, fontWeight: 700, color: C.negro, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          EDIT INFORMATION
        </div>
        <div />
      </div>

      {/* SCROLLABLE */}
      <div style={{ flex: 1, overflowY: "auto", background: C.cream }}>
        <div style={{ padding: "10px 16px 0", fontFamily: FM, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gris }}>
          {"// ORDER " + orderId}
        </div>

        <SectHead num="01" label="SHIPPING DETAILS" />
        <div style={{ borderBottom: `1.5px dotted ${C.dis}`, margin: "0 16px" }} />
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 16px 0", color: C.gris }}>
          <BracketChain count={11} size={9} gap={3} color={C.gris} />
        </div>

        <div style={{ padding: "20px 16px 32px", display: "flex", flexDirection: "column", gap: 20 }}>
          <Fld label="FULL NAME" field="name" ph="ชื่อ-นามสกุล" value={form.name} error={!!err.name} onChange={upd} />
          <Fld label="PHONE NUMBER" field="phone" ph="081 234 5678" value={form.phone} error={!!err.phone} onChange={upd} />
          <Fld label="SHIPPING ADDRESS" field="address" ph="ที่อยู่จัดส่ง" area value={form.address} error={!!err.address} onChange={upd} />
        </div>

        <div style={{ padding: "0 16px 24px", display: "flex", justifyContent: "center" }}>
          <BracketChain count={11} size={9} gap={3} color={C.gris} />
        </div>
      </div>

      {/* BUTTONS */}
      <div style={{ position: "sticky", bottom: 0, background: `rgba(255,255,255,0.96)`, backdropFilter: "blur(16px)", borderTop: `1px solid ${C.light}`, padding: "12px 16px 14px", zIndex: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        {saveState === "error" && (
          <div style={{ fontFamily: FM, fontSize: 10, color: C.err, textAlign: "center", letterSpacing: "0.1em" }}>
            เกิดข้อผิดพลาด กรุณาลองใหม่
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={saveState === "saving"}
          style={{
            width: "100%", padding: "18px 20px",
            background: saveState === "saving" ? C.light : C.mist,
            color: C.cream, border: "none",
            fontFamily: FM, fontWeight: 700, fontSize: 13,
            letterSpacing: "0.1em", textTransform: "uppercase",
            cursor: saveState === "saving" ? "default" : "pointer",
            borderRadius: 2,
          }}
        >
          {saveState === "saving" ? "SAVING..." : "SAVE CHANGES"}
        </button>
        <button
          onClick={onClose}
          style={{
            width: "100%", padding: "12px 20px",
            background: "none", color: C.gris,
            border: `1px solid ${C.bdr}`,
            fontFamily: FM, fontWeight: 500, fontSize: 11,
            letterSpacing: "0.1em", textTransform: "uppercase",
            cursor: "pointer", borderRadius: 2,
          }}
        >
          CANCEL
        </button>
      </div>
    </>
  );
}
