'use client';

export interface CalendarEventType {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: 'meeting' | 'site-visit' | 'contract' | 'compliance' | 'follow-up' | 'team';
  location: string;
  attendees: string[];
  description: string;
  clientId: string | null;
}

export interface EventTypeConfig {
  color: string;
  icon: string;
}

export interface EventTypeConfigs {
  meeting: EventTypeConfig;
  'site-visit': EventTypeConfig;
  contract: EventTypeConfig;
  compliance: EventTypeConfig;
  'follow-up': EventTypeConfig;
  team?: EventTypeConfig;
}
