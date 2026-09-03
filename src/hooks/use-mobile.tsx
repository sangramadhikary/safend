'use client';

import * as React from "react"

const MOBILE_BREAKPOINT = 1024 // Treat anything below 1024px as mobile/tablet for navigation purposes

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    // Use matchMedia to check if the screen size is below the mobile breakpoint
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    
    const onChange = () => {
      setIsMobile(mql.matches)
    }
    
    // Set initial state
    setIsMobile(mql.matches)
    
    // Add event listener
    mql.addEventListener("change", onChange)
    
    // Clean up
    return () => mql.removeEventListener("change", onChange)
  }, [])

  // Return current mobile state with fallback to false if it's undefined
  return isMobile === undefined ? false : isMobile
}

/** Narrower breakpoint for truly small phone screens (< 640px) */
export function useIsSmallPhone() {
  const [isSmall, setIsSmall] = React.useState<boolean>(false)

  React.useEffect(() => {
    const mql = window.matchMedia('(max-width: 639px)')
    const onChange = () => setIsSmall(mql.matches)
    setIsSmall(mql.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isSmall
}
