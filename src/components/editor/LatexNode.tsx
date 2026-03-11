'use client'

import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import katex from 'katex'

export function LatexNodeView({ node, updateAttributes, selected }: NodeViewProps) {
  const [editing, setEditing] = useState(false)
  const [formula, setFormula] = useState(node.attrs.formula || '')
  const inputRef = useRef<HTMLInputElement>(null)
  const renderRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!editing && renderRef.current) {
      try {
        katex.render(node.attrs.formula || '', renderRef.current, {
          throwOnError: false,
          displayMode: false,
        })
      } catch {
        renderRef.current.textContent = node.attrs.formula || '?'
      }
    }
  }, [node.attrs.formula, editing])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function handleSave() {
    updateAttributes({ formula })
    setEditing(false)
  }

  if (editing) {
    return (
      <NodeViewWrapper as="span" className="latex-node-editing">
        <input
          ref={inputRef}
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') { setFormula(node.attrs.formula); setEditing(false) }
          }}
          onBlur={handleSave}
          placeholder="x^2 + y^2 = z^2"
        />
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper
      as="span"
      className={`latex-node ${selected ? 'ProseMirror-selectednode' : ''}`}
      onDoubleClick={() => setEditing(true)}
      title="Double-cliquer pour modifier la formule"
    >
      <span ref={renderRef} />
    </NodeViewWrapper>
  )
}
