"use client";

import React, { useState, useCallback } from "react";
import { C, FM, FT } from "@/lib/tokens";
import { BackIcon, CheckIcon } from "./Icons";
import { SectHead, BracketChain } from "./MicroGraphics";
import type { ZipResult } from "@/lib/thai-zipcode";

interface EditFormProps {
  orderId: string;
  initialFirstName: string;
  initialLastName: string;
  initialPhone: string;
  initialAddress: string;
  initialPostalCode: string;
  initialSubDistrict: string;
  initialDistrict: string;
  initialProvince: string;
  onClose: () => void;
}

/* ── Field component outside to prevent focus loss on re-render ── */
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

interface EditFormState {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  postalCode: string;
  subDistrict: string;
  district: string;
  province: string;
}

type SaveState = "idle" | "saving" | "done" | "error";

export function EditForm({
  orderId,
  initialFirstName,
  initialLastName,
  initialPhone,
  initialAddress,
  initialPostalCode,
  initialSubDistrict,
  initialDistrict,
  initialProvince,
  onClose,
}: EditFormProps) {
  const [form, setForm] = useState<EditFormState>({
    firstName: initialFirstName,
    lastName: initialLastName,
    phone: initialPhone,
    address: initialAddress,
    postalCode: initialPostalCode,
    subDistrict: initialSubDistrict,
    district: initialDistrict,
    province: initialProvince,
  });
  const [err, setErr] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [zipResults, setZipResults] = useState<ZipResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [autoFilled, setAutoFilled] = useState(
    !!(initialSubDistrict && initialDistrict && initialProvince)
  );
  const [zipNotFound, setZipNotFound] = useState(false);

  const upd = useCallback((k: string, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    setErr((p) => (p[k] ? { ...p, [k]: false } : p));

    // Auto-fill logic for postal code
    if (k === "postalCode") {
      if (v.length === 5 && /^\d{5}$/.test(v)) {
        import("@/lib/thai-zipcode").then(({ lookupZip }) => {
          const results = lookupZip(v);
          if (results.length === 1) {
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
            setZipResults(results);
            setShowDropdown(true);
            setAutoFilled(false);
            setZipNotFound(false);
            setForm((p) => ({ ...p, subDistrict: "", district: "", province: "" }));
          } else {
            setZipNotFound(true);
            setAutoFilled(false);
            setShowDropdown(false);
            setZipResults([]);
            setForm((p) => ({ ...p, subDistrict: "", district: "", province: "" }));
          }
        });
      } else {
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
    const required: (keyof EditFormState)[] = [
      "firstName", "lastName", "phone", "address", "postalCode",
      "subDistrict", "district", "province",
    ];
    required.forEach((k) => {
      if (!form[k].trim()) e[k] = true;
    });
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

  const isAutoReadonly = autoFilled && !zipNotFound;

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

        {/* Form fields */}
        <div style={{ padding: "20px 16px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
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
            {showDropdown && zipResults.length > 0 && (
              <div style={{ fontSize: 10, color: C.orange, marginTop: 4, letterSpacing: "0.03em", fontFamily: FM }}>
                {"↓ Select your sub-district"}
              </div>
            )}
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

        <div style={{ padding: "0 16px 24px", display: "flex", justifyContent: "center" }}>
          <BracketChain count={11} size={9} gap={3} color={C.gris} />
        </div>
      </div>

      {/* BUTTONS */}
      <div style={{ position: "sticky", bottom: 0, background: "rgba(255,255,255,0.96)", backdropFilter: "blur(16px)", borderTop: `1px solid ${C.light}`, padding: "12px 16px 14px", zIndex: 20, display: "flex", flexDirection: "column", gap: 8 }}>
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
            borderRadius: 0,
            display: "flex",
            justifyContent: "center",
          }}
        >
          {saveState === "saving" ? "SAVING..." : "SAVE CHANGES"}
        </button>
        <button
          onClick={onClose}
          style={{
            width: "100%", padding: "16px 20px",
            background: "none", color: C.mist,
            border: `1.5px solid #D4CFC9`,
            fontFamily: FM, fontWeight: 700, fontSize: 11,
            letterSpacing: "0.15em", textTransform: "uppercase",
            cursor: "pointer", borderRadius: 0,
            textAlign: "center",
          }}
        >
          CANCEL
        </button>
      </div>
    </>
  );
}
