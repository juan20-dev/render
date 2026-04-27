import React, { useState, useEffect, useMemo } from 'react';
import { DataTable, Column, commonActions } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions } from '../../Form';
import { Button } from '../../Button';
import { Plus, Search, RotateCcw } from 'lucide-react';
import { useAlertDialog } from '../../AlertDialog';
import { abonos as abonosAPI, pedidos as pedidosAPI } from '../../../services/api';
import { downloadPdfText } from '../../../utils/pdf';

interface Abono {
  id: string;
  numero_abono: string;
  pedido_id: number;
  cliente_id: number;
  monto: number;
  fecha: string;
  metodo_pago: string;
  estado: string;
  cliente_nombre?: string;
}

interface StateChangeRequest {
  abono: Abono;
  from: string;
  to: string;
}

export function Abonos() {
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filters, setFilters] = useState({
    query: '',
    fecha: '',
    metodo_pago: '',
    estado: ''
  });
  const { showAlert, AlertComponent } = useAlertDialog();

  useEffect(() => {
    loadAbonos();
  }, []);

  const loadAbonos = async () => {
    try {
      setLoading(true);
      const data = await abonosAPI.getAll();
      setAbonos(data);
    } catch (error) {
      console.error('Error al cargar abonos:', error);
    } finally {
      setLoading(false);
    }
  };
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [selectedAbono, setSelectedAbono] = useState<Abono | null>(null);
  const [pendingStateChange, setPendingStateChange] = useState<StateChangeRequest | null>(null);
  const [stateChangeReason, setStateChangeReason] = useState('');
  const [stateChangeSaving, setStateChangeSaving] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);
  const [pdfContent, setPdfContent] = useState<string>('');
  const [formData, setFormData] = useState({
    numero_abono: '',
    pedido_id: 0,
    cliente_id: 0,
    monto: 0,
    fecha: new Date().toISOString().split('T')[0],
    metodo_pago: '',
    estado: 'Registrado'
  });
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const columns: Column[] = [
    { key: 'numero_abono', label: 'Número Abono' },
    { key: 'pedido_id', label: 'Pedido ID' },
    { 
      key: 'monto', 
      label: 'Monto',
      render: (monto: number) => formatCurrency(monto)
    },
    { key: 'fecha', label: 'Fecha' },
    { key: 'metodo_pago', label: 'Método Pago' },
    { 
      key: 'estado', 
      label: 'Estado',
      render: (estado: string, abono: Abono) => (
        <select
          value={estado}
          onChange={(event) => handleEstadoChangeRequest(abono, event.target.value)}
          disabled={stateChangeSaving}
          className={`min-h-8 rounded-lg border border-transparent px-2.5 py-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${
            estado === 'Registrado' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          <option value="Registrado">Registrado</option>
          <option value="Cancelado">Cancelado</option>
        </select>
      )
    }
  ];

  const metodosPagoOptions = useMemo(
    () => Array.from(new Set(abonos.map((abono) => abono.metodo_pago).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    [abonos]
  );

  const abonosFiltrados = useMemo(() => {
    const normalizedQuery = filters.query.trim().toLowerCase();

    return abonos.filter((abono) => {
      const matchesQuery =
        !normalizedQuery ||
        String(abono.numero_abono || '').toLowerCase().includes(normalizedQuery) ||
        String(abono.pedido_id || '').toLowerCase().includes(normalizedQuery);
      const matchesFecha = !filters.fecha || String(abono.fecha || '').includes(filters.fecha);
      const matchesMetodo = !filters.metodo_pago || abono.metodo_pago === filters.metodo_pago;
      const matchesEstado = !filters.estado || abono.estado === filters.estado;
      return matchesQuery && matchesFecha && matchesMetodo && matchesEstado;
    });
  }, [abonos, filters]);

  const handleAdd = () => {
    setFormData({ 
      numero_abono: `ABO-${Date.now()}`,
      pedido_id: 0,
      cliente_id: 0,
      monto: 0, 
      fecha: new Date().toISOString().split('T')[0],
      metodo_pago: 'Efectivo',
      estado: 'Registrado'
    });
    setIsModalOpen(true);
  };

  const handleEstadoChangeRequest = (abono: Abono, nuevoEstado: string) => {
    if (abono.estado === nuevoEstado) return;

    setPendingStateChange({
      abono,
      from: abono.estado,
      to: nuevoEstado,
    });
    setStateChangeReason('');
  };

  const handleConfirmEstadoChange = async () => {
    if (!pendingStateChange) return;

    if (pendingStateChange.to === 'Cancelado' && stateChangeReason.trim().length < 10) {
      showAlert({
        title: 'Motivo requerido',
        description: 'Para cancelar el abono debes indicar un motivo de al menos 10 caracteres.',
        type: 'warning',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
      return;
    }

    try {
      setStateChangeSaving(true);
      await abonosAPI.update(Number(pendingStateChange.abono.id), { estado: pendingStateChange.to });
      await loadAbonos();
      setPendingStateChange(null);
      setStateChangeReason('');
    } catch (error) {
      console.error('Error actualizando estado de abono:', error);
      showAlert({
        title: 'Error',
        description: 'No se pudo actualizar el estado del abono.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {},
      });
    } finally {
      setStateChangeSaving(false);
    }
  };

  const handleCancelEstadoChange = () => {
    setPendingStateChange(null);
    setStateChangeReason('');
  };

  const handleGeneratePDF = (abono: Abono) => {
    const content = `
╔════════════════════════════════════════════════════════════╗
║         GRANDMA'S LIQUEURS - COMPROBANTE DE ABONO         ║
╚════════════════════════════════════════════════════════════╝

ID Abono:           ${abono.id}
Número Abono:       ${abono.numero_abono}
Pedido ID:          ${abono.pedido_id}
Cliente:            ${abono.cliente_nombre || 'N/A'}
Monto:              ${formatCurrency(abono.monto)}
Fecha:              ${abono.fecha}
Método de Pago:     ${abono.metodo_pago}
Estado:             ${abono.estado}

────────────────────────────────────────────────────────────
Este comprobante certifica el pago parcial del pedido
${abono.pedido_id} por un valor de ${formatCurrency(abono.monto)}
────────────────────────────────────────────────────────────

Firma Cliente:      _______________________

Firma Autorizado:   _______________________

Fecha Impresión:    ${new Date().toLocaleString('es-CO')}
────────────────────────────────────────────────────────────
    `.trim();

    setPdfContent(content);
    setIsPdfModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await abonosAPI.create(formData);
      await loadAbonos();
      setIsModalOpen(false);
      showAlert({
        title: 'Éxito',
        description: 'Abono registrado correctamente.',
        type: 'success',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    } catch (error) {
      console.error('Error al crear abono:', error);
      showAlert({
        title: 'Error',
        description: 'No se pudo crear el abono.',
        type: 'danger',
        confirmText: 'Entendido',
        onConfirm: () => {}
      });
    }
  };

  return (
    <div className="space-y-6">
      {AlertComponent}
      <div className="flex items-center justify-between">
        <div>
          <h2>Gestión de Abonos</h2>
          <p className="text-muted-foreground">Registra y consulta los abonos a ventas</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
          Nuevo Abono
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-white p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Buscar abono por número o pedido..."
              className="w-full pl-10 pr-4 py-2 bg-input-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button
            variant="outline"
            icon={<RotateCcw className="w-4 h-4" />}
            onClick={() => setFilters({ query: '', fecha: '', metodo_pago: '', estado: '' })}
            disabled={!filters.query.trim() && !filters.fecha && !filters.metodo_pago && !filters.estado}
          >
            Limpiar filtros
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtrar por:</span>
          <input
            type="date"
            value={filters.fecha}
            onChange={(event) => setFilters((current) => ({ ...current, fecha: event.target.value }))}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={filters.metodo_pago}
            onChange={(event) => setFilters((current) => ({ ...current, metodo_pago: event.target.value }))}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Metodo de Pago (todos)</option>
            {metodosPagoOptions.map((metodo) => (
              <option key={metodo} value={metodo}>
                {metodo}
              </option>
            ))}
          </select>
          <select
            value={filters.estado}
            onChange={(event) => setFilters((current) => ({ ...current, estado: event.target.value }))}
            className="h-8 rounded-md border border-border bg-card px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Estado (todos)</option>
            <option value="Registrado">Registrado</option>
            <option value="Cancelado">Cancelado</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">Cargando abonos...</div>
      ) : (
        <DataTable
          columns={columns}
          data={abonosFiltrados}
          actions={[
            commonActions.view((abono) => {
              setSelectedAbono(abono);
              setIsDetailModalOpen(true);
            }),
            commonActions.pdf(handleGeneratePDF),
          ]}
        />
      )}

      <Modal
        isOpen={Boolean(pendingStateChange)}
        onClose={handleCancelEstadoChange}
        title={`Cambiar estado - Abono ${pendingStateChange?.abono.numero_abono || ''}`}
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-accent/30 p-4 space-y-1">
            <p className="text-sm text-muted-foreground">Estado actual: {pendingStateChange?.from || 'N/A'}</p>
            <p className="text-sm text-muted-foreground">Nuevo estado: {pendingStateChange?.to || 'N/A'}</p>
          </div>

          {pendingStateChange?.to === 'Cancelado' ? (
            <FormField
              label="Motivo del cambio"
              name="motivo-cambio-abono"
              type="textarea"
              value={stateChangeReason}
              onChange={(value) => setStateChangeReason(String(value))}
              rows={3}
              required
              placeholder="Explica por qué se cancela el abono (mínimo 10 caracteres)"
            />
          ) : null}

          <FormActions>
            <Button variant="outline" onClick={handleCancelEstadoChange} disabled={stateChangeSaving}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmEstadoChange} disabled={stateChangeSaving}>
              {stateChangeSaving ? 'Guardando...' : 'Confirmar'}
            </Button>
          </FormActions>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal 
        isOpen={isDetailModalOpen} 
        onClose={() => setIsDetailModalOpen(false)}
        title={`Detalle de Abono ${selectedAbono?.id}`}
        size="lg"
      >
        {selectedAbono && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-accent/50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">ID Abono</p>
                <p>{selectedAbono.id}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Número Abono</p>
                <p>{selectedAbono.numero_abono}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pedido ID</p>
                <p>{selectedAbono.pedido_id}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cliente</p>
                <p>{selectedAbono.cliente_nombre || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Monto</p>
                <p>{formatCurrency(selectedAbono.monto)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fecha</p>
                <p>{selectedAbono.fecha}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Método de Pago</p>
                <p>{selectedAbono.metodo_pago}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado</p>
                <span className={`px-3 py-1 rounded-full text-xs ${
                  selectedAbono.estado === 'Registrado' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {selectedAbono.estado}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Registrar Abono"
        size="lg"
      >
        <Form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Pedido ID"
              name="pedido_id"
              type="number"
              value={formData.pedido_id}
              onChange={(value) => setFormData({ ...formData, pedido_id: value as number })}
              placeholder="ID del pedido"
              required
            />

            <FormField
              label="Cliente ID"
              name="cliente_id"
              type="number"
              value={formData.cliente_id}
              onChange={(value) => setFormData({ ...formData, cliente_id: value as number })}
              placeholder="ID del cliente"
              required
            />

            <FormField
              label="Monto del Abono"
              name="monto"
              type="number"
              value={formData.monto}
              onChange={(value) => setFormData({ ...formData, monto: value as number })}
              placeholder="0"
              required
            />

            <FormField
              label="Método de Pago"
              name="metodo_pago"
              type="select"
              value={formData.metodo_pago}
              onChange={(value) => setFormData({ ...formData, metodo_pago: value as string })}
              options={[
                { value: 'Efectivo', label: 'Efectivo' },
                { value: 'Tarjeta', label: 'Tarjeta' },
                { value: 'Transferencia', label: 'Transferencia' },
                { value: 'Nequi', label: 'Nequi' },
                { value: 'Daviplata', label: 'Daviplata' }
              ]}
              required
            />

            <div className="col-span-2">
              <FormField
                label="Fecha"
                name="fecha"
                type="date"
                value={formData.fecha}
                onChange={(value) => setFormData({ ...formData, fecha: value as string })}
                required
              />
            </div>
          </div>

          <FormActions>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              Registrar Abono
            </Button>
          </FormActions>
        </Form>
      </Modal>

      <Modal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        title="Comprobante de Abono"
        size="lg"
      >
        <div className="space-y-4">
          <pre className="whitespace-pre-wrap text-sm">
            {pdfContent}
          </pre>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => downloadPdfText(pdfContent, `abono-${selectedAbono?.numero_abono || selectedAbono?.id || 'abono'}.pdf`)}
            >
              Descargar PDF
            </Button>
            <Button variant="outline" onClick={() => setIsPdfModalOpen(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}