import { Logo } from './Logo';
import { ArrowDown, Play } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative gradient-hero min-h-screen flex items-center overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {/* Floating circles */}
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-32 w-72 h-72 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-teal-400/10 rounded-full blur-3xl" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="container-max px-4 sm:px-6 lg:px-8 pt-24 pb-16 relative z-10">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
          {/* Logo */}
          <div className="animate-fade-in-up mb-6">
            <Logo size="xl" showText white />
          </div>

          {/* Subtitle */}
          <p className="text-xl sm:text-2xl lg:text-3xl text-white/90 font-medium mb-4 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            Smart Distribution Management
          </p>
          <p className="text-lg sm:text-xl text-white/70 font-light mb-10 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
            & Tracking System
          </p>

          {/* Description */}
          <p className="text-base sm:text-lg text-white/60 max-w-2xl mb-10 animate-fade-in-up leading-relaxed" style={{ animationDelay: '0.45s' }}>
            Manage drivers, track deliveries in real-time, record sales, and optimize your
            distribution operations — all from one powerful platform.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
            <a href="#download" className="btn-primary !bg-orange-500 !shadow-orange-500/30 hover:!bg-orange-600">
              Get the App
              <ArrowDown size={20} />
            </a>
            <a href="#screenshots" className="btn-secondary !border-white/30 !text-white hover:!bg-white/10">
              <Play size={20} />
              Watch Demo
            </a>
          </div>

          {/* Trust badges */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-white/50 text-sm animate-fade-in-up" style={{ animationDelay: '0.75s' }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span>Real-time Tracking</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span>Offline Support</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span>Free to Start</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom wave */}
      <div className="absolute bottom-0 left-0 right-0" aria-hidden="true">
        <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <path d="M0 120L60 105C120 90 240 60 360 52.5C480 45 600 60 720 67.5C840 75 960 75 1080 67.5C1200 60 1320 45 1380 37.5L1440 30V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" fill="white" />
        </svg>
      </div>
    </section>
  );
}
