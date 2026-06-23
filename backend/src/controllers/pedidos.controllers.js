// Rewire: el modelo Abonos, Pedidos viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../../db');
const appConfig = require('../../config');
const models = {
  Abonos: require('../models/ventas/abonos'),
  Pedidos: require('../models/ventas/pedidos'),
  Domicilios: require('../models/ventas/domicilios'),
};
const {
  isClienteUser,
  getOwnClienteId,
  assertOwnClienteParam,
  assertOwnPedidoId,
} = require('../utils/selfServiceAccess');
const { sendPedidoCreatedEmail } = require('../services/email.service');
const { normalizeMetodoPago } = require('./normalizador-http');

const COMPROBANTE_URL_RE = /^\/uploads\/comprobantes\/[a-zA-Z0-9._-]+$/;

const normalizeEstado = (value) => String(value || '').trim().toLowerCase();
const PEDIDO_TRANSICIONES = {
  Pendiente: ['En Proceso', 'Cancelado'],
  'En Proceso': ['Completado', 'Cancelado'],
  Completado: [],
  Cancelado: [],
};

const canTransitionPedido = (fromEstado, toEstado) =>
  Boolean(PEDIDO_TRANSICIONES[String(fromEstado || '').trim()]?.includes(String(toEstado || '').trim()));

const buildPedidoUpdatePayload = (currentPedido, body = {}) => ({
  numero_pedido: currentPedido.numero_pedido,
  fecha: body.fecha !== undefined ? body.fecha : currentPedido.fecha,
  fecha_entrega: body.fecha_entrega !== undefined ? body.fecha_entrega : currentPedido.fecha_entrega,
  detalles: body.detalles !== undefined ? body.detalles : currentPedido.detalles,
  direccion: body.direccion !== undefined ? body.direccion : currentPedido.direccion,
  telefono: body.telefono !== undefined ? body.telefono : currentPedido.telefono,
  total: body.total !== undefined ? body.total : currentPedido.total,
  metodo_pago: body.metodo_pago !== undefined ? body.metodo_pago : currentPedido.metodo_pago,
  esquema_abono: body.esquema_abono !== undefined ? body.esquema_abono : currentPedido.esquema_abono,
  monto_abonado: body.monto_abonado !== undefined ? body.monto_abonado : currentPedido.monto_abonado,
  estado: body.estado !== undefined ? body.estado : currentPedido.estado,
});

const recentPedidoCreateCache = new Map();
const PEDIDO_DUPLICATE_WINDOW_MS = 15000;

const buildPedidoFingerprint = (clienteId, body = {}) => {
  const productos = Array.isArray(body.productos)
    ? body.productos
        .map((item) => ({
          productoId: Number(item.productoId ?? item.producto_id ?? 0),
          cantidad: Number(item.cantidad || 0),
          precio: Number(item.precio ?? item.precioUnitario ?? 0),
        }))
        .sort((a, b) => a.productoId - b.productoId)
    : [];

  return JSON.stringify({
    clienteId: Number(clienteId || 0),
    fecha: String(body.fecha || ''),
    fechaEntrega: String(body.fecha_entrega || ''),
    direccion: String(body.direccion || '').trim(),
    telefono: String(body.telefono || '').replace(/\D/g, ''),
    metodoPago: String(body.metodo_pago || '').trim(),
    esquemaAbono: String(body.esquema_abono || '').trim(),
    total: Number(body.total || 0),
    detalles: String(body.detalles || '').trim(),
    productos,
  });
};

const cleanupRecentPedidoCreateCache = () => {
  const now = Date.now();
  for (const [key, entry] of recentPedidoCreateCache.entries()) {
    if (!entry || now - entry.createdAtMs >= PEDIDO_DUPLICATE_WINDOW_MS) {
      recentPedidoCreateCache.delete(key);
    }
  }
};

