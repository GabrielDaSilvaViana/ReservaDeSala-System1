// Script de fallback para testar fluxo de biometria sem hardware
// Exponha uma função geradora e um botão para enviar códigos simulados

if (!window.dy50_fallback_generate) {
    window.dy50_fallback_generate = function(){
        // Gera um código pseudo-único para testes
        return 'FB-' + Math.floor(Math.random()*900000+100000);
    };
}

// Opcional: cria um pequeno painel de testes global caso queira acesso rápido
(function(){
    if (window.__dy50_fallback_loaded) return; window.__dy50_fallback_loaded = true;
    const btn = document.createElement('button');
    btn.id = 'dy50-fallback-send';
    btn.textContent = 'Enviar digital (fallback)';
    btn.style = 'position:fixed;right:18px;bottom:300px;z-index:99999;padding:8px 10px;border-radius:6px;background:#222;color:#fff;border:0;cursor:pointer;font-family:Inter,Arial';
    btn.onclick = function(){
        const code = window.dy50_fallback_generate();
        if (window.dy50_onFingerprintScanned) {
            window.dy50_onFingerprintScanned(code);
        } else {
            alert('dy50_integration.js não está carregado. Carregue o script dy50/dy50_integration.js primeiro.');
        }
    };
    document.body.appendChild(btn);
})();
