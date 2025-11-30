/**
 * apps/home/script.js
 */

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. Lógica do Relógio ---
  const dateEl = document.getElementById("currentDate");
  const timeEl = document.getElementById("currentTime");
  const greetingEl = document.getElementById("greeting");

  function updateTime() {
    const now = new Date();

    // Data por extenso
    const optionsDate = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    const dateStr = now.toLocaleDateString("pt-BR", optionsDate);

    // Capitalizar primeira letra (ex: "Sábado" em vez de "sábado")
    if (dateEl) {
      dateEl.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }

    // Hora com segundos
    const timeStr = now.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    if (timeEl) {
      timeEl.textContent = timeStr;
    }

    // Saudação baseada na hora
    if (greetingEl) {
      const hour = now.getHours();
      let greeting = "Olá";
      if (hour >= 5 && hour < 12) greeting = "Bom dia";
      else if (hour >= 12 && hour < 18) greeting = "Boa tarde";
      else greeting = "Boa noite";
      greetingEl.textContent = greeting;
    }
  }

  // Atualiza a cada segundo e roda imediatamente
  setInterval(updateTime, 1000);
  updateTime();

  // --- 2. Lógica de Navegação ---
  // Seleciona todos os elementos que tenham o atributo 'data-route'
  const navCards = document.querySelectorAll("[data-route]");

  navCards.forEach((card) => {
    card.addEventListener("click", () => {
      const hash = card.getAttribute("data-route");
      // Comunica com a janela pai (index.html principal)
      if (window.parent) {
        window.parent.location.hash = hash;
      }
    });
  });
});
