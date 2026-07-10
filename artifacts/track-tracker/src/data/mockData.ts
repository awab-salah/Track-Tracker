// ─────────────────────────────────────────────────────────────────────────────
// TrackTracker – Data Layer
// Types mirror the expected DB schema for a smooth migration to Supabase/Firebase.
// Mutable collections (drivers/loads/sales) live in AppContext (React state +
// localStorage) so both the Company and Driver dashboards share one source of
// truth. The pure helpers below only ever read the arrays passed to them —
// swapping them for real queries later requires no call-site changes.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ────────────────────────────────────────────────────────────────────

export interface Driver {
  id: string;
  name: string;
  vehicleNumber: string;
  location: string;
  lat: number;
  lng: number;
  email?: string;
  profilePictureUrl?: string | null;
  companyName?: string;
}

/** A single product line inside a driver's current load. */
export interface CargoItem {
  id: string;
  driverId: string;
  productName: string;
  quantity: number;
  unitPrice: number; // IQD per unit
}

/** One product line inside a completed sale. */
export interface SaleLineItem {
  productName: string;
  quantity: number;
  unitPrice: number; // IQD per unit, captured at time of sale
}

/**
 * A completed sale. When a driver sells several products against a single
 * receipt they are grouped into one SaleRecord (one card, one "view receipt").
 */
export interface SaleRecord {
  id: string;
  driverId: string;
  date: string; // ISO date string
  items: SaleLineItem[];
  totalPrice: number; // IQD, sum of items
  receiptImageUrl?: string | null;
}

export interface DailyPerformance {
  day: string;   // Arabic day name
  sales: number; // total IQD
}

// ── Drivers ───────────────────────────────────────────────────────────────────

export const MOCK_DRIVERS: Driver[] = [
  {
    id: 'd1',
    name: 'أحمد محمد العبيدي',
    vehicleNumber: 'بغداد / أ ١٢٣٤٥',
    location: 'الأنبار - هيت',
    lat: 33.6416,
    lng: 42.8251,
    email: 'ahmed.driver@alfalah.iq',
    profilePictureUrl: null,
    companyName: 'شركة الفلاح للتوزيع',
  },
  {
    id: 'd2',
    name: 'كرار علي الموسوي',
    vehicleNumber: 'بغداد / ب ٦٧٨٩٠',
    location: 'بغداد - الكرادة',
    lat: 33.3152,
    lng: 44.3661,
    email: 'karrar.driver@alfalah.iq',
    profilePictureUrl: null,
    companyName: 'شركة الفلاح للتوزيع',
  },
  {
    id: 'd3',
    name: 'عمر حسين الجبوري',
    vehicleNumber: 'نينوى / ج ١١٢٢٣',
    location: 'نينوى - الموصل',
    lat: 36.3352,
    lng: 43.1189,
    email: 'omar.driver@alfalah.iq',
    profilePictureUrl: null,
    companyName: 'شركة الفلاح للتوزيع',
  },
  {
    id: 'd4',
    name: 'مصطفى خالد الدليمي',
    vehicleNumber: 'الأنبار / د ٤٤٥٥٦',
    location: 'الرمادي - المركز',
    lat: 33.4258,
    lng: 43.2999,
    email: 'mustafa.driver@alfalah.iq',
    profilePictureUrl: null,
    companyName: 'شركة الفلاح للتوزيع',
  },
];

// ── Cargo / current load per driver ──────────────────────────────────────────

export const MOCK_CARGO: CargoItem[] = [
  { id: 'c1', driverId: 'd1', productName: 'زيت نخيل', quantity: 50, unitPrice: 12000 },
  { id: 'c2', driverId: 'd1', productName: 'سكر أبيض (كيس)', quantity: 30, unitPrice: 22500 },
  { id: 'c3', driverId: 'd1', productName: 'شاي أسود (علبة)', quantity: 100, unitPrice: 5000 },
  { id: 'c4', driverId: 'd2', productName: 'أرز بسمتي (كيس)', quantity: 40, unitPrice: 35000 },
  { id: 'c5', driverId: 'd2', productName: 'دقيق (كيس)', quantity: 60, unitPrice: 18000 },
  { id: 'c6', driverId: 'd3', productName: 'معكرونة (علبة)', quantity: 80, unitPrice: 7500 },
  { id: 'c7', driverId: 'd3', productName: 'تمر (كيس)', quantity: 25, unitPrice: 45000 },
  { id: 'c8', driverId: 'd4', productName: 'صابون (كرتون)', quantity: 20, unitPrice: 28000 },
  { id: 'c9', driverId: 'd4', productName: 'مسحوق غسيل (كيس)', quantity: 35, unitPrice: 19000 },
];

