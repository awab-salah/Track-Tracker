import { UserPlus, Truck, Package, BarChart3 } from 'lucide-react';

const STEPS = [
  {
    number: '01',
    icon: UserPlus,
    title: 'Register Your Company',
    description:
      'Create your company account in seconds. Set up your organization profile, configure your distribution settings, and invite your team members to get started immediately.',
    color: 'bg-teal-700',
    ring: 'ring-teal-200',
  },
  {
    number: '02',
    icon: Truck,
    title: 'Add Your Drivers',
    description:
      'Add drivers to your fleet with their profiles and contact information. Each driver gets their own account to access routes, deliveries, and sales tools on the go.',
    color: 'bg-orange-500',
    ring: 'ring-orange-200',
  },
  {
    number: '03',
    icon: Package,
    title: 'Assign Deliveries & Loads',
    description:
      'Create delivery assignments and load orders with detailed information. Assign them to drivers, set routes, and track progress from warehouse to customer doorstep.',
    color: 'bg-teal-700',
    ring: 'ring-teal-200',
  },
  {
    number: '04',
    icon: BarChart3,
    title: 'Track in Real Time',
    description:
      'Monitor every delivery, sale, and driver movement in real-time. Access comprehensive dashboards, generate reports, and make data-driven decisions to optimize your operations.',
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
            How It Works
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-6">
            Up and Running in{' '}
            <span className="text-gradient">4 Simple Steps</span>
          </h2>
          <p className="text-lg text-gray-500 leading-relaxed">
            Getting started with TrackTracker is quick and easy. Follow these four steps to
            transform your distribution operations and start seeing results immediately.
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
                  <span className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center text-sm font-extrabold text-gray-900">
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
