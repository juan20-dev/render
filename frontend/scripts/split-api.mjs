import fs from 'fs';
import path from 'path';

const root = path.resolve('src/app/services');
const fullPath = path.join(root, 'api/_full.ts');
const s = fs.readFileSync(fullPath, 'utf8');
const splitAt = s.indexOf('export const api = {');
const apiInner = s.slice(splitAt + 'export const api = {'.length).replace(/;\s*$/, '');

const imports = `import { apiFetch, apiFetchData } from '../http';
import type { Usuario, Categoria, Producto, Proveedor, Compra, OrdenProduccion, EntregaInsumo, Cliente, Pedido, Venta, Abono, Domicilio } from '../types';
import {
  pedidoEstadoUi, pedidoEstadoDb, domicilioEstadoUi, domicilioEstadoDb, prodEstadoUi, compraEstadoUi,
  ventaEstadoUi, ventaEstadoDb, abonoEstadoUi, abonoEstadoDb, metodoPagoUi, metodoPagoDb,
  uiAct, dbAct, mapUsuario, mapCategoria, mapProducto, mapProveedor, mapCompra, mapCliente,
  mapPedidoListRow, mapPedidoDetail, mapVenta, mapAbono, mapDomicilio, mapProduccion,
} from '../mappers';
import { q, rolIdByNombre, clearRolesCache } from './shared';
`;

function sliceSection(startKey, endKey) {
  const startNeedle = `\n  ${startKey}: {`;
  const start = apiInner.indexOf(startNeedle);
  if (start < 0) throw new Error(`Missing ${startKey}`);
  const from = start + 1;
  const end = endKey
    ? apiInner.indexOf(`\n  ${endKey}: {`, from)
    : apiInner.length;
  let chunk = apiInner.slice(from, end < 0 ? apiInner.length : end).trim();
  chunk = chunk.replace(/,\s*$/, '');
  chunk = chunk.replace(/\}\s*,\s*$/, '');
  return chunk;
}

const authBlock = sliceSection('auth', 'public');
const publicBlock = sliceSection('public', 'dashboard');
const dashboardBlock = sliceSection('dashboard', 'roles');
const rolesBlock = sliceSection('roles', 'usuarios');
const usuariosBlock = sliceSection('usuarios', 'categorias');
const catalogBlock = sliceSection('categorias', 'clientes');
const salesBlock = sliceSection('clientes', null);

const apiDir = path.join(root, 'api');

fs.writeFileSync(
  path.join(apiDir, 'auth.api.ts'),
  `${imports}\n\nexport const authApi = {\n  ${authBlock},\n  ${publicBlock},\n};\n`
);

fs.writeFileSync(
  path.join(apiDir, 'admin.api.ts'),
  `${imports}\n\nexport const adminApi = {\n  ${dashboardBlock},\n  ${rolesBlock.replace(/rolesCache = null/g, 'clearRolesCache()')},\n  ${usuariosBlock.replace(/rolesCache = null/g, 'clearRolesCache()')},\n};\n`
);

fs.writeFileSync(path.join(apiDir, 'catalog.api.ts'), `${imports}\n\nexport const catalogApi = {\n  ${catalogBlock.replace(/rolesCache = null/g, 'clearRolesCache()')},\n};\n`);

fs.writeFileSync(path.join(apiDir, 'sales.api.ts'), `${imports}\n\nexport const salesApi = {\n  ${salesBlock},\n};\n`);

fs.writeFileSync(
  path.join(apiDir, 'index.ts'),
  `import { authApi } from './auth.api';
import { adminApi } from './admin.api';
import { catalogApi } from './catalog.api';
import { salesApi } from './sales.api';

export const api = {
  ...authApi,
  ...adminApi,
  ...catalogApi,
  ...salesApi,
};
`
);

console.log('OK');
