<script lang="ts">
  import {
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    completionKeymap,
    snippetCompletion,
    type CompletionSource,
  } from '@codemirror/autocomplete'
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
  import { PostgreSQL, SQLDialect, sql } from '@codemirror/lang-sql'
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
  import type { PluginInfo, TableInfo } from '../types/contract'

  interface Props {
    value: string
    tables: TableInfo[]
    plugins: PluginInfo[]
    onchange: (value: string) => void
    onrun: (statement: string) => void
  }

  let { value, tables, plugins, onchange, onrun }: Props = $props()

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

  const POSTGRES_KEYWORDS = (PostgreSQL.spec.keywords ?? '').split(' ')
  // SQL propio de los plugins: el dialecto base no los conoce.
  const SOUP_KEYWORDS = ['SEARCH', 'SCORE', 'USING', 'WITH']

  // Se parte de PostgreSQL porque su lista incluye EXPLAIN y ANALYZE (StandardSQL no expone la suya),
  // pero se quitan los nombres del esquema: PostgreSQL trata palabras como `id` como clave.
  const sqlLanguage = (list: TableInfo[], pluginList: PluginInfo[]) => {
    const identifiers = new Set(
      list.flatMap((table) => [table.name, ...table.columns.map((column) => column.name)]).map((name) => name.toLowerCase()),
    )
    const keywords = [...POSTGRES_KEYWORDS, ...SOUP_KEYWORDS, ...pluginList.map((plugin) => plugin.name)]
      .filter((word) => word.length > 0 && !identifiers.has(word.toLowerCase()))
      .join(' ')
    const dialect = SQLDialect.define({
      ...PostgreSQL.spec,
      keywords,
    })
    return sql({
      dialect,
      upperCaseKeywords: true,
      schema: Object.fromEntries(list.map((table) => [table.name, table.columns.map((column) => column.name)])),
    })
  }

  /** Opciones `WITH (...)` que declaran los plugins (o sus índices) ya cargados. */
  function optionNames(plugin?: string): string[] {
    const selected = plugin ? plugins.filter((candidate) => candidate.name === plugin) : plugins
    const fromPlugins = selected.flatMap((candidate) => candidate.options)
    const fromIndexes = tables
      .flatMap((table) => table.indexes)
      .filter((index) => index.plugin && (!plugin || index.plugin === plugin))
      .flatMap((index) => [
        ...Object.keys(index.options ?? {}),
        ...((Array.isArray(index.capabilities?.index_options)
          ? index.capabilities.index_options
          : Object.keys((index.capabilities?.index_options as Record<string, unknown> | undefined) ?? {})) as string[]),
      ])
    return [...new Set([...fromPlugins, ...fromIndexes])].sort()
  }

  function columnsOf(tableName: string | undefined): string[] {
    if (!tableName) return []
    const table = tables.find((candidate) => candidate.name.toLowerCase() === tableName.toLowerCase())
    return table?.columns.map((column) => column.name) ?? []
  }

  /**
   * Fuente de completado para el SQL de plugins.
   *
   * Se suma a la que ya provee `@codemirror/lang-sql` (tablas/columnas): esta
   * aporta `SEARCH`/`SCORE`, los plugins del catálogo y sus opciones `WITH`.
   * Los datos salen de `SysPlugins`/`SysIndexes`, así que un plugin nuevo
   * aparece en el completado sin tocar el código.
   */
  const soupCompletion: CompletionSource = (context) => {
    const word = context.matchBefore(/[A-Za-z_]\w*/)
    if (!word) return null
    if (word.from === word.to && !context.explicit) return null

    const before = context.state.sliceDoc(0, context.pos)

    // Dentro de WITH (...): opciones del plugin elegido en USING.
    const withCall = /WITH\s*\(([^)]*)$/i.exec(before)
    if (withCall) {
      const head = before.slice(0, withCall.index)
      const plugin = /USING\s+(\w+)/i.exec(head)?.[1]?.toUpperCase()
      const names = optionNames(plugin)
      if (names.length === 0) return null
      return {
        from: word.from,
        options: names.map((name) => ({
          label: name,
          type: 'property',
          detail: plugin ? `${plugin} · WITH` : 'WITH',
        })),
      }
    }

    // Después de USING: plugins cargados.
    if (/USING\s+\w*$/i.test(before)) {
      if (plugins.length === 0) return null
      return {
        from: word.from,
        options: plugins.map((plugin) => ({
          label: plugin.name,
          type: 'keyword',
          detail: `plugin v${plugin.version}`,
          info: plugin.options.length > 0 ? `WITH (${plugin.options.join(', ')})` : undefined,
        })),
      }
    }

    // Dentro de SEARCH(...): columnas de la tabla del FROM.
    if (/SEARCH\s*\(\s*\w*$/i.test(before)) {
      const table = /FROM\s+(\w+)/i.exec(before)?.[1]
      const columns = columnsOf(table)
      if (columns.length === 0) return null
      return {
        from: word.from,
        options: columns.map((name) => ({ label: name, type: 'variable', detail: 'columna' })),
      }
    }

    const snippets = [
      snippetCompletion("SEARCH(contenido, 'texto') USING INVERTED WITH (k = 10)", {
        label: 'SEARCH … USING …',
        type: 'function',
        detail: 'búsqueda de plugin',
      }),
      snippetCompletion('SCORE()', {
        label: 'SCORE()',
        type: 'function',
        detail: 'relevancia (mayor = mejor)',
      }),
    ]

    const keywords = SOUP_KEYWORDS.map((label) => ({ label, type: 'keyword' }))
    const pluginOptions = plugins.map((plugin) => ({
      label: plugin.name,
      type: 'keyword',
      detail: `plugin v${plugin.version}`,
    }))

    return { from: word.from, options: [...snippets, ...keywords, ...pluginOptions] }
  }

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
          // La fuente se suma a la de lang-sql vía languageData (no la reemplaza).
          EditorState.languageData.of(() => [{ autocomplete: soupCompletion }]),
          language.of(sqlLanguage(untrack(() => tables), untrack(() => plugins))),
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
    const extension = sqlLanguage(tables, plugins)
    view?.dispatch({ effects: language.reconfigure(extension) })
  })

  // Sincroniza cambios que llegan desde fuera (p. ej. el panel de archivos). La comparación
  // evita el bucle: lo que escribe el propio editor vuelve igual por onchange y no se reaplica.
  $effect(() => {
    const next = value
    if (view && next !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next }, selection: { anchor: next.length } })
      view.focus()
    }
  })
</script>

<div class="h-full min-h-0" {@attach mountEditor}></div>
