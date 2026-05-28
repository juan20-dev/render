// Rewire: el modelo Abonos, Clientes, Domicilios, Pedidos, Usuarios, Ventas viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const models = {
  Abonos: require('../models/ventas/abonos'),
  Clientes: require('../models/ventas/clientes'),
  Domicilios: require('../models/ventas/domicilios'),
  Pedidos: require('../models/ventas/pedidos'),
  Usuarios: require('../models/usuarios/usuarios'),
  Ventas: require('../models/ventas/ventas'),
};
const {
  isClienteUser,
  assertOwnClienteParam,
  assertOwnDomicilioId,
  assertOwnPedidoId,
} = require('../utils/selfServiceAccess');
const { asyncHandler } = require('../utils/asyncHandler');
const { AppError } = require('../utils/AppError');

const isRepartidorUser = (req) => String(req.user?.rol || '').trim().toLowerCase() === 'repartidor';

/** Repartidor solo accede a domicilios donde es repartidor_id asignado. */
const assertRepartidorOwnsDomicilio = (req, domicilio) => {
  if (!isRepartidorUser(req)) return;
  if (!domicilio || Number(domicilio.repartidor_id) !== Number(req.user.id)) {
    throw AppError.forbidden();
  }
};

const throwIfModelError = (error) => {
  if (error?.statusCode) {
    throw new AppError(error.message, error.statusCode, 'BUSINESS_RULE', error.details);
  }
  throw error;
};

const normalizeEstado = (value) => String(value || '').trim().toLowerCase();

