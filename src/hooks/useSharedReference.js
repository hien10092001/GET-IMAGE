import { useEffect, useRef, useState } from 'react'
import api from '../services/api'

const parseItems = (raw) => {
  try {
    const value = JSON.parse(raw || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export default function useSharedReference(scope, type, storageKey) {
  const [items, setItems] = useState(() => parseItems(localStorage.getItem(storageKey)))
  const loadedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadedRef.current = false
    const load = async () => {
      try {
        const res = await api.get(`/references/${scope}/${type}`)
        if (cancelled) return
        const serverItems = Array.isArray(res.data?.items) ? res.data.items : []
        if (serverItems.length > 0) {
          setItems(serverItems)
        } else {
          const localItems = parseItems(localStorage.getItem(storageKey))
          if (localItems.length > 0) {
            setItems(localItems)
            api.put(`/references/${scope}/${type}`, { items: localItems }).catch(() => {})
          }
        }
      } catch {
        if (!cancelled) setItems(parseItems(localStorage.getItem(storageKey)))
      } finally {
        if (!cancelled) loadedRef.current = true
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [scope, type, storageKey])

  useEffect(() => {
    if (!loadedRef.current) return
    localStorage.setItem(storageKey, JSON.stringify(items))
    api.put(`/references/${scope}/${type}`, { items }).catch(() => {})
  }, [items, scope, type, storageKey])

  return [items, setItems]
}
