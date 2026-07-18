const CACHE_NAME = "cockpit-cache-v9.0.3";
const ASSETS_TO_CACHE = [
  "./", // A raiz
  "./index.html", // O HTML
  "./script.js", // O cérebro
  "./qualificacao_tecnica.json", // Os dados (importante!)
  "./manifest.json",
  // Adicione aqui qualquer CSS externo ou imagem que vc use localmente
];

// 1. Instalação: Baixa os arquivos para o celular
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
});

// 2. Requisição: Tenta pegar do cache primeiro, se falhar, vai pra internet
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    }),
  );
});

// 3. Atualização: Limpa caches antigos quando muda a versão
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        }),
      );
    }),
  );
});
