import { UserPlus, Truck, Package, BarChart3 } from 'lucide-react';

const STEPS = [
  {
    number: '١',
    icon: UserPlus,
    title: 'سجّل شركتك',
    description:
      'أنشئ حساب شركتك في ثوانٍ. أعدّ ملف المؤسسة، خصّص إعدادات التوزيع، وادعُ أعضاء فريقك للبدء فورًا.',
    color: 'bg-teal-700',
    ring: 'ring-teal-200',
  },
  {
    number: '٢',
    icon: Truck,
    title: 'أضف سائقيك',
    description:
      'أضف السائقين إلى أسطولك مع ملفاتهم ومعلومات الاتصال. يحصل كل سائق على حسابه الخاص للوصول إلى المسارات والتوصيلات وأدوات المبيعات أثناء التنقل.',
    color: 'bg-orange-500',
    ring: 'ring-orange-200',
  },
  {
    number: '٣',
    icon: Package,
    title: 'خصّص التوصيلات والشحنات',
    description:
      'أنشئ تعيينات التوصيل وأوامر الشحن مع تفاصيل كاملة. خصّصها للسائقين، حدّد المسارات، وتتبع التقدم من المستودع حتى باب العميل.',
    color: 'bg-teal-700',
    ring: 'ring-teal-200',
  },
  {
    number: '٤',
    icon: BarChart3,
    title: 'تتبع لحظيًا',
    description:
      'راقب كل توصيلة وكل عملية بيع وكل حركة سائق في الوقت الحقيقي. ادخل إلى لوحات معلومات شاملة، أنشئ تقارير، واتخذ قرارات مبنية على البيانات لتحسين عملياتك.',
    color: 'bg-orange-500',
    ring: 'ring-orange-200',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section-padding bg-gray-50">
      <div className="container-max">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16 reveal">
          <span className="inline-block px-4 py-1.5 bg-orange-100 text-orange-600 text-sm font-bold rounded-full mb-4">
            كيف يعمل
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-6">
            جاهز للعمل{' '}
            <span className="text-gradient">في 4 خطوات بسيطة</span>
          </h2>
          <p className="text-lg text-gray-500 leading-relaxed">
            البدء مع TrackTracker سريع وسهل. اتّبع هذه الخطوات الأربع لتحويل عمليات
            التوزيع والبدء في رؤية النتائج فورًا.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {STEPS.map((step, i) => (
            <div
              key={step.number}
              className="reveal relative"
              style={{ transitionDelay: `${i * 0.1}s` }}
            >
              {/* Connector line (desktop only) */}
              {i < STEPS.length - 1 && (
                <div className="hidden lg:block absolute top-12 left-[calc(50%+40px)] w-[calc(100%-80px)] h-0.5 bg-gray-200" aria-hidden="true">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-300 rounded-full" />
                </div>
              )}

              <div className="text-center">
                {/* Step number ring */}
                <div className="relative inline-flex items-center justify-center mb-6">
                  <div
                    className={`w-24 h-24 ${step.color} rounded-3xl flex items-center justify-center shadow-lg ring-4 ${step.ring}`}
                  >
                    <step.icon size={36} className="text-white" strokeWidth={2} />
                  </div>
                  <span className="absolute -top-2 -left-2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center text-sm font-extrabold text-gray-900">
                    {step.number}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>

                {/* Description */}
                <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