const ensureVentaForDeliveredDomicilio = async (domicilioId) => {
  try {
    const domicilio = await models.Domicilios.getById(domicilioId);
    if (!domicilio) return;
    const domicilioEstado = normalizeEstado(domicilio.estado);
    if (!['entregado', 'cancelado'].includes(domicilioEstado)) return;

    const pedido = await models.Pedidos.getById(domicilio.pedido_id);
    if (!pedido) return;

    const ventaExistente = await models.Ventas.getByPedido(domicilio.pedido_id);
    const pedidoTotal = Number(pedido.total || 0);
    const pedidoId = Number(pedido.id);

    if (domicilioEstado === 'cancelado') {
      if (String(pedido.estado || '').trim() !== 'Cancelado') {
        await models.Pedidos.update(pedidoId, {
          numero_pedido: pedido.numero_pedido,
          fecha: pedido.fecha,
          fecha_entrega: pedido.fecha_entrega,
          detalles: pedido.detalles,
          direccion: pedido.direccion,
          telefono: pedido.telefono,
          total: pedido.total,
          metodo_pago: pedido.metodo_pago,
          esquema_abono: pedido.esquema_abono,
          monto_abonado: pedido.monto_abonado,
          estado: 'Cancelado',
        });
      }
      if (ventaExistente?.id) {
        const ventaActual = await models.Ventas.getById(ventaExistente.id);
        if (ventaActual && String(ventaActual.estado || '').trim() === 'Pendiente') {
          await models.Ventas.update(ventaExistente.id, { estado: 'Cancelada' });
        }
      }
      const abonosRaw = await models.Abonos.getByPedido(pedidoId);
      for (const abono of Array.isArray(abonosRaw) ? abonosRaw : []) {
        const estadoAbono = String(abono.estado || '').trim();
        if (estadoAbono === 'Registrado' || estadoAbono === 'Verificado' || estadoAbono === 'Aplicado') {
          await models.Abonos.updateEstado(abono.id, 'Cancelado');
        }
      }
      return;
    }

    if (String(pedido.estado || '').trim() !== 'Completado') {
      await models.Pedidos.update(pedidoId, {
        numero_pedido: pedido.numero_pedido,
        fecha: pedido.fecha,
        fecha_entrega: pedido.fecha_entrega,
        detalles: pedido.detalles,
        direccion: pedido.direccion,
        telefono: pedido.telefono,
        total: pedido.total,
        metodo_pago: pedido.metodo_pago,
        esquema_abono: pedido.esquema_abono,
        monto_abonado: pedido.monto_abonado,
        estado: 'Completado',
      });
    }

    try {
      const abonosRaw = await models.Abonos.getByPedido(pedido.id);
      const lista = [...(Array.isArray(abonosRaw) ? abonosRaw : [])].sort((a, b) => Number(a.id) - Number(b.id));
      const isCancelado = (s) => String(s || '').trim().toLowerCase().includes('cancel');
      const activos = lista.filter((a) => !isCancelado(a.estado));
      const principal = activos[0] || lista[0] || null;

      if (principal && pedidoTotal > 0) {
        const montoPrevio = Number(principal.monto || 0);
        const faltante = Math.max(0, Math.round(pedidoTotal - montoPrevio));
        const fechaHoy = new Date().toISOString().split('T')[0];
        const fechaPrev = principal.fecha ? String(principal.fecha).split('T')[0] : 'sin fecha';
        const metodoPrev = principal.metodo_pago || 'no especificado';

        const partes = [];
        partes.push(
          `Abono inicial: $${montoPrevio.toLocaleString('es-CO')} (${
            pedidoTotal > 0 ? Math.round((montoPrevio * 100) / pedidoTotal) : 0
          }%) - ${fechaPrev} - ${metodoPrev}`
        );
        if (faltante > 0) {
          partes.push(
            `Liquidacion contraentrega: $${faltante.toLocaleString('es-CO')} (${
              pedidoTotal > 0 ? Math.round((faltante * 100) / pedidoTotal) : 0
            }%) - ${fechaHoy} - Contraentrega`
          );
        } else {
          partes.push(`Liquidacion contraentrega: $0 - pedido ya saldado al ${fechaHoy}`);
        }
        partes.push(
          `Total liquidado: $${Math.round(pedidoTotal).toLocaleString('es-CO')} (100%) - cierre el ${fechaHoy}`
        );
        const detalleCombinado = partes.join(' | ');

        try {
          await models.Abonos.updateLiquidacion(principal.id, {
            monto: Math.round(pedidoTotal),
            detalle: detalleCombinado,
            estado: 'Finalizado',
            porcentaje_abonado: 100,
          });
        } catch (e) {
          // continuar sin bloquear
        }

        for (const a of lista) {
          if (Number(a.id) === Number(principal.id)) continue;
          await models.Abonos.updateEstado(a.id, 'Cancelado');
        }
      } else if (pedidoTotal > 0 && lista.length === 0) {
        const fechaHoy = new Date().toISOString().split('T')[0];
        await models.Abonos.create({
          pedido_id: pedidoId,
          cliente_id: pedido.cliente_id,
          monto: Math.round(pedidoTotal),
          fecha: fechaHoy,
          metodo_pago: 'Contraentrega',
          estado: 'Finalizado',
          porcentaje_abonado: 100,
          detalle: `Liquidacion total a contraentrega: $${Math.round(pedidoTotal).toLocaleString(
            'es-CO'
          )} (100%) - ${fechaHoy} - Contraentrega`,
        });
      }

      try {
        await models.Pedidos.update(pedido.id, {
          numero_pedido: pedido.numero_pedido,
          fecha: pedido.fecha,
          fecha_entrega: pedido.fecha_entrega,
          detalles: pedido.detalles,
          direccion: pedido.direccion,
          telefono: pedido.telefono,
          esquema_abono: '100%',
          monto_abonado: Math.round(pedidoTotal),
          estado: 'Completado',
        });
      } catch (e) {
        // ignore
      }
    } catch (e) {
      // no bloquear flujo
    }

    if (ventaExistente?.id) {
      try {
        const ventaActual = await models.Ventas.getById(ventaExistente.id);
        if (ventaActual && !['Completada', 'Cancelada'].includes(String(ventaActual.estado || ''))) {
          await models.Ventas.update(ventaExistente.id, { estado: 'Completada' });
        }
      } catch (e) {
        // ignorar errores
      }
      return;
    }

    // Crear venta por pedido y marcarla como Completada
    const ventaId = await models.Ventas.create({
      tipo: 'Por Pedido',
      cliente_id: pedido.cliente_id,
      pedido_id: pedidoId,
      fecha: new Date().toISOString().split('T')[0],
      metodopago: 'Contraentrega',
      total: pedidoTotal,
      estado: 'Completada',
    });

    const detalles = await models.Pedidos.getDetalles(pedidoId);
    await Promise.all(
      (Array.isArray(detalles) ? detalles : []).map((item) =>
        models.Ventas.addDetalle(
          ventaId,
          Number(item.producto_id),
          Number(item.cantidad || 0),
          Number(item.precio_unitario || 0)
        )
      )
    );
  } catch (error) {
    console.error('Error creando venta automática desde domicilio entregado:', error.message);
    // No lanzar error para no afectar el flujo del domicilio
  }
};

