'use client'

import { clsx } from 'clsx'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors cursor-pointer',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        {
          'bg-navy text-cream hover:bg-navy-light focus-visible:ring-gold': variant === 'primary',
          'border border-line bg-white text-navy hover:bg-cream-muted focus-visible:ring-gold':
            variant === 'secondary',
          'text-navy/70 hover:bg-cream-deep focus-visible:ring-gold': variant === 'ghost',
          'bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-500': variant === 'danger',
          'bg-gold text-navy hover:bg-gold-dark hover:text-cream focus-visible:ring-gold':
            variant === 'success',
        },
        {
          'px-2.5 py-1.5 text-xs': size === 'sm',
          'px-4 py-2 text-sm': size === 'md',
          'px-6 py-3 text-base': size === 'lg',
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
)
Button.displayName = 'Button'
