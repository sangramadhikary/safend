'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

interface NavLinksProps {
  links: Array<{ href: string; label: string }>;
}

export function NavLinks({ links }: NavLinksProps) {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <ul className="flex items-center gap-1" onMouseLeave={() => setHovered(null)}>
      {links.map((link) => {
        const isActive =
          link.href === '/'
            ? pathname === '/'
            : pathname.startsWith(link.href);
        const isHighlighted = hovered === link.href;

        return (
          <li key={link.href} className="relative">
            <Link
              href={link.href}
              aria-current={isActive ? 'page' : undefined}
              onMouseEnter={() => setHovered(link.href)}
              onFocus={() => setHovered(link.href)}
              className={`relative block px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                isActive ? 'text-[#D71920]' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {/* Hover pill that glides between items */}
              {isHighlighted && (
                <motion.span
                  layoutId="nav-hover-pill"
                  className="absolute inset-0 -z-10 rounded-md bg-gray-100"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative z-10">{link.label}</span>
              {/* Active underline that slides between active routes */}
              {isActive && (
                <motion.span
                  layoutId="nav-active-underline"
                  className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded-full bg-[#D71920]"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
