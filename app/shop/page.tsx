"use client";

import React, { useState, useCallback } from "react";
import { C, FM } from "@/lib/tokens";
import type { Product, Variant } from "@/lib/products";
import { useUser } from "@/lib/user-context";
import { ScreenProducts } from "@/components/ScreenProducts";
import { ScreenCart, type CartItem } from "@/components/Cart";
import { ScreenShipping, type ShippingInfo } from "@/components/ShippingForm";
import { ClosingOverlay } from "@/components/ClosingOverlay";

type Screen = "products" | "cart" | "shipping" | "closing";

export default function ShopPage() {
  const { profile } = useUser();
  const [screen, setScreen] = useState<Screen>("products");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderNo, setOrderNo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const addToCart = useCallback((p: Product, v: Variant) => {
    setCart((prev) => {
      const ex = prev.find((c) => c.variantId === v.id);
      if (ex)
        return prev.map((c) =>
          c.variantId === v.id ? { ...c, qty: Math.min(c.qty + 1, v.stock) } : c
        );
      return [
        ...prev,
        {
          cartId: `c-${Date.now()}`,
          productId: p.id,
          variantId: v.id,
          name: p.name,
          size: v.size,
          price: p.price,
          image: p.image,
          qty: 1,
          maxStock: v.stock,
        },
      ];
    });
  }, []);

  const updateQty = useCallback((id: string, q: number) => {
    setCart((p) =>
      p.map((c) => (c.cartId === id ? { ...c, qty: Math.min(q, c.maxStock) } : c))
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setCart((p) => p.filter((c) => c.cartId !== id));
  }, []);

  const handleConfirm = useCallback(
    async (form: ShippingInfo) => {
      if (submitting) return;
      setSubmitting(true);

      try {
        const res = await fetch("/api/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cart: cart.map((c) => ({
              name: c.name,
              size: c.size,
              price: c.price,
              qty: c.qty,
            })),
            shipping: form,
            lineUserId: profile?.userId || "",
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          console.error("Order API error:", data);
          alert("เกิดข้อผิดพลาด กรุณาลองใหม่");
          setSubmitting(false);
          return;
        }

        setOrderNo(data.orderId);
        setScreen("closing");
      } catch (err) {
        console.error("Order submit error:", err);
        alert("เกิดข้อผิดพลาด กรุณาลองใหม่");
        setSubmitting(false);
      }
    },
    [cart, profile, submitting]
  );

  const handleReset = useCallback(async () => {
    setCart([]);
    setScreen("products");
    setOrderNo("");

    try {
      const liff = (await import("@line/liff")).default;
      if (liff.isInClient()) {
        liff.closeWindow();
      }
    } catch {
      // not in LIFF client, just reset
    }
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 430,
        margin: "0 auto",
        minHeight: "100vh",
        background: C.cream,
        color: C.mist,
        fontFamily: FM,
        fontSize: 15,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {screen === "products" && (
        <ScreenProducts
          cart={cart}
          onAdd={addToCart}
          onGoCart={() => setScreen("cart")}
        />
      )}
      {screen === "cart" && (
        <ScreenCart
          cart={cart}
          onUpdateQty={updateQty}
          onRemove={removeItem}
          onBack={() => setScreen("products")}
          onCheckout={() => setScreen("shipping")}
        />
      )}
      {screen === "shipping" && (
        <ScreenShipping
          cart={cart}
          onBack={() => setScreen("cart")}
          onConfirm={handleConfirm}
        />
      )}
      {screen === "closing" && (
        <ClosingOverlay orderNo={orderNo} onReset={handleReset} />
      )}
    </div>
  );
}
