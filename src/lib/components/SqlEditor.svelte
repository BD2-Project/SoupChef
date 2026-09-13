<script lang="ts">
  import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
  import { StandardSQL, sql } from '@codemirror/lang-sql'
  import { HighlightStyle, bracketMatching, syntaxHighlighting } from '@codemirror/language'
  import { Compartment, EditorState, Prec } from '@codemirror/state'
  import {
    EditorView,
    drawSelection,
    highlightActiveLine,
    highlightActiveLineGutter,
    keymap,
    lineNumbers,
    placeholder,
  } from '@codemirror/view'
  import { tags } from '@lezer/highlight'
  import { untrack } from 'svelte'
  import type { TableInfo } from '../types/contract'

  interface Props {
    value: string
    tables: TableInfo[]
    onchange: (value: string) => void
    onrun: (statement: string) => void
  }

  let { value, tables, onchange, onrun }: Props = $props()

  let view: EditorView | undefined
  const language = new Compartment()

  // Los colores son variables CSS: el editor sigue el tema sin reconfigurarse.
  const editorTheme = EditorView.theme({
    '&': { height: '100%', fontSize: 'var(--text-ui)', color: 'var(--text)', backgroundColor: 'transparent' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65' },
    '.cm-content': { padding: '10px 0', caretColor: 'var(--accent)' },
    '.cm-line': { padding: '0 12px' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--subtle)', border: 'none', paddingLeft: '6px' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in oklch, var(--raised) 55%, transparent)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--muted)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'var(--accent-soft)',
    },
    '.cm-placeholder': { color: 'var(--subtle)' },
    '.cm-matchingBracket': { backgroundColor: 'var(--accent-soft)', outline: 'none' },
    '.cm-tooltip': {
      backgroundColor: 'var(--surface)',
      border: '1px solid var(--line-strong)',
      borderRadius: '6px',
      overflow: 'hidden',
    },
    '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-mono)', fontSize: 'var(--text-micro)' },
    '.cm-tooltip-autocomplete > ul > li': { padding: '2px 8px' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent-soft)', color: 'var(--text)' },
    '.cm-completionDetail': { color: 'var(--subtle)', fontStyle: 'normal', marginLeft: '8px' },
  })

  const highlight = HighlightStyle.define([
    { tag: [tags.keyword, tags.typeName, tags.standard(tags.name)], color: 'var(--syntax-keyword)', fontWeight: '500' },
    { tag: [tags.string, tags.special(tags.string)], color: 'var(--syntax-string)' },
    { tag: [tags.number, tags.bool, tags.null], color: 'var(--syntax-number)' },
    { tag: tags.comment, color: 'var(--subtle)', fontStyle: 'italic' },
    { tag: [tags.operator, tags.punctuation, tags.bracket], color: 'var(--muted)' },
  ])

  const sqlLanguage = (list: TableInfo[]) =>
    sql({
      dialect: StandardSQL,
      upperCaseKeywords: true,
      schema: Object.fromEntries(list.map((table) => [table.name, table.columns.map((column) => column.name)])),
    })

  // Con texto seleccionado se ejecuta solo la selección, como en los clientes SQL de escritorio.
  export function getStatement(): string {
    if (!view) return value
    const { from, to, empty } = view.state.selection.main
    return empty ? view.state.doc.toString() : view.state.sliceDoc(from, to)
  }

  // Prec.highest: Mod-Enter en defaultKeymap inserta una línea en blanco.
  const runKeymap = Prec.highest(
    keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          onrun(getStatement())
          return true
        },
      },
    ]),
  )

  function mountEditor(node: HTMLElement) {
    view = new EditorView({
      parent: node,
      state: EditorState.create({
        doc: untrack(() => value),
        extensions: [
          runKeymap,
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          closeBrackets(),
          bracketMatching(),
          autocompletion(),
          language.of(sqlLanguage(untrack(() => tables))),
          syntaxHighlighting(highlight),
          editorTheme,
          placeholder('Escribe una consulta SQL…'),
          keymap.of([...closeBracketsKeymap, ...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onchange(update.state.doc.toString())
          }),
          EditorView.contentAttributes.of({ 'aria-label': 'Editor SQL' }),
        ],
      }),
    })

    return () => {
      view?.destroy()
      view = undefined
    }
  }

  $effect(() => {
    const extension = sqlLanguage(tables)
    view?.dispatch({ effects: language.reconfigure(extension) })
  })
</script>

<div class="h-full min-h-0" {@attach mountEditor}></div>
