import { NextResponse } from "next/server";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

export async function GET() {
  const results: Record<string, unknown> = {};

  // Step 1: Check env vars exist
  const sheetsId = process.env.GOOGLE_SHEETS_ID || "";
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
  const b64Key = process.env.GOOGLE_PRIVATE_KEY_BASE64 || "";

  results["env_SHEETS_ID"] = sheetsId ? `✅ set (${sheetsId.slice(0, 8)}...)` : "❌ MISSING";
  results["env_SERVICE_ACCOUNT_EMAIL"] = email ? `✅ ${email}` : "❌ MISSING";
  results["env_PRIVATE_KEY_length"] = rawKey.length;
  results["env_PRIVATE_KEY_BASE64_length"] = b64Key.length;
  results["env_PRIVATE_KEY_has_literal_backslash_n"] = rawKey.includes("\\n");
  results["env_PRIVATE_KEY_has_real_newline"] = rawKey.includes("\n");
  results["env_PRIVATE_KEY_has_BEGIN"] = rawKey.includes("-----BEGIN PRIVATE KEY-----");

  // Step 2: Process key — prefer Base64
  let processedKey: string;
  try {
    if (b64Key) {
      const decoded = Buffer.from(b64Key, "base64").toString("utf-8");
      processedKey = decoded.includes("\\n") ? decoded.split("\\n").join("\n") : decoded;
      results["key_strategy"] = "✅ using GOOGLE_PRIVATE_KEY_BASE64";
    } else if (rawKey.includes("\\n")) {
      processedKey = rawKey.split("\\n").join("\n");
      results["key_strategy"] = "split on literal \\n";
    } else if (rawKey.includes("\n")) {
      processedKey = rawKey;
      results["key_strategy"] = "already has real newlines";
    } else {
      processedKey = rawKey;
      results["key_strategy"] = "no newlines found at all — KEY IS LIKELY BROKEN";
    }

    // Verify key format after processing
    const lines = processedKey.split("\n").filter((l) => l.trim());
    results["key_processed_line_count"] = lines.length;
    results["key_processed_first_line"] = lines[0] || "(empty)";
    results["key_processed_last_line"] = lines[lines.length - 1] || "(empty)";
  } catch (e) {
    results["key_processing_error"] = String(e);
    return NextResponse.json(results, { status: 500 });
  }

  // Step 3: Try to create JWT auth
  try {
    const auth = new JWT({
      email,
      key: processedKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    results["jwt_created"] = "✅";

    // Step 4: Try to get access token (this actually tests the key)
    try {
      const token = await auth.authorize();
      results["jwt_authorize"] = token.access_token ? "✅ got access token" : "❌ no access token";
    } catch (authErr) {
      results["jwt_authorize"] = `❌ ${String(authErr)}`;
      return NextResponse.json(results, { status: 500 });
    }

    // Step 5: Try to open the spreadsheet
    try {
      const doc = new GoogleSpreadsheet(sheetsId, auth);
      await doc.loadInfo();
      results["spreadsheet_title"] = doc.title;
      results["spreadsheet_loaded"] = "✅";

      // Step 6: Try to get/create Orders sheet
      let sheet = doc.sheetsByTitle["Orders"];
      if (!sheet) {
        results["orders_sheet"] = "Not found — creating...";
        const headers = [
          "Order ID", "Date", "LINE User ID", "Status",
          "Items", "Subtotal", "Shipping", "Total",
          "Name", "Phone", "Address", "Updated At",
        ];
        sheet = await doc.addSheet({ title: "Orders", headerValues: headers });
        results["orders_sheet_created"] = "✅";
      } else {
        results["orders_sheet"] = "✅ found";
        try {
          await sheet.loadHeaderRow();
          results["orders_headers"] = sheet.headerValues;
        } catch {
          results["orders_headers"] = "No headers — setting...";
          await sheet.setHeaderRow([
            "Order ID", "Date", "LINE User ID", "Status",
            "Items", "Subtotal", "Shipping", "Total",
            "Name", "Phone", "Address", "Updated At",
          ]);
          results["orders_headers_set"] = "✅";
        }
      }

      // Step 7: Write a test row
      const now = new Date().toISOString().slice(0, 16);
      await sheet.addRow({
        "Order ID": "#TEST-" + Date.now().toString(36).toUpperCase().slice(-4),
        "Date": now,
        "LINE User ID": "TEST",
        "Status": "TEST",
        "Items": "Test item x1",
        "Subtotal": 100,
        "Shipping": 50,
        "Total": 150,
        "Name": "Test User",
        "Phone": "000-000-0000",
        "Address": "Test Address",
        "Updated At": now,
      });
      results["test_row_written"] = "✅ SUCCESS — Check your Google Sheet!";

    } catch (sheetErr) {
      results["spreadsheet_error"] = String(sheetErr);
    }
  } catch (jwtErr) {
    results["jwt_error"] = String(jwtErr);
  }

  return NextResponse.json(results, { status: 200 });
}
