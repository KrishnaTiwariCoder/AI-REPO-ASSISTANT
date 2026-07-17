// indexer/parse.ts
import path from "node:path"
import { Parser, Language, Query, type QueryCapture, type Node } from "web-tree-sitter"
import { getFilesByRepo } from "../files/store"
import { insertSymbols, type SymbolInput } from "../symbols/store"
import { updateJob } from "../jobs/store"
import type { SymbolKind } from "@ai-repo-assistant/shared"


let initialized = false
const languageCache = new Map<string, Language>()

type GrammarKey = "javascript" | "typescript" | "tsx"

const WASM_BY_GRAMMAR: Record<GrammarKey, string> = {
    javascript: require.resolve("tree-sitter-wasms/out/tree-sitter-javascript.wasm"),
    typescript: require.resolve("tree-sitter-wasms/out/tree-sitter-typescript.wasm"),
    tsx: require.resolve("tree-sitter-wasms/out/tree-sitter-tsx.wasm"),
}

const EXT_TO_GRAMMAR: Record<string, GrammarKey> = {
    ".js": "javascript",
    ".mjs": "javascript",
    ".jsx": "tsx",
    ".ts": "typescript",
    ".mts": "typescript",
    ".tsx": "tsx",
}

async function ensureInitialized(): Promise<void> {
    if (initialized) return
    await Parser.init()
    initialized = true
}

async function getLanguage(grammar: GrammarKey): Promise<Language> {
    const cached = languageCache.get(grammar)
    if (cached) return cached
    const lang = await Language.load(WASM_BY_GRAMMAR[grammar])
    languageCache.set(grammar, lang)
    return lang
}

const FUNCTION_DECL_QUERY = `(function_declaration name: (identifier) @name) @func`
const CLASS_DECL_QUERY = `(class_declaration name: (type_identifier) @name) @class`
const CLASS_DECL_QUERY_JS = `(class_declaration name: (identifier) @name) @class`
const METHOD_QUERY = `(method_definition name: (property_identifier) @name) @method`
const IMPORT_QUERY = `(import_statement) @import`


function firstLine(text: string, maxLen = 200): string {
    const line = text.split("\n")[0]!.trim()
    return line.length > maxLen ? line.slice(0, maxLen) + "…" : line
}

function extractDocstring(node: Node): string | null {
    const prev = node.previousSibling
    if (!prev || prev.type !== "comment") return null
    if (node.startPosition.row - prev.endPosition.row > 1) return null
    return prev.text
        .replace(/^\/\*\*?/, "")
        .replace(/\*\/$/, "")
        .replace(/^\s*\*\s?/gm, "")
        .replace(/^\/\/\s?/, "")
        .trim() || null
}

function toRange(node: Node): { line_start: number; line_end: number } {
    return { line_start: node.startPosition.row + 1, line_end: node.endPosition.row + 1 }
}

function collectTopLevelDeclarations(root: Node): SymbolInput[] {
    const out: SymbolInput[] = []
    for (const child of root.namedChildren) {
        if (!child || child.type !== "lexical_declaration" && child.type !== "variable_declaration") continue
        for (const declarator of child.namedChildren) {
            if (!declarator || declarator.type !== "variable_declarator") continue
            const nameNode = declarator.childForFieldName("name")
            const valueNode = declarator.childForFieldName("value")
            if (!nameNode || nameNode.type !== "identifier") continue

            const isFunctionLike =
                valueNode?.type === "arrow_function" || valueNode?.type === "function_expression"

            out.push({
                name: nameNode.text,
                kind: (isFunctionLike ? "function" : "const") as SymbolKind,
                ...toRange(child),
                signature: firstLine(child.text),
                docstring: extractDocstring(child),
            })
        }
    }
    return out
}

function runQuery(language: Language, source: string, root: Node, captureLabel: string): QueryCapture[] {
    const query = new Query(language, source)
    return query.captures(root).filter((c) => c.name === captureLabel)
}

async function parseFile(
    grammar: GrammarKey,
    content: string
): Promise<SymbolInput[]> {
    const language = await getLanguage(grammar)
    const parser = new Parser()
    parser.setLanguage(language)
    const tree = parser.parse(content)
    if (!tree) return []
    const root = tree.rootNode

    const symbols: SymbolInput[] = []

    for (const cap of runQuery(language, FUNCTION_DECL_QUERY, root, "func")) {
        const nameCap = new Query(language, FUNCTION_DECL_QUERY).captures(cap.node).find((c) => c.name === "name")
        symbols.push({
            name: nameCap?.node.text ?? "<anonymous>",
            kind: "function",
            ...toRange(cap.node),
            signature: firstLine(cap.node.text),
            docstring: extractDocstring(cap.node),
        })
    }

    const classQuery = grammar === "javascript" ? CLASS_DECL_QUERY_JS : CLASS_DECL_QUERY
    for (const cap of runQuery(language, classQuery, root, "class")) {
        const nameCap = new Query(language, classQuery).captures(cap.node).find((c) => c.name === "name")
        symbols.push({
            name: nameCap?.node.text ?? "<anonymous>",
            kind: "class",
            ...toRange(cap.node),
            signature: firstLine(cap.node.text),
            docstring: extractDocstring(cap.node),
        })
    }

    for (const cap of runQuery(language, METHOD_QUERY, root, "method")) {
        const nameCap = new Query(language, METHOD_QUERY).captures(cap.node).find((c) => c.name === "name")
        symbols.push({
            name: nameCap?.node.text ?? "<anonymous>",
            kind: "method",
            ...toRange(cap.node),
            signature: firstLine(cap.node.text),
            docstring: extractDocstring(cap.node),
        })
    }

    for (const cap of runQuery(language, IMPORT_QUERY, root, "import")) {
        symbols.push({
            name: firstLine(cap.node.text, 80),
            kind: "import",
            ...toRange(cap.node),
            signature: firstLine(cap.node.text),
            docstring: null,
        })
    }

    symbols.push(...collectTopLevelDeclarations(root))

    parser.delete()
    return symbols
}

export interface ParseResult {
    filesParsed: number
    filesSkipped: number
    symbolCount: number
}

export async function parseAndCollectSymbols(repoId: string, jobId: string): Promise<ParseResult> {
    await ensureInitialized()

    const files = getFilesByRepo(repoId)
    const total = files.length
    let filesParsed = 0
    let filesSkipped = 0
    let symbolCount = 0

    for (let i = 0; i < total; i++) {
        const file = files[i]!
        const ext = path.extname(file.path).toLowerCase()
        const grammar = EXT_TO_GRAMMAR[ext]

        if (!grammar) {
            filesSkipped++
            continue
        }

        try {
            const symbols = await parseFile(grammar, file.content)
            if (symbols.length > 0) {
                insertSymbols(file.id, symbols)
                symbolCount += symbols.length
            }
            filesParsed++
        } catch (err) {
            console.warn(`Skipping unparseable file: ${file.path}`, err)
            filesSkipped++
        }

        if ((i + 1) % 10 === 0 || i + 1 === total) {
            const pct = Math.round(30 + ((i + 1) / total) * 40) // parsing spans 30–70%
            updateJob(jobId, { progress_pct: pct })
        }
    }

    return { filesParsed, filesSkipped, symbolCount }
}