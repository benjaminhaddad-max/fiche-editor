import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

const RESIZE_THRESHOLD = 8
const MIN_LABEL_WIDTH = 60
const MIN_CONTENT_WIDTH = 100
const MIN_SUB_LABEL_WIDTH = 40
const MIN_SUB_CONTENT_WIDTH = 60
const MIN_ROW_HEIGHT = 24

type ResizeType = 'column' | 'row'

interface ResizeTarget {
  type: ResizeType
  nodeTypeName: string
  attrName: string
  containerEl: HTMLElement
  currentValue: number
}

interface DragState {
  target: ResizeTarget
  startX: number
  startY: number
  startValue: number
  minValue: number
  maxValue: number
  nodePos: number | null
}

function getComputedColumnWidth(el: HTMLElement): number {
  const cols = window.getComputedStyle(el).gridTemplateColumns.split(' ')
  return cols.length > 0 ? parseFloat(cols[0]) : 160
}

function findGridContainer(el: HTMLElement): HTMLElement | null {
  return el.closest('.topic-row-grid, .section-header, .nested-sub-row') as HTMLElement | null
}

function detectColumnTarget(x: number, y: number): ResizeTarget | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  if (!el) return null

  const labelDefs = [
    { sel: '.section-title', node: 'sectionBlock', attr: 'labelWidth', cont: '.section-block' },
    { sel: '.topic-label', node: 'sectionBlock', attr: 'labelWidth', cont: '.section-block' },
    { sel: '.nested-sub-label', node: 'nestedSubTable', attr: 'subLabelWidth', cont: '.nested-sub-table' },
  ]

  for (const { sel, node, attr, cont } of labelDefs) {
    const label = el.closest(sel)
    if (label) {
      const rect = label.getBoundingClientRect()
      if (Math.abs(x - rect.right) <= RESIZE_THRESHOLD) {
        const container = label.closest(cont) as HTMLElement
        if (!container) continue
        const grid = findGridContainer(label as HTMLElement)
        return {
          type: 'column',
          nodeTypeName: node,
          attrName: attr,
          containerEl: container,
          currentValue: Math.round(grid ? getComputedColumnWidth(grid) : 160),
        }
      }
    }
  }

  const contentDefs = [
    { sel: '.section-subtitle', node: 'sectionBlock', attr: 'labelWidth', cont: '.section-block' },
    { sel: '.topic-content', node: 'sectionBlock', attr: 'labelWidth', cont: '.section-block' },
    { sel: '.nested-sub-content', node: 'nestedSubTable', attr: 'subLabelWidth', cont: '.nested-sub-table' },
  ]

  for (const { sel, node, attr, cont } of contentDefs) {
    const content = el.closest(sel)
    if (content) {
      const rect = content.getBoundingClientRect()
      if (Math.abs(x - rect.left) <= RESIZE_THRESHOLD) {
        const container = content.closest(cont) as HTMLElement
        if (!container) continue
        const grid = findGridContainer(content as HTMLElement)
        return {
          type: 'column',
          nodeTypeName: node,
          attrName: attr,
          containerEl: container,
          currentValue: Math.round(grid ? getComputedColumnWidth(grid) : 160),
        }
      }
    }
  }

  return null
}

function detectRowTarget(x: number, y: number): ResizeTarget | null {
  // Scan all rows and find one whose bottom border is near the cursor.
  // This avoids elementFromPoint issues on the 1px border between rows.
  const rowDefs: { sel: string; node: string; attr: string }[] = [
    { sel: '.topic-row', node: 'topicRow', attr: 'rowMinHeight' },
    { sel: '.nested-sub-row', node: 'nestedSubRow', attr: 'subRowMinHeight' },
  ]

  for (const { sel, node, attr } of rowDefs) {
    const rows = document.querySelectorAll(sel)
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      if (Math.abs(y - rect.bottom) <= RESIZE_THRESHOLD && x >= rect.left && x <= rect.right) {
        return {
          type: 'row',
          nodeTypeName: node,
          attrName: attr,
          containerEl: row as HTMLElement,
          currentValue: Math.round(rect.height),
        }
      }
    }
  }

  return null
}

function detectResizeTarget(x: number, y: number): ResizeTarget | null {
  return detectColumnTarget(x, y) || detectRowTarget(x, y)
}

function findNodePos(view: EditorView, containerEl: HTMLElement, nodeTypeName: string): number | null {
  // Walk the ProseMirror document and match nodes by their DOM representation
  let foundPos: number | null = null
  view.state.doc.descendants((node, pos) => {
    if (foundPos !== null) return false
    if (node.type.name === nodeTypeName) {
      try {
        const dom = view.nodeDOM(pos) as HTMLElement | null
        if (dom && (dom === containerEl || dom.contains(containerEl))) {
          foundPos = pos
          return false
        }
      } catch {
        // continue searching
      }
    }
    return true
  })
  return foundPos
}

