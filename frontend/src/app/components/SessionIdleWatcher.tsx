import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from './AuthContext';

const DEFAULT_IDLE_MS = 30 * 60 * 1000;
const envIdle = Number(import.meta.env.VITE_SESSION_IDLE_MS);
const FALLBACK_IDLE_MS = Number.isFinite(envIdle) && envIdle > 0 ? envIdle : DEFAULT_IDLE_MS;

/**
 * Cierra sesión tras inactividad (complementa la expiración del JWT).
 */
export function SessionIdleWatcher() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return undefined;

    const idleMs =
      typeof user.idleTimeoutMs === 'number' && user.idleTimeoutMs > 0
        ? user.idleTimeoutMs
        : FALLBACK_IDLE_MS;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        await logout();
        navigate('/', { replace: true });
      }, idleMs);
    };

    const events: Array<keyof WindowEventMap> = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    for (const eventName of events) {
      window.addEventListener(eventName, resetTimer, { passive: true });
    }
    resetTimer();

    return () => {
      if (timer) clearTimeout(timer);
      for (const eventName of events) {
        window.removeEventListener(eventName, resetTimer);
      }
    };
  }, [user, logout, navigate]);

  return null;
}
