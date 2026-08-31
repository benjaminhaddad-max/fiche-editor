'use client'

import { useFormStatus } from 'react-dom'
import { Button } from './Button'
import type { ComponentProps } from 'react'

/**
 * Bouton de soumission qui se desactive tant que la server action tourne.
 * Evite les doubles validations / doubles factures sur double clic.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? (pendingLabel ?? 'En cours…') : children}
    </Button>
  )
}
