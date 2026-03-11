'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered,
  Zap, Target, Lightbulb,
  Type, Highlighter, Paintbrush,
  Plus, TableProperties, ImagePlus,
  Undo2, Redo2,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Subscript, Superscript,
  Sigma,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { AnnotationType } from '@/lib/editor/extensions/annotation-mark'
import type { BulletStyle } from '@/lib/editor/extensions/custom-bullet-list'

interface ToolbarProps {
  editor: Editor | null
}

const BULLET_STYLES: { style: BulletStyle; symbol: string; label: string }[] = [
  { style: 'auto', symbol: '●○■', label: 'Auto (par niveau)' },
  { style: 'disc', symbol: '●', label: 'Disque plein' },
  { style: 'circle', symbol: '○', label: 'Cercle vide' },
  { style: 'square', symbol: '■', label: 'Carre plein' },
  { style: 'dash', symbol: '—', label: 'Tiret' },
]

const TEXT_COLORS = [
  '#000000', '#1e40af', '#dc2626', '#16a34a', '#ca8a04',
  '#9333ea', '#0891b2', '#ea580c', '#64748b', '#be185d',
  '#7c3aed', '#059669', '#b91c1c', '#1d4ed8', '#a16207',
]

const BG_COLORS = [
  'transparent', '#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3',
  '#f3e8ff', '#ccfbf1', '#fee2e2', '#e2e8f0', '#fef9c3',
  '#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#c4b5fd',
]

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
  className,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        'p-1.5 rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed',
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        className
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
  colorIndicator,
}: {
  colors: string[]
  currentColor?: string
  onSelect: (color: string) => void
  icon: React.ElementType
  title: string
  colorIndicator?: string
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
        className="p-1.5 rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors cursor-pointer flex flex-col items-center"
      >
        <Icon size={16} />
        {colorIndicator && (
          <div
            className="w-4 h-1 rounded-full mt-0.5"
            style={{ backgroundColor: colorIndicator === 'transparent' ? '#e5e7eb' : colorIndicator }}
          />
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-2 z-50 grid grid-cols-5 gap-1.5 min-w-[140px]">
          {colors.map((color) => (
            <button
              key={color}
              onClick={() => { onSelect(color); setOpen(false) }}
              className={clsx(
                'w-6 h-6 rounded border-2 cursor-pointer transition-transform hover:scale-110',
                currentColor === color ? 'ring-2 ring-blue-500 ring-offset-1' : 'border-gray-200',
                color === 'transparent' ? 'bg-white relative overflow-hidden' : ''
              )}
              style={color !== 'transparent' ? { backgroundColor: color } : undefined}
              title={color === 'transparent' ? 'Aucun' : color}
            >
              {color === 'transparent' && (
                <div className="absolute inset-0 flex items-center justify-center text-red-400 text-xs font-bold">/</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BulletStylePicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const isActive = editor.isActive('bulletList')
  const currentStyle = (editor.getAttributes('bulletList').bulletStyle as BulletStyle) || 'auto'

  return (
    <div className="relative flex" ref={ref}>
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Liste a puces"
        className={clsx(
          'p-1.5 rounded-l transition-colors cursor-pointer',
          isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        )}
      >
        <List size={16} />
      </button>
      <button
        onClick={() => setOpen(!open)}
        title="Choisir le style de puce"
        className={clsx(
          'px-1 py-1.5 rounded-r transition-colors cursor-pointer border-l border-gray-200',
          isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        )}
      >
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-1.5 z-50 min-w-[170px]">
          <div className="text-[10px] text-gray-400 px-2 py-1 font-medium">Style de puce</div>
          {BULLET_STYLES.map(({ style, symbol, label }) => (
            <button
              key={style}
              onClick={() => {
                editor.chain().focus().setBulletStyle(style).run()
                setOpen(false)
              }}
              className={clsx(
                'w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors cursor-pointer',
                isActive && currentStyle === style ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              <span className="w-6 text-center text-sm leading-none">{symbol}</span>
              <span>{label}</span>
            </button>
          ))}
          {isActive && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { editor.chain().focus().toggleBulletList().run(); setOpen(false) }}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-sm text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <span className="w-6 text-center text-xs">✕</span>
                <span>Supprimer la liste</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ToolbarSeparator() {
  return <div className="w-px h-7 bg-gray-200 mx-1 shrink-0" />
}

function ToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-0.5">
        {children}
      </div>
      <span className="text-[9px] text-gray-400 mt-0.5 leading-none">{label}</span>
    </div>
  )
}

export function EditorToolbar({ editor }: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addSection = useCallback(() => {
    if (!editor) return
    const { state } = editor
    const endPos = state.doc.content.size

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
          content: [
            { type: 'sectionTitle' },
            { type: 'sectionSubtitle' },
          ],
        },
        {
          type: 'topicRow',
          content: [
            { type: 'topicLabel' },
            { type: 'topicContent', content: [{ type: 'paragraph' }] },
          ],
        },
      ],
    }

    editor.chain().focus().insertContentAt(endPos, newSection).run()
  }, [editor])

  const addSubTable = useCallback(() => {
    if (!editor) return
    const subTable = {
      type: 'nestedSubTable',
      content: [
        {
          type: 'nestedSubRow',
          content: [
            { type: 'nestedSubLabel' },
            { type: 'nestedSubContent', content: [{ type: 'paragraph' }] },
          ],
        },
      ],
    }
    editor.chain().focus().insertContent(subTable).run()
  }, [editor])

  const addRow = useCallback(() => {
    if (!editor) return
    const { $from } = editor.state.selection

    for (let depth = $from.depth; depth >= 0; depth--) {
      const node = $from.node(depth)
      if (node.type.name === 'topicRow') {
        const pos = $from.before(depth)
        const endPos = pos + node.nodeSize
        const newRow = {
          type: 'topicRow',
          content: [
            { type: 'topicLabel' },
            { type: 'topicContent', content: [{ type: 'paragraph' }] },
          ],
        }
        editor.chain().focus().insertContentAt(endPos, newRow).run()
        return
      }
      if (node.type.name === 'sectionBlock') {
        const pos = $from.before(depth)
        const endPos = pos + node.nodeSize - 1
        const newRow = {
          type: 'topicRow',
          content: [
            { type: 'topicLabel' },
            { type: 'topicContent', content: [{ type: 'paragraph' }] },
          ],
        }
        editor.chain().focus().insertContentAt(endPos, newRow).run()
        return
      }
    }
  }, [editor])

  const toggleAnnotation = useCallback((type: AnnotationType) => {
    editor?.chain().focus().toggleAnnotation(type).run()
  }, [editor])

  const insertImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editor) return

    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result as string
      editor.chain().focus().setImage({ src }).run()
    }
    reader.readAsDataURL(file)

    e.target.value = ''
  }, [editor])

  const insertLatex = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertLatex('x^2').run()
  }, [editor])

  if (!editor) return null

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-200">
      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      <div className="px-3 py-1.5 flex items-end gap-3 flex-wrap">
        {/* Undo / Redo */}
        <ToolbarGroup label="Historique">
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
        </ToolbarGroup>

        <ToolbarSeparator />

        {/* Text formatting */}
        <ToolbarGroup label="Police">
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
            <UnderlineIcon size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive('strike')}
            title="Barre"
          >
            <Strikethrough size={16} />
          </ToolbarButton>

          <ToolbarSeparator />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            active={editor.isActive('subscript')}
            title="Indice (x₂)"
          >
            <Subscript size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            active={editor.isActive('superscript')}
            title="Exposant (x²)"
          >
            <Superscript size={16} />
          </ToolbarButton>

          <ToolbarSeparator />

          <ColorPicker
            colors={TEXT_COLORS}
            onSelect={(color) => editor.chain().focus().setColor(color).run()}
            icon={Type}
            title="Couleur du texte"
            colorIndicator={editor.getAttributes('textStyle').color || '#000000'}
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
            title="Couleur de surlignage"
            colorIndicator={editor.getAttributes('highlight').color || 'transparent'}
          />
          <ToolbarButton
            onClick={() => {
              editor.chain().focus()
                .unsetColor()
                .unsetHighlight()
                .unsetBold()
                .unsetItalic()
                .unsetUnderline()
                .unsetStrike()
                .unsetSubscript()
                .unsetSuperscript()
                .run()
            }}
            title="Effacer la mise en forme"
          >
            <Paintbrush size={16} />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarSeparator />

        {/* Alignment + Lists */}
        <ToolbarGroup label="Paragraphe">
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            active={editor.isActive({ textAlign: 'left' })}
            title="Aligner a gauche"
          >
            <AlignLeft size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            active={editor.isActive({ textAlign: 'center' })}
            title="Centrer"
          >
            <AlignCenter size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            active={editor.isActive({ textAlign: 'right' })}
            title="Aligner a droite"
          >
            <AlignRight size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            active={editor.isActive({ textAlign: 'justify' })}
            title="Justifier"
          >
            <AlignJustify size={16} />
          </ToolbarButton>

          <ToolbarSeparator />

          <BulletStylePicker editor={editor} />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="Liste numerotee"
          >
            <ListOrdered size={16} />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarSeparator />

        {/* Annotations */}
        <ToolbarGroup label="Annotations">
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
        </ToolbarGroup>

        <ToolbarSeparator />

        {/* Insert */}
        <ToolbarGroup label="Inserer">
          <ToolbarButton onClick={insertImage} title="Inserer une image">
            <ImagePlus size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={insertLatex} title="Formule LaTeX">
            <Sigma size={16} />
          </ToolbarButton>
          <ToolbarButton onClick={addSubTable} title="Sous-tableau">
            <TableProperties size={16} />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarSeparator />

        {/* Structure */}
        <ToolbarGroup label="Structure">
          <button
            onClick={addSection}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors cursor-pointer border border-blue-200"
          >
            <Plus size={13} />
            Section
          </button>
          <button
            onClick={addRow}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-50 rounded hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200"
          >
            <Plus size={13} />
            Ligne
          </button>
        </ToolbarGroup>
      </div>
    </div>
  )
}
