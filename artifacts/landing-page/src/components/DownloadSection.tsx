import { Logo } from './Logo';
import { Download, Shield, Zap, Globe } from 'lucide-react';

export function DownloadSection() {
  return (
    <section id="download" className="section-padding gradient-teal relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
      </div>

      <div className="container-max relative z-10">
        <div className="max-w-3xl mx-auto">
          {/* App Store style card */}
          <div className="reveal bg-white rounded-3xl shadow-2xl p-8 sm:p-12 text-center">
            {/* App icon */}
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl gradient-hero shadow-lg shadow-teal-700/30 mb-6">
              <Logo size="sm" showText={false} />
            </div>

            {/* App name */}
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-2">
              Track<span className="text-orange-500">Tracker</span>
            </h2>

            {/* Short description */}
            <p className="text-gray-500 text-lg mb-2">
              Distribution Management & Tracking System
            </p>

            {/* Rating */}
            <div className="flex items-center justify-center gap-1 mb-8">
              {[1, 2, 3, 4, 5].map((star) => (
                <svg
                  key={star}
                  className={`w-5 h-5 ${star <= 4 ? 'text-amber-400' : 'text-gray-300'}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
              <span className="text-sm text-gray-500 ml-2">4.8 (250+ reviews)</span>
            </div>

            {/* Download button */}
            <a
              href="#download-app"
              className="btn-primary !bg-orange-500 !shadow-orange-500/30 hover:!bg-orange-600 w-full sm:w-auto"
            >
              <Download size={22} />
              Download App
            </a>

            {/* Quick info */}
            <div className="mt-8 grid grid-cols-3 gap-4 text-center">
              <div className="flex flex-col items-center">
                <Shield size={20} className="text-teal-700 mb-1" />
                <span className="text-xs text-gray-500">Secure</span>
              </div>
              <div className="flex flex-col items-center">
                <Zap size={20} className="text-orange-500 mb-1" />
                <span className="text-xs text-gray-500">Fast</span>
              </div>
              <div className="flex flex-col items-center">
                <Globe size={20} className="text-teal-700 mb-1" />
                <span className="text-xs text-gray-500">Works Offline</span>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="reveal mt-12 grid grid-cols-3 gap-6 text-center">
            <div className="text-white">
              <div className="text-3xl sm:text-4xl font-extrabold mb-1">10K+</div>
              <div className="text-white/60 text-sm">Active Users</div>
            </div>
            <div className="text-white">
              <div className="text-3xl sm:text-4xl font-extrabold mb-1">50K+</div>
              <div className="text-white/60 text-sm">Deliveries Tracked</div>
            </div>
            <div className="text-white">
              <div className="text-3xl sm:text-4xl font-extrabold mb-1">99.9%</div>
              <div className="text-white/60 text-sm">Uptime</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
