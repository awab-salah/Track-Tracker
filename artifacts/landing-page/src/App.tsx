import { useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { HowItWorks } from './components/HowItWorks';
import { DownloadSection } from './components/DownloadSection';
import { ScreenshotCarousel } from './components/ScreenshotCarousel';
import { InstallationGuide } from './components/InstallationGuide';
import { FAQ } from './components/FAQ';
import { Footer } from './components/Footer';

// Extend Window type for PWA install prompt
declare global {
  interface Window {
    deferredInstallPrompt: any;
  }
}

function App() {
  // Capture the PWA beforeinstallprompt event
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      window.deferredInstallPrompt = e;
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Intersection Observer for reveal animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    document.querySelectorAll('.reveal').forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <DownloadSection />
      <ScreenshotCarousel />
      <InstallationGuide />
      <FAQ />
      <Footer />
    </div>
  );
}

export default App;
