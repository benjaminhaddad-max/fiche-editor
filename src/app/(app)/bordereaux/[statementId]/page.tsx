import { redirect } from 'next/navigation'

/** Le bordereau se consulte et se facture depuis la page Facturation. */
export default function BordereauPage() {
  redirect('/factures')
}
