import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { PedidoRecord, UserData } from './landingShared';

export function useOrders(user?: UserData) {
  const [showMisPedidos, setShowMisPedidos] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoRecord[]>([]);
  const [misPedidosLoading, setMisPedidosLoading] = useState(false);

  const refreshPedidos = async (options?: { light?: boolean }) => {
    try {
      setMisPedidosLoading(true);
      const rows = options?.light
        ? await api.pedidos.getAll()
        : await api.pedidos.getAllWithDetails();
      setPedidos(Array.isArray(rows) ? (rows as PedidoRecord[]) : []);
    } catch {
      setPedidos([]);
    } finally {
      setMisPedidosLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setPedidos([]);
      return;
    }

    void refreshPedidos();
  }, [user?.email]);

  useEffect(() => {
    if (!user || !showMisPedidos) return undefined;

    let cancelled = false;
    const loadPedidos = async () => {
      try {
        setMisPedidosLoading(true);
        const rows = await api.pedidos.getAllWithDetails();
        if (!cancelled) {
          setPedidos(Array.isArray(rows) ? (rows as PedidoRecord[]) : []);
        }
      } catch {
        if (!cancelled) {
          setPedidos([]);
        }
      } finally {
        if (!cancelled) {
          setMisPedidosLoading(false);
        }
      }
    };

    void loadPedidos();
    const intervalId = window.setInterval(() => {
      void loadPedidos();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [showMisPedidos, user?.email]);

  return {
    showMisPedidos,
    setShowMisPedidos,
    pedidos,
    misPedidosLoading,
    refreshPedidos,
  };
}
