// ==UserScript==
// @name         RP Mod — Щит
// @namespace    rp-mod
// @version      0.1.0
// @description  Щит от несогласованных вмешательств в Bondage Club
// @author       Mey-foxy
// @match        // @match        *://*.bondageclub.com/*
// @match        *://*.bondageprojects.com/*
// @match        *://*.bondages.electricseduction.com/*
// @match        *://*.bondage-club.net/*
// @match        *://*.bondageprojects.elementfx.com/*
// @match        *://*.beta.bondageprojects.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Mey-foxy/RP-Mod/main/rp-mod.user.js
// @downloadURL  https://raw.githubusercontent.com/Mey-foxy/RP-Mod/main/rp-mod.user.js
// ==/UserScript==

(function() {
  'use strict';
  console.log('[RP Mod] Лоадер запущен');

  // Пока у нас нет сборки (dist/index.js), мы подгружаем код прямо отсюда.
  // Для теста это самый простой способ.
  const script = document.createElement('script');
  script.textContent = `
    (function() {
  'use strict';

  // --- storage.ts ---
  interface BlockedPlayer {
    memberNumber: number;
    reason: string;
    blockedAt: number;
  }

  interface ShieldState {
    enabled: boolean;
    mode: 'silent' | 'alert' | 'block';
    blockList: BlockedPlayer[];
    allowFriends: boolean;
  }

  const SHIELD_KEY = 'rp_mod_shield_state';

  function getShieldState() {
    const raw = localStorage.getItem(SHIELD_KEY);
    if (!raw) return { enabled: true, mode: 'alert', blockList: [], allowFriends: false };
    return JSON.parse(raw);
  }

  function saveShieldState(state) {
    localStorage.setItem(SHIELD_KEY, JSON.stringify(state));
  }

  function addToBlockList(memberNumber, reason = 'Попытка вмешательства') {
    const state = getShieldState();
    if (state.blockList.find(b => b.memberNumber === memberNumber)) return;
    state.blockList.push({ memberNumber, reason, blockedAt: Date.now() });
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
    const name = `Игрок #${memberNumber}`;
    const choice = confirm(`⚠️ ${name} пытается выполнить ${packetName}. Разрешить?`);

    if (choice === false) {
      addToBlockList(memberNumber, `Отклонено в алерт-окне`);
      console.warn(`[RP Mod] Блокировка игрока #${memberNumber} по решению пользователя`);
    } else {
      console.log(`[RP Mod] Разрешение дано для #${memberNumber}`);
    }
    return choice;
  }

  function initShield() {
    const state = getShieldState();
    if (!state.enabled) return;

    if ((window).messagesManager) {
      const originalSend = (window).messagesManager.sendPacket;
      (window).messagesManager.sendPacket = function(...args) {
        const packetName = args[0];
        if (isInterventionPacket(packetName)) {
          const targetMember = args[1];
          if (isBlocked(targetMember)) {
            console.warn(`[RP Mod] Пакет ${packetName} к #${targetMember} заблокирован (блок-лист)`);
            return;
          }
        }
        return originalSend.apply(this, args);
      };

      const originalOnPacket = (window).messagesManager.onPacket;
      (window).messagesManager.onPacket = function(packetName, data) {
        if (isInterventionPacket(packetName)) {
          const sender = data?.sender || data?.memberNumber;
          if (sender && isBlocked(sender)) {
            console.warn(`[RP Mod] Пакет ${packetName} от #${sender} отброшен (блок-лист)`);
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
    } else {
      console.warn('[RP Mod] messagesManager не найден — щит не может перехватывать пакеты');
    }
  }

  // --- index.ts ---
  initShield();
  console.log('[RP Mod] Щит запущен');
})();
  `;
  document.head.appendChild(script);
})();
