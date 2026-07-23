import { useRef, useState, ReactNode } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { uploadProfileImage } from '@/lib/storage';

/**
 * Shared profile-picture / logo upload circle used by both the Company and
 * Driver profile pages. Same dimensions and style everywhere: 96px circle,
 * primary-tinted border, camera button anchored bottom-left.
 *
 * Upload pipeline (FIXED — previously this just created a blob URL that was
 * discarded on refresh):
 *   1. User picks a file via the hidden <input type=file>
 *   2. We immediately show a local preview via URL.createObjectURL (instant UX)
 *   3. We upload the file to Supabase Storage (avatars bucket) via
 *      uploadProfileImage, which compresses it first
 *   4. On success we call onChange(publicUrl) with the durable public URL —
 *      the parent persists this to the DB via updateDriverProfile / updateLogo
 *   5. On failure we surface the error and revert the preview
 */
export function AvatarUpload({
  imageUrl,
  onChange,
  placeholder,
  alt,
  testId = 'input-avatar',
  kind = 'driver',
  onUploadStart,
  onUploadEnd,
}: {
  imageUrl: string | null | undefined;
  onChange: (url: string) => void;
  placeholder: ReactNode;
  alt: string;
  testId?: string;
  /** Cosmetic — goes into the storage object filename for traceability. */
  kind?: 'driver' | 'company';
  onUploadStart?: () => void;
  onUploadEnd?: (success: boolean, errorMsg?: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input value so picking the same file twice still fires onChange.
    e.target.value = '';
    if (!file) return;

    // Optimistic local preview via FileReader (data: URL) instead of
    // URL.createObjectURL (blob: URL) — blob: URLs are blocked by browsers
    // inside cross-origin iframes (e.g. Replit Preview), whereas data: URLs
    // have no origin restrictions.
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === 'string') setPreviewUrl(result);
    };
    reader.readAsDataURL(file);

    setUploading(true);
    setErrorMsg(null);
    onUploadStart?.();

    try {
      const publicUrl = await uploadProfileImage(file, kind);
      if (!publicUrl) {
        throw new Error('Upload failed — see console for details.');
      }
      // Clear the local preview — the durable public URL is now active.
      setPreviewUrl(null);
      onChange(publicUrl);
      onUploadEnd?.(true);
    } catch (err) {
      console.error('[AvatarUpload] upload failed:', err);
      setPreviewUrl(null);
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setErrorMsg(msg);
      onUploadEnd?.(false, msg);
    } finally {
      setUploading(false);
    }
  };

  // Prefer the optimistic preview while uploading; otherwise show the persisted URL.
  const displayUrl = uploading && previewUrl ? previewUrl : imageUrl;

  return (
    <div className="relative mb-5">
      <div
        className="w-24 h-24 rounded-full border-[3px] border-primary/25 bg-primary/10
                   flex items-center justify-center overflow-hidden
                   shadow-[0_4px_20px_rgba(13,77,90,0.15)]"
      >
        {displayUrl ? (
          <img src={displayUrl} alt={alt} className="w-full h-full object-cover" />
        ) : (
          placeholder
        )}
      </div>

      {/* label activates the file input natively — works inside sandboxed
          iframes (e.g. Replit Preview) where scripted .click() is blocked. */}
      <motion.label
        htmlFor={testId}
        whileTap={{ scale: 0.88 }}
        className="absolute bottom-0 left-0 w-8 h-8 rounded-full flex items-center
                   justify-center border-2 border-white shadow-md cursor-pointer"
        style={{ background: '#C97A56', opacity: uploading ? 0.6 : 1 }}
        aria-label="تغيير الصورة"
        data-testid="btn-avatar-upload"
      >
        {uploading ? (
          <Loader2 size={13} color="white" className="animate-spin" />
        ) : (
          <Camera size={13} color="white" />
        )}
      </motion.label>

      {errorMsg && (
        <p
          className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap
                     text-[10px] font-semibold text-red-500"
          data-testid="avatar-upload-error"
        >
          فشل رفع الصورة
        </p>
      )}

      <input
        id={testId}
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
        data-testid={testId}
        disabled={uploading}
      />
    </div>
  );
}
