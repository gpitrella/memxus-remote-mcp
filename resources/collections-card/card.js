(function () {
  const root = document.getElementById('app');
  const channelTypes = new Set(['memxus-collections-card-payload', 'mcp:payload']);

  function safeText(value) {
    return typeof value === 'string' ? value : '';
  }

  function readPayload() {
    if (window.__MEMXUS_COLLECTIONS_CARD_PAYLOAD__) {
      return window.__MEMXUS_COLLECTIONS_CARD_PAYLOAD__;
    }
    if (window.__MCP_PAYLOAD__) {
      return window.__MCP_PAYLOAD__;
    }
    const payloadParam = new URLSearchParams(window.location.search).get('payload');
    if (payloadParam) {
      try {
        return JSON.parse(payloadParam);
      } catch {}
    }
    return null;
  }

  function bridgeCall(action, payload) {
    try {
      if (window.app && typeof window.app.invokeAction === 'function') {
        window.app.invokeAction(action, payload);
        return true;
      }
      if (window.app && typeof window.app.sendMessage === 'function') {
        window.app.sendMessage({ type: 'memxus-action', action, payload });
        return true;
      }
    } catch {}

    try {
      window.parent.postMessage({ type: 'memxus-action', action, payload }, '*');
      return true;
    } catch {
      return false;
    }
  }

  function button(label, className, onClick) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
  }

  function renderCollection(item, payload) {
    const section = document.createElement('section');
    section.className = 'collection';
    section.addEventListener('click', function () {
      bridgeCall('select_collection', {
        collection: item.slug,
        include_skills: payload.includeSkills,
      });
    });

    const heading = document.createElement('h2');
    heading.textContent = safeText(item.name || item.slug);
    const description = document.createElement('p');
    description.textContent = safeText(item.description || item.slug);
    const count = document.createElement('div');
    count.className = 'count';
    count.textContent = String(item.memoryCount || 0) + ' memories';
    section.append(heading, description, count);
    return section;
  }

  function render(payload) {
    if (!root) return;
    if (!payload || !Array.isArray(payload.collections) || payload.collections.length === 0) {
      root.innerHTML = '';
      const empty = document.createElement('section');
      empty.className = 'empty';
      const title = document.createElement('h1');
      title.textContent = 'Memxus';
      const body = document.createElement('p');
      body.textContent = 'No collections available yet.';
      empty.append(title, body);
      root.append(empty);
      return;
    }

    root.innerHTML = '';
    const card = document.createElement('section');
    card.className = 'card';

    const hero = document.createElement('section');
    hero.className = 'hero';
    const title = document.createElement('h1');
    title.textContent = 'Memxus';
    const subtitle = document.createElement('p');
    subtitle.textContent = payload.includeSkills
      ? 'Choose a collection to load context and skills.'
      : 'Choose a collection to load context.';
    hero.append(title, subtitle);
    card.append(hero);

    const list = document.createElement('div');
    list.className = 'collections';
    payload.collections.forEach(function (item) {
      list.append(renderCollection(item, payload));
    });
    card.append(list);

    if (payload.showMore) {
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.append(
        button(payload.actions.showMoreLabel || 'See more', 'primary', function () {
          bridgeCall('show_all_collections', { include_skills: payload.includeSkills });
        }),
      );
      card.append(actions);
    }

    if (payload.tokensSaved) {
      const savings = document.createElement('p');
      savings.className = 'savings';
      savings.textContent = 'Tokens saved: ' + String(payload.tokensSaved);
      card.append(savings);
    }

    root.append(card);
  }

  window.addEventListener('message', function (event) {
    const data = event && event.data;
    if (data && channelTypes.has(data.type) && data.payload) {
      render(data.payload);
    }
  });

  render(readPayload());
})();
