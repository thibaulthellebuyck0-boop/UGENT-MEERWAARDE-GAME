(() => {
  function createSocketShim() {
    const listeners = { game_update: [] };
    let activeCode = null;
    let polling = null;
    let lastUpdatedAt = 0;

    function emitUpdate(state) {
      for (const fn of listeners.game_update || []) fn(state);
    }

    async function api(action, payload = {}) {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      return res.json();
    }

    async function poll() {
      if (!activeCode) return;
      try {
        const url = `/api/game?action=get_state&code=${encodeURIComponent(activeCode)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data?.state?.meta?.updatedAt && data.state.meta.updatedAt > lastUpdatedAt) {
          lastUpdatedAt = data.state.meta.updatedAt;
          emitUpdate(data.state);
        }
      } catch (_) {
        // Keep silent in UI; next poll retries.
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
              const out = await api("join_game", payload || {});
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
