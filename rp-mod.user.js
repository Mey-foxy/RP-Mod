// ==UserScript==
// @name         RP Mod — Щит
// @namespace    rp-mod
// @version      0.8.0
// @description  Щит от несогласованных вмешательств и заглушка травли в Bondage Club
// @author       Mey-foxy
// @match        https://www.bondageprojects.elementfx.com/R*/*
// @match        https://bondage-europe.com/R*/*
// @match        https://bondage-asia.com/R*/*
// @match        https://asia.bondageprojects.com/R*/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  console.log('[RP Mod] Лоадер запущен (v0.8.0)');

  const SHIELD_KEY = 'rp_mod_shield_state';
  const MUTE_TYPES = ['Chat', 'Whisper', 'Emote'];
  const APPEARANCE_CONTENTS = ['ChangeClothes', 'ActionUse', 'ActionRemove'];

  function defaultState() {
    return { enabled: true, mode: 'alert', blockList: [], muteList: [] };
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
    if (['spy', 'alert', 'silent'].indexOf(state.mode) === -1) state.mode = 'alert';
    if (typeof state.enabled !== 'boolean') state.enabled = true;
    return state;
  }

  function saveShieldState(state) {
    localStorage.setItem(SHIELD_KEY, JSON.stringify(state));
  }

  function isBlocked(num) { return getShieldState().blockList.indexOf(num) !== -1; }
  function isMuted(num) { return getShieldState().muteList.indexOf(num) !== -1; }

  function addToBlockList(num) {
    const s = getShieldState();
    if (s.blockList.indexOf(num) === -1) {
      s.blockList.push(num);
      saveShieldState(s);
      console.log('[RP Mod] Игрок #' + num + ' добавлен в блок-лист');
    }
  }

  function removeFromBlockList(num) {
    const s = getShieldState();
    const i = s.blockList.indexOf(num);
    if (i !== -1) {
      s.blockList.splice(i, 1);
      saveShieldState(s);
      console.log('[RP Mod] Игрок #' + num + ' убран из блок-листа');
    }
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

  function touchesMe(data) {
    try {
      const s = JSON.stringify(data);
      return s.indexOf('"MemberNumber":' + myMemberNumber) !== -1 ||
             s.indexOf('"TargetCharacter":' + myMemberNumber) !== -1 ||
             s.indexOf('"Target":' + myMemberNumber) !== -1;
    } catch (e) { return false; }
  }

  function isIntervention(msg) {
    if (!msg) return false;
    if (msg.Type !== 'Action' && msg.Type !== 'Activity') return false;
    if (!myMemberNumber || msg.Sender === myMemberNumber) return false;
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

  // --- Снимок внешности ---
  let snapshot = null;
  let snapshotTime = 0;
  let snapTimer = null;
  let revertPending = false;
  let revertFallbackTimer = null;

  function captureSnapshot() {
    try {
      // Снимаем снимок только когда персонаж полностью загружен и в комнате
      if (typeof Player === 'undefined' || !Player || !Array.isArray(Player.Appearance)) return;
      if (typeof ChatRoomCharacter === 'undefined' || !Array.isArray(ChatRoomCharacter) || ChatRoomCharacter.length === 0) return;
      let inRoom = false;
      for (let i = 0; i < ChatRoomCharacter.length; i++) {
        if (ChatRoomCharacter[i].MemberNumber === Player.MemberNumber) { inRoom = true; break; }
      }
      if (!inRoom) return;
      snapshot = JSON.stringify(Player.Appearance);
      snapshotTime = Date.now();
      console.log('[RP Mod] Снимок внешности обновлён');
    } catch (e) {}
  }

  function scheduleSnapshotUpdate() {
    if (snapTimer) clearTimeout(snapTimer);
    snapTimer = setTimeout(captureSnapshot, 1500);
  }

  // Аварийный откат — ТОЛЬКО локально, ничего не отправляем на сервер (чтобы не злить античит)
  function armFallbackRevert() {
    if (revertFallbackTimer) clearTimeout(revertFallbackTimer);
    revertFallbackTimer = setTimeout(function() {
      if (revertPending && snapshot) {
        try {
          Player.Appearance = JSON.parse(snapshot);
          if (typeof CharacterRefresh === 'function') CharacterRefresh(Player);
          console.warn('[RP Mod] 🛡 Появление восстановлено локально (сервер не трогали)');
        } catch (e) {
          console.error('[RP Mod] Локальный откат не сработал: ' + e.message);
        }
      }
      revertPending = false;
    }, 4000);
  }

  function handleSyncChar(charData) {
    if (revertPending) {
      if (revertFallbackTimer) clearTimeout(revertFallbackTimer);
      revertPending = false;
      if (snapshot && Array.isArray(charData.Appearance)) {
        charData.Appearance = JSON.parse(snapshot);
        console.warn('[RP Mod] 🛡 Появление восстановлено — вмешательство отменено');
      } else {
        console.warn('[RP Mod] Снимок внешности недоступен — откат невозможен');
      }
      return;
    }
    scheduleSnapshotUpdate();
  }

  function handleIntervention(msg) {
    const appearanceChange = APPEARANCE_CONTENTS.indexOf(msg.Content) !== -1;
    if (isBlocked(msg.Sender)) {
      console.warn('[RP Mod] 🚫 БЛОК: ' + describe(msg));
      if (appearanceChange) {
        revertPending = true;
        armFallbackRevert();
      }
      return true;
    }
    const state = getShieldState();
    if (state.mode === 'alert') {
      if (!isDuplicate(msgKey(msg))) {
        const info = describe(msg);
        console.warn('[RP Mod] ⚠️ ВМЕШАТЕЛЬСТВО: ' + info);
        const ok = confirm('RP Mod — Щит\n\nИгрок ' + nameOf(msg.Sender) + ' (#' + msg.Sender + '):\n' + info + '\n\nЗаблокировать этого игрока?');
        if (ok) {
          addToBlockList(msg.Sender);
          if (appearanceChange) {
            revertPending = true;
            armFallbackRevert();
          }
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

    // Бипы — глотаем молча
    if (typeof name === 'string' && name.indexOf('Beep') !== -1) {
      const beep = packet.data[1];
      if (beep && typeof beep.MemberNumber === 'number' && isMuted(beep.MemberNumber)) {
        console.log('[RP Mod] 🔇 Бип заглушен от #' + beep.MemberNumber);
        return true;
      }
      return false;
    }

    // Пакеты синхронизации внешности — сюда подменяем откат
    if (name === 'ChatRoomSync') {
      const room = packet.data[1];
      if (room && Array.isArray(room.Character)) {
        for (let i = 0; i < room.Character.length; i++) {
          if (room.Character[i].MemberNumber === myMemberNumber) handleSyncChar(room.Character[i]);
        }
      }
      return false;
    }
    if (name === 'ChatRoomSyncSingle') {
      const c = packet.data[1] && packet.data[1].Character;
      if (c && c.MemberNumber === myMemberNumber) handleSyncChar(c);
      return false;
    }
    if (name === 'ChatRoomUpdate') {
      const c = packet.data[1];
      if (c && c.MemberNumber === myMemberNumber && c.Appearance) handleSyncChar(c);
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

  window.RPModShield = {
    setMode: function(mode) {
      const s = getShieldState();
      if (['spy', 'alert', 'silent'].indexOf(mode) === -1) {
        console.log('[RP Mod] Режимы: spy (наблюдение), alert (спрашивать), silent (тихо)');
        return;
      }
      s.mode = mode;
      saveShieldState(s);
      console.log('[RP Mod] Режим: ' + mode);
    },
    addBlock: addToBlockList,
    unblock: removeFromBlockList,
    list: function() { console.log('[RP Mod] Блок-лист:', getShieldState().blockList); },
    mute: function(who) {
      let num = typeof who === 'number' ? who : (parseInt(who, 10) || numberByName(who));
      if (!num) { console.log('[RP Mod] Не нашёл игрока: ' + who); return; }
      const s = getShieldState();
      if (s.muteList.indexOf(num) === -1) {
        s.muteList.push(num);
        saveShieldState(s);
        console.log('[RP Mod] 🔇 Заглушен: ' + nameOf(num) + ' (#' + num + ')');
      } else {
        console.log('[RP Mod] Игрок уже заглушен: #' + num);
      }
    },
    unmute: function(who) {
      let num = typeof who === 'number' ? who : (parseInt(who, 10) || numberByName(who));
      if (!num) { console.log('[RP Mod] Не нашёл игрока: ' + who); return; }
      const s = getShieldState();
      const i = s.muteList.indexOf(num);
      if (i !== -1) {
        s.muteList.splice(i, 1);
        saveShieldState(s);
        console.log('[RP Mod] 🔈 Размучен: #' + num);
      } else {
        console.log('[RP Mod] Игрока #' + num + ' нет в списке');
      }
    },
    mutes: function() {
      const s = getShieldState();
      const names = s.muteList.map(function(n) { return nameOf(n) + ' (#' + n + ')'; });
      console.log('[RP Mod] Заглушенные: ' + (names.length ? names.join(', ') : 'пусто'));
    },
    snap: function() { captureSnapshot(); },
    clear: function() {
      const s = getShieldState();
      s.blockList = [];
      s.muteList = [];
      saveShieldState(s);
      console.log('[RP Mod] Блок-лист и заглушки очищены');
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
        // Снимок больше НЕ снимаем при загрузке — только после входа в комнату
        console.log('[RP Mod] Щит активен. Режим: ' + getShieldState().mode);
      } else if (attempts > 60) {
        clearInterval(timer);
        console.warn('[RP Mod] Функции игры не найдены за 60 секунд');
      }
    }, 1000);
  }

  initShield();
  console.log('[RP Mod] Щит запущен. Команды: setMode / addBlock / unblock / list / mute / unmute / mutes / snap / clear');
})();