exports.getAll = asyncHandler(async (req, res) => {
  if (isClienteUser(req)) throw AppError.forbidden();
  const rid = isRepartidorUser(req) ? req.user.id : null;
  const domicilios = await models.Domicilios.getAll(rid ? { repartidorUserId: rid } : {});
  res.json({ success: true, data: domicilios });
});

exports.getByCliente = asyncHandler(async (req, res) => {
  const denied = assertOwnClienteParam(req, res, req.params.clienteId);
  if (denied) return denied;
  const domicilios = await models.Domicilios.getByCliente(req.params.clienteId);
  res.json({ success: true, data: domicilios });
});

exports.getById = asyncHandler(async (req, res) => {
  const denied = await assertOwnDomicilioId(req, res, req.params.id);
  if (denied) return denied;

  const domicilio = await models.Domicilios.getById(req.params.id);
  if (!domicilio) throw AppError.notFound('Domicilio no encontrado');
  assertRepartidorOwnsDomicilio(req, domicilio);
  res.json({ success: true, data: domicilio });
});

exports.getByPedido = asyncHandler(async (req, res) => {
  if (isClienteUser(req)) {
    const denied = await assertOwnPedidoId(req, res, req.params.pedidoId);
    if (denied) return denied;
  }
  const domicilio = await models.Domicilios.getByPedido(req.params.pedidoId);
  res.json({ success: true, data: domicilio });
});

