"use client";

import React, { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { C, FM } from "@/lib/tokens";
import type { Product, Variant } from "@/lib/products";
import { useUser } from "@/lib/user-context";
import { ScreenProducts } from "@/components/ScreenProducts";
import { ScreenCart, type CartItem } from "@/components/Cart";
import { ScreenShipping, type ShippingInfo } from "@/components/ShippingForm";
import { ClosingOverlay } from "@/components/ClosingOverlay";
import { EditForm } from "@/components/EditForm";

type Screen = "products" | "cart" | "shipping" | "closing";

function ShopPageInner() {
  const searchParams = useSearchParams();
  const page = searchParams.get("page");
  const editOrderId = searchParams.get("order");

  // Edit mode: ?page=edit&order=UT-XXXXXX
  if (page === "edit" && editOrderId) {
    return <EditPageLoader orderId={editOrderId} />;
  }

  return <ShopFlow />;
}

// Parse "address, city zip" back into separate fields
function parseAddress(full: string): { address: string; city: string; zip: string } {
  const m = full.match(/^(.+),\s*(.+?)\s+(\d{5})\s*$/);
  if (m) return { address: m[1].trim(), city: m[2].trim(), zip: m[3].trim() };
  return { address: full, city: "", zip: "" };
}

// Loads order data then shows edit form
function EditPageLoader({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<{ Name: string; Phone: string; Address: string; City: string; Zip: string } | null>(null);
  const [fetchErr, setFetchErr] = useState(false);

  useEffect(() => {
    fetch(`/api/order/${orderId}`)
      .then((r) => r.json())
      .then((data) => {
        const { address, city, zip } = parseAddress(data["Address"] || "");
        setOrder({ Name: data["Name"] || "", Phone: data["Phone"] || "", Address: address, City: city, Zip: zip });
        setLoading(false);
      })
      .catch(() => { setFetchErr(true); setLoading(false); });
  }, [orderId]);

  const handleClose = async () => {
    try {
      const liff = (await import("@line/liff")).default;
      if (liff.isInClient()) { liff.closeWindow(); return; }
    } catch { /* not in LIFF */ }
    window.history.back();
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: C.cream, flexDirection: "column", gap: 16 }}>
        <div style={{ width: 24, height: 24, border: `2px solid ${C.bdr}`, borderTopColor: C.mist, borderRadius: "50%", animation: "spin 800ms linear infinite" }} />
        <div style={{ fontFamily: FM, fontSize: 10, color: C.gris, letterSpacing: "0.14em", textTransform: "uppercase" }}>LOADING...</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (fetchErr || !order) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: C.cream, flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: FM, fontSize: 11, color: C.err, letterSpacing: "0.12em", textTransform: "uppercase" }}>Order not found</div>
        <button onClick={handleClose} style={{ fontFamily: FM, fontSize: 10, color: C.gris, background: "none", border: `1px solid ${C.bdr}`, padding: "10px 20px", cursor: "pointer", borderRadius: 2, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          CLOSE
        </button>
      </div>
    );
  }

  return (
    <EditForm
      orderId={orderId}
      initialName={order.Name}
      initialPhone={order.Phone}
      initialAddress={order.Address}
      initialCity={order.City}
      initialZip={order.Zip}
      onClose={handleClose}
    />
  );
}

// Main shop flow
function ShopFlow() {
  const { profile } = useUser();
  const [screen, setScreen] = useState<Screen>("products");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderNo, setOrderNo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const addToCart = useCallback((p: Product, v: Variant) => {
    setCart((prev) => {
      const ex = prev.find((c) => c.variantId === v.id);
      if (ex) return prev.map((c) => c.variantId === v.id ? { ...c, qty: Math.min(c.qty + 1, v.stock) } : c);
      return [...prev, { cartId: `c-${Date.now()}`, productId: p.id, variantId: v.id, name: p.name, size: v.size, price: p.price, image: p.image, qty: 1, maxStock: v.stock }];
    });
  }, []);

  const updateQty = useCallback((id: string, q: number) => {
    setCart((p) => p.map((c) => c.cartId === id ? { ...c, qty: Math.min(q, c.maxStock) } : c));
  }, []);

  const removeItem = useCallback((id: string) => {
    setCart((p) => p.filter((c) => c.cartId !== id));
  }, []);

  const handleConfirm = useCallback(async (form: ShippingInfo) => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart: cart.map((c) => ({ name: c.name, size: c.size, price: c.price, qty: c.qty })),
          shipping: form,
          lineUserId: profile?.userId || "",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert("เกิดข้อผิดพลาด กรุณาลองใหม่");
        setSubmitting(false);
        return;
      }

      setOrderNo(data.orderId);
      setScreen("closing");
    } catch {
      alert("เกิดข้อผิดพลาด กรุณาลองใหม่");
      setSubmitting(false);
    }
  }, [cart, profile, submitting]);

  const handleReset = useCallback(() => {
    setCart([]);
    setScreen("products");
    setOrderNo("");
    setSubmitting(false);
  }, []);

  return (
    <>
      {screen === "products" && <ScreenProducts cart={cart} onAdd={addToCart} onGoCart={() => setScreen("cart")} />}
      {screen === "cart" && <ScreenCart cart={cart} onUpdateQty={updateQty} onRemove={removeItem} onBack={() => setScreen("products")} onCheckout={() => setScreen("shipping")} />}
      {screen === "shipping" && <ScreenShipping cart={cart} onBack={() => setScreen("cart")} onConfirm={handleConfirm} />}
      {screen === "closing" && <ClosingOverlay orderNo={orderNo} onReset={handleReset} />}
    </>
  );
}

export default function ShopPage() {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: C.cream, color: C.mist, fontFamily: FM, fontSize: 15, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Suspense fallback={null}>
        <ShopPageInner />
      </Suspense>
    </div>
  );
}
