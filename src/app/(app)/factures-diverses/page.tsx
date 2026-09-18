import { redirect } from 'next/navigation'

/** Fusionné dans Rémunérations. */
export default function Page() {
  redirect('/remunerations?vue=deposer')
}
