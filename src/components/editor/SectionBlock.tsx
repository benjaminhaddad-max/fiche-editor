'use client'

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { Trash2, Plus, ChevronUp, ChevronDown } from 'lucide-react'
import type { NodeViewProps } from '@tiptap/react'

export function SectionBlockView({ node, getPos, editor }: NodeViewProps) {
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

    if (direction === 'up') {
      const resolvedPos = doc.resolve(pos)
      if (resolvedPos.parentOffset === 0) return
    }
    if (direction === 'down') {
      const nextPos = pos + node.nodeSize
      if (nextPos >= doc.content.size) return
    }

    const nodeSlice = doc.slice(pos, pos + node.nodeSize)
    tr.delete(pos, pos + node.nodeSize)

    if (direction === 'up') {
      const $before = tr.doc.resolve(pos - 1)
      const beforeStart = $before.before($before.depth)
      tr.insert(beforeStart, nodeSlice.content)
    } else {
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

  function addRow() {
    const pos = getPos()
    if (pos === undefined) return
    const endPos = pos + node.nodeSize - 1

    const newRow = {
      type: 'topicRow',
      content: [
        { type: 'topicLabel' },
        { type: 'topicContent', content: [{ type: 'paragraph' }] },
      ],
    }

    editor.chain().focus().insertContentAt(endPos, newRow).run()
  }

  return (
    <NodeViewWrapper
      className="section-block"
      style={{ '--label-width': `${node.attrs.labelWidth ?? 160}px` } as React.CSSProperties}
    >
      {/* Hover controls */}
      <div className="section-controls" contentEditable={false}>
        <button onClick={() => moveSection('up')} title="Monter" className="section-ctrl-btn">
          <ChevronUp size={14} />
        </button>
        <button onClick={() => moveSection('down')} title="Descendre" className="section-ctrl-btn">
          <ChevronDown size={14} />
        </button>
        <button onClick={deleteSection} title="Supprimer" className="section-ctrl-btn section-ctrl-danger">
          <Trash2 size={14} />
        </button>
      </div>

      {/* sectionHeader (blue bar via CSS) + topicRows */}
      <NodeViewContent className="section-inner" />

      {/* Add row button at bottom */}
      <button onClick={addRow} className="section-add-row" contentEditable={false}>
        <Plus size={14} />
        <span>Ajouter une ligne</span>
      </button>
    </NodeViewWrapper>
  )
}
