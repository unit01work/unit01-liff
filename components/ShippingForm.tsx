"use client";

import React, { useState, useCallback } from "react";
import { C, FM, FT, fmt } from "@/lib/tokens";
import { BackIcon } from "./Icons";
import { SectHead, BracketChain } from "./MicroGraphics";
import type { CartItem } from "./Cart";
import type { ZipResult } from "@/lib/thai-zipcode";

export interface ShippingInfo {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  postalCode: string;
  subDistrict: string;
  district: string;
  province: string;
}

/* ── Field component defined OUTSIDE to prevent re-creation on every render ── */
function Fld({
  label,
  field,
  ph,
  area,
  maxLen,
  value,
  error,
  readOnly,
  autoFilled,
  autoTag,
  onChange,
}: {
  label: string;
  field: string;
  ph: string;
  area?: boolean;
  maxLen?: number;
  value: string;
  error: boolean;
  readOnly?: boolean;
  autoFilled?: boolean;
  autoTag?: boolean;
  onChange: (field: string, value: string) => void;
}) {
  const style: React.CSSProperties = {
    background: autoFilled ? "#E5E0DD" : C.white,
    color: C.mist,
    border: `1.5px solid ${error ? C.err : "#D4CFC9"}`,
    padding: "14px 16px",
    borderRadius: 0,
    fontFamily: FT,
    fontSize: 14,
    lineHeight: 1.3,
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label
        style={{
          fontFamily: FM,
          fontSize: 10,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: C.gris,
          fontWeight: 600,
        }}
      >
        {label}
        {autoTag && (
          <span
            style={{
              display: "inline-block",
              fontSize: 8,
              letterSpacing: "0.1em",
              color: C.orange,
              border: `1px solid ${C.orange}`,
              padding: "1px 5px",
              marginLeft: 4,
              verticalAlign: "middle",
              fontWeight: 700,
            }}
          >
            AUTO-FILL
          </span>
        )}
      </label>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
          placeholder={ph}
          rows={3}
          style={{ ...style, resize: "none", minHeight: 70, lineHeight: 1.5 }}
          readOnly={readOnly}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
          placeholder={ph}
          style={style}
          readOnly={readOnly}
          maxLength={maxLen}
        />
      )}
    </div>
  );
}

/* ── Dropdown item ── */
function DropdownItem({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 16px",
        fontSize: 12,
        fontFamily: FM,
        cursor: "pointer",
        borderBottom: `1px solid #EBE7E4`,
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#F4EFEC")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#FFF")}
    >
      {label}
    </div>
  );
}

