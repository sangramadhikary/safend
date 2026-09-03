'use client';

import { supabaseClient } from '@/integrations/supabase/client';

export interface UserNotification {
  id?: string;
  userId: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
  createdAt: Date;
  relatedItemType?: string;
  relatedItemId?: string;
}

// Helper to map DB row to UserNotification
const mapRowToNotification = (row: any): UserNotification => ({
  id: row.id,
  userId: row.user_id || '',
  title: row.title || '',
  message: row.message || '',
  type: row.type || 'info',
  read: row.read || false,
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  relatedItemType: row.link ? row.link.split('/')[1] : undefined,
  relatedItemId: row.link ? row.link.split('/')[2] : undefined,
});

// Add a new notification
export const addNotification = async (
  notification: Omit<UserNotification, "id" | "createdAt" | "read">
) => {
  try {
    const { data, error } = await supabaseClient
      .from('user_notifications')
      .insert({
        user_id: notification.userId,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        read: false,
        link: notification.relatedItemType ? `/${notification.relatedItemType}/${notification.relatedItemId || ''}` : null,
      })
      .select('id')
      .single();

    if (error) {
      const msg = error.message || (error as any).details || (error as any).code || 'Unknown error';
      console.error("Error adding notification:", msg);
      return { success: false, error: msg };
    }
    return { success: true, id: data.id };
  } catch (error: any) {
    console.error("Error adding notification:", error);
    return { success: false, error: error.message };
  }
};

// Subscribe to notifications for a specific user
export const subscribeToUserNotifications = (
  userId: string,
  callback: (notifications: UserNotification[]) => void
) => {
  // Initial fetch
  const fetchNotifications = async () => {
    const { data, error } = await supabaseClient
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notifications:', error);
      callback([]);
      return;
    }
    callback((data || []).map(mapRowToNotification));
  };

  fetchNotifications();

  // Real-time subscription
  const channel = supabaseClient
    .channel(`notifications-${userId}`)
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${userId}` }, 
      () => {
        fetchNotifications();
      }
    )
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
};

// Mark notification as read
export const markNotificationAsRead = async (notificationId: string) => {
  try {
    const { error } = await supabaseClient
      .from('user_notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) {
      console.error("Error marking notification as read:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error marking notification as read:", error);
    return { success: false, error: error.message };
  }
};

// Mark all notifications as read for a user
export const markAllNotificationsAsRead = async (userId: string) => {
  try {
    const { error } = await supabaseClient
      .from('user_notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      console.error("Error marking all notifications as read:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error marking all notifications as read:", error);
    return { success: false, error: error.message };
  }
};

// Delete a notification
export const deleteNotification = async (notificationId: string) => {
  try {
    const { error } = await supabaseClient
      .from('user_notifications')
      .delete()
      .eq('id', notificationId);

    if (error) {
      console.error("Error deleting notification:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting notification:", error);
    return { success: false, error: error.message };
  }
};

// Send deletion approval notification to employee
export const sendDeletionApprovalNotification = async (
  requestedBy: string,
  itemType: string,
  clientName: string,
  approved: boolean
) => {
  const title = approved ? "Deletion Approved" : "Deletion Rejected";
  const message = approved
    ? `Your request to delete ${itemType} "${clientName}" has been approved by Admin.`
    : `Your request to delete ${itemType} "${clientName}" has been rejected by Admin.`;

  // requestedBy might be a display name or email — resolve to UUID for the user_id column
  let userId = requestedBy;
  try {
    // Check if it's already a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(requestedBy)) {
      // Sanitize requestedBy to prevent PostgREST filter injection:
      // strip characters that PostgREST treats as structural (commas,
      // parentheses, periods, colons, wildcards).
      const safeValue = requestedBy.replace(/[,().:*%]/g, '');
      // Look up user by email or name
      const { data } = await supabaseClient
        .from('users')
        .select('id')
        .or(`email.eq.${safeValue},name.eq.${safeValue}`)
        .maybeSingle();
      
      if (data?.id) {
        userId = data.id;
      } else {
        // If user not found, try the current authenticated user
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user?.id) {
          userId = user.id;
        } else {
          // Can't resolve to UUID — skip notification silently
          console.warn('[NotificationService] Could not resolve user for notification:', requestedBy);
          return { success: true, id: null };
        }
      }
    }
  } catch (e) {
    console.warn('[NotificationService] Error resolving user ID:', e);
    return { success: true, id: null };
  }

  return addNotification({
    userId,
    title,
    message,
    type: approved ? "success" : "error",
    relatedItemType: itemType,
  });
};
