/**
 * FAQ content shared between the rendered <FAQ /> component and the
 * FAQPage JSON-LD structured data. Defined in a plain module (no
 * 'use client' boundary) so both server and client components can import
 * the same data array.
 */
export type FaqEntry = { question: string; answer: string };

export const FAQ_ITEMS: readonly FaqEntry[] = [
  {
    question: 'What kind of security do you actually provide?',
    answer:
      'Everything from a single guard at your office door to armed escorts for cash transit. We do unarmed guards, armed officers, personal security (PSOs), event bouncers, K9 dog squads, and electronic surveillance. If it needs protecting, we handle it.',
  },
  {
    question: 'Are your guards properly trained and licensed?',
    answer:
      'Every single one. All guards are PSARA licensed and complete 120+ hours of training before their first deployment. Every quarter, they go through refresher courses on de-escalation, first aid, fire safety, and protocols specific to your site.',
  },
  {
    question: 'Do you only work in Odisha?',
    answer:
      'We started in Cuttack and Bhubaneswar, but we operate across multiple cities and states in India now. Wherever you need us, we can set up — the process is the same.',
  },
  {
    question: 'What happens if there is an emergency?',
    answer:
      'Our 24/7 control room monitors every deployment. The moment something happens, supervisors are alerted within seconds, backup is dispatched, and local authorities are looped in simultaneously. You will be informed in real time.',
  },
  {
    question: 'Can you build a plan for our specific situation?',
    answer:
      'That is exactly how we work. Every engagement starts with a risk assessment of your site. We then design a security plan around your schedule, layout, and threat profile — whether it is one night or a multi-year contract.',
  },
] as const;
