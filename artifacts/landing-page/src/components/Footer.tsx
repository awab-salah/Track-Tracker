import { MessageCircle } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-white">
      <div className="container-max px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2">
              <img
                src="/icons/logo.png"
                alt="TrackTracker"
                width={40}
                height={40}
                className="w-10 h-10"
              />
              <span className="font-extrabold tracking-tight text-2xl">
                <span className="text-white">Track</span>
                <span className="text-orange-400">Tracker</span>
              </span>
            </div>
            <p className="mt-4 text-gray-400 leading-relaxed max-w-md">
              TrackTracker نظام متكامل لإدارة عمليات التوزيع وتتبع المندوبين. يساعدك على تتبع التوصيلات وتسجيل المبيعات وتحسين أداء فريقك من منصة واحدة.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-bold text-white mb-4">روابط سريعة</h3>
            <ul className="space-y-3">
              {[
                { label: 'المميزات', href: '#features' },
                { label: 'كيف يعمل', href: '#how-it-works' },
                { label: 'حمّل التطبيق', href: '#download' },
                { label: 'لقطات التطبيق', href: '#screenshots' },
                { label: 'الأسئلة الشائعة', href: '#faq' },
              ].map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-gray-400 hover:text-orange-400 transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact - WhatsApp */}
          <div>
            <h3 className="font-bold text-white mb-4">تواصل معنا</h3>
            <a
              href="https://wa.me/9647800391051"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl transition-colors font-bold"
            >
              <MessageCircle size={22} />
              <span>واتساب</span>
              <span className="text-white/70 text-sm font-normal" dir="ltr">07800391051</span>
            </a>
            <p className="mt-4 text-gray-400 text-sm leading-relaxed">
              تواصل معنا عبر واتساب لأي استفسار أو دعم فني. نحن متاحون لمساعدتك.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-800">
        <div className="container-max px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">
            &copy; {currentYear} TrackTracker. جميع الحقوق محفوظة.
          </p>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="#" className="hover:text-orange-400 transition-colors">سياسة الخصوصية</a>
            <a href="#" className="hover:text-orange-400 transition-colors">شروط الخدمة</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
