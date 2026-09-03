'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { LoginButton } from './LoginButton';

interface MobileNavMenuProps {
  links: Array<{ href: string; label: string }>;
}

export function MobileNavMenu({ links }: MobileNavMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden flex items-center gap-3">
      {/* Login button always visible on mobile */}
      <LoginButton className="px-4 py-2" />

      {/* Hamburger toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-700 hover:text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-[#D71920] rounded-md"
        aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isOpen}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Mobile dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 bg-white border-t border-gray-100 shadow-lg z-50">
          <nav className="flex flex-col py-2" aria-label="Mobile navigation">
            {links.map((link) => {
              const isActive =
                link.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-6 py-3 text-left transition-colors text-sm font-medium ${
                    isActive
                      ? 'text-[#D71920] bg-gray-50'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
