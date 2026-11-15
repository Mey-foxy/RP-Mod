// ==UserScript==
// @name         RP Mod — Щит
// @namespace    rp-mod
// @version      0.1.0
// @description  Щит от несогласованных вмешательств в Bondage Club
// @author       Mey-foxy
// @match        *://*.bondageclub.com/*
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
    ${/* Сюда мы позже вставим собранный код, а пока просто покажем, что лоадер работает */ ''}
  `;
  document.head.appendChild(script);
})();
