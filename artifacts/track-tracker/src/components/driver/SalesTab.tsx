import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Camera, Image as ImageIcon, X, ChevronDown, Trash2, Plus } from 'lucide-react';
import { AppButton } from '@/components/AppButton';
import { QuantityStepper } from '@/components/QuantityStepper';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/hooks/use-toast';
import { getDriverProducts, formatIQD, type SaleLineItem } from '@/data/mockData';

/** A product line the driver has picked for the current sale, before submitting. */
interface DraftItem extends SaleLineItem {
  available: number;
}

export function SalesTab() {
  const { currentDriver, loads, addSale } = useApp();
  const { toast } = useToast();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [pickerOpen, setPickerOpen] = useState(true);
  const [pendingQuantities, setPendingQuantities] = useState<Record<string, number>>({});
  const [selectedProducts, setSelectedProducts] = useState<Record<string, boolean>>({});
  const [items, setItems] = useState<DraftItem[]>([]);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const products = currentDriver ? getDriverProducts(loads, currentDriver.id) : [];
  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

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

  const handleReceiptFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptUrl(URL.createObjectURL(file));
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
    setPickerOpen(true);
  };

  return (
    <motion.div
      key="sales-tab"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-8"
    >
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

        <AnimatePresence initial={false}>
          {pickerOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="px-4 pb-4 flex flex-col gap-2">
                {products.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 text-center">
                    لا توجد منتجات متاحة في الحمولة الحالية
                  </p>
                ) : (
                  products.map((p) => {
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
                  })
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
            </motion.div>
          )}
        </AnimatePresence>
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
            {receiptUrl ? (
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
              <div className="flex gap-2">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  data-testid="btn-capture-camera"
                >
                  <Camera size={16} /> كاميرا
                </button>
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  data-testid="btn-capture-gallery"
                >
                  <ImageIcon size={16} /> المعرض
                </button>
              </div>
            )}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleReceiptFile}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleReceiptFile}
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
    </motion.div>
  );
}
