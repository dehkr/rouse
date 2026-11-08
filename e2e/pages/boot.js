// Loads the minified build, or the development build with `?build=dev`. A page
// registers its scopes and stores in `window.setup(app, lib)`, defined before this
// script, where `lib` is the loaded module (`signal`, `reactive`, …).
// `<html data-ready>` marks `rz:app:ready` for specs to wait on.
const dev = new URLSearchParams(location.search).get('build') === 'dev';
const lib = await import(dev ? '/dist/rouse.js' : '/dist/rouse.min.js');

const app = lib.rouse();
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
