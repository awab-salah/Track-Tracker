import { Globe, Share, CheckCircle2, Download } from 'lucide-react';

const STEPS = [
  {
    icon: Globe,
    title: 'افتح التطبيق في المتصفح',
    description:
      'افتح TrackTracker في متصفح هاتفك. التطبيق يعمل على أي جهاز — لا حاجة لمتجر تطبيقات.',
  },
  {
    icon: Share,
    title: 'اضغط "إضافة إلى الشاشة الرئيسية"',
    description:
      'اضغط على زر ⋮ (الثلاث نقاط العمودية الموجودة في المتصفح) ثم اختر "إضافة إلى الشاشة الرئيسية".',
  },
  {
    icon: Download,
    title: 'ثبّت التطبيق',
    description:
      'سيظهر TrackTracker على شاشتك الرئيسية كتطبيق عادي مع دعم الإشعارات.',
  },
  {
    icon: CheckCircle2,
    title: 'ابدأ الاستخدام',
    description:
      'افتح التطبيق من شاشتك الرئيسية، أنشئ حساب شركتك، وابدأ بإدارة عمليات التوزيع فورًا.',
  },
];

export function InstallationGuide() {
  return (
    <section id="installation" className="section-padding bg-gray-50 overflow-x-clip">
      <div className="container-max">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Text content */}
          <div className="reveal">
            <span className="inline-block px-4 py-1.5 bg-teal-100 text-teal-700 text-sm font-bold rounded-full mb-4">
              دليل التثبيت
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-6">
              كيف تثبّت{' '}
              <span className="text-gradient">TrackTracker</span>
            </h2>
            <p className="text-lg text-gray-500 leading-relaxed mb-8">
              TrackTracker تطبيق ويب يعمل مباشرة من المتصفح. لا تحتاج لتحميله من متجر تطبيقات، والتحديثات تتم تلقائيًا.
            </p>

            {/* Steps */}
            <div className="space-y-6">
              {STEPS.map((step, i) => (
                <div key={i} className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-teal-700 to-teal-800 rounded-xl shadow-md shadow-teal-700/20 flex items-center justify-center">
                    <step.icon size={22} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">{step.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Installation tutorial video */}
          <div className="reveal">
            <p className="text-center text-sm sm:text-base font-semibold text-gray-600 mb-4 leading-relaxed">
              فيديو توضيحي لطريقة التنزيل وإنشاء الحساب وطريقة استخدام التطبيق
            </p>
            <div className="relative">
              {/* Video container — responsive portrait video, phone-like frame */}
              <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-gray-900/10 mx-auto w-full max-w-[360px] sm:max-w-[400px] md:max-w-[440px] lg:max-w-[480px]">
                <video
                  className="w-full h-auto block"
                  controls
                  preload="metadata"
                  poster="/icons/logo.png"
                  playsInline
                >
                  <source src="/installation-guide.mp4" type="video/mp4" />
                  متصفحك لا يدعم تشغيل الفيديو.
                </video>
              </div>

              {/* Decorative elements */}
              <div className="absolute -top-3 -left-3 w-20 h-20 bg-orange-100 rounded-2xl -z-10" />
              <div className="absolute -bottom-3 -right-3 w-24 h-24 bg-teal-100 rounded-2xl -z-10" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
