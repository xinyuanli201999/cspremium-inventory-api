// End-to-end API check (auth, RBAC, categories drag-reorder, stock rules, concurrency,
// dashboard, all 10 reports, Excel export, audit logs).
//
// !! Run against a DEV database only — it creates/deactivates users and moves stock.
// Prerequisites: API running on http://localhost:3000, a freshly seeded database with
//   SEED_SAMPLE_DATA=true  and the default seed admin (admin@example.com / ChangeMe123!).
// Usage:  npm run test:api      (override API with API_URL=...)
const B = process.env.API_URL ?? 'http://localhost:3000/api';
let pass = 0, fail = 0;
const ok = (name, cond, extra='') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + extra}`); };
async function call(method, path, { token, body, cookie, raw } = {}) {
  const res = await fetch(B + path, { method, headers: { ...(body ? {'Content-Type':'application/json'} : {}), ...(token ? {Authorization:`Bearer ${token}`} : {}), ...(cookie ? {Cookie: cookie} : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return res;
  let json; try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json, res };
}

// --- auth
let r = await call('GET', '/auth/me');
ok('no token -> 401', r.status === 401);
r = await call('POST', '/auth/login', { body: { email: 'admin@example.com', password: 'wrong' } });
ok('bad password -> 401', r.status === 401, r.status);
r = await call('POST', '/auth/login', { body: { email: 'ADMIN@example.com', password: 'ChangeMe123!' } });
ok('login ok (case-insensitive email)', r.status === 200 && r.json.data.accessToken, JSON.stringify(r.json));
const admin = r.json.data.accessToken;
const setCookie = r.res.headers.get('set-cookie') ?? '';
ok('refresh cookie httpOnly + path', /refresh_token=/.test(setCookie) && /HttpOnly/i.test(setCookie) && /Path=\/api\/auth/.test(setCookie), setCookie);
const cookie = setCookie.split(';')[0];
r = await call('POST', '/auth/refresh', { cookie });
ok('refresh ok', r.status === 200 && r.json.data.accessToken, JSON.stringify(r.json));
const newCookie = r.res.headers.get('set-cookie').split(';')[0];
r = await call('POST', '/auth/refresh', { cookie });
ok('old refresh token reused within grace -> 401', r.status === 401, r.status);
r = await call('GET', '/auth/me', { token: admin });
ok('me', r.json.data.role === 'ADMIN');

// --- categories
r = await call('GET', '/categories', { token: admin });
const cats = r.json.data;
ok('categories list ordered w/ subcategories', r.status === 200 && cats.length === 4 && cats[0].slug === 'business-solutions' && cats[1].subcategories.length === 6, JSON.stringify(cats.map(c=>c.slug)));
ok('category counts included', cats[1]._count.subcategories === 6);
r = await call('PATCH', '/categories/reorder', { token: admin, body: { items: [{id: cats[0].id, sortOrder: 4},{id: cats[1].id, sortOrder: 1},{id: cats[2].id, sortOrder: 2},{id: cats[3].id, sortOrder: 3}] } });
ok('category reorder persisted', r.status === 200 && r.json.data[0].slug === 'customize-gifts' && r.json.data[3].slug === 'business-solutions', JSON.stringify(r.json).slice(0,200));
r = await call('POST', '/categories', { token: admin, body: { name: 'Test Cat', nameKh: '' } });
ok('create category auto slug', r.status === 201 && r.json.data.slug === 'test-cat' && r.json.data.nameKh === null, JSON.stringify(r.json));
const testCat = r.json.data;
r = await call('POST', '/categories', { token: admin, body: { name: 'Test Cat' } });
ok('duplicate slug -> 409', r.status === 409, JSON.stringify(r.json));
r = await call('POST', `/categories/${testCat.id}/subcategories`, { token: admin, body: { name: 'Test Sub' } });
ok('create subcategory', r.status === 201 && r.json.data.slug === 'test-sub', JSON.stringify(r.json));
const testSub = r.json.data;
r = await call('DELETE', `/categories/${testCat.id}`, { token: admin });
ok('delete category with subcategories -> 409 w/ message', r.status === 409 && /ប្រភេទរង/.test(r.json.message), JSON.stringify(r.json));
// move subcategory 'bags' (customize-gifts) into test category, next to Test Sub
const custom = cats.find(c => c.slug === 'customize-gifts');
const bags = custom.subcategories.find(s => s.slug === 'bags');
r = await call('PATCH', '/subcategories/reorder', { token: admin, body: { categoryId: testCat.id, items: [{id: bags.id, sortOrder: 1},{id: testSub.id, sortOrder: 2}] } });
ok('cross-category subcategory move', r.status === 200 && r.json.data[0].id === bags.id && r.json.data[0].categoryId === testCat.id, JSON.stringify(r.json).slice(0,300));
// move it back
await call('PATCH', '/subcategories/reorder', { token: admin, body: { categoryId: custom.id, items: [{id: bags.id, sortOrder: 1}] } });
r = await call('DELETE', `/subcategories/${testSub.id}`, { token: admin });
ok('delete empty subcategory', r.status === 200);
r = await call('DELETE', `/categories/${testCat.id}`, { token: admin });
ok('delete empty category', r.status === 200, JSON.stringify(r.json));

// --- suppliers + products
r = await call('GET', '/suppliers', { token: admin });
const supplier = r.json.data[0];
ok('suppliers list w/ meta', r.status === 200 && r.json.meta.total === 1 && supplier._count.products === 5, JSON.stringify(r.json).slice(0,200));
r = await call('GET', '/products?limit=2&sortBy=name&sortOrder=asc', { token: admin });
ok('products paginated', r.json.data.length === 2 && r.json.meta.totalPages === 3 && typeof r.json.data[0].purchasePrice === 'number', JSON.stringify(r.json.meta) + typeof r.json.data[0]?.purchasePrice);
r = await call('GET', '/products?stock=low', { token: admin });
ok('low filter (0<stock<=min)', r.json.data.length === 1 && r.json.data[0].sku === 'BTL-001', JSON.stringify(r.json.data.map(p=>p.sku)));
r = await call('GET', '/products?stock=out', { token: admin });
ok('out filter', r.json.data.length === 1 && r.json.data[0].sku === 'KEY-001');
r = await call('GET', '/products?search=elephant', { token: admin });
ok('search', r.json.data.length === 1);
const bagsProduct = (await call('GET', '/products?search=BAG-001', { token: admin })).json.data[0];
r = await call('POST', '/products', { token: admin, body: { sku: 'BAG-001', name: 'dup', categoryId: custom.id, purchasePrice: 1, sellingPrice: 2, minimumStock: 1, unit: 'PIECE' } });
ok('duplicate SKU -> 409', r.status === 409, JSON.stringify(r.json));
const premium = cats.find(c => c.slug === 'premium-gifts');
r = await call('POST', '/products', { token: admin, body: { sku: 'MISMATCH', name: 'x', categoryId: premium.id, subcategoryId: bags.id, purchasePrice: 1, sellingPrice: 2, minimumStock: 1, unit: 'PIECE' } });
ok('subcategory must belong to category -> 400', r.status === 400, JSON.stringify(r.json));
r = await call('POST', '/products', { token: admin, body: { sku: 'NEW-001', name: 'New Item', nameKh: 'ទំនិញថ្មី', categoryId: custom.id, subcategoryId: bags.id, supplierId: supplier.id, purchasePrice: 5, sellingPrice: 9.5, minimumStock: 3, unit: 'BOX', initialStock: 20 } });
ok('create product with opening stock', r.status === 201 && r.json.data.currentStock === 20, JSON.stringify(r.json).slice(0,300));
const np = r.json.data;
r = await call('POST', '/products', { token: admin, body: { sku: 'BAD', name: 'x', categoryId: 'nope', purchasePrice: -1, sellingPrice: 2, minimumStock: 1, unit: 'PIECE', extra: 1 } });
ok('validation errors listed', r.status === 400 && Array.isArray(r.json.errors) && r.json.errors.length >= 2, JSON.stringify(r.json));

// --- inventory
r = await call('POST', '/inventory/stock-in', { token: admin, body: { productId: np.id, supplierId: supplier.id, quantity: 10, unitCost: 6.5 } });
ok('stock in', r.status === 201 && r.json.data.previousStock === 20 && r.json.data.newStock === 30 && r.json.data.totalCost === 65 && /^SI-/.test(r.json.data.referenceNo), JSON.stringify(r.json).slice(0,300));
r = await call('POST', '/inventory/stock-out', { token: admin, body: { productId: np.id, quantity: 31, reason: 'Sale' } });
ok('stock out > stock -> 400', r.status === 400 && /ស្តុកមិនគ្រប់គ្រាន់/.test(r.json.message), JSON.stringify(r.json));
r = await call('POST', '/inventory/stock-out', { token: admin, body: { productId: np.id, quantity: 12, reason: 'Sale', party: 'ACME' } });
ok('stock out', r.status === 201 && r.json.data.newStock === 18 && r.json.data.party === 'ACME', JSON.stringify(r.json).slice(0,300));
// concurrency: 5 parallel stock-outs of 5 against 18 -> exactly 3 succeed
const par = await Promise.all(Array.from({length:5}, () => call('POST', '/inventory/stock-out', { token: admin, body: { productId: np.id, quantity: 5, reason: 'race' } })));
const succ = par.filter(p => p.status === 201).length;
const after = (await call('GET', `/products/${np.id}`, { token: admin })).json.data;
ok('concurrent stock-outs never oversell', succ === 3 && after.currentStock === 3, `succ=${succ} stock=${after.currentStock}`);
r = await call('POST', '/inventory/adjustment', { token: admin, body: { productId: np.id, newQuantity: 3, reason: 'Count' } });
ok('adjustment no-change -> 400', r.status === 400);
r = await call('POST', '/inventory/adjustment', { token: admin, body: { productId: np.id, newQuantity: 1, reason: 'Damaged', note: 'dropped' } });
ok('adjustment', r.status === 201 && r.json.data.previousStock === 3 && r.json.data.newStock === 1 && r.json.data.adjustment.difference === -2, JSON.stringify(r.json).slice(0,300));
r = await call('DELETE', `/products/${np.id}`, { token: admin });
ok('delete product with history -> 409', r.status === 409, JSON.stringify(r.json));
r = await call('GET', `/inventory/movements?productId=${np.id}&limit=50`, { token: admin });
ok('movements list (sorted, includes types)', r.json.meta.total === 1+1+1+3+1 && new Set(r.json.data.map(m=>m.type)).size === 3, JSON.stringify(r.json.meta));
r = await call('GET', `/inventory/movements?type=ADJUSTMENT&categoryId=${custom.id}`, { token: admin });
ok('movements filter type+category', r.json.data.length === 1);
r = await call('GET', `/products/${np.id}`, { token: admin });
ok('product detail has recent movements', r.json.data.movements.length === 7);
r = await call('GET', `/suppliers/${supplier.id}/stock-in`, { token: admin });
ok('supplier stock-in history', r.status === 200 && r.json.meta.total >= 6, JSON.stringify(r.json.meta));

// --- dashboard
r = await call('GET', '/dashboard/summary', { token: admin });
const s = r.json.data;
ok('dashboard summary', r.status === 200 && s.totalProducts === 6 && s.totalCategories === 4 && s.lowStock >= 1 && s.outOfStock === 1 && s.stockInToday > 0 && s.inventoryValue > 0, JSON.stringify(s));
r = await call('GET', '/dashboard/charts', { token: admin });
const ch = r.json.data;
ok('dashboard charts', r.status === 200 && ch.stockFlowDaily.length === 14 && ch.movementByMonth.length === 6 && ch.valueByCategory.length === 4 && ch.stockFlowDaily.at(-1).stockIn > 0 && ch.movementByMonth.at(-1).stockOut > 0, JSON.stringify(ch).slice(0, 400));

// --- reports
r = await call('GET', '/reports', { token: admin });
ok('report catalog (admin 10)', r.json.data.length === 10);
for (const key of ['stock','stock-in','stock-out','stock-movement','low-stock','products','suppliers','valuation','categories','subcategories']) {
  const rr = await call('GET', `/reports/${key}?limit=5`, { token: admin });
  ok(`report preview: ${key}`, rr.status === 200 && Array.isArray(rr.json.data), JSON.stringify(rr.json).slice(0,200));
}
r = await call('GET', '/reports/valuation', { token: admin });
ok('valuation totals', r.json.meta.totals.stockValue > 0 && r.json.meta.total === 6, JSON.stringify(r.json.meta));
r = await call('GET', `/reports/stock?categoryId=${custom.id}&search=bag`, { token: admin });
ok('report filters applied', r.json.meta.total === 1);
r = await call('GET', '/reports/nope', { token: admin });
ok('unknown report -> 404', r.status === 404);
const ex = await call('GET', `/reports/stock/export?categoryId=${custom.id}&dateFrom=2026-09-01&dateTo=2026-09-30`, { token: admin, raw: true });
const buf = Buffer.from(await ex.arrayBuffer());
ok('excel export headers', ex.status === 200 && /spreadsheetml/.test(ex.headers.get('content-type')) && /stock-report-\d{4}-\d{2}-\d{2}\.xlsx/.test(ex.headers.get('content-disposition')), ex.status + ex.headers.get('content-disposition'));
ok('excel is a zip', buf.slice(0,2).toString() === 'PK', buf.length);
import('fs').then(fs => fs.writeFileSync('/tmp/stock-report.xlsx', buf));
const ex2 = await call('GET', '/reports/valuation/export', { token: admin, raw: true });
import('fs').then(fs => fs.writeFileSync('/tmp/valuation.xlsx', Buffer.from([])));
const buf2 = Buffer.from(await ex2.arrayBuffer());
import('fs').then(fs => fs.writeFileSync('/tmp/valuation.xlsx', buf2));

// --- users + RBAC
r = await call('POST', '/users', { token: admin, body: { name: 'Staff One', email: 'Staff@Example.com', password: 'StaffPass123', role: 'STAFF' } });
ok('create staff (email lowercased)', r.status === 201 && r.json.data.email === 'staff@example.com' && !r.json.data.passwordHash, JSON.stringify(r.json));
const staffId = r.json.data.id;
r = await call('POST', '/auth/login', { body: { email: 'staff@example.com', password: 'StaffPass123' } });
const staff = r.json.data.accessToken;
ok('staff login', !!staff);
for (const [m, p, b] of [
  ['GET','/users'], ['GET','/audit-logs'], ['POST','/categories',{name:'x'}], ['PATCH','/categories/reorder',{items:[{id:cats[0].id,sortOrder:1}]}],
  ['POST','/products',{}], ['DELETE',`/products/${np.id}`], ['POST','/suppliers',{companyName:'x'}],
  ['POST','/inventory/adjustment',{productId:np.id,newQuantity:5,reason:'x'}], ['GET','/reports/valuation'], ['GET','/reports/valuation/export'],
  ['POST','/uploads/image']]) {
  const rr = await call(m, p, { token: staff, body: b });
  ok(`staff forbidden: ${m} ${p.split('?')[0].slice(0,32)}`, rr.status === 403, rr.status + JSON.stringify(rr.json));
}
r = await call('GET', '/products', { token: staff }); ok('staff can view products', r.status === 200);
r = await call('POST', '/inventory/stock-in', { token: staff, body: { productId: np.id, quantity: 1 } }); ok('staff can stock in', r.status === 201, JSON.stringify(r.json));
r = await call('POST', '/inventory/stock-out', { token: staff, body: { productId: np.id, quantity: 1, reason: 'use' } }); ok('staff can stock out', r.status === 201);
r = await call('GET', '/dashboard/summary', { token: staff }); ok('staff dashboard hides inventory value', r.status === 200 && r.json.data.inventoryValue === null);
r = await call('GET', '/reports', { token: staff }); ok('staff report catalog limited', r.json.data.length === 6 && !r.json.data.some(x => x.key === 'valuation'));
r = await call('GET', '/reports/stock', { token: staff }); ok('staff can view stock report', r.status === 200);
// deactivate staff -> token stops working immediately
r = await call('PATCH', `/users/${staffId}`, { token: admin, body: { status: 'INACTIVE' } });
r = await call('GET', '/products', { token: staff }); ok('deactivated user token rejected', r.status === 401);
r = await call('PATCH', `/users/${(await call('GET','/auth/me',{token:admin})).json.data.id}`, { token: admin, body: { status: 'INACTIVE' } });
ok('cannot deactivate self', r.status === 400);

// --- audit logs
r = await call('GET', '/audit-logs?limit=5', { token: admin });
ok('audit logs list', r.status === 200 && r.json.data.length === 5 && r.json.data[0].user, JSON.stringify(r.json.meta));
r = await call('GET', '/audit-logs?module=inventory&action=STOCK_OUT', { token: admin });
ok('audit filter', r.json.data.every(a => a.module === 'inventory' && a.action === 'STOCK_OUT') && r.json.meta.total >= 4);
r = await call('GET', '/audit-logs?action=REORDER', { token: admin });
ok('reorder audited', r.json.meta.total >= 3, JSON.stringify(r.json.meta));

// --- change password + logout
r = await call('POST', '/auth/logout', { cookie: newCookie });
ok('logout', r.status === 200);
r = await call('POST', '/auth/refresh', { cookie: newCookie });
ok('refresh after logout -> 401', r.status === 401);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
