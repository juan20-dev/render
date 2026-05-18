/**
 * Smoke test: login por rol + endpoints críticos tras refactors (Zod, sesión BD, scope).
 * Uso: node scripts/smoke-role-validation.js
 */
const base = process.env.API_BASE || 'http://localhost:3002';
const PASSWORD = process.env.SMOKE_PASSWORD || 'password_123';

const users = {
  admin: 'admin@grandmas.com',
  repartidor: 'repartidor@grandmas.com',
  productor: 'productor@grandmas.com',
  cliente: 'cliente@grandmas.com',
};

async function login(email) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, rememberMe: false }),
  });
  const rawCookie = res.headers.getSetCookie?.() || [];
  const cookieHeader =
    rawCookie.length > 0
      ? rawCookie.map((c) => c.split(';')[0]).join('; ')
      : (res.headers.get('set-cookie') || '').split(',')[0]?.split(';')[0] || '';
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(`Login falló (${email}): ${body.message || res.status}`);
  }
  return { cookie: cookieHeader, user: body.data };
}

async function request(method, path, cookie, json) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    },
    body: json ? JSON.stringify(json) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function ok(label) {
  console.log(`  ✓ ${label}`);
}

async function main() {
  console.log(`\nSmoke validation — ${base}\n`);

  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data?.success, 'health');
  ok('GET /api/health');

  const admin = await login(users.admin);
  assert(admin.user?.rol === 'Administrador', 'rol admin');
  assert(admin.user?.idle_timeout_ms > 0, 'idle_timeout en login');
  ok('Login Administrador + metadata sesión');

  const adminDom = await request('GET', '/api/domicilios', admin.cookie);
  assert(adminDom.status === 200 && Array.isArray(adminDom.data?.data), 'admin domicilios');
  ok(`Admin GET /api/domicilios (${adminDom.data.data.length} filas)`);

  const adminProd = await request('GET', '/api/produccion', admin.cookie);
  assert(adminProd.status === 200 && Array.isArray(adminProd.data?.data), 'admin produccion');
  ok(`Admin GET /api/produccion (${adminProd.data.data.length} filas)`);

  const adminCat = await request('GET', '/api/categorias', admin.cookie);
  assert(adminCat.status === 200, 'admin categorias');
  ok('Admin GET /api/categorias');

  const zodBad = await request('POST', '/api/domicilios', admin.cookie, {});
  assert(zodBad.status === 400, `Zod debe rechazar body sin pedido/repartidor (got ${zodBad.status})`);
  ok('Zod rechaza POST domicilio incompleto (400)');

  const rep = await login(users.repartidor);
  assert(rep.user?.rol === 'Repartidor', 'rol repartidor');
  ok('Login Repartidor');

  const repDom = await request('GET', '/api/domicilios', rep.cookie);
  assert(repDom.status === 200 && Array.isArray(repDom.data?.data), 'rep domicilios list');
  const repRows = repDom.data.data;
  const allMine = repRows.every((d) => Number(d.repartidor_id) === Number(rep.user.id));
  assert(allMine, 'Repartidor debe ver solo domicilios con su repartidor_id');
  ok(`Repartidor GET domicilios: ${repRows.length} asignados (filtro repartidor_id OK)`);

  const repPedidos = await request('GET', '/api/pedidos', rep.cookie);
  assert(repPedidos.status === 403, `Repartidor no debe listar pedidos (got ${repPedidos.status})`);
  ok('Repartidor bloqueado en GET /api/pedidos (403)');

  const repPostDom = await request('POST', '/api/domicilios', rep.cookie, {
    pedido_id: 1,
    repartidor_id: rep.user.id,
  });
  assert(repPostDom.status === 403, 'Repartidor no debe crear domicilios');
  ok('Repartidor bloqueado en POST domicilios (403)');

  const prod = await login(users.productor);
  ok('Login Productor');

  const prodOrdenes = await request('GET', '/api/produccion', prod.cookie);
  assert(prodOrdenes.status === 200 && Array.isArray(prodOrdenes.data?.data), 'prod list');
  const prodRows = prodOrdenes.data.data;
  const allProdMine = prodRows.every((p) => Number(p.productor_id) === Number(prod.user.id));
  assert(allProdMine, 'Productor debe ver solo órdenes con su productor_id');
  ok(`Productor GET produccion: ${prodRows.length} asignadas (filtro productor_id OK)`);

  const prodProdutos = await request('GET', '/api/productos', prod.cookie);
  assert(prodProdutos.status === 403, `Productor no debe listar productos (got ${prodProdutos.status})`);
  ok('Productor bloqueado en GET /api/productos (403)');

  const cli = await login(users.cliente);
  ok('Login Cliente');

  const cliPed = await request('GET', '/api/pedidos', cli.cookie);
  assert(cliPed.status === 200 && Array.isArray(cliPed.data?.data), 'cliente pedidos');
  ok(`Cliente GET pedidos: ${cliPed.data.data.length} propios`);

  const cliDom = await request('GET', '/api/domicilios', cli.cookie);
  assert(cliDom.status === 403, `Cliente no debe listar domicilios staff (got ${cliDom.status})`);
  ok('Cliente bloqueado en GET /api/domicilios (403)');

  const me = await request('GET', '/api/auth/me', cli.cookie);
  assert(me.status === 200 && me.data?.data?.idle_timeout_ms > 0, 'me con sesión');
  ok('GET /api/auth/me con sesión activa');

  console.log('\n✅ Todos los smoke checks pasaron.\n');
}

main().catch((err) => {
  console.error('\n❌ Smoke validation falló:', err.message);
  process.exit(1);
});
