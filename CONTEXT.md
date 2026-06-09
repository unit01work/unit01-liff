# UNIT-01 — ข้อมูลกลาง (CONTEXT)
> ไฟล์นี้คือข้อมูลกลางที่ทุกแชท Claude Code ต้องอ่านก่อนเริ่มงาน
> เก็บไว้ที่ root ของโปรเจกต์: `/Users/neo/Desktop/unit01-liff/CONTEXT.md`
> **ห้ามใส่ API key/token จริงในไฟล์นี้** — ค่าจริงอยู่ใน `.env.local` (Claude Code อ่านเองได้)

---

## ภาพรวมโปรเจกต์
UNIT-01 = ร้านขายเสื้อสตรีทแวร์ ขายผ่าน LINE (LIFF) ลูกค้าสั่งซื้อในแชท จ่ายผ่าน PromptPay QR ส่งสลิป ระบบตรวจอัตโนมัติ แล้วสร้างออเดอร์ใน Shopify

### Flow หลัก
```
ลูกค้าเปิด LIFF → เลือกสินค้า (ดึงจาก Shopify) → กรอกที่อยู่
  → บันทึก Google Sheets (PENDING) → ส่ง Flex + QR PromptPay
  → ลูกค้าจ่าย + ส่งสลิป → SlipOK ตรวจ → PAID
  → สร้าง Shopify Order (หักสต็อกอัตโนมัติ)
  → ถ้าไม่จ่ายใน 5 นาที → auto-cancel (EXPIRED) + คืนสต็อก
```

---

## Tech Stack
- **Frontend/Backend:** Next.js (App Router, TypeScript) บน Vercel
- **Repo:** github.com/unit01work/unit01-liff (auto-deploy เมื่อ push main)
- **LINE:** LIFF + Messaging API
- **Shopify:** Admin API (ร้าน uqv71h-wf.myshopify.com / unit-01official.com)
- **DB:** Google Sheets "UNIT-01 Orders"
- **ตรวจสลิป:** SlipOK
- **จ่ายเงิน:** PromptPay QR

---

## Environment Variables (ค่าจริงอยู่ใน .env.local — ห้ามเขียนค่าจริงที่นี่)
| ตัวแปร | ใช้ทำอะไร |
|--------|-----------|
| NEXT_PUBLIC_LIFF_ID | LIFF app id |
| LINE_CHANNEL_ID | Messaging API channel id |
| LINE_CHANNEL_ACCESS_TOKEN | ส่งข้อความ/Flex ผ่าน LINE |
| LINE_CHANNEL_SECRET | ตรวจ signature webhook |
| SHOPIFY_STORE | โดเมนร้าน (uqv71h-wf.myshopify.com) |
| SHOPIFY_ADMIN_API_TOKEN | เรียก Shopify Admin API (shpat_... จากแอป LIFF Integration) |
| GOOGLE_SHEETS_ID | ID ไฟล์ Sheets |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | service account |
| GOOGLE_PRIVATE_KEY | กุญแจ service account |
| SLIPOK_BRANCH_ID | สาขา SlipOK |
| SLIPOK_API_KEY | API key SlipOK |
| PROMPTPAY_ID | เลขพร้อมเพย์รับเงิน |
| SHIPPING_FEE | ค่าส่ง (50) |
| CRON_SECRET | กันคนอื่นเรียก /api/check-expired |

> ถ้าต้องการค่าจริง: `cat .env.local` หรือดู backup ที่ `Desktop/unit01-liff-backup/02-ENV-VARIABLES/`
> หมายเหตุ Vercel: ฝั่ง Vercel ใช้ `GOOGLE_PRIVATE_KEY_BASE64` (base64) แทน `GOOGLE_PRIVATE_KEY` และมี `SHOPIFY_CLIENT_SECRET` เพิ่ม

---

## Shopify
- ร้านจริง: **uqv71h-wf.myshopify.com** (admin slug: unit-01-2, โดเมน: unit-01official.com)
- แอปที่ใช้จริง: **LIFF Integration** — token เป็น `shpat_...` (Admin API access token จาก OAuth install) ติดตั้งบนร้านนี้แล้ว **อย่าถอน**
- **อย่าใช้ `atkn_...`** (token จาก Dev Dashboard automation) — ใช้ไม่ได้ จะได้ 401
- Scopes: read_products, read_inventory, read/write draft_orders, read/write orders
- API version ที่ใช้: 2026-04
- **สำคัญ:** order ที่สร้างต้องเก็บ Real Order ID (order_id) ไม่ใช่ Draft ID — ออเดอร์เก่าก่อนแก้บัคนี้จะอัพเดทที่อยู่ใน Shopify ไม่ได้
- แก้ที่อยู่ Shopify: ใช้ GraphQL `orderUpdate` ส่ง `provinceCode` (ISO 3166-2:TH เช่น TH-10, TH-41) ไม่ใช่ `province`

### สินค้า (Variant IDs)
**01 Training Oversize Tee** (PROTOTYPE-01 TEE) ฿1,800
- S: 49705473048813 · M: 49705473081581 · L: 49705473114349

**01 Outline Tee** ฿2,200
- S: 49982772248813 · M: 49982772281581 · L: 49982772314349

- สินค้ามี metafield **SIZECHART** (รูป size guide) — ใช้ส่งตอน Change size

---

## Google Sheets "UNIT-01 Orders"
### Tab "Orders" (คอลัมน์)
Order ID, Date, LINE User ID, Status (PENDING/PAID/SHIPPED/EXPIRED), Items, Subtotal, Shipping Fee, Total, First Name, Last Name, Phone, Address, Sub-district, District, Province, Postal Code, Updated At, Variant IDs, Shopify Order ID, Transaction Ref, Paid At, Address Changed (YES/NO), Size Changed (YES/NO)

