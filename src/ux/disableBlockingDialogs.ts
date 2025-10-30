/* === UX: Desactivar popups bloqueantes y mostrar feedback inline ===
Este script intercepta las llamadas a `window.alert`, `window.confirm` y `window.prompt`
para reemplazarlas con alternativas no bloqueantes y mejorar la experiencia de usuario.
*/

(() => {
  // --- Estilos del feedback inline ---
  const STYLE_ID = "cargarg-inline-feedback-style";
  if (!document.getElementById(STYLE_ID)) {
    const css = document.createElement("style");
    css.id = STYLE_ID;
    css.textContent = `
      .cargarg-feedback {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 500;
        line-height: 1.25rem;
        background: rgba(46, 204, 113, 0.10);
        border: 1px solid rgba(46, 204, 113, 0.35);
        color: #2ecc71;
        display: none;
        opacity: 0;
        transition: opacity 0.3s ease-in-out, margin-top 0.3s ease-in-out;
        text-align: center;
      }
      .cargarg-feedback.show { display: block; opacity: 1; }
      .cargarg-feedback.error {
        background: rgba(231, 76, 60, 0.10);
        border-color: rgba(231, 76, 60, 0.35);
        color: #e74c3c;
      }
    `;
    document.head.appendChild(css);
  }

  // --- Busca o crea el contenedor para el feedback ---
  function getOrCreateFeedbackContainer(): HTMLElement {
    // 1) Por ID dedicado si existe
    let box = document.getElementById("cargarg-feedback-box");
    if (box) return box;
    
    box = document.createElement("div");
    box.id = "cargarg-feedback-box";
    box.className = "cargarg-feedback";
    
    // 2) Intento heurístico: después del formulario principal en la página
    const form = document.querySelector('form');
    if (form && form.parentElement) {
        form.parentElement.insertBefore(box, form.nextSibling);
        return box;
    }

    // 3) Fallback: al final del body
    document.body.appendChild(box);
    return box;
  }

  // --- Render del mensaje inline ---
  function showInlineMessage(message: string, kind: "success" | "error" = "success", ms = 5000) {
    const box = getOrCreateFeedbackContainer();
    box.classList.remove("error", "show");
    if (kind === "error") {
        box.classList.add("error");
    }
    box.textContent = message;
    
    // Forzar reflow y mostrar
    void box.offsetWidth;
    box.classList.add("show");
    
    // Auto-ocultar
    if ((box as any)._hideT) clearTimeout((box as any)._hideT);
    (box as any)._hideT = window.setTimeout(() => {
      box.classList.remove("show");
    }, ms);
  }

  // --- Overrides globales ---
  if (!(window as any)._originalAlert) {
    (window as any)._originalAlert = window.alert.bind(window);
  }

  window.alert = (msg?: any) => {
    const text = String(msg ?? "");
    console.log(`[Alert Overridden]: ${text}`);

    const isError = /error|fail|incorrect|invalid|denied|ya está en uso|contraseña|correo/i.test(text) && !/exitoso/i.test(text);

    showInlineMessage(text, isError ? "error" : "success");
  };

  // --- Desactivar confirm y prompt ---
  if (!(window as any)._originalConfirm) {
      (window as any)._originalConfirm = window.confirm.bind(window);
  }
  window.confirm = (msg?: any) => {
    console.warn(`[Confirm Overridden]: "${String(msg ?? "")}". Automatically returning true.`);
    return true;
  };
  
  if (!(window as any)._originalPrompt) {
      (window as any)._originalPrompt = window.prompt.bind(window);
  }
  window.prompt = (msg?: any, defaultVal?: string) => {
    console.warn(`[Prompt Overridden]: "${String(msg ?? "")}". Automatically returning null.`);
    return defaultVal || null;
  };

})();
