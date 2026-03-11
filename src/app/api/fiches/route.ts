import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
  }

  const service = createServiceClient()

  // Get fiche_user
  const { data: ficheUser } = await service
    .from('fiche_users')
    .select('id')
    .eq('auth_id', user.id)
    .single()

  if (!ficheUser) {
    return NextResponse.json({ error: 'Utilisateur non trouve' }, { status: 404 })
  }

  const { data: fiches, error } = await service
    .from('fiches')
    .select('id, matiere, numero, titre, status, updated_at')
    .eq('user_id', ficheUser.id)
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(fiches)
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
  }

  const service = createServiceClient()

  const { data: ficheUser } = await service
    .from('fiche_users')
    .select('id')
    .eq('auth_id', user.id)
    .single()

  if (!ficheUser) {
    return NextResponse.json({ error: 'Utilisateur non trouve' }, { status: 404 })
  }

  const body = await request.json()
  const { annee, faculte, matiere, numero, titre } = body

  if (!annee || !faculte || !matiere || !numero || !titre) {
    return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 })
  }

  // Initial empty document with one section
  const initialContent = {
    type: 'doc',
    content: [
      {
        type: 'sectionBlock',
        attrs: { sectionNumber: 1 },
        content: [
          {
            type: 'sectionHeader',
            attrs: { label: 'Nouvelle section', subtitle: 'Sous-titre' },
            content: [{ type: 'text', text: 'Nouvelle section' }],
          },
          {
            type: 'topicRow',
            content: [
              {
                type: 'topicLabel',
                content: [{ type: 'text', text: 'Label' }],
              },
              {
                type: 'topicContent',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Contenu...' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }

  const { data: fiche, error } = await service
    .from('fiches')
    .insert({
      user_id: ficheUser.id,
      annee,
      faculte,
      matiere,
      numero,
      titre,
      content: initialContent,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(fiche, { status: 201 })
}
