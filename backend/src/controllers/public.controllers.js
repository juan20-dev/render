// Rewire: el modelo Productos viene de archivos modulares.
// entities.models.js queda como archivo intacto pero desconectado (sin importadores).
const models = {
  Productos: require('../models/compras/productos'),
};

const DESC_MAX = 2000;

function truncateDescription(text) {
  if (text == null || text === '') return '';
  const s = String(text);
  if (s.length <= DESC_MAX) return s;
  return `${s.slice(0, DESC_MAX)}…`;
}

exports.getCatalogo = async (_req, res) => {
  try {
    const raw = await models.Productos.getPublicCatalog();
    const productos = (raw.productos || []).map((row) => ({
      id: row.id,
      nombre: row.nombre,
      descripcion: truncateDescription(row.descripcion),
      precio: row.precio != null ? Number(row.precio) : 0,
      stock: row.stock != null ? Number(row.stock) : 0,
      tipo_producto: row.tipo_producto || 'terminado',
      imagen_url: row.imagen_url || '',
      categoria: row.categoria || '',
    }));
    const categorias = (raw.categorias || []).map((row) => ({
      id: row.id,
      nombre: row.nombre,
    }));
    res.json({ success: true, data: { productos, categorias } });
  } catch (err) {
    console.error('public.getCatalogo', err);
    res.status(500).json({ success: false, message: err.message || 'Error al cargar el catálogo' });
  }
};
