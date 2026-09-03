import { Shield, Users, Clock, Award } from 'lucide-react';

const values = [
  {
    icon: Users,
    title: 'People',
    description:
      'Our success begins with our people. By nurturing talent and fostering a respectful environment, we empower individuals to thrive and do their best work.',
  },
  {
    icon: Shield,
    title: 'Service',
    description:
      'Delivering exceptional service is a commitment, not just a goal. We strive to exceed expectations at every touchpoint with reliable solutions and personalized care.',
  },
  {
    icon: Award,
    title: 'Profit',
    description:
      'For us, profit is the natural outcome of a people-centered, service-driven business — reinvested into our team, our services, and sustainable growth.',
  },
  {
    icon: Clock,
    title: 'Reliability',
    description:
      'Round-the-clock availability and consistent performance. When you need us, we are there — even at odd hours or on long shifts.',
  },
];

const stats = [
  { value: '2700+', label: 'Active personnel at any time' },
  { value: '260+', label: 'Clients across India' },
  { value: '14+', label: 'Years of experience' },
  { value: '4', label: 'Industry awards' },
];

export default function AboutSection() {
  return (
    <section id="about" className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Our Story */}
        <div className="max-w-4xl mx-auto mb-16">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-8">
            The Heart Behind the Badge
          </h2>
          <div className="space-y-4 text-gray-700 text-base sm:text-lg leading-relaxed">
            <p>
              Safend began on the frontlines, not in a boardroom. Years spent
              working in the security industry exposed the good, the bad, and the
              frustrating — clients unhappy with service quality, and reliable
              manpower an elusive dream. That frustration lit a fire: we knew we
              could do better.
            </p>
            <p>
              What started as a humble proprietorship grew through a decade of
              learning. Every client interaction, every shift, and every challenge
              became a stepping stone. We weren&apos;t just building a business; we
              were building a philosophy rooted in respect, professionalism, and
              reliability.
            </p>
            <p>
              In 2020, Safend made the leap from a small operation to a properly
              incorporated organization — weaving everything we had learned about
              client expectations, staff training, and excellence into the DNA of
              the company.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-4xl font-bold text-safend-red mb-2">
                {stat.value}
              </p>
              <p className="text-sm text-gray-600">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Philosophy / Core Values */}
        <div>
          <h3 className="text-2xl font-semibold text-gray-900 text-center mb-4">
            Our Philosophy
          </h3>
          <p className="text-center text-gray-600 mb-10 max-w-2xl mx-auto">
            An almost 100% retention rate with clients and staff alike — a record
            almost unheard of in the industry. We accomplish this by focusing on
            what matters most.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value) => (
              <div
                key={value.title}
                className="text-center p-6 bg-white rounded-lg shadow-xs"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#D71920]/10 text-[#D71920] mb-4">
                  <value.icon className="w-6 h-6" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">
                  {value.title}
                </h4>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
