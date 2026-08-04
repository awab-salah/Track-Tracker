import { ArrowDown, Download } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative gradient-hero min-h-[60vh] sm:min-h-[65vh] flex items-center overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-72 h-72 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-teal-400/10 rounded-full blur-3xl" />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="container-max px-4 sm:px-6 lg:px-8 pt-20 pb-12 relative z-10">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
          {/* Logo */}
          <div className="animate-fade-in-up mb-4 flex flex-col items-center gap-3">
            <img
              src="/icons/logo.png"
              alt="شعار TrackTracker"
              width={96}
              height={96}
              className="w-20 h-20 sm:w-24 sm:h-24 drop-shadow-2xl"
            />
            <h1 className="font-extrabold tracking-tight leading-tight text-3xl sm:text-4xl lg:text-5xl">
              <span className="text-white">Track</span>
              <span className="text-orange-400">Tracker</span>
            </h1>
          </div>

          {/* Subtitle */}
          <p className="text-xl sm:text-2xl text-white/90 font-bold mb-2 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            نظامك الذكي لإدارة عمليات التوزيع وتتبع المندوبين
          </p>

          {/* Description */}
          <p className="text-base sm:text-lg text-white/60 max-w-2xl mb-8 animate-fade-in-up leading-relaxed" style={{ animationDelay: '0.3s' }}>
            تتبّع مندوبيك لحظيًا، سجّل المبيعات، وأدِر عمليات التوزيع بكفاءة
            — كل ذلك من منصة واحدة.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.45s' }}>
            <a
              href="#download"
              className="btn-primary !bg-orange-500 !shadow-orange-500/30 hover:!bg-orange-600"
            >
              <Download size={20} />
              تحميل التطبيق
            </a>
            <a
              href="#installation"
              className="btn-secondary !bg-transparent !border-white/30 !text-white hover:!bg-white/10"
            >
              <ArrowDown size={20} />
              طريقة التثبيت
            </a>
          </div>
        </div>
      </div>

      {/* Bottom wave */}
      <div className="absolute bottom-0 left-0 right-0" aria-hidden="true">
        <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <path d="M0 100L60 87C120 75 240 50 360 43C480 37 600 50 720 56C840 62 960 62 1080 56C1200 50 1320 37 1380 31L1440 25V100H1380C1320 100 1200 100 1080 100C960 100 840 100 720 100C600 100 480 100 360 100C240 100 120 100 60 100H0Z" fill="white" />
        </svg>
      </div>
    </section>
  );
}
