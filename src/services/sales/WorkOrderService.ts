'use client';

import { toast } from "@/hooks/use-toast";
import { emitEvent, EVENT_TYPES } from "@/services/EventService";

/**
 * Generate PDF work order document
 */
export const generateWorkOrderPDF = async (workOrderData: any): Promise<string> => {
  // In a real app, this would call PDFService or a backend API
  // For now, we'll just simulate a delay and return a mock URL
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Emit event for document generation
  emitEvent(EVENT_TYPES.DOCUMENT_GENERATED, {
    documentType: 'work_order',
    workOrderId: workOrderData.id,
    clientName: workOrderData.client,
  });
  
  return `/generated-pdfs/work-order-${workOrderData.id}.pdf`;
};

/**
 * Utility function to check if a work order can be converted to operational posts
 */
export const canCreateOperationalPosts = (workOrderData: any): boolean => {
  // Validate work order data to ensure it has all required fields for post creation
  
  // Check if work order has posts
  if (!workOrderData.posts || workOrderData.posts.length === 0) {
    return false;
  }
  
  // Check if each post has required fields
  for (const post of workOrderData.posts) {
    if (!post.name || !post.location.address) {
      return false;
    }
    
    // Check if each post has at least one staff requirement
    if (!post.requiredStaff || post.requiredStaff.length === 0) {
      return false;
    }
  }
  
  return true;
};

/**
 * Handle work order status change
 */
export const handleWorkOrderStatusChange = async (workOrderData: any, newStatus: string): Promise<void> => {
  try {
    // If work order is approved and has createOperationalPosts flag
    if (newStatus === 'Approved' && workOrderData.createOperationalPosts) {
      // Import the createOperationalPostsFromWorkOrder function dynamically to avoid circular dependencies
      const { createOperationalPostsFromWorkOrder } = await import('./PostOperationsService');
      
      // Create operational posts
      const posts = await createOperationalPostsFromWorkOrder(workOrderData);
      
      toast({
        title: "Operational Posts Created",
        description: `Successfully created ${posts.length} operational posts from work order ${workOrderData.id}`,
      });
      
      // Emit event for successful integration
      emitEvent(EVENT_TYPES.MODULE_INTEGRATION, {
        source: 'sales',
        target: 'operations',
        action: 'posts_creation',
        workOrderId: workOrderData.id,
        postsCount: posts.length,
      });
    }
    
    // Handle other status changes as needed
  } catch (error) {
    console.error("Error handling work order status change:", error);
    
    toast({
      title: "Error Creating Posts",
      description: "Failed to create operational posts from work order. Please try again.",
      variant: "destructive",
    });
  }
};
