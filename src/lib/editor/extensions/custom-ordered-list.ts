import OrderedList from '@tiptap/extension-ordered-list'
import { wrappingInputRule } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    customOrderedList: {
      setOrderedListType: (listType: string | null) => ReturnType
    }
  }
}

// Input rules for auto-converting typed patterns into ordered lists
// "I. " → upper-roman
const upperRomanInputRegex = /^(I)\.\s$/
// "A. " → upper-alpha (but not "A" alone — only single uppercase letter A-Z)
const upperAlphaInputRegex = /^([A-H|J-Z])\.\s$/
// "a. " → lower-alpha (single lowercase letter)
const lowerAlphaInputRegex = /^([a-h|j-z])\.\s$/
// "i. " → lower-roman
const lowerRomanInputRegex = /^(i)\.\s$/

export const CustomOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listType: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-list-type') || null,
        renderHTML: (attributes) => {
          if (!attributes.listType) return {}
          return { 'data-list-type': attributes.listType }
        },
      },
    }
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setOrderedListType:
        (listType: string | null) =>
        ({ commands }) => {
          return commands.updateAttributes('orderedList', { listType })
        },
    }
  },

  addInputRules() {
    const parentRules = this.parent?.() || []

    // I. → upper-roman
    const upperRomanRule = wrappingInputRule({
      find: upperRomanInputRegex,
      type: this.type,
      getAttributes: () => ({ start: 1, listType: 'upper-roman' }),
    })

    // A-Z. (not I) → upper-alpha
    const upperAlphaRule = wrappingInputRule({
      find: upperAlphaInputRegex,
      type: this.type,
      getAttributes: (match) => {
        const start = match[1].charCodeAt(0) - 64 // A=1, B=2, etc.
        return { start, listType: 'upper-alpha' }
      },
    })

    // a-z. (not i) → lower-alpha
    const lowerAlphaRule = wrappingInputRule({
      find: lowerAlphaInputRegex,
      type: this.type,
      getAttributes: (match) => {
        const start = match[1].charCodeAt(0) - 96 // a=1, b=2, etc.
        return { start, listType: 'lower-alpha' }
      },
    })

    // i. → lower-roman
    const lowerRomanRule = wrappingInputRule({
      find: lowerRomanInputRegex,
      type: this.type,
      getAttributes: () => ({ start: 1, listType: 'lower-roman' }),
    })

    return [
      ...parentRules,
      upperRomanRule,
      upperAlphaRule,
      lowerAlphaRule,
      lowerRomanRule,
    ]
  },
})
