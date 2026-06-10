// lib/validation.ts — กฎกลาง ใช้ทั้งหน้า Checkout และ Edit

// normalize เบอร์โทร: ตัวเลขล้วน, +66/66 -> 0, สูงสุด 10 หลัก
export function normalizePhone(v: string): string {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("66")) d = "0" + d.slice(2);
  return d.slice(0, 10);
}

// normalize รหัสไปรษณีย์: ตัวเลขล้วน สูงสุด 5 หลัก
export function normalizePostal(v: string): string {
  return v.replace(/\D/g, "").slice(0, 5);
}

// เบอร์ถูกต้อง: ขึ้นต้น 0 และยาว 9 หรือ 10 หลัก
export function isValidPhone(phone: string): boolean {
  return phone.startsWith("0") && (phone.length === 9 || phone.length === 10);
}

// ฟิลด์ที่ต้องกรอกครบ
export const REQUIRED_FIELDS = [
  "firstName", "lastName", "phone", "address", "postalCode", "subDistrict", "district", "province",
] as const;

// เช็คฟอร์มครบ + ถูกกฎ (postalResolved = รหัส lookup เจอจริง)
export function isFormValid(form: Record<string, string>, postalResolved: boolean): boolean {
  return REQUIRED_FIELDS.every((k) => form[k]?.trim()) &&
    isValidPhone(form.phone) &&
    postalResolved;
}

// ข้อความเตือน
export function getHint(form: Record<string, string>, postalResolved: boolean): string {
  if (form.phone && !isValidPhone(form.phone)) return "INVALID PHONE NUMBER";
  if (form.postalCode && !postalResolved) return "INVALID POSTAL CODE";
  if (!isFormValid(form, postalResolved)) return "COMPLETE ALL FIELDS";
  return "";
}
