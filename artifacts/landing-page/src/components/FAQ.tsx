import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { FAQ_ITEMS } from '../data/faq';

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // Inject FAQ Schema for SEO
  useEffect(() => {
    const existingSchema = document.getElementById('faq-schema');
    if (existingSchema) existingSchema.remove();

    const schema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ_ITEMS.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'faq-schema';
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);

    return () => {
      const el = document.getElementById('faq-schema');
      if (el) el.remove();
    };
  }, []);

  return (
    <section id="faq" className="section-padding bg-white">
      <div className="container-max">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16 reveal">
          <span className="inline-block px-4 py-1.5 bg-orange-100 text-orange-600 text-sm font-bold rounded-full mb-4">
            الأسئلة الشائعة
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-6">
            الأسئلة{' '}
            <span className="text-gradient">الشائعة</span>
          </h2>
          <p className="text-lg text-gray-500 leading-relaxed">
            إجابات على الأسئلة الأكثر شيوعًا حول TrackTracker، من التثبيت والأسعار إلى المميزات والأمان. لم تجد ما تبحث عنه؟ تواصل معنا عبر واتساب.
          </p>
        </div>

        {/* FAQ items */}
        <div className="max-w-3xl mx-auto space-y-4">
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              className="reveal border border-gray-100 rounded-2xl overflow-hidden hover:border-teal-200 transition-colors"
              style={{ transitionDelay: `${i * 0.05}s` }}
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-5 text-left"
                aria-expanded={openIndex === i}
              >
                <span className="font-bold text-gray-900 pr-4">{item.question}</span>
                <ChevronDown
                  size={20}
                  className={`flex-shrink-0 text-gray-400 transition-transform duration-300 ${
                    openIndex === i ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === i ? 'max-h-96' : 'max-h-0'
                }`}
              >
                <p className="px-6 pb-5 text-gray-500 leading-relaxed">{item.answer}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