exports.create = asyncHandler(async (req, res) => {
  if (isClienteUser(req) || isRepartidorUser(req)) throw AppError.forbidden();

  const b = req.body || {};

      let direccionFromBody = b.direccion;
      if (direccionFromBody !== undefined && direccionFromBody !== null && typeof direccionFromBody === 'object') {
        try {
          direccionFromBody = JSON.stringify(direccionFromBody);
        } catch {
          direccionFromBody = null;
        }
      }
      if (direccionFromBody !== undefined && direccionFromBody !== null && String(direccionFromBody).trim() !== '') {
        direccionFromBody = String(direccionFromBody).trim();
      } else {
        direccionFromBody = null;
      }

      let fechaFromBody = b.fecha;
      if (fechaFromBody && String(fechaFromBody).trim()) {
        fechaFromBody = String(fechaFromBody).trim().split('T')[0];
      } else {
        fechaFromBody = null;
      }

  const pedido_id = Number(b.pedido_id ?? b.pedidoId);
  const repartidor_id = Number(b.repartidor_id ?? b.repartidorId);

  const [repartidorUsuario, pedidoRow] = await Promise.all([
    models.Usuarios.getById(repartidor_id),
    models.Pedidos.getById(pedido_id),
  ]);
  if (!repartidorUsuario) throw AppError.badRequest('Repartidor no encontrado');
  if (!pedidoRow) throw AppError.notFound('Pedido no encontrado');

  const cliente_id = Number(pedidoRow.cliente_id);
  if (!Number.isFinite(cliente_id) || cliente_id <= 0) {
    throw AppError.badRequest('El pedido no tiene un cliente válido asociado');
  }

      let direccion = direccionFromBody;
      if (!direccion) {
        const det = pedidoRow.detalles;
        if (det && String(det).trim()) {
          direccion = String(det).trim();
        }
      }
      if (!direccion) {
        try {
          const cli = await models.Clientes.getById(cliente_id);
          if (cli && cli.direccion && String(cli.direccion).trim()) {
            direccion = String(cli.direccion).trim();
          }
        } catch {
          /* ignorar */
        }
      }
      if (!direccion) {
        direccion = 'Sin dirección registrada';
      }

      let fecha = fechaFromBody;
      if (!fecha) {
        const fe = pedidoRow.fecha_entrega || pedidoRow.fecha;
        if (fe && String(fe).trim()) {
          fecha = String(fe).trim().split('T')[0];
        }
      }
      if (!fecha) {
        fecha = new Date().toISOString().split('T')[0];
      }

      let repartidorNombre =
        b.repartidor !== undefined && b.repartidor !== null && String(b.repartidor).trim() !== ''
          ? String(b.repartidor).trim()
          : `${repartidorUsuario.nombre || ''} ${repartidorUsuario.apellido || ''}`.trim() || null;
      if (repartidorNombre) {
        repartidorNombre = repartidorNombre.slice(0, 100);
      }

      const estadoAllow = ['Pendiente', 'En Camino', 'Entregado', 'Cancelado'];
      const estRaw = String(b.estado || 'Pendiente').trim();
      const estadoNorm =
        estadoAllow.find((x) => x.toLowerCase() === estRaw.toLowerCase()) || 'Pendiente';

      let horaVal = b.hora ?? null;
      if (horaVal === '' || horaVal === undefined) horaVal = null;

      const payload = {
        pedido_id,
        cliente_id,
        direccion,
        repartidor: repartidorNombre,
        repartidor_id,
        fecha,
        hora: horaVal,
        estado: estadoNorm,
        detalle: b.detalle != null && String(b.detalle).trim() !== '' ? String(b.detalle).trim() : null,
      };

  try {
    const id = await models.Domicilios.create(payload);
    res.status(201).json({ success: true, id, message: 'Domicilio creado exitosamente' });
  } catch (error) {
    throwIfModelError(error);
  }
});

exports.update = asyncHandler(async (req, res) => {
  if (isClienteUser(req)) throw AppError.forbidden();
  const dom = await models.Domicilios.getById(req.params.id);
  assertRepartidorOwnsDomicilio(req, dom);
  try {
    await models.Domicilios.update(req.params.id, req.body);
    await ensureVentaForDeliveredDomicilio(req.params.id);
    res.json({ success: true, message: 'Domicilio actualizado exitosamente' });
  } catch (error) {
    throwIfModelError(error);
  }
});

exports.updateStatus = asyncHandler(async (req, res) => {
  if (isClienteUser(req)) throw AppError.forbidden();

  const dom = await models.Domicilios.getById(req.params.id);
  assertRepartidorOwnsDomicilio(req, dom);

  const { estado } = req.body;
  const motivo = String(req.body.motivo_cancelacion ?? req.body.motivoCancelacion ?? '').trim();

  try {
    await models.Domicilios.update(req.params.id, {
      estado,
      motivo_cancelacion: estado === 'Cancelado' ? motivo : undefined,
    });
    await ensureVentaForDeliveredDomicilio(req.params.id);
    res.json({ success: true, message: 'Estado del domicilio actualizado correctamente' });
  } catch (error) {
    throwIfModelError(error);
  }
});

exports.delete = asyncHandler(async (req, res) => {
  if (isClienteUser(req)) throw AppError.forbidden();
  const dom = await models.Domicilios.getById(req.params.id);
  assertRepartidorOwnsDomicilio(req, dom);
  const motivo = String(req.body?.motivo || '').trim();
  if (!motivo || motivo.length < 10 || motivo.length > 50) {
    throw AppError.badRequest('El motivo de eliminacion es obligatorio y debe tener entre 10 y 50 caracteres');
  }
  await models.Domicilios.delete(req.params.id, { reason: motivo, actor_id: req.user?.id || null });
  res.json({ success: true, message: 'Domicilio eliminado exitosamente' });
});
