import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';

const SCREENSHOTS = [
  {
    id: 1,
    title: 'Dashboard Overview',
    src: '/screenshots/dashboard',
    alt: 'TrackTracker dashboard showing key metrics and overview',
  },
  {
    id: 2,
    title: 'Live GPS Tracking',
    src: '/screenshots/map-tracking',
    alt: 'TrackTracker live GPS map tracking drivers in real-time',
  },
  {
    id: 3,
    title: 'Driver Management',
    src: '/screenshots/driver-management',
    alt: 'TrackTracker driver management interface with driver list and details',
  },
  {
    id: 4,
    title: 'Sales Recording',
    src: '/screenshots/sales-recording',
    alt: 'TrackTracker sales recording screen for tracking deliveries and payments',
  },
  {
    id: 5,
    title: 'Reports & Analytics',
    src: '/screenshots/reports-analytics',
    alt: 'TrackTracker reports and analytics dashboard with charts and metrics',
  },
  {
    id: 6,
    title: 'Notifications',
    src: '/screenshots/notifications',
    alt: 'TrackTracker notifications center with delivery and sales alerts',
  },
  {
    id: 7,
    title: 'User Management',
    src: '/screenshots/user-management',
    alt: 'TrackTracker user management with roles and permissions',
  },
];

export function ScreenshotCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollToIndex = (index: number) => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const cardWidth = container.scrollWidth / SCREENSHOTS.length;
    setActiveIndex(index);
    container.scrollTo({ left: cardWidth * index, behavior: 'smooth' });
  };

  const scroll = (direction: 'left' | 'right') => {
    const newIndex =
      direction === 'left'
        ? Math.max(0, activeIndex - 1)
        : Math.min(SCREENSHOTS.length - 1, activeIndex + 1);
    scrollToIndex(newIndex);
  };

  return (
    <section id="screenshots" className="section-padding bg-white">
      <div className="container-max">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-12 reveal">
          <span className="inline-block px-4 py-1.5 bg-teal-100 text-teal-700 text-sm font-bold rounded-full mb-4">
            See It In Action
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-6">
            App <span className="text-gradient">Screenshots</span> & Demo
          </h2>
          <p className="text-lg text-gray-500 leading-relaxed">
            Explore the TrackTracker interface and see how easy it is to manage your distribution
            operations from anywhere.
          </p>
        </div>

        {/* Carousel navigation */}
        <div className="flex items-center justify-end gap-2 mb-6 reveal">
          <button
            onClick={() => scroll('left')}
            disabled={activeIndex === 0}
            className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous screenshot"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={activeIndex === SCREENSHOTS.length - 1}
            className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next screenshot"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Carousel */}
        <div className="reveal overflow-hidden">
          <div
            ref={scrollRef}
            className="carousel-container flex gap-6 overflow-x-auto pb-4 px-1"
          >
            {SCREENSHOTS.map((screenshot) => (
              <div
                key={screenshot.id}
                className="carousel-item w-[240px] sm:w-[280px] lg:w-[300px] flex-shrink-0"
              >
                {/* Phone frame */}
                <div className="relative bg-gray-900 rounded-[2.5rem] p-2.5 sm:p-3 shadow-2xl">
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 sm:w-24 sm:h-6 bg-gray-900 rounded-b-2xl z-10" />

                  {/* Screen with real screenshot */}
                  <div className="rounded-[2rem] overflow-hidden aspect-[9/19.5] relative bg-gray-100">
                    <picture>
                      <source
                        srcSet={`${screenshot.src}-sm.webp 360w, ${screenshot.src}-md.webp 540w, ${screenshot.src}-lg.webp 720w`}
                        sizes="(max-width: 640px) 360px, (max-width: 1024px) 540px, 720px"
                        type="image/webp"
                      />
                      <img
                        src={`${screenshot.src}-lg.webp`}
                        alt={screenshot.alt}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover object-top"
                        width={719}
                        height={1446}
                      />
                    </picture>
                  </div>
                </div>

                {/* Label */}
                <p className="text-center text-sm font-semibold text-gray-600 mt-4">
                  {screenshot.title}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Dots indicator */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {SCREENSHOTS.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToIndex(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                i === activeIndex ? 'bg-teal-700 w-6' : 'bg-gray-300'
              }`}
              aria-label={`Go to screenshot ${i + 1}`}
            />
          ))}
        </div>

        {/* Video placeholder */}
        <div className="reveal mt-16 max-w-3xl mx-auto">
          <div className="relative bg-gray-900 rounded-2xl aspect-video flex items-center justify-center overflow-hidden shadow-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-800/50 to-gray-900/80" />
            <div className="relative text-center z-10">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mb-4 mx-auto cursor-pointer hover:bg-white/30 transition-colors">
                <Play size={28} className="text-white ml-1" />
              </div>
              <p className="text-white/70 font-medium">Installation Tutorial Video</p>
              <p className="text-white/40 text-sm mt-1">Coming soon</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
