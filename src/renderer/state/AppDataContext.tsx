import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createDefaultState } from '../../shared/defaults';
import type { AppState } from '../../shared/models';

type ToastKind = 'success' | 'error' | 'info';
export interface ToastMessage { id: string; message: string; kind: ToastKind }

interface AppDataContextValue {
  state: AppState;
  loading: boolean;
  loadError: string | null;
  saving: boolean;
  updateState: (updater: (current: AppState) => AppState, successMessage?: string) => Promise<boolean>;
  toast: (message: string, kind?: ToastKind) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(createDefaultState);
  const stateRef = useRef(state);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const saveQueue = useRef(Promise.resolve(true));

  useEffect(() => { stateRef.current = state; }, [state]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current.slice(-2), { id, message, kind }]);
    window.setTimeout(() => dismissToast(id), 3500);
  }, [dismissToast]);

  useEffect(() => {
    window.marHelper.loadState()
      .then((loaded) => {
        setState(loaded);
        stateRef.current = loaded;
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : 'Die lokale Datenbank konnte nicht geladen werden.');
      })
      .finally(() => setLoading(false));
  }, []);

  const updateState = useCallback(async (
    updater: (current: AppState) => AppState,
    successMessage?: string
  ) => {
    const previous = stateRef.current;
    const next = updater(previous);
    stateRef.current = next;
    setState(next);
    setSaving(true);
    const save = async () => {
      try {
        const persisted = await window.marHelper.saveState(next);
        stateRef.current = persisted;
        setState(persisted);
        if (successMessage) toast(successMessage);
        return true;
      } catch (error) {
        stateRef.current = previous;
        setState(previous);
        toast(error instanceof Error ? error.message : 'Änderung konnte nicht gespeichert werden.', 'error');
        return false;
      } finally {
        setSaving(false);
      }
    };
    saveQueue.current = saveQueue.current.then(save, save);
    return saveQueue.current;
  }, [toast]);

  const value = useMemo(() => ({ state, loading, loadError, saving, updateState, toast, toasts, dismissToast }),
    [state, loading, loadError, saving, updateState, toast, toasts, dismissToast]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData must be used inside AppDataProvider');
  return context;
}
