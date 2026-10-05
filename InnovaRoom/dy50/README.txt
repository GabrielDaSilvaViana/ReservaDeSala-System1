Instruções — Integração DY50 (drivers e UI)

Objetivo
- Fornecer instruções e arquivos auxiliares para instalar os drivers do leitor biométrico DY50 e integrar a leitura de digitais à tela de biometria do InnovaRoom sem alterar os arquivos existentes.

O que inclui esta pasta
- download_drivers.ps1  -> script PowerShell para baixar drivers (ajuste URL)
- dy50_integration.js   -> script cliente que adiciona uma UI de biometria e chama endpoints do servidor
- dy50_fallback.js      -> script de teste/fallback para simular leituras biométricas

Passos recomendados para instalar os drivers (Windows)
1. Baixe o driver oficial DY50 no site do fabricante. Exemplos de termos de busca: "DY50 fingerprint driver Windows" ou "DY50 USB fingerprint driver".
2. Caso tenha recebido um arquivo ZIP/EXE do fabricante, execute o instalador como Administrador.
3. Verifique no Gerenciador de Dispositivos que o leitor aparece sem erros (Dispositivos de Interface Humana / Leitora biométrica).

Automatizar o download (opcional)
- Abra PowerShell como Administrador e execute `.	y50\download_drivers.ps1` após editar a variável `$DriverUrl` no topo do script para apontar para o arquivo ZIP/EXE oficial.
- O script tentará baixar para `InnovaRoom\dy50\drivers` e descompactar se for ZIP.

Como integrar a UI ao projeto (sem modificar arquivos existentes)
- Para usar os arquivos criados você precisa apenas incluir os recursos nas páginas que precisam da biometria. No `Index.html`, adicione (apenas uma vez) as linhas abaixo antes de `</body>`:

  <script src="dy50/dy50_integration.js"></script>
  <script src="dy50/dy50_fallback.js"></script>
  <link rel="stylesheet" href="biometry-ui.css">

- Se você não quiser alterar `Index.html`, pode abrir o console do navegador e executar manualmente:

  var s=document.createElement('script');s.src='/dy50/dy50_integration.js';document.body.appendChild(s);
  var s2=document.createElement('script');s2.src='/dy50/dy50_fallback.js';document.body.appendChild(s2);
  var l=document.createElement('link');l.rel='stylesheet';l.href='/biometry-ui.css';document.head.appendChild(l);

Integração com hardware DY50
- Em muitos leitores DY50 a comunicação é feita via um SDK nativo (DLL) ou um serviço que expõe a digital ao sistema operacional.
- O `dy50_integration.js` expõe uma função global `window.dy50_onFingerprintScanned(fingerprintCode)` que deve ser chamada pelo middleware local (SDK/driver) quando uma digital for lida.
- Ao receber a leitura, o script chama `/api/authenticate` e, em caso de sucesso, chama `/api/solenoid/unlock` para destrancar.

Testes locais sem hardware
- Use `dy50_fallback.js` para simular leituras e validar a UI e o fluxo de desbloqueio.

Notas de segurança
- Drivers devem ser baixados apenas de fontes oficiais.
- Para uso em produção, verifique assinaturas digitais do instalador e teste em ambiente isolado antes de implantar.

Suporte
- Se me autorizar, posso tentar adicionar um endpoint server-side para servir os binários dos drivers localmente (requere permissão para download automático).