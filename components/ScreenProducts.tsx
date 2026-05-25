"use client";

import React, { useState } from "react";
import Image from "next/image";
import { C, FM, fmt } from "@/lib/tokens";
import { PRODUCTS, Product, Variant } from "@/lib/products";
import { CartIcon, CloseIcon } from "./Icons";
import { BracketChain, SectHead, MicroDiv, PageStamp } from "./MicroGraphics";
import { SizeBtn } from "./SizeSelector";
import { Toast } from "./Toast";

interface CartItem {
  cartId: string;
  productId: string;
  variantId: string;
  name: string;
  size: string;
  price: number;
  image: string;
  qty: number;
  maxStock: number;
}

export function ScreenProducts({
  cart,
  onAdd,
  onGoCart,
}: {
  cart: CartItem[];
  onAdd: (p: Product, v: Variant) => void;
  onGoCart: () => void;
}) {
  const [sel, setSel] = useState<Record<string, string | null>>({});
  const [toast, setToast] = useState<string | null>(null);
  const cc = cart.reduce((s, c) => s + c.qty, 0);

  const handleAdd = (p: Product) => {
    const v = p.variants.find((v) => v.id === sel[p.id]);
    if (!v || v.stock <= 0) return;
    onAdd(p, v);
    setToast(`${v.size} · ${p.name}`);
    setSel((s) => ({ ...s, [p.id]: null }));
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
          gridTemplateColumns: "44px 1fr 48px",
          alignItems: "center",
          height: 52,
        }}
      >
        <button
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
          <CloseIcon />
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img
            src="/unit01-logo.png"
            alt="UNIT-01"
            style={{ height: 12, width: "auto", display: "block" }}
          />
        </div>
        <div />
      </div>

      {/* FLOATING CART BUTTON */}
      <div style={{ position: "fixed", top: 10, right: 10, zIndex: 50 }} onClick={onGoCart}>
        <button
          style={{
            width: 48,
            height: 48,
            background: "rgba(244,239,236,0.92)",
            backdropFilter: "blur(12px)",
            border: `1px solid ${C.bdr}`,
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.negro,
            borderRadius: 4,
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          <CartIcon size={24} />
        </button>
        {cc > 0 && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              background: C.orange,
              color: C.white,
              fontFamily: FM,
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 6px",
              minWidth: 16,
              textAlign: "center",
              lineHeight: "14px",
              borderRadius: 2,
            }}
          >
            {cc}
          </span>
        )}
      </div>

      {/* SCROLLABLE */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: C.cream }}>
        {PRODUCTS.map((p, idx) => {
          const sv = sel[p.id];
          const variant = p.variants.find((v) => v.id === sv);
          const canAdd = sv && variant && variant.stock > 0;
          return (
            <div key={p.id}>
              <SectHead num={String(idx + 1).padStart(2, "0")} label="PRODUCT" />
              <div style={{ borderBottom: `1.5px dotted ${C.dis}`, margin: "0 16px" }} />
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "12px 16px 4px",
                  color: C.gris,
                }}
              >
                <BracketChain count={11} size={9} gap={3} color={C.gris} />
              </div>

              {/* Image */}
              <div
                style={{
                  margin: "4px 16px 0",
                  position: "relative",
                  aspectRatio: "4/5",
                  background: C.cream,
                  overflow: "hidden",
                }}
              >
                <Image
                  src={p.image}
                  alt={p.name}
                  fill
                  sizes="(max-width: 430px) calc(100vw - 32px), 398px"
                  style={{ objectFit: "cover" }}
                  priority={idx === 0}
                />
                <span
                  style={{
                    position: "absolute",
                    top: 10,
                    left: 10,
                    fontFamily: FM,
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    color: "rgba(255,255,255,0.85)",
                    textTransform: "uppercase",
                  }}
                >
                  {p.lot}
                </span>
                {p.badge && (
                  <span
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      fontFamily: FM,
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      padding: "3px 8px",
                      background: C.orange,
                      color: C.white,
                      textTransform: "uppercase",
                      fontWeight: 700,
                    }}
                  >
                    {p.badge}
                  </span>
                )}
              </div>

              {/* Name + Price */}
              <div
                style={{
                  padding: "14px 16px 0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: FM,
                    fontWeight: 900,
                    fontSize: 16,
                    lineHeight: 1.2,
                    letterSpacing: "0.6px",
                    textTransform: "uppercase",
                    color: "#4e4141",
                  }}
                >
                  {p.name}
                </span>
                <span
                  style={{
                    fontFamily: FM,
                    fontWeight: 500,
                    fontSize: 16,
                    letterSpacing: "0.02em",
                    color: C.negro,
                    whiteSpace: "nowrap",
                  }}
                >
                  {fmt(p.price)}
                </span>
              </div>

              <div style={{ padding: "0 16px" }}>
                <MicroDiv />
              </div>

              <div
                style={{
                  fontFamily: FM,
                  fontSize: 9,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: C.gris,
                  padding: "14px 16px 8px",
                }}
              >
                {"// SELECT SIZE"}
              </div>

              {/* Size buttons — 28px height */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4,1fr)",
                  gap: 6,
                  padding: "0 16px 14px",
                }}
              >
                {p.variants.map((v) => (
                  <SizeBtn
                    key={v.id}
                    label={v.size}
                    sel={sv === v.id}
                    dis={v.stock <= 0}
                    onClick={() => setSel((s) => ({ ...s, [p.id]: v.id }))}
                  />
                ))}
              </div>

              {/* Add to Cart Button */}
              <div style={{ padding: "0 16px" }}>
                <button
                  onClick={() => canAdd && handleAdd(p)}
                  style={{
                    width: "100%",
                    padding: "14px 18px",
                    background: canAdd ? C.mist : C.light,
                    color: canAdd ? C.cream : C.gris,
                    border: "none",
                    fontFamily: FM,
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    cursor: canAdd ? "pointer" : "default",
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: canAdd ? "space-between" : "flex-start",
                    transition: "all 200ms ease",
                  }}
                >
                  <span>{canAdd ? "ADD TO CART" : "SELECT A SIZE"}</span>
                  {canAdd && <span style={{ fontSize: 11, opacity: 0.7 }}>{fmt(p.price)}</span>}
                </button>
              </div>
              {idx < PRODUCTS.length - 1 && <div style={{ height: 20 }} />}
            </div>
          );
        })}

        {/* FOOTER */}
        <div
          style={{
            padding: "20px 16px 32px",
            borderTop: `1px solid ${C.light}`,
            marginTop: 16,
          }}
        >
          <PageStamp color={C.gris} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 12,
              fontFamily: FM,
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: C.gris,
            }}
          >
            <span>{"[ 001/001 ]"}</span>
            <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>{">>>>"}</span>
          </div>
        </div>
      </div>
      {toast && <Toast msg={`ADDED · ${toast}`} onClose={() => setToast(null)} />}
      <style>{`@keyframes toastIn{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </>
  );
}
