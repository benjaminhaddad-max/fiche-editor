'use client'

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { Trash2, Plus } from 'lucide-react'
import type { NodeViewProps } from '@tiptap/react'

export function TopicRowView({ node, getPos, editor }: NodeViewProps) {
  function deleteRow() {
    const pos = getPos()
    if (pos === undefined) return

    // Don't delete if it's the last row in the section
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

    const newRow = editor.state.schema.nodes.topicRow.create(null, [
      editor.state.schema.nodes.topicLabel.create(null, [
        editor.state.schema.text('Label'),
      ]),
      editor.state.schema.nodes.topicContent.create(null, [
        editor.state.schema.nodes.paragraph.create(),
      ]),
    ])

    editor.chain().focus().insertContentAt(endPos, newRow.toJSON()).run()
  }

  return (
    <NodeViewWrapper className="topic-row-wrapper group relative">
      <div className="topic-row-grid">
        <NodeViewContent />
      </div>

      {/* Action buttons on hover */}
      <div
        className="absolute -right-10 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        contentEditable={false}
      >
        <button
          onClick={addRowAfter}
          className="p-1 rounded bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors cursor-pointer"
          title="Ajouter une ligne"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={deleteRow}
          className="p-1 rounded bg-red-100 text-red-500 hover:bg-red-200 transition-colors cursor-pointer"
          title="Supprimer la ligne"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </NodeViewWrapper>
  )
}
