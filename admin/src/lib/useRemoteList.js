import { useCallback, useEffect, useState } from 'react';

export function useRemoteList(load, dependencies = []) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try { const response = await load(); setData(response.data || []); setError(''); return response; }
    catch (err) { setError(err.message || 'Не удалось загрузить данные'); return null; }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  useEffect(() => { refresh(); }, [refresh]);
  return { data, setData, loading, error, refresh };
}
