import { Download, Shield, Zap } from 'lucide-react';

const PWA_URL = 'https://track-tracker-beta.vercel.app';

export function DownloadSection() {
  const handleInstallClick = () => {
    // Check if the PWA install prompt is available (set by App.tsx)
    const deferredPrompt = (window as any).deferredInstallPrompt;

    if (deferredPrompt) {
      // Show the native install prompt
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: { outcome: string }) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('PWA install accepted');
        }
        (window as any).deferredInstallPrompt = null;
      });
    } else {
      // No install prompt available — redirect to the PWA login page
      window.open(PWA_URL, '_blank', 'noopener');
    }
  };

  return (
    <section id="download" className="section-padding gradient-teal relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
      </div>

      <div className="container-max relative z-10">
        <div className="max-w-3xl mx-auto">
          {/* App Store style card */}
          <div className="reveal bg-white rounded-3xl shadow-2xl p-8 sm:p-12 text-center">
            {/* App icon */}
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl shadow-lg shadow-teal-700/30 mb-6 overflow-hidden">
              <img
                src="/icons/logo.png"
                alt="أيقونة تطبيق TrackTracker"
                width={96}
                height={96}
                className="w-full h-full object-cover"
              />
            </div>

            {/* App name */}
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-2">
              Track<span className="text-orange-500">Tracker</span>
            </h2>

            {/* Short description */}
            <p className="text-gray-500 text-lg mb-8">
              نظام إدارة عمليات التوزيع وتتبع المندوبين
            </p>

            {/* Download button */}
            <button
              onClick={handleInstallClick}
              className="btn-primary !bg-orange-500 !shadow-orange-500/30 hover:!bg-orange-600 w-full sm:w-auto cursor-pointer"
            >
              <Download size={22} />
              تحميل التطبيق
            </button>

            {/* Quick info */}
            <div className="mt-8 grid grid-cols-2 gap-4 text-center">
              <div className="flex flex-col items-center">
                <Shield size={20} className="text-teal-700 mb-1" />
                <span className="text-xs text-gray-500">آمن</span>
              </div>
              <div className="flex flex-col items-center">
                <Zap size={20} className="text-orange-500 mb-1" />
                <span className="text-xs text-gray-500">سريع</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
