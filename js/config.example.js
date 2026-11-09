/**
 * Configuração local do Visualizador Geoespacial.
 *
 * Copie este arquivo para js/config.js e preencha apenas as chaves que você
 * realmente utiliza. O js/config.js está no .gitignore e não deve ser
 * versionado: em um site público, qualquer chave embutida no código é
 * visível para todos e será sinalizada por scanners de segredos.
 *
 * Sem chave, o app usa os tiles públicos do CARTO (sem autenticação).
 */
window.APP_CONFIG = {
  // Chave opcional do CARTO Basemaps (usada apenas se preenchida).
  cartoKey: '',

  // Chave opcional do MapTiler (sem ela, a camada "Massa d'Água" do
  // index-legacy.html não é carregada).
  maptilerKey: '',
};
