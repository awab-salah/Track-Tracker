import { useRef, useState, ReactNode } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Shared profile-picture / logo upload circle used by both the Company and
 * Driver profile pages. Same dimensions and style everywhere: 96px circle,
 * primary-tinted border, camera button anchored bottom-left.
 *
 * `onUpload` performs the real upload (to permanent storage) and must
 * throw on failure — this component owns the loading/error UI around it so
 * both callers get consistent behaviour: a spinner while uploading, and an
 * inline error message (never a silent no-op) if it fails.
 */
export function AvatarUpload({
  imageUrl,
  onUpload,
  placeholder,
  alt,
  testId = 'input-avatar',
}: {
  imageUrl: string | null | undefined;
  onUpload: (file: File) => Promise<void>;
  placeholder: ReactNode;
  alt: string;
  testId?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again still fires onChange next time.
    e.target.value = '';
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      console.error('[AvatarUpload] upload failed:', err);
      setError('فشل رفع الصورة، حاول مرة أخرى');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative mb-5">
      <div
        className="w-24 h-24 rounded-full border-[3px] border-primary/25 bg-primary/10
                   flex items-center justify-center overflow-hidden relative
                   shadow-[0_4px_20px_rgba(13,77,90,0.15)]"
      >
        {imageUrl ? (
          <img src={imageUrl} alt={alt} className="w-full h-full object-cover" />
        ) : (
          placeholder
        )}

        {uploading && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
            <Loader2 size={22} className="text-white animate-spin" />
          </div>
        )}
      </div>

      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="absolute bottom-0 left-0 w-8 h-8 rounded-full flex items-center
                   justify-center border-2 border-white shadow-md disabled:opacity-60"
        style={{ background: '#C97A56' }}
        type="button"
        data-testid={`btn-${testId}`}
      >
        <Camera size={13} color="white" />
      </motion.button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
        disabled={uploading}
        data-testid={testId}
      />

      {error && (
        <p className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-40 text-[11px] text-red-500 text-center leading-snug">
          {error}
        </p>
      )}
    </div>
  );
}
