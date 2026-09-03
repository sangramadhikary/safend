'use client';

import { useState } from 'react';
import { getPortalUrl } from '@/lib/portalUrls';

interface LoginButtonProps {
  /** Additional classes appended to the base Brand_Color button styling. */
  className?: string;
}

const LOGIN_OPTIONS = [
  { id: 'client', label: 'Client Login', getHref: () => getPortalUrl('client', '/login'), comingSoon: false },
  { id: 'employee', label: 'Employee Login', getHref: () => getPortalUrl('ops', '/login'), comingSoon: false },
  { id: 'office', label: 'Office Login', getHref: () => getPortalUrl('office', '/login'), comingSoon: false },
];

/**
 * Login button with a hover dropdown showing 3 login options:
 * Client Login, Employee Login, and Office Login.
 */
export function LoginButton({ className = 'px-5 py-2' }: LoginButtonProps) {
  const [hasError, setHasError] = useState(false);

  function handleNavigate(href: string) {
    setHasError(false);
    try {
      window.location.href = href;
    } catch {
      setHasError(true);
    }
  }

  return (
    <div className="relative inline-flex flex-col items-stretch group">
      <button
        type="button"
        className={`rounded-md text-white text-sm font-medium bg-[#D71920] hover:bg-[#b8151b] transition-colors ${className}`}
      >
        Login
      </button>

      {/* Hover dropdown */}
      <div className="absolute top-full right-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <div className="w-44 rounded-lg bg-white border border-gray-200 shadow-lg overflow-hidden">
          {LOGIN_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => !option.comingSoon && handleNavigate(option.getHref())}
              disabled={option.comingSoon}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                option.comingSoon
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-[#D71920]'
              }`}
            >
              {option.label}
              {option.comingSoon && (
                <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                  Soon
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {hasError && (
        <div
          role="alert"
          className="absolute top-full right-0 mt-2 w-56 rounded-md bg-red-50 border border-red-200 px-3 py-2 shadow-md z-50"
        >
          <p className="text-red-800 text-xs">
            The login screen could not be opened. Please try again.
          </p>
        </div>
      )}
    </div>
  );
}
