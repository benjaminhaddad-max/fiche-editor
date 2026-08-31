import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getInvoicePdf } from '@/lib/invoice/store'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Sert le PDF d'une facture. L'acces est verifie ici plutot que via une URL
 * signee : un prestataire ne voit que ses factures, l'admin les voit toutes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const { invoiceId } = await params

  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 })
  }

  // La RLS fait le controle d'acces : si la facture n'est pas visible pour
  // cet utilisateur, la requete ne renvoie rien.
  const supabase = await createServerSupabase()
  const { data: invoice } = await supabase
    .from('inv_invoices')
    .select('id, number')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!invoice) {
    return NextResponse.json({ error: 'Facture introuvable.' }, { status: 404 })
  }

  try {
    const pdf = await getInvoicePdf(invoiceId)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Facture-${invoice.number}.pdf"`,
        'Cache-Control': 'private, max-age=60',
      },
    })
  } catch (err) {
    console.error('[invoice pdf]', err)
    return NextResponse.json(
      { error: 'Génération du PDF impossible.' },
      { status: 500 }
    )
  }
}
