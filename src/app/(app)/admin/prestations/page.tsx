import { redirect } from 'next/navigation'

/** Fusionné dans Prestations › Historique. */
export default async function AdminMissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const q = new URLSearchParams(await searchParams).toString()
  redirect(`/validation/historique${q ? `?${q}` : ''}`)
}
