/**
 * useMemory.ts
 *
 * Loads, searches, and deletes memory entries from the API.
 * Used by MemoryPanel and the /settings/memory page.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { memory as memoryApi, type MemoryEntry } from '../api-client';

export function useMemory() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await memoryApi.list();
      setEntries(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      fetchAll();
      return;
    }
    setSearching(true);
    try {
      const results = await memoryApi.search(q);
      setEntries(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [fetchAll]);

  const deleteEntry = useCallback(async (id: string) => {
    await memoryApi.delete(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return {
    entries,
    loading,
    error,
    query,
    searching,
    search,
    deleteEntry,
    refetch: fetchAll,
  };
}
