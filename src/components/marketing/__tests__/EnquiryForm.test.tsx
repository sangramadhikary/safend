import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the schema to skip turnstileToken (the standalone EnquiryForm component
// does not include a Turnstile widget — the production form is ContactContent).
vi.mock('@/lib/enquirySchema', async () => {
  const { z } = await import('zod');
  return {
    enquirySchema: z.object({
      name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer'),
      contactMethod: z.string().min(1, 'Contact method is required').refine(
        (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) || /^\+?[\d\s\-()]{7,20}$/.test(val),
        'Must be a valid email address or phone number'
      ),
      message: z.string().min(1, 'Message is required').max(2000, 'Message must be 2000 characters or fewer'),
      website: z.string().max(0, 'Bot detected').optional().default(''),
    }),
  };
});

import { EnquiryForm } from '../EnquiryForm';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('EnquiryForm', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should render all form fields', () => {
    render(<EnquiryForm />);
    
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Contact Method')).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Enquiry/i })).toBeInTheDocument();
  });

  it('should have placeholder for contact method field', () => {
    render(<EnquiryForm />);
    
    const contactInput = screen.getByLabelText('Contact Method');
    expect(contactInput).toHaveAttribute('placeholder', 'Email address or phone number');
  });

  it('should show validation error for empty name', async () => {
    render(<EnquiryForm />);
    
    const submitButton = screen.getByRole('button', { name: /Submit Enquiry/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
  });

  it('should show validation error for empty contact method', async () => {
    render(<EnquiryForm />);
    
    const submitButton = screen.getByRole('button', { name: /Submit Enquiry/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Contact method is required')).toBeInTheDocument();
    });
  });

  it('should show validation error for empty message', async () => {
    render(<EnquiryForm />);
    
    const submitButton = screen.getByRole('button', { name: /Submit Enquiry/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Message is required')).toBeInTheDocument();
    });
  });

  it('should show validation error for name exceeding 100 characters', async () => {
    render(<EnquiryForm />);
    
    const nameInput = screen.getByLabelText('Name');
    const longName = 'a'.repeat(101);
    fireEvent.change(nameInput, { target: { value: longName } });
    
    const submitButton = screen.getByRole('button', { name: /Submit Enquiry/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Name must be 100 characters or fewer')).toBeInTheDocument();
    });
  });

  it('should show validation error for message exceeding 2000 characters', async () => {
    render(<EnquiryForm />);
    
    const messageInput = screen.getByLabelText('Message');
    const longMessage = 'a'.repeat(2001);
    fireEvent.change(messageInput, { target: { value: longMessage } });
    
    const submitButton = screen.getByRole('button', { name: /Submit Enquiry/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Message must be 2000 characters or fewer')).toBeInTheDocument();
    });
  });

  it('should show validation error for invalid contact method', async () => {
    render(<EnquiryForm />);
    
    const contactInput = screen.getByLabelText('Contact Method');
    fireEvent.change(contactInput, { target: { value: 'invalid' } });
    
    const submitButton = screen.getByRole('button', { name: /Submit Enquiry/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText('Must be a valid email address or phone number')).toBeInTheDocument();
    });
  });

  it('should retain form values on validation error', async () => {
    render(<EnquiryForm />);
    
    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    const contactInput = screen.getByLabelText('Contact Method') as HTMLInputElement;
    
    fireEvent.change(nameInput, { target: { value: 'John Doe' } });
    fireEvent.change(contactInput, { target: { value: 'invalid' } });
    
    const submitButton = screen.getByRole('button', { name: /Submit Enquiry/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(nameInput.value).toBe('John Doe');
      expect(contactInput.value).toBe('invalid');
    });
  });

  it('should submit valid form and show success message', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    
    render(<EnquiryForm />);
    
    const nameInput = screen.getByLabelText('Name');
    const contactInput = screen.getByLabelText('Contact Method');
    const messageInput = screen.getByLabelText('Message');
    
    fireEvent.change(nameInput, { target: { value: 'John Doe' } });
    fireEvent.change(contactInput, { target: { value: 'john@example.com' } });
    fireEvent.change(messageInput, { target: { value: 'I need security services' } });
    
    const submitButton = screen.getByRole('button', { name: /Submit Enquiry/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Thank you for your enquiry/i)).toBeInTheDocument();
    });
    
    expect(mockFetch).toHaveBeenCalledWith('/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'John Doe',
        contactMethod: 'john@example.com',
        message: 'I need security services',
        website: '',
      }),
    });
  });

  it('should show error message on submission failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    
    render(<EnquiryForm />);
    
    const nameInput = screen.getByLabelText('Name');
    const contactInput = screen.getByLabelText('Contact Method');
    const messageInput = screen.getByLabelText('Message');
    
    fireEvent.change(nameInput, { target: { value: 'John Doe' } });
    fireEvent.change(contactInput, { target: { value: 'john@example.com' } });
    fireEvent.change(messageInput, { target: { value: 'I need security services' } });
    
    const submitButton = screen.getByRole('button', { name: /Submit Enquiry/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Your enquiry could not be sent/i)).toBeInTheDocument();
    });
  });

  it('should retain form values on submission failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    
    render(<EnquiryForm />);
    
    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    const contactInput = screen.getByLabelText('Contact Method') as HTMLInputElement;
    const messageInput = screen.getByLabelText('Message') as HTMLTextAreaElement;
    
    fireEvent.change(nameInput, { target: { value: 'John Doe' } });
    fireEvent.change(contactInput, { target: { value: 'john@example.com' } });
    fireEvent.change(messageInput, { target: { value: 'I need security services' } });
    
    const submitButton = screen.getByRole('button', { name: /Submit Enquiry/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Your enquiry could not be sent/i)).toBeInTheDocument();
    });
    
    expect(nameInput.value).toBe('John Doe');
    expect(contactInput.value).toBe('john@example.com');
    expect(messageInput.value).toBe('I need security services');
  });

  it('should accept valid email as contact method', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    
    render(<EnquiryForm />);
    
    const nameInput = screen.getByLabelText('Name');
    const contactInput = screen.getByLabelText('Contact Method');
    const messageInput = screen.getByLabelText('Message');
    
    fireEvent.change(nameInput, { target: { value: 'John Doe' } });
    fireEvent.change(contactInput, { target: { value: 'john@example.com' } });
    fireEvent.change(messageInput, { target: { value: 'Test message' } });
    
    const submitButton = screen.getByRole('button', { name: /Submit Enquiry/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Thank you for your enquiry/i)).toBeInTheDocument();
    });
  });

  it('should accept valid phone number as contact method', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    
    render(<EnquiryForm />);
    
    const nameInput = screen.getByLabelText('Name');
    const contactInput = screen.getByLabelText('Contact Method');
    const messageInput = screen.getByLabelText('Message');
    
    fireEvent.change(nameInput, { target: { value: 'John Doe' } });
    fireEvent.change(contactInput, { target: { value: '+91-1234567890' } });
    fireEvent.change(messageInput, { target: { value: 'Test message' } });
    
    const submitButton = screen.getByRole('button', { name: /Submit Enquiry/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Thank you for your enquiry/i)).toBeInTheDocument();
    });
  });

  it('should disable submit button while submitting', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<EnquiryForm />);
    
    const nameInput = screen.getByLabelText('Name');
    const contactInput = screen.getByLabelText('Contact Method');
    const messageInput = screen.getByLabelText('Message');
    
    fireEvent.change(nameInput, { target: { value: 'John Doe' } });
    fireEvent.change(contactInput, { target: { value: 'john@example.com' } });
    fireEvent.change(messageInput, { target: { value: 'Test message' } });
    
    const submitButton = screen.getByRole('button', { name: /Submit Enquiry/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Sending.../i })).toBeDisabled();
    });
  });
});
