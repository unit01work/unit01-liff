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
| CRON_SECRET | กันคนอื่นเรียก cron endpoints (/api/check-expired, /api/reconcile, /api/scope-check, /api/daily-pull, /api/daily-pull-heartbeat) — ส่งเป็น `Authorization: Bearer <secret>` หรือ `?key=<secret>` |
| ADMIN_LINE_USER_ID | (ออปชัน) LINE userId รับแจ้งเตือน daily-pull — ไม่ตั้งจะ fallback `OWNER_LINE_USER_ID` |

> ถ้าต้องการค่าจริง: `cat .env.local` หรือดู backup ที่ `Desktop/unit01-liff-backup/02-ENV-VARIABLES/`
> หมายเหตุ Vercel: ฝั่ง Vercel ใช้ `GOOGLE_PRIVATE_KEY_BASE64` (base64) แทน `GOOGLE_PRIVATE_KEY` และมี `SHOPIFY_CLIENT_SECRET` เพิ่ม

---

## Shopify
- ร้านจริง: **uqv71h-wf.myshopify.com** (admin slug: unit-01-2, โดเมน: unit-01official.com)
- แอปที่ใช้จริง: **LIFF Integration** — token เป็น `shpat_...` (Admin API access token จาก OAuth install) ติดตั้งบนร้านนี้แล้ว **อย่าถอน**
- **อย่าใช้ `atkn_...`** (token จาก Dev Dashboard automation) — ใช้ไม่ได้ จะได้ 401
- Scopes: read_products, read_inventory, read/write draft_orders, read/write orders, **read/write order_edits**
- **สำคัญ — `write_order_edits`:** การเปลี่ยน size ในออเดอร์ที่จ่ายแล้ว ใช้ Order Edit API (`orderEditBegin/SetQuantity/AddVariant/Commit`) ซึ่ง**บังคับต้องมี scope `write_order_edits`** (`write_orders` ธรรมดาไม่พอ → ได้ ACCESS_DENIED). ถ้าเพิ่ม scope ในแอป Shopify ต้อง Release เวอร์ชันใหม่ + ให้ร้านอัปเดต/อนุมัติสิทธิ์ token เดิมถึงจะได้สิทธิ์เพิ่ม (token ไม่เปลี่ยน)
- API version ที่ใช้: 2026-04
- **ลำดับสินค้า:** sort ตาม product id ascending (= ลำดับการสร้าง) ทุกจุดที่ดึงสินค้า (หน้า LIFF + Stock tab + change-size lookups) → ของเก่าคงที่ ของใหม่ต่อท้ายเสมอ ไม่แทรกกลาง (Shopify REST `/products.json` default order ไม่นิ่ง)
- **สำคัญ:** order ที่สร้างต้องเก็บ Real Order ID (order_id) ไม่ใช่ Draft ID — ออเดอร์เก่าก่อนแก้บัคนี้จะอัพเดทที่อยู่ใน Shopify ไม่ได้
- แก้ที่อยู่ Shopify: ใช้ GraphQL `orderUpdate` ส่ง `provinceCode` (ISO 3166-2:TH เช่น TH-10, TH-41) ไม่ใช่ `province`
- **เบอร์โทร (E.164 +66):** Shopify เริ่ม reject เบอร์ไทยแบบ local (`0xxxxxxxxx`) ใน shipping_address → 422 "Phone number invalid" ทำให้ออเดอร์จ่ายแล้วแต่ไม่ถูกสร้างใน Shopify. แก้: `toE164ThaiPhone` ใน `lib/shopify.ts` normalize เป็น `+66xxxxxxxxx` (รองรับ `0xxx`, `66xxx`, `+66xxx`, มีขีด/เว้นวรรค). normalize ไม่ได้ → **ไม่ใส่เบอร์ในที่อยู่** + แปะเบอร์ดิบใน note (`Phone(raw): ...`) เพื่อไม่ให้ทั้งออเดอร์ถูก reject
- **ไม่ swallow error อีกต่อไป (`lib/order-sync.ts`):** หลังจ่ายเงิน webhook เรียก `syncPaidOrderToShopify` → สร้าง Shopify order แบบ retry 3 ครั้ง (delay 600ms). ถ้ายังพังทุกครั้ง → เขียน `FAILED: <reason>` ลงคอลัมน์ Shopify Order ID ใน Sheet **และ** push LINE แจ้งเจ้าของร้าน (`OWNER_LINE_USER_ID`, override ได้ด้วย env) → ออเดอร์ที่จ่ายแล้วจะไม่หายเงียบ ๆ อีก
- **แก้หลังจ่ายเงิน (change size / edit shipping) ต้อง sync เข้า Shopify:**
  - **เปลี่ยน size:** `updateShopifyOrderVariant` (Order Edit API, ต้องมี `write_order_edits` — ดูข้างบน). ไม่เกี่ยวกับเบอร์
  - **แก้ที่อยู่:** `updateShopifyShippingAddress` (GraphQL `orderUpdate`) — **normalize เบอร์เป็น +66 ด้วย `toE164ThaiPhone`** เหมือนตอนสร้าง (normalize ไม่ได้ → ไม่ใส่เบอร์) endpoint นี้รับเบอร์ local ได้แต่ normalize กันเหนียว
  - **กันเงียบหายทั้ง 2 จุด:** ถ้า Shopify ไม่สำเร็จ (return false/throw/ไม่มี Shopify Order ID) → เขียน `FAILED ...→Shopify: <reason>` ลงคอลัมน์ **"Sync Status"** (column ใหม่ ไม่ทับ Shopify Order ID เดิม) ผ่าน `setOrderSyncStatus()` **และ** push LINE แจ้งเจ้าของ (`alertOwnerEditFailed`). สำเร็จ → เคลียร์ Sync Status เป็น "". จุดเรียก: `app/api/webhook/route.ts` (size), `app/api/order/[orderId]/route.ts` (shipping)

