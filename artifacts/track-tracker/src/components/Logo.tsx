import { Package } from "lucide-react";

interface LogoProps {
  size?: "xs" | "sm" | "md" | "lg";
  showText?: boolean;
}

const SIZES = {
  xs: { pin: 38, pkg: 13, text: "text-lg" },
  sm: { pin: 52, pkg: 18, text: "text-2xl" },
  md: { pin: 72, pkg: 26, text: "text-3xl" },
  lg: { pin: 96, pkg: 34, text: "text-4xl" },
};

export function Logo({ size = "md", showText = true }: LogoProps) {
  const { pin, pkg, text } = SIZES[size];
  const pinH = Math.round(pin * 1.3);
  const circleAreaH = Math.round(pinH * 0.56);

  return (
    <div className="flex flex-col items-center gap-1">
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
            fill="#104C64"
          />
          <circle cx="50" cy="41" r="26" fill="white" />
        </svg>

        {/* Package icon centred inside the circular part of the pin */}
        <div
          className="absolute inset-x-0 top-0 flex items-center justify-center"
          style={{ height: circleAreaH }}
          aria-hidden="true"
        >
          <Package size={pkg} color="#C97A56" strokeWidth={2.2} />
        </div>

        {/* Subtle shadow ellipse under the pin tip */}
        <div
          className="rounded-full bg-black/[0.08]"
          style={{
            width: Math.round(pin * 0.44),
            height: Math.round(pin * 0.065),
            marginTop: -2,
          }}
        />
      </div>

      {showText && (
        <h1 className={`font-extrabold tracking-tight leading-tight ${text}`}>
          <span style={{ color: "#0D3B4A" }}>Track</span>
          <span style={{ color: "#C97A56" }}>Tracker</span>
        </h1>
      )}
    </div>
  );
}
