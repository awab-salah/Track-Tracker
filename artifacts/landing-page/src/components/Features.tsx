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
    title: 'إدارة المندوبين',
    description:
      'أضف مندوبيك وأدِرهم وتتبّعهم من مكان واحد. راقب مساراتهم وأداءهم، واحصل على تحديثات لحظية عن حالة كل مندوب.',
    color: 'from-teal-500 to-teal-700',
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-700',
  },
  {
    icon: Package,
    title: 'إدارة الشحنات',
    description:
      'تتبّع كل شحنة من المستودع حتى التوصيل. وزّع الشحنات على المندوبين، وتابع حالة كل طلب على مدار سلسلة التوزيع.',
    color: 'from-orange-400 to-orange-600',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
  },
  {
    icon: ClipboardList,
    title: 'تسجيل المبيعات',
    description:
      'سجّل كل عملية بيع فور تنفيذها مع تفاصيل المنتجات. أنشئ تقارير مبيعات شاملة وتابع الإيرادات من جميع نقاط التوزيع.',
    color: 'from-blue-500 to-blue-700',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-700',
  },
  {
    icon: MapPin,
    title: 'تتبع المندوبين',
    description:
      'تتبّع مندوبيك لحظيًا على خريطة تفاعلية. راقب مواقعهم، حسّن مسارات التوصيل، ووفّر تكاليف التشغيل مع التتبع الذكي.',
    color: 'from-green-500 to-green-700',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-700',
  },
  {
    icon: BarChart3,
    title: 'التقارير والتحليلات',
    description:
      'احصل على تقارير وتحليلات واضحة تساعدك على اتخاذ القرار. تابع مؤشرات الأداء، واكتشف الاتجاهات، وحسّن عمليات التوزيع بناءً على بيانات دقيقة.',
    color: 'from-purple-500 to-purple-700',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-700',
  },
  {
    icon: Bell,
    title: 'الإشعارات',
    description:
      'تلقّ إشعارات فورية عند عمليات البيع والتحديثات المهمة. خصّص إعدادات التنبيهات بما يناسبك.',
    color: 'from-red-500 to-red-700',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-700',
  },
  {
    icon: CreditCard,
    title: 'إدارة الاشتراكات',
    description:
      'خطط اشتراك مرنة تناسب حجم عملك. أدر الفوترة، غيّر الخطط متى شئت، وتحكّم في التكاليف بأسعار شفافة بدون رسوم إضافية.',
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
            يوفّر TrackTracker أدوات متكاملة صُمّمت لشركات التوزيع.
            من إدارة المندوبين إلى التتبع اللحظي، كل ميزة تساعدك على تبسيط عملياتك وزيادة إنتاجيتك.
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
