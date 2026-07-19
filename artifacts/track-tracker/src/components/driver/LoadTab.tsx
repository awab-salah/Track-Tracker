import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Package, PlusCircle, Pencil } from 'lucide-react';
import { AppInput } from '@/components/AppInput';
import { AppButton } from '@/components/AppButton';
import { QuantityStepperInput } from '@/components/QuantityStepperInput';
import { useApp } from '@/store/AppContext';
import { useToast } from '@/hooks/use-toast';
import { formatIQD, type CargoItem } from '@/data/mockData';

interface LoadTabProps {
  editingLoad: CargoItem | null;
  onDoneEditing: () => void;
}

/**
 * Load tab: add/edit a product in the driver's current load. Saved data
 * flows through AppContext (`upsertLoad`) so it automatically appears in
 * Driver Statistics, Company Driver Details, Company Statistics, and charts.
 */
export function LoadTab({ editingLoad, onDoneEditing }: LoadTabProps) {
  const { upsertLoad } = useApp();
  const { toast } = useToast();

  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [errors, setErrors] = useState<{ productName?: string; unitPrice?: string }>({});

  useEffect(() => {
    if (editingLoad) {
      setProductName(editingLoad.productName);
      setQuantity(editingLoad.quantity);
      setUnitPrice(String(editingLoad.unitPrice));
    }
  }, [editingLoad]);

  const resetForm = () => {
    setProductName('');
    setQuantity(1);
    setUnitPrice('');
    setErrors({});
  };

  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!productName.trim()) nextErrors.productName = 'اسم المنتج مطلوب';
    const priceValue = Number(unitPrice);
    if (!unitPrice || Number.isNaN(priceValue) || priceValue <= 0) {
      nextErrors.unitPrice = 'أدخل سعراً صحيحاً أكبر من صفر';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    upsertLoad({
      id: editingLoad?.id,
      productName: productName.trim(),
      quantity,
      unitPrice: priceValue,
    });

    toast({ title: editingLoad ? 'تم تحديث الحمولة' : 'تمت إضافة المنتج للحمولة' });
    resetForm();
    onDoneEditing();
  };

  return (
    <motion.div
      key="load-tab"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="flex-1 overflow-y-auto p-4"
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-black/[0.04] dark:border-white/[0.06]">
        <div className="flex items-center gap-2 mb-4">
          {editingLoad ? (
            <Pencil size={16} className="text-primary shrink-0" />
          ) : (
            <PlusCircle size={16} className="text-primary shrink-0" />
          )}
          <h3 className="font-extrabold text-[15px] text-foreground">
            {editingLoad ? 'تعديل المنتج' : 'إضافة منتج للحمولة'}
          </h3>
        </div>

        <div className="flex flex-col gap-4">
          <AppInput
            label="اسم المنتج (مع الوحدة)"
            placeholder="مثال: سكر أبيض (كيس)"
            value={productName}
            onChange={(e) => {
              setProductName(e.target.value);
              setErrors((prev) => ({ ...prev, productName: undefined }));
            }}
            hint={errors.productName}
            data-testid="input-load-product-name"
          />

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-foreground">الكمية</label>
            <QuantityStepperInput value={quantity} onChange={setQuantity} min={1} testId="stepper-load-quantity" />
          </div>

          <AppInput
            label="سعر الوحدة (بالدينار العراقي)"
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={unitPrice}
            onChange={(e) => {
              setUnitPrice(e.target.value);
              setErrors((prev) => ({ ...prev, unitPrice: undefined }));
            }}
            hint={errors.unitPrice}
            data-testid="input-load-unit-price"
          />

          {Number(unitPrice) > 0 && quantity > 0 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-bold" style={{ color: '#C97A56' }}>
                {formatIQD(Number(unitPrice) * quantity)}
              </span>
              <span className="text-xs text-muted-foreground">القيمة الإجمالية</span>
            </div>
          )}

          <div className="flex gap-3 mt-2">
            {editingLoad && (
              <AppButton
                type="button"
                variant="ghost"
                onClick={() => {
                  resetForm();
                  onDoneEditing();
                }}
                data-testid="btn-cancel-edit-load"
              >
                إلغاء
              </AppButton>
            )}
            <AppButton onClick={handleSave} data-testid="btn-save-load">
              <Package size={18} />
              {editingLoad ? 'حفظ التعديل' : 'حفظ'}
            </AppButton>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
