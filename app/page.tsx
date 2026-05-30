"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { C, FM } from "@/lib/tokens";
import { useUser } from "@/lib/user-context";

// Preserve query params from current URL when redirecting to /shop
function shopUrl(): string {
  if (typeof window === "undefined") return "/shop";
  const qs = window.location.search;
  return qs ? `/shop${qs}` : "/shop";
}

export default function Home() {
  const router = useRouter();
  const { setProfile } = useUser();
  const [status, setStatus] = useState("กำลังเปิด UNIT-01 Shop...");
  const [error, setError] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });

        if (!liff.isLoggedIn()) {
          setStatus("กำลัง login...");
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        setProfile({
          userId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
        });

        setStatus("สำเร็จ — กำลังเปิดร้านค้า...");
        router.replace(shopUrl());
      } catch (e) {
        console.error("LIFF init error:", e);
        setError(true);
        setStatus("ไม่สามารถเชื่อมต่อ LIFF ได้");
        setTimeout(() => router.replace(shopUrl()), 1500);
      }
    }
    init();
  }, [router, setProfile]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: C.cream,
        color: C.mist,
        fontFamily: FM,
        padding: 24,
        textAlign: "center",
        gap: 16,
      }}
    >
      <img
        src="/unit01-logo.png"
        alt="UNIT-01"
        style={{ height: 16, width: "auto", marginBottom: 8 }}
      />
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: error ? C.err : C.gris,
        }}
      >
        {status}
      </div>
      {!error && (
        <div
          style={{
            width: 24,
            height: 24,
            border: `2px solid ${C.bdr}`,
            borderTopColor: C.mist,
            borderRadius: "50%",
            animation: "spin 800ms linear infinite",
          }}
        />
      )}
      {error && (
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.12em",
            color: C.gris,
            textTransform: "uppercase",
          }}
        >
          {"// กำลังเปิดร้านค้าแบบ standalone..."}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
