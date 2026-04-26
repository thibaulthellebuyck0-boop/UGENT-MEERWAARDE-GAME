(() => {
  function createSocketShim() {
    const listeners = { game_update: [] };
    let activeCode = null;
    let polling = null;
    let lastUpdatedAt = 0;
    let pollFailures = 0;
    let lastPollError = null;

    function emitUpdate(state) {
      for (const fn of listeners.game_update || []) fn(state);
    }

    function wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function fetchJson(url, options = {}, timeoutMs = 9000) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...options, signal: ctrl.signal });
        const data = await res.json().catch(() => ({}));
        return data;
      } catch (error) {
        if (error?.name === "AbortError") {
          return { error: "Network timeout. Please retry." };
        }
        return { error: error?.message || "Network request failed." };
      } finally {
        clearTimeout(timer);
      }
    }

    async function api(action, payload = {}, options = {}) {
      const retries = Number.isInteger(options.retries) ? options.retries : 0;
      const retryDelayMs = options.retryDelayMs || 800;
      const retryOn = typeof options.retryOn === "function" ? options.retryOn : null;

      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const out = await fetchJson("/api/game", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        });

        if (!retryOn || !retryOn(out, attempt)) return out;
        await wait(retryDelayMs * (attempt + 1));
      }

      return { error: "Request failed after retries." };
    }

    async function poll() {
      if (!activeCode) return;
      try {
        const url = `/api/game?action=get_state&code=${encodeURIComponent(activeCode)}`;
        const data = await fetchJson(url, {}, 9000);
        if (data?.error) {
          pollFailures += 1;
          if (pollFailures >= 4 && data.error !== lastPollError) {
            lastPollError = data.error;
            emitUpdate({ meta: { connectionError: data.error, code: activeCode } });
          }
          return;
        }

        pollFailures = 0;
        lastPollError = null;
        if (data?.state?.meta?.updatedAt && data.state.meta.updatedAt > lastUpdatedAt) {
          lastUpdatedAt = data.state.meta.updatedAt;
          emitUpdate(data.state);
        }
      } catch (_) {
        pollFailures += 1;
      }
    }

    function startPolling(code) {
      if (!code) return;
      activeCode = code;
      if (!polling) polling = setInterval(poll, 1500);
      poll();
    }

    return {
      on(event, handler) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      },
      emit(event, payload, cb) {
        const done = typeof cb === "function" ? cb : () => {};
        (async () => {
          try {
            if (event === "host_create") {
              const out = await api("host_create", payload || {});
              if (out.code) startPolling(out.code);
              done(out);
              return;
            }
            if (event === "join_game") {
              const out = await api("join_game", payload || {}, {
                retries: 5,
                retryDelayMs: 700,
                retryOn: (resp) => {
                  const msg = String(resp?.error || "").toLowerCase();
                  return msg.includes("game not found") || msg.includes("timeout");
                },
              });
              if (!out.error && payload?.code) startPolling(payload.code);
              done(out);
              return;
            }
            if (event === "player_ready") {
              const out = await api("player_ready", payload || {});
              if (payload?.code) startPolling(payload.code);
              done(out);
              return;
            }
            if (event === "submit_orders") {
              const out = await api("submit_orders", payload || {});
              if (payload?.code) startPolling(payload.code);
              done(out);
              return;
            }
            if (event === "host_action") {
              const out = await api("host_action", {
                code: payload?.code,
                hostAction: payload?.action,
              });
              if (payload?.code) startPolling(payload.code);
              done(out);
              return;
            }
            done({ error: `Unsupported event: ${event}` });
          } catch (error) {
            done({ error: error?.message || "Request failed" });
          }
        })();
      },
    };
  }

  window.io = createSocketShim;
})();
