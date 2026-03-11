'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { FicheEditor } from '@/components/editor/FicheEditor'
import { MetadataForm } from '@/components/metadata/MetadataForm'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import type { Fiche } from '@/lib/types/fiche'
import Link from 'next/link'

export default function FicheEditorPage() {
  const params = useParams()
  const router = useRouter()
  const ficheId = params.ficheId as string

  const [fiche, setFiche] = useState<Fiche | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    fetch(`/api/fiches/${ficheId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found')
        return res.json()
      })
      .then((data) => {
        setFiche(data)
        setLoading(false)
      })
      .catch(() => {
        router.push('/fiches')
      })
  }, [ficheId, router])

  async function handleExportPdf() {
    setExporting(true)
    try {
      const res = await fetch(`/api/pdf/${ficheId}`)
      if (!res.ok) throw new Error('PDF generation failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fiche-${fiche?.numero}-${fiche?.matiere || 'export'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Erreur lors de la generation du PDF')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    )
  }

  if (!fiche) return null

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <Link href="/fiches">
            <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer">
              <ArrowLeft size={18} />
            </button>
          </Link>
          <div>
            <h2 className="font-semibold text-sm">
              Fiche {fiche.numero} - {fiche.titre}
            </h2>
            <p className="text-xs text-gray-400">{fiche.matiere}</p>
          </div>
        </div>

        <Button
          onClick={handleExportPdf}
          disabled={exporting}
          size="sm"
        >
          {exporting ? (
            <><Loader2 size={14} className="animate-spin mr-2" />Export...</>
          ) : (
            <><Download size={14} className="mr-2" />Exporter PDF</>
          )}
        </Button>
      </div>

      {/* Metadata bar */}
      <MetadataForm fiche={fiche} />

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <FicheEditor ficheId={fiche.id} initialContent={fiche.content} />
      </div>
    </div>
  )
}
