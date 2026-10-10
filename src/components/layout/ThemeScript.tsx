import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Aplica el tema antes del primer pintado.
 *
 * Tiene que ser un script en línea y síncrono: si esperáramos a que React
 * hidrate, el usuario con tema oscuro vería un fogonazo blanco en cada carga.
 * Va envuelto en try/catch porque `localStorage` lanza en modo privado y en
 * navegadores con el almacenamiento bloqueado — y un error acá dejaría la
 * página en blanco.
 */
export function ThemeScript() {
  const script = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var preference = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    var dark = preference === "dark" ||
      (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.dataset.theme = dark ? "dark" : "light";
    root.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {}
})();
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
