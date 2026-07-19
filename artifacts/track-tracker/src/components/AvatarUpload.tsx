import { ReactNode } from 'react';
import { Camera } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Shared profile-picture / logo upload circle used by both the Company and
 * Driver profile pages. Same dimensions and style everywhere: 96px circle,
 * primary-tinted border, camera button anchored bottom-left.
 *
 * NOTE: Uses <label htmlFor> instead of programmatic .click() so that file
 * selection works inside sandboxed iframes (e.g. Replit Preview). Browsers
 * block file dialogs opened via scripted .click() in cross-origin iframes but
 * always honour a label–input association as a direct user gesture.
 */
export function AvatarUpload({
  imageUrl,
  onChange,
  placeholder,
  alt,
  testId = 'input-avatar',
}: {
  imageUrl: string | null | undefined;
  onChange: (url: string) => void;
  placeholder: ReactNode;
  alt: string;
  testId?: string;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Use FileReader (base64 data URL) instead of URL.createObjectURL —
    // blob: URLs are blocked by browsers inside cross-origin iframes (e.g.
    // Replit Preview), whereas data: URLs have no origin restrictions.
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === 'string') onChange(result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="relative mb-5">
      <div
        className="w-24 h-24 rounded-full border-[3px] border-primary/25 bg-primary/10
                   flex items-center justify-center overflow-hidden
                   shadow-[0_4px_20px_rgba(13,77,90,0.15)]"
      >
        {imageUrl ? (
          <img src={imageUrl} alt={alt} className="w-full h-full object-cover" />
        ) : (
          placeholder
        )}
      </div>

      {/* label activates the file input natively — works in sandboxed iframes */}
      <motion.label
        htmlFor={testId}
        whileTap={{ scale: 0.88 }}
        className="absolute bottom-0 left-0 w-8 h-8 rounded-full flex items-center
                   justify-center border-2 border-white shadow-md cursor-pointer"
        style={{ background: '#C97A56' }}
      >
        <Camera size={13} color="white" />
      </motion.label>
      <input
        id={testId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
        data-testid={testId}
      />
    </div>
  );
}
