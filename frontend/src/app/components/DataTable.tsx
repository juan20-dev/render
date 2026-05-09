import React from 'react';
import { Search, Edit, Trash2, Eye, FileText, X } from 'lucide-react';

export interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
}

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
}

export function DataTable({ 
  columns, 
  data, 
  actions = [], 
  onSearch,
  searchPlaceholder = "Buscar...",
  getRowKey,
  rowClassName,
}: DataTableProps) {
  const [searchQuery, setSearchQuery] = React.useState('');

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    onSearch?.(value);
  };

  return (
    <div className="bg-white rounded-lg border border-border">
      {/* Search Bar */}
      {onSearch && (
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-input-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 text-left">
                  {column.label}
                </th>
              ))}
              {actions.length > 0 && (
                <th className="px-4 py-3 text-left">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions.length > 0 ? 1 : 0)} className="px-4 py-8 text-center text-muted-foreground">
                  No hay datos disponibles
                </td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr
                  key={getRowKey ? getRowKey(row) : index}
                  className={`border-t border-border hover:bg-accent/50 transition-colors ${rowClassName?.(row) ?? ''}`.trim()}
                >
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3">
                      {column.render ? column.render(row[column.key], row) : row[column.key]}
                    </td>
                  ))}
                  {actions.length > 0 && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
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
                              className={`p-2 rounded-lg transition-colors ${
                                action.variant === 'destructive'
                                  ? 'hover:bg-destructive/10 text-destructive'
                                  : action.variant === 'primary'
                                  ? 'hover:bg-primary/10 text-primary'
                                  : 'hover:bg-accent'
                              } ${isDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
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

      {/* Pagination - Placeholder */}
      {data.length > 0 && (
        <div className="p-4 border-t border-border flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {data.length} registro{data.length !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-2">
            <button className="px-4 py-2 border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50" disabled>
              Anterior
            </button>
            <button className="px-4 py-2 border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50" disabled>
              Siguiente
            </button>
          </div>
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

export function openPrintablePdf(opts: PdfReportOptions): boolean {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;

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

  const html = `<!doctype html>
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
<div class="toolbar">
  <button onclick="window.close()">Cerrar</button>
  <button class="primary" onclick="window.print()">Descargar PDF</button>
</div>
<div class="page">
  <h1>${escapeHtml(opts.title)}</h1>
  ${opts.subtitle ? `<p class="sub">${escapeHtml(opts.subtitle)}</p>` : ''}
  ${sectionsHtml}
  ${opts.footer ? `<p class="footer">${escapeHtml(opts.footer)}</p>` : ''}
</div>
<script>window.addEventListener('load',function(){setTimeout(function(){try{window.focus()}catch(e){}},200)});</script>
</body></html>`;

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
  cancel: (onClick: (row: any) => void): Action => ({
    label: 'Anular',
    icon: <X className="w-4 h-4" />,
    onClick,
    variant: 'destructive'
  })
};
