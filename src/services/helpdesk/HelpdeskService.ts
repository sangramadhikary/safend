'use client';

import { SupportTicket, TicketComment, KnowledgeBaseArticle } from "@/types/helpdesk";
import { emitEvent, EVENT_TYPES } from "@/services/EventService";

// Mock data for support tickets
const mockTickets: SupportTicket[] = [
  {
    id: "ticket-001",
    branchId: "branch-001",
    title: "Printer not working in Finance department",
    description: "The HP LaserJet in the Finance department is showing error code E4. Tried restarting but issue persists.",
    category: "it",
    priority: "medium",
    status: "assigned",
    createdBy: "Jane Smith",
    createdAt: "2025-05-06T09:15:00Z",
    assignedTo: "Tech Support Team",
    dueDate: "2025-05-07T17:00:00Z",
    comments: [
      {
        id: "comment-001",
        ticketId: "ticket-001",
        content: "I'll check this today before noon.",
        createdBy: "Tech Support Team",
        createdAt: "2025-05-06T09:30:00Z"
      }
    ]
  },
  {
    id: "ticket-002",
    branchId: "branch-001",
    title: "AC not cooling in Conference Room",
    description: "The air conditioning in the main conference room isn't cooling properly. Room temperature is around 28°C.",
    category: "facilities",
    priority: "high",
    status: "in-progress",
    createdBy: "Robert Johnson",
    createdAt: "2025-05-05T14:22:00Z",
    assignedTo: "Maintenance Team",
    dueDate: "2025-05-06T14:00:00Z",
    comments: [
      {
        id: "comment-002",
        ticketId: "ticket-002",
        content: "Technician has been called, will arrive by 3 PM today.",
        createdBy: "Maintenance Team",
        createdAt: "2025-05-05T15:10:00Z"
      }
    ]
  },
  {
    id: "ticket-003",
    branchId: "branch-001",
    title: "Need access to accounting software",
    description: "I need access to QuickBooks for the quarterly financial review.",
    category: "accounts",
    priority: "low",
    status: "resolved",
    createdBy: "Sarah Williams",
    createdAt: "2025-05-04T10:05:00Z",
    assignedTo: "IT Admin",
    resolvedAt: "2025-05-04T14:30:00Z",
    resolvedBy: "IT Admin",
    resolution: "Access granted with view-only permissions as requested.",
    comments: [
      {
        id: "comment-003",
        ticketId: "ticket-003",
        content: "Access will be provided by EOD.",
        createdBy: "IT Admin",
        createdAt: "2025-05-04T11:20:00Z"
      },
      {
        id: "comment-004",
        ticketId: "ticket-003",
        content: "Access has been granted. Please check your email for login details.",
        createdBy: "IT Admin",
        createdAt: "2025-05-04T14:30:00Z"
      }
    ]
  }
];

// Mock data for knowledge base articles
const mockArticles: KnowledgeBaseArticle[] = [
  {
    id: "article-001",
    branchId: "branch-001",
    title: "How to reset your password",
    content: "Follow these steps to reset your password: 1. Go to the login page. 2. Click on 'Forgot Password'. 3. Enter your email address. 4. Check your email for reset instructions. 5. Create a new password following the security guidelines.",
    category: "IT",
    tags: ["password", "login", "security"],
    author: "IT Department",
    createdAt: "2025-03-15T08:30:00Z",
    updatedAt: "2025-03-15T08:30:00Z",
    views: 156,
    helpful: 48,
    notHelpful: 3
  },
  {
    id: "article-002",
    branchId: "branch-001",
    title: "How to book a meeting room",
    content: "To book a meeting room: 1. Log into the intranet. 2. Navigate to 'Facilities' section. 3. Click on 'Room Booking'. 4. Select your preferred date and time. 5. Choose an available room. 6. Enter meeting details and submit your request.",
    category: "Facilities",
    tags: ["meeting", "room booking", "facilities"],
    author: "Admin Team",
    createdAt: "2025-02-20T14:45:00Z",
    updatedAt: "2025-04-10T09:15:00Z",
    views: 89,
    helpful: 37,
    notHelpful: 2
  },
  {
    id: "article-003",
    branchId: "branch-001",
    title: "Common printer troubleshooting",
    content: "If your printer is not working, try these steps: 1. Check if the printer is powered on and connected. 2. Verify that you're connected to the right printer. 3. Check for paper jams. 4. Restart the printer. 5. Check for low ink/toner. 6. Restart the print spooler service.",
    category: "IT",
    tags: ["printer", "troubleshooting", "hardware"],
    author: "IT Support",
    createdAt: "2025-04-05T11:20:00Z",
    updatedAt: "2025-04-05T11:20:00Z",
    views: 203,
    helpful: 76,
    notHelpful: 5
  }
];

// Get all tickets for a branch
export const getTickets = (branchId: string): SupportTicket[] => {
  return mockTickets.filter(ticket => ticket.branchId === branchId);
};

// Get ticket by ID
export const getTicketById = (ticketId: string): SupportTicket | undefined => {
  return mockTickets.find(ticket => ticket.id === ticketId);
};

