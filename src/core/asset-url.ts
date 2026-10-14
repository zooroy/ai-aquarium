/** Resolves a public/ asset against Vite's base, so the site also works under /ai-aquarium/ on GitHub Pages. */
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}
