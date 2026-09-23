<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Web conventions (apps/web)

ESLint covers most of the house style (import order, Chakra usage, no `&&` rendering, single quotes). These are the parts it can't check:

- **The default-exported component of a file is a named function declaration:** `export default function ProductTable() { … }`. Helper components in the same file stay arrow consts (`const Row = () => …`). The linter accepts both forms, so this one is kept by review.
- Pages stay thin: a route file wires data and layout, and hands rendering to a component under `app/_components/`.
