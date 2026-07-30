import {
  Truck,
  Package,
  ClipboardList,
  MapPin,
  BarChart3,
  Bell,
  Users,
  CreditCard,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Truck,
    title: 'Driver Management',
    description:
      'Add, manage, and track all your drivers in one place. Assign routes, monitor performance, and ensure accountability with real-time status updates and comprehensive driver profiles.',
    color: 'from-teal-500 to-teal-700',
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-700',
  },
  {
    icon: Package,
    title: 'Load Management',
    description:
      'Organize and track every load from warehouse to delivery. Manage inventory, assign loads to drivers, and maintain full visibility across your entire distribution chain.',
    color: 'from-orange-400 to-orange-600',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600',
  },
  {
    icon: ClipboardList,
    title: 'Sales Recording',
    description:
      'Record every sale in real-time with detailed line items, payment methods, and customer data. Generate comprehensive sales reports and track revenue across all distribution points.',
    color: 'from-blue-500 to-blue-700',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-700',
  },
  {
    icon: MapPin,
    title: 'Live GPS Tracking',
    description:
      'Track your fleet in real-time with live GPS coordinates on an interactive map. Monitor driver locations, optimize delivery routes, and reduce fuel costs with intelligent tracking.',
    color: 'from-green-500 to-green-700',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-700',
  },
  {
    icon: BarChart3,
    title: 'Reports & Analytics',
    description:
      'Gain actionable insights with powerful dashboards and analytics. Track key performance metrics, visualize trends, and make data-driven decisions to optimize your distribution operations.',
    color: 'from-purple-500 to-purple-700',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-700',
  },
  {
    icon: Bell,
    title: 'Notifications',
    description:
      'Stay informed with real-time push notifications for deliveries, sales, and important updates. Never miss a critical event with customizable alert preferences and delivery confirmations.',
    color: 'from-red-500 to-red-700',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-700',
  },
  {
    icon: Users,
    title: 'User Management',
    description:
      'Control access with role-based permissions for owners, managers, and drivers. Manage team accounts, set permission levels, and ensure secure operations across your organization.',
    color: 'from-indigo-500 to-indigo-700',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-700',
  },
  {
    icon: CreditCard,
    title: 'Subscription Management',
    description:
      'Flexible subscription plans that scale with your business. Manage billing, upgrade or downgrade plans, and control costs with transparent pricing and no hidden fees.',
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
            Features
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-6">
            Everything You Need to{' '}
            <span className="text-gradient">Manage Distribution</span>
          </h2>
          <p className="text-lg text-gray-500 leading-relaxed">
            TrackTracker provides a complete suite of tools designed specifically for distribution
            companies. From driver management to real-time tracking, every feature is built to
            streamline your operations and boost productivity.
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
