import type { ReactNode } from 'react';

export const LOGO_URL = '/favicon/apple-touch-icon.png';

export const LANDING_SCROLL_KEY = 'gl_scroll_to';

export const CONTACTO_DIRECCION = 'Calle 104 # 79D – 65';
export const CONTACTO_CIUDAD = 'Medellín, Laureles';
export const CONTACTO_MAPS_URL =
  'https://www.google.com/maps/search/?api=1&query=Calle+104+%2379D-65,+Medell%C3%ADn,+Laureles,+Antioquia,+Colombia';
export const CONTACTO_TELEFONO = '3246102339';
export const CONTACTO_TELEFONO_DISPLAY = '324 610 2339';
export const CONTACTO_EMAIL = 'info@grandmasliqueurs.com';

/** Llave para transferencia bancaria en checkout (tienda). */
export const CHECKOUT_CUENTA_TRANSFERENCIA = '0027437961';
/** QR de pago (archivo en public/qrs). */
export const CHECKOUT_QR_URL = '/qrs/qrs.jpeg';

export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  tipo: 'terminado' | 'de preparacion';
  precio: number;
  stock: number;
  imagen: string;
  descripcion: string;
}

export interface UserData {
  email: string;
  nombre: string;
  apellido: string;
  rol: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  telefono?: string;
  direccion?: string;
}

export interface LandingPageProps {
  onNavigateToLogin: () => void;
  onNavigateToRegister: () => void;
  onNavigateToNosotros: () => void;
  user?: UserData;
  onLogout?: () => void;
}

export interface CartItem {
  producto: Producto;
  cantidad: number;
}

export interface CheckoutData {
  direccion: string;
  telefono: string;
  observaciones: string;
  fechaEntrega: string;
}

export interface CheckoutTouched {
  direccion: boolean;
  telefono: boolean;
  fechaEntrega: boolean;
}

export interface PasswordData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface PedidoRecord {
  id: number;
  fecha?: string;
  fechaPedido?: string;
  createdAt?: string;
  created_at?: string;
  fechaEntrega?: string;
  direccion?: string;
  telefono?: string;
  estado?: string;
  total?: number;
  metodoPago?: string;
  porcentajeAbono?: number;
  montoAbonado?: number;
  montoPagado?: number;
  saldo?: number;
  productos?: Array<{
    productoId?: number;
    cantidad?: number;
    precio?: number;
    nombre?: string;
    producto?: {
      nombre?: string;
      precio?: number;
    };
  }>;
  domicilio?: {
    estado?: string;
  };
  [key: string]: unknown;
}

export interface LandingImage {
  url: string;
  titulo: string;
  subtitulo: string;
}

export interface FooterLink {
  label: string;
  action?: () => void;
  href?: string;
}

export interface ContactCard {
  title: string;
  icon: ReactNode;
  body: ReactNode;
}

export const IMAGENES_CARRUSEL: LandingImage[] = [
  {
    url: '/uploads/carousel/carousel_01.webp',
    titulo: 'Licores Premium',
    subtitulo: 'La mejor selección de bebidas en Medellín',
  },
  {
    url: '/uploads/carousel/carousel_02.webp',
    titulo: 'Rones Añejos',
    subtitulo: 'Calidad y tradición en cada botella',
  },
  {
    url: '/uploads/carousel/carousel_03.webp',
    titulo: 'Whiskies Importados',
    subtitulo: 'Experiencias únicas para paladares exigentes',
  },
  {
    url: '/uploads/carousel/carousel_04.webp',
    titulo: 'Vinos Selectos',
    subtitulo: 'De las mejores bodegas del mundo',
  },
  {
    url: '/uploads/carousel/carousel_05.webp',
    titulo: 'Tequilas y Mezcales',
    subtitulo: 'Agave auténtico en cada sorbo',
  },
  {
    url: '/uploads/carousel/carousel_06.webp',
    titulo: 'Coctelería Premium',
    subtitulo: 'Ingredientes para crear momentos únicos',
  },
];

export const GUEST_CART_STORAGE_KEY = 'grandmas_liquors_cart_guest';

export const getCartStorageKey = (user?: UserData) =>
  user?.email ? `grandmas_liquors_cart_${String(user.email).trim().toLowerCase()}` : GUEST_CART_STORAGE_KEY;

