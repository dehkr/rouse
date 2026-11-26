import { rouse } from 'rousejs';
import { sync, type StoreStatus } from 'rousejs/sync';

const app = rouse({ plugins: [sync] });

app.store('cart', { items: [] }, { url: '/api/cart', timeout: 5000 });
void app.stores.push('cart', { indicator: '#save' });

const status: StoreStatus | undefined = app.stores.status('cart');
void status;

// @ts-expect-error `indicator` belongs to the trigger, not the store
app.store('user', {}, { url: '/api/user', indicator: '#save' });
