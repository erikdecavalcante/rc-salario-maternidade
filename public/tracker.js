/**
 * track.rcsalariomaternidade.com.br — script de captura client-side.
 *
 * Uso na LP (www.rcsalariomaternidade.com.br e qualquer subdomínio dela):
 *   <script src="https://track.rcsalariomaternidade.com.br/tracker.js" async></script>
 *
 * Carrega o Meta Pixel e o gtag.js dinamicamente (pixel_id/measurement_id
 * vêm do painel, não hardcoded), identifica o visitante e expõe:
 *
 *   window.trckUserId          -> string, usar em qualquer link que precise
 *                                       carregar a atribuição (WhatsApp, etc).
 *   window.trackEvent(name, params) -> dispara pro pixel, pro gtag e pro
 *                                       servidor (Meta CAPI dedup via event_id).
 *                                       params aceita value/currency/content_*
 *                                       (ecommerce, não usado nesta LP) e
 *                                       também email/phone/name (identidade —
 *                                       ex: formulário de lead; sem isso o
 *                                       servidor nunca sabe quem é o
 *                                       visitante, só o trck_user_id).
 *                                       NÃO usar `params` pra dado sensível
 *                                       (ex: "situação" — gravidez, emprego):
 *                                       vira parâmetro de evento visível no
 *                                       Gerenciador de Eventos da Meta e no
 *                                       GA4, o que a LGPD não permite pra
 *                                       dado de saúde/trabalho. Mesma
 *                                       decisão já tomada no rcTrack (site).
 *   window.trckAppendTracking(url) -> Promise<string>, retorna a url com
 *                                       utm_term=trck_user_id + demais utms
 *                                       da LP anexados. Usar sempre que um
 *                                       link de saída (WhatsApp, formulário
 *                                       externo etc) for montado/navegado via
 *                                       JS (não um <a href> estático). Em
 *                                       links wa.me isso não muda o que
 *                                       aparece no chat (WhatsApp ignora
 *                                       query string), mas mantém a URL
 *                                       consistente caso um passo futuro
 *                                       precise ler o trck_user_id dela.
 *                                       Alias: window.trckCheckoutUrl
 *                                       (nome herdado do projeto irmão
 *                                       track.advflowpro.com, mantido só
 *                                       por compatibilidade).
 *
 * Recipe pra esta LP (dois pontos de captura, nenhum checkout — o fluxo é
 * só Lead -> WhatsApp):
 *
 *   1) Formulário principal (nome + telefone + situação), no onSubmit,
 *      ANTES de marcar como enviado:
 *        window.trackEvent("Lead", { name: fName, phone: fPhone });
 *
 *   2) Modal "Falar no WhatsApp" (nome + telefone + situação), no submitWa,
 *      ANTES de abrir o wa.me:
 *        window.trackEvent("Contact", { name: wName, phone: wPhone });
 *        window.open("https://wa.me/" + WA_NUMBER + "?text=" + msg, "_blank");
 *
 *   Em ambos os casos, "situação" (fType/wType) fica de fora do trackEvent
 *   pelo motivo do LGPD acima — segue só pro capture_lead() da própria LP
 *   (supabase-config.js), que é o lugar certo pra esse dado.
 *
 * Persistência do trck_user_id: cookie no domínio raiz (ex:
 * .rcsalariomaternidade.com.br, não no subdomínio atual) — assim o id
 * sobrevive entre www. e qualquer outro subdomínio que a LP passe a usar.
 * localStorage sozinho NÃO funcionaria aqui (é isolado por subdomínio).
 * Cookie setado pela nossa API (track.rcsalariomaternidade.com.br) também
 * não serviria — é cross-origin em relação ao site, cairia no domínio
 * errado. Por isso o cookie é setado aqui, pelo próprio script, rodando no
 * contexto do subdomínio do site.
 *
 * Limitação conhecida: Safari (ITP) limita a 7 dias cookies escritos via JS
 * (document.cookie) quando classificados como tracking — mesma limitação que
 * o _fbp/_fbc do próprio Meta Pixel sofrem. Sem workaround client-side limpo;
 * o fallback de matching por email/telefone no servidor cobre esse caso.
 */
