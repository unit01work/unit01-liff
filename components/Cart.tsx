"use client";

import React from "react";
import Image from "next/image";
import { C, FM, fmt } from "@/lib/tokens";
import { BackIcon, BagIcon } from "./Icons";
import { SectHead, BracketChain } from "./MicroGraphics";
import { Qty } from "./Qty";

export interface CartItem {
  cartId: string;
  productId: string;
  variantId: string;
  shopifyVariantId: string;
  name: string;
  size: string;
  color?: string;
  price: number;
  image: string;
  qty: number;
  maxStock: number;
}

export function ScreenCart({
  cart,
  shippingFee = 0,
  onUpdateQty,
  onRemove,
  onBack,
  onCheckout,
}: {
  cart: CartItem[];
  shippingFee?: number;
  onUpdateQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onBack: () => void;
  onCheckout: () => void;
}) {
  const sub = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const cc = cart.reduce((s, c) => s + c.qty, 0);
  const ship = shippingFee;
  const total = sub + ship;

  const hdr = (
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
        CART
      </div>
      <div />
    </div>
  );

  if (!cart.length)
    return (
      <>
        {hdr}
        <div
          style={{
            padding: "64px 22px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 22,
            textAlign: "center",
            flex: 1,
          }}
        >
          <div style={{ color: C.gris }}>
            <BagIcon />
          </div>
          <div
            style={{
              fontFamily: FM,
              fontWeight: 800,
              fontSize: 20,
              textTransform: "uppercase",
              color: C.negro,
            }}
          >
            CART EMPTY
          </div>
          <div
            style={{
              fontFamily: FM,
              fontSize: 9,
              letterSpacing: "0.14em",
              color: C.gris,
              textTransform: "uppercase",
            }}
          >
            {"// NO ITEMS SELECTED"}
          </div>
          <button
            onClick={onBack}
            style={{
              padding: "12px 20px",
              background: "transparent",
              color: C.mist,
              border: `1px solid ${C.mist}`,
              fontFamily: FM,
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
              borderRadius: 2,
              marginTop: 8,
            }}
          >
            CONTINUE SHOPPING
          </button>
        </div>
      </>
    );

  return (
    <>
      {hdr}
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
          {"// "}
          {cc} ITEM{cc > 1 ? "S" : ""}
        </div>

        <SectHead num="02" label="YOUR CART" />
        <div style={{ borderBottom: `1.5px dotted ${C.dis}`, margin: "0 16px" }} />
        <div
          style={{
            padding: "6px 16px 0",
            fontFamily: FM,
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: C.gris,
          }}
        >
          {"// "}
          {cc} ITEM{cc > 1 ? "S" : ""} · SUBTOTAL {fmt(sub)}
        </div>

        <div style={{ padding: "14px 16px 0" }}>
          {cart.map((item) => (
            <div
              key={item.cartId}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr",
                gap: 14,
                padding: "14px 0",
                borderBottom: `1px solid ${C.light}`,
              }}
            >
              <div
                style={{
                  width: 80,
                  aspectRatio: "4/5",
                  background: C.cream,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  sizes="80px"
                  style={{ objectFit: "contain" }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      fontFamily: FM,
                      fontWeight: 700,
                      fontSize: 13,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: C.negro,
                      lineHeight: 1.3,
                    }}
                  >
                    {item.name}
                  </span>
                  <span
                    style={{
                      fontFamily: FM,
                      fontWeight: 500,
                      fontSize: 13,
                      color: C.negro,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmt(item.price)}
                  </span>
                </div>

                <span
                  style={{
                    fontFamily: FM,
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    color: C.gris,
                    textTransform: "uppercase",
                  }}
                >
                  SIZE {item.size}
                  {item.color ? ` · ${item.color.toUpperCase()}` : ""}
                </span>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 4,
                  }}
                >
                  <Qty qty={item.qty} onChange={(q) => onUpdateQty(item.cartId, q)} />
                  <button
                    onClick={() => onRemove(item.cartId)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      fontFamily: FM,
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      color: C.gris,
                      textTransform: "uppercase",
                    }}
                  >
                    REMOVE ×
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div style={{ padding: "18px 16px 0" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 0",
              fontFamily: FM,
              fontSize: 12,
              letterSpacing: "0.06em",
              color: C.mist,
            }}
          >
            <span>SUBTOTAL</span>
            <b style={{ color: C.negro, fontWeight: 500 }}>{fmt(sub)}</b>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 0",
              fontFamily: FM,
              fontSize: 12,
              letterSpacing: "0.06em",
              color: C.mist,
            }}
          >
            <span>SHIPPING</span>
            <b style={{ color: C.negro, fontWeight: 500 }}>{ship > 0 ? fmt(ship) : "FREE"}</b>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: `1px solid ${C.light}`,
              marginTop: 8,
              paddingTop: 16,
              fontFamily: FM,
              fontSize: 14,
              color: C.mist,
            }}
          >
            <span>TOTAL</span>
            <b style={{ color: C.negro, fontWeight: 700, fontSize: 20 }}>{fmt(total)}</b>
          </div>
        </div>

        <div style={{ padding: "24px 16px 20px", display: "flex", justifyContent: "center" }}>
          <BracketChain count={11} size={9} gap={3} color={C.gris} />
        </div>
      </div>

      {/* Bottom buttons */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "transparent",
          borderTop: `1px solid ${C.light}`,
          padding: "12px 16px 14px",
          zIndex: 20,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              padding: "16px 18px",
              background: C.idle,
              color: C.mist,
              border: "none",
              fontFamily: FM,
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
              borderRadius: 2,
            }}
          >
            ← CONTINUE
          </button>
          <button
            onClick={onCheckout}
            style={{
              width: "100%",
              padding: "16px 18px",
              background:
                "linear-gradient(90deg, #111111 0%, #111111 18%, #42272C 38%, #824E39 54%, #D28A3E 72%, #EDBA5F 88%, #F5D280 100%)",
              color: C.cream,
              border: "none",
              fontFamily: FM,
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: "pointer",
              borderRadius: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <span>CHECKOUT</span>
            <span style={{ fontSize: 12 }}>{fmt(total)}</span>
          </button>
        </div>
      </div>
    </>
  );
}
