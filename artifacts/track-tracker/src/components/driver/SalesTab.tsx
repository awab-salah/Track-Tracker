import { useRef, useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCart, Image as ImageIcon, X, ChevronDown, Trash2, Plus, Loader2, Search } from 'lucide-react';
import { AppButton } from '@/components/AppButton';
import { QuantityStepper } from '@/components/QuantityStepper';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/hooks/use-toast';
import { uploadReceiptImage } from '@/lib/storage';
import { getDriverProducts, formatIQD, type SaleLineItem } from '@/data/mockData';

/** A product line the driver has picked for the current sale, before submitting. */
interface DraftItem extends SaleLineItem {
  available: number;
}

// ── Sale draft persistence ────────────────────────────────────────────────────
//
// On Android/Capacitor, opening the camera launches a separate Activity.
// When the user takes a photo and confirms, Android may recreate the WebView
// Activity (especially on memory-constrained devices), causing a full page
// reload that destroys ALL React state — including the in-progress sale draft
// (items, receiptUrl, etc.).
//
// We cannot prevent Android from recreating the Activity. Instead, we persist
// the sale draft to sessionStorage BEFORE the camera/gallery opens, and
// restore it on mount. sessionStorage is scoped to the current tab and cleared
// when the tab closes — appropriate for a temporary draft.
//
// This is the same pattern used by ProfilePage and AvatarUpload (which persist
// the logo URL to Supabase, surviving refresh). Here we persist the full draft
// locally since the sale hasn't been submitted yet.

const DRAFT_KEY = 'tt_sales_draft';

interface SaleDraft {
  items: DraftItem[];
  receiptUrl: string | null;
}

function saveDraft(draft: SaleDraft): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // sessionStorage unavailable or quota exceeded — best effort
  }
}

function loadDraft(): SaleDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SaleDraft;
  } catch {
    return null;
  }
}

function clearDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // best effort
  }
}

