import { Smartphone, Globe, QrCode, CheckCircle2 } from 'lucide-react';

const STEPS = [
  {
    icon: Globe,
    title: 'Visit the Web App',
    description:
      'Open TrackTracker on your mobile browser by visiting the app URL. The progressive web app works on any device — no app store needed.',
  },
  {
    icon: Smartphone,
    title: 'Add to Home Screen',
    description:
      'Tap the "Add to Home Screen" option in your browser menu. This installs TrackTracker as a native-like app on your phone with full offline support.',
  },
  {
    icon: QrCode,
    title: 'Scan QR Code',
    description:
      'Alternatively, scan the QR code displayed on the download page with your phone camera to open the installation link directly.',
  },
  {
    icon: CheckCircle2,
    title: 'Start Using TrackTracker',
    description:
      'Launch the app from your home screen, create your company account, and start managing your distribution operations immediately.',
  },
];

export function InstallationGuide() {
  return (
    <section id="installation" className="section-padding bg-gray-50">
      <div className="container-max">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Text content */}
          <div className="reveal">
            <span className="inline-block px-4 py-1.5 bg-teal-100 text-teal-700 text-sm font-bold rounded-full mb-4">
              Installation Guide
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-6">
              How to Install{' '}
              <span className="text-gradient">TrackTracker</span>
            </h2>
            <p className="text-lg text-gray-500 leading-relaxed mb-8">
              TrackTracker is a Progressive Web App (PWA) that installs directly from your
              browser. No app store downloads, no updates to manage — it just works. Follow
              these simple steps to get started.
            </p>

            {/* Steps */}
            <div className="space-y-6">
              {STEPS.map((step, i) => (
                <div key={i} className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center">
                    <step.icon size={22} className="text-teal-700" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">{step.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Visual placeholder */}
          <div className="reveal">
            <div className="relative">
              {/* Phone mockup placeholder */}
              <div className="bg-gray-900 rounded-[2.5rem] p-4 shadow-2xl max-w-[280px] mx-auto">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-gray-900 rounded-b-xl z-10" />
                <div className="bg-gradient-to-br from-teal-700 to-teal-900 rounded-[2rem] aspect-[9/19.5] flex flex-col items-center justify-center gap-3">
                  <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                    <Smartphone size={32} className="text-white/60" />
                  </div>
                  <p className="text-white/70 font-bold text-sm">Installation Preview</p>
                  <p className="text-white/40 text-xs">Video placeholder</p>
                </div>
              </div>

              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-orange-100 rounded-2xl -z-10" />
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-teal-100 rounded-2xl -z-10" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
