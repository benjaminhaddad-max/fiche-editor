'use client'

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { Trash2, Plus } from 'lucide-react'
import type { NodeViewProps } from '@tiptap/react'

export function TopicRowView({ node, getPos, editor }: NodeViewProps) {
  function deleteRow() {
    const pos = getPos()
    if (pos === undefined) return
    const resolvedPos = editor.state.doc.resolve(pos)
    const parent = resolvedPos.parent
    const rowCount = parent.content.content.filter(
      (n) => n.type.name === 'topicRow'
    ).length
    if (rowCount <= 1) return
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
  }

  function addRowAfter() {
    const pos = getPos()
    if (pos === undefined) return
    const endPos = pos + node.nodeSize

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
      className="topic-row"
      style={node.attrs.rowMinHeight ? { minHeight: `${node.attrs.rowMinHeight}px` } : undefined}
    >
      <NodeViewContent className="topic-row-grid" />

      {/* Row actions on hover */}
      <div className="topic-row-actions" contentEditable={false}>
        <button onClick={addRowAfter} className="topic-action-btn topic-action-add" title="Ajouter une ligne apres">
          <Plus size={12} />
        </button>
        <button onClick={deleteRow} className="topic-action-btn topic-action-delete" title="Supprimer cette ligne">
          <Trash2 size={12} />
        </button>
      </div>
    </NodeViewWrapper>
  )
}
