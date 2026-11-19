import { rouse } from 'rousejs';

const app = rouse();

app.store('prefs', { theme: 'light' }, { persist: 'local', persistKey: 'prefs' });

// @ts-expect-error `url` needs the sync plugin
app.store('cart', { items: [] }, { url: '/api/cart' });

// @ts-expect-error `push` needs the sync plugin
void app.stores.push('cart');
