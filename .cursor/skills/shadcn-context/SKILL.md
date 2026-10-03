---
name: shadcn-context
description: Use local shadcn/ui components and Tailwind tokens in re-dbviewer. Apply when building or changing UI — compose from src/components/ui, do not reinvent primitives.
---

# shadcn context (re-dbviewer)

## Stack

- Vite + React + Tailwind v4 + shadcn/ui
- Components live in `src/components/ui/`
- Utilities: `src/lib/utils.ts` (`cn`)
- Import alias: `@/` → `src/`

## Rules

1. Prefer existing shadcn primitives (`Button`, `Input`, `Card`, `Dialog`, `Tabs`, `Table`, `ScrollArea`, `Badge`, `Alert`, `DropdownMenu`, `Separator`, `Label`, `Tooltip`) before custom markup.
2. Style with Tailwind tokens / CSS variables from `src/index.css` — cool slate neutrals + teal/steel accent. Do not introduce purple gradients or cream/terracotta themes.
3. Dense tool UI: compact padding, monospace (`font-mono`) for paths/SQL/cell values, IBM Plex Sans for chrome.
4. Compose pages in `src/pages/`; keep presentational pieces small. Do not add a second component library.
5. When a needed shadcn component is missing, add it with `npx shadcn@latest add <name>` rather than hand-rolling.
