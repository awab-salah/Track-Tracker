import { ReactNode } from "react";

export function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full bg-background flex justify-center overflow-x-hidden selection:bg-primary/20">
      <main className="w-full max-w-[430px] min-h-[100dvh] bg-background relative shadow-[0_0_40px_rgba(0,0,0,0.05)] flex flex-col">
        {children}
      </main>
    </div>
  );
}
