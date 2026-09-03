'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { CONTACT_INFO } from '@/data/contact';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const FOOTER_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/services', label: 'Services' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/careers', label: 'Careers' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
];

const SOCIAL_LINKS = [
  { href: 'https://www.linkedin.com/company/safends', label: 'LinkedIn' },
  { href: 'https://www.instagram.com/safendsecuresolutions', label: 'Instagram' },
  { href: 'https://www.facebook.com/safendsecuresolutions', label: 'Facebook' },
];

export function Footer() {
  const footerRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const headline = footerRef.current?.querySelector('.footer-headline');
      const cols = footerRef.current?.querySelectorAll('.footer-col');
      const bottom = footerRef.current?.querySelector('.footer-bottom');

      if (headline) {
        gsap.from(headline, {
          y: 40,
          opacity: 0,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: headline,
            start: 'top 90%',
            toggleActions: 'play none none none',
          },
        });
      }

      if (cols && cols.length) {
        gsap.from(cols, {
          y: 30,
          opacity: 0,
          duration: 0.7,
          ease: 'power2.out',
          stagger: 0.1,
          scrollTrigger: {
            trigger: cols[0],
            start: 'top 90%',
            toggleActions: 'play none none none',
          },
        });
      }

      if (bottom) {
        gsap.from(bottom, {
          opacity: 0,
          duration: 0.6,
          delay: 0.3,
          scrollTrigger: {
            trigger: bottom,
            start: 'top 95%',
            toggleActions: 'play none none none',
          },
        });
      }
    },
    { scope: footerRef }
  );

  return (
    <footer ref={footerRef} className="w-full bg-safend-ink">
      {/* Divider between CTA section and footer */}
      <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
        <div className="h-px w-full bg-white/10" />
      </div>

      {/* Top section — large CTA headline */}
      <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] pt-[40px] lg:pt-[80px] pb-[32px] lg:pb-[40px] border-b border-white/10">
        <div className="footer-headline flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 lg:gap-8">
          <h2
            className="font-display font-bold text-safend-canvas leading-[0.9] tracking-[-0.03em]"
            style={{ fontSize: 'clamp(1.9rem, 7vw, 5rem)' }}
          >
            Let us secure your<br />
            business<span className="text-safend-red">.</span>
          </h2>
          <a
            href="/contact"
            className="group inline-flex items-center gap-3 text-[14px] font-body text-safend-canvas/70 hover:text-safend-canvas transition-colors duration-200 shrink-0"
          >
            Get in touch
            <span className="inline-block w-[30px] h-[1.5px] bg-safend-red group-hover:w-[50px] transition-all duration-300" />
          </a>
        </div>
      </div>

      {/* Middle — mobile: 2-col compact grid / desktop: 3 columns */}
      <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] py-[30px] lg:py-[50px]">
        {/* Mobile layout */}
        <div className="md:hidden">
          {/* Brand row */}
          <div className="footer-col flex items-start justify-between gap-6 mb-6">
            <div>
              <img
                src="/logo.png"
                alt="Safend"
                className="h-7 w-auto object-contain brightness-0 invert opacity-80 mb-3"
              />
              <p className="text-[13px] font-body text-safend-canvas/60 leading-[1.55] max-w-[220px]">
                Responsible security for productive businesses across India.
              </p>
            </div>
            {/* Social links — stacked top right */}
            <div className="flex flex-col gap-2 items-end shrink-0">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-body text-safend-canvas/50 hover:text-safend-red transition-colors duration-200"
                >
                  {social.label}
                </a>
              ))}
            </div>
          </div>

          {/* Nav + Contact side by side */}
          <div className="grid grid-cols-2 gap-6 pt-5 border-t border-white/10">
            {/* Nav */}
            <div className="footer-col">
              <p className="text-[10px] font-body text-safend-canvas/40 uppercase tracking-widest mb-3">
                Navigation
              </p>
              <ul className="space-y-2">
                {FOOTER_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[13px] font-body text-safend-canvas/75 hover:text-safend-canvas transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div className="footer-col">
              <p className="text-[10px] font-body text-safend-canvas/40 uppercase tracking-widest mb-3">
                Contact
              </p>
              <address className="not-italic text-[13px] font-body text-safend-canvas/80 leading-[1.6] space-y-2">
                <p>{CONTACT_INFO.address}</p>
                <p>
                  <a href={`mailto:${CONTACT_INFO.email}`} className="hover:text-safend-canvas transition-colors duration-200 break-all">
                    {CONTACT_INFO.email}
                  </a>
                </p>
                <p>
                  <a href={`tel:${CONTACT_INFO.phone}`} className="hover:text-safend-canvas transition-colors duration-200">
                    {CONTACT_INFO.phone}
                  </a>
                </p>
              </address>
            </div>
          </div>
        </div>

        {/* Desktop layout — unchanged 3 columns */}
        <div className="hidden md:grid md:grid-cols-3 gap-12 lg:gap-20">
          {/* Brand */}
          <div className="footer-col">
            <div className="flex items-center gap-3 mb-5">
              <img
                src="/logo.png"
                alt="Safend"
                className="h-8 w-auto object-contain brightness-0 invert opacity-80"
              />
            </div>
            <p className="text-[14px] font-body text-safend-canvas/70 leading-[1.6] max-w-[280px]">
              Responsible security for productive businesses. Protecting events,
              businesses, and residences across India.
            </p>
          </div>

          {/* Links — two columns */}
          <div className="footer-col">
            <p className="text-[11px] font-body text-safend-canvas/60 uppercase tracking-widest mb-5">
              Navigation
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href} className="list-none">
                  <Link
                    href={link.href}
                    className="group flex items-center gap-2 text-[14px] font-body text-safend-canvas/80 hover:text-safend-canvas transition-colors duration-200"
                  >
                    <span className="w-0 h-px bg-safend-red group-hover:w-[16px] transition-all duration-300" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="footer-col">
            <p className="text-[11px] font-body text-safend-canvas/60 uppercase tracking-widest mb-5">
              Contact
            </p>
            <address className="not-italic text-[14px] font-body text-safend-canvas/70 leading-[1.7] space-y-3">
              <p>{CONTACT_INFO.address}</p>
              <p>
                <a href={`mailto:${CONTACT_INFO.email}`} className="hover:text-safend-canvas transition-colors duration-200">
                  {CONTACT_INFO.email}
                </a>
              </p>
              <p>
                <a href={`tel:${CONTACT_INFO.phone}`} className="hover:text-safend-canvas transition-colors duration-200">
                  {CONTACT_INFO.phone}
                </a>
              </p>
            </address>
            <div className="mt-6 flex gap-5">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-body text-safend-canvas/60 hover:text-safend-red transition-colors duration-200"
                >
                  {social.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="footer-bottom max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] py-6 border-t border-white/5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[11px] font-body text-safend-canvas/50 tracking-[0.02em]">
            © 2026 Safend Secure Solutions. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <a href="/privacy-policy" className="text-[11px] font-body text-safend-canvas/50 hover:text-safend-canvas/70 transition-colors">
              Privacy Policy
            </a>
            <span className="w-[3px] h-[3px] rounded-full bg-safend-red/40" aria-hidden />
            <a href="/terms" className="text-[11px] font-body text-safend-canvas/50 hover:text-safend-canvas/70 transition-colors">
              Terms
            </a>
            <span className="w-[3px] h-[3px] rounded-full bg-safend-red/40" aria-hidden />
            <button
              type="button"
              onClick={() => { localStorage.removeItem('safend_cookie_consent'); window.location.reload(); }}
              className="text-[11px] font-body text-safend-canvas/50 hover:text-safend-canvas/70 transition-colors"
            >
              Cookie Settings
            </button>
          </div>
        </div>
        <p className="mt-4 text-center sm:text-left text-[11px] font-body text-safend-canvas/40 tracking-[0.02em]">
          CIN: {CONTACT_INFO.cin}
        </p>
      </div>
    </footer>
  );
}
