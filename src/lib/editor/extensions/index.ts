import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import Placeholder from '@tiptap/extension-placeholder'

import { SectionBlock } from './section-block'
import { SectionHeader } from './section-header'
import { TopicRow, TopicLabel, TopicContent } from './topic-row'
import { NestedSubTable, NestedSubRow, NestedSubLabel, NestedSubContent } from './nested-sub-table'
import { AnnotationMark } from './annotation-mark'

export const ficheExtensions = [
  StarterKit.configure({
    bulletList: false,
    orderedList: false,
    listItem: false,
    dropcursor: { color: '#3b82f6', width: 2 },
  }),
  // Custom nodes
  SectionBlock,
  SectionHeader,
  TopicRow,
  TopicLabel,
  TopicContent,
  NestedSubTable,
  NestedSubRow,
  NestedSubLabel,
  NestedSubContent,
  // Marks
  AnnotationMark,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  Underline,
  // Lists
  BulletList,
  OrderedList,
  ListItem,
  // UX
  Placeholder.configure({
    placeholder: ({ node }) => {
      if (node.type.name === 'sectionHeader') return 'Titre de la section...'
      if (node.type.name === 'topicLabel') return 'Label...'
      if (node.type.name === 'topicContent') return 'Contenu...'
      if (node.type.name === 'paragraph') return ''
      return ''
    },
  }),
]