### สินค้า (Variant IDs)
**01 Training Oversize Tee** (PROTOTYPE-01 TEE) ฿1,800
- S: 49705473048813 · M: 49705473081581 · L: 49705473114349

**01 Outline Tee** ฿2,200
- S: 49982772248813 · M: 49982772281581 · L: 49982772314349

- สินค้ามี metafield **SIZECHART** (รูป size guide) — ใช้ส่งตอน Change size
- **สีสินค้า:** metafield `custom.color_line` (ชื่อโชว์ "Color (LINE)", single line text) — กรอกต่อสินค้า เช่น `BLACK` → หน้า Cart แสดง `SIZE x · COLOR` (ไม่กรอก = โชว์แค่ SIZE). `/api/products` ดึงผ่าน GraphQL 1 request รวม. **หมายเหตุ:** token อ่าน metaobject ไม่ได้ (ขาด read_metaobjects) จึงใช้ `custom.color_line` ข้อความธรรมดาแทน `shopify.color-pattern`
- **รูปสินค้าหลายรูป (carousel):** `/api/products` คืน `images: string[]` (ทุกรูปใน Media ของสินค้า) → หน้า Products เลื่อนรูปได้ (swipe + จุดบอกตำแหน่ง). สินค้ารูปเดียวแสดงปกติ. เพิ่ม/ลบ/สลับลำดับรูปได้ที่แท็บ Media — ไม่ต้อง deploy. รูปใช้ `object-fit: contain` (พื้นขาว) → เห็นเสื้อเต็มตัว คอ/ชายไม่โดน crop รองรับทุกอัตราส่วน
- **ลำดับ Size (S→M→L→XL):** Shopify ส่ง variant มาไม่เรียงตามขนาด → ใช้ helper กลาง `compareSizes` ใน `lib/products.ts` (ลำดับ `XS→S→M→L→XL→XXL→XXXL`, normalize `2XL/3XL`, size แปลก/ตัวเลขไปท้ายสุด). ใช้ทั้งปุ่ม size หน้า LIFF (`/api/products`) และ tab Stock (`lib/shopify.ts` → `getAllVariantsWithStock`) → เรียงตรงกันเสมอ. ลำดับ product ยังเรียงตาม id เดิม
- **Size Guide (หน้า Products):** metafield `custom.sizechart` (file_reference → รูป) → `/api/products` resolve เป็น CDN URL ใส่ `sizeGuideUrl` (รวมใน GraphQL request เดียวกับ color). ปุ่ม `SIZE GUIDE ↗` ขึ้นเฉพาะสินค้าที่ตั้ง metafield (ไม่ตั้ง = ซ่อนอัตโนมัติ). กดแล้วเปิด **modal รูปลอยในหน้าเดิม** (พื้นหลังมืด, ปุ่ม × / แตะนอกรูปเพื่อปิด) — ไม่เด้งแท็บใหม่. เปลี่ยนรูปใน Shopify ได้เลย ไม่ต้อง deploy

---

## Google Sheets "UNIT-01 Orders"
### Tab "Orders" (คอลัมน์)
Order ID, Date, LINE User ID, Status (PENDING/PAID/SHIPPED/EXPIRED), Items, Subtotal, Shipping Fee, Total, First Name, Last Name, Phone, Address, Sub-district, District, Province, Postal Code, Updated At, Variant IDs, Shopify Order ID, Transaction Ref, Paid At, Address Changed (YES/NO), Size Changed (YES/NO), **Sync Status** (ว่าง = ปกติ / `FAILED ...→Shopify: <reason>` = แก้ใน Sheet แล้วแต่ Shopify sync ไม่ผ่าน ต้องแก้มือ — column นี้ระบบเพิ่มให้อัตโนมัติถ้ายังไม่มี)

### Tab "Stock" (เสร็จแล้ว — ภาพรวม)
Product, Size, Variant ID, Shopify Stock, Reserved (PENDING), Available, Sold (PAID), Last Updated
- `refreshStockTab()` ใน `lib/sheets.ts` เขียนทับทั้ง tab จาก Shopify inventory + นับ Reserved/Sold จาก tab Orders
- check-expired (cron ทุก 1 นาที) เรียก refresh ทุกรอบ → ตัวเลขสดเสมอ

