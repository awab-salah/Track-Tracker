import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { label: 'المميزات', href: '#features' },
  { label: 'كيف يعمل', href: '#how-it-works' },
  { label: 'التحميل', href: '#download' },
  { label: 'الأسئلة الشائعة', href: '#faq' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-md shadow-lg shadow-black/5'
          : 'bg-transparent'
      }`}
    >
      <div className="container-max flex items-center justify-between h-16 sm:h-20 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <a href="#" className="flex-shrink-0 flex items-center gap-2" aria-label="الصفحة الرئيسية - TrackTracker">
          <img
            src="/icons/logo.png"
            alt="TrackTracker"
            width={32}
            height={32}
            className="w-8 h-8"
          />
          <span className={`font-extrabold tracking-tight text-lg ${scrolled ? 'text-gray-900' : 'text-white'}`}>
            <span className={scrolled ? 'text-teal-800' : 'text-white'}>Track</span>
            <span className={scrolled ? 'text-orange-500' : 'text-orange-400'}>Tracker</span>
          </span>
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`text-sm font-semibold transition-colors hover:text-orange-500 ${
                scrolled ? 'text-gray-700' : 'text-white/90'
              }`}
            >
              {link.label}
            </a>
          ))}
          <a
            href="#download"
            className="btn-primary !py-2.5 !px-6 !text-sm !rounded-xl"
          >
            تحميل التطبيق
          </a>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-lg"
          aria-label="فتح القائمة"
        >
          {mobileOpen ? (
            <X size={24} className={scrolled ? 'text-gray-900' : 'text-white'} />
          ) : (
            <Menu size={24} className={scrolled ? 'text-gray-900' : 'text-white'} />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white shadow-xl border-t">
          <div className="px-4 py-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-3 text-gray-700 font-semibold rounded-xl hover:bg-teal-50 transition-colors"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#download"
              onClick={() => setMobileOpen(false)}
              className="block text-center btn-primary !rounded-xl mt-2"
            >
              تحميل التطبيق
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
