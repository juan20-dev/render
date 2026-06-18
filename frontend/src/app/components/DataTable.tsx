import React from 'react';
import { Search, Edit, Trash2, Eye, FileText, X } from 'lucide-react';

export interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
  /** Resalta la celda como dato clave (id o nombre). Por defecto se infiere del key/label. */
  emphasis?: 'id' | 'name' | 'none';
}

const NAME_FIELD_KEYS = new Set([
  'nombre',
  'nombreRazonSocial',
  'clienteNombre',
  'productoNombre',
  'productorNombre',
  'repartidorNombre',
  'categoriaNombre',
  'insumo',
]);

/** Identificadores de fila (códigos, documentos, NIT). */
const ID_FIELD_KEYS = new Set([
  'id',
  'idOrden',
  'pedidoNumero',
  'numeroDocumento',
  'nit',
]);

const getColumnEmphasis = (column: Column): 'id' | 'name' | null => {
  if (column.emphasis === 'none') return null;
  if (column.emphasis === 'id' || column.emphasis === 'name') return column.emphasis;

  const key = column.key;
  const label = String(column.label || '').trim().toLowerCase();

  if (key === 'id' && label === 'productos') return null;

  if (ID_FIELD_KEYS.has(key) || /^id(\s|$)/.test(label) || label.includes('id ')) {
    return 'id';
  }

  if (NAME_FIELD_KEYS.has(key)) return 'name';

  if (
    label.includes('nombre') ||
    label === 'cliente' ||
    label === 'producto' ||
    label === 'proveedor' ||
    label === 'categoría' ||
    label === 'rol' ||
    label === 'insumo'
  ) {
    if (key !== 'productos' && key !== 'descripcion' && key !== 'permisos') {
      return 'name';
    }
  }

  return null;
};

const emphasisClassName = (emphasis: 'id' | 'name') =>
  emphasis === 'id'
    ? 'font-semibold tabular-nums text-foreground'
    : 'font-medium text-foreground';

const PENDING_ESTADO_PATTERNS = ['pend', 'registr', 'recib', 'activo', 'abiert'];

const getEstadoRank = (row: Record<string, unknown>): number => {
  const candidates = [row.estado, row.estadoVenta, row.estadoCompra, row.estadoDomicilio];
  const raw =
    candidates
      .map((value) => String(value || '').trim().toLowerCase())
      .find(Boolean) || '';

  if (!raw) return 2;
  if (PENDING_ESTADO_PATTERNS.some((pattern) => raw.includes(pattern))) return 0;
  if (raw.includes('proceso') || raw.includes('prepar') || raw.includes('ruta')) return 1;
  if (raw.includes('complet') || raw.includes('entreg') || raw.includes('finaliz') || raw.includes('pagad')) {
    return 3;
  }
  if (raw.includes('cancel') || raw.includes('anul') || raw.includes('inactiv') || raw.includes('rechaz')) {
    return 4;
  }
  return 2;
};

const getCreatedTimestamp = (row: Record<string, unknown>): number => {
  const dateFields = [
    'createdAt',
    'fecha',
    'fechaPedido',
    'fechaVenta',
    'fechaCompra',
    'fechaInicio',
    'fechaEntrega',
    'fechaCreacion',
  ];

  for (const field of dateFields) {
    const raw = row[field];
    if (!raw) continue;
    const timestamp = new Date(String(raw)).getTime();
    if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
  }

  const id = Number(row.id ?? row.idOrden ?? 0);
  return Number.isFinite(id) ? id : 0;
};

const sortTableRows = <T extends Record<string, unknown>>(rows: T[]): T[] =>
  [...rows].sort((left, right) => {
    const estadoDiff = getEstadoRank(left) - getEstadoRank(right);
    if (estadoDiff !== 0) return estadoDiff;
    return getCreatedTimestamp(right) - getCreatedTimestamp(left);
  });

const wrapWithEmphasis = (content: React.ReactNode, emphasis: 'id' | 'name'): React.ReactNode => {
  const className = emphasisClassName(emphasis);

  if (content === null || content === undefined || content === '') {
    return <span className={`text-sm text-muted-foreground ${className}`}>—</span>;
  }

  if (typeof content === 'string' || typeof content === 'number') {
    return <span className={className}>{content}</span>;
  }

  if (React.isValidElement(content)) {
    if (content.type === 'select' || content.type === 'button') {
      return content;
    }
    if (content.type === 'span') {
      const prev = String((content.props as { className?: string }).className || '');
      return React.cloneElement(content as React.ReactElement<{ className?: string }>, {
        className: `${className} ${prev}`.trim(),
      });
    }
    return <span className={className}>{content}</span>;
  }

  return <span className={className}>{content}</span>;
};