### Tab "Stock Log" (เสร็จแล้ว — ประวัติ append-only)
Date, Type (RESERVED/SOLD/RETURNED/RESTOCK), Product, Size, Variant ID, Change, Stock After, Order ID, Note
- `appendStockLog()` / `logOrderStockMovement()` ใน `lib/sheets.ts`
- บันทึกอัตโนมัติ: RESERVED ตอนสั่งซื้อ (order route), SOLD ตอนจ่าย (webhook), RETURNED ตอนหมดอายุ (check-expired)

> Finance เป็นไฟล์แยก (UNIT-01 expense-template) มี tab REVENUE อยู่แล้ว — ยังไม่เชื่อม รอทำทีหลัง

---

## กฎสำคัญของระบบ (Business Logic)
- สต็อกที่โชว์ในเว็บ = Shopify stock − PENDING orders (soft-reserve)
- Shopify Order สร้างหลังจ่ายเงินเท่านั้น (ไป Orders ตรงๆ ไม่ใช่ Draft)
- สลิปจับคู่ด้วย LINE userId + ยอดเงิน (**ตรงเป๊ะ ไม่มี tolerance**), กัน transRef ซ้ำ, จับ PENDING **ใหม่สุดก่อน** (newest-first) — ทั้งหมดทำใน `claimPaymentForUser()` แบบ atomic (อ่าน-จับคู่-mark PAID ใน critical section เดียวผ่าน `withLock`)
- Edit ที่อยู่ได้ 1 ครั้ง / Change size ได้ 1 ครั้ง (แยกอิสระ) — ใช้แล้วล็อค (Address Changed / Size Changed = YES)
- **Edit-Lock ตามเวลา (เสร็จแล้ว — ดูหัวข้อ "Edit-Lock" ด้านล่าง):** ลูกค้าแก้ที่อยู่/ไซส์ได้ถึง **10:00 น. (ICT)** ของวัน cutoff เท่านั้น (คิดจากเวลาที่จ่าย) เลยเวลานี้ = ล็อกทุกออเดอร์ที่ "กำลังเตรียมจัดส่ง". time-lock **มาก่อน** edit-once (เลยเวลา = แก้ไม่ได้ แม้ยังไม่เคยแก้)
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
- **ปุ่มหลัก (Add to cart / Confirm / Save):** gradient อุ่น ดำ→น้ำตาล→ส้ม→เหลือง เมื่อ active, สีเทา idle `#D9D9D8` เมื่อยังกรอกไม่ครบ/ปิดใช้งาน
- **หัว section สินค้า:** บาร์โค้ดสแตมป์ (`PageStamp`) + เลขลำดับ `[ 00N/00N ]` + `>>>>` (ไม่ใช้ `SectHead`/`BracketChain` แล้ว)

## Validation (กลาง — `lib/validation.ts`)
- ใช้ร่วมกันทั้ง Checkout (`ShippingForm.tsx`) และ Edit/Reorder (`EditForm.tsx`) — กฎเดียว ที่เดียว
- `normalizePhone` (ตัวเลขล้วน, +66/66→0, สูงสุด 10 หลัก — **ห้ามใส่ maxLength ที่ input phone** ไม่งั้น paste `+66...` จะตัดเลขหาย), `normalizePostal` (5 หลัก), `isValidPhone`, `isFormValid`, `getHint`
- ปุ่ม Confirm/Save จะ disabled จนกว่า `isFormValid` ผ่าน (ครบทุกฟิลด์ + เบอร์ถูก + รหัสไปรษณีย์ lookup เจอจริง = `postalResolved`)

---

## Contact Us System (เสร็จแล้ว)
Flex 4 ปุ่ม: `[ 1 ]` Edit shipping address · `[ 2 ]` Change size · `[ 3 ]` Track my order · `[ 4 ]` Chat with team (ไม่มี Cancel)
- กดจาก Flex ออเดอร์ (มี orderId) → ทำเลย
- กดจาก Rich Menu (ไม่มี orderId) → แสดง SELECT ORDER เสมอ (แม้มี 1 ออเดอร์), แสดงเฉพาะ PAID + unfulfilled, ไม่มี → "No paid orders found."
- Change size: ส่ง available sizes → รูป SIZECHART → Flex เลือก size + เตือน "change once only"

---