// Create new ticket
export const createTicket = (ticket: Omit<SupportTicket, "id" | "createdAt" | "comments">): SupportTicket => {
  const newTicket: SupportTicket = {
    ...ticket,
    id: `ticket-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    comments: []
  };
  
  mockTickets.push(newTicket);
  
  emitEvent(EVENT_TYPES.SUPPORT_TICKET_CREATED, {
    ticketId: newTicket.id,
    title: newTicket.title,
    priority: newTicket.priority,
    category: newTicket.category
  });
  
  return newTicket;
};

// Update ticket
export const updateTicket = (ticketId: string, updates: Partial<SupportTicket>): SupportTicket => {
  const index = mockTickets.findIndex(ticket => ticket.id === ticketId);
  
  if (index !== -1) {
    mockTickets[index] = { ...mockTickets[index], ...updates };
    
    emitEvent(EVENT_TYPES.SUPPORT_TICKET_UPDATED, {
      ticketId,
      title: mockTickets[index].title,
      status: mockTickets[index].status
    });
    
    return mockTickets[index];
  }
  
  throw new Error(`Ticket with ID ${ticketId} not found`);
};

// Assign ticket
export const assignTicket = (ticketId: string, assignedTo: string): SupportTicket => {
  const ticket = getTicketById(ticketId);
  
  if (ticket) {
    ticket.assignedTo = assignedTo;
    ticket.status = "assigned";
    
    emitEvent(EVENT_TYPES.SUPPORT_TICKET_ASSIGNED, {
      ticketId,
      title: ticket.title,
      assignedTo
    });
    
    return ticket;
  }
  
  throw new Error(`Ticket with ID ${ticketId} not found`);
};

// Resolve ticket
export const resolveTicket = (ticketId: string, resolvedBy: string, resolution: string): SupportTicket => {
  const ticket = getTicketById(ticketId);
  
  if (ticket) {
    ticket.status = "resolved";
    ticket.resolvedBy = resolvedBy;
    ticket.resolvedAt = new Date().toISOString();
    ticket.resolution = resolution;
    
    emitEvent(EVENT_TYPES.SUPPORT_TICKET_RESOLVED, {
      ticketId,
      title: ticket.title,
      resolvedBy
    });
    
    return ticket;
  }
  
  throw new Error(`Ticket with ID ${ticketId} not found`);
};

// Add comment to ticket
export const addTicketComment = (
  ticketId: string,
  comment: Omit<TicketComment, "id" | "ticketId" | "createdAt">
): TicketComment => {
  const ticket = getTicketById(ticketId);
  
  if (!ticket) {
    throw new Error(`Ticket with ID ${ticketId} not found`);
  }
  
  const newComment: TicketComment = {
    ...comment,
    id: `comment-${Date.now().toString(36)}`,
    ticketId,
    createdAt: new Date().toISOString()
  };
  
  ticket.comments.push(newComment);
  
  emitEvent(EVENT_TYPES.SUPPORT_TICKET_COMMENTED, {
    ticketId,
    commentId: newComment.id,
    commentBy: comment.createdBy
  });
  
  return newComment;
};

// Get all knowledge base articles for a branch
export const getKnowledgeBaseArticles = (branchId: string): KnowledgeBaseArticle[] => {
  return mockArticles.filter(article => article.branchId === branchId);
};

// Get knowledge base article by ID
export const getKnowledgeBaseArticleById = (articleId: string): KnowledgeBaseArticle | undefined => {
  return mockArticles.find(article => article.id === articleId);
};

// Create new knowledge base article
export const createKnowledgeBaseArticle = (
  article: Omit<KnowledgeBaseArticle, "id" | "createdAt" | "updatedAt" | "views" | "helpful" | "notHelpful">
): KnowledgeBaseArticle => {
  const now = new Date().toISOString();
  
  const newArticle: KnowledgeBaseArticle = {
    ...article,
    id: `article-${Date.now().toString(36)}`,
    createdAt: now,
    updatedAt: now,
    views: 0,
    helpful: 0,
    notHelpful: 0
  };
  
  mockArticles.push(newArticle);
  return newArticle;
};

// Update knowledge base article
export const updateKnowledgeBaseArticle = (
  articleId: string,
  updates: Partial<KnowledgeBaseArticle>
): KnowledgeBaseArticle => {
  const index = mockArticles.findIndex(article => article.id === articleId);
  
  if (index !== -1) {
    mockArticles[index] = {
      ...mockArticles[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    return mockArticles[index];
  }
  
  throw new Error(`Article with ID ${articleId} not found`);
};

// Record article view
export const recordArticleView = (articleId: string): void => {
  const article = getKnowledgeBaseArticleById(articleId);
  
  if (article) {
    article.views += 1;
  } else {
    throw new Error(`Article with ID ${articleId} not found`);
  }
};

// Rate article
export const rateArticle = (articleId: string, isHelpful: boolean): void => {
  const article = getKnowledgeBaseArticleById(articleId);
  
  if (article) {
    if (isHelpful) {
      article.helpful += 1;
    } else {
      article.notHelpful += 1;
    }
  } else {
    throw new Error(`Article with ID ${articleId} not found`);
  }
};
