import { clsx } from 'clsx'
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

interface Wrapper {
  label?: string
  hint?: string
  error?: string
}

function Shell({
  label,
  hint,
  error,
  htmlFor,
  children,
}: Wrapper & { htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      {label && (
        <label htmlFor={htmlFor} className="field-label">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({
  label,
  hint,
  error,
  className,
  ...props
}: Wrapper & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Shell label={label} hint={hint} error={error} htmlFor={props.id}>
      <input
        className={clsx('field', error && 'border-red-500', className)}
        {...props}
      />
    </Shell>
  )
}

export function Select({
  label,
  hint,
  error,
  className,
  children,
  ...props
}: Wrapper & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Shell label={label} hint={hint} error={error} htmlFor={props.id}>
      <select
        className={clsx('field', error && 'border-red-500', className)}
        {...props}
      >
        {children}
      </select>
    </Shell>
  )
}

export function Textarea({
  label,
  hint,
  error,
  className,
  ...props
}: Wrapper & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Shell label={label} hint={hint} error={error} htmlFor={props.id}>
      <textarea
        className={clsx('field resize-y', error && 'border-red-500', className)}
        {...props}
      />
    </Shell>
  )
}