export const fechaMinimaEntregaColombia = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

export const fechaEntregaDefaultColombia = () => {
  const hoy = fechaMinimaEntregaColombia();
  const [y, m, d] = hoy.split('-').map(Number);
  const manana = new Date(Date.UTC(y, m - 1, d + 1));
  return manana.toISOString().split('T')[0];
};

export const buildCheckoutDefaults = (user?: UserData): CheckoutData => ({
  direccion: String(user?.direccion || '').trim(),
  telefono: String(user?.telefono || '').replace(/\D/g, '').slice(0, 10),
  observaciones: '',
  fechaEntrega: fechaEntregaDefaultColombia(),
});

export const createPasswordDefaults = (): PasswordData => ({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

export const imagenProductoFallback = '/uploads/productos/seed_01.webp';

export const mapCatalogProduct = (product: {
  id: number;
  nombre?: string;
  descripcion?: string;
  precio?: number;
  stock?: number;
  tipo_producto?: string;
  imagen_url?: string;
  categoria?: string;
}): Producto => {
  const imagenUrl = String(product.imagen_url || '').trim();
  const tipoRaw = String(product.tipo_producto || '').toLowerCase();
  return {
    id: String(product.id),
    nombre: product.nombre || '',
    categoria: product.categoria || 'Sin categoría',
    tipo: tipoRaw === 'preparacion' || tipoRaw.includes('prepar') ? 'de preparacion' : 'terminado',
    precio: Number(product.precio ?? 0),
    stock: Number(product.stock ?? 0),
    imagen: imagenUrl || imagenProductoFallback,
    descripcion: product.descripcion || '',
  };
};

export const normalizeCategorias = (categoriasApi: Array<{ nombre?: string }>) => [
  'Todos',
  ...categoriasApi
    .map((categoria) => categoria.nombre)
    .filter((nombre): nombre is string => Boolean(nombre)),
];

export const esProductoDePreparacion = (producto: Producto) => producto.tipo === 'de preparacion';

export const productoDisponibleParaPedido = (producto: Producto) =>
  esProductoDePreparacion(producto) || Number(producto.stock || 0) > 0;

export const getCartItemStockError = (item: CartItem) => {
  if (esProductoDePreparacion(item.producto)) {
    return '';
  }
  if (item.producto.stock <= 0) {
    return 'Este producto no está disponible en este momento.';
  }
  if (item.cantidad > item.producto.stock) {
    return 'La cantidad solicitada supera el stock disponible.';
  }
  return '';
};

export const getCartItemStockHelper = (_item: CartItem) => '';

export const calcularTotalCarrito = (carrito: CartItem[]) =>
  carrito.reduce((total, item) => total + item.producto.precio * item.cantidad, 0);

export const calcularCantidadItemsCarrito = (carrito: CartItem[]) =>
  carrito.reduce((total, item) => total + item.cantidad, 0);

export const filtrarProductos = (
  productos: Producto[],
  busqueda: string,
  categoriaSeleccionada: string
) =>
  productos.filter((producto) => {
    const query = busqueda.toLowerCase();
    const matchBusqueda =
      producto.nombre.toLowerCase().includes(query) ||
      producto.categoria.toLowerCase().includes(query);
    const matchCategoria =
      categoriaSeleccionada === 'Todos' || producto.categoria === categoriaSeleccionada;
    return matchBusqueda && matchCategoria;
  });

export const getCheckoutValidation = ({
  carrito,
  checkoutData,
  checkoutTouched,
  checkoutAttempted,
  comprobanteUrl,
  comprobanteUploading,
}: {
  carrito: CartItem[];
  checkoutData: CheckoutData;
  checkoutTouched: CheckoutTouched;
  checkoutAttempted: boolean;
  comprobanteUrl?: string;
  comprobanteUploading?: boolean;
}) => {
  const checkoutDireccion = checkoutData.direccion.trim();
  const checkoutTelefonoDigits = checkoutData.telefono.replace(/\D/g, '');
  const checkoutFechaEntrega = String(checkoutData.fechaEntrega || '').trim().split('T')[0];
  const hoyColombia = fechaMinimaEntregaColombia();
  const shouldShowDireccionError = checkoutTouched.direccion || checkoutAttempted;
  const shouldShowTelefonoError = checkoutTouched.telefono || checkoutAttempted;
  const shouldShowFechaEntregaError = checkoutTouched.fechaEntrega || checkoutAttempted;
  const checkoutDireccionError = !checkoutDireccion
    ? 'La dirección de entrega es obligatoria.'
    : checkoutDireccion.length < 8
      ? 'La dirección debe ser más detallada.'
      : '';
  const checkoutTelefonoError = !checkoutTelefonoDigits
    ? 'El teléfono de contacto es obligatorio.'
    : checkoutTelefonoDigits.length !== 10
      ? 'El teléfono de contacto debe tener exactamente 10 dígitos.'
      : '';
  const checkoutFechaEntregaError = !checkoutFechaEntrega
    ? 'La fecha de entrega es obligatoria.'
    : !/^\d{4}-\d{2}-\d{2}$/.test(checkoutFechaEntrega)
      ? 'La fecha de entrega no es válida.'
      : checkoutFechaEntrega < hoyColombia
        ? 'La fecha de entrega no puede ser una fecha pasada.'
        : '';
  const checkoutStockError = carrito.find((item) => Boolean(getCartItemStockError(item))) || null;
  const comprobanteOk = Boolean(String(comprobanteUrl || '').trim());
  const shouldShowComprobanteError = checkoutAttempted;
  const checkoutComprobanteError =
    comprobanteUploading
      ? 'Espere a que termine de cargar el comprobante.'
      : !comprobanteOk
        ? 'Adjunte la captura de pantalla del comprobante de consignación para confirmar el pedido.'
        : '';
  const checkoutValid =
    carrito.length > 0 &&
    !checkoutDireccionError &&
    !checkoutTelefonoError &&
    !checkoutFechaEntregaError &&
    !checkoutStockError &&
    comprobanteOk &&
    !comprobanteUploading;

  return {
    checkoutDireccion,
    checkoutTelefonoDigits,
    checkoutFechaEntrega,
    shouldShowDireccionError,
    shouldShowTelefonoError,
    shouldShowFechaEntregaError,
    checkoutDireccionError,
    checkoutTelefonoError,
    checkoutFechaEntregaError,
    checkoutStockError,
    shouldShowComprobanteError,
    checkoutComprobanteError,
    checkoutValid,
  };
};

export const getPedidoStatusClasses = (estado: string) => {
  const normalized = String(estado).toLowerCase();
  if (normalized.includes('pend')) return 'bg-yellow-100 text-yellow-800';
  if (normalized.includes('complet')) return 'bg-green-100 text-green-800';
  return 'bg-blue-100 text-blue-800';
};

export const scrollToSection = (sectionId: 'inicio' | 'productos' | 'contacto') => {
  window.setTimeout(() => {
    const section = document.getElementById(sectionId);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
};

export const requestLandingScroll = (sectionId: 'inicio' | 'productos' | 'contacto') => {
  sessionStorage.setItem(LANDING_SCROLL_KEY, sectionId);
};

export const consumeLandingScroll = (): 'inicio' | 'productos' | 'contacto' | null => {
  const target = sessionStorage.getItem(LANDING_SCROLL_KEY);
  if (target === 'inicio' || target === 'productos' || target === 'contacto') {
    sessionStorage.removeItem(LANDING_SCROLL_KEY);
    return target;
  }
  return null;
};

/**
 * Valida que un archivo sea una imagen permitida.
 * Acepta por MIME type O por extensión de archivo para mayor compatibilidad.
 * Similar a la validación del backend en multer.
 */
export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
  
  // Obtener extensión del archivo
  const fileExt = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  
  // Validar MIME type O extensión (flexible como backend)
  const isMimeValid = allowedMimes.includes(file.type);
  const isExtValid = allowedExts.includes(fileExt);
  
  if (!isMimeValid && !isExtValid) {
    return {
      valid: false,
      error: 'Formato no permitido. Use JPG, PNG o WEBP.',
    };
  }
  
  // Validar tamaño (2 MB)
  const maxSize = 2 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'El archivo no puede superar 2 MB.',
    };
  }
  
  return { valid: true };
};
