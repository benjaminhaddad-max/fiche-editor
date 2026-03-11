import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

async function getAuthUser() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ficheId: string }> }
) {
  const { ficheId } = await params
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const service = createServiceClient()
  const { data: fiche, error } = await service
    .from('fiches')
    .select('*')
    .eq('id', ficheId)
    .single()

  if (error || !fiche) {
    return NextResponse.json({ error: 'Fiche non trouvee' }, { status: 404 })
  }

  return NextResponse.json(fiche)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ ficheId: string }> }
) {
  const { ficheId } = await params
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const body = await request.json()
  const service = createServiceClient()

  // Only allow updating specific fields
  const allowedFields: Record<string, unknown> = {}
  const updateableKeys = ['annee', 'faculte', 'matiere', 'numero', 'titre', 'content', 'status']
  for (const key of updateableKeys) {
    if (body[key] !== undefined) {
      allowedFields[key] = body[key]
    }
  }

  const { data: fiche, error } = await service
    .from('fiches')
    .update(allowedFields)
    .eq('id', ficheId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(fiche)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ ficheId: string }> }
) {
  const { ficheId } = await params
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

  const service = createServiceClient()
  const { error } = await service
    .from('fiches')
    .delete()
    .eq('id', ficheId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