(function () {
  "use strict";

  var currentScript = document.currentScript;
  var API_BASE = currentScript ? new URL(currentScript.src).origin : "";

  var STORAGE_KEY = "trck_uid";
  var LANDING_KEY = "trck_landing_url";
  var COOKIE_DAYS = 730;

  function getRootDomain() {
    var host = window.location.hostname;
    if (host === "localhost" || /^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return null;
    var parts = host.split(".");
    if (parts.length <= 2) return host;
    return parts.slice(-2).join(".");
  }

  var ROOT_DOMAIN = getRootDomain();

  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 86400000).toUTCString();
    var cookie = name + "=" + encodeURIComponent(value) + "; expires=" + expires + "; path=/; SameSite=Lax";
    if (ROOT_DOMAIN) cookie += "; domain=." + ROOT_DOMAIN;
    document.cookie = cookie;
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  var CAPTURED_UTMS = {
    utm_source: getQueryParam("utm_source"),
    utm_medium: getQueryParam("utm_medium"),
    utm_campaign: getQueryParam("utm_campaign"),
    utm_content: getQueryParam("utm_content"),
  };

  function getStoredTrckUserId() {
    var fromCookie = getCookie(STORAGE_KEY);
    if (fromCookie) return fromCookie;
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function storeTrckUserId(id) {
    setCookie(STORAGE_KEY, id, COOKIE_DAYS);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* localStorage indisponível (modo privado etc) — o cookie já cobre a persistência */
    }
  }

  function getLandingUrl() {
    var stored = getCookie(LANDING_KEY);
    if (stored) return stored;
    setCookie(LANDING_KEY, window.location.href, COOKIE_DAYS);
    return window.location.href;
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  var gaMeasurementId = null;

  function loadMetaPixel(pixelIds) {
    if (!window.fbq) {
      /* eslint-disable */
      !(function (f, b, e, v, n, t, s) {
        if (f.fbq) return;
        n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = true;
        n.version = "2.0";
        n.queue = [];
        t = b.createElement(e);
        t.async = true;
        t.src = v;
        s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s);
      })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      /* eslint-enable */
    }
    pixelIds.forEach(function (id) {
      window.fbq("init", id);
    });
  }

  function loadGa4(measurementIds) {
    gaMeasurementId = measurementIds[0];
    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      function () {
        window.dataLayer.push(arguments);
      };
    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(gaMeasurementId);
    document.head.appendChild(script);
    window.gtag("js", new Date());
    measurementIds.forEach(function (id) {
      window.gtag("config", id);
    });
  }

  function getGaIds() {
    return new Promise(function (resolve) {
      if (typeof window.gtag !== "function" || !gaMeasurementId) {
        return resolve({ clientId: null, sessionId: null });
      }
      var clientId = null;
      var sessionId = null;
      var pending = 2;
      function done() {
        pending -= 1;
        if (pending === 0) resolve({ clientId: clientId, sessionId: sessionId });
      }
      window.gtag("get", gaMeasurementId, "client_id", function (id) {
        clientId = id || null;
        done();
      });
      window.gtag("get", gaMeasurementId, "session_id", function (id) {
        sessionId = id || null;
        done();
      });
    });
  }

  function identify() {
    return getGaIds().then(function (gaIds) {
      var body = {
        trck_user_id: getStoredTrckUserId() || undefined,
        fbp: getCookie("_fbp") || undefined,
        fbc: getCookie("_fbc") || undefined,
        ga_client_id: gaIds.clientId || undefined,
        ga_session_id: gaIds.sessionId || undefined,
        utm_source: CAPTURED_UTMS.utm_source || undefined,
        utm_medium: CAPTURED_UTMS.utm_medium || undefined,
        utm_campaign: CAPTURED_UTMS.utm_campaign || undefined,
        utm_term: getQueryParam("utm_term") || undefined,
        utm_content: CAPTURED_UTMS.utm_content || undefined,
        referrer: document.referrer || undefined,
        landing_url: getLandingUrl(),
      };
      return fetch(API_BASE + "/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          storeTrckUserId(data.trck_user_id);
          window.trckUserId = data.trck_user_id;
          return data.trck_user_id;
        });
    });
  }

  var configPromise = fetch(API_BASE + "/api/config/public")
    .then(function (res) {
      return res.json();
    })
    .catch(function () {
      return { ga4_measurement_ids: [], meta_pixel_ids: [] };
    });

  var identifyPromise = configPromise.then(function (config) {
    if (config.meta_pixel_ids && config.meta_pixel_ids.length) loadMetaPixel(config.meta_pixel_ids);
    if (config.ga4_measurement_ids && config.ga4_measurement_ids.length) loadGa4(config.ga4_measurement_ids);
    return identify();
  });

  function trackEvent(eventName, params) {
    params = params || {};
    var eventId = uuid();

    return identifyPromise.then(function (trckUserId) {
      if (window.fbq) window.fbq("track", eventName, params, { eventID: eventId });
      if (window.gtag) window.gtag("event", eventName, params);

      return getGaIds().then(function (gaIds) {
        var body = {
          event_id: eventId,
          event_name: eventName,
          trck_user_id: trckUserId,
          event_source_url: window.location.href,
          value: params.value,
          currency: params.currency,
          content_ids: params.content_ids,
          content_name: params.content_name,
          content_type: params.content_type,
          email: params.email,
          phone: params.phone,
          name: params.name,
          utm_source: CAPTURED_UTMS.utm_source || undefined,
          utm_medium: CAPTURED_UTMS.utm_medium || undefined,
          utm_campaign: CAPTURED_UTMS.utm_campaign || undefined,
          utm_term: getQueryParam("utm_term") || undefined,
          utm_content: CAPTURED_UTMS.utm_content || undefined,
          fbp: getCookie("_fbp") || undefined,
          fbc: getCookie("_fbc") || undefined,
          ga_client_id: gaIds.clientId || undefined,
          ga_session_id: gaIds.sessionId || undefined,
        };
        fetch(API_BASE + "/api/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive: true,
        }).catch(function () {});
        return eventId;
      });
    });
  }

  // Pra links de saída montados em runtime (ex: wa.me montado no submitWa
  // antes do window.open): injeta utm_term=trck_user_id + as demais utms
  // capturadas na LP, preservando os query params que a URL já tiver. Async
  // porque pode ser chamado antes do identify() resolver.
  function buildTrackedUrl(baseUrl, trckUserId) {
    var url;
    try {
      url = new URL(baseUrl, window.location.href);
    } catch {
      return baseUrl;
    }
    Object.keys(CAPTURED_UTMS).forEach(function (key) {
      if (CAPTURED_UTMS[key]) url.searchParams.set(key, CAPTURED_UTMS[key]);
    });
    if (trckUserId) url.searchParams.set("utm_term", trckUserId);
    return url.toString();
  }

  window.trckIdentify = function () {
    return identifyPromise;
  };
  window.trackEvent = trackEvent;
  window.trckAppendTracking = function (baseUrl) {
    return identifyPromise.then(function (trckUserId) {
      return buildTrackedUrl(baseUrl, trckUserId);
    });
  };
  // Alias por compatibilidade com o nome usado no projeto irmão (checkout
  // via Guru) — mesmo comportamento, nome genérico é o recomendado aqui.
  window.trckCheckoutUrl = window.trckAppendTracking;

  // PageView automático — o Meta Pixel não dispara sozinho, precisa do track().
  identifyPromise.then(function () {
    trackEvent("PageView", {});
  });
})();