export function SalesTab() {
  const { currentDriver, loads, addSale } = useApp();
  const { toast } = useToast();
  const pickerRef = useRef<HTMLDivElement>(null);

  // Restore draft from sessionStorage on mount (survives Android Activity recreation)
  const [items, setItems] = useState<DraftItem[]>(() => {
    const draft = loadDraft();
    return draft?.items ?? [];
  });
  const [receiptUrl, setReceiptUrl] = useState<string | null>(() => {
    const draft = loadDraft();
    return draft?.receiptUrl ?? null;
  });

  const [pickerOpen, setPickerOpen] = useState(true);
  const [pendingQuantities, setPendingQuantities] = useState<Record<string, number>>({});
  const [selectedProducts, setSelectedProducts] = useState<Record<string, boolean>>({});
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const allProducts = currentDriver ? getDriverProducts(loads, currentDriver.id) : [];
  const products = useMemo(() => {
    if (!productSearch.trim()) return allProducts;
    const q = productSearch.trim().toLowerCase();
    return allProducts.filter((p) => p.productName.toLowerCase().includes(q));
  }, [allProducts, productSearch]);
  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  // Keep draft in sync with sessionStorage so it's always up-to-date
  // before the user opens the camera/gallery.
  useEffect(() => {
    if (items.length > 0 || receiptUrl) {
      saveDraft({ items, receiptUrl });
    } else {
      clearDraft();
    }
  }, [items, receiptUrl]);

  /** Opens the product picker and scrolls it into view, so it's always
   *  reachable even after items have already been added lower on the page. */
  const openPicker = () => {
    setPickerOpen(true);
    requestAnimationFrame(() => {
      pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const toggleProduct = (productName: string) => {
    setSelectedProducts((prev) => ({ ...prev, [productName]: !prev[productName] }));
    setPendingQuantities((prev) => ({ ...prev, [productName]: prev[productName] ?? 1 }));
  };

  const handleAdd = () => {
    const chosen = products.filter((p) => selectedProducts[p.productName]);
    if (chosen.length === 0) return;

    const newItems: DraftItem[] = chosen.map((p) => ({
      productName: p.productName,
      quantity: Math.min(pendingQuantities[p.productName] ?? 1, p.available),
      unitPrice: p.unitPrice,
      available: p.available,
    }));

    setItems((prev) => {
      const merged = [...prev];
      for (const item of newItems) {
        const idx = merged.findIndex((m) => m.productName === item.productName);
        if (idx >= 0) merged[idx] = item;
        else merged.push(item);
      }
      return merged;
    });

    setSelectedProducts({});
    setPendingQuantities({});
    setProductSearch('');
    setPickerOpen(false);
  };

  const updateItemQuantity = (productName: string, quantity: number) => {
    setItems((prev) =>
      prev.map((i) => (i.productName === productName ? { ...i, quantity } : i))
    );
  };

  const removeItem = (productName: string) => {
    setItems((prev) => prev.filter((i) => i.productName !== productName));
  };

  /** Save draft to sessionStorage right before the file picker opens.
   *  This is called via the <input onClick> handler, which fires when
   *  the native <label htmlFor> click is forwarded to the input —
   *  BEFORE the file chooser dialog opens. This is the same approach
   *  used by ProfilePage and AvatarUpload (which don't need explicit
   *  draft saving because they persist the URL to Supabase immediately). */
  const handleReceiptInputClick = () => {
    saveDraft({ items, receiptUrl });
  };

  const handleReceiptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    // FileReader produces a data: URL which works inside cross-origin iframes;
    // blob: URLs (URL.createObjectURL) are blocked in that context (e.g. Replit Preview).
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === 'string') setReceiptPreview(result);
    };
    reader.readAsDataURL(file);
    setReceiptUploading(true);

    try {
      const publicUrl = await uploadReceiptImage(file);
      if (!publicUrl) throw new Error('Upload failed');
      setReceiptPreview(null);
      setReceiptUrl(publicUrl);
    } catch (err) {
      console.error('[SalesTab] receipt upload failed:', err);
      setReceiptPreview(null);
      toast({ title: 'فشل رفع صورة الإيصال', variant: 'destructive' });
    } finally {
      setReceiptUploading(false);
    }
  };

  const handleSell = () => {
    if (items.length === 0) return;
    addSale(
      items.map(({ productName, quantity, unitPrice }) => ({ productName, quantity, unitPrice })),
      receiptUrl
    );
    toast({ title: 'تم تسجيل عملية البيع بنجاح' });
    setItems([]);
    setReceiptUrl(null);
    setReceiptPreview(null);
    setPickerOpen(true);
    clearDraft();
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-8">
      {/* ── Product picker ── */}
      <div
        ref={pickerRef}
        className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]"
      >
        <button
          onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
          className="w-full flex items-center justify-between px-4 py-3.5"
          data-testid="btn-toggle-product-picker"
        >
          <ChevronDown
            size={18}
            className={`text-muted-foreground transition-transform ${pickerOpen ? 'rotate-180' : ''}`}
          />
          <span className="font-extrabold text-[15px] text-foreground">اختيار المنتجات من الحمولة</span>
        </button>

        {pickerOpen && (
          <div className="px-4 pb-4 flex flex-col gap-2">
            {/* ── Search field ── */}
            {allProducts.length > 0 && (
              <div className="relative">
                <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="بحث عن منتج…"
                  className="w-full pr-9 pl-3 py-2 text-sm rounded-lg border border-border bg-muted/30 placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                  dir="rtl"
                />
              </div>
            )}

            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-center">
                {productSearch.trim() ? 'لا توجد منتجات مطابقة للبحث' : 'لا توجد منتجات متاحة في الحمولة الحالية'}
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
                {products.map((p) => {
                  const isSelected = !!selectedProducts[p.productName];
                  return (
                    <div
                      key={p.productName}
                      className={`rounded-xl border px-3 py-2.5 transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-muted/40'
                      }`}
                    >
                      <button
                        onClick={() => toggleProduct(p.productName)}
                        className="w-full flex items-center justify-between"
                        data-testid={`btn-select-product-${p.productName}`}
                      >
                        <span className="text-xs text-muted-foreground">
                          متاح: {p.available} · {formatIQD(p.unitPrice)}
                        </span>
                        <span className="text-[13px] font-bold text-foreground">{p.productName}</span>
                      </button>

                      {isSelected && (
                        <div className="flex items-center justify-between mt-3">
                          <QuantityStepper
                            value={pendingQuantities[p.productName] ?? 1}
                            onChange={(v) =>
                              setPendingQuantities((prev) => ({ ...prev, [p.productName]: v }))
                            }
                            min={1}
                            max={p.available}
                            testId={`stepper-sale-${p.productName}`}
                          />
                          <span className="text-xs text-muted-foreground">الكمية</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {products.length > 0 && (
              <AppButton
                variant="secondary"
                className="mt-2 min-h-[48px]"
                onClick={handleAdd}
                disabled={Object.values(selectedProducts).every((v) => !v)}
                data-testid="btn-add-selected-products"
              >
                إضافة إلى قائمة البيع
              </AppButton>
            )}
          </div>
        )}
      </div>

      {/* ── Selected items card list ── */}
      {items.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06] flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} className="text-primary shrink-0" />
              <h3 className="font-extrabold text-[15px] text-foreground">منتجات البيع</h3>
            </div>
            {!pickerOpen && (
              <button
                onClick={openPicker}
                className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 transition-colors shrink-0"
                data-testid="btn-add-more-products"
              >
                <Plus size={14} />
                إضافة منتجات
              </button>
            )}
          </div>

          {items.map((item) => (
            <div
              key={item.productName}
              className="flex items-center justify-between bg-muted/50 rounded-xl px-3 py-2.5 gap-3"
            >
              <button
                onClick={() => removeItem(item.productName)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                data-testid={`btn-remove-item-${item.productName}`}
              >
                <Trash2 size={15} />
              </button>
              <QuantityStepper
                value={item.quantity}
                onChange={(v) => updateItemQuantity(item.productName, v)}
                min={1}
                max={item.available}
                testId={`stepper-cart-${item.productName}`}
              />
              <div className="text-right flex-1">
                <p className="text-[13px] font-bold text-foreground">{item.productName}</p>
                <p className="text-xs text-muted-foreground">{formatIQD(item.unitPrice * item.quantity)}</p>
              </div>
            </div>
          ))}

          {/* ── Receipt capture ── */}
          <div className="pt-1">
            <p className="text-xs text-muted-foreground font-semibold mb-2">صورة الإيصال (اختياري)</p>
            {receiptUploading && receiptPreview ? (
              <div className="relative w-full h-36 rounded-xl overflow-hidden bg-muted">
                <img src={receiptPreview} alt="جارٍ الرفع…" className="w-full h-full object-contain opacity-70" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="animate-spin text-white" size={22} />
                </div>
              </div>
            ) : receiptUrl ? (
              <div className="relative w-full h-36 rounded-xl overflow-hidden bg-muted">
                <img src={receiptUrl} alt="الإيصال" className="w-full h-full object-contain" />
                <button
                  onClick={() => setReceiptUrl(null)}
                  className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center"
                  data-testid="btn-remove-receipt"
                >
                  <X size={14} className="text-white" />
                </button>
              </div>
            ) : (
              // Gallery-only button (camera temporarily disabled due to Android/PWA flicker)
              <label
                htmlFor="receipt-image"
                className={`w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer ${receiptUploading ? 'opacity-50 pointer-events-none' : ''}`}
                data-testid="btn-capture-gallery"
              >
                <ImageIcon size={16} /> اختيار صورة من المعرض
              </label>
            )}
            {/* Hidden file input — id required for <label htmlFor> association.
                NO capture='environment' — this opens the system file chooser
                (which includes Camera + Gallery + Files) instead of the
                camera-only Activity. Same pattern as ProfilePage/AvatarUpload. */}
            <input
              id="receipt-image"
              type="file"
              accept="image/*"
              className="hidden"
              onClick={handleReceiptInputClick}
              onChange={handleReceiptFile}
              disabled={receiptUploading}
            />
          </div>

          {/* ── Total & submit ── */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <motion.span
              key={totalAmount}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="text-lg font-extrabold"
              style={{ color: '#C97A56' }}
              data-testid="text-total-sale-amount"
            >
              {formatIQD(totalAmount)}
            </motion.span>
            <span className="text-sm font-bold text-foreground">إجمالي مبلغ البيع</span>
          </div>

          <AppButton onClick={handleSell} data-testid="btn-sell">
            بيع
          </AppButton>
        </div>
      )}
    </div>
  );
}
