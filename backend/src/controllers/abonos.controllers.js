// Rewire: el modelo Abonos, Pedidos viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const models = {
  Abonos: require('../models/ventas/abonos'),
  Pedidos: require('../models/ventas/pedidos'),
};
const { normalizeAbonoPayload, parseMoneyCO, normalizeMetodoPago } = require('./normalizador-http');

module.exports = {
  getAll: async (req, res) => {
    try {
      const abonos = await models.Abonos.getAll();
      res.json({ success: true, data: abonos });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getById: async (req, res) => {
    try {
      const abono = await models.Abonos.getById(req.params.id);
      if (!abono) return res.status(404).json({ success: false, message: 'Abono no encontrado' });
      res.json({ success: true, data: abono });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  getByPedido: async (req, res) => {
    try {
      const abonos = await models.Abonos.getByPedido(req.params.pedidoId);
      res.json({ success: true, data: abonos });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  create: async (req, res) => {
    try {
      const normalized = normalizeAbonoPayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      const payload = normalized.data;
      const pedidoId = Number(payload.pedido_id ?? payload.pedidoId);
      if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
        return res.status(400).json({ success: false, message: 'pedido_id es requerido' });
      }

      const monto = parseMoneyCO(payload.monto);
      if (monto === undefined || monto <= 0) {
        return res.status(400).json({
          success: false,
          message: 'monto inválido. Indique un valor mayor a 0 (número o formato COP, ej. 2500000 o 2.500.000).',
        });
      }

      const fecha = payload.fecha;
      if (!fecha || !String(fecha).trim()) {
        return res.status(400).json({ success: false, message: 'fecha es requerida' });
      }

      const pedido = await models.Pedidos.getById(pedidoId);
      if (!pedido) {
        return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
      }

      const clienteId = Number(pedido.cliente_id);
      if (!Number.isFinite(clienteId) || clienteId <= 0) {
        return res.status(400).json({ success: false, message: 'El pedido no tiene un cliente válido' });
      }

      const metodoNorm = normalizeMetodoPago(payload.metodo_pago);
      const metodo_pago = metodoNorm || 'Efectivo';
      const id = await models.Abonos.create({
        pedido_id: pedidoId,
        cliente_id: clienteId,
        monto,
        fecha: String(fecha).trim().split('T')[0],
        metodo_pago,
        estado: payload.estado || 'Registrado',
      });

      res.status(201).json({ success: true, id, message: 'Abono creado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  update: async (req, res) => {
    try {
      const normalized = normalizeAbonoPayload(req.body);
      if (normalized.error) {
        return res.status(400).json({ success: false, message: normalized.error });
      }

      await models.Abonos.update(req.params.id, normalized.data);
      res.json({ success: true, message: 'Abono actualizado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  delete: async (req, res) => {
    try {
      const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
      if (!motivo || motivo.length < 10 || motivo.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'El motivo de eliminacion es obligatorio y debe tener entre 10 y 50 caracteres',
        });
      }
      await models.Abonos.delete(req.params.id, { reason: motivo });
      res.json({ success: true, message: 'Abono eliminado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  },
  updateStatus: async (req, res) => {
    try {
      const { estado, motivo } = req.body;
      if (!estado) {
        return res.status(400).json({ success: false, message: 'Estado es requerido' });
      }

      const estadosDestinoValidos = ['Registrado', 'Verificado', 'Cancelado'];
      if (!estadosDestinoValidos.includes(estado)) {
        return res
          .status(400)
          .json({ success: false, message: `Estado inválido. Válidos: ${estadosDestinoValidos.join(', ')}` });
      }

      const abonoActual = await models.Abonos.getById(req.params.id);
      if (!abonoActual) {
        return res.status(404).json({ success: false, message: 'Abono no encontrado' });
      }

      const canon = (raw) => {
        const t = String(raw || '').trim().toLowerCase();
        if (t.includes('cancel')) return 'Cancelado';
        if (t.includes('finaliz')) return 'Finalizado';
        if (t.includes('aplic')) return 'Aplicado';
        if (t.includes('verif')) return 'Verificado';
        if (t.includes('registr')) return 'Registrado';
        return String(raw || '').trim();
      };

      const actual = canon(abonoActual.estado);
      const estadosOrigenReconocidos = ['Registrado', 'Verificado', 'Cancelado', 'Aplicado', 'Finalizado'];
      if (!estadosOrigenReconocidos.includes(actual)) {
        return res.status(400).json({
          success: false,
          message: `Estado actual del abono no reconocido: ${abonoActual.estado}`,
        });
      }

      // Validar transiciones de estado permitidas
      // Finalizado es estado de cierre automatico (tras entregar el domicilio): no se puede modificar manualmente.
      const transicionesPermitidas = {
        Registrado: ['Verificado', 'Cancelado'],
        Verificado: ['Cancelado'],
        Aplicado: ['Cancelado'],
        Cancelado: [],
        Finalizado: [],
      };

      if (!transicionesPermitidas[actual]?.includes(estado)) {
        return res.status(400).json({ 
          success: false, 
          message: `No se puede cambiar de ${actual} a ${estado}` 
        });
      }

      await models.Abonos.updateEstado(req.params.id, estado);
      return res.json({ success: true, message: 'Estado actualizado exitosamente' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
  }
};

