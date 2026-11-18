// ==UserScript==
// @name         RP Mod — Щит
// @namespace    rp-mod
// @version      0.12.0
// @description  Щит от несогласованных вмешательств и заглушка травли в Bondage Club + панель управления
// @author       Mey-foxy
// @match        https://www.bondageprojects.elementfx.com/R*/*
// @match        https://bondage-europe.com/R*/*
// @match        https://bondage-asia.com/R*/*
// @match        https://asia.bondageprojects.com/R*/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  console.log('[RP Mod] Лоадер запущен (v0.12.0)');

  const SHIELD_KEY = 'rp_mod_shield_state';
  const MUTE_TYPES = ['Chat', 'Whisper', 'Emote'];
  const ITEM_ACTIONS = ['ActionUse', 'ActionRemove', 'ChangeClothes'];

  function defaultState() {
    return { enabled: true, mode: 'alert', blockList: [], muteList: [], trustList: [], clothingGuard: false, restrictionsGuard: false };
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
    if (!Array.isArray(state.blockList)) state.blockList = [];
    if (!Array.isArray(state.muteList)) state.muteList = [];
    if (!Array.isArray(state.trustList)) state.trustList = [];
    if (['spy', 'alert', 'silent'].indexOf(state.mode) === -1) state.mode = 'alert';
    if (typeof state.enabled !== 'boolean') state.enabled = true;
    if (typeof state.clothingGuard !== 'boolean') state.clothingGuard = false;
    if (typeof state.restrictionsGuard !== 'boolean') state.restrictionsGuard = false;
    return state;
  }

  function saveShieldState(state) {
    localStorage.setItem(SHIELD_KEY, JSON.stringify(state));
  }

  function isBlocked(num) { return getShieldState().blockList.indexOf(num) !== -1; }
  function isMuted(num) { return getShieldState().muteList.indexOf(num) !== -1; }
  function isTrusted(num) { return getShieldState().trustList.indexOf(num) !== -1; }

  function addToBlockList(num) {
    const s = getShieldState();
    if (s.blockList.indexOf(num) === -1) {
      s.blockList.push(num);
      saveShieldState(s);
    }
  }

  function removeFromBlockList(num) {
    const s = getShieldState();
    const i = s.blockList.indexOf(num);
    if (i !== -1) { s.blockList.splice(i, 1); saveShieldState(s); }
  }

  function addToMuteList(num) {
    const s = getShieldState();
    if (s.muteList.indexOf(num) === -1) { s.muteList.push(num); saveShieldState(s); }
  }

  function removeFromMuteList(num) {
    const s = getShieldState();
    const i = s.muteList.indexOf(num);
    if (i !== -1) { s.muteList.splice(i, 1); saveShieldState(s); }
  }

  function addToTrustList(num) {
    const s = getShieldState();
    if (s.trustList.indexOf(num) === -1) { s.trustList.push(num); saveShieldState(s); }
  }

  function removeFromTrustList(num) {
    const s = getShieldState();
    const i = s.trustList.indexOf(num);
    if (i !== -1) { s.trustList.splice(i, 1); saveShieldState(s); }
  }

  let myMemberNumber = null;
  let recentKey = '';
  let recentTime = 0;

  function isDuplicate(key) {
    const now = Date.now();
    if (key === recentKey && now - recentTime < 3000) return true;
    recentKey = key;
    recentTime = now;
    return false;
  }

  const alertCooldown = {};
  function canAlert(sender) {
    const now = Date.now();
    if (alertCooldown[sender] && now - alertCooldown[sender] < 15000) return false;
    alertCooldown[sender] = now;
    return true;
  }

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

  function touchesMe(data) {
    try {
      const s = JSON.stringify(data);
      return s.indexOf('"MemberNumber":' + myMemberNumber) !== -1 ||
             s.indexOf('"TargetCharacter":' + myMemberNumber) !== -1 ||
             s.indexOf('"Target":' + myMemberNumber) !== -1;
    } catch (e) { return false; }
  }

  function isIntervention(msg) {
    if (!msg || !myMemberNumber) return false;
    if (msg.Sender === myMemberNumber) return false;
    if (msg.Type !== 'Action' && msg.Type !== 'Activity') return false;
    if (!touchesMe(msg)) return false;
    if (msg.Content === 'ServerEnter') return false;
    return true;
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

  function msgKey(msg) {
    return msg.Sender + '|' + (msg.Content || '') + '|' + describe(msg);
  }

  // --- Стражи ---
  let clothingGuardUntil = 0; // временная защита после заблокированного действия
  function clothingGuardActive() {
    const s = getShieldState();
    return s.clothingGuard || Date.now() < clothingGuardUntil;
  }
  function armTemporaryClothingGuard() {
    clothingGuardUntil = Date.now() + 15000;
  }

  function extractCharacter(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.Character && typeof payload.Character === 'object' && payload.Character.MemberNumber) {
      return payload.Character;
    }
    if (payload.MemberNumber) return payload;
    return null;
  }

  function handleIntervention(msg) {
    const state = getShieldState();
    // Доверенным можно всё
    if (isTrusted(msg.Sender)) return false;

    if (isBlocked(msg.Sender)) {
      console.warn('[RP Mod] 🚫 БЛОК: ' + describe(msg));
      return true;
    }

    // Защита ограничений: чужие действия с предметами на мне
    if (state.restrictionsGuard && ITEM_ACTIONS.indexOf(msg.Content) !== -1) {
      console.warn('[RP Mod] 🛡 Ограничения: заблокировано от ' + nameOf(msg.Sender) + ': ' + msg.Content);
      return true;
    }
    // Защита одежды: чужая смена одежды на мне
    if (state.clothingGuard && msg.Content === 'ChangeClothes') {
      console.warn('[RP Mod] 🛡 Одежда: заблокирована смена от ' + nameOf(msg.Sender));
      return true;
    }

    if (state.mode === 'alert') {
      if (!isDuplicate(msgKey(msg)) && canAlert(msg.Sender)) {
        const info = describe(msg);
        console.warn('[RP Mod] ⚠️ ВМЕШАТЕЛЬСТВО: ' + info);
        const ok = confirm('RP Mod — Щит\n\nИгрок ' + nameOf(msg.Sender) + ' (#' + msg.Sender + '):\n' + info + '\n\nЗаблокировать этого игрока?');
        if (ok) {
          addToBlockList(msg.Sender);
          if (msg.Content === 'ChangeClothes') armTemporaryClothingGuard();
          renderPanel();
          return true;
        }
        console.log('[RP Mod] Разрешено: ' + info);
      }
      return false;
    }
    if (!isDuplicate(msgKey(msg))) {
      console.log('[RP Mod] 👀 Наблюдение: ' + describe(msg));
    }
    return false;
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

    // Бипы — глотаем молча
    if (typeof name === 'string' && name.indexOf('Beep') !== -1) {
      const beep = packet.data[1];
      if (beep && typeof beep.MemberNumber === 'number' && isMuted(beep.MemberNumber)) {
        console.log('[RP Mod] 🔇 Бип заглушен от #' + beep.MemberNumber);
        return true;
      }
      return false;
    }

    // Пакеты синхронизации внешности: при активной защите одежды глотаем ЦЕЛИКОМ,
    // ничего в них не правя — игре неоткуда узнать про несанкционированную смену.
    if (name === 'ChatRoomSyncSingle' || name === 'ChatRoomSyncCharacter' || name === 'ChatRoomSyncCharacterRemove') {
      const c = extractCharacter(packet.data[1]);
      if (c && c.MemberNumber === myMemberNumber && clothingGuardActive()) {
        console.log('[RP Mod] 🛡 Одежда: пакет синхронизации погашен (защита активна)');
        return true;
      }
      return false;
    }

    const msg = packet.data[1];
    if (!msg || typeof msg !== 'object' || typeof msg.Sender !== 'number') return false;
    if (msg.Sender === myMemberNumber) return false;

    // Заглушка чата/шёпота/эмоутов
    if (isMuted(msg.Sender) && MUTE_TYPES.indexOf(msg.Type) !== -1) {
      console.log('[RP Mod] 🔇 Сообщение заглушено от #' + msg.Sender);
      return true;
    }

    // Вмешательства
    if (isIntervention(msg)) {
      return handleIntervention(msg);
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
          if (isMuted(data.Sender) && MUTE_TYPES.indexOf(data.Type) !== -1) return;
          if (isIntervention(data) && handleIntervention(data)) return;
        }
      } catch (e) {
        console.error('[RP Mod] Ошибка запасного фильтра: ' + e.message);
      }
      return originalMessage.apply(this, arguments);
    };
    console.log('[RP Mod] Запасной фильтр ChatRoomMessage активен');
  }

  // --- Панель управления ---
  let panelEl = null;
  let toggleBtn = null;

  function applyPanelStyle(el) {
    el.style.position = 'fixed';
    el.style.zIndex = '99999';
    el.style.fontFamily = 'Arial, sans-serif';
    el.style.fontSize = '13px';
  }

  function ensurePanel() {
    if (toggleBtn) return;

    toggleBtn = document.createElement('div');
    toggleBtn.textContent = '🛡';
    applyPanelStyle(toggleBtn);
    toggleBtn.style.cssText += 'top:8px;right:8px;width:34px;height:34px;line-height:34px;text-align:center;cursor:pointer;background:rgba(30,30,40,0.85);color:#fff;border-radius:8px;user-select:none;';
    toggleBtn.title = 'RP Mod — Щит';
    toggleBtn.addEventListener('click', togglePanel);
    document.body.appendChild(toggleBtn);

    panelEl = document.createElement('div');
    applyPanelStyle(panelEl);
    panelEl.style.cssText += 'top:48px;right:8px;width:260px;background:rgba(30,30,40,0.95);color:#eee;border-radius:8px;padding:10px;display:none;box-shadow:0 4px 16px rgba(0,0,0,0.5);';
    document.body.appendChild(panelEl);
    renderPanel();
  }

  function togglePanel() {
    if (!panelEl) return;
    panelEl.style.display = panelEl.style.display === 'none' ? 'block' : 'none';
  }

  function btn(label, handler) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'margin:2px;padding:4px 8px;border:1px solid #666;border-radius:5px;background:#3a3a4a;color:#fff;cursor:pointer;font-size:12px;';
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

    // Режим
    panelEl.appendChild(btn('Слежка', function() { setMode('spy'); }));
    panelEl.appendChild(btn('Спросить', function() { setMode('alert'); }));
    panelEl.appendChild(btn('Тихо', function() { setMode('silent'); }));

    // Стражи
    panelEl.appendChild(btn(s.clothingGuard ? 'Одежда: ВКЛ' : 'Одежда: выкл', function() {
      const st = getShieldState();
      st.clothingGuard = !st.clothingGuard;
      saveShieldState(st);
      renderPanel();
    }));
    panelEl.appendChild(btn(s.restrictionsGuard ? 'Ограничения: ВКЛ' : 'Ограничения: выкл', function() {
      const st = getShieldState();
      st.restrictionsGuard = !st.restrictionsGuard;
      saveShieldState(st);
      renderPanel();
    }));

    // Паник: включает оба стража разом
    panelEl.appendChild(btn('💥 Паник-режим', function() {
      const st = getShieldState();
      st.clothingGuard = true;
      st.restrictionsGuard = true;
      saveShieldState(st);
      console.warn('[RP Mod] 💥 Паник-режим включён: одежда и ограничения под защитой');
      renderPanel();
    }));

    // Игнор игрока
    panelEl.appendChild(document.createElement('br'));
    const ignoreInput = document.createElement('input');
    ignoreInput.placeholder = 'имя или #номер';
    ignoreInput.style.cssText = 'width:150px;margin:4px 2px;padding:3px;border-radius:4px;border:1px solid #666;background:#222;color:#fff;';
    ignoreInput.id = 'rpmod-ignore-input';
    panelEl.appendChild(ignoreInput);
    panelEl.appendChild(btn('Игнор', function() {
      const who = resolvePlayer(document.getElementById('rpmod-ignore-input').value);
      if (!who) { console.log('[RP Mod] Не нашёл игрока'); return; }
      addToBlockList(who);
      addToMuteList(who);
      console.warn('[RP Mod] 💀 Полный игнор: ' + nameOf(who) + ' (#' + who + ')');
      renderPanel();
    }));
    panelEl.appendChild(btn('Снять', function() {
      const who = resolvePlayer(document.getElementById('rpmod-ignore-input').value);
      if (!who) return;
      removeFromBlockList(who);
      removeFromMuteList(who);
      console.log('[RP Mod] Игнор снят с ' + nameOf(who) + ' (#' + who + ')');
      renderPanel();
    }));

    // Доверенные
    panelEl.appendChild(document.createElement('br'));
    const trustInput = document.createElement('input');
    trustInput.placeholder = 'имя или #номер';
    trustInput.style.cssText = 'width:150px;margin:4px 2px;padding:3px;border-radius:4px;border:1px solid #666;background:#222;color:#fff;';
    trustInput.id = 'rpmod-trust-input';
    panelEl.appendChild(trustInput);
    panelEl.appendChild(btn('Доверять', function() {
      const who = resolvePlayer(document.getElementById('rpmod-trust-input').value);
      if (!who) { console.log('[RP Mod] Не нашёл игрока'); return; }
      addToTrustList(who);
      console.log('[RP Mod] Доверенный: ' + nameOf(who) + ' (#' + who + ')');
      renderPanel();
    }));
    panelEl.appendChild(btn('Отвязать', function() {
      const who = resolvePlayer(document.getElementById('rpmod-trust-input').value);
      if (!who) return;
      removeFromTrustList(who);
      console.log('[RP Mod] Доверие снято с #' + who);
      renderPanel();
    }));

    // Списки
    panelEl.appendChild(document.createElement('br'));
    const lists = document.createElement('div');
    lists.style.cssText = 'margin-top:6px;font-size:12px;line-height:1.5;';
    const mkList = function(label, arr, removeFn) {
      if (!arr.length) return;
      const row = document.createElement('div');
      const lab = document.createElement('b');
      lab.textContent = label + ': ';
      row.appendChild(lab);
      arr.forEach(function(n) {
        const item = document.createElement('span');
        item.textContent = nameOf(n) + ' ✖';
        item.style.cssText = 'cursor:pointer;margin-right:8px;text-decoration:underline;';
        item.title = 'Нажми, чтобы убрать';
        item.addEventListener('click', function() { removeFn(n); renderPanel(); });
        row.appendChild(item);
      });
      lists.appendChild(row);
    };
    mkList('Блок', s.blockList, removeFromBlockList);
    mkList('Заглушенные', s.muteList, removeFromMuteList);
    mkList('Доверенные', s.trustList, removeFromTrustList);
    panelEl.appendChild(lists);
  }

  function setMode(mode) {
    const s = getShieldState();
    if (['spy', 'alert', 'silent'].indexOf(mode) === -1) return;
    s.mode = mode;
    saveShieldState(s);
    console.log('[RP Mod] Режим: ' + mode);
    renderPanel();
  }

  window.RPModShield = {
    setMode: setMode,
    addBlock: addToBlockList,
    unblock: removeFromBlockList,
    list: function() { const s = getShieldState(); console.log('[RP Mod] Блок:', s.blockList, 'Заглушенные:', s.muteList, 'Доверенные:', s.trustList); },
    mute: function(who) {
      const num = resolvePlayer(who);
      if (!num) { console.log('[RP Mod] Не нашёл игрока: ' + who); return; }
      addToMuteList(num);
      renderPanel();
      console.log('[RP Mod] 🔇 Заглушен: ' + nameOf(num) + ' (#' + num + ')');
    },
    unmute: function(who) {
      const num = resolvePlayer(who);
      if (!num) { console.log('[RP Mod] Не нашёл игрока: ' + who); return; }
      removeFromMuteList(num);
      renderPanel();
      console.log('[RP Mod] 🔈 Размучен: #' + num);
    },
    mutes: function() { const s = getShieldState(); console.log('[RP Mod] Заглушенные: ' + (s.muteList.length ? s.muteList.map(function(n){return nameOf(n)+' (#'+n+')';}).join(', ') : 'пусто')); },
    trust: function(who) {
      const num = resolvePlayer(who);
      if (!num) { console.log('[RP Mod] Не нашёл игрока: ' + who); return; }
      addToTrustList(num);
      renderPanel();
      console.log('[RP Mod] Доверенный: ' + nameOf(num) + ' (#' + num + ')');
    },
    untrust: function(who) {
      const num = resolvePlayer(who);
      if (!num) return;
      removeFromTrustList(num);
      renderPanel();
      console.log('[RP Mod] Доверие снято с #' + num);
    },
    debug: function() {
      window.RPModDebug = !window.RPModDebug;
      console.log('[RP Mod] Отладка пакетов: ' + (window.RPModDebug ? 'ВКЛ' : 'выключена'));
    },
    clear: function() {
      const s = getShieldState();
      s.blockList = []; s.muteList = []; s.trustList = [];
      saveShieldState(s);
      renderPanel();
      console.log('[RP Mod] Все списки очищены');
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
        hookChatRoomMessage();
        ensurePanel();
        console.log('[RP Mod] Щит активен. Режим: ' + getShieldState().mode + '. Панель: кнопка 🛡 в правом верхнем углу');
      } else if (attempts > 60) {
        clearInterval(timer);
        console.warn('[RP Mod] Функции игры не найдены за 60 секунд');
      }
    }, 1000);
  }

  initShield();
  console.log('[RP Mod] Щит запущен. Панель — кнопка 🛡. Команды: setMode / mute / unmute / trust / untrust / debug / clear');
})();