## Edit-Lock — เดดไลน์แก้ออเดอร์ราย order (เสร็จแล้ว — merge + ขึ้น production แล้ว 2026-06-13)
ลูกค้าแก้ที่อยู่/ไซส์ได้ถึง **10:00 น. (ICT)** ของวัน cutoff เท่านั้น เลยเวลานี้ออเดอร์ "กำลังเตรียมจัดส่ง" → ล็อก. ไฟล์เดียวจบ: **`lib/edit-lock.ts`** (ไม่มี cron, ไม่มี background job)
- **check-on-press:** คำนวณเดดไลน์ใหม่ทุกครั้งที่ลูกค้ากดแก้ (เหมือนคูปองหมดอายุ) — ไม่มีงานเบื้องหลังคอยปลดล็อก
- **กฎเดดไลน์ (คิดจาก "Paid At"):** `cutoffToday = <วันที่จ่าย> 10:00` · จ่าย ≤ 10:00 → เดดไลน์ = วันนั้น 10:00 · จ่าย > 10:00 → เดดไลน์ = วันถัดไป 10:00
- **เทียบเวลาแบบ string ตายตัว** "YYYY-MM-DD HH:MM" (Bangkok-local, mirror `nowBKK` ใน lib/sheets) — string ความกว้างคงที่เรียงตามเวลาได้ จึงเทียบ lexicographic ตรงๆ **ไม่แตะ UTC** กัน off-by-one
- **fail-open:** ถ้าหา paid timestamp ไม่ได้ (Paid At/Updated At/Date ว่างหมด) → **ไม่ล็อก** (ไม่บล็อกการแก้ที่ถูกต้องเพราะ timestamp หาย — edit-once ยังกันการ abuse อยู่)
- **time-lock มาก่อน edit-once** ทุกจุด: เลยเวลา = แก้ไม่ได้ แม้ Address Changed/Size Changed ยังเป็น NO
- **จุดที่ gate (ครบทั้ง LINE + ฟอร์ม LIFF):**
  - `app/api/webhook/route.ts` — `handleSelectOrder` (edit_address), `handleChangeSize`, `handleSelectSize` (เช็คซ้ำตอน commit, defense-in-depth)
  - `app/api/order/[orderId]/route.ts` — server gate ตอน PUT แก้ที่อยู่ (กันลูกค้าเปิดฟอร์ม LIFF ค้างไว้ข้าม 10:00) → ตอบ **403** + ข้อความล็อก
- **ข้อความล็อก (Option-2, อังกฤษ):** โชว์เลขออเดอร์ + "being prepared for shipping and can no longer be edited" + แนะให้รอของถึงแล้วค่อยขอเปลี่ยนไซส์. **เลี่ยงคำว่า "shipped"** (10:00 = กำลังเตรียม ยังไม่ส่งจริง) — `buildLockedMessage()`
- **CF (ยืนยันหลังจ่าย) แตกเป็น 2 ข้อความ** (`replyConfirmPayment` ใน webhook): ข้อความ1 = ORDER CONFIRMED + เลขออเดอร์ + ยอด + brand line · ข้อความ2 = บอกเดดไลน์ (`formatDeadline` → "19 Jun 2026 · 10:00 (GMT+7)") + เตือน "edit once only" (เว้นบรรทัดให้อ่านง่าย). ถ้าหาเดดไลน์ไม่ได้ = ส่งแค่ข้อความ1
- **funcs หลัก:** `computeEditDeadline(paidAt)`, `isEditLocked(order)`, `orderDeadline(order)`, `formatDeadline(deadline)`, `buildLockedMessage(orderId)`, `nowBKK()`
- **เกี่ยวกับ daily-pull:** ย้าย cron daily-pull 10:00 → **10:10** (ดู Monitoring/Guards) เพื่อดึง worklist หลัง cutoff — ข้อมูลที่อยู่/ไซส์นิ่งแล้ว
- **smoke test ผ่านครบ 3 เคสบน production (2026-06-13):** CF 2 ข้อความ · แก้ก่อนหมดเวลาได้ + sync Shopify · เลยเวลาแล้วล็อก + โชว์เลขออเดอร์

---

