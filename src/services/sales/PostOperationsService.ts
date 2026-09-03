'use client';

import { toast } from "@/hooks/use-toast";
import { emitEvent, EVENT_TYPES } from "@/services/EventService";

/**
 * Create operational posts from work order data
 */
export const createOperationalPostsFromWorkOrder = async (workOrderData: any): Promise<any[]> => {
  // In a real app, this would call a backend API
  // For now, we'll just simulate a delay and return mock data
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Create posts from work order data
  const posts = workOrderData.posts.map((post: any, index: number) => {
    return {
      id: `OP-${Math.floor(Math.random() * 10000)}`,
      name: post.name,
      code: post.code || `P-${index + 1}`,
      type: post.type,
      location: post.location,
      dutyType: post.dutyType,
      clientId: workOrderData.clientId,
      clientName: workOrderData.client,
      workOrderId: workOrderData.id,
      status: 'active',
      requiredStaff: post.requiredStaff,
      startDate: workOrderData.startDate,
      endDate: workOrderData.endDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      address: post.location.address,
      branchId: workOrderData.branchId || "1"
    };
  });
  
  // Emit event for post creation
  if (posts.length > 0) {
    emitEvent(EVENT_TYPES.MODULE_INTEGRATION, {
      source: 'sales',
      target: 'operations',
      action: 'posts_created',
      workOrderId: workOrderData.id,
      postsCount: posts.length,
    });
  }
  
  return posts;
};

/**
 * Send mess charges to accounts module
 */
export const sendMessChargesToAccounts = async (messCharges: any[]): Promise<boolean> => {
  try {
    // In a real app, this would call a backend API
    // For now, we'll just simulate a delay and return success
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Emit event for mess charges sent to accounts
    emitEvent(EVENT_TYPES.MODULE_INTEGRATION, {
      source: 'operations',
      target: 'accounts',
      action: 'mess_charges_sent',
      chargesCount: messCharges.length,
    });
    
    return true;
  } catch (error) {
    console.error("Error sending mess charges to accounts:", error);
    return false;
  }
};

/**
 * Get post-wise mess consumption summary
 */
export const getPostWiseMessConsumption = async (
  startDate: string, 
  endDate: string, 
  postIds?: string[]
): Promise<any[]> => {
  try {
    // In a real app, this would call a backend API
    // For now, we'll return mock data
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Mock data for post-wise mess consumption
    return [
      {
        postId: "OP-1234",
        postName: "Corporate Office Security",
        totalMeals: 120,
        breakfastCount: 40,
        lunchCount: 40,
        dinnerCount: 40,
        totalCost: 12000,
        avgDaily: 400,
      },
      {
        postId: "OP-2345",
        postName: "Factory Security",
        totalMeals: 210,
        breakfastCount: 70,
        lunchCount: 70,
        dinnerCount: 70,
        totalCost: 21000,
        avgDaily: 700,
      },
      {
        postId: "OP-3456",
        postName: "Hotel Security",
        totalMeals: 90,
        breakfastCount: 30,
        lunchCount: 30,
        dinnerCount: 30,
        totalCost: 9000,
        avgDaily: 300,
      }
    ];
  } catch (error) {
    console.error("Error fetching post-wise mess consumption:", error);
    return [];
  }
};