### Tab "Stock" (กำลังทำ — ภาพรวม)
Product, Size, Variant ID, Shopify Stock, Reserved (PENDING), Available, Sold (PAID), Last Updated

### Tab "Stock Log" (กำลังทำ — ประวัติ)
Date, Type (RESERVED/SOLD/RETURNED/RESTOCK), Product, Size, Variant ID, Change, Stock After, Order ID, Note

> Finance เป็นไฟล์แยก (UNIT-01 expense-template) มี tab REVENUE อยู่แล้ว — ยังไม่เชื่อม รอทำทีหลัง

---

## กฎสำคัญของระบบ (Business Logic)
- สต็อกที่โชว์ในเว็บ = Shopify stock − PENDING orders (soft-reserve)
- Shopify Order สร้างหลังจ่ายเงินเท่านั้น (ไป Orders ตรงๆ ไม่ใช่ Draft)
- สลิปจับคู่ด้วย LINE userId + ยอดเงิน, กัน transRef ซ้ำ, จับ PENDING เก่าสุดก่อน, tolerance ±0.90
- Edit ที่อยู่ได้ 1 ครั้ง / Change size ได้ 1 ครั้ง (แยกอิสระ) — ใช้แล้วล็อค (Address Changed / Size Changed = YES)
- ออเดอร์จัดส่งแล้ว แก้ไม่ได้ทุกอย่าง
- Auto-cancel: PENDING เกิน 5 นาที → EXPIRED + คืนสต็อก (cron-job.org เรียก /api/check-expired ทุก 1 นาที)
- QR เป็น static — กันด้วยการ reject สลิปของออเดอร์ EXPIRED

---

## Design Language
- Techno-Brutalist มินิมอล, ฟอนต์ **monospace** ทุกที่, letter-spacing กว้าง
- พื้นขาว #FFFFFF, header Flex #E5E0DD, auto-fill field #E5E0DD
- ส้ม accent #C47237, แดง danger/cancel #C44A3A
- เลขแบบ `[ 1 ]` (วงเล็บเหลี่ยม)
- UI ภาษาอังกฤษ, ข้อมูลที่ลูกค้ากรอกภาษาไทย
- **ไม่มี emoji** ในข้อความยืนยัน
- ยืนยันแล้วเติม `[ Confirmed ]` ต่อท้ายหัวข้อ
- LINE Flex รองรับแค่ฟอนต์ sans-serif/serif/monospace (Magda Clean Mono ใช้ใน Flex ไม่ได้)

---

## Contact Us System (เสร็จแล้ว)
Flex 4 ปุ่ม: `[ 1 ]` Edit shipping address · `[ 2 ]` Change size · `[ 3 ]` Track my order · `[ 4 ]` Chat with team (ไม่มี Cancel)
- กดจาก Flex ออเดอร์ (มี orderId) → ทำเลย
- กดจาก Rich Menu (ไม่มี orderId) → แสดง SELECT ORDER เสมอ (แม้มี 1 ออเดอร์), แสดงเฉพาะ PAID + unfulfilled, ไม่มี → "No paid orders found."
- Change size: ส่ง available sizes → รูป SIZECHART → Flex เลือก size + เตือน "change once only"

---

## สถานะระบบ (อัพเดทล่าสุด)
**เสร็จแล้ว:** LIFF shop ดึง Shopify, order→Sheets, returning customer auto-fill, Flex+QR, SlipOK→PAID, Shopify Order auto-create, Thai zip auto-fill, Contact Us ครบ, lock system, pre-order/reorder flow, auto-cancel 5 นาที (cron-job.org), backup folder, GitHub auto-deploy
**กำลังทำ:** Stock + Stock Log tabs
**รอทำ:** Finance/REVENUE เชื่อม, Platform Fee, ต้นทุน/กำไร, Admin Dashboard, Custom Domain, Rich Menu เต็มรูปแบบ

---

## การแบ่งงาน 3 แชท (กันชนกัน)
| แชท | ขอบเขต | ห้ามแตะ |
|-----|--------|---------|
| **แก้โค้ดในไลน์** (หลัก) | LINE webhook/flex/bot, เว็บ LIFF, deploy Vercel, หลังบ้าน, Shopify API (order/ที่อยู่/stock), ข้อมูลกลาง, backup | ธีมหน้าตา Shopify, ระบบบัญชี |
| **Code shopify** | ปรับแต่งหน้าตาเว็บไซต์ + ธีม Shopify | logic หลังบ้าน LINE, Google Sheets |
| **code excel** | ระบบบัญชี/Finance bot, รายจ่ายบริษัท, คำนวณต้นทุน, chatbot รายงานบัญชี | LIFF shop, order flow, ธีม Shopify |

### กฎทำงานร่วมกัน
1. ทุกแชทอ่าน CONTEXT.md นี้ก่อนเริ่ม
2. แก้ไฟล์เฉพาะในขอบเขตตัวเอง ถ้าต้องแตะไฟล์ข้ามโซน → แจ้งก่อน
3. push GitHub ทุกครั้งหลังแก้เสร็จ (จะได้ไม่ทับงานกัน)
4. pull ก่อนเริ่มงานใหม่เสมอ (git pull) เผื่อแชทอื่นแก้ไป
5. ถ้าแก้อะไรที่กระทบ CONTEXT.md (เพิ่ม env, เปลี่ยน schema) → อัพเดท CONTEXT.md ด้วย
