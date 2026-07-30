import { Package } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  white?: boolean;
}

const SIZES = {
  sm: { pin: 28, pkg: 12, text: 'text-xl' },
  md: { pin: 40, pkg: 16, text: 'text-2xl' },
  lg: { pin: 56, pkg: 22, text: 'text-3xl' },
  xl: { pin: 80, pkg: 32, text: 'text-5xl' },
};

export function Logo({ size = 'md', showText = true, white = false }: LogoProps) {
  const { pin, pkg, text } = SIZES[size];
  const pinH = Math.round(pin * 1.3);
  const circleAreaH = Math.round(pinH * 0.56);

  return (
    <div className="flex items-center gap-2">
      {/* Pin + icon */}
      <div className="relative flex flex-col items-center">
        <svg
          width={pin}
          height={pinH}
          viewBox="0 0 100 130"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M50 2C28.46 2 11 19.46 11 41C11 63.5 50 128 50 128C50 128 89 63.5 89 41C89 19.46 71.54 2 50 2Z"
            fill={white ? '#FFFFFF' : '#104C64'}
          />
          <circle cx="50" cy="41" r="26" fill={white ? 'rgba(255,255,255,0.2)' : 'white'} />
        </svg>

        {/* Package icon centred inside the circular part */}
        <div
          className="absolute inset-x-0 top-0 flex items-center justify-center"
          style={{ height: circleAreaH }}
          aria-hidden="true"
        >
          <Package size={pkg} color={white ? '#FFFFFF' : '#C97A56'} strokeWidth={2.2} />
        </div>
      </div>

      {showText && (
        <span className={`font-extrabold tracking-tight leading-tight ${text}`}>
          <span style={{ color: white ? '#FFFFFF' : '#0D3B4A' }}>Track</span>
          <span style={{ color: white ? '#FFFFFF' : '#C97A56' }}>Tracker</span>
        </span>
      )}
    </div>
  );
}
