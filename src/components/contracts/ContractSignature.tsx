import { CheckCircle2, Clock, Send } from 'lucide-react'
import { envoyerContrat } from '@/app/(app)/admin/contrats/actions'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatDate } from '@/lib/format'

/** Où en est la signature, et le bouton qui va avec. */
export function ContractSignature({
  id,
  signable,
  sentAt,
  signedAt,
  signerName,
  reference,
}: {
  id: string
  signable: boolean
  sentAt: string | null
  signedAt: string | null
  signerName: string | null
  reference: string | null
}) {
  if (signedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 size={14} />
        Signé par {signerName} le {formatDate(signedAt)}
        {reference ? ` · réf. ${reference}` : ''}
      </span>
    )
  }
  if (!signable) {
    return <span className="text-xs text-muted">Signature hors plateforme — déposez le PDF signé.</span>
  }
  return (
    <form action={envoyerContrat} className="flex items-center gap-2">
      <input type="hidden" name="contract_id" value={id} />
      {sentAt && (
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-700">
          <Clock size={13} />
          Envoyé le {formatDate(sentAt)}, pas encore signé
        </span>
      )}
      <SubmitButton size="sm" variant="secondary" pendingLabel="Envoi…">
        <Send size={13} />
        {sentAt ? 'Renvoyer le lien' : 'Envoyer à signer'}
      </SubmitButton>
    </form>
  )
}