## Monitoring / Guards (กันปัญหา sync ไม่ให้เกิดอีก)
ออกแบบเป็น 4 ชั้น หลังเจอบั๊ก "จ่ายแล้ว/แก้แล้วแต่ Shopify ไม่อัพเดทแบบเงียบ" 2 รอบ:
1. **ห้ามเงียบ (in-line) + read-back verify:** ทุกการเขียน Shopify (สร้าง order / change size / edit shipping) เช็คผลจริง พังเมื่อไหร่ → push LINE เจ้าของ + เขียน `FAILED` ลง Sheet (คอลัมน์ Shopify Order ID ตอนสร้าง, คอลัมน์ "Sync Status" ตอนแก้). **read-back verify:** หลังแก้ size/ที่อยู่สำเร็จ → อ่านออเดอร์จาก Shopify กลับมาเช็คซ้ำว่าค่า *ลงจริง* (size: new variant active + old variant หาย / ที่อยู่: address1/address2/zip ตรง) ไม่ใช่แค่เชื่อ mutation ตอบ ok — ไม่ตรง = ถือว่า FAILED + LINE. กัน "สำเร็จเงียบแต่ไม่ลง" (`getShopifyOrderSnapshot` ใน webhook size handler + order PUT shipping handler)
2. **Reconciliation รายวัน — `GET /api/reconcile`** (auth CRON_SECRET): สแกนออเดอร์ PAID ล่าสุด (`?hours=` default 72) เทียบ Sheet ↔ Shopify → ออเดอร์ไม่มี Shopify ID / Shopify หาย / variant(ไซส์)ไม่ตรง / **ที่อยู่ไม่ตรง (address1=Address, address2=Sub-district, zip=Postal — เทียบแบบ normalize trim+lowercase)** / มี Sync Status FAILED → สรุป push LINE ทุกรอบ (รวม " all clear"). `?silent=1` = ไม่ push. ฟังก์ชัน: `findRecentPaidOrders` (sheets), `getShopifyOrderSnapshot` (shopify, ใช้ `current_quantity` สะท้อน order-edit, คืน `shippingAddress1/2/Zip` ด้วย). **หมายเหตุ:** การเทียบที่อยู่นี้คือจุดสำคัญ — ก่อนหน้านี้ reconcile เทียบแค่ไซส์ เลยจับ "แก้ที่อยู่ในชีตแล้วไม่เข้า Shopify" ไม่ได้ (เคส thishar)
3. **Scope health check — `GET /api/scope-check`** (auth CRON_SECRET): เช็ค token มี scope ครบตาม `REQUIRED_SHOPIFY_SCOPES` (`read_products, read_inventory, write_draft_orders, write_orders, write_order_edits`) ขาด → push LINE แจ้งทันที (กันเคส scope หายเหมือน `write_order_edits`). reconcile ก็เรียกเช็ค scope ในตัวด้วย
4. **Smoke test ก่อนขาย:** (ยังไม่ทำเป็นสคริปต์ถาวร — รันทดสอบ manual)
- **cron บน cron-job.org (ตั้งแล้ว ✅):** บัญชี cron-job.org มี 5 งาน:
  - `UNIT-01 auto-cancel orders` → `/api/check-expired` ทุก 1 นาที
  - `UNIT-01 reconcile (Sheet↔Shopify)` → `/api/reconcile?key=<CRON_SECRET>` ทุกวัน 09:00 (Asia/Bangkok, crontab `0 9 * * *`)
  - `UNIT-01 scope-check (Shopify)` → `/api/scope-check?key=<CRON_SECRET>` ทุกวัน 09:00 (Asia/Bangkok, crontab `0 9 * * *`)
  - `UNIT-01 daily pull` (jobId 7799747) → `/api/daily-pull?key=<CRON_SECRET>` ทุกวัน **10:10** (Asia/Bangkok) — เลื่อนจาก 10:00 → 10:10 เพื่อให้ดึง worklist **หลัง** edit-lock cutoff (10:00) ลูกค้าแก้ที่อยู่/ไซส์ได้จนถึง 10:00 พอดึงตอน 10:10 จะได้ข้อมูลที่นิ่งแล้ว (window cutoff ของข้อมูลยังเป็น 10:00 เป๊ะ)
  - `UNIT-01 heartbeat` (jobId 7799750) → `/api/daily-pull-heartbeat?key=<CRON_SECRET>` ทุกวัน 10:30 (Asia/Bangkok)
  - helper `pushOwner` ใน `lib/order-sync.ts` ใช้ส่ง LINE หาเจ้าของ — ถ้าได้ LINE เตือน = มีออเดอร์ที่ Sheet กับ Shopify ไม่ตรง ต้องไปแก้มือใน Shopify
  - ยืนยัน endpoint บน production แล้ว: scope-check `ok:true` (scope ครบ), reconcile จับ `#UT-8DW9TX` (ออเดอร์เทสต์ จ่ายแล้วไม่มี Shopify ID) ได้ถูกต้อง

---

