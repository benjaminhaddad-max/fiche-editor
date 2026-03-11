'use client'

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { GripVertical, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { toRoman } from '@/lib/editor/utils'
import type { NodeViewProps } from '@tiptap/react'

export function SectionBlockView({ node, getPos, editor }: NodeViewProps) {
  const sectionNumber = node.attrs.sectionNumber || 1
  const headerColor = node.attrs.headerColor || '#1e40af'

  function deleteSection() {
    if (!confirm('Supprimer cette section ?')) return
    const pos = getPos()
    if (pos === undefined) return
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
  }

  function moveSection(direction: 'up' | 'down') {
    const pos = getPos()
    if (pos === undefined) return
    const { doc, tr } = editor.state
    const resolvedPos = doc.resolve(pos)
    const parentOffset = resolvedPos.parentOffset

    if (direction === 'up' && parentOffset === 0) return
    if (direction === 'down') {
      const nextPos = pos + node.nodeSize
      if (nextPos >= doc.content.size) return
    }

    // Simple move: cut and paste
    const nodeSlice = doc.slice(pos, pos + node.nodeSize)
    tr.delete(pos, pos + node.nodeSize)

    if (direction === 'up') {
      const $before = tr.doc.resolve(pos - 1)
      const beforeStart = $before.before($before.depth)
      tr.insert(beforeStart, nodeSlice.content)
    } else {
      // After deletion, get the current node at pos (which was the next sibling)
      const $after = tr.doc.resolve(Math.min(pos, tr.doc.content.size))
      if ($after.nodeAfter) {
        const afterEnd = pos + $after.nodeAfter.nodeSize
        tr.insert(afterEnd, nodeSlice.content)
      } else {
        tr.insert(pos, nodeSlice.content)
      }
    }

    editor.view.dispatch(tr)
  }

  return (
    <NodeViewWrapper className="section-block-wrapper mb-6" data-drag-handle>
      <div
        className="section-header-bar flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-white"
        style={{ backgroundColor: headerColor }}
        contentEditable={false}
      >
        <div className="flex items-center gap-1 mr-2 opacity-60">
          <button
            onClick={() => moveSection('up')}
            className="hover:opacity-100 transition-opacity cursor-pointer"
            title="Monter"
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={() => moveSection('down')}
            className="hover:opacity-100 transition-opacity cursor-pointer"
            title="Descendre"
          >
            <ChevronDown size={16} />
          </button>
          <GripVertical size={16} className="cursor-grab" />
        </div>

        <span className="font-bold text-sm whitespace-nowrap mr-2">
          {toRoman(sectionNumber)}.
        </span>

        <div className="flex-1 min-w-0" />

        <button
          onClick={deleteSection}
          className="opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
          title="Supprimer la section"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="section-content border border-t-0 border-gray-200 rounded-b-lg overflow-hidden bg-white">
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  )
}