// ── Sales records (grouped by receipt) ───────────────────────────────────────

export const MOCK_SALES: SaleRecord[] = [
  { id: 's1', driverId: 'd1', date: '2026-07-06', items: [{ productName: 'زيت نخيل', quantity: 15, unitPrice: 12000 }], totalPrice: 180000 },
  { id: 's2', driverId: 'd1', date: '2026-07-06', items: [{ productName: 'سكر أبيض (كيس)', quantity: 8, unitPrice: 22500 }], totalPrice: 180000 },
  { id: 's3', driverId: 'd1', date: '2026-07-05', items: [{ productName: 'شاي أسود (علبة)', quantity: 30, unitPrice: 5000 }], totalPrice: 150000 },
  { id: 's4', driverId: 'd2', date: '2026-07-06', items: [{ productName: 'أرز بسمتي (كيس)', quantity: 12, unitPrice: 35000 }], totalPrice: 420000 },
  { id: 's5', driverId: 'd2', date: '2026-07-05', items: [{ productName: 'دقيق (كيس)', quantity: 20, unitPrice: 18000 }], totalPrice: 360000 },
  { id: 's6', driverId: 'd3', date: '2026-07-06', items: [{ productName: 'معكرونة (علبة)', quantity: 25, unitPrice: 7500 }], totalPrice: 187500 },
  { id: 's7', driverId: 'd3', date: '2026-07-05', items: [{ productName: 'تمر (كيس)', quantity: 10, unitPrice: 45000 }], totalPrice: 450000 },
  { id: 's8', driverId: 'd4', date: '2026-07-06', items: [{ productName: 'صابون (كرتون)', quantity: 7, unitPrice: 28000 }], totalPrice: 196000 },
  { id: 's9', driverId: 'd4', date: '2026-07-05', items: [{ productName: 'مسحوق غسيل (كيس)', quantity: 12, unitPrice: 19000 }], totalPrice: 228000 },
];

// ── Helpers (pure — designed to be swapped for Supabase/Firebase queries) ────

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function getDriverCargo(loads: CargoItem[], driverId: string): CargoItem[] {
  return loads.filter((item) => item.driverId === driverId);
}

export function getDriverSales(sales: SaleRecord[], driverId: string): SaleRecord[] {
  return sales
    .filter((sale) => sale.driverId === driverId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getDriverTotalSales(sales: SaleRecord[], driverId: string): number {
  return getDriverSales(sales, driverId).reduce((sum, s) => sum + s.totalPrice, 0);
}

/** Unique sellable products currently in a driver's load (quantity > 0). */
export function getDriverProducts(
  loads: CargoItem[],
  driverId: string
): { productName: string; unitPrice: number; available: number }[] {
  return getDriverCargo(loads, driverId)
    .filter((item) => item.quantity > 0)
    .map((item) => ({ productName: item.productName, unitPrice: item.unitPrice, available: item.quantity }));
}

/** Weekly totals grouped by Arabic weekday name. Pass a driverId to scope to one driver, omit for company-wide. */
export function getWeeklyPerformance(sales: SaleRecord[], driverId?: string): DailyPerformance[] {
  const scoped = driverId ? sales.filter((s) => s.driverId === driverId) : sales;
  const totals: Record<string, number> = Object.fromEntries(DAYS_AR.map((d) => [d, 0]));
  for (const sale of scoped) {
    const dayIndex = new Date(sale.date).getDay(); // 0 = Sunday
    const dayName = DAYS_AR[dayIndex];
    if (dayName) totals[dayName] += sale.totalPrice;
  }
  return DAYS_AR.map((day) => ({ day, sales: totals[day] }));
}

export function formatIQD(amount: number): string {
  return amount.toLocaleString('ar-IQ') + ' د.ع';
}

/** Correct Arabic plural form of "وحدة" (unit) for a given quantity. */
export function pluralizeUnit(quantity: number): string {
  const n = Math.abs(quantity);
  if (n === 0) return 'وحدات';
  if (n === 1) return 'وحدة';
  if (n === 2) return 'وحدتان';
  if (n % 100 >= 3 && n % 100 <= 10) return 'وحدات';
  return 'وحدة';
}
