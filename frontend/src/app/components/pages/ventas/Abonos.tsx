import React, { useState, useEffect } from 'react';
import { DataTable, Column, commonActions, openPrintablePdf } from '../../DataTable';
import { Modal } from '../../Modal';
import { Form, FormField, FormActions } from '../../Form';
import { Button } from '../../Button';
import { Plus } from 'lucide-react';
import { api } from '../../../services/api';
import { settledValue } from '../../../services/routePermissions';
import { formatEntityCode } from '../../../services/mappers';
import { toast } from '../../AlertDialog';
import type { Abono, Pedido, Cliente } from '../../../services/types';
import { AlertDialog } from '../../AlertDialog';

interface AbonoView extends Abono {
  pedidoNumero?: string;
  clienteNombre?: string;
}

export function Abonos() {
  const [abonos, setAbonos] = useState<AbonoView[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedAbono, setSelectedAbono] = useState<AbonoView | null>(null);
  const [abonoEstadoPendiente, setAbonoEstadoPendiente] = useState<{
    row: AbonoView;
    to: Abono['estado'];
  } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroMetodoPago, setFiltroMetodoPago] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [busquedaPedido, setBusquedaPedido] = useState('');
  const [mostrarListaPedidos, setMostrarListaPedidos] = useState(false);
  const [formData, setFormData] = useState({
    pedidoId: 0,
    /** Porcentaje del total del pedido a registrar en este abono (solo 50 % o 100 %). */
    porcentajeDelAbono: 50 as 50 | 100,
    fecha: new Date().toISOString().split('T')[0],
    metodoPago: 'efectivo' as 'efectivo' | 'transferencia'
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  // Cerrar listas desplegables al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.relative')) {
        setMostrarListaPedidos(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, []);

  const cargarDatos = async () => {
    try {
      const [abonosR, pedidosR, clientesR] = await Promise.allSettled([
        api.abonos.getAll(),
        api.pedidos.getAll(),
        api.clientes.getAll(),
      ]);

      if (abonosR.status === 'rejected') {
        console.error('[Abonos] Error al cargar abonos:', abonosR.reason);
        toast.error('Error al cargar datos', {
          description:
            abonosR.reason instanceof Error ? abonosR.reason.message : 'No autorizado o error de red',
        });
        return;
      }

      const abonosData = abonosR.value;
      const pedidosData = settledValue(pedidosR, [] as Pedido[], 'pedidos');
      const clientesData = settledValue(clientesR, [] as Cliente[], 'clientes');

      setPedidos(pedidosData);
      setClientes(clientesData);

      const abonosConInfo = abonosData.map(abono => {
        const pedido = pedidosData.find(p => p.id === abono.pedidoId);
        const cliente = pedido ? clientesData.find(c => c.id === pedido.clienteId) : null;
        return {
          ...abono,
          pedidoNumero: pedido ? formatEntityCode('P', pedido.id) : 'Desconocido',
          clienteNombre: cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Desconocido'
        };
      });

      setAbonos(abonosConInfo);
    } catch (error) {
      toast.error('Error al cargar datos');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(value);
  };

  const opcionesEstadoAbono = (row: AbonoView): { v: Abono['estado']; l: string }[] => {
    if (row.estado === 'aplicado') {
      return [
        { v: 'aplicado', l: 'Aplicado' },
        { v: 'cancelado', l: 'Cancelado' },
      ];
    }
    if (row.estado === 'registrado') {
      return [
        { v: 'registrado', l: 'Registrado' },
        { v: 'verificado', l: 'Verificado' },
        { v: 'cancelado', l: 'Cancelado' }
      ];
    }
    if (row.estado === 'verificado') {
      return [
        { v: 'verificado', l: 'Verificado' },
        { v: 'cancelado', l: 'Cancelado' }
      ];
    }
    if (row.estado === 'finalizado') {
      // Estado terminal automatico al entregar el domicilio: no se puede modificar.
      return [{ v: 'finalizado', l: 'Finalizado' }];
    }
    return [{ v: 'cancelado', l: 'Cancelado' }];
  };

  const handleAbonoEstadoSelect = (row: AbonoView, to: Abono['estado']) => {
    if (row.estado === to) return;
    setAbonoEstadoPendiente({ row, to });
  };

  const confirmarAbonoEstado = async () => {
    const pending = abonoEstadoPendiente;
    if (!pending) return;
    try {
      await api.abonos.changeEstado(pending.row.id, pending.to);
      toast.success('Estado del abono actualizado');
      await cargarDatos();
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar estado');
      await cargarDatos();
    }
  };

  const labelEstadoAbono = (e: Abono['estado']) =>
    e === 'verificado'
      ? 'Verificado'
      : e === 'cancelado'
        ? 'Cancelado'
        : e === 'aplicado'
          ? 'Aplicado'
          : e === 'finalizado'
            ? 'Finalizado'
            : 'Registrado';

  // Filtrar pedidos según búsqueda
  const pedidosFiltrados = pedidos
    .filter(p => p.estado !== 'cancelado')
    .filter(p => {
      const q = busquedaPedido.trim().toLowerCase();
      if (!q) return true;
      const cliente = clientes.find(c => c.id === p.clienteId);
      const nombreCliente = cliente ? `${cliente.nombre} ${cliente.apellido}`.toLowerCase() : '';
      const idStr = String(p.id);
      const saldoPendiente = p.total - p.montoAbonado;
      return idStr.includes(q) || nombreCliente.includes(q) || String(saldoPendiente).includes(q);
    });

  const seleccionarPedido = (pedido: Pedido) => {
    const metodo: 'efectivo' | 'transferencia' =
      pedido.metodoPago === 'transferencia' ? 'transferencia' : 'efectivo';
    setFormData((prev) => ({
      ...prev,
      pedidoId: pedido.id,
      metodoPago: metodo,
      porcentajeDelAbono: pedido.porcentajeAbono === 50 ? 50 : 100
    }));
    const cliente = clientes.find(c => c.id === pedido.clienteId);
    const saldoPendiente = pedido.total - pedido.montoAbonado;
    setBusquedaPedido(`${formatEntityCode('P', pedido.id)} - ${cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Desconocido'} - Saldo: ${formatCurrency(saldoPendiente)}`);
    setMostrarListaPedidos(false);
  };

  const columns: Column[] = [
    {
      key: 'id',
      label: 'ID Abono',
      render: (value: number) => formatEntityCode('A', value)
    },
    {
      key: 'montoAbonado',
      label: 'Monto abonado y porcentaje',
      render: (monto: number, row: AbonoView) => `${formatCurrency(monto)} (${row.porcentajeAbonado}%)`
    },
    {
      key: 'fecha',
      label: 'Fecha'
    },
    {
      key: 'metodoPago',
      label: 'Método Pago',
      render: (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (_: string, row: AbonoView) => {
        const opts = opcionesEstadoAbono(row);
        const locked = opts.length === 1;
        const bg =
          row.estado === 'verificado'
            ? '#dcfce7'
            : row.estado === 'finalizado'
              ? '#bbf7d0'
              : row.estado === 'aplicado'
                ? '#e0e7ff'
                : row.estado === 'cancelado'
                  ? '#fee2e2'
                  : '#fef9c3';
        const fg =
          row.estado === 'verificado'
            ? '#166534'
            : row.estado === 'finalizado'
              ? '#14532d'
              : row.estado === 'aplicado'
                ? '#3730a3'
                : row.estado === 'cancelado'
                  ? '#991b1b'
                  : '#854d0e';
        return (
          <select
            value={row.estado}
            onChange={(e) => handleAbonoEstadoSelect(row, e.target.value as Abono['estado'])}
            disabled={locked}
            className="px-3 py-1 rounded-full text-xs border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: bg, color: fg }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {opts.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        );
      }
    }
  ];

  const handleAdd = () => {
    setFormData({
      pedidoId: 0,
      porcentajeDelAbono: 50,
      fecha: new Date().toISOString().split('T')[0],
      metodoPago: 'efectivo'
    });
    setBusquedaPedido('');
    setMostrarListaPedidos(false);
    setIsModalOpen(true);
  };

  /**
   * Abre vista PDF imprimible con la informacion completa del abono y un boton
   * "Descargar PDF" que invoca el dialogo de impresion del navegador.
   */
  const handleVerPdfAbono = (abono: AbonoView) => {
    const opened = openPrintablePdf({
      title: `Abono ${formatEntityCode('A', abono.id)}`,
      subtitle: `Generado el ${new Date().toLocaleString('es-CO')}`,
      sections: [
        {
          title: 'Datos generales',
          rows: [
            { label: 'Pedido', value: abono.pedidoNumero || `ID ${abono.pedidoId}` },
            { label: 'Cliente', value: abono.clienteNombre || 'Desconocido' },
            { label: 'Fecha', value: abono.fecha },
            { label: 'Método de pago', value: abono.metodoPago },
            { label: 'Estado', value: labelEstadoAbono(abono.estado) },
          ],
        },
        {
          title: 'Importes',
          rows: [
            { label: 'Valor total del pedido', value: formatCurrency(abono.valorTotal) },
            { label: 'Monto abonado', value: formatCurrency(abono.montoAbonado) },
            { label: 'Porcentaje abonado', value: `${abono.porcentajeAbonado}%` },
            {
              label: 'Saldo pendiente',
              value: formatCurrency(Math.max(0, abono.valorTotal - abono.montoAbonado)),
            },
          ],
        },
        ...(abono.detalle
          ? [
              {
                title: 'Detalles del abono (consolidado)',
                text: abono.detalle,
              },
            ]
          : []),
      ],
      footer: 'Comprobante generado por Grandma\u2019s Liquors. Use "Descargar PDF" para guardar o imprimir.',
    });
    if (!opened) {
      toast.error('No se pudo abrir la vista PDF', {
        description: 'Permita las ventanas emergentes para este sitio.',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const pedidoId = Number(formData.pedidoId);
    if (!Number.isFinite(pedidoId) || pedidoId <= 0) {
      toast.error('Seleccione un pedido de la lista');
      return;
    }

    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido) {
      toast.error('Pedido no encontrado');
      return;
    }

    const porcentaje = formData.porcentajeDelAbono === 100 ? 100 : 50;
    const totalPedido = Number(pedido.total) || 0;
    if (totalPedido <= 0) {
      toast.error('El pedido no tiene un total válido');
      return;
    }

    const monto = Math.round((totalPedido * porcentaje) / 100);
    if (monto <= 0) {
      toast.error('No se pudo calcular el monto del abono');
      return;
    }

    const saldoPendiente = Math.max(0, totalPedido - (Number(pedido.montoAbonado) || 0));
    if (monto > saldoPendiente + 0.01) {
      toast.error(
        `Con ${porcentaje}% del total (${formatCurrency(monto)}) supera el saldo pendiente (${formatCurrency(saldoPendiente)}). Elija otro porcentaje o verifique abonos previos.`
      );
      return;
    }
    const metodoPago: 'efectivo' | 'transferencia' =
      formData.metodoPago === 'transferencia' ? 'transferencia' : 'efectivo';

    setSubmitting(true);
    try {
      await api.abonos.create({
        pedidoId,
        montoAbonado: monto,
        porcentajeAbonado: porcentaje,
        valorTotal: pedido.total,
        fecha: formData.fecha,
        metodoPago
      });

      toast.success('Abono registrado exitosamente');
      setIsModalOpen(false);
      await cargarDatos();
    } catch (error: any) {
      toast.error(error.message || 'Error al registrar abono');
    } finally {
      setSubmitting(false);
    }
  };

  const abonosFiltrados = abonos.filter(abono => {
    const matchBusqueda = busqueda.length === 0 ||
      busqueda.length >= 2 &&
      (abono.clienteNombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
       abono.pedidoNumero?.toLowerCase().includes(busqueda.toLowerCase()) ||
       String(abono.id).includes(busqueda));

    const matchMetodoPago = !filtroMetodoPago || abono.metodoPago === filtroMetodoPago;
    const matchEstado = !filtroEstado || abono.estado === filtroEstado;

    return matchBusqueda && matchMetodoPago && matchEstado;
  });

  const pedidoModalSel = formData.pedidoId > 0 ? pedidos.find((x) => x.id === formData.pedidoId) : undefined;
  let resumenAbonoModal: {
    calculado: number;
    saldo: number;
    pct: 50 | 100;
    total: number;
  } | null = null;
  if (pedidoModalSel) {
    const p = pedidoModalSel;
    const pct = formData.porcentajeDelAbono;
    const total = Number(p.total) || 0;
    const calculado = Math.round((total * pct) / 100);
    const saldo = total - (Number(p.montoAbonado) || 0);
    resumenAbonoModal = { calculado, saldo, pct, total };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Gestión de Abonos</h2>
          <p className="text-muted-foreground">Visualiza y registra abonos a pedidos</p>
        </div>
        <Button icon={<Plus className="w-5 h-5" />} onClick={handleAdd}>
          Nuevo Abono
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-border p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar ..."
              className="w-full px-4 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={50}
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filtroMetodoPago}
              onChange={(e) => setFiltroMetodoPago(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px]"
            >
              <option value="">Filtrar por metodo de pago</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
            </select>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2.5 border border-border rounded-lg bg-white text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary min-w-[140px]"
            >
              <option value="">Filtrar por estado</option>
              <option value="registrado">Registrado</option>
              <option value="verificado">Verificado</option>
              <option value="aplicado">Aplicado</option>
              <option value="finalizado">Finalizado</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setBusqueda('');
                setFiltroMetodoPago('');
                setFiltroEstado('');
              }}
              className="px-4"
            >
              Limpiar
            </Button>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={abonosFiltrados}
        getRowKey={(row) => row.id}
        actions={[
          commonActions.view((abono) => {
            setSelectedAbono(abono);
            setIsDetailModalOpen(true);
          }),
          commonActions.pdf((abono) => handleVerPdfAbono(abono as AbonoView)),
        ]}
      />

      <AlertDialog
        isOpen={!!abonoEstadoPendiente}
        onClose={() => setAbonoEstadoPendiente(null)}
        onConfirm={confirmarAbonoEstado}
        title={
          abonoEstadoPendiente?.to === 'verificado'
            ? 'Verificar abono'
            : abonoEstadoPendiente?.to === 'cancelado'
              ? 'Cancelar abono'
              : 'Cambiar estado del abono'
        }
        description={
          abonoEstadoPendiente?.to === 'verificado'
            ? '¿Confirma marcar este abono como verificado?'
            : abonoEstadoPendiente?.to === 'cancelado'
              ? '¿Confirma cancelar este abono? Esta acción es irreversible.'
              : '¿Confirma el cambio de estado del abono?'
        }
        type="warning"
        confirmText={abonoEstadoPendiente?.to === 'cancelado' ? 'Cancelar abono' : 'Confirmar'}
      />

      {/* Modal de formulario */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Nuevo Abono"
        size="md"
      >
        <Form onSubmit={handleSubmit} noValidate>
          <div className="space-y-4">
            {/* Campo de búsqueda de Pedido */}
            <div className="relative">
              <label className="block text-sm font-medium mb-2">Pedido *</label>
              <p className="text-xs text-muted-foreground mb-1.5">
                Enfoque el campo y elija un pedido de la lista (puede filtrar por ID o cliente).
              </p>
              <input
                type="text"
                value={busquedaPedido}
                onChange={(e) => {
                  setBusquedaPedido(e.target.value);
                  setMostrarListaPedidos(true);
                }}
                onFocus={() => setMostrarListaPedidos(true)}
                placeholder="Escribe ID del pedido o nombre del cliente..."
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                maxLength={60}
                autoComplete="off"
              />
              {mostrarListaPedidos && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {pedidosFiltrados.length > 0 ? (
                    pedidosFiltrados.map(p => {
                      const cliente = clientes.find(c => c.id === p.clienteId);
                      const saldoPendiente = p.total - p.montoAbonado;
                      return (
                        <div
                          key={p.id}
                          onClick={() => seleccionarPedido(p)}
                          className="px-3 py-2 hover:bg-accent cursor-pointer border-b border-border last:border-b-0"
                        >
                          <div className="font-medium">Pedido {formatEntityCode('P', p.id)}</div>
                          <div className="text-sm text-muted-foreground">
                            Cliente: {cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Desconocido'} | Saldo: {formatCurrency(saldoPendiente)}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="px-3 py-2 text-muted-foreground text-sm">No se encontraron pedidos</div>
                  )}
                </div>
              )}
            </div>

            <FormField
              label="Porcentaje del abono"
              name="porcentajeDelAbono"
              type="select"
              selectPlaceholder={false}
              value={formData.porcentajeDelAbono}
              onChange={(value) => {
                const n = Number(value);
                setFormData({
                  ...formData,
                  porcentajeDelAbono: n === 100 ? 100 : 50
                });
              }}
              options={[
                { value: 50, label: '50% del total del pedido' },
                { value: 100, label: '100% del total del pedido' }
              ]}
              required
            />

            {resumenAbonoModal && (
                <div className="p-3 bg-accent rounded-lg space-y-1 text-sm">
                  <p>
                    <strong>Monto a registrar:</strong> {formatCurrency(resumenAbonoModal.calculado)} (
                    {resumenAbonoModal.pct}% del total {formatCurrency(resumenAbonoModal.total)})
                  </p>
                  <p className="text-muted-foreground">
                    Saldo pendiente antes de este abono: {formatCurrency(resumenAbonoModal.saldo)}
                  </p>
                </div>
              )}

            <FormField
              label="Fecha"
              name="fecha"
              type="date"
              value={formData.fecha}
              onChange={(value) => setFormData({ ...formData, fecha: value as string })}
              required
            />

            <FormField
              label="Método de Pago"
              name="metodoPago"
              type="select"
              value={formData.metodoPago}
              onChange={(value) => {
                const v = String(value || 'efectivo').toLowerCase();
                setFormData((prev) => ({
                  ...prev,
                  metodoPago: v === 'transferencia' ? 'transferencia' : 'efectivo'
                }));
              }}
              options={[
                { value: 'efectivo', label: 'Efectivo' },
                { value: 'transferencia', label: 'Transferencia' }
              ]}
              required
            />
          </div>

          <FormActions>
            <Button
              variant="outline"
              type="button"
              disabled={submitting}
              onClick={() => setIsModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Registrando…' : 'Registrar nuevo abono'}
            </Button>
          </FormActions>
        </Form>
      </Modal>

      {/* Modal de detalle */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Detalle de Abono"
        size="lg"
      >
        {selectedAbono && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-accent rounded-lg">
              <div>
                <h3 className="text-lg">Abono {formatEntityCode('A', selectedAbono.id)}</h3>
                <p className="text-sm text-muted-foreground">Pedido {selectedAbono.pedidoNumero}</p>
              </div>
              <span
                className={`px-4 py-2 rounded-full text-sm ${
                  selectedAbono.estado === 'verificado'
                    ? 'bg-green-100 text-green-700'
                    : selectedAbono.estado === 'finalizado'
                      ? 'bg-emerald-200 text-emerald-900'
                      : selectedAbono.estado === 'aplicado'
                        ? 'bg-indigo-100 text-indigo-800'
                        : selectedAbono.estado === 'cancelado'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {labelEstadoAbono(selectedAbono.estado)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-sm text-muted-foreground">Pedido</label>
                <p className="mt-1">{selectedAbono.pedidoNumero}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Cliente</label>
                <p className="mt-1">{selectedAbono.clienteNombre}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Valor Total del Pedido</label>
                <p className="mt-1">{formatCurrency(selectedAbono.valorTotal)}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Monto Abonado</label>
                <p className="mt-1 font-semibold text-lg">{formatCurrency(selectedAbono.montoAbonado)}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Porcentaje Abonado</label>
                <p className="mt-1">{selectedAbono.porcentajeAbonado}%</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Saldo Pendiente</label>
                <p className="mt-1">{formatCurrency(selectedAbono.valorTotal - selectedAbono.montoAbonado)}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Fecha</label>
                <p className="mt-1">{selectedAbono.fecha}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Método de Pago</label>
                <p className="mt-1 capitalize">{selectedAbono.metodoPago}</p>
              </div>
            </div>

            {selectedAbono.comprobanteUrl && (
              <div className="p-4 bg-background rounded-lg border border-border">
                <label className="text-sm text-muted-foreground block mb-2 font-medium">
                  Comprobante de consignación
                </label>
                <a
                  href={selectedAbono.comprobanteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline"
                >
                  Abrir comprobante en nueva pestaña
                </a>
                <img
                  src={selectedAbono.comprobanteUrl}
                  alt="Comprobante de transferencia"
                  className="mt-3 max-w-full h-auto max-h-80 object-contain rounded-lg border border-border cursor-pointer"
                  onClick={() => window.open(selectedAbono.comprobanteUrl, '_blank', 'noopener,noreferrer')}
                />
              </div>
            )}

            {selectedAbono.detalle && (
              <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <label className="text-sm text-emerald-800 block mb-2 font-medium">
                  Detalles del abono (consolidado)
                </label>
                <p className="text-sm text-emerald-900 whitespace-pre-line break-words">
                  {selectedAbono.detalle}
                </p>
              </div>
            )}

            <div className="p-4 bg-accent/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                El estado de este abono se sincroniza automáticamente cuando se completa el domicilio relacionado al pedido. Al entregar el domicilio, el abono inicial pasa a 100 % y se marca como <strong>Finalizado</strong> con el detalle consolidado de las dos partes del pago.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

