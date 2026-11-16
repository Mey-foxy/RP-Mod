// ==UserScript==
// @name         RP Mod — Щит
// @namespace    rp-mod
// @version      0.2.0
// @description  Щит от несогласованных вмешательств в Bondage Club
// @author       Mey-foxy
// @match        https://*/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  console.log('[RP Mod] Лоадер запущен');

  // --- storage ---
  const SHIELD_KEY = 'rp_mod_shield_state';

  function getShieldState() {
    const raw = localStorage.getItem(SHIELD_KEY);
    if (!raw) return { enabled: true, mode: 'spy', blockList: [], allowFriends: false };
    return JSON.parse(raw);
  }

  function saveShieldState(state) {
    localStorage.setItem(SHIELD_KEY, JSON.stringify(state));
  }

  function addToBlockList(memberNumber, reason) {
    const state = getShieldState();
    if (state.blockList.some(b => b.memberNumber === memberNumber)) return;
    state.blockList.push({ memberNumber: memberNumber, reason: reason || 'Попытка вмешательства', blockedAt: Date.now() });
    saveShieldState(state);
  }

  function isBlocked(memberNumber) {
    const state = getShieldState();
    return state.blockList.some(b => b.memberNumber === memberNumber);
  }

  // --- разведка пакетов ---
  function initShield() {
    const state = getShieldState();
    if (!state.enabled) {
      console.log('[RP Mod] Щит выключен в настройках');
      return;
    }

    // Ждём, пока игра загрузится: функции появляются не сразу
    let attempts = 0;
    const timer = setInterval(function() {
      attempts = attempts + 1;
      if (typeof ServerSend === 'function') {
        clearInterval(timer);
        hookGame();
      } else if (attempts > 60) {
        clearInterval(timer);
        console.warn('[RP Mod] Это не Bondage Club — функции игры не найдены за 60 секунд');
      }
    }, 1000);
  }

  function hookGame() {
    console.log('[RP Mod] Игра найдена! Включаю перехват');

    // Перехват исходящих пакетов (всё, что отправляет твой персонаж)
    const originalSend = ServerSend;
    window.ServerSend = function(type, data) {
      console.log('[RP Mod] ОТПРАВКА: ' + type, data);
      return originalSend.apply(this, arguments);
    };

    // Перехват входящих сообщений чата (всё, что приходит в комнату)
    if (typeof ChatRoomMessage === 'function') {
      const originalMessage = ChatRoomMessage;
      window.ChatRoomMessage = function(data) {
        if (data && data.Sender && data.Sender !== Player.MemberNumber) {
          console.log('[RP Mod] ВХОДЯЩЕЕ: тип=' + data.Type + ' от #' + data.Sender, data);
        }
        return originalMessage.apply(this, arguments);
      };
      console.log('[RP Mod] Перехват входящих сообщений активен');
    }

    console.log('[RP Mod] Режим разведки включён — смотри, что происходит в консоли');
  }

  initShield();
  console.log('[RP Mod] Щит запущен (режим разведки)');
})();
