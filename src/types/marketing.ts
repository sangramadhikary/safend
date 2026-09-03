export interface ServiceEntry {
  id: string;
  name: string;        // 1-60 characters
  description: string; // 1-500 characters
  icon?: string;       // Optional Lucide icon name
  tagline?: string;    // Short catchy phrase for the dedicated section
  image?: string;      // Public path to the representative image
  imagePosition?: string; // CSS object-position value, e.g. 'top', 'center', '50% 20%'
  features?: string[]; // Key features / capabilities
  useCases?: string[]; // Ideal use cases / industries
  highlights?: { label: string; value: string }[]; // Quick stats or highlights
}

export interface EnquiryFormData {
  name: string;           // 1-100 characters
  contactMethod: string;  // Valid email or phone number
  message: string;        // 1-2000 characters
  website?: string;       // Honeypot field — must remain empty
}

export interface EnquiryFormState {
  data: EnquiryFormData;
  errors: Record<keyof EnquiryFormData, string | null>;
  status: 'idle' | 'submitting' | 'success' | 'error';
}

export interface ContactInfo {
  phone: string;
  email: string;
  address: string;
  registeredAddress: string;
  cin: string;
}
