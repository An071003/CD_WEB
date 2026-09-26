import { cp, readFile, realpath, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(project, 'dist');
const output = join(project, '_site');
const repository = process.env.GITHUB_REPOSITORY || 'An071003/CD_WEB';
const base = process.env.PAGE_BASE_PATH ?? `/${repository.split('/').at(-1)}`;
const assetVersion = /^[0-9a-f]{40}$/i.test(process.env.GITHUB_SHA ?? '') ? process.env.GITHUB_SHA.slice(0, 12) : '';

if (base && !/^\/[A-Za-z0-9._-]+$/.test(base)) {
  throw new Error(`Invalid Pages base path: ${base}`);
}
if (!output.startsWith(project + sep) || !(await realpath(source)).startsWith(project + sep)) {
  throw new Error('Site paths must stay inside the project');
}

await rm(output, { recursive: true, force: true });
await cp(source, output, { recursive: true });
await writeFile(join(output, '.nojekyll'), '');

async function rewriteHtml(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await rewriteHtml(path);
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(path, 'utf8');
      let page = html.replace(/(href|src)="\/(?!\/)/g, `$1="${base}/`);
      if (assetVersion) {
        page = page.replaceAll(`${base}/style.css"`, `${base}/style.css?v=${assetVersion}"`)
          .replaceAll(`${base}/app.js"`, `${base}/app.js?v=${assetVersion}"`);
      }
      await writeFile(path, page);
    }
  }
}

await rewriteHtml(output);
const cssPath = join(output, 'style.css');
const css = await readFile(cssPath, 'utf8');
await writeFile(cssPath, css.replace(/url\((['"]?)\/(?!\/)/g, `url($1${base}/`));

const home = await readFile(join(output, 'index.html'), 'utf8');
if (!home.includes(`src="${base}/app.js`) || !home.includes(`href="${base}/style.css`)) {
  throw new Error('Pages asset paths were not generated');
}
console.log(`Built ${output} for ${base || '/'}`);