export function ScreenShipping({
  cart,
  shippingFee = 50,
  onBack,
  onConfirm,
}: {
  cart: CartItem[];
  shippingFee?: number;
  onBack: () => void;
  onConfirm: (form: ShippingInfo) => void;
}) {
  const [form, setForm] = useState<ShippingInfo>({
    firstName: "",
    lastName: "",
    phone: "",
    address: "",
    postalCode: "",
    subDistrict: "",
    district: "",
    province: "",
  });
  const [err, setErr] = useState<Record<string, boolean>>({});
  const [zipResults, setZipResults] = useState<ZipResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [zipNotFound, setZipNotFound] = useState(false);
  const sub = cart.reduce((s, c) => s + c.price * c.qty, 0);

  const upd = useCallback((k: string, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErr((p) => (p[k] ? { ...p, [k]: false } : p));

    // Auto-fill logic for postal code
    if (k === "postalCode") {
      if (v.length === 5 && /^\d{5}$/.test(v)) {
        // Dynamic import + async lookup
        import("@/lib/thai-zipcode").then(({ lookupZip }) => {
          const results = lookupZip(v);
          if (results.length === 1) {
            // Single result — auto-fill immediately
            setForm((p) => ({
              ...p,
              subDistrict: results[0].subDistrict,
              district: results[0].district,
              province: results[0].province,
            }));
            setAutoFilled(true);
            setZipNotFound(false);
            setShowDropdown(false);
            setZipResults([]);
          } else if (results.length > 1) {
            // Multiple results — show dropdown
            setZipResults(results);
            setShowDropdown(true);
            setAutoFilled(false);
            setZipNotFound(false);
            // Clear previous values
            setForm((p) => ({ ...p, subDistrict: "", district: "", province: "" }));
          } else {
            // Not found — let user type manually
            setZipNotFound(true);
            setAutoFilled(false);
            setShowDropdown(false);
            setZipResults([]);
            setForm((p) => ({ ...p, subDistrict: "", district: "", province: "" }));
          }
        });
      } else {
        // Clear auto-fill state
        setShowDropdown(false);
        setZipResults([]);
        if (v.length < 5) {
          setAutoFilled(false);
          setZipNotFound(false);
          setForm((p) => ({ ...p, subDistrict: "", district: "", province: "" }));
        }
      }
    }
  }, []);

  const pickZipResult = useCallback((result: ZipResult) => {
    setForm((p) => ({
      ...p,
      subDistrict: result.subDistrict,
      district: result.district,
      province: result.province,
    }));
    setAutoFilled(true);
    setShowDropdown(false);
    setZipResults([]);
  }, []);

  const validate = () => {
    const e: Record<string, boolean> = {};
    const required: (keyof ShippingInfo)[] = [
      "firstName", "lastName", "phone", "address", "postalCode",
      "subDistrict", "district", "province",
    ];
    required.forEach((k) => {
      if (!form[k].trim()) e[k] = true;
    });
    setErr(e);
    return !Object.keys(e).length;
  };

  const submit = () => {
    if (validate()) onConfirm(form);
  };

  const isAutoReadonly = autoFilled && !zipNotFound;

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
            gap: 18,
          }}
        >
          {/* First Name / Last Name */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Fld label="FIRST NAME" field="firstName" ph="First name" value={form.firstName} error={!!err.firstName} onChange={upd} />
            <Fld label="LAST NAME" field="lastName" ph="Last name" value={form.lastName} error={!!err.lastName} onChange={upd} />
          </div>

          {/* Phone */}
          <Fld label="PHONE NUMBER" field="phone" ph="08X-XXX-XXXX" value={form.phone} error={!!err.phone} onChange={upd} />

          {/* Address */}
          <Fld label="ADDRESS" field="address" ph="House no. Street Soi" area value={form.address} error={!!err.address} onChange={upd} />

          {/* Postal Code */}
          <div>
            <Fld label="POSTAL CODE" field="postalCode" ph="10XXX" maxLen={5} value={form.postalCode} error={!!err.postalCode} onChange={upd} autoTag />
            {/* Hint */}
            {showDropdown && zipResults.length > 0 && (
              <div style={{ fontSize: 10, color: C.orange, marginTop: 4, letterSpacing: "0.03em", fontFamily: FM }}>
                {"↓ Select your sub-district"}
              </div>
            )}
            {/* Dropdown */}
            {showDropdown && zipResults.length > 0 && (
              <div style={{ border: `1.5px solid ${C.orange}`, borderTop: "none", background: C.white }}>
                {zipResults.map((r, i) => (
                  <DropdownItem key={i} label={`${r.subDistrict} / ${r.district}`} onClick={() => pickZipResult(r)} />
                ))}
              </div>
            )}
          </div>

          {/* Sub-district / District */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Fld label="SUB-DISTRICT" field="subDistrict" ph="Sub-district" value={form.subDistrict} error={!!err.subDistrict} onChange={upd} readOnly={isAutoReadonly} autoFilled={isAutoReadonly} />
            <Fld label="DISTRICT" field="district" ph="District" value={form.district} error={!!err.district} onChange={upd} readOnly={isAutoReadonly} autoFilled={isAutoReadonly} />
          </div>

          {/* Province */}
          <Fld label="PROVINCE" field="province" ph="Province" value={form.province} error={!!err.province} onChange={upd} readOnly={isAutoReadonly} autoFilled={isAutoReadonly} />
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
          background: "rgba(255,255,255,0.96)",
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
            borderRadius: 0,
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
