import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import syntaxHighlight from '@11ty/eleventy-plugin-syntaxhighlight';
import { IdAttributePlugin } from '@11ty/eleventy';
import { transform } from 'esbuild';

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);
  eleventyConfig.addPlugin(IdAttributePlugin);

  // Keep index.md free of front matter: it's also served raw for agents
  eleventyConfig.addGlobalData('layout', 'base.njk');
  eleventyConfig.addGlobalData('title', 'Rouse reference');

  // Serve the raw source for agents, and llms.txt as its index
  eleventyConfig.addPassthroughCopy({ 'docs/index.md': 'index.md' });
  eleventyConfig.addPassthroughCopy('docs/llms.txt');
  eleventyConfig.addPassthroughCopy('docs/assets');

  // Cloudflare Pages response headers; without a charset, the raw files can garble `→`
  eleventyConfig.addPassthroughCopy({ 'docs/_headers': '_headers' });

  // Scopes are TypeScript. Each compiles to /scopes/<name>.js with its imports as written,
  // so a path like '../assets/rouse/rouse.js' resolves the same for tsc and the browser
  eleventyConfig.addWatchTarget('docs/scopes/');
  eleventyConfig.on('eleventy.before', async ({ directories }) => {
    const outDir = join(directories.output, 'scopes');
    await mkdir(outDir, { recursive: true });
    const files = (await readdir('docs/scopes')).filter((f) => f.endsWith('.ts'));
    await Promise.all(
      files.map(async (file) => {
        const source = await readFile(join('docs/scopes', file), 'utf8');
        const { code } = await transform(source, { loader: 'ts', format: 'esm' });
        await writeFile(join(outDir, file.replace(/\.ts$/, '.js')), code);
      }),
    );
  });
}

export const config = {
  dir: { input: 'docs', output: '_site' },
  markdownTemplateEngine: false,
};
