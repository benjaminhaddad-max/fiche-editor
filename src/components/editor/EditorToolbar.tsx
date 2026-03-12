'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered,
  Zap, Target, Lightbulb,
  Type, Highlighter, Paintbrush, RemoveFormatting,
  Plus, TableProperties, ImagePlus,
  Undo2, Redo2,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Subscript, Superscript,
  Sigma, PaintBucket,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { AnnotationType } from '@/lib/editor/extensions/annotation-mark'

interface ToolbarProps {
  editor: Editor | null
}

const BULLET_LEVELS = [
  { level: 0, symbol: '●', label: 'Puce niveau 1' },
  { level: 1, symbol: '○', label: 'Puce niveau 2' },
  { level: 2, symbol: '■', label: 'Puce niveau 3' },
  { level: 3, symbol: '—', label: 'Puce niveau 4' },
]

const ORDERED_LIST_STYLES = [
  { type: null, preview: '1.  2.  3.', label: 'Decimal' },
  { type: 'upper-roman', preview: 'I.  II.  III.', label: 'Romain majuscule' },
  { type: 'upper-alpha', preview: 'A.  B.  C.', label: 'Lettres majuscules' },
  { type: 'lower-alpha', preview: 'a.  b.  c.', label: 'Lettres minuscules' },
  { type: 'lower-roman', preview: 'i.  ii.  iii.', label: 'Romain minuscule' },
] as const

const FONT_FAMILIES = [
  { value: 'Calibri, sans-serif', label: 'Calibri' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Times New Roman, serif', label: 'Times New Roman' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet MS' },
  { value: 'Courier New, monospace', label: 'Courier New' },
]

const FONT_SIZES = [
  '7', '8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '36',
]

// Word Office theme colors: 10 base colors x 6 rows (base + 5 tint/shade variants)
const THEME_COLORS = [
  // Row 1: Base
  '#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47',
  // Row 2: Tint 80%
  '#F2F2F2', '#808080', '#D0CECE', '#D6DCE4', '#D9E2F3', '#FBE5D6', '#EDEDED', '#FFF2CC', '#DEEAF6', '#E2EFDA',
  // Row 3: Tint 60%
  '#D9D9D9', '#595959', '#AEAAAA', '#ADB9CA', '#B4C7E7', '#F8CBAD', '#DBDBDB', '#FFE599', '#BDD7EE', '#C5E0B4',
  // Row 4: Tint 40%
  '#BFBFBF', '#404040', '#757171', '#8497B0', '#8FAADC', '#F4B183', '#C9C9C9', '#FFD966', '#9CC3E5', '#A9D18E',
  // Row 5: Shade 25%
  '#A6A6A6', '#262626', '#3B3838', '#333F50', '#2F5597', '#C55A11', '#7B7B7B', '#BF9000', '#2E75B6', '#548235',
  // Row 6: Shade 50%
  '#808080', '#0D0D0D', '#171616', '#222A35', '#1F3864', '#843C0C', '#525252', '#806000', '#1F4E79', '#375623',
]

const STANDARD_COLORS = [
  '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050',
  '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0',
]

