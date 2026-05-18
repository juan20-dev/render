// Rewire: el modelo Abonos, Pedidos viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
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

const normalizeEstado = (value) => String(value || '').trim().toLowerCase();

const buildDomicilioNumber = () => `DOM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

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
      return res.status(500).json({ success: false, message: error.message });
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

      // Si esquema es 50% crear registro inicial en abonos y actualizar monto_abonado en pedido
      try {
        const esquema = String(body.esquema_abono || '').trim() || '100%';
        if (esquema === '50%') {
          const pedidoRow = await models.Pedidos.getById(id);
          if (pedidoRow) {
            const clienteId = Number(pedidoRow.cliente_id);
            const total = Number(pedidoRow.total || 0);
            const monto = Math.round(total * 0.5);
            const numero_abono = `ABO-${Date.now()}`;
            await models.Abonos.create({
              numero_abono,
              pedido_id: id,
              cliente_id: clienteId,
              monto,
              fecha: new Date().toISOString().split('T')[0],
              metodo_pago: pedidoRow.metodo_pago || 'Efectivo',
              estado: 'Registrado',
              porcentaje_abonado: 50,
            });
            // actualizar monto_abonado en pedido
            await models.Pedidos.update(id, { monto_abonado: monto, esquema_abono: '50%' });
          }
        }
      } catch (e) {
        console.error('No se pudo crear abono inicial para pedido', id, e.message);
      }

      return res.status(201).json({ success: true, id, message: 'Pedido creado exitosamente' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
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

      // Definir transiciones permitidas de estado
      const transiciones = {
        'Pendiente': ['En Proceso', 'Completado', 'Cancelado'],
        'En Proceso': ['Completado', 'Cancelado', 'Pendiente'],
        'Completado': [], // Final
        'Cancelado': [] // Final
      };

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
        const merged = {
          numero_pedido: pedido.numero_pedido,
          fecha: pedido.fecha,
          fecha_entrega: allowed.fecha_entrega !== undefined ? allowed.fecha_entrega : pedido.fecha_entrega,
          detalles: allowed.detalles !== undefined ? allowed.detalles : pedido.detalles,
          total: pedido.total,
          estado: pedido.estado,
        };
        await models.Pedidos.update(req.params.id, merged);
        return res.json({ success: true, message: 'Pedido actualizado exitosamente' });
      }

      // ASESOR y ADMIN: Pueden cambiar estado si la transición es válida
      if (req.body.estado) {
        const estadoActual = String(pedido.estado || '').trim();
        const estadoNuevo = String(req.body.estado).trim();

        // Validar transición
        if (!transiciones[estadoActual]?.includes(estadoNuevo)) {
          return res.status(400).json({
            success: false,
            message: `Transición no permitida: ${estadoActual} ��� ${estadoNuevo}`,
            permitidas: transiciones[estadoActual] || []
          });
        }

        await models.Pedidos.update(req.params.id, { ...req.body, estado: estadoNuevo });
        return res.json({ success: true, message: 'Pedido actualizado exitosamente' });
      }

      // Sin cambio de estado: solo permitir edición en Pendiente
      if (String(pedido.estado || '').trim() !== 'Pendiente') {
        return res.status(400).json({
          success: false,
          message: 'Solo se pueden editar campos del pedido cuando está en estado Pendiente',
        });
      }

      await models.Pedidos.update(req.params.id, req.body);
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

      await models.Pedidos.delete(req.params.id);
      return res.json({ success: true, message: 'Pedido eliminado exitosamente' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
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

      // Validar transiciones de estado permitidas
      const transicionesPermitidas = {
        'Pendiente': ['En Proceso', 'Cancelado'],
        'En Proceso': ['Completado', 'Cancelado'],
        'Completado': [],
        'Cancelado': []
      };

      if (!transicionesPermitidas[pedidoActual.estado]?.includes(estado)) {
        return res.status(400).json({ 
          success: false, 
          message: `No se puede cambiar de ${pedidoActual.estado} a ${estado}` 
        });
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

      await models.Pedidos.update(req.params.id, datosActualizar);
      return res.json({ success: true, message: 'Estado actualizado exitosamente' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
};
