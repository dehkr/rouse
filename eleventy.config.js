import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import syntaxHighlight from '@11ty/eleventy-plugin-syntaxhighlight';
import { IdAttributePlugin } from '@11ty/eleventy';
import { transform } from 'esbuild';

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);
  eleventyConfig.addPlugin(IdAttributePlugin);

  // Provide defaults via global data so index.md stays clean Markdown for LLM/agent consumption
  eleventyConfig.addGlobalData('layout', 'base.njk');
  eleventyConfig.addGlobalData('title', 'Rouse reference');

  // Serve the raw source for agents
  eleventyConfig.addPassthroughCopy({ 'docs/index.md': 'index.md' });
  eleventyConfig.addPassthroughCopy('docs/llms.txt');
  eleventyConfig.addPassthroughCopy('docs/assets');

  // Enforce UTF-8 headers to prevent character corruption (e.g., arrow symbols) on raw text responses
  eleventyConfig.addPassthroughCopy({ 'docs/_headers': '_headers' });

  // Transpile TypeScript scopes to ESM without bundling, preserving import specifiers so
  // paths resolve identically in tsc and the browser.
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
