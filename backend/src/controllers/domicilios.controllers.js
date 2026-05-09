const models = require('../models/entities.models');
const {
  isClienteUser,
  assertOwnClienteParam,
  assertOwnDomicilioId,
  assertOwnPedidoId,
} = require('../utils/selfServiceAccess');

const normalizeEstado = (value) => String(value || '').trim().toLowerCase();

const buildVentaNumber = () => `VEN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const ensureVentaForDeliveredDomicilio = async (domicilioId) => {
  try {
    const domicilio = await models.Domicilios.getById(domicilioId);
    if (!domicilio) return;
    if (normalizeEstado(domicilio.estado) !== 'entregado') return;

    const pedido = await models.Pedidos.getById(domicilio.pedido_id);
    if (!pedido) return;

    const ventaExistente = await models.Ventas.getByPedido(domicilio.pedido_id);

    /*
     * Liquidacion del abono al entregar: no se crea un segundo abono por el mismo pedido.
     * Se actualiza el abono mas antiguo del pedido (el creado al registrar el pedido con 50%)
     * al monto total y 100%, y se eliminan filas duplicadas del mismo pedido.
     */
    try {
      const abonosRaw = await models.Abonos.getByPedido(pedido.id);
      const totalPedido = Number(pedido.total || 0);
      const lista = [...(Array.isArray(abonosRaw) ? abonosRaw : [])].sort((a, b) => Number(a.id) - Number(b.id));
      const isCancelado = (s) => String(s || '').trim().toLowerCase().includes('cancel');
      const activos = lista.filter((a) => !isCancelado(a.estado));
      const principal = activos[0] || lista[0] || null;

      if (principal && totalPedido > 0) {
        const montoPrevio = Number(principal.monto || 0);
        const faltante = Math.max(0, Math.round(totalPedido - montoPrevio));
        const fechaHoy = new Date().toISOString().split('T')[0];
        const fechaPrev = principal.fecha ? String(principal.fecha).split('T')[0] : 'sin fecha';
        const metodoPrev = principal.metodo_pago || 'no especificado';

        const partes = [];
        partes.push(
          `Abono inicial: $${montoPrevio.toLocaleString('es-CO')} (${
            totalPedido > 0 ? Math.round((montoPrevio * 100) / totalPedido) : 0
          }%) - ${fechaPrev} - ${metodoPrev}`
        );
        if (faltante > 0) {
          partes.push(
            `Liquidacion contraentrega: $${faltante.toLocaleString('es-CO')} (${
              totalPedido > 0 ? Math.round((faltante * 100) / totalPedido) : 0
            }%) - ${fechaHoy} - Contraentrega`
          );
        } else {
          partes.push(`Liquidacion contraentrega: $0 - pedido ya saldado al ${fechaHoy}`);
        }
        partes.push(
          `Total liquidado: $${Math.round(totalPedido).toLocaleString('es-CO')} (100%) - cierre el ${fechaHoy}`
        );
        const detalleCombinado = partes.join(' | ');

        try {
          await models.Abonos.updateLiquidacion(principal.id, {
            monto: Math.round(totalPedido),
            detalle: detalleCombinado,
            estado: 'Finalizado',
            porcentaje_abonado: 100,
          });
        } catch (e) {
          // continuar sin bloquear
        }

        for (const a of lista) {
          if (Number(a.id) === Number(principal.id)) continue;
          try {
            await models.Abonos.delete(a.id);
          } catch (e) {
            // continuar
          }
        }
      } else if (totalPedido > 0 && lista.length === 0) {
        const fechaHoy = new Date().toISOString().split('T')[0];
        const numero_abono = `ABO-${Date.now()}`;
        await models.Abonos.create({
          numero_abono,
          pedido_id: pedido.id,
          cliente_id: pedido.cliente_id,
          monto: Math.round(totalPedido),
          fecha: fechaHoy,
          metodo_pago: 'Contraentrega',
          estado: 'Finalizado',
          porcentaje_abonado: 100,
          detalle: `Liquidacion total a contraentrega: $${Math.round(totalPedido).toLocaleString(
            'es-CO'
          )} (100%) - ${fechaHoy} - Contraentrega`,
        });
      }

      try {
        await models.Pedidos.update(pedido.id, {
          esquema_abono: '100%',
          monto_abonado: Math.round(totalPedido),
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
      numero_venta: buildVentaNumber(),
      tipo: 'Por Pedido',
      cliente_id: pedido.cliente_id,
      pedido_id: pedido.id,
      fecha: new Date().toISOString().split('T')[0],
      metodopago: 'Contraentrega',
      total: Number(pedido.total || 0),
      estado: 'Completada',
    });

    const detalles = await models.Pedidos.getDetalles(pedido.id);
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

module.exports = {
  getAll: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      const domicilios = await models.Domicilios.getAll();
      return res.json({ success: true, data: domicilios });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  getByCliente: async (req, res) => {
    try {
      const denied = assertOwnClienteParam(req, res, req.params.clienteId);
      if (denied) return denied;

      const domicilios = await models.Domicilios.getByCliente(req.params.clienteId);
      return res.json({ success: true, data: domicilios });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const denied = await assertOwnDomicilioId(req, res, req.params.id);
      if (denied) return denied;

      const domicilio = await models.Domicilios.getById(req.params.id);
      if (!domicilio) return res.status(404).json({ success: false, message: 'Domicilio no encontrado' });
      return res.json({ success: true, data: domicilio });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  getByPedido: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        const denied = await assertOwnPedidoId(req, res, req.params.pedidoId);
        if (denied) return denied;
      }
      const domicilio = await models.Domicilios.getByPedido(req.params.pedidoId);
      return res.json({ success: true, data: domicilio });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
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
      if (!Number.isFinite(pedido_id) || pedido_id <= 0) {
        return res.status(400).json({ success: false, message: 'pedido_id es requerido y debe ser válido' });
      }

      const repIdRaw = b.repartidor_id ?? b.repartidorId;
      const repartidor_id =
        repIdRaw !== undefined && repIdRaw !== null && String(repIdRaw).trim() !== ''
          ? Number(repIdRaw)
          : null;
      if (repartidor_id === null || !Number.isFinite(repartidor_id) || repartidor_id <= 0) {
        return res.status(400).json({ success: false, message: 'repartidor_id es requerido' });
      }

      const [repartidorUsuario, pedidoRow] = await Promise.all([
        models.Usuarios.getById(repartidor_id),
        models.Pedidos.getById(pedido_id),
      ]);
      if (!repartidorUsuario) {
        return res.status(400).json({ success: false, message: 'Repartidor no encontrado' });
      }
      if (!pedidoRow) {
        return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
      }

      // Siempre tomar cliente del pedido en BD (evita desajustes con la lista del frontend)
      const cliente_id = Number(pedidoRow.cliente_id);
      if (!Number.isFinite(cliente_id) || cliente_id <= 0) {
        return res.status(400).json({
          success: false,
          message: 'El pedido no tiene un cliente válido asociado',
        });
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

      const numeroRaw =
        (typeof b.numero_domicilio === 'string' && b.numero_domicilio.trim()) ||
        (typeof b.numeroDomicilio === 'string' && b.numeroDomicilio.trim()) ||
        `DOM-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const numero = String(numeroRaw).slice(0, 50);

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
        numero_domicilio: numero,
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

      const id = await models.Domicilios.create(payload);
      return res.status(201).json({ success: true, id, message: 'Domicilio creado exitosamente' });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      await models.Domicilios.update(req.params.id, req.body);
      await ensureVentaForDeliveredDomicilio(req.params.id);
      return res.json({ success: true, message: 'Domicilio actualizado exitosamente' });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  updateStatus: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }

      const estado = typeof req.body?.estado === 'string' ? req.body.estado.trim() : '';
      const motivo = typeof req.body?.motivo_cancelacion === 'string' ? req.body.motivo_cancelacion.trim() : '';
      if (!['Pendiente', 'En Camino', 'Entregado', 'Cancelado'].includes(estado)) {
        return res.status(400).json({
          success: false,
          message: 'Estado invalido. Valores permitidos: Pendiente, En Camino, Entregado, Cancelado',
        });
      }

      if (estado === 'Cancelado' && (!motivo || motivo.length < 10 || motivo.length > 50)) {
        return res.status(400).json({
          success: false,
          message: 'El motivo de cancelación es obligatorio y debe tener entre 10 y 50 caracteres',
        });
      }

      await models.Domicilios.update(req.params.id, {
        estado,
        motivo_cancelacion: estado === 'Cancelado' ? motivo : undefined,
      });
      await ensureVentaForDeliveredDomicilio(req.params.id);
      return res.json({ success: true, message: 'Estado del domicilio actualizado correctamente' });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  delete: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }
      await models.Domicilios.delete(req.params.id);
      return res.json({ success: true, message: 'Domicilio eliminado exitosamente' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
};
