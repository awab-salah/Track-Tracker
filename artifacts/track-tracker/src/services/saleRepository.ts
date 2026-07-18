import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { SaleRecord, SaleLineItem } from '@/data/mockData';

// ── Shape converters ──────────────────────────────────────────────────────────

type DbSale = {
  id: string;
  driver_id: string;
  date: string;
  total_price: number;
  receipt_image_url: string | null;
};

type DbSaleItem = {
  id: string;
  sale_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
};

function toSaleRecord(row: DbSale, items: SaleLineItem[]): SaleRecord {
  return {
    id: row.id,
    driverId: row.driver_id,
    date: row.date,
    items,
    totalPrice: row.total_price,
    receiptImageUrl: row.receipt_image_url,
  };
}

// ── Repository ────────────────────────────────────────────────────────────────

/**
 * Fetch all sales (with their line items) for the given driver ids.
 * Returns an empty array when Supabase is not configured.
 */
export async function fetchSales(driverIds: string[]): Promise<SaleRecord[]> {
  if (!isSupabaseConfigured || driverIds.length === 0) return [];

  const { data: salesRows, error: salesErr } = await supabase
    .from('sales')
    .select('*')
    .in('driver_id', driverIds)
    .order('date', { ascending: false });

  if (salesErr) {
    console.error('[saleRepository] fetchSales (sales) error:', salesErr.message);
    return [];
  }

  const rows = (salesRows ?? []) as DbSale[];
  if (rows.length === 0) return [];

  const saleIds = rows.map((r) => r.id);

  const { data: itemsRows, error: itemsErr } = await supabase
    .from('sale_items')
    .select('*')
    .in('sale_id', saleIds);

  if (itemsErr) {
    console.error('[saleRepository] fetchSales (items) error:', itemsErr.message);
    return rows.map((r) => toSaleRecord(r, []));
  }

  const itemsBySale = new Map<string, SaleLineItem[]>();
  for (const item of (itemsRows ?? []) as DbSaleItem[]) {
    const arr = itemsBySale.get(item.sale_id) ?? [];
    arr.push({
      productName: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
    });
    itemsBySale.set(item.sale_id, arr);
  }

  return rows.map((r) => toSaleRecord(r, itemsBySale.get(r.id) ?? []));
}

/**
 * Persist a completed sale and its line items atomically (sale + items in one
 * batch). The caller supplies a client-generated UUID for `id` so that local
 * state and DB always share the same id without any reconciliation.
 *
 * `receiptImageUrl` is the durable Supabase Storage public URL of the uploaded
 * receipt image (obtained via uploadReceiptImage). May be null when the driver
 * didn't attach a receipt.
 */
export async function createSale(
  id: string,
  driverId: string,
  date: string,
  items: SaleLineItem[],
  totalPrice: number,
  receiptImageUrl: string | null = null
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { error: saleErr } = await supabase
    .from('sales')
    .insert({
      id,
      driver_id: driverId,
      date,
      total_price: totalPrice,
      receipt_image_url: receiptImageUrl,
    });

  if (saleErr) {
    console.error('[saleRepository] createSale error:', saleErr.message);
    return; // abort — don't orphan sale_items with no parent sale
  }

  const { error: itemsErr } = await supabase.from('sale_items').insert(
    items.map((i) => ({
      sale_id: id,
      product_name: i.productName,
      quantity: i.quantity,
      unit_price: i.unitPrice,
    }))
  );

  if (itemsErr) {
    console.error('[saleRepository] createSale (items) error:', itemsErr.message);
    // Sale header exists but items failed — log for investigation.
    // A future retry/reconciliation job can replay these.
  }
}
