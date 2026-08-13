/**
 * Opciones MDX compartidas.
 *
 * Las usan DOS consumidores y deben ser idénticas en ambos, o el HTML
 * pre-renderizado divergiría del que ve el usuario en la SPA:
 *   1. vite.config.js  → compila los .mdx para el bundle del navegador
 *   2. scripts/prerender-blog.mjs → los compila en Node para el HTML estático
 */
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'

export const mdxOptions = {
  // `meta` es el nombre del export que genera el frontmatter YAML:
  // `export const meta = { title: '...', ... }`
  remarkPlugins: [
    remarkFrontmatter,
    [remarkMdxFrontmatter, { name: 'meta' }],
    remarkGfm,
  ],
  // ids en los encabezados → anclas enlazables y tabla de contenidos
  rehypePlugins: [rehypeSlug],
}