## Daily Pull Worklist (เสร็จแล้ว — merge + ขึ้น production แล้ว 2026-06-12)
ระบบดึงออเดอร์ประจำวันลงชีตเป็นรายการแพ็คของ (worklist) — โมดูลแยกตัวเอง (`app/api/daily-pull*`, `lib/daily-pull/*`) **ไม่ import core lib** (sheets/shopify ของ sales loop) เพื่อให้ลบทั้งก้อนได้ ไม่กระทบระบบขาย
- **`GET/POST /api/daily-pull`** (auth CRON_SECRET): ทุกวัน 10:00 ICT ดึงออเดอร์ **PAID + UNFULFILLED** ในหน้าต่าง 24 ชม. (เมื่อวาน 10:00 → วันนี้ 10:00, ตัดที่ 10:00:00 เป๊ะตาม paid timestamp) → เขียนแท็บใหม่ต่อวันในชีตเดิม "UNIT-01 Orders" (ชื่อแท็บ `WL-YYYY-MM-DD`, 11 คอลัมน์ไทย) → reconcile เทียบ re-pull → tag `worklisted` กันดึงซ้ำ → แจ้ง carry-over แยก → รายงานทุกสเตปเป็นไทยทาง LINE (ไม่มี emoji)
- **`GET /api/daily-pull-heartbeat`** (auth CRON_SECRET): 10:30 ICT เช็คว่าแท็บ `WL-วันนี้` มีไหม — ไม่มี = รอบ 10:00 ไม่ทำงาน → push LINE เตือนด่วน. แท็บว่าง (0 ออเดอร์) ยังนับว่า "ทำงานแล้ว" → วันเงียบไม่ false-alarm
- **window logic** (`lib/daily-pull/window.ts`): CUTOFF_HOUR=10 ICT (=03:00 UTC), `isInWindow`/`isCarryOver`. paidAt = transaction SUCCESS SALE/CAPTURE processedAt ตัวแรกสุด (fallback createdAt)
- **idempotency:** tag `worklisted` ผ่าน `tagsAdd` — รอบถัดไปดึงด้วย `-tag:worklisted` ไม่ดึงซ้ำ (Shopify search index มี lag หลัง tag นิดหน่อย). **regen** (เรียกซ้ำด้วย `?date=`) ดึงทุกอันรวมที่ tag แล้ว + เขียนทับแท็บเดิม (stable gid)
- **reconcile/verify ต้อง mirror การ exclude worklisted ของ pull หลัก** (`excludeWorklisted: !isRegen`) — ไม่งั้นออเดอร์ที่ tag แล้วจะถูก re-pull, ถูกมองว่า "หาย", แล้ว auto-fix เอากลับเข้าชีต (บั๊กนี้แก้แล้ว commit e933a52)
- ตั้ง cron 2 งานบน cron-job.org แล้ว (ดู Monitoring/Guards). ตัวแปร LINE ปลายทาง: `ADMIN_LINE_USER_ID` (fallback `OWNER_LINE_USER_ID`)

---

## Concurrency / กันแย่งกันเขียน (เสร็จแล้ว — merge + ขึ้น production แล้ว 2026-06-12)
เจอ race 3 แบบจาก load test (50 ออเดอร์พร้อมกัน) แก้ด้วย **in-process async mutex** `withLock()` (`lib/sheets.ts`):
- **`withLock(fn)`** — คิว Promise ตัวเดียว ทำงานทีละใบ (serialize) critical section ทั้งหมด แก้ 3 ปัญหาพร้อมกัน: oversell, ออเดอร์หาย, และ 429 burst (เพราะทีละใบ = throttle ในตัว)
- **order route → `createOrderGuarded()`** (1 ใบ = อ่าน Orders 1 + Stock 1, เช็ค available = Shopify Stock − committed(PENDING+PAID), แล้วค่อย append + log RESERVED ใน lock เดียว) — สต็อกไม่พอ → ตอบ `409 out_of_stock`, ชีต error/quota → `503 order_busy` (ให้ลูกค้า retry, ไม่สร้างออเดอร์ครึ่งๆ)
- **webhook (slip) → `claimPaymentForUser()`** — อ่าน Orders 1 + กัน transRef ซ้ำ + จับ PENDING ใหม่สุด (user+ยอดตรงเป๊ะ) + mark PAID ใน lock เดียว ปิด race "สลิปซ้ำ" และ "จ่าย 2 ใบยอดเท่ากันทับ row เดียว" พร้อมกัน
- ⚠️ **ข้อจำกัด:** เป็น in-process lock — ถ้า Vercel scale หลาย instance lock จะไม่ข้าม instance (reconcile รายวันเป็นตาข่ายจับ race ข้าม instance ที่เหลือ)
- **bottleneck = Google Sheets quota 60 read + 60 write/นาที** — 20-50 ใบพร้อมกันจะโดน throttle (บางใบได้ 503 ให้ retry) นี่คือเหตุผลหลักที่ควรพิจารณา Shopify inventory hold สำหรับดรอปใหญ่ (ข้างล่าง)
- **Load test:** `scripts/loadtest/` (รันบน TEST sheet เท่านั้น — `_env.ts` กัน prod id). Test A=write integrity, B=oversell, C=slip dedup/match, D=reserved/available, **E=ยิง HTTP `/api/order` route จริง** (มี safety pre-flight ยืนยัน server ชี้ test sheet ก่อนยิงโหลด). ผลล่าสุด: ออเดอร์ที่ตอบ 200 ลงครบ 100% (0 หาย/0 ทับ), oversell 0, สลิปซ้ำ 2→1, accounting เป๊ะ

