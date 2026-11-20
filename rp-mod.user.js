// ==UserScript==
// @name         RP Mod — Щит
// @namespace    rp-mod
// @version      0.16.0
// @description  Точечная защита от игроков одним переключателем в панели Bondage Club
// @author       Mey-foxy
// @match        https://www.bondageprojects.elementfx.com/R*/*
// @match        https://bondage-europe.com/R*/*
// @match        https://bondage-asia.com/R*/*
// @match        https://asia.bondageprojects.com/R*/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  console.log('[RP Mod] Лоадер запущен (v0.16.0)');

  const SHIELD_KEY = 'rp_mod_shield_state';
  const MUTE_TYPES = ['Chat', 'Whisper', 'Emote', 'Action', 'Activity', 'Status'];

  // Подсветка активной кнопки «ВКЛ»
  const style = document.createElement('style');
  style.textContent = '@keyframes rpmodGlow{0%,100%{box-shadow:0 0 3px 1px rgba(68,255,68,0.6);}50%{box-shadow:0 0 10px 3px rgba(68,255,68,0.9);}}';
  document.head.appendChild(style);

  function defaultState() {
    return { enabled: true, spy: true, protectedList: [] };
  }

  function getShieldState() {
    const raw = localStorage.getItem(SHIELD_KEY);
    if (!raw) return defaultState();
    let state;
    try {
      state = JSON.parse(raw);
    } catch (e) {
      return defaultState();
    }
    if (!state || typeof state !== 'object') return defaultState();
    if (!Array.isArray(state.protectedList)) state.protectedList = [];
    if (typeof state.enabled !== 'boolean') state.enabled = true;
    if (typeof state.spy !== 'boolean') state.spy = true;
    // Миграция со старых версий: призраки и блок-листы становятся «ВКЛ»
    ['blockList', 'muteList', 'ghostList'].forEach(function(key) {
      if (Array.isArray(state[key])) {
        state[key].forEach(function(n) {
          if (typeof n === 'number' && state.protectedList.indexOf(n) === -1) state.protectedList.push(n);
        });
        delete state[key];
      }
    });
    ['protection', 'clothingGuard', 'restrictionsGuard', 'trustList'].forEach(function(key) {
      if (key in state) delete state[key];
    });
    return state;
  }

  function saveShieldState(state) {
    localStorage.setItem(SHIELD_KEY, JSON.stringify(state));
  }

  function isProtected(num) { return getShieldState().protectedList.indexOf(num) !== -1; }

  function anyProtected() { return getShieldState().protectedList.length > 0; }

  function setProtection(num, on) {
    const s = getShieldState();
    const i = s.protectedList.indexOf(num);
    if (on && i === -1) {
      s.protectedList.push(num);
      saveShieldState(s);
      console.warn('[RP Mod] 🛡 Защита ВКЛ от: ' + nameOf(num) + ' (#' + num + ')');
    } else if (!on && i !== -1) {
      s.protectedList.splice(i, 1);
      saveShieldState(s);
      console.log('[RP Mod] Защита снята с: ' + nameOf(num) + ' (#' + num + ')');
    }
    updateBadge();
    renderPanel();
  }

  let myMemberNumber = null;
  let allowOwnSyncUntil = 0;

  function nameOf(num) {
    try {
      if (typeof ChatRoomCharacter !== 'undefined') {
        for (let i = 0; i < ChatRoomCharacter.length; i++) {
          if (ChatRoomCharacter[i].MemberNumber === num) return ChatRoomCharacter[i].Name;
        }
      }
    } catch (e) {}
    return '#' + num;
  }

  function numberByName(name) {
    try {
      if (typeof ChatRoomCharacter !== 'undefined') {
        for (let i = 0; i < ChatRoomCharacter.length; i++) {
          if (ChatRoomCharacter[i].Name && String(ChatRoomCharacter[i].Name).toLowerCase() === String(name).toLowerCase()) {
            return ChatRoomCharacter[i].MemberNumber;
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function resolvePlayer(input) {
    if (typeof input === 'number') return input;
    const n = parseInt(String(input).trim(), 10);
    if (!isNaN(n) && String(input).trim() === String(n)) return n;
    return numberByName(input);
  }

  function roomCharacters() {
    try {
      if (typeof ChatRoomCharacter !== 'undefined' && Array.isArray(ChatRoomCharacter)) {
        return ChatRoomCharacter.filter(function(c) { return c && c.MemberNumber; });
      }
    } catch (e) {}
    return [];
  }

  function othersInRoom() {
    return roomCharacters().filter(function(c) { return c.MemberNumber !== myMemberNumber; });
  }

  function describe(msg) {
    const who = nameOf(msg.Sender);
    const act = msg.Content || 'неизвестное действие';
    const detail = [];
    try {
      for (let i = 0; i < msg.Dictionary.length; i++) {
        const d = msg.Dictionary[i];
        if ((d.Tag === 'NextAsset' || d.Tag === 'PrevAsset') && d.AssetName) {
          detail.push(d.AssetName + ' (' + d.GroupName + ')');
        }
        if (d.ActivityName) detail.push(d.ActivityName);
      }
    } catch (e) {}
    return who + ' — ' + act + (detail.length ? ' [' + detail.join(', ') + ']' : '');
  }

  function extractCharacter(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.Character && typeof payload.Character === 'object' && payload.Character.MemberNumber) {
      return payload.Character;
    }
    if (payload.MemberNumber) return payload;
    return null;
  }

  function socketFilter(packet) {
    if (!packet || !packet.data || !packet.data.length) return false;
    if (packet.__rpmodChecked) return false;
    packet.__rpmodChecked = true;

    const state = getShieldState();
    if (!state.enabled) return false;

    if (typeof Player !== 'undefined' && Player && Player.MemberNumber) {
      myMemberNumber = Player.MemberNumber;
    }

    const name = packet.data[0];

    if (window.RPModDebug && typeof name === 'string') {
      let payload = '';
      try { payload = JSON.stringify(packet.data[1]); } catch (e) { payload = String(packet.data[1]); }
      console.log('[RP Mod][DEBUG] ' + name + ' → ' + payload);
    }

    if (typeof name === 'string') {
      const p = packet.data[1];
      if (p && typeof p === 'object') {
        // Бипы от защищённых от игроков
        if (name.indexOf('Beep') !== -1 && typeof p.MemberNumber === 'number' && isProtected(p.MemberNumber)) {
          console.log('[RP Mod] 🛡 Бип погашен от #' + p.MemberNumber);
          return true;
        }
        // Любые пакеты от защищённых от игроков
        const sender = typeof p.Sender === 'number' ? p.Sender : null;
        if (sender !== null && isProtected(sender) && name.indexOf('Sync') === -1) {
          console.log('[RP Mod] 🛡 Пакет погашен: ' + name + ' от ' + nameOf(sender) + ' (#' + sender + ')');
          return true;
        }
      }
    }

    // Синхронизация моей внешности: пока есть хоть одна активная защита,
    // чужие пакеты гасим, но свои свежие отправки пропускаем
    if (name === 'ChatRoomSyncSingle' || name === 'ChatRoomSyncCharacter' || name === 'ChatRoomSyncCharacterRemove' || name === 'ChatRoomSync') {
      if (anyProtected() && Date.now() >= allowOwnSyncUntil) {
        let touchesMe = false;
        if (name === 'ChatRoomSync') {
          const room = packet.data[1];
          if (room && Array.isArray(room.Character)) {
            for (let i = 0; i < room.Character.length; i++) {
              if (room.Character[i].MemberNumber === myMemberNumber) { touchesMe = true; break; }
            }
          }
        } else {
          const c = extractCharacter(packet.data[1]);
          touchesMe = !!(c && c.MemberNumber === myMemberNumber);
        }
        if (touchesMe) {
          console.log('[RP Mod] 🛡 Синхронизация моей внешности погашена (защита активна)');
          return true;
        }
      }
      return false;
    }

    const msg = packet.data[1];
    if (!msg || typeof msg !== 'object' || typeof msg.Sender !== 'number') return false;
    if (msg.Sender === myMemberNumber) return false;

    // Защищённые от игроки: гасим все их сообщения молча
    if (isProtected(msg.Sender) && MUTE_TYPES.indexOf(msg.Type) !== -1) {
      console.log('[RP Mod] 🛡 Сообщение погашено: ' + describe(msg));
      return true;
    }

    // Слежка: наблюдения в консоль, окон нет
    if (state.spy && (msg.Type === 'Action' || msg.Type === 'Activity')) {
      console.log('[RP Mod] 👀 Наблюдение: ' + describe(msg));
    }
    return false;
  }

  function hookSocket() {
    if (typeof ServerSocket === 'undefined' || !ServerSocket) {
      console.warn('[RP Mod] ServerSocket не найден — работает только запасной фильтр');
      return;
    }
    const proto = Object.getPrototypeOf(ServerSocket);
    if (proto && typeof proto.onevent === 'function' && !proto.__rpmodPatched) {
      const protoOnevent = proto.onevent;
      proto.onevent = function(packet) {
        try {
          if (socketFilter(packet)) return;
        } catch (e) {
          console.error('[RP Mod] Ошибка сокет-фильтра: ' + e.message);
        }
        return protoOnevent.apply(this, arguments);
      };
      proto.__rpmodPatched = true;
      console.log('[RP Mod] Сокет-фильтр (прототип) установлен');
    }
    if (typeof ServerSocket.onevent === 'function' && !ServerSocket.__rpmodPatched) {
      const nextOnevent = ServerSocket.onevent;
      ServerSocket.onevent = function(packet) {
        try {
          if (socketFilter(packet)) return;
        } catch (e) {
          console.error('[RP Mod] Ошибка сокет-фильтра: ' + e.message);
        }
        return nextOnevent.apply(this, arguments);
      };
      ServerSocket.__rpmodPatched = true;
      console.log('[RP Mod] Сокет-фильтр установлен — пакеты проверяются ДО игры и модов');
    }
  }

  function hookChatRoomMessage() {
    if (typeof ChatRoomMessage !== 'function') return;
    const originalMessage = ChatRoomMessage;
    window.ChatRoomMessage = function(data) {
      try {
        if (typeof Player !== 'undefined' && Player && Player.MemberNumber) {
          myMemberNumber = Player.MemberNumber;
        }
        if (data && data.Sender !== myMemberNumber) {
          if (isProtected(data.Sender) && MUTE_TYPES.indexOf(data.Type) !== -1) return;
        }
      } catch (e) {
        console.error('[RP Mod] Ошибка запасного фильтра: ' + e.message);
      }
      return originalMessage.apply(this, arguments);
    };
    console.log('[RP Mod] Запасной фильтр ChatRoomMessage активен');
  }

  function hookServerSend() {
    const originalSend = ServerSend;
    window.ServerSend = function(type) {
      try {
        if (type === 'ChatRoomCharacterUpdate' || type === 'ChatRoomPoseUpdate' ||
            (typeof type === 'string' && (type.indexOf('Appearance') !== -1 || type.indexOf('Clothes') !== -1))) {
          allowOwnSyncUntil = Date.now() + 5000;
        }
      } catch (e) {}
      return originalSend.apply(this, arguments);
    };
    console.log('[RP Mod] Свои изменения внешности отслеживаются');
  }

  // --- Панель ---
  let panelEl = null;
  let toggleBtn = null;

  function ensurePanel() {
    if (toggleBtn) return;

    toggleBtn = document.createElement('div');
    toggleBtn.textContent = '🛡';
    toggleBtn.style.cssText = 'position:fixed;z-index:99999;top:8px;right:8px;min-width:34px;height:34px;line-height:34px;text-align:center;cursor:pointer;background:rgba(30,30,40,0.85);color:#fff;border-radius:8px;user-select:none;font-size:16px;padding:0 6px;';
    toggleBtn.title = 'RP Mod — Щит';
    toggleBtn.addEventListener('click', togglePanel);
    document.body.appendChild(toggleBtn);

    panelEl = document.createElement('div');
    panelEl.style.cssText = 'position:fixed;z-index:99999;top:48px;right:8px;width:300px;max-height:70vh;overflow-y:auto;background:rgba(30,30,40,0.95);color:#eee;border-radius:8px;padding:10px;display:none;box-shadow:0 4px 16px rgba(0,0,0,0.5);font-family:Arial,sans-serif;font-size:13px;';
    document.body.appendChild(panelEl);
    renderPanel();
    updateBadge();

    // Кнопка и панель следят за комнатой
    setInterval(function() {
      updateBadge();
      if (panelEl && panelEl.style.display !== 'none') renderPanel();
    }, 2000);
  }

  function togglePanel() {
    if (!panelEl) return;
    const show = panelEl.style.display === 'none';
    panelEl.style.display = show ? 'block' : 'none';
    if (show) renderPanel();
  }

  function updateBadge() {
    if (!toggleBtn) return;
    const s = getShieldState();
    const others = othersInRoom();
    const count = others.length;
    toggleBtn.textContent = '🛡' + (count ? ' ' + count : '');
    const names = others.map(function(c) {
      return c.Name + (isProtected(c.MemberNumber) ? ' 🛡' : '');
    });
    toggleBtn.title = 'RP Mod — Щит\nВ комнате: ' + (names.length ? names.join(', ') : 'никого');
    // Подсветка кнопки: красная, если есть неприсмотренные; зелёная, если у всех защита; тёмная — пусто
    const unwatched = others.filter(function(c) { return !isProtected(c.MemberNumber); }).length;
    if (count && unwatched) {
      toggleBtn.style.background = 'rgba(139,26,26,0.9)';
    } else if (count) {
      toggleBtn.style.background = 'rgba(26,107,26,0.9)';
    } else {
      toggleBtn.style.background = 'rgba(30,30,40,0.85)';
    }
  }

  function btn(label, handler, extra) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'margin:2px;padding:3px 9px;border:1px solid #666;border-radius:5px;background:#3a3a4a;color:#fff;cursor:pointer;font-size:12px;';
    if (extra) b.style.cssText += extra;
    b.addEventListener('click', handler);
    return b;
  }

  function renderPanel() {
    if (!panelEl) return;
    const s = getShieldState();
    panelEl.innerHTML = '';

    const title = document.createElement('div');
    title.textContent = '🛡 RP Mod — Щит';
    title.style.cssText = 'font-weight:bold;margin-bottom:6px;';
    panelEl.appendChild(title);

    panelEl.appendChild(btn('выключить всё', function() {
      const st = getShieldState();
      st.protectedList = [];
      saveShieldState(st);
      updateBadge();
      renderPanel();
      console.log('[RP Mod] Защита снята со всех');
    }, 'font-size:11px;padding:2px 8px;background:#2a2a34;border-color:#555;color:#999;'));
    panelEl.appendChild(btn(s.spy ? 'слежка: ВКЛ' : 'слежка: выкл', function() {
      const st = getShieldState();
      st.spy = !st.spy;
      saveShieldState(st);
      renderPanel();
    }, 'font-size:11px;padding:2px 8px;background:#2a2a34;border-color:#555;color:#999;'));

    const chars = othersInRoom();
    const list = document.createElement('div');
    list.style.cssText = 'margin-top:8px;';
    if (!chars.length) {
      const empty = document.createElement('div');
      empty.textContent = 'В комнате только ты (или ты не в комнате)';
      empty.style.cssText = 'color:#aaa;font-size:12px;';
      list.appendChild(empty);
    }
    chars.forEach(function(c) {
      const num = c.MemberNumber;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:3px 0;padding:4px 6px;border-radius:5px;background:rgba(255,255,255,0.06);';
      const label = document.createElement('span');
      label.textContent = c.Name + ' (' + num + ')';
      if (isProtected(num)) label.style.color = '#ff8888';
      row.appendChild(label);
      const btns = document.createElement('div');
      const on = isProtected(num);
      btns.appendChild(btn('ВКЛ', function() { setProtection(num, true); },
        on ? 'background:#1a6b1a;border-color:#44ff44;animation:rpmodGlow 1.5s infinite;' : 'opacity:0.45;'));
      btns.appendChild(btn('выкл', function() { setProtection(num, false); },
        on ? 'opacity:0.45;' : ''));
      row.appendChild(btns);
      list.appendChild(row);
    });
    panelEl.appendChild(list);
  }

  window.RPModShield = {
    protection: function(who, on) {
      const num = resolvePlayer(who);
      if (!num) { console.log('[RP Mod] Не нашёл игрока: ' + who); return; }
      setProtection(num, on === undefined ? !isProtected(num) : !!on);
    },
    list: function() {
      const s = getShieldState();
      console.log('[RP Mod] Под защитой: ' + (s.protectedList.length ? s.protectedList.map(function(n){return nameOf(n)+' (#'+n+')';}).join(', ') : 'никто'));
    },
    spy: function(on) {
      const s = getShieldState();
      s.spy = on === undefined ? !s.spy : !!on;
      saveShieldState(s);
      renderPanel();
      console.log('[RP Mod] Слежка: ' + (s.spy ? 'ВКЛ' : 'выключена'));
    },
    debug: function() {
      window.RPModDebug = !window.RPModDebug;
      console.log('[RP Mod] Отладка пакетов: ' + (window.RPModDebug ? 'ВКЛ' : 'выключена'));
    },
    clear: function() {
      const s = getShieldState();
      s.protectedList = [];
      saveShieldState(s);
      updateBadge(); renderPanel();
      console.log('[RP Mod] Все защиты сняты');
    },
    off: function() { const s = getShieldState(); s.enabled = false; saveShieldState(s); console.log('[RP Mod] Щит выключен (перезагрузи страницу)'); },
    on: function() { const s = getShieldState(); s.enabled = true; saveShieldState(s); console.log('[RP Mod] Щит включён (перезагрузи страницу)'); }
  };

  function initShield() {
    const state = getShieldState();
    if (!state.enabled) {
      console.log('[RP Mod] Щит выключен — включи через RPModShield.on() и перезагрузи страницу');
      return;
    }

    let attempts = 0;
    const timer = setInterval(function() {
      attempts = attempts + 1;
      if (typeof ServerSend === 'function' && typeof ServerSocket !== 'undefined' && ServerSocket) {
        clearInterval(timer);
        hookSocket();
        hookServerSend();
        hookChatRoomMessage();
        ensurePanel();
        console.log('[RP Mod] Щит активен. Панель: кнопка 🛡 в правом верхнем углу');
      } else if (attempts > 60) {
        clearInterval(timer);
        console.warn('[RP Mod] Функции игры не найдены за 60 секунд');
      }
    }, 1000);
  }

  initShield();
  console.log('[RP Mod] Щит запущен. Панель — кнопка 🛡. Команды: protection / list / spy / debug / clear');
})();
