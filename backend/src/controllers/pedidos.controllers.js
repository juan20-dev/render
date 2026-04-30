const models = require('../models/entities.models');
const {
  isClienteUser,
  getOwnClienteId,
  assertOwnClienteParam,
  assertOwnPedidoId,
} = require('../utils/selfServiceAccess');

const normalizeEstado = (value) => String(value || '').trim().toLowerCase();

const buildDomicilioNumber = () => `DOM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const ensureDomicilioForCompletedPedido = async (pedidoId) => {
  const pedido = await models.Pedidos.getById(pedidoId);
  if (!pedido) return;

  if (normalizeEstado(pedido.estado) !== 'completado') return;

  const existing = await models.Domicilios.getByPedido(pedidoId);
  if (existing?.id) return;

  await models.Domicilios.create({
    numero_domicilio: buildDomicilioNumber(),
    pedido_id: Number(pedido.id),
    cliente_id: Number(pedido.cliente_id),
    direccion: pedido.detalles || 'Sin direccion registrada en el pedido',
    repartidor: null,
    fecha: pedido.fecha_entrega || new Date().toISOString().split('T')[0],
    hora: null,
    estado: 'Pendiente',
    detalle: `Domicilio autogenerado desde pedido ${pedido.numero_pedido || `PED-${pedido.id}`}`,
  });
};

module.exports = {
  getAll: async (req, res) => {
    try {
      if (isClienteUser(req)) {
        const own = getOwnClienteId(req);
        if (!own) {
          return res.status(403).json({ success: false, message: 'Perfil cliente no vinculado' });
        }
        const pedidos = await models.Pedidos.getByCliente(own);
        return res.json({ success: true, data: pedidos });
      }
      const pedidos = await models.Pedidos.getAll();
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
      const detalles = await models.Pedidos.getDetalles(req.params.id);
      return res.json({ success: true, data: { ...pedido, detalles } });
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
      const id = await models.Pedidos.create(body);
      await ensureDomicilioForCompletedPedido(id);
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

      // CLIENTE: Solo puede editar fecha_entrega y detalles si está en Pendiente o En Proceso
      if (isClienteUser(req)) {
        const estado = String(pedido?.estado || '');
        if (estado !== 'Pendiente' && estado !== 'En Proceso') {
          return res.status(403).json({
            success: false,
            message: 'Solo puedes editar pedidos en estado Pendiente o En Proceso',
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
            message: `Transición no permitida: ${estadoActual} → ${estadoNuevo}`,
            permitidas: transiciones[estadoActual] || []
          });
        }

        // ASESOR: Puede cambiar estado, pero sin editar otros campos
        if (rol === 'Asesor') {
          const merged = {
            numero_pedido: pedido.numero_pedido,
            fecha: pedido.fecha,
            fecha_entrega: pedido.fecha_entrega,
            detalles: pedido.detalles,
            total: pedido.total,
            estado: estadoNuevo, // Solo cambiar estado
          };
          await models.Pedidos.update(req.params.id, merged);
          
          // Si el estado nuevo es Completado, crear domicilio automáticamente
          if (estadoNuevo === 'Completado' && estadoActual !== 'Completado') {
            await ensureDomicilioForCompletedPedido(req.params.id);
          }
          
          return res.json({ success: true, message: 'Pedido actualizado exitosamente' });
        }

        // ADMIN: Puede cambiar todo
        await models.Pedidos.update(req.params.id, req.body);
        
        // Si el estado nuevo es Completado, crear domicilio automáticamente
        if (estadoNuevo === 'Completado' && estadoActual !== 'Completado') {
          await ensureDomicilioForCompletedPedido(req.params.id);
        }
        
        return res.json({ success: true, message: 'Pedido actualizado exitosamente' });
      }

      // Sin cambio de estado: actualizar como antes
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

      // Si se cancela, guardar motivo si se proporciona
      const datosActualizar = { estado };
      if (estado === 'Cancelado' && motivo) {
        datosActualizar.detalles = `${pedidoActual.detalles || ''} [CANCELADO: ${motivo}]`.trim();
      }

      await models.Pedidos.update(req.params.id, datosActualizar);
      
      // Si se completa, crear automáticamente domicilio
      if (estado === 'Completado') {
        await ensureDomicilioForCompletedPedido(req.params.id);
      }

      return res.json({ success: true, message: 'Estado actualizado exitosamente' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  },
};
