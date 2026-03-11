import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import { FontSize } from './font-size'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import { CustomListItem } from './custom-list-item'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'

import { FicheDoc } from './fiche-doc'
import { SectionBlock } from './section-block'
import { SectionHeader, SectionTitle, SectionSubtitle } from './section-header'
import { TopicRow, TopicLabel, TopicContent } from './topic-row'
import { NestedSubTable, NestedSubRow, NestedSubLabel, NestedSubContent } from './nested-sub-table'
import { AnnotationMark } from './annotation-mark'
import { LatexNode } from './latex-node'

export const ficheExtensions = [
  // Custom Doc: only allows sectionBlocks (no free text)
  FicheDoc,
  StarterKit.configure({
    document: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    dropcursor: { color: '#3b82f6', width: 2 },
  }),
  // Custom nodes
  SectionBlock,
  SectionHeader,
  SectionTitle,
  SectionSubtitle,
  TopicRow,
  TopicLabel,
  TopicContent,
  NestedSubTable,
  NestedSubRow,
  NestedSubLabel,
  NestedSubContent,
  LatexNode,
  // Marks
  AnnotationMark,
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  Highlight.configure({ multicolor: true }),
  Underline,
  Subscript,
  Superscript,
  // Lists
  BulletList,
  OrderedList,
  CustomListItem,
  // Text alignment
  TextAlign.configure({
    types: ['paragraph', 'heading'],
  }),
  // Images
  Image.configure({
    inline: true,
    allowBase64: true,
  }),
  // UX
  Placeholder.configure({
    placeholder: ({ node }) => {
      if (node.type.name === 'sectionTitle') return 'Titre de la section...'
      if (node.type.name === 'sectionSubtitle') return 'Description / Theme...'
      if (node.type.name === 'topicLabel') return 'Label...'
      if (node.type.name === 'topicContent') return 'Contenu...'
      if (node.type.name === 'nestedSubLabel') return 'Label...'
      if (node.type.name === 'nestedSubContent') return 'Contenu...'
      if (node.type.name === 'paragraph') return ''
      return ''
    },
  }),
]
