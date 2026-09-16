import { redirect } from 'next/navigation'

/** Les bordereaux vivent désormais dans la page Facturation. */
export default function BordereauxPage() {
  redirect('/factures')
}
