export interface JobPosting {
  id: string;
  title: string;
  department: string;
  location: string;
  type: 'Full-time' | 'Part-time' | 'Contract';
  description: string;
  requirements: string[];
}

export const JOB_POSTINGS: JobPosting[] = [
  {
    id: 'unarmed-guard',
    title: 'Security Guard (Unarmed)',
    department: 'Operations',
    location: 'Odisha, Telangana, West Bengal',
    type: 'Full-time',
    description:
      'Provide access control, patrol, and visitor management at assigned client sites. Maintain incident logs and coordinate with the control room.',
    requirements: [
      'Age 18–45 years',
      'Minimum 10th pass',
      'Physically fit — able to stand for 8-hour shifts',
      'Basic Hindi/English communication',
      'Clean police verification',
    ],
  },
  {
    id: 'armed-guard',
    title: 'Armed Security Personnel',
    department: 'Operations',
    location: 'Odisha, Telangana, West Bengal',
    type: 'Full-time',
    description:
      'Deploy at banks, ATMs, and high-value sites with licensed firearm. Handle cash-in-transit escort duties and perimeter security.',
    requirements: [
      'Valid arms license (NLFA / State)',
      'Ex-serviceman or PSARA-trained preferred',
      'Minimum 12th pass',
      'Age 21–50 years',
      'Physically fit with firearms proficiency',
      'Clean criminal record',
    ],
  },
  {
    id: 'supervisor',
    title: 'Security Supervisor',
    department: 'Operations',
    location: 'Odisha, Telangana, West Bengal',
    type: 'Full-time',
    description:
      'Lead a team of 10–30 guards across one or more client sites. Manage shift rosters, conduct site inspections, handle incident escalation, and act as the client point of contact.',
    requirements: [
      'Minimum 3 years security industry experience',
      'Graduate preferred',
      'Strong written and verbal communication',
      'Basic computer literacy (email, attendance apps)',
      'Leadership and conflict-resolution skills',
    ],
  },
  {
    id: 'pso',
    title: 'Personal Security Officer (PSO)',
    department: 'Operations',
    location: 'Pan India',
    type: 'Full-time',
    description:
      'Provide close protection to executives, dignitaries, and high-net-worth individuals. Plan secure routes, perform advance recce, and coordinate with local law enforcement.',
    requirements: [
      'Ex-military / paramilitary / police background',
      'Minimum 5 years in close protection',
      'Advanced defensive driving preferred',
      'First-aid certified',
      'Willing to travel extensively',
    ],
  },
  {
    id: 'area-manager',
    title: 'Area Operations Manager',
    department: 'Management',
    location: 'Bhubaneswar / Hyderabad / Kolkata',
    type: 'Full-time',
    description:
      'Oversee all deployments within a city or region. Drive client retention, manage P&L, ensure compliance, and build the local team.',
    requirements: [
      'MBA or equivalent with 5+ years in security / facility management',
      'Proven team-building and client relationship skills',
      'P&L management experience',
      'Strong knowledge of PSARA and labour laws',
      'Fluent in English + regional language',
    ],
  },
  {
    id: 'hr-executive',
    title: 'HR Executive — Recruitment',
    department: 'Human Resources',
    location: 'Bhubaneswar (HQ)',
    type: 'Full-time',
    description:
      'Drive end-to-end recruitment of field staff (guards, supervisors). Manage onboarding, police verification, and training coordination.',
    requirements: [
      'Graduate with 1–3 years HR / recruitment experience',
      'Experience in bulk hiring preferred',
      'Proficient in MS Office and HR software',
      'Good interpersonal and negotiation skills',
      'Odia + English communication',
    ],
  },
];
