/**
 * persistedFetch — camada de persistência local para dados críticos
 *
 * Funcionamento:
 * - Tenta buscar dados do Supabase normalmente via a função `fetcher`
 * - Em caso de sucesso, salva no IndexedDB com timestamp `fetchedAt`
 * - Em caso de falha (offline), retorna o cache local se disponível
 * - NUNCA interfere com o Service Worker (o SW não cacheia Supabase)
 *
 * Uso:
 *   const { data, fetchedAt, fromCache } = await persistedFetch('dashboard:fazenda-123', () => supabaseFetch())
 */

const DB_NAME = 'irrigaagro-cache'
const STORE_NAME = 'queries'
const DB_VERSION = 1

interface CacheEntry<T> {
  key: string
  data: T
  fetchedAt: string // ISO timestamp
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getCached<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => resolve((req.result as CacheEntry<T>) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function setCached<T>(key: string, data: T): Promise<void> {
  try {
    const db = await openDB()
    const entry: CacheEntry<T> = { key, data, fetchedAt: new Date().toISOString() }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).put(entry)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {
    // IndexedDB indisponível (ex: modo privado Safari) — falha silenciosa
  }
}

export interface PersistedResult<T> {
  data: T | null
  fetchedAt: string | null
  fromCache: boolean
  error: unknown
}

/**
 * @param key     Identificador estável da query (ex: "dashboard:fazenda-123")
 * @param fetcher Função que retorna os dados do Supabase
 */
export async function persistedFetch<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<PersistedResult<T>> {
  try {
    const data = await fetcher()
    await setCached(key, data)
    return { data, fetchedAt: new Date().toISOString(), fromCache: false, error: null }
  } catch (error) {
    // Falhou (provavelmente offline) — tenta cache local
    const cached = await getCached<T>(key)
    if (cached) {
      return { data: cached.data, fetchedAt: cached.fetchedAt, fromCache: true, error }
    }
    return { data: null, fetchedAt: null, fromCache: false, error }
  }
}

/** Lê o cache sem tentar rede (útil para hidratação inicial enquanto fetcher está carregando) */
export async function readCache<T>(key: string): Promise<CacheEntry<T> | null> {
  return getCached<T>(key)
}