const fechaHoyColombia = () => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(p => p.type === 'year')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const day = parts.find(p => p.type === 'day')?.value || '';
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    // fallback
  }
  const now = new Date();
  const offset = -5 * 60; // Bogota es UTC-5
  const bogotaTime = new Date(now.getTime() + (now.getTimezoneOffset() + offset) * 60000);
  const y = bogotaTime.getFullYear();
  const m = String(bogotaTime.getMonth() + 1).padStart(2, '0');
  const d = String(bogotaTime.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const validarFechaEntrega = (fechaEntrega, fechaPedido) => {
  const hoy = fechaHoyColombia();
  const fe = String(fechaEntrega || '').trim().split('T')[0];
  if (!fe || !/^\d{4}-\d{2}-\d{2}$/.test(fe)) {
    return 'La fecha de entrega es obligatoria y debe tener formato AAAA-MM-DD';
  }
  if (fe < hoy) {
    return 'La fecha de entrega no puede ser una fecha pasada';
  }
  const fp = String(fechaPedido || hoy).trim().split('T')[0];
  if (fe < fp) {
    return 'La fecha de entrega debe ser mayor o igual a la fecha del pedido';
  }
  return null;
};

const handleUpdateProductosYTotal = async (pedidoId, productos, esquemaAbonoInput) => {
  await models.Pedidos.replaceDetalles(pedidoId, productos);
  
  const pedidoActualizado = await models.Pedidos.getById(pedidoId);
  if (pedidoActualizado) {
    const totalNuevo = Number(pedidoActualizado.total || 0);
    const esquema = String(esquemaAbonoInput || pedidoActualizado.esquema_abono || '').trim() || '100%';
    const pct = esquema === '50%' ? 50 : 100;
    const nuevoMontoAbonado = Math.round((totalNuevo * pct) / 100);
    
    // Actualizar monto_abonado en la tabla pedidos
    await models.Pedidos.update(pedidoId, { monto_abonado: nuevoMontoAbonado });
    
    // Buscar el abono inicial y actualizarlo en la tabla abonos si es Registrado, Verificado o Aplicado
    const abonos = await models.Abonos.getByPedido(pedidoId);
    if (Array.isArray(abonos) && abonos.length > 0) {
      const abonoInicial = abonos[0];
      if (abonoInicial.estado !== 'Cancelado' && abonoInicial.estado !== 'Finalizado') {
        await models.Abonos.update(abonoInicial.id, { monto: nuevoMontoAbonado });
      }
    }
    return { total: totalNuevo, monto_abonado: nuevoMontoAbonado };
  }
  return null;
};

const formatDateToYMD = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
};

