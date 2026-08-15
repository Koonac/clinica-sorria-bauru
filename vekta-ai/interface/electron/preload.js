/**
 * Preload do wrapper Electron.
 *
 * Roda num contexto isolado e expõe ao front APENAS uma superfície mínima e
 * explícita (window.vektaDesktop). Nada de Node/fs/child_process vaza para o
 * renderer — todo o acesso ao SO continua no server/main process.
 *
 * `window.vektaDesktop` só existe quando a interface roda dentro do Electron;
 * no modo web (`npm start`) fica undefined, então o front pode detectar o
 * ambiente com `if (window.vektaDesktop)`.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vektaDesktop', {
  /** Relança o app para aplicar código de backend novo (ver relancar() no main). */
  relaunch: () => ipcRenderer.invoke('vekta:relaunch'),
});
