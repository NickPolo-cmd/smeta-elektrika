/*
 * Автономная работа и обновления (п. 34).
 *
 * Что здесь важно (сбой 29.09.2026: после выкладки новой версии экран оставался белым):
 *  1. Страница index.html всегда берётся с сервера заново (cache: 'no-cache'), а не из HTTP-кэша
 *     браузера. У GitHub Pages он хранит страницу 10 минут; старая страница ссылалась на уже
 *     удалённые файлы, и приложение не запускалось.
 *  2. При установке в кэш кладётся всё, что нужно для запуска без интернета: страница, скрипты,
 *     стили, шрифты, картинки. Список файлов и номер сборки подставляет сборка
 *     (vite.config.ts → scripts/sw-precache.ts). Не скачалось обязательное — новая версия не
 *     ставится, остаётся прежняя рабочая (лучше старая целая, чем новая недокачанная).
 *  3. Файлы в assets/ названы по содержимому и не меняются: берём из кэша, иначе из сети.
 *  4. Данные хранит сама программа в базе телефона, здесь только файлы оболочки.
 */

// Три «метки» ниже сборка заменяет настоящими значениями (в режиме разработки остаются как есть).
const BUILD = "236404860d"
const CORE = /*__CORE__*/ ["assets/index-BkVul6rO.css","assets/index-CGWDpD6I.js","assets/rolldown-runtime-Dd_uD5pT.js"]
const EXTRA = /*__EXTRA__*/ ["apple-touch-icon.png","assets/GolosText-400-cyr-BhLd7jiz.woff2","assets/GolosText-400-lat-CeRm3aSN.woff2","assets/Unbounded-600-cyr-CMRaHTP9.woff2","assets/Unbounded-600-lat-D6nRMoFF.woff2","assets/jszip.min-B4TBn35v.js","assets/logo-CgnWua25.png","assets/logo-light-Cwq8FPU8.png","assets/xlsx-DHCFG6EP.js","favicon.ico","icon-192.png","icon-512.png","images/empty-consumers.jpg","images/empty-materials.jpg","images/empty-objects.jpg","images/empty-recommendations.jpg","images/empty-techcards.jpg","images/header-electric.jpg","images/header-objects.jpg","images/header-regulatory.jpg","images/header-safety.jpg","images/header-schemes.jpg","manifest.webmanifest"]

const CACHE_PREFIX = 'smeta-shell-'
const CACHE = CACHE_PREFIX + BUILD

// Приложение может лежать и в корне сайта, и в подпапке — берём адрес самого работника.
const BASE = new URL('./', self.location.href).pathname
const HOME = `${BASE}index.html`
const ASSETS = `${BASE}assets/`

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return

  if (req.mode === 'navigate' && isPage(url.pathname)) {
    e.respondWith(openPage())
  } else if (url.pathname.startsWith(ASSETS)) {
    e.respondWith(cacheFirst(req, e))
  } else {
    e.respondWith(staleWhileRevalidate(req, e))
  }
})

async function precache() {
  const cache = await caches.open(CACHE)
  // Обязательное: страница и всё, без чего она не запустится. Любой сбой отменяет установку.
  await Promise.all([HOME, ...CORE.map((p) => BASE + p)].map((url) => store(cache, url)))
  // Остальное — по возможности: сбой сети не должен мешать обновлению.
  await Promise.allSettled(EXTRA.map((p) => store(cache, BASE + p)))
}

async function store(cache, url) {
  // Файл с хэшем в названии не меняется: если он уже лежит в кэше прошлой версии, заново не качаем.
  if (url.startsWith(ASSETS)) {
    const have = await caches.match(url)
    if (have) return cache.put(url, have)
  }
  const res = await fetch(url, { cache: 'reload' })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return cache.put(url, res)
}

/** Экраны приложения (адрес без расширения файла): у них одна страница — index.html. */
function isPage(pathname) {
  const last = pathname.slice(pathname.lastIndexOf('/') + 1)
  return last === '' || last === 'index.html' || !last.includes('.')
}

/** Сначала сеть, при её отсутствии — сохранённая страница. Копию из HTTP-кэша браузера не берём. */
async function openPage() {
  let res
  try {
    res = await fetch(HOME, { cache: 'no-cache' })
    if (res.ok) return res
  } catch {
    // Нет сети — ниже берём страницу, сохранённую при установке.
  }
  const saved = await caches.match(HOME)
  return saved || res || Response.error()
}

async function cacheFirst(req, e) {
  const hit = await caches.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) e.waitUntil(caches.open(CACHE).then((c) => c.put(req, res.clone())))
  return res
}

/** Значки, картинки, манифест: отдаём то, что есть, и обновляем в фоне. */
async function staleWhileRevalidate(req, e) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  const update = fetch(req).then(
    (res) => {
      if (res.ok) cache.put(req, res.clone())
      return res
    },
    () => undefined,
  )
  if (hit) {
    e.waitUntil(update)
    return hit
  }
  return (await update) || Response.error()
}
