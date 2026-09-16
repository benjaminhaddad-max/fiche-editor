import { redirect } from 'next/navigation'

/** Le tableau de bord n'existe plus : on arrive directement sur les prestations. */
export default function AdminPage() {
  redirect('/validation')
}
