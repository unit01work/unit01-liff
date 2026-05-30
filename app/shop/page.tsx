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

// Loads order data then shows edit form
function EditPageLoader({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<{
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    subDistrict: string;
    district: string;
    province: string;
    postalCode: string;
  } | null>(null);
  const [fetchErr, setFetchErr] = useState(false);

  useEffect(() => {
    fetch(`/api/order/${orderId}`)
      .then((r) => r.json())
      .then((data) => {
        setOrder({
          firstName: data["First Name"] || "",
          lastName: data["Last Name"] || "",
          phone: data["Phone"] || "",
          address: data["Address"] || "",
          subDistrict: data["Sub-district"] || "",
          district: data["District"] || "",
          province: data["Province"] || "",
          postalCode: data["Postal Code"] || "",
        });
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
      initialFirstName={order.firstName}
      initialLastName={order.lastName}
      initialPhone={order.phone}
      initialAddress={order.address}
      initialSubDistrict={order.subDistrict}
      initialDistrict={order.district}
      initialProvince={order.province}
      initialPostalCode={order.postalCode}
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
  const [products, setProducts] = useState<Product[]>([]);
  const [shippingFee, setShippingFee] = useState(50);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Load products from Shopify API
  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products || []);
        if (data.shippingFee != null) setShippingFee(data.shippingFee);
        setLoadingProducts(false);
      })
      .catch((err) => {
        console.error("Failed to load products:", err);
        setLoadingProducts(false);
      });
  }, []);

  const addToCart = useCallback((p: Product, v: Variant) => {
    setCart((prev) => {
      const ex = prev.find((c) => c.variantId === v.id);
      if (ex) return prev.map((c) => c.variantId === v.id ? { ...c, qty: Math.min(c.qty + 1, v.stock) } : c);
      return [...prev, { cartId: `c-${Date.now()}`, productId: p.id, variantId: v.id, shopifyVariantId: v.shopifyVariantId, name: p.name, size: v.size, price: v.price, image: p.image, qty: 1, maxStock: v.stock }];
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
          cart: cart.map((c) => ({ name: c.name, size: c.size, price: c.price, qty: c.qty, shopifyVariantId: c.shopifyVariantId })),
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

  if (loadingProducts) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: C.cream, flexDirection: "column", gap: 16 }}>
        <div style={{ width: 24, height: 24, border: `2px solid ${C.bdr}`, borderTopColor: C.mist, borderRadius: "50%", animation: "spin 800ms linear infinite" }} />
        <div style={{ fontFamily: FM, fontSize: 10, color: C.gris, letterSpacing: "0.14em", textTransform: "uppercase" }}>LOADING PRODUCTS...</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <>
      {screen === "products" && <ScreenProducts products={products} cart={cart} onAdd={addToCart} onGoCart={() => setScreen("cart")} />}
      {screen === "cart" && <ScreenCart cart={cart} shippingFee={shippingFee} onUpdateQty={updateQty} onRemove={removeItem} onBack={() => setScreen("products")} onCheckout={() => setScreen("shipping")} />}
      {screen === "shipping" && <ScreenShipping cart={cart} shippingFee={shippingFee} onBack={() => setScreen("cart")} onConfirm={handleConfirm} />}
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