export interface Action {
  label: string;
  icon: React.ReactNode;
  onClick: (row: any) => void;
  variant?: 'default' | 'primary' | 'destructive';
  /**
   * Si retorna true para una fila, el boton de la accion se deshabilita
   * (no se ejecuta onClick) y se muestra con opacidad reducida.
   * Util para impedir, p.ej., editar registros inactivos sin alterar el diseno.
   */
  disabled?: (row: any) => boolean;
  /** Tooltip alternativo mostrado cuando la accion esta deshabilitada. */
  disabledTitle?: string;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  actions?: Action[];
  onSearch?: (query: string) => void;
  searchPlaceholder?: string;
  /** Claves estables por fila (p. ej. id) para inputs/controlados al reordenar o filtrar */
  getRowKey?: (row: any) => React.Key;
  /** Clases extra por fila (p. ej. inactivos) sin cambiar la estructura de la tabla */
  rowClassName?: (row: any) => string | undefined;
  /** Paginación local: cantidad máxima de filas por página (p. ej. 10). */
  pageSize?: number;
}

export function DataTable({
  columns,
  data,
  actions = [],
  onSearch,
  searchPlaceholder = "Buscar ...",
  getRowKey,
  rowClassName,
  pageSize = 10,
}: DataTableProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [page, setPage] = React.useState(1);

  const sortedData = React.useMemo(() => sortTableRows(data), [data]);
  const total = sortedData.length;
  const usePagination = typeof pageSize === 'number' && pageSize > 0;
  const totalPages = usePagination ? Math.max(1, Math.ceil(total / pageSize!)) : 1;
  const safePage = usePagination ? Math.min(page, totalPages) : 1;

  React.useEffect(() => {
    setPage(1);
  }, [total, pageSize]);

  React.useEffect(() => {
    if (usePagination && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages, usePagination]);

  const sliceStart = usePagination ? (safePage - 1) * pageSize! : 0;
  const pageRows = usePagination ? sortedData.slice(sliceStart, sliceStart + pageSize!) : sortedData;

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setPage(1);
    onSearch?.(value);
  };

  const renderCellContent = (column: Column, row: any) => {
    const raw = row[column.key];
    const emphasis = getColumnEmphasis(column);
    const content = column.render ? column.render(raw, row) : raw;

    if (emphasis) {
      return wrapWithEmphasis(content, emphasis);
    }

    if (content === null || content === undefined || content === '') {
      return <span className="text-sm text-muted-foreground">—</span>;
    }

    if (column.render) return content;

    return <span className="text-sm text-foreground">{String(content)}</span>;
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
      {/* Search Bar */}
      {onSearch && (
        <div className="border-b border-border bg-white p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-white py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      )}

      {/* Vista móvil */}
      <div className="grid gap-3 bg-muted/10 p-3 md:hidden">
        {pageRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-white px-4 py-10 text-center text-sm text-muted-foreground">
            No hay datos disponibles
          </div>
        ) : (
          pageRows.map((row, index) => (
            <div
              key={getRowKey ? getRowKey(row) : index}
              className={`rounded-lg border border-border bg-white p-4 shadow-sm ${rowClassName?.(row) ?? ''}`.trim()}
            >
              <div className="space-y-3">
                {columns.map((column) => (
                  <div key={column.key} className="flex flex-col gap-1 border-b border-border/60 pb-2 last:border-b-0 last:pb-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {column.label}
                    </span>
                    <div className="text-sm text-foreground">
                      {renderCellContent(column, row)}
                    </div>
                  </div>
                ))}

                {actions.length > 0 && (
                  <div className="pt-2">
                    <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Acciones</p>
                    <div className="flex flex-wrap gap-2">
                      {actions.map((action, actionIndex) => {
                        const isDisabled = action.disabled ? !!action.disabled(row) : false;
                        return (
                          <button
                            key={actionIndex}
                            onClick={() => {
                              if (isDisabled) return;
                              action.onClick(row);
                            }}
                            disabled={isDisabled}
                            aria-disabled={isDisabled || undefined}
                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                              action.variant === 'destructive'
                                ? 'border-destructive/20 text-destructive hover:bg-destructive/10'
                                : action.variant === 'primary'
                                  ? 'border-primary/20 text-primary hover:bg-primary/10'
                                  : 'border-border hover:bg-accent'
                            } ${isDisabled ? 'pointer-events-none opacity-40' : ''}`}
                            title={isDisabled ? (action.disabledTitle || `${action.label} (no disponible)`) : action.label}
                          >
                            {action.icon}
                            <span>{action.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Table desktop/tablet */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="border-b border-border bg-accent/30">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {column.label}
                </th>
              ))}
              {actions.length > 0 && (
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/80 bg-white">
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (actions.length > 0 ? 1 : 0)}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  No hay datos disponibles
                </td>
              </tr>
            ) : (
              pageRows.map((row, index) => (
                <tr
                  key={getRowKey ? getRowKey(row) : index}
                  className={`transition-colors hover:bg-accent/40 even:bg-muted/15 ${rowClassName?.(row) ?? ''}`.trim()}
                >
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3.5 align-middle text-sm text-foreground">
                      {renderCellContent(column, row)}
                    </td>
                  ))}
                  {actions.length > 0 && (
                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex items-center gap-1.5">
                        {actions.map((action, actionIndex) => {
                          const isDisabled = action.disabled ? !!action.disabled(row) : false;
                          return (
                            <button
                              key={actionIndex}
                              onClick={() => {
                                if (isDisabled) return;
                                action.onClick(row);
                              }}
                              disabled={isDisabled}
                              aria-disabled={isDisabled || undefined}
                              className={`rounded-lg border border-transparent p-2 transition-colors ${
                                action.variant === 'destructive'
                                  ? 'text-destructive hover:border-destructive/20 hover:bg-destructive/10'
                                  : action.variant === 'primary'
                                    ? 'text-primary hover:border-primary/20 hover:bg-primary/10'
                                    : 'text-foreground hover:border-border hover:bg-accent'
                              } ${isDisabled ? 'pointer-events-none cursor-not-allowed opacity-40' : ''}`}
                              title={isDisabled ? (action.disabledTitle || `${action.label} (no disponible)`) : action.label}
                            >
                              {action.icon}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-3 border-t border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {usePagination ? (
              <>
                Mostrando {total === 0 ? 0 : sliceStart + 1}-{Math.min(sliceStart + pageSize!, total)} de {total}{' '}
                registro{total !== 1 ? 's' : ''}
                {' · '}Página {safePage} de {totalPages}
              </>
            ) : (
              <>
                Mostrando {total} registro{total !== 1 ? 's' : ''}
              </>
            )}
          </p>
          {usePagination && totalPages > 1 ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-border bg-white px-4 py-2 text-sm transition-colors hover:border-primary/35 hover:bg-accent disabled:opacity-50"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="rounded-lg border border-border bg-white px-4 py-2 text-sm transition-colors hover:border-primary/35 hover:bg-accent disabled:opacity-50"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente
              </button>
            </div>
          ) : (
            !usePagination && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-border bg-white px-4 py-2 text-sm transition-colors disabled:opacity-50"
                  disabled
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border bg-white px-4 py-2 text-sm transition-colors disabled:opacity-50"
                  disabled
                >
                  Siguiente
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Genera un comprobante "imprimible" (vista PDF / impresion del navegador) a partir
 * de un titulo y secciones de datos planos (label/value). Abre una ventana nueva
 * autocontenida con un boton "Descargar PDF" (que invoca print del navegador) y
 * "Cerrar". No requiere librerias externas y respeta el diseno actual de la app.
 *
 * Si la ventana emergente esta bloqueada por el navegador, devuelve `false`.
 */
export interface PdfReportSection {
  title?: string;
  /** Pares clave/valor (cada uno es una linea: label: value). */
  rows?: Array<{ label: string; value: string | number }>;
  /** Tabla opcional con encabezados y filas. */
  table?: { headers: string[]; rows: Array<Array<string | number>> };
  /** Bloque de texto libre (multilinea, se respetan saltos de linea). */
  text?: string;
}

export interface PdfReportOptions {
  title: string;
  subtitle?: string;
  sections: PdfReportSection[];
  /** Pie de pagina opcional. */
  footer?: string;
}

const escapeHtml = (s: string | number) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const PDF_LOGO_URL = `${typeof window !== 'undefined' ? window.location.origin : ''}/favicon/android-chrome-192x192.png`;

export function buildPrintablePdfHtml(
  opts: PdfReportOptions,
  options: { logoUrl?: string; includeToolbar?: boolean } = {}
): string {
  const logoUrl = options.logoUrl ?? PDF_LOGO_URL;
  const includeToolbar = options.includeToolbar !== false;

  const logoHeader = `<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #e2e8f0">
    <img src="${logoUrl}" alt="Grandma's Liquors" width="56" height="56" style="border-radius:10px;object-fit:contain" onerror="this.style.display='none'" />
    <div>
      <p style="margin:0;font-size:11px;color:#64748b;letter-spacing:.04em;text-transform:uppercase">Grandma's Liquors</p>
      <p style="margin:2px 0 0 0;font-size:13px;color:#475569">Comprobante oficial</p>
    </div>
  </div>`;

  const sectionsHtml = opts.sections
    .map((sec) => {
      const head = sec.title
        ? `<h3 style="margin:0 0 8px 0;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:6px">${escapeHtml(
            sec.title
          )}</h3>`
        : '';
      const rowsHtml = (sec.rows ?? [])
        .map(
          (r) =>
            `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px dashed #f1f5f9"><span style="color:#475569">${escapeHtml(
              r.label
            )}</span><strong style="color:#0f172a;text-align:right">${escapeHtml(
              r.value
            )}</strong></div>`
        )
        .join('');
      const textHtml = sec.text
        ? `<p style="margin:8px 0;color:#334155;white-space:pre-line">${escapeHtml(sec.text)}</p>`
        : '';
      const tableHtml = sec.table
        ? `<table style="width:100%;border-collapse:collapse;margin-top:8px"><thead><tr>${sec.table.headers
            .map(
              (h) =>
                `<th style="text-align:left;padding:6px;border-bottom:2px solid #cbd5e1;background:#f8fafc;color:#334155">${escapeHtml(
                  h
                )}</th>`
            )
            .join('')}</tr></thead><tbody>${sec.table.rows
            .map(
              (row) =>
                `<tr>${row
                  .map(
                    (cell) =>
                      `<td style="padding:6px;border-bottom:1px solid #e2e8f0;color:#0f172a">${escapeHtml(
                        cell
                      )}</td>`
                  )
                  .join('')}</tr>`
            )
            .join('')}</tbody></table>`
        : '';
      return `<section style="margin:18px 0">${head}${rowsHtml}${textHtml}${tableHtml}</section>`;
    })
    .join('');

  const toolbarHtml = includeToolbar
    ? `<div class="toolbar">
  <button onclick="window.close()">Cerrar</button>
  <button class="primary" onclick="window.print()">Descargar PDF</button>
</div>`
    : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<title>${escapeHtml(opts.title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;background:#f1f5f9;color:#0f172a}
  .toolbar{position:sticky;top:0;display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;background:#ffffffee;border-bottom:1px solid #e2e8f0;backdrop-filter:blur(6px);z-index:10}
  .toolbar button{cursor:pointer;border:1px solid #cbd5e1;background:#ffffff;border-radius:8px;padding:8px 16px;font-size:14px;color:#0f172a}
  .toolbar button.primary{background:#0f172a;color:#ffffff;border-color:#0f172a}
  .page{max-width:780px;margin:24px auto;padding:32px;background:#ffffff;border-radius:12px;box-shadow:0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.06)}
  h1{margin:0 0 4px 0;font-size:20px}
  .sub{color:#64748b;margin:0 0 16px 0;font-size:13px}
  .footer{margin-top:24px;color:#94a3b8;font-size:12px;border-top:1px dashed #e2e8f0;padding-top:12px}
  @media print{
    .toolbar{display:none}
    body{background:#ffffff}
    .page{box-shadow:none;border-radius:0;margin:0;max-width:100%}
  }
</style>
</head><body>
${toolbarHtml}
<div class="page">
  ${logoHeader}
  <h1>${escapeHtml(opts.title)}</h1>
  ${opts.subtitle ? `<p class="sub">${escapeHtml(opts.subtitle)}</p>` : ''}
  ${sectionsHtml}
  ${opts.footer ? `<p class="footer">${escapeHtml(opts.footer)}</p>` : ''}
</div>
<script>window.addEventListener('load',function(){setTimeout(function(){try{window.focus()}catch(e){}},200)});</script>
</body></html>`;
}

export function openPrintablePdf(opts: PdfReportOptions): boolean {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;

  const html = buildPrintablePdfHtml(opts);

  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

// Predefined action buttons
export const commonActions = {
  view: (onClick: (row: any) => void): Action => ({
    label: 'Ver detalle',
    icon: <Eye className="w-4 h-4" />,
    onClick
  }),
  edit: (
    onClick: (row: any) => void,
    options: { disabled?: (row: any) => boolean; disabledTitle?: string } = {}
  ): Action => ({
    label: 'Editar',
    icon: <Edit className="w-4 h-4" />,
    onClick,
    variant: 'primary',
    disabled: options.disabled,
    disabledTitle: options.disabledTitle,
  }),
  delete: (onClick: (row: any) => void): Action => ({
    label: 'Eliminar',
    icon: <Trash2 className="w-4 h-4" />,
    onClick,
    variant: 'destructive'
  }),
  pdf: (onClick: (row: any) => void): Action => ({
    label: 'Ver PDF',
    icon: <FileText className="w-4 h-4" />,
    onClick
  }),
  cancel: (
    onClick: (row: any) => void,
    options: { disabled?: (row: any) => boolean; disabledTitle?: string } = {}
  ): Action => ({
    label: 'Anular',
    icon: <X className="w-4 h-4" />,
    onClick,
    variant: 'destructive',
    disabled: options.disabled,
    disabledTitle: options.disabledTitle,
  })
};
