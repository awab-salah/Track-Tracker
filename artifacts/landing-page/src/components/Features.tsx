import {
  Truck,
  Package,
  ClipboardList,
  MapPin,
  BarChart3,
  Bell,
  CreditCard,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Truck,
    title: 'إدارة السائقين',
    description:
      'أضف وأدر وتتبع جميع سائقيك من مكان واحد. خصّص المسارات، راقب الأداء، وضمن المساءلة مع تحديثات الحالة اللحظية وملفات تعريف شاملة للسائقين.',
    color: 'from-teal-500 to-teal-700',
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-700',
  },
  {
    icon: Package,
    title: 'إدارة الشحنات',
    description:
      'نظّم وتتبع كل شحنة من المستودع حتى التوصيل. أدر المخزون، خصّص الشحنات للسائقين، وحافظ على رؤية كاملة عبر سلسلة التوزيع بأكملها.',
    color: 'from-orange-400 to-orange-600',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
  },
  {
    icon: ClipboardList,
    title: 'تسجيل المبيعات',
    description:
      'سجّل كل عملية بيع في الوقت الحقيقي مع تفاصيل البنود. أنشئ تقارير مبيعات شاملة وتتبع الإيرادات عبر جميع نقاط التوزيع.',
    color: 'from-blue-500 to-blue-700',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-700',
  },
  {
    icon: MapPin,
    title: 'تتبع GPS المباشر',
    description:
      'تتبع أسطولك لحظيًا بإحداثيات GPS حية على خريطة تفاعلية. راقب مواقع السائقين، حسّن مسارات التوصيل، وقلّل تكاليف الوقود مع التتبع الذكي.',
    color: 'from-green-500 to-green-700',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-700',
  },
  {
    icon: BarChart3,
    title: 'التقارير والتحليلات',
    description:
      'احصل على رؤى قابلة للتنفيذ مع لوحات معلومات وتحليلات فعّالة. تتبع مؤشرات الأداء الرئيسية، تصوّر الاتجاهات، واتخذ قرارات مبنية على البيانات لتحسين عمليات التوزيع.',
    color: 'from-purple-500 to-purple-700',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-700',
  },
  {
    icon: Bell,
    title: 'الإشعارات',
    description:
      'تلقَّ إشعارات فورية عند عمليات البيع والتحديثات المهمة. لا تفوّت أي حدث حرج مع تفضيلات تنبيه قابلة للتخصيص.',
    color: 'from-red-500 to-red-700',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-700',
  },
  {
    icon: CreditCard,
    title: 'إدارة الاشتراكات',
    description:
      'خطط اشتراك مرنة تنمو مع عملك. أدر الفوترة، ارتقِ أو خفّض الخطط، وتحكّم في التكاليف بأسعار شفافة بدون رسوم خفية.',
    color: 'from-amber-500 to-amber-700',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-700',
  },
];

export function Features() {
  return (
    <section id="features" className="section-padding bg-white">
      <div className="container-max">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16 reveal">
          <span className="inline-block px-4 py-1.5 bg-teal-100 text-teal-700 text-sm font-bold rounded-full mb-4">
            المميزات
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-6">
            كل ما تحتاجه{' '}
            <span className="text-gradient">لإدارة التوزيع</span>
          </h2>
          <p className="text-lg text-gray-500 leading-relaxed">
            يوفّر TrackTracker مجموعة متكاملة من الأدوات المصمّمة خصيصًا لشركات التوزيع.
            من إدارة السائقين إلى التتبع اللحظي، كل ميزة مبنية لتبسيط عملياتك وتعزيز الإنتاجية.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className="reveal group relative bg-white rounded-2xl border border-gray-100 p-6 lg:p-8 card-hover overflow-hidden"
              style={{ transitionDelay: `${i * 0.05}s` }}
            >
              {/* Gradient top bar */}
              <div
                className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${feature.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
              />

              {/* Icon */}
              <div
                className={`w-14 h-14 ${feature.iconBg} rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}
              >
                <feature.icon className={feature.iconColor} size={26} strokeWidth={2} />
              </div>

              {/* Title */}
              <h3 className="text-lg font-bold text-gray-900 mb-3">{feature.title}</h3>

              {/* Description */}
              <p className="text-sm text-gray-500 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
