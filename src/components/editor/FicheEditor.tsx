'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { useCallback, useRef, useState } from 'react'
import { ficheExtensions } from '@/lib/editor/extensions'
import { EditorToolbar } from './EditorToolbar'
import { Check, Loader2 } from 'lucide-react'
import '@/styles/editor.css'

interface FicheEditorProps {
  ficheId: string
  initialContent: Record<string, unknown>
}

export function FicheEditor({ ficheId, initialContent }: FicheEditorProps) {
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle')
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveContent = useCallback(
    async (content: Record<string, unknown>) => {
      setSaveStatus('saving')
      try {
        await fetch(`/api/fiches/${ficheId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        })
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        setSaveStatus('idle')
      }
    },
    [ficheId]
  )

  const editor = useEditor({
    extensions: ficheExtensions,
    content: initialContent,
    onUpdate: ({ editor }) => {
      // Debounced auto-save
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(() => {
        saveContent(editor.getJSON())
      }, 800)
    },
    editorProps: {
      attributes: {
        class: 'fiche-editor-content focus:outline-none',
      },
    },
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-1 bg-gray-50 border-b border-gray-200">
        <div />
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {saveStatus === 'saving' && (
            <>
              <Loader2 size={12} className="animate-spin" />
              Sauvegarde...
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <Check size={12} className="text-green-500" />
              Sauvegarde
            </>
          )}
        </div>
      </div>

      <EditorToolbar editor={editor} />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}
