"use client";

import React, { useState, useCallback } from "react";
import { C, FM, FT, fmt } from "@/lib/tokens";
import { BackIcon } from "./Icons";
import { SectHead, BracketChain } from "./MicroGraphics";
import type { CartItem } from "./Cart";

export interface ShippingInfo {
  name: string;
  phone: string;
  address: string;
  city: string;
  zip: string;
}

/* Field component defined OUTSIDE to prevent re-creation on every render */
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
      <label
        style={{
          fontFamily: FM,
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: C.oliva,
          fontWeight: 500,
        }}
      >
        {label}
      </label>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
          placeholder={ph}
          rows={3}
          style={{ ...style, resize: "none" }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
          placeholder={ph}
          style={style}
        />
      )}
    </div>
  );
}

export function ScreenShipping({
  cart,
  onBack,
  onConfirm,
}: {
  cart: CartItem[];
  onBack: () => void;
  onConfirm: (form: ShippingInfo) => void;
}) {
  const [form, setForm] = useState<ShippingInfo>({
    name: "",
    phone: "",
    address: "",
    city: "",
    zip: "",
  });
  const [err, setErr] = useState<Record<string, boolean>>({});
  const sub = cart.reduce((s, c) => s + c.price * c.qty, 0);

  const upd = useCallback((k: string, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErr((p) => (p[k] ? { ...p, [k]: false } : p));
  }, []);

  const validate = () => {
    const e: Record<string, boolean> = {};
    (["name", "phone", "address", "city", "zip"] as const).forEach((k) => {
      if (!form[k].trim()) e[k] = true;
    });
    setErr(e);
    return !Object.keys(e).length;
  };

  const submit = () => {
    if (validate()) onConfirm(form);
  };

  return (
    <>
      {/* HEADER */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: C.cream,
          borderBottom: `1px solid ${C.light}`,
          display: "grid",
          gridTemplateColumns: "44px 1fr 44px",
          alignItems: "center",
          height: 52,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            height: 44,
            width: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.negro,
            padding: 0,
          }}
        >
          <BackIcon />
        </button>
        <div
          style={{
            textAlign: "center",
            fontFamily: FM,
            fontSize: 13,
            fontWeight: 700,
            color: C.negro,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          CHECKOUT
        </div>
        <div />
      </div>

      {/* SCROLLABLE */}
      <div style={{ flex: 1, overflowY: "auto", background: C.cream }}>
        <div
          style={{
            padding: "10px 16px 0",
            fontFamily: FM,
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: C.gris,
          }}
        >
          {"// STEP 03 / 03"}
        </div>

        <SectHead num="03" label="SHIPPING DETAILS" />
        <div style={{ borderBottom: `1.5px dotted ${C.dis}`, margin: "0 16px" }} />
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "8px 16px 0",
            color: C.gris,
          }}
        >
          <BracketChain count={11} size={9} gap={3} color={C.gris} />
        </div>
        <div
          style={{
            padding: "4px 16px 0",
            fontFamily: FM,
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: C.gris,
          }}
        >
          {"// STEP 03 / 03 — DELIVERY ADDRESS"}
        </div>

        {/* Form fields */}
        <div
          style={{
            padding: "20px 16px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <Fld label="FULL NAME" field="name" ph="Trai Nimtawat" value={form.name} error={!!err.name} onChange={upd} />
          <Fld label="PHONE NUMBER" field="phone" ph="081 234 5678" value={form.phone} error={!!err.phone} onChange={upd} />
          <Fld label="SHIPPING ADDRESS" field="address" ph="99/1 Sukhumvit Rd, Khlong Toei" area value={form.address} error={!!err.address} onChange={upd} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Fld label="CITY / PROVINCE" field="city" ph="Bangkok" value={form.city} error={!!err.city} onChange={upd} />
            <Fld label="POSTAL CODE" field="zip" ph="10110" value={form.zip} error={!!err.zip} onChange={upd} />
          </div>
        </div>

        <div
          style={{
            padding: "0 16px 24px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <BracketChain count={11} size={9} gap={3} color={C.gris} />
        </div>
      </div>

      {/* CONFIRM BUTTON */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "rgba(244,239,236,0.96)",
          backdropFilter: "blur(16px)",
          borderTop: `1px solid ${C.light}`,
          padding: "12px 16px 14px",
          zIndex: 20,
        }}
      >
        <button
          onClick={submit}
          style={{
            width: "100%",
            padding: "18px 20px",
            background: C.mist,
            color: C.cream,
            border: "none",
            fontFamily: FM,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: "pointer",
            borderRadius: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>CONFIRM ORDER</span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>{fmt(sub)}</span>
        </button>
      </div>
    </>
  );
}
