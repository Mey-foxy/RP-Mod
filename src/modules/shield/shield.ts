import { getShieldState, saveShieldState, addToBlockList, isBlocked } from './storage';

// Типы пакетов, которые считаем «вмешательством». Сюда позже добавим свои.
const INTERVENTION_PACKETS = [
  'animaFurtaCommand',
  'possessionRequest',
  'lscg_spell_cast'
];

function isInterventionPacket(packetName: string): boolean {
  return INTERVENTION_PACKETS.includes(packetName);
}

function showAlert(memberNumber: number, packetName: string) {
  // В игре это будет красивый UI, пока сделаем простой confirm
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

export function initShield() {
  const state = getShieldState();
  if (!state.enabled) return;

  // Перехватываем отправку/приём пакетов. В сборке Zoi это делается через hookFunction.
  // Ниже — примерная логика, которую ты адаптируешь под реальный messagesManager.
  if ((window as any).messagesManager) {
    const originalSend = (window as any).messagesManager.sendPacket;
    (window as any).messagesManager.sendPacket = function(...args: any[]) {
      const packetName = args[0];
      if (isInterventionPacket(packetName)) {
        const targetMember = args[1]; // упрощённо: второй аргумент — цель
        if (isBlocked(targetMember)) {
          console.warn(`[RP Mod] Пакет ${packetName} к #${targetMember} заблокирован (блок-лист)`);
          return; // не отправляем
        }
      }
      return originalSend.apply(this, args);
    };

    const originalOnPacket = (window as any).messagesManager.onPacket;
    (window as any).messagesManager.onPacket = function(packetName: string, data: any) {
      if (isInterventionPacket(packetName)) {
        const sender = data?.sender || data?.memberNumber;
        if (sender && isBlocked(sender)) {
          console.warn(`[RP Mod] Пакет ${packetName} от #${sender} отброшен (блок-лист)`);
          return;
        }

        if (state.mode === 'alert') {
          const allowed = showAlert(sender, packetName);
          if (!allowed) {
            // Можно сразу заблокировать
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
