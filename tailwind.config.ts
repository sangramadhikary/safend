
import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1440px'
			}
		},
		screens: {
			'xs': '480px',
			'sm': '640px',
			'md': '768px',
			'lg': '1024px',
			'xl': '1280px',
			'2xl': '1536px',
		},
		extend: {
			fontFamily: {
				'montserrat': ['Montserrat', 'sans-serif'],
				'lato': ['Lato', 'sans-serif'],
				'heading': ['Montserrat', 'sans-serif'],
				'body': ['Lato', 'sans-serif'],
				'display': ['Montserrat', 'sans-serif'],
			},
			fontSize: {
				// Editorial scale — adapted from design tokens
				'caption': ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.01em' }],
				'body-sm': ['0.875rem', { lineHeight: '1.4', letterSpacing: '-0.02em' }],
				'body': ['1rem', { lineHeight: '1.4', letterSpacing: '-0.02em' }],
				'subheading': ['1.125rem', { lineHeight: '1.4', letterSpacing: '-0.02em' }],
				'heading-sm': ['3.75rem', { lineHeight: '0.9', letterSpacing: '-0.02em' }],
				'heading': ['4.5rem', { lineHeight: '1.1' }],
				'heading-lg': ['6rem', { lineHeight: '1.0', letterSpacing: '-0.02em' }],
				'display': ['clamp(4rem, 10vw, 8.75rem)', { lineHeight: '0.9', letterSpacing: '-0.01em' }],
				'display-lg': ['clamp(6rem, 15vw, 15rem)', { lineHeight: '0.9', letterSpacing: '-0.02em' }],
				// Legacy sizes for compatibility
				'h1': ['3rem', { lineHeight: '1.2', fontWeight: '700' }],
				'h2': ['2.25rem', { lineHeight: '1.3', fontWeight: '600' }],
				'h3': ['1.75rem', { lineHeight: '1.3', fontWeight: '500' }],
			},
			// Editorial spacing scale from design tokens
			spacing: {
				'section': '120px',
				'section-sm': '80px',
				'element': '20px',
				'card-pad': '20px',
			},
			maxWidth: {
				'editorial': '1440px',
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				// Safend editorial color system (adapted from design tokens)
				safend: {
					// Canvas — near-white with a very faint warm tint
					canvas: '#FFFAF9',
					// Primary text — near-black
					ink: '#111111',
					// Primary Colors
					red: '#D71920',
					black: '#000000',
					white: '#FFFFFF',
					// Secondary Colors
					'slate-grey': '#4A4A4A',
					'light-grey': '#F5F5F5',
					// Muted text  
					muted: '#6B6B6B',
					// Hairline dividers
					mist: '#E5E0DD',
					// Functional Colors
					success: '#2BA745',
					warning: '#FFC107',
					error: '#DC3545',
					info: '#17A2B8',
					neutral: '#6C757D',
				},
				// Brand colors for compatibility
				'brand-red': '#D71920',
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'wiggle': {
					'0%, 100%': { transform: 'rotate(-4deg) translateY(0px)' },
					'25%': { transform: 'rotate(5deg) translateY(-2px)' },
					'50%': { transform: 'rotate(-3deg) translateY(1px)' },
					'75%': { transform: 'rotate(4deg) translateY(-1px)' },
				},
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' }
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' }
				},
				'slide-in-right': {
					'0%': { transform: 'translateX(100%)' },
					'100%': { transform: 'translateX(0)' }
				},
				'slide-out-right': {
					'0%': { transform: 'translateX(0)' },
					'100%': { transform: 'translateX(100%)' }
				},
				'fade-in': {
					'0%': { opacity: '0' },
					'100%': { opacity: '1' }
				},
				'fade-out': {
					'0%': { opacity: '1' },
					'100%': { opacity: '0' }
				},
				'count-up': {
					'0%': { transform: 'translateY(100%)', opacity: '0' },
					'100%': { transform: 'translateY(0)', opacity: '1' }
				},
				'ripple': {
					'0%': { transform: 'scale(0)', opacity: '1' },
					'100%': { transform: 'scale(4)', opacity: '0' }
				},
				'tilt-in': {
					'0%': { transform: 'rotateX(-30deg)', opacity: '0' },
					'100%': { transform: 'rotateX(0deg)', opacity: '1' }
				},
				'float': {
					'0%, 100%': { transform: 'translateY(0)' },
					'50%': { transform: 'translateY(-10px)' }
				},
				'pulse-red': {
					'0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 33, 33, 0.7)' },
					'50%': { boxShadow: '0 0 0 15px rgba(255, 33, 33, 0)' }
				},
				'pulse-custom': {
					'0%, 100%': { opacity: '1' },
					'50%': { opacity: '0.5' }
				},
				'shimmer': {
					'0%': { backgroundPosition: '-200% 0' },
					'100%': { backgroundPosition: '200% 0' }
				},
				'fade-in-up': {
					'0%': { opacity: '0', transform: 'translateY(10px)' },
					'100%': { opacity: '1', transform: 'translateY(0)' }
				},
				'scanLine': {
					'0%': { top: '16.67%', opacity: '0' },
					'10%': { opacity: '1' },
					'90%': { opacity: '1' },
					'100%': { top: '83.33%', opacity: '0' }
				}
			},
			animation: {
				'wiggle': 'wiggle 1.4s ease-in-out infinite',
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'slide-in-right': 'slide-in-right 0.3s ease-out',
				'slide-out-right': 'slide-out-right 0.3s ease-out',
				'fade-in': 'fade-in 0.3s ease-out',
				'fade-out': 'fade-out 0.3s ease-out',
				'count-up': 'count-up 1s cubic-bezier(0.16, 1, 0.3, 1)',
				'ripple': 'ripple 0.6s linear',
				'tilt-in': 'tilt-in 0.3s ease-out',
				'float': 'float 4s ease-in-out infinite',
				'pulse-red': 'pulse-red 2s infinite',
				'pulse-custom': 'pulse-custom 2s infinite',
				'shimmer': 'shimmer 2s ease-in-out infinite',
				'fade-in-up': 'fade-in-up 0.6s ease-out'
			},
			backdropFilter: {
				'none': 'none',
				'blur': 'blur(8px)'
			},
			boxShadow: {
				'glass': '0 4px 24px 0 rgba(0, 0, 0, 0.05)',
				'glass-dark': '0 4px 24px 0 rgba(255, 255, 255, 0.05)',
				'red-glow': '0 0 15px rgba(255, 33, 33, 0.5)'
			},
			backgroundImage: {
				'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
			}
		}
	},
	plugins: [tailwindcssAnimate],
} satisfies Config;