export const CellResize = Extension.create({
  name: 'cellResize',

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('cellResize')

    return [
      new Plugin({
        key: pluginKey,
        view(editorView) {
          let view = editorView
          let hoverTarget: ResizeTarget | null = null
          let dragState: DragState | null = null

          const onMouseMove = (event: MouseEvent) => {
            if (dragState) {
              // Active drag — update visual feedback
              event.preventDefault()
              if (dragState.target.type === 'column') {
                const delta = event.clientX - dragState.startX
                const newWidth = Math.max(
                  dragState.minValue,
                  Math.min(dragState.startValue + delta, dragState.maxValue)
                )
                const varName = dragState.target.attrName === 'labelWidth'
                  ? '--label-width' : '--sub-label-width'
                dragState.target.containerEl.style.setProperty(varName, `${Math.round(newWidth)}px`)
              } else {
                const delta = event.clientY - dragState.startY
                const newHeight = Math.max(dragState.minValue, dragState.startValue + delta)
                dragState.target.containerEl.style.minHeight = `${Math.round(newHeight)}px`
              }
              return
            }

            // Not dragging — detect hover for cursor
            hoverTarget = detectResizeTarget(event.clientX, event.clientY)
            view.dom.style.cursor = hoverTarget
              ? (hoverTarget.type === 'column' ? 'col-resize' : 'row-resize')
              : ''
          }

          const onMouseDown = (event: MouseEvent) => {
            if (!hoverTarget) return

            event.preventDefault()
            event.stopPropagation()

            const target = hoverTarget
            let minValue: number, maxValue: number

            if (target.type === 'column') {
              const containerWidth = target.containerEl.getBoundingClientRect().width
              minValue = target.attrName === 'labelWidth' ? MIN_LABEL_WIDTH : MIN_SUB_LABEL_WIDTH
              maxValue = containerWidth - (target.attrName === 'labelWidth' ? MIN_CONTENT_WIDTH : MIN_SUB_CONTENT_WIDTH)
            } else {
              minValue = MIN_ROW_HEIGHT
              maxValue = Infinity
            }

            // Find node position eagerly while context is fresh
            const nodePos = findNodePos(view, target.containerEl, target.nodeTypeName)

            dragState = {
              target,
              startX: event.clientX,
              startY: event.clientY,
              startValue: target.currentValue,
              minValue,
              maxValue,
              nodePos,
            }

            document.body.style.cursor = target.type === 'column' ? 'col-resize' : 'row-resize'
            document.body.style.userSelect = 'none'

            // Listen on window for drag events (captures even outside editor)
            window.addEventListener('mousemove', onWindowMouseMove, true)
            window.addEventListener('mouseup', onWindowMouseUp, true)
          }

          const onWindowMouseMove = (event: MouseEvent) => {
            if (!dragState) return
            event.preventDefault()

            if (dragState.target.type === 'column') {
              const delta = event.clientX - dragState.startX
              const newWidth = Math.max(
                dragState.minValue,
                Math.min(dragState.startValue + delta, dragState.maxValue)
              )
              const varName = dragState.target.attrName === 'labelWidth'
                ? '--label-width' : '--sub-label-width'
              dragState.target.containerEl.style.setProperty(varName, `${Math.round(newWidth)}px`)
            } else {
              const delta = event.clientY - dragState.startY
              const newHeight = Math.max(dragState.minValue, dragState.startValue + delta)
              dragState.target.containerEl.style.minHeight = `${Math.round(newHeight)}px`
            }
          }

          const onWindowMouseUp = (event: MouseEvent) => {
            if (!dragState) {
              cleanup()
              return
            }

            let finalValue: number
            const { target } = dragState

            if (target.type === 'column') {
              const delta = event.clientX - dragState.startX
              finalValue = Math.round(Math.max(
                dragState.minValue,
                Math.min(dragState.startValue + delta, dragState.maxValue)
              ))
            } else {
              const delta = event.clientY - dragState.startY
              finalValue = Math.round(Math.max(dragState.minValue, dragState.startValue + delta))
            }
            // Keep inline styles — React re-render will overwrite them from the persisted attribute

            // Persist via ProseMirror transaction using position found at mousedown
            const pos = dragState.nodePos
            if (pos !== null) {
              const node = view.state.doc.nodeAt(pos)
              if (node) {
                const tr = view.state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  [target.attrName]: finalValue,
                })
                view.dispatch(tr)
              }
            }

            cleanup()
          }

          const cleanup = () => {
            dragState = null
            window.removeEventListener('mousemove', onWindowMouseMove, true)
            window.removeEventListener('mouseup', onWindowMouseUp, true)
            document.body.style.removeProperty('cursor')
            document.body.style.removeProperty('user-select')
          }

          // Attach listeners to the editor DOM
          view.dom.addEventListener('mousemove', onMouseMove)
          view.dom.addEventListener('mousedown', onMouseDown)

          return {
            update(v) { view = v },
            destroy() {
              cleanup()
              view.dom.removeEventListener('mousemove', onMouseMove)
              view.dom.removeEventListener('mousedown', onMouseDown)
              view.dom.style.cursor = ''
            },
          }
        },
      }),
    ]
  },
})
