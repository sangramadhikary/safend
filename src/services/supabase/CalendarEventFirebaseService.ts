'use client';

import { supabaseClient } from '@/integrations/supabase/client';

export interface CalendarEvent {
  id?: string;
  title: string;
  start: Date;
  end: Date;
  type: 'meeting' | 'contract' | 'compliance' | 'followup' | 'service';
  location?: string;
  attendees?: string[];
  description?: string;
  relatedId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const mapRowToEvent = (row: any): CalendarEvent => ({
  id: row.id,
  title: row.title,
  start: new Date(row.start_time),
  end: row.end_time ? new Date(row.end_time) : new Date(row.start_time),
  type: row.event_type || 'meeting',
  location: row.location,
  attendees: row.attendees || [],
  description: row.description,
  relatedId: row.related_id,
  createdAt: row.created_at ? new Date(row.created_at) : undefined,
  updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
});

// Add a new calendar event
export const addCalendarEvent = async (event: Omit<CalendarEvent, 'id'> & { id?: string }) => {
  try {
    const { data, error } = await supabaseClient
      .from('calendar_events')
      .insert({
        title: event.title,
        start_time: event.start.toISOString(),
        end_time: event.end.toISOString(),
        event_type: event.type,
        location: event.location,
        attendees: event.attendees,
        description: event.description,
        related_id: event.relatedId || null,
        created_by: localStorage.getItem('userName') || 'Admin',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error adding calendar event:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (error) {
    console.error('Error adding calendar event:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Update an existing calendar event
export const updateCalendarEvent = async (id: string, event: Partial<CalendarEvent>) => {
  try {
    const updates: any = {};
    if (event.title !== undefined) updates.title = event.title;
    if (event.start !== undefined) updates.start_time = event.start.toISOString();
    if (event.end !== undefined) updates.end_time = event.end.toISOString();
    if (event.type !== undefined) updates.event_type = event.type;
    if (event.location !== undefined) updates.location = event.location;
    if (event.attendees !== undefined) updates.attendees = event.attendees;
    if (event.description !== undefined) updates.description = event.description;

    const { error } = await supabaseClient
      .from('calendar_events')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating calendar event:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating calendar event:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Delete a calendar event
export const deleteCalendarEvent = async (id: string) => {
  try {
    const { error } = await supabaseClient
      .from('calendar_events')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting calendar event:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Get all calendar events
export const getCalendarEvents = async () => {
  try {
    const { data, error } = await supabaseClient
      .from('calendar_events')
      .select('*')
      .order('start_time', { ascending: true });

    if (error) {
      // Log the full error details — PostgrestError objects may serialize as {}
      const errorDetail = error.message || error.code || error.hint || JSON.stringify(error);
      console.error('Error getting calendar events:', errorDetail, { code: error.code, details: error.details, hint: error.hint });
      
      // If the table doesn't exist (42P01) or permission denied, return gracefully
      if (error.code === '42P01' || error.code === 'PGRST204') {
        return { success: true, data: [] }; // Table not yet created — return empty
      }
      return { success: false, error: error.message || errorDetail, data: [] };
    }

    return { success: true, data: (data || []).map(mapRowToEvent) };
  } catch (error) {
    console.error('Error getting calendar events:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// Subscribe to real-time calendar event updates
export const subscribeToCalendarEvents = (callback: (events: CalendarEvent[]) => void) => {
  // Initial fetch
  getCalendarEvents().then(result => {
    if (result.success) {
      callback(result.data);
    } else {
      // If the table doesn't exist or there's a permission error, provide empty state
      callback([]);
    }
  });

  // Real-time subscription
  const channel = supabaseClient
    .channel('calendar-events-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => {
      getCalendarEvents().then(result => {
        if (result.success) callback(result.data);
      });
    })
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
};
