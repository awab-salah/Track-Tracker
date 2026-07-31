import { Smartphone, Globe, Share, CheckCircle2, Download } from 'lucide-react';

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
      'في متصفح Chrome (أندرويد) اضغط على أيقونة المشاركة ثم "إضافة إلى الشاشة الرئيسية". في Safari (آيفون) اضغط على أيقونة المشاركة ثم "إضافة إلى الشاشة الرئيسية".',
  },
  {
    icon: Download,
    title: 'ثبّت التطبيق',
    description:
      'سيتم تثبيت TrackTracker كتطبيق أصلي على هاتفك مع دعم كامل للعمل بدون إنترنت والإشعارات الفورية.',
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
    <section id="installation" className="section-padding bg-gray-50">
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
              TrackTracker هو تطبيق ويب تقدمي (PWA) يثبّت مباشرة من المتصفح. لا حاجة
              لتحميله من متجر تطبيقات، ولا حاجة لإدارة التحديثات — كل شيء يعمل تلقائيًا.
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

          {/* Right: Visual mockup */}
          <div className="reveal">
            <div className="relative">
              {/* Phone mockup */}
              <div className="relative bg-gray-900 rounded-[2.5rem] p-4 shadow-2xl max-w-[280px] mx-auto">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-gray-900 rounded-b-xl z-10" />
                <div className="bg-gradient-to-br from-teal-700 to-teal-900 rounded-[2rem] aspect-[9/19.5] flex flex-col items-center justify-center gap-4 p-6">
                  <div className="w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                    <Smartphone size={32} className="text-white/60" />
                  </div>
                  <p className="text-white/80 font-bold text-sm text-center">TrackTracker</p>
                  <p className="text-white/40 text-xs text-center">اضغط "إضافة إلى الشاشة الرئيسية"</p>
                  <div className="mt-4 px-4 py-2 bg-white/10 rounded-xl">
                    <p className="text-white/60 text-xs font-medium">⬆ إضافة إلى الشاشة الرئيسية</p>
                  </div>
                </div>
              </div>

              {/* Decorative elements */}
              <div className="absolute -top-4 -left-4 w-24 h-24 bg-orange-100 rounded-2xl -z-10" />
              <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-teal-100 rounded-2xl -z-10" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
