import { mkdir, writeFile } from 'node:fs/promises';

const ORIGIN = 'https://gratis-situasjonsplan.no';

// One entry per public route. Add new routes here as they are built.
const ROUTES = ['/'];

const lastmod = new Date().toISOString().slice(0, 10);

const urls = ROUTES.map(
  (path) =>
    `  <url>\n    <loc>${ORIGIN}${path}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;

const targetDir = new URL('../public/', import.meta.url);
const target = new URL('../public/sitemap.xml', import.meta.url);

await mkdir(targetDir, { recursive: true });
await writeFile(target, sitemap);
console.log(`Wrote ${ROUTES.length} route(s) to public/sitemap.xml`);
