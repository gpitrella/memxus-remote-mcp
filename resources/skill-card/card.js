(function () {
  const root = document.getElementById('app');
  const channelTypes = new Set(['memxus-skill-card-payload', 'mcp:payload']);

  function safeText(value) {
    return typeof value === 'string' ? value : '';
  }

  function readPayload() {
    if (window.__MEMXUS_SKILL_CARD_PAYLOAD__) {
      return window.__MEMXUS_SKILL_CARD_PAYLOAD__;
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

  function button(label, className, disabled, onClick) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.disabled = disabled;
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
  }

  function render(payload) {
    if (!root) return;
    if (!payload || !Array.isArray(payload.skills) || payload.skills.length === 0) {
      root.innerHTML = '';
      const empty = document.createElement('section');
      empty.className = 'empty';
      const title = document.createElement('h1');
      title.textContent = 'Memxus';
      const body = document.createElement('p');
      body.textContent = payload && payload.userFacingTemplate
        ? safeText(payload.userFacingTemplate)
        : 'No skills available.';
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
    title.textContent = safeText(payload.topic || payload.actions && payload.actions.useLabel ? payload.topic || 'Skills' : 'Skills');
    const subtitle = document.createElement('p');
    subtitle.textContent = safeText(payload.userFacingTemplate || '');
    hero.append(title, subtitle);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const surface = document.createElement('span');
    surface.className = 'pill';
    surface.textContent = safeText(payload.surface || 'unknown');
    meta.append(surface);
    if (payload.notice) {
      const notice = document.createElement('span');
      notice.className = 'pill';
      notice.textContent = safeText(payload.notice);
      meta.append(notice);
    }
    hero.append(meta);
    card.append(hero);

    const skills = document.createElement('div');
    skills.className = 'skills';
    payload.skills.forEach(function (skill) {
      const section = document.createElement('section');
      section.className = 'skill';
      const heading = document.createElement('h2');
      heading.textContent = safeText(skill.name);
      const description = document.createElement('p');
      description.textContent = safeText(skill.description || skill.reason);
      const reason = document.createElement('p');
      reason.textContent = safeText(skill.reason);
      section.append(heading, description, reason);

      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.append(
        button(payload.actions.useLabel, 'primary', false, function () {
          bridgeCall('use_skill_in_chat', {
            skill_id: skill.id,
            collection: payload.collection,
            source_url: skill.sourceUrl,
          });
        }),
      );
      actions.append(
        button(payload.actions.installLabel, '', !skill.installAllowed, function () {
          bridgeCall('install_skill', {
            skill_id: skill.id,
            collection: payload.collection,
            install_command: skill.installCommand,
          });
        }),
      );
      actions.append(
        button(payload.actions.skipLabel, '', false, function () {
          bridgeCall('skip_skill', {
            skill_id: skill.id,
            collection: payload.collection,
            correlation_id: 'card:' + skill.id + ':' + Date.now(),
          });
        }),
      );
      if (skill.sourceUrl) {
        const docs = document.createElement('a');
        docs.className = 'action-link';
        docs.href = skill.sourceUrl;
        docs.target = '_blank';
        docs.rel = 'noopener noreferrer';
        docs.textContent = payload.actions.docsLabel;
        actions.append(docs);
      }
      section.append(actions);
      skills.append(section);
    });
    card.append(skills);

    if (payload.notice) {
      const notice = document.createElement('p');
      notice.className = 'notice';
      notice.textContent = safeText(payload.notice);
      card.append(notice);
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
