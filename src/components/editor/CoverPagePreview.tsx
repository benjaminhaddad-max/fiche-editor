'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { renderCoverPage } from '@/lib/pdf/template'
import { getPdfStyles } from '@/lib/pdf/styles'
import { extractPlan } from '@/lib/editor/plan-extractor'
import type { Fiche } from '@/lib/types/fiche'

interface CoverPagePreviewProps {
  fiche: Fiche
  editorContent: Record<string, unknown>
  onClose: () => void
}

export function CoverPagePreview({ fiche, editorContent, onClose }: CoverPagePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const plan = extractPlan(editorContent as Parameters<typeof extractPlan>[0])
    const ficheWithContent = { ...fiche, content: editorContent }
    const coverHtml = renderCoverPage(ficheWithContent, plan)
    const css = getPdfStyles()

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <style>
    ${css}
    html, body {
      margin: 0;
      padding: 0;
      background: white;
    }
    .cover-page {
      page-break-after: unset;
      height: auto;
      padding: 15mm 12mm 22mm 12mm;
    }
  </style>
</head>
<body>${coverHtml}</body>
</html>`

    const doc = iframe.contentDocument
    if (doc) {
      doc.open()
      doc.write(html)
      doc.close()
    }
  }, [fiche, editorContent])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="relative bg-white rounded-lg shadow-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 bg-white rounded-full shadow-md hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>
        <div className="p-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">Aperçu de la page de garde</h3>
          <div className="border border-gray-300 shadow-inner" style={{ width: '595px', height: '842px' }}>
            <iframe
              ref={iframeRef}
              title="Aperçu page de garde"
              style={{ width: '595px', height: '842px', border: 'none' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
