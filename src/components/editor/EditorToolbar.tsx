'use client'

import { useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold, Italic, Underline, List,
  Zap, Target, Lightbulb,
  Type, Highlighter, Plus, TableProperties,
  Undo2, Redo2,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { AnnotationType } from '@/lib/editor/extensions/annotation-mark'

interface ToolbarProps {
  editor: Editor | null
}

const TEXT_COLORS = [
  '#000000', '#1e40af', '#dc2626', '#16a34a', '#ca8a04',
  '#9333ea', '#0891b2', '#ea580c', '#64748b', '#be185d',
]

const BG_COLORS = [
  'transparent', '#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3',
  '#f3e8ff', '#ccfbf1', '#fee2e2', '#e2e8f0', '#fef9c3',
]

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        'p-1.5 rounded transition-colors cursor-pointer',
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:bg-gray-100'
      )}
    >
      {children}
    </button>
  )
}

function ColorPicker({
  colors,
  currentColor,
  onSelect,
  icon: Icon,
  title,
}: {
  colors: string[]
  currentColor?: string
  onSelect: (color: string) => void
  icon: React.ElementType
  title: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        title={title}
        className="p-1.5 rounded text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <Icon size={16} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 grid grid-cols-5 gap-1">
          {colors.map((color) => (
            <button
              key={color}
              onClick={() => { onSelect(color); setOpen(false) }}
              className={clsx(
                'w-6 h-6 rounded border cursor-pointer',
                currentColor === color ? 'ring-2 ring-blue-500' : 'border-gray-200',
                color === 'transparent' ? 'bg-white relative after:absolute after:inset-0 after:border after:border-red-400 after:rotate-45 after:origin-center' : ''
              )}
              style={color !== 'transparent' ? { backgroundColor: color } : undefined}
              title={color === 'transparent' ? 'Aucun' : color}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function EditorToolbar({ editor }: ToolbarProps) {
  if (!editor) return null

  function addSection() {
    if (!editor) return
    const { state } = editor
    const endPos = state.doc.content.size

    // Count existing sections to auto-number
    let sectionCount = 0
    state.doc.descendants((node) => {
      if (node.type.name === 'sectionBlock') sectionCount++
    })

    const newSection = {
      type: 'sectionBlock',
      attrs: { sectionNumber: sectionCount + 1 },
      content: [
        {
          type: 'sectionHeader',
          attrs: { subtitle: '' },
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
              content: [{ type: 'paragraph' }],
            },
          ],
        },
      ],
    }

    editor.chain().focus().insertContentAt(endPos, newSection).run()
  }

  function addSubTable() {
    const subTable = {
      type: 'nestedSubTable',
      content: [
        {
          type: 'nestedSubRow',
          content: [
            {
              type: 'nestedSubLabel',
              content: [{ type: 'text', text: 'Label' }],
            },
            {
              type: 'nestedSubContent',
              content: [{ type: 'paragraph' }],
            },
          ],
        },
      ],
    }

    editor?.chain().focus().insertContent(subTable).run()
  }

  function toggleAnnotation(type: AnnotationType) {
    editor?.chain().focus().toggleAnnotation(type).run()
  }

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-1 flex-wrap">
      {/* Undo / Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Annuler (Ctrl+Z)"
      >
        <Undo2 size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Refaire (Ctrl+Y)"
      >
        <Redo2 size={16} />
      </ToolbarButton>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Gras (Ctrl+B)"
      >
        <Bold size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italique (Ctrl+I)"
      >
        <Italic size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="Souligne (Ctrl+U)"
      >
        <Underline size={16} />
      </ToolbarButton>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Colors */}
      <ColorPicker
        colors={TEXT_COLORS}
        onSelect={(color) => editor.chain().focus().setColor(color).run()}
        icon={Type}
        title="Couleur du texte"
      />
      <ColorPicker
        colors={BG_COLORS}
        onSelect={(color) => {
          if (color === 'transparent') {
            editor.chain().focus().unsetHighlight().run()
          } else {
            editor.chain().focus().toggleHighlight({ color }).run()
          }
        }}
        icon={Highlighter}
        title="Surlignage"
      />

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Liste a puces"
      >
        <List size={16} />
      </ToolbarButton>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Annotations */}
      <ToolbarButton
        onClick={() => toggleAnnotation('notion-nouvelle')}
        active={editor.isActive('annotation', { type: 'notion-nouvelle' })}
        title="Notion nouvelle"
      >
        <Zap size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => toggleAnnotation('tombee-concours')}
        active={editor.isActive('annotation', { type: 'tombee-concours' })}
        title="Tombee au concours"
      >
        <Target size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => toggleAnnotation('astuce')}
        active={editor.isActive('annotation', { type: 'astuce' })}
        title="Astuce et methode"
      >
        <Lightbulb size={16} />
      </ToolbarButton>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Structure */}
      <button
        onClick={addSection}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
      >
        <Plus size={14} />
        Section
      </button>
      <button
        onClick={addSubTable}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <TableProperties size={14} />
        Sous-tableau
      </button>
    </div>
  )
}
