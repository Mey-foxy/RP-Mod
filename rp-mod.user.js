// ==UserScript==
// @name         RP Mod — Щит
// @namespace    rp-mod
// @version      0.1.1
// @description  Щит от несогласованных вмешательств в Bondage Club
// @author       Mey-foxy
// @match        https://*/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';
  console.log('[RP Mod] Лоадер запущен');

  // --- storage.ts ---
  const SHIELD_KEY = 'rp_mod_shield_state';

  function getShieldState() {
    const raw = localStorage.getItem(SHIELD_KEY);
    if (!raw) return { enabled: true, mode: 'alert', blockList: [], allowFriends: false };
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

  // --- shield.ts ---
  const INTERVENTION_PACKETS = [
    'animaFurtaCommand',
    'possessionRequest',
    'lscg_spell_cast'
  ];

  function isInterventionPacket(packetName) {
    return INTERVENTION_PACKETS.includes(packetName);
  }

  function showAlert(memberNumber, packetName) {
    const choice = confirm('RP Mod: игрок #' + memberNumber + ' пытается выполнить ' + packetName + '. Разрешить?');
    if (!choice) {
      addToBlockList(memberNumber, 'Отклонено в алерт-окне');
      console.warn('[RP Mod] Блокировка игрока #' + memberNumber);
    } else {
      console.log('[RP Mod] Разрешение дано для #' + memberNumber);
    }
    return choice;
  }

  function initShield() {
    const state = getShieldState();
    if (!state.enabled) return;

    if (window.messagesManager) {
      const originalSend = window.messagesManager.sendPacket;
      window.messagesManager.sendPacket = function() {
        const packetName = arguments[0];
        if (isInterventionPacket(packetName)) {
          const targetMember = arguments[1];
          if (isBlocked(targetMember)) {
            console.warn('[RP Mod] Пакет ' + packetName + ' к #' + targetMember + ' заблокирован');
            return;
          }
        }
        return originalSend.apply(this, arguments);
      };

      const originalOnPacket = window.messagesManager.onPacket;
      window.messagesManager.onPacket = function(packetName, data) {
        if (isInterventionPacket(packetName)) {
          const sender = data && (data.sender || data.memberNumber);
          if (sender && isBlocked(sender)) {
            console.warn('[RP Mod] Пакет ' + packetName + ' от #' + sender + ' отброшен');
            return;
          }
          if (state.mode === 'alert') {
            const allowed = showAlert(sender, packetName);
            if (!allowed) {
              addToBlockList(sender, 'Отклонено в алерт-окне');
              return;
            }
          }
        }
        return originalOnPacket.call(this, packetName, data);
      };
      console.log('[RP Mod] Перехват пакетов установлен');
    } else {
      console.warn('[RP Mod] messagesManager не найден — щит не может перехватывать пакеты');
    }
  }

  // --- index.ts ---
  initShield();
  console.log('[RP Mod] Щит запущен');
})();