module.exports = {
  getAll: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        const own = getOwnClienteId(req);
        if (!own) {
          return res.status(403).json({ success: false, message: 'Perfil cliente no vinculado' });
        }
        const estado = req.query?.estado;
        const pedidos = await models.Pedidos.getByCliente(own, estado);
        return res.json({ success: true, data: pedidos });
      }
      const estado = req.query?.estado;
      const pedidos = await models.Pedidos.getAll(estado);
      return res.json({ success: true, data: pedidos });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const denied = await assertOwnPedidoId(req, res, req.params.id);
      if (denied) return denied;

      const pedido = await models.Pedidos.getById(req.params.id);
      if (!pedido) return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
      const notasPedido = pedido.detalles;
      const detalles = await models.Pedidos.getDetalles(req.params.id);
      let domicilio = null;
      try {
        domicilio = await models.Domicilios.getByPedido(req.params.id);
      } catch {
        domicilio = null;
      }
      return res.json({
        success: true,
        data: {
          ...pedido,
          detalles,
          detalles_texto: notasPedido,
          domicilio: domicilio
            ? {
                id: domicilio.id,
                estado: domicilio.estado,
                fecha: domicilio.fecha,
                hora: domicilio.hora,
                repartidor: domicilio.repartidor,
              }
            : null,
        },
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getByCliente: async (req, res) => {
    try {
      const denied = assertOwnClienteParam(req, res, req.params.clienteId);
      if (denied) return denied;

      const pedidos = await models.Pedidos.getByCliente(req.params.clienteId);
      return res.json({ success: true, data: pedidos });
    } catch (error) {
      if (error?.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un pedido con la misma referencia. Espere un momento e intente nuevamente.',
        });
      }
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      const body = { ...req.body };
      if (isClienteUser(req)) {
        const own = getOwnClienteId(req);
        if (!own) {
          return res.status(403).json({ success: false, message: 'Perfil cliente no vinculado' });
        }
        body.cliente_id = own;
      }
      // Validate esquema_abono (only '50%' or '100%')
      if (body.esquema_abono !== undefined && body.esquema_abono !== null) {
        const esquema = String(body.esquema_abono).trim();
        if (!['50%', '100%'].includes(esquema)) {
          return res.status(400).json({ success: false, message: 'Esquema de abono inválido. Valores permitidos: 50%, 100%'});
        }
      }

      // If productos provided in body, attempt to create pedido and its detalles atomically at controller level
      const productos = Array.isArray(body.productos) ? body.productos : null;
      if (productos && productos.length > 0) {
        // compute total from productos to avoid mismatches
        const totalCalc = productos.reduce((s, it) => s + (Number(it.precio || it.precioUnitario || 0) * Number(it.cantidad || 0)), 0);
        body.total = totalCalc;
      }

      const comprobanteUrl = String(body.comprobante_url || '').trim();
      if (isClienteUser(req)) {
        const metodoCliente = normalizeMetodoPago(body.metodo_pago) || 'Transferencia';
        if (metodoCliente !== 'Transferencia') {
          return res.status(400).json({
            success: false,
            message: 'Los pedidos desde la tienda solo admiten pago por transferencia bancaria.',
          });
        }
        body.metodo_pago = 'Transferencia';
        if (!comprobanteUrl || !COMPROBANTE_URL_RE.test(comprobanteUrl)) {
          return res.status(400).json({
            success: false,
            message: 'Debe adjuntar la captura del comprobante de consignación para confirmar el pedido.',
          });
        }
      } else if (comprobanteUrl && !COMPROBANTE_URL_RE.test(comprobanteUrl)) {
        return res.status(400).json({
          success: false,
          message: 'URL de comprobante inválida.',
        });
      }

      // La fecha del pedido se registra en servidor (no se confía en el reloj del cliente).
      body.fecha = fechaHoyColombia();

      const fechaEntregaError = validarFechaEntrega(body.fecha_entrega, body.fecha);
      if (fechaEntregaError) {
        return res.status(400).json({ success: false, message: fechaEntregaError });
      }

      if (body.cliente_id) {
        cleanupRecentPedidoCreateCache();
        const fingerprint = buildPedidoFingerprint(body.cliente_id, body);
        const cacheKey = `cliente:${body.cliente_id}`;
        const cached = recentPedidoCreateCache.get(cacheKey);
        if (cached && cached.fingerprint === fingerprint && Date.now() - cached.createdAtMs < PEDIDO_DUPLICATE_WINDOW_MS) {
          return res.status(409).json({
            success: false,
            message: 'Ya se está procesando o ya se creó un pedido igual hace un momento. Evite reenviar la solicitud.',
          });
        }
        recentPedidoCreateCache.set(cacheKey, {
          fingerprint,
          createdAtMs: Date.now(),
        });
      }

      const id = await models.Pedidos.create(body);

      if (productos && productos.length > 0) {
        try {
          for (const it of productos) {
            const productoId = Number(it.productoId ?? it.producto_id);
            const cantidad = Number(it.cantidad);
            const precioUnitario = Number(it.precio ?? it.precioUnitario ?? 0);
            await models.Pedidos.addDetalle(id, productoId, cantidad, precioUnitario);
          }
        } catch (err) {
          // si falla cualquier detalle, eliminar pedido creado para mantener consistencia
          try {
            await models.Pedidos.delete(id);
          } catch (_e) {
            /* ignore */
          }
          return res.status(err.statusCode || 400).json({ success: false, message: err.message || 'Error al agregar productos al pedido' });
        }
      }

      // Abono inicial: 50 % siempre; 100 % cuando el cliente adjunta comprobante de transferencia
      try {
        const esquema = String(body.esquema_abono || '').trim() || '100%';
        const pedidoRow = await models.Pedidos.getById(id);
        if (pedidoRow) {
          const clienteId = Number(pedidoRow.cliente_id);
          const total = Number(pedidoRow.total || 0);
          const pct = esquema === '50%' ? 50 : 100;
          const crearAbonoInicial =
            esquema === '50%' || (esquema === '100%' && isClienteUser(req) && Boolean(comprobanteUrl));
          if (crearAbonoInicial && total > 0) {
            const monto = Math.round((total * pct) / 100);
            await models.Abonos.create({
              pedido_id: id,
              cliente_id: clienteId,
              monto,
              fecha: new Date().toISOString().split('T')[0],
              metodo_pago: pedidoRow.metodo_pago || 'Transferencia',
              estado: 'Registrado',
              porcentaje_abonado: pct,
              comprobante_url: comprobanteUrl || null,
            });
            await models.Pedidos.update(id, { monto_abonado: monto, esquema_abono: esquema });
          }
        }
      } catch (e) {
        console.error('No se pudo crear abono inicial para pedido', id, e.message);
      }

      const pedidoIdCreado = id;
      setImmediate(() => {
        void (async () => {
          try {
            const pedidoCreado = await models.Pedidos.getById(pedidoIdCreado);
            const detallesPedido = await models.Pedidos.getDetalles(pedidoIdCreado);
            const abonosPedido = await models.Abonos.getByPedido(pedidoIdCreado);
            const abonoInicial = Array.isArray(abonosPedido) && abonosPedido.length > 0 ? abonosPedido[0] : null;
            const totalDetalle = detallesPedido.reduce(
              (sum, item) => sum + Number(item.subtotal ?? Number(item.precio_unitario || 0) * Number(item.cantidad || 0)),
              0
            );
            const totalPedido = Number(pedidoCreado?.total || 0) > 0 ? Number(pedidoCreado.total) : totalDetalle;
            const montoAbonado = Number(pedidoCreado?.monto_abonado ?? abonoInicial?.monto ?? 0);
            let clienteDocumento = null;
            try {
              const clienteRes = await pool.query(
                'SELECT numero_documento FROM clientes WHERE id = $1 LIMIT 1',
                [pedidoCreado.cliente_id]
              );
              const doc = clienteRes.rows[0]?.numero_documento;
              if (doc) clienteDocumento = String(doc).trim();
            } catch {
              /* documento opcional en PDF */
            }
            if (pedidoCreado?.email) {
              await sendPedidoCreatedEmail({
                to: pedidoCreado.email,
                clienteNombre: pedidoCreado.cliente,
                numeroPedido: pedidoCreado.numero_pedido,
                pedidoId: pedidoIdCreado,
                clienteDocumento,
                fechaPedido: pedidoCreado.fecha,
                fechaEntrega: pedidoCreado.fecha_entrega,
                estado: pedidoCreado.estado,
                metodoPago: pedidoCreado.metodo_pago,
                esquemaAbono: pedidoCreado.esquema_abono,
                total: totalPedido,
                montoAbonado,
                saldoPendiente: Math.max(0, totalPedido - montoAbonado),
                direccion: pedidoCreado.direccion,
                telefono: pedidoCreado.telefono,
                detalles: pedidoCreado.detalles,
                productos: detallesPedido.map((item) => ({
                  nombre: item.producto_nombre,
                  cantidad: item.cantidad,
                  precioUnitario: item.precio_unitario,
                  subtotal: item.subtotal ?? Number(item.precio_unitario || 0) * Number(item.cantidad || 0),
                })),
                abono: abonoInicial,
              });
            }
          } catch (mailError) {
            console.error(
              'No se pudo enviar confirmación de pedido por correo',
              pedidoIdCreado,
              mailError?.message
            );
          }
        })();
      });

      return res.status(201).json({ success: true, id, message: 'Pedido creado exitosamente' });
    } catch (error) {
      if (error?.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un pedido con la misma referencia. Espere un momento e intente nuevamente.',
        });
      }
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  addProducto: async (req, res) => {
    try {
      const { pedidoId } = req.body;
      const denied = await assertOwnPedidoId(req, res, pedidoId);
      if (denied) return denied;

      const { productoId, cantidad, precioUnitario } = req.body;
      await models.Pedidos.addDetalle(pedidoId, productoId, cantidad, precioUnitario);
      return res.status(201).json({ success: true, message: 'Producto agregado al pedido' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      const denied = await assertOwnPedidoId(req, res, req.params.id);
      if (denied) return denied;

      const rol = String(req.user?.rol || '').trim();
      const pedido = await models.Pedidos.getById(req.params.id);
      if (!pedido) {
        return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
      }

      // CLIENTE: Solo puede editar si el pedido está en Pendiente
      if (isClienteUser(req)) {
        const estado = String(pedido?.estado || '');
        if (estado !== 'Pendiente') {
          return res.status(403).json({
            success: false,
            message: 'Solo puedes editar pedidos en estado Pendiente',
          });
        }
        const allowed = {
          fecha_entrega: req.body.fecha_entrega,
          detalles: req.body.detalles,
        };
        if (allowed.fecha_entrega !== undefined) {
          const fechaEntregaError = validarFechaEntrega(
            allowed.fecha_entrega,
            pedido.fecha || fechaHoyColombia()
          );
          if (fechaEntregaError) {
            return res.status(400).json({ success: false, message: fechaEntregaError });
          }
        }
        const merged = buildPedidoUpdatePayload(pedido, {
          fecha: pedido.fecha,
          fecha_entrega: allowed.fecha_entrega,
          detalles: allowed.detalles,
          total: pedido.total,
          estado: pedido.estado,
        });
        await models.Pedidos.update(req.params.id, merged);
        return res.json({ success: true, message: 'Pedido actualizado exitosamente' });
      }

      // ASESOR y ADMIN: Pueden cambiar estado si la transición es válida
      if (req.body.estado) {
        const estadoActual = String(pedido.estado || '').trim();
        const estadoNuevo = String(req.body.estado).trim();

        if (!canTransitionPedido(estadoActual, estadoNuevo)) {
          return res.status(400).json({
            success: false,
            message: `Transición no permitida: ${estadoActual} -> ${estadoNuevo}`,
            permitidas: PEDIDO_TRANSICIONES[estadoActual] || [],
          });
        }

        if (estadoNuevo === 'Completado') {
          const prodOrdenPut = await pool.query(
            `SELECT id, estado FROM produccion WHERE pedido_id = $1 LIMIT 1`,
            [req.params.id]
          );
          const ordenPut = prodOrdenPut.rows[0];
          if (ordenPut && String(ordenPut.estado || '').trim() !== 'Orden Lista') {
            return res.status(409).json({
              success: false,
              message:
                'No puede completar el pedido mientras la orden de producción no esté completada. Complete la orden de producción primero; el pedido pasará a Completado automáticamente.',
            });
          }
        }

        const bodyPatch = { ...req.body, estado: estadoNuevo };
        if (Array.isArray(bodyPatch.productos)) {
          if (estadoActual !== 'Pendiente') {
            return res.status(409).json({
              success: false,
              message: 'Solo puede actualizar productos del pedido cuando está en estado Pendiente',
            });
          }
          const resCalc = await handleUpdateProductosYTotal(req.params.id, bodyPatch.productos, bodyPatch.esquema_abono);
          if (resCalc) {
            bodyPatch.total = resCalc.total;
            bodyPatch.monto_abonado = resCalc.monto_abonado;
          }
          delete bodyPatch.productos;
        }
        await models.Pedidos.update(req.params.id, buildPedidoUpdatePayload(pedido, bodyPatch));
        return res.json({ success: true, message: 'Pedido actualizado exitosamente' });
      }

      // Sin cambio de estado: solo permitir edición en Pendiente
      if (String(pedido.estado || '').trim() !== 'Pendiente') {
        return res.status(400).json({
          success: false,
          message: 'Solo se pueden editar campos del pedido cuando está en estado Pendiente',
        });
      }

      if (Array.isArray(req.body.productos)) {
        const resCalc = await handleUpdateProductosYTotal(req.params.id, req.body.productos, req.body.esquema_abono);
        if (resCalc) {
          req.body.total = resCalc.total;
          req.body.monto_abonado = resCalc.monto_abonado;
        }
      }
      const updateBody = { ...req.body };
      delete updateBody.productos;
      if (updateBody.fecha_entrega !== undefined) {
        const currentFeStr = formatDateToYMD(pedido.fecha_entrega);
        const newFeStr = String(updateBody.fecha_entrega).trim().split('T')[0];
        
        // Solo validar si la fecha de entrega cambió
        if (newFeStr !== currentFeStr) {
          const fechaEntregaError = validarFechaEntrega(
            updateBody.fecha_entrega,
            updateBody.fecha || pedido.fecha || fechaHoyColombia()
          );
          if (fechaEntregaError) {
            return res.status(400).json({ success: false, message: fechaEntregaError });
          }
        }
      }
      await models.Pedidos.update(req.params.id, buildPedidoUpdatePayload(pedido, updateBody));
      return res.json({ success: true, message: 'Pedido actualizado exitosamente' });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  delete: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
      if (!motivo || motivo.length < 10 || motivo.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'El motivo de eliminacion es obligatorio y debe tener entre 10 y 50 caracteres',
        });
      }
      await models.Pedidos.delete(req.params.id, { actor_id: req.user?.id || null, reason: motivo });
      return res.json({ success: true, message: 'Pedido eliminado exitosamente' });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  updateStatus: async (req, res) => {
    try {
      const denied = await assertOwnPedidoId(req, res, req.params.id);
      if (denied) return denied;

      const { estado, motivo } = req.body;
      if (!estado) {
        return res.status(400).json({ success: false, message: 'Estado es requerido' });
      }

      const estadosValidos = ['Pendiente', 'En Proceso', 'Completado', 'Cancelado'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ success: false, message: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` });
      }

      const pedidoActual = await models.Pedidos.getById(req.params.id);
      if (!pedidoActual) {
        return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
      }

      if (!canTransitionPedido(pedidoActual.estado, estado)) {
        return res.status(400).json({ 
          success: false, 
          message: `No se puede cambiar de ${pedidoActual.estado} a ${estado}` 
        });
      }

      if (estado === 'Completado') {
        const prodOrden = await pool.query(
          `SELECT id, estado FROM produccion WHERE pedido_id = $1 LIMIT 1`,
          [req.params.id]
        );
        const orden = prodOrden.rows[0];
        if (orden) {
          const estOrden = String(orden.estado || '').trim();
          if (estOrden !== 'Orden Lista') {
            return res.status(409).json({
              success: false,
              message:
                'No puede completar el pedido mientras la orden de producción no esté completada. Complete la orden de producción primero; el pedido pasará a Completado automáticamente.',
            });
          }
        }
      }

      // Si se cancela, motivo obligatorio (10-50)
      const datosActualizar = { estado };
      if (estado === 'Cancelado') {
        const motivoLimpio = typeof motivo === 'string' ? motivo.trim() : '';
        if (!motivoLimpio || motivoLimpio.length < 10 || motivoLimpio.length > 50) {
          return res.status(400).json({
            success: false,
            message: 'El motivo de cancelación es obligatorio y debe tener entre 10 y 50 caracteres',
          });
        }
        datosActualizar.detalles = `${pedidoActual.detalles || ''} [CANCELADO: ${motivoLimpio}]`.trim();
      }

      await models.Pedidos.update(req.params.id, buildPedidoUpdatePayload(pedidoActual, datosActualizar));
      return res.json({ success: true, message: 'Estado actualizado exitosamente' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  uploadComprobante: async (req, res) => {
    try {
      if (!isClienteUser(req)) {
        return res.status(403).json({
          success: false,
          message: 'Solo el cliente autenticado puede subir comprobantes de transferencia.',
        });
      }
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Seleccione la captura del comprobante de consignación (JPG, PNG o WEBP).',
        });
      }

      const uploadsDir = appConfig.uploads.comprobantesDir;
      fs.mkdirSync(uploadsDir, { recursive: true });

      const extension = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
      const own = getOwnClienteId(req);
      const filename = `comprobante_${own || 'cliente'}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${extension}`;
      const absolutePath = path.join(uploadsDir, filename);
      const relativeUrl = `/uploads/comprobantes/${filename}`;

      fs.writeFileSync(absolutePath, req.file.buffer);

      return res.json({
        success: true,
        message: 'Comprobante cargado correctamente.',
        data: { comprobante_url: relativeUrl },
      });
    } catch (error) {
      console.error('Error al subir comprobante de pedido', error?.message || error);
      const message =
        error?.code === 'EACCES' || error?.code === 'EROFS'
          ? 'No se pudo escribir el comprobante en el servidor. Revise permisos o UPLOADS_ROOT en Elastic Beanstalk.'
          : error.message || 'No fue posible guardar el comprobante.';
      return res.status(error.statusCode || 500).json({
        success: false,
        message,
      });
    }
  },
};
