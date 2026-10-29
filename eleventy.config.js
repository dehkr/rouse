import syntaxHighlight from '@11ty/eleventy-plugin-syntaxhighlight';
import { IdAttributePlugin } from '@11ty/eleventy';

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
}

export const config = {
  dir: { input: 'docs', output: '_site' },
  markdownTemplateEngine: false,
};