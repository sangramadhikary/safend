'use client';

import { useState } from 'react';
import { enquirySchema } from '@/lib/enquirySchema';
import type { EnquiryFormData, EnquiryFormState } from '@/types/marketing';

const initialData: EnquiryFormData = {
  name: '',
  contactMethod: '',
  message: '',
  website: '',
};

export function EnquiryForm() {
  const [formState, setFormState] = useState<EnquiryFormState>({
    data: initialData,
    errors: { name: null, contactMethod: null, message: null, website: null },
    status: 'idle',
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setFormState((prev) => ({
      ...prev,
      data: { ...prev.data, [name]: value },
      // Clear field error on edit
      errors: { ...prev.errors, [name]: null },
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Reset errors
    setFormState((prev) => ({
      ...prev,
      errors: { name: null, contactMethod: null, message: null, website: null },
      status: 'submitting',
    }));

    // Client-side validation
    const result = enquirySchema.safeParse(formState.data);
    if (!result.success) {
      const fieldErrors: Record<keyof EnquiryFormData, string | null> = {
        name: null,
        contactMethod: null,
        message: null,
        website: null,
      };
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof EnquiryFormData;
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setFormState((prev) => ({
        ...prev,
        errors: fieldErrors,
        status: 'idle',
      }));
      return;
    }

    // Submit to API
    try {
      const response = await fetch('/api/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState.data),
      });

      if (response.ok) {
        setFormState({
          data: initialData,
          errors: { name: null, contactMethod: null, message: null, website: null },
          status: 'success',
        });
      } else {
        setFormState((prev) => ({
          ...prev,
          status: 'error',
        }));
      }
    } catch {
      setFormState((prev) => ({
        ...prev,
        status: 'error',
      }));
    }
  }

  if (formState.status === 'success') {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 p-6 text-center">
        <p className="text-green-800 font-medium">
          Thank you for your enquiry! We have received your message and will get
          back to you soon.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <h3 className="text-xl font-semibold text-gray-900">Send an Enquiry</h3>

      {formState.status === 'error' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-red-800 text-sm">
            Your enquiry could not be sent. Please try again.
          </p>
        </div>
      )}

      {/* Name field */}
      <div>
        <label
          htmlFor="enquiry-name"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Name
        </label>
        <input
          type="text"
          id="enquiry-name"
          name="name"
          value={formState.data.name}
          onChange={handleChange}
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[#D71920] ${
            formState.errors.name
              ? 'border-red-500'
              : 'border-gray-300'
          }`}
          aria-invalid={!!formState.errors.name}
          aria-describedby={
            formState.errors.name ? 'enquiry-name-error' : undefined
          }
        />
        {formState.errors.name && (
          <p id="enquiry-name-error" className="mt-1 text-sm text-red-600">
            {formState.errors.name}
          </p>
        )}
      </div>

      {/* Contact Method field */}
      <div>
        <label
          htmlFor="enquiry-contact"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Contact Method
        </label>
        <input
          type="text"
          id="enquiry-contact"
          name="contactMethod"
          value={formState.data.contactMethod}
          onChange={handleChange}
          placeholder="Email address or phone number"
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[#D71920] ${
            formState.errors.contactMethod
              ? 'border-red-500'
              : 'border-gray-300'
          }`}
          aria-invalid={!!formState.errors.contactMethod}
          aria-describedby={
            formState.errors.contactMethod
              ? 'enquiry-contact-error'
              : undefined
          }
        />
        {formState.errors.contactMethod && (
          <p
            id="enquiry-contact-error"
            className="mt-1 text-sm text-red-600"
          >
            {formState.errors.contactMethod}
          </p>
        )}
      </div>

      {/* Message field */}
      <div>
        <label
          htmlFor="enquiry-message"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Message
        </label>
        <textarea
          id="enquiry-message"
          name="message"
          value={formState.data.message}
          onChange={handleChange}
          rows={5}
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[#D71920] ${
            formState.errors.message
              ? 'border-red-500'
              : 'border-gray-300'
          }`}
          aria-invalid={!!formState.errors.message}
          aria-describedby={
            formState.errors.message ? 'enquiry-message-error' : undefined
          }
        />
        {formState.errors.message && (
          <p
            id="enquiry-message-error"
            className="mt-1 text-sm text-red-600"
          >
            {formState.errors.message}
          </p>
        )}
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={formState.status === 'submitting'}
        className="w-full rounded-md bg-[#D71920] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#b8151b] focus:outline-hidden focus:ring-2 focus:ring-[#D71920] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {formState.status === 'submitting' ? 'Sending...' : 'Submit Enquiry'}
      </button>
    </form>
  );
}