### Optimize latency ออเดอร์เดียว (เสร็จแล้ว — ขึ้น production แล้ว 2026-06-12)
หลังเพิ่ม mutex + อ่าน Stock การสร้างออเดอร์ใบเดียวหน่วง (~3.8s) แก้ 3 จุดใน branch แยก (วัด before/after + รัน A→D ซ้ำ ผ่านทุกการ์ด) ลดเหลือ ~2.7s warm median (~28% เร็วขึ้น) + ตัด LINE push ออกจาก path = รู้สึกเร็วขึ้นอีก:
- **cache doc handle 5 นาที (`getReadyDoc()` ใน `lib/sheets.ts`)** — `doc.loadInfo()` ดึงแค่ metadata (รายชื่อแท็บ/pointer header ~900ms) เลยแคชไว้ 5 นาที ไม่ต้อง round-trip ทุกใบ **ข้อมูลแถว/สต็อกยังอ่านสดทุกครั้งผ่าน `getRows()`** → เลขคำนวณ oversell ไม่มีทางเก่า. self-heal: ถ้า cache พลาดแท็บ Orders/Stock Log จะ force refresh (`getReadyDoc(true)`) ก่อนเขียน + มี `invalidateDocCache()`. คอลัมน์/แท็บใหม่ติดภายใน ≤5 นาที (deploy ล้าง cache ทันที)
- **ลบ `loadHeaderRow()` ซ้ำตอนอ่าน Stock** — `getRows()` โหลด header ของชีตนั้นในตัวอยู่แล้ว → เรียกซ้ำก่อนหน้าเปลือง ~500ms/ใบ
- **ย้าย LINE push (Flex QR + เตือน 5 นาที) ไป background ด้วย `after()` (`next/server`)** — ตอบ HTTP กลับทันทีหลัง order ลงชีต ไม่บล็อกรอ LINE 2 round-trip. **never-silent ยังอยู่:** `after()` รันแม้ response จบแล้ว, ถ้า push พังจะเรียก `alertOwnerNotifyFailed()` แจ้งเจ้าของว่าลูกค้าอาจไม่ได้ QR (เดิม console.error เฉยๆ)
- **รอบ 2 (2026-06-12):** ลดต่ออีกเหลือ **warm ~1.2s** (จาก ~2.3s → **~49% เร็วขึ้น**, cold ใบแรกหลัง deploy ~2.4s) แก้ 3 จุดใน `createOrderGuarded` วัด before/after + รัน A→D ผ่านทุกการ์ด (oversell 4→0, สลิปซ้ำ 2→1, wrong-user 0, reserved/sold/available เป๊ะ, dup/corrupt 0):
  - **อ่าน Orders + Stock พร้อมกัน (`Promise.all`)** — เดิมอ่านเรียงกันเสียเวลาเปล่า. **error handling แยกชัด:** Orders พัง → reject ทะลุ → route ตอบ **503 + ไม่สร้างออเดอร์** (เกิดก่อน `addRow` เสมอ ไม่มีออเดอร์ครึ่งใบ); Stock พัง → `.catch`→สต็อก 0 → availability ไม่ผ่าน → **409** (กัน oversell ไว้ก่อน) — ไม่ค้าง ไม่มี dangling rejection
  - **ลบ `loadHeaderRow` ซ้ำของ Orders** — migrate คอลัมน์จาก header ที่ `getRows()` โหลดมาแล้ว แทน `getOrCreateSheet()` ที่ยิง `loadHeaderRow` แยก (~500ms) — ยัง auto-migrate คอลัมน์ใหม่อยู่ (fallback สร้าง tab ถ้าหายจริง)
  - **verify header "Stock Log" ครั้งเดียวต่อ doc cache** (`getStockLogSheetVerified` + flag `_stockLogHeaderOK`, reset ทุกครั้งที่ refresh cache TTL/deploy/invalidate) — warm order ข้าม `loadHeaderRow` round-trip (~500ms), คอลัมน์ใหม่ติด ≤5 นาที
  - **ไม่ทำ:** เขียน order + RESERVED log พร้อมกัน (จงใจ — เขียน order ก่อนคือตัวกันออเดอร์หายถ้า log พัง แลก 0.6s ไม่คุ้ม)

### Loading screen ตอน CHECKOUT (เสร็จแล้ว — ขึ้น production แล้ว 2026-06-12)
หลัง mutex/createOrderGuarded เพิ่มการอ่าน Stock การสร้างออเดอร์ใช้เวลาขึ้น (โหลดหนักได้หลายวินาที) จึงเพิ่มหน้า loading กันลูกค้ากดซ้ำ/งง
- **`components/LoadingOverlay.tsx`** — overlay เต็มจอตอนกด CHECKOUT (`screen === "creating"` ใน `app/shop/page.tsx`) ระหว่างบันทึกออเดอร์ + สร้าง PromptPay QR
- **state loading:** "CREATING YOUR ORDER" + capsule progress (gradient `WARM_STOPS` ใน `lib/tokens.ts`) + "// PLEASE WAIT"
- **error mapping จาก status ของ order route:** `409` → OUT OF STOCK (ปุ่ม BACK TO CART กลับตะกร้า), `503` → SYSTEM BUSY (ปุ่ม TRY AGAIN), อื่นๆ/network → SOMETHING WENT WRONG (TRY AGAIN)
- ใช้ฟอนต์แบรนด์ **Magda Clean Mono (`FM`)** + โทนเดียวกับ ORDER CONFIRMED — ยืนยันตอนรันจริงว่า `document.fonts.check('Magda Clean Mono') = true`, heading คำนวณได้ Magda จริง (ไม่ใช่ default mono)
- ไม่แตะ logic ส่งออเดอร์/สร้าง QR; ReorderFlow (PUT `/api/order/[id]`) ยังไม่ใส่ loading (ไม่คืน 409/503)

