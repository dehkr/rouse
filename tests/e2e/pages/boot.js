// Loads the minified build, or the development build with `?build=dev`. A page
// registers its scopes and stores in `window.setup(app, lib)`, defined before this
// script, where `lib` is the loaded module (`signal`, `reactive`, …). A page that
// needs plugins lists their names in `window.plugins`, and each loads from the same
// build as core. `<html data-ready>` marks `rz:app:ready` for specs to wait on.
const dev = new URLSearchParams(location.search).get('build') === 'dev';
const ext = dev ? '.js' : '.min.js';
const lib = await import(`/dist/rouse${ext}`);
const plugins = await Promise.all(
  (window.plugins ?? []).map(async (name) => (await import(`/dist/${name}${ext}`))[name]),
);

const app = lib.rouse({ plugins });
window.app = app;
await window.setup?.(app, lib);

document.addEventListener(
  'rz:app:ready',
  () => {
    document.documentElement.dataset.ready = '';
  },
  { once: true },
);
app.start();
