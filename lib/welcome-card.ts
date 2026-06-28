/**
 * UNIT-01 — LINE Welcome Card (Concept C, white) Flex message.
 *
 * Built from the Claude Design handoff (`handoff/flex-message.json`). Every
 * visual element is a hosted PNG (Flex can't render the Magda font / tracking);
 * the ONLY native text is the greeting, which carries the dynamic name.
 *
 * Assets live in `public/welcome/` → served at /welcome/*.png on the prod domain.
 * Fired on the `follow` event (new friend / unblock) — see app/api/webhook/route.ts.
 */

const ASSET_BASE = "https://unit01-liff.vercel.app/welcome";

/**
 * Build the welcome Flex message for a given display name.
 * `displayName` comes from the LINE profile API; falls back to "there".
 */
export function buildWelcomeCard(displayName: string) {
  const name = (displayName || "there").trim() || "there";
  return {
    type: "flex" as const,
    altText: "Welcome to UNIT-01",
    contents: {
      type: "bubble" as const,
      size: "kilo" as const,
      body: {
        type: "box" as const,
        layout: "vertical" as const,
        backgroundColor: "#FFFFFF",
        paddingAll: "0px",
        contents: [
          {
            type: "box" as const,
            layout: "vertical" as const,
            paddingStart: "20px",
            paddingEnd: "20px",
            paddingTop: "20px",
            contents: [
              {
                type: "image" as const,
                url: `${ASSET_BASE}/unit01-wordmark-black.png`,
                size: "104px",
                aspectMode: "fit" as const,
                aspectRatio: "3212:418",
                align: "start" as const,
              },
            ],
          },
          {
            type: "box" as const,
            layout: "vertical" as const,
            paddingStart: "20px",
            paddingEnd: "20px",
            paddingTop: "16px",
            spacing: "none" as const,
            contents: [
              {
                type: "image" as const,
                url: `${ASSET_BASE}/unit01-tag-access-granted.png`,
                size: "118px",
                aspectMode: "fit" as const,
                aspectRatio: "327:33",
                align: "start" as const,
              },
              {
                type: "text" as const,
                text: `Hi ${name}`,
                weight: "bold" as const,
                size: "xl" as const,
                color: "#16171C",
                wrap: true,
                margin: "md" as const,
              },
              {
                type: "image" as const,
                url: `${ASSET_BASE}/unit01-body-lines.png`,
                size: "full",
                aspectMode: "fit" as const,
                aspectRatio: "720:174",
                align: "start" as const,
                margin: "md" as const,
              },
            ],
          },
          {
            type: "box" as const,
            layout: "vertical" as const,
            paddingStart: "20px",
            paddingEnd: "20px",
            paddingTop: "8px",
            paddingBottom: "18px",
            contents: [
              {
                type: "image" as const,
                url: `${ASSET_BASE}/unit01-footer-index.png`,
                size: "full",
                aspectMode: "fit" as const,
                aspectRatio: "780:126",
              },
            ],
          },
        ],
      },
    },
  };
}

/**
 * Product-feature images sent to a new friend right after the welcome card.
 * Two DUALFLOW™ performance-fabric infographics (front feature breakdown +
 * back BASE-01 reflective / run-number). Hosted alongside the card assets in
 * `public/welcome/`. LINE image messages need an HTTPS original + a smaller
 * preview thumbnail; both are pre-sized JPEGs (original ≤4096px / ≤10MB,
 * preview ≤1MB) so LINE renders them reliably.
 */
export function buildWelcomeImages() {
  const img = (file: string) => ({
    type: "image" as const,
    originalContentUrl: `${ASSET_BASE}/${file}.jpg`,
    previewImageUrl: `${ASSET_BASE}/${file}-preview.jpg`,
  });
  return [img("feature-06"), img("feature-07")];
}
