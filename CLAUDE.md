@AGENTS.md

# เริ่มทุก session ให้อ่านบริบทก่อน (สำคัญ)
ก่อนเริ่มงาน ให้อ่านตามลำดับ:
1. `CONTEXT.md` (ในโฟลเดอร์นี้) = แหล่งความจริงของระบบ + ฟีเจอร์ที่เสร็จแล้ว
2. `~/Desktop/unit01-liff-backup/README.md` = บริการ/API/รหัสทั้งหมด (LINE, Shopify, Sheets, SlipOK, Vercel)
3. `~/Desktop/claude-chats-readable/MASTER_CONTEXT.md` = ภาพรวมทุกแชทเก่า + งานค้างรวมทุกก้อน (LIFF / Shopify theme / Finance)

# กฎการทำงาน (จาก CONTEXT.md)
- สื่อสารภาษาไทย สรุปให้เข้าใจง่าย ไม่เอาศัพท์เทคนิคเกินจำเป็น
- push main = ขึ้น production ทันที → ทำใน branch เสมอ ห้าม push/merge main จนกว่า user สั่ง
- เช็คสถานะจริงก่อนตอบ อย่าเดา; ยืนยันก่อนทำ destructive (ลบไฟล์/ส่ง LINE หาลูกค้า/แตะข้อมูลจริง)
- เทสยิงเข้า test sheet เท่านั้น ห้ามแตะ prod sheet โดยไม่ได้สั่ง
