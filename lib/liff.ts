import liff from "@line/liff";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || "2010192572-jfj8ev6c";

export async function initLiff() {
  await liff.init({ liffId: LIFF_ID });

  if (!liff.isLoggedIn()) {
    liff.login();
    return null;
  }

  const profile = await liff.getProfile();
  return profile;
}

export function closeLiff() {
  if (liff.isInClient()) {
    liff.closeWindow();
  }
}

export async function sendOrderMessage(orderText: string) {
  if (liff.isInClient()) {
    await liff.sendMessages([
      {
        type: "text",
        text: orderText,
      },
    ]);
  }
}

export { liff };
