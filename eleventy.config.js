import syntaxHighlight from '@11ty/eleventy-plugin-syntaxhighlight';
import { IdAttributePlugin } from '@11ty/eleventy';

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);
  eleventyConfig.addPlugin(IdAttributePlugin);

  // Keep index.md free of front matter: it doubles as llms.txt
  eleventyConfig.addGlobalData('layout', 'base.njk');
  eleventyConfig.addGlobalData('title', 'Rouse reference');

  // Serve the raw source for agents
  eleventyConfig.addPassthroughCopy({ 'docs/index.md': 'llms.txt' });
  eleventyConfig.addPassthroughCopy('docs/assets');
}

export const config = {
  dir: { input: 'docs', output: '_site' },
  markdownTemplateEngine: false,
};