const BG_COLORS = [
  'transparent', '#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#0000ff',
  '#ff0000', '#000080', '#008080', '#008000', '#800080',
  '#800000', '#808000', '#808080', '#c0c0c0', '#000000',
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

function WordColorPicker({
  currentColor,
  onSelect,
  icon: Icon,
  title,
  colorIndicator,
}: {
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
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
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
            style={{ backgroundColor: colorIndicator }}
          />
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-2 z-50 min-w-[220px]">
          {/* Aucune couleur */}
          <button
            onClick={() => { onSelect(''); setOpen(false) }}
            className="w-full text-left text-xs text-gray-500 px-1 py-1 mb-1 hover:bg-gray-100 rounded cursor-pointer"
          >
            Automatique (noir)
          </button>
          {/* Couleurs du theme */}
          <div className="text-[9px] text-gray-400 px-0.5 mb-1 font-medium">Couleurs du theme</div>
          <div className="grid grid-cols-10 gap-0.5 mb-2">
            {THEME_COLORS.map((color, i) => (
              <button
                key={`theme-${i}`}
                onClick={() => { onSelect(color); setOpen(false) }}
                className={clsx(
                  'w-5 h-5 border cursor-pointer transition-transform hover:scale-125 hover:z-10',
                  currentColor?.toUpperCase() === color.toUpperCase() ? 'ring-2 ring-blue-500 ring-offset-1' : 'border-gray-300'
                )}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
          {/* Couleurs standard */}
          <div className="text-[9px] text-gray-400 px-0.5 mb-1 font-medium">Couleurs standard</div>
          <div className="grid grid-cols-10 gap-0.5">
            {STANDARD_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => { onSelect(color); setOpen(false) }}
                className={clsx(
                  'w-5 h-5 border cursor-pointer transition-transform hover:scale-125 hover:z-10',
                  currentColor?.toUpperCase() === color.toUpperCase() ? 'ring-2 ring-blue-500 ring-offset-1' : 'border-gray-300'
                )}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FontPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const currentFont = editor.getAttributes('textStyle').fontFamily || ''
  const currentLabel = FONT_FAMILIES.find(f => f.value === currentFont)?.label || 'Calibri'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        title="Police"
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200 min-w-[100px] justify-between"
      >
        <span className="truncate" style={{ fontFamily: currentFont || 'Calibri, sans-serif' }}>{currentLabel}</span>
        <svg width="8" height="8" viewBox="0 0 10 10"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-1 z-50 min-w-[160px]">
          {FONT_FAMILIES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => {
                if (value === 'Calibri, sans-serif') {
                  editor.chain().focus().unsetFontFamily().run()
                } else {
                  editor.chain().focus().setFontFamily(value).run()
                }
                setOpen(false)
              }}
              className={clsx(
                'w-full text-left px-2 py-1.5 rounded text-sm transition-colors cursor-pointer',
                currentLabel === label ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              )}
              style={{ fontFamily: value }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FontSizePicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const currentSize = editor.getAttributes('textStyle').fontSize?.replace('pt', '') || '9'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        title="Taille de police"
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200 min-w-[44px] justify-between"
      >
        <span>{currentSize}</span>
        <svg width="8" height="8" viewBox="0 0 10 10"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-1 z-50 min-w-[50px] max-h-[200px] overflow-y-auto">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => {
                if (size === '9') {
                  editor.chain().focus().unsetFontSize().run()
                } else {
                  editor.chain().focus().setFontSize(`${size}pt`).run()
                }
                setOpen(false)
              }}
              className={clsx(
                'w-full text-center px-2 py-1 rounded text-sm transition-colors cursor-pointer',
                currentSize === size ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              {size}
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
  const currentLevel = isActive ? ((editor.getAttributes('listItem').bulletLevel as number) || 0) : -1

  const setLevel = useCallback((targetLevel: number) => {
    if (!isActive) {
      editor.chain().focus().toggleBulletList().run()
      // After creating the list, set the bullet level
      setTimeout(() => {
        editor.commands.setBulletLevel(targetLevel)
      }, 0)
    } else {
      editor.commands.setBulletLevel(targetLevel)
    }
  }, [editor, isActive])

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
        title="Choisir le niveau de puce"
        className={clsx(
          'px-1 py-1.5 rounded-r transition-colors cursor-pointer border-l border-gray-200',
          isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        )}
      >
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-1.5 z-50 min-w-[180px]">
          <div className="text-[10px] text-gray-400 px-2 py-1 font-medium">Niveau de puce</div>
          {BULLET_LEVELS.map(({ level, symbol, label }) => (
            <button
              key={level}
              onClick={() => { setLevel(level); setOpen(false) }}
              className={clsx(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors cursor-pointer',
                isActive && currentLevel === level ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              <span style={{ paddingLeft: `${level * 10}px` }} className="text-base leading-none">{symbol}</span>
              <span>{label}</span>
            </button>
          ))}
          {isActive && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { editor.chain().focus().toggleBulletList().run(); setOpen(false) }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <span className="text-xs">✕</span>
                <span>Supprimer la liste</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function OrderedListStylePicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const isActive = editor.isActive('orderedList')
  const currentType = isActive ? (editor.getAttributes('orderedList').listType || null) : undefined

  const setListType = useCallback((listType: string | null) => {
    if (!isActive) {
      editor.chain().focus().toggleOrderedList().run()
      setTimeout(() => {
        editor.commands.setOrderedListType(listType)
      }, 0)
    } else {
      editor.commands.setOrderedListType(listType)
    }
  }, [editor, isActive])

  return (
    <div className="relative flex" ref={ref}>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Liste numerotee"
        className={clsx(
          'p-1.5 rounded-l transition-colors cursor-pointer',
          isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        )}
      >
        <ListOrdered size={16} />
      </button>
      <button
        onClick={() => setOpen(!open)}
        title="Choisir le style de numerotation"
        className={clsx(
          'px-1 py-1.5 rounded-r transition-colors cursor-pointer border-l border-gray-200',
          isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        )}
      >
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-1.5 z-50 min-w-[200px]">
          <div className="text-[10px] text-gray-400 px-2 py-1 font-medium">Style de numerotation</div>
          {ORDERED_LIST_STYLES.map(({ type, preview, label }) => (
            <button
              key={type || 'decimal'}
              onClick={() => { setListType(type); setOpen(false) }}
              className={clsx(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors cursor-pointer',
                isActive && currentType === type ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              <span className="text-xs font-mono w-[72px] text-left">{preview}</span>
              <span className="text-gray-500 text-xs">{label}</span>
            </button>
          ))}
          {isActive && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { editor.chain().focus().toggleOrderedList().run(); setOpen(false) }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <span className="text-xs">✕</span>
                <span>Supprimer la liste</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const LINE_SPACING_OPTIONS = ['1', '1.15', '1.5', '2', '2.5', '3'] as const
const SPACE_TOGGLE_VALUE = '12pt'

function LineSpacingIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      {/* Three horizontal lines */}
      <line x1="5.5" y1="2.5" x2="15" y2="2.5" />
      <line x1="5.5" y1="8" x2="15" y2="8" />
      <line x1="5.5" y1="13.5" x2="15" y2="13.5" />
      {/* Up arrow */}
      <polyline points="1.5,4.5 3,2 4.5,4.5" fill="none" />
      {/* Down arrow */}
      <polyline points="1.5,11.5 3,14 4.5,11.5" fill="none" />
      {/* Vertical line connecting arrows */}
      <line x1="3" y1="3" x2="3" y2="13" />
    </svg>
  )
}

function LineSpacingPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const currentLineHeight = editor.getAttributes('paragraph').lineHeight || '1'
  const currentSpaceBefore = editor.getAttributes('paragraph').spaceBefore || null
  const currentSpaceAfter = editor.getAttributes('paragraph').spaceAfter || null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        title="Interligne"
        className="flex items-center gap-0.5 p-1.5 rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors cursor-pointer"
      >
        <LineSpacingIcon size={16} />
        <svg width="8" height="8" viewBox="0 0 10 10"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50 min-w-[260px]">
          {LINE_SPACING_OPTIONS.map((value) => (
            <button
              key={value}
              onClick={() => {
                if (value === '1') {
                  editor.chain().focus().unsetLineHeight().run()
                } else {
                  editor.chain().focus().setLineHeight(value).run()
                }
                setOpen(false)
              }}
              className={clsx(
                'w-full text-left px-3 py-1.5 text-sm transition-colors cursor-pointer flex items-center gap-2',
                currentLineHeight === value ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              <span className="w-4 text-center">{currentLineHeight === value ? '✓' : ''}</span>
              <span>{value.replace('.', ',')}</span>
            </button>
          ))}
          <div className="h-px bg-gray-200 my-1" />
          <button
            onClick={() => {
              if (currentSpaceBefore) {
                editor.chain().focus().unsetSpaceBefore().run()
              } else {
                editor.chain().focus().setSpaceBefore(SPACE_TOGGLE_VALUE).run()
              }
              setOpen(false)
            }}
            className={clsx(
              'w-full text-left px-3 py-1.5 text-sm transition-colors cursor-pointer flex items-center gap-2',
              currentSpaceBefore ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            <span className="w-4 text-center">{currentSpaceBefore ? '✓' : ''}</span>
            <span>Ajouter de l&apos;espace avant le paragraphe</span>
          </button>
          <button
            onClick={() => {
              if (currentSpaceAfter) {
                editor.chain().focus().unsetSpaceAfter().run()
              } else {
                editor.chain().focus().setSpaceAfter(SPACE_TOGGLE_VALUE).run()
              }
              setOpen(false)
            }}
            className={clsx(
              'w-full text-left px-3 py-1.5 text-sm transition-colors cursor-pointer flex items-center gap-2',
              currentSpaceAfter ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            <span className="w-4 text-center">{currentSpaceAfter ? '✓' : ''}</span>
            <span>Ajouter de l&apos;espace apres le paragraphe</span>
          </button>
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

interface StoredFormat {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  subscript: boolean
  superscript: boolean
  color: string | null
  fontFamily: string | null
  fontSize: string | null
  highlightColor: string | null
}

function captureFormat(editor: Editor): StoredFormat {
  const textStyle = editor.getAttributes('textStyle')
  const highlight = editor.getAttributes('highlight')
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    subscript: editor.isActive('subscript'),
    superscript: editor.isActive('superscript'),
    color: textStyle.color || null,
    fontFamily: textStyle.fontFamily || null,
    fontSize: textStyle.fontSize || null,
    highlightColor: highlight.color || null,
  }
}

function applyFormat(editor: Editor, fmt: StoredFormat) {
  const chain = editor.chain().focus()
    // Clear existing formatting first
    .unsetBold().unsetItalic().unsetUnderline().unsetStrike()
    .unsetSubscript().unsetSuperscript()
    .unsetColor().unsetHighlight().unsetFontSize().unsetFontFamily()

  // Apply stored formatting
  if (fmt.bold) chain.setBold()
  if (fmt.italic) chain.setItalic()
  if (fmt.underline) chain.setUnderline()
  if (fmt.strike) chain.setStrike()
  if (fmt.subscript) chain.setSubscript()
  if (fmt.superscript) chain.setSuperscript()
  if (fmt.color) chain.setColor(fmt.color)
  if (fmt.fontFamily) chain.setFontFamily(fmt.fontFamily)
  if (fmt.fontSize) chain.setFontSize(fmt.fontSize)
  if (fmt.highlightColor) chain.setHighlight({ color: fmt.highlightColor })

  chain.run()
}

export function EditorToolbar({ editor }: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formatPainterFormat, setFormatPainterFormat] = useState<StoredFormat | null>(null)

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

  const setCellBgColor = useCallback((color: string) => {
    if (!editor) return
    const { $from } = editor.state.selection
    const cellTypes = ['topicLabel', 'topicContent', 'nestedSubLabel', 'nestedSubContent']
    for (let d = $from.depth; d >= 0; d--) {
      const node = $from.node(d)
      if (cellTypes.includes(node.type.name)) {
        const pos = $from.before(d)
        editor.chain().focus().command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            backgroundColor: color || null,
          })
          return true
        }).run()
        return
      }
    }
  }, [editor])

  // Format Painter: apply stored format when user makes a new selection
  useEffect(() => {
    if (!editor || !formatPainterFormat) return

    const editorEl = editor.view.dom
    editorEl.style.cursor = 'crosshair'

    const handleMouseUp = () => {
      const { from, to } = editor.state.selection
      if (from !== to) {
        applyFormat(editor, formatPainterFormat)
        setFormatPainterFormat(null)
        editorEl.style.cursor = ''
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFormatPainterFormat(null)
        editorEl.style.cursor = ''
      }
    }

    editorEl.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      editorEl.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('keydown', handleKeyDown)
      editorEl.style.cursor = ''
    }
  }, [editor, formatPainterFormat])

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

        {/* Font family & size */}
        <ToolbarGroup label="Police">
          <FontPicker editor={editor} />
          <FontSizePicker editor={editor} />
        </ToolbarGroup>

        <ToolbarSeparator />

        {/* Text formatting */}
        <ToolbarGroup label="Format">
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

          <WordColorPicker
            onSelect={(color) => {
              if (!color) {
                editor.chain().focus().unsetColor().run()
              } else {
                editor.chain().focus().setColor(color).run()
              }
            }}
            icon={Type}
            title="Couleur du texte"
            currentColor={editor.getAttributes('textStyle').color || '#000000'}
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
          <WordColorPicker
            onSelect={(color) => setCellBgColor(color)}
            icon={PaintBucket}
            title="Remplissage de cellule"
            currentColor={''}
            colorIndicator={'#e5e7eb'}
          />
          <ToolbarButton
            onClick={() => {
              if (formatPainterFormat) {
                setFormatPainterFormat(null)
              } else {
                setFormatPainterFormat(captureFormat(editor))
              }
            }}
            active={!!formatPainterFormat}
            title="Reproduire la mise en forme"
          >
            <Paintbrush size={16} />
          </ToolbarButton>
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
                .unsetFontSize()
                .unsetFontFamily()
                .run()
            }}
            title="Effacer la mise en forme"
          >
            <RemoveFormatting size={16} />
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
          <LineSpacingPicker editor={editor} />

          <ToolbarSeparator />

          <BulletStylePicker editor={editor} />
          <OrderedListStylePicker editor={editor} />
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
