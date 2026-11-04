// Páginas internas (guia, termos e privacidade): tema e barra de cookies.
import { mountConsent } from "./consent.js";

mountConsent("../");

const botao = document.getElementById("themeBtn");
if (botao) {
  const root = document.documentElement;
  const escuro = () => (root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
  botao.onclick = () => {
    const proximo = escuro() ? "light" : "dark";
    root.dataset.theme = proximo;
    try { localStorage.setItem("hdmi.theme", proximo); } catch { /* modo privado */ }
  };
}
