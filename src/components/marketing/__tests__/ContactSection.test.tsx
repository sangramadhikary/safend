import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContactSection } from '../ContactSection';

describe('ContactSection', () => {
  it('should have id="contact" for anchor linking', () => {
    const { container } = render(<ContactSection />);
    const section = container.querySelector('#contact');
    expect(section).not.toBeNull();
  });

  it('should display contact phone number', () => {
    render(<ContactSection />);
    // The phone number should be displayed
    expect(screen.getByText(/\+91-9777023903/)).toBeInTheDocument();
  });

  it('should display contact email address', () => {
    render(<ContactSection />);
    expect(screen.getByText(/info@safends\.com/)).toBeInTheDocument();
  });

  it('should display physical address', () => {
    render(<ContactSection />);
    expect(screen.getByText(/Cuttack, Odisha/)).toBeInTheDocument();
  });

  it('should render the EnquiryForm component', () => {
    render(<ContactSection />);
    // Check for form heading
    expect(screen.getByText('Send an Enquiry')).toBeInTheDocument();
  });
});
