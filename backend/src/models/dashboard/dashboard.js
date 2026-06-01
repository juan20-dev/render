const pool = require('../../../db');
const { userHasGestionAccess } = require('../shared/auditoria');
const Usuarios = require('../usuarios/usuarios');

const Dashboard = {
  getStaffResumen: async () => {
    const today = new Date().toISOString().split('T')[0];
    const y = new Date().getFullYear();
    const m = new Date().getMonth() + 1;

    const [
      ventasMes,
      ventasHoy,
      pedidosActivos,
      clientesActivos,
      ventasMensuales,
      categoriaDistribucion,
      productosMasVendidos,
      pedidosRecientes,
    ] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(total), 0)::numeric AS total
         FROM ventas
         WHERE TRIM(LOWER(estado)) IN ('completada', 'completado')
           AND EXTRACT(YEAR FROM fecha::date) = $1
           AND EXTRACT(MONTH FROM fecha::date) = $2`,
        [y, m]
      ),
      pool.query(
        `SELECT COALESCE(SUM(total), 0)::numeric AS total
         FROM ventas
         WHERE TRIM(LOWER(estado)) IN ('completada', 'completado')
           AND fecha::date = $1::date`,
        [today]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
         FROM pedidos
         WHERE TRIM(estado) NOT IN ('Completado', 'Cancelado')`
      ),
      pool.query(`SELECT COUNT(*)::int AS c FROM clientes WHERE TRIM(estado) = 'Activo'`),
      pool.query(
        `SELECT TO_CHAR(fecha::date, 'Mon YYYY') AS label,
                TO_CHAR(fecha::date, 'YYYY-MM') AS orden,
                COALESCE(SUM(total), 0)::numeric AS ventas
         FROM ventas
         WHERE TRIM(LOWER(estado)) IN ('completada', 'completado')
           AND fecha::date >= (CURRENT_DATE - INTERVAL '6 months')
         GROUP BY TO_CHAR(fecha::date, 'Mon YYYY'), TO_CHAR(fecha::date, 'YYYY-MM')
         ORDER BY orden ASC`
      ),
      pool.query(
        `SELECT c.nombre AS name, COALESCE(SUM(dv.subtotal), 0)::numeric AS value
         FROM detalle_ventas dv
         JOIN ventas v ON v.id = dv.venta_id
         JOIN productos p ON p.id = dv.producto_id
         JOIN categorias c ON c.id = p.categoria_id
         WHERE TRIM(LOWER(v.estado)) IN ('completada', 'completado')
           AND v.fecha::date >= (CURRENT_DATE - INTERVAL '12 months')
         GROUP BY c.id, c.nombre
         ORDER BY value DESC`
      ),
      pool.query(
        `SELECT p.nombre AS name,
                SUM(dv.cantidad)::int AS quantity,
                COALESCE(SUM(dv.subtotal), 0)::numeric AS sales
         FROM detalle_ventas dv
         JOIN ventas v ON v.id = dv.venta_id
         JOIN productos p ON p.id = dv.producto_id
         WHERE TRIM(LOWER(v.estado)) IN ('completada', 'completado')
         GROUP BY p.id, p.nombre
         ORDER BY quantity DESC
         LIMIT 10`
      ),
      pool.query(
        `SELECT p.id,
                p.numero_pedido,
                TRIM(CONCAT(COALESCE(c.nombre, ''), ' ', COALESCE(c.apellido, ''))) AS cliente,
                p.total,
                p.estado,
                COALESCE(p.fecha, p.created_at::date) AS fecha
         FROM pedidos p
         JOIN clientes c ON c.id = p.cliente_id
         ORDER BY p.id DESC
         LIMIT 8`
      ),
    ]);

    return {
      ventasMes: Number(ventasMes.rows[0]?.total ?? 0),
      ventasHoy: Number(ventasHoy.rows[0]?.total ?? 0),
      pedidosActivos: pedidosActivos.rows[0]?.c ?? 0,
      clientesActivos: clientesActivos.rows[0]?.c ?? 0,
      ventasMensuales: ventasMensuales.rows.map((r) => ({
        month: r.label,
        orden: r.orden,
        ventas: Number(r.ventas),
      })),
      categoriaDistribucion: categoriaDistribucion.rows.map((r) => ({
        name: r.name,
        value: Number(r.value),
      })),
      productosMasVendidos: productosMasVendidos.rows.map((r) => ({
        name: r.name,
        quantity: r.quantity,
        sales: Number(r.sales),
      })),
      pedidosRecientes: pedidosRecientes.rows.map((r) => {
        const fechaRaw = r.fecha != null ? r.fecha : null;
        const fechaStr =
          fechaRaw instanceof Date
            ? fechaRaw.toISOString().split('T')[0]
            : fechaRaw != null
              ? String(fechaRaw).split('T')[0]
              : '';
        return {
          id: String(r.id),
          numero_pedido: r.numero_pedido != null ? String(r.numero_pedido) : '',
          client: r.cliente?.trim() || '—',
          total: Number(r.total ?? 0),
          status: String(r.estado ?? ''),
          date: fechaStr,
        };
      }),
    };
  },

  getAvailableModulesForUser: async (userId) => {
    const usuario = await Usuarios.getById(userId);
    if (!usuario) return null;

    const roleRow = await pool.query('SELECT nombre, permisos FROM roles WHERE id = $1', [usuario.rol_id]);
    const rol = roleRow.rows[0];
    const permisos = Array.isArray(rol?.permisos) ? rol.permisos : [];
    const roleName = rol?.nombre || 'Cliente';

    const modulosMap = {
      dashboard: { moduleId: 'Dashboard', subGestion: 'Dashboard.Panel', permisos: ['Ver Dashboard'] },
      usuarios: { moduleId: 'Usuarios', subGestion: 'Usuarios.Usuarios', permisos: ['Ver Usuarios'] },
      configuracion: { moduleId: 'Configuración', subGestion: 'Configuración.Roles', permisos: ['Ver Roles'] },
      compras: { moduleId: 'Compras', subGestion: null, permisos: ['Ver Compras'] },
      produccion: { moduleId: 'Producción', subGestion: null, permisos: ['Ver Producción'] },
      ventas: { moduleId: 'Ventas', subGestion: null, permisos: ['Ver Ventas'] },
      domicilios: { moduleId: 'Ventas', subGestion: 'Ventas.Domicilios', permisos: ['Ver Domicilios'] },
      cliente: { moduleId: null, subGestion: null, permisos: ['Ver Tienda', 'Ver Mis Pedidos', 'Cliente'] },
    };

    const modulosDisponibles = {};
    for (const [modulo, config] of Object.entries(modulosMap)) {
      const permisosRequeridos = config.permisos || [];

      if (roleName === 'Administrador' && modulo !== 'cliente') {
        modulosDisponibles[modulo] = true;
      } else if (config.subGestion && userHasGestionAccess(permisos, config.subGestion)) {
        modulosDisponibles[modulo] = true;
      } else if (config.moduleId && userHasGestionAccess(permisos, config.moduleId)) {
        modulosDisponibles[modulo] = true;
      } else {
        modulosDisponibles[modulo] = permisosRequeridos.some((p) => permisos.includes(p));
      }
    }

    return { rol: roleName, permisos, modulos: modulosDisponibles };
  },
};

module.exports = Dashboard;
