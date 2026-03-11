import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { TopicRowView } from '@/components/editor/TopicRow'

export const TopicRow = Node.create({
  name: 'topicRow',
  content: 'topicLabel topicContent',
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="topic-row"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'topic-row' }),
      0,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TopicRowView)
  },
})

export const TopicLabel = Node.create({
  name: 'topicLabel',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      backgroundColor: { default: '#f3f4f6' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="topic-label"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'topic-label',
        class: 'topic-label',
      }),
      0,
    ]
  },
})

export const TopicContent = Node.create({
  name: 'topicContent',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="topic-content"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'topic-content',
        class: 'topic-content',
      }),
      0,
    ]
  },
})