### Shopify inventory hold (อนาคต — ยังไม่ทำ, ทางเลือกที่แข็งกว่าสำหรับดรอปใหญ่)
ตอนนี้สต็อกเป็น **soft-reserve** (นับ PENDING ในชีตเอง) — ดีพอสำหรับวอลุ่มปกติ แต่ผูกกับ Sheets quota และ in-process lock
- **inventory hold คืออะไร:** ใช้ Shopify จองสต็อกจริงตอนสร้างออเดอร์ (reservation/hold ผ่าน Admin API เช่น `inventorySetQuantities`/draft order reserve) แทนการนับเองในชีต → Shopify เป็น source of truth ตัวเดียว กัน oversell ข้าม instance/ข้ามช่องทางได้จริง (ไม่ต้องพึ่ง in-process lock)
- **ทำเมื่อไหร่ดี:** ดรอปใหญ่/limited ที่คนแย่งของชิ้นสุดท้ายเยอะมาก, หรือเริ่มขายหลายช่องทาง (เว็บ + หน้าร้าน + IG) ที่ soft-reserve ในชีตเดียวตามไม่ทัน, หรือเมื่อ Vercel ต้อง scale หลาย instance ถาวร
- **ต้นทุน:** เพิ่ม Shopify API call ต่อออเดอร์ (มี rate limit ของตัวเอง), ต้องจัดการ release hold ตอน EXPIRED/ยกเลิก, และ map hold↔order ในชีต — ซับซ้อนขึ้น จึงเก็บไว้ทำเมื่อสเกลถึงจุดที่จำเป็น

---

## สถานะระบบ (อัพเดทล่าสุด)
**เสร็จแล้ว:** LIFF shop ดึง Shopify, order→Sheets, returning customer auto-fill, Flex+QR, SlipOK→PAID, Shopify Order auto-create, Thai zip auto-fill, Contact Us ครบ, lock system, pre-order/reorder flow, auto-cancel 5 นาที (cron-job.org), backup folder, GitHub auto-deploy, **Stock + Stock Log tabs**, **UI patch รอบ 1-3 (Products/Checkout/Edit) + หัวสินค้าบาร์โค้ดสแตมป์ + Patch 03 (Cart UI: ปุ่ม gradient/เทา, ลบ IMAGE/LOT) + สีสินค้าจาก metafield `custom.color_line` + รูปสินค้าหลายรูป (carousel swipe + dots) + Size Guide จาก metafield `custom.sizechart` (เปิด modal ในหน้าเดิม) + รูปสินค้า object-fit contain (ไม่ crop) + เรียง size S→M→L→XL (helper กลาง ใช้ทั้ง LIFF + Stock tab)** + **normalize เบอร์ +66 ทั้งตอนสร้าง+แก้ที่อยู่ + กันเงียบหายทุกจุด (สร้าง/change size/edit shipping → LINE alert + FAILED/Sync Status) + change size ต้องมี scope `write_order_edits` + Reconciliation cron (/api/reconcile) + Scope health check (/api/scope-check) + ตั้ง cron-job.org รายวัน 09:00 ครบทั้ง reconcile+scope-check** + **UI patch รอบ 4: Checkout (ShippingForm) ตัดหัวซ้ำ — เหลือ `03 ◦ SHIPPING DETAILS` บรรทัดเดียว (ลบ `// STEP 03/03` 2 บรรทัด + bracket row ใต้ progress) · Cart รูปสินค้าใช้ `object-fit: contain` พื้น `C.cream` (ไม่ crop ไม่มีแถบดำ เหมือนหน้า shop)** + **Concurrency mutex (createOrderGuarded + claimPaymentForUser, กัน oversell/ออเดอร์หาย/สลิปซ้ำ) + Loading screen ตอน CHECKOUT (CREATING YOUR ORDER + error 409/503/อื่นๆ) — ขึ้น production แล้ว 2026-06-12** + **Daily Pull Worklist (ดึงออเดอร์ PAID+UNFULFILLED ราย 24 ชม. → แท็บ `WL-วันที่` ในชีตเดิม + reconcile + tag worklisted กันซ้ำ + carry-over + รายงาน LINE ไทย + heartbeat 10:30) + ตั้ง cron-job.org 10:00/10:30 — ขึ้น production แล้ว 2026-06-12** + **Edit-Lock ราย order (แก้ที่อยู่/ไซส์ได้ถึง 10:00 ICT ของวัน cutoff, check-on-press, `lib/edit-lock.ts`) + CF ยืนยันแตกเป็น 2 ข้อความ (เลขออเดอร์+brand / เดดไลน์+edit once) + gate ครบทั้ง LINE handler + ฟอร์ม LIFF (403) + ย้าย cron daily-pull 10:00→10:10 — smoke test ผ่าน ขึ้น production แล้ว 2026-06-13**
**กำลังทำ:** —
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
