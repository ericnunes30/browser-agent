# BrowserAgent — Checklist Chrome Web Store

## ✅ O que já está pronto

| Item | Status |
|------|--------|
| Manifest V3 válido | ✅ |
| Build funcional (`npm run build`) | ✅ Corrigido bug `executeJavaScriptTool` |
| Pacote ZIP gerado (`browser-agent.zip`) | ✅ 101 KB |
| Ícones (16/32/48/128) | ✅ |
| i18n (en + pt_BR) | ✅ |
| i18n fallback (`default_locale: "en"`) | ✅ |
| Versão no manifest | ✅ `0.1.0` |

---

## 🔴 O que ainda falta fazer

### 1. Conta de Desenvolvedor Chrome Web Store
- Acesse: https://chrome.google.com/webstore/devconsole
- Pague a taxa única de **US$ 5,00**
- Verifique sua conta (pode levar alguns dias)

### 2. Política de Privacidade
**⚠️ OBRIGATÓRIA** para extensões com permissões como `debugger`, `tabs`, `host_permissions: <all_urls>`, `downloads`, `nativeMessaging`.

> A Google **rejeita** extensões com permissões sensíveis sem política de privacidade.

- Crie uma página pública (GitHub Pages, Vercel, Netlify, etc.)
- Exemplo em `PRIVACY_POLICY.md` — hospede-o online e copie a URL

### 3. Screenshots da Extensão
**Obrigatório**: mínimo 1, ideal 3-5
- Resolução: **1280×800** ou **1440×900**
- Mostre:
  1. Side panel aberto com chat
  2. Options page (configurações)
  3. Indicador visual na página (phantom cursor / highlight)
  4. Prompt de permissão

> Screenshots devem ser em **inglês** (ou no idioma principal da publicação).

### 4. Ícone Promocional (Opcional, mas recomendado)
- **Small promo tile**: 440×280 px
- **Marquee promo tile**: 1400×560 px

### 5. Vídeo Promocional (Opcional)
- YouTube link

### 6. Descrição Completa da Loja
A descrição curta (`"appDesc"`) já está no `_locales/en/messages.json`:  
> *"AI-powered browser agent with any LLM"*

Mas você precisa de uma **descrição longa** no painel de publicação (~500 caracteres):

```
BrowserAgent lets you control your browser with AI using any LLM provider 
(OpenAI, Anthropic, Google, Ollama, etc.). Navigate pages, click elements, 
fill forms, take screenshots, download files, and automate repetitive tasks 
— all through natural-language chat in the Chrome side panel.

Features:
• Chat-based browser automation
• Works with any LLM (OpenAI-compatible, Anthropic, Gemini, Ollama)
• Visual indicators show what the agent is doing
• Permission system keeps you in control
• Scheduled tasks for recurring automation
• File operations (read/create/edit)
• Web search & page fetching
```

---

## 🟡 Justificativas de Permissões (Importantíssimo!)

Ao publicar, a Google vai pedir **justificativa para cada permissão**. Prepare respostas claras em inglês:

| Permissão | Justificativa Sugerida |
|-----------|------------------------|
| `debugger` | Required to execute JavaScript in arbitrary web pages and bypass CSP/TrustedTypes restrictions during browser automation tasks initiated by the user. |
| `nativeMessaging` | Enables communication with the local Pi Coding Agent SDK for model discovery, authentication, and advanced LLM streaming. |
| `downloads` | Allows the AI agent to save files to disk when requested by the user (e.g., "download this PDF"). |
| `scripting` | Injects content scripts to provide visual feedback (cursor, highlights) and extract page accessibility trees for the AI. |
| `tabs` | Tracks active tabs to maintain per-tab conversation state and execute actions on the correct page. |
| `activeTab` | Grants temporary access to the currently active tab so the agent can interact with it upon user request. |
| `host_permissions: <all_urls>` | The agent must be able to navigate and interact with any website the user instructs it to visit. |
| `alarms` | Keeps the service worker alive and schedules recurring automation tasks. |
| `notifications` | Alerts the user when scheduled tasks complete or require attention. |
| `storage` / `unlimitedStorage` | Persists user settings, API configurations, conversation history, and site permissions locally. |
| `webNavigation` | Detects page navigations so the agent knows when a page finished loading. |
| `offscreen` | Enables extended APIs (audio playback, media generation) outside the service worker. |
| `tabGroups` | Groups tabs opened by the agent to keep the browser organized during multi-step tasks. |
| `sidePanel` | Displays the chat UI in Chrome's side panel. |

> 💡 **Dica**: Na hora de preencher o formulário da CWS, seja **transparente e específico**. Evite frases genéricas como "needed for functionality".

---

## ⚠️ Riscos de Rejeição e Como Mitigar

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Permissão `debugger` muito poderosa | 🟡 Média | Justifique com o uso específico (CSP bypass para automation). Ofereça modo sem `debugger` se possível. |
| `nativeMessaging` sem host binário incluso | 🟢 Baixa | O host não precisa estar no ZIP, mas explique que é um companion app opcional. |
| Descrição inadequada | 🟡 Média | Seja explícito: "AI agent", "user-controlled", "requires explicit permission". |
| Ausência de política de privacidade | 🔴 Alta | **Crie e hospede ANTES de submeter.** |
| Screenshots ruins/faltando | 🟡 Média | Use resolução exata (1280×800), sem bordas, cenários reais. |
| Versão beta / "em breve" | 🟢 Baixa | Evite strings como "coming soon" na UI publicada. Já removemos `"header_model_soon"`. |
| Código ofuscado / minificado suspeito | 🟢 Baixa | O build Vite gera código legítimo, não precisa se preocupar. |

---

## 📋 Passo a Passo para Submeter

1. **Finalize a política de privacidade**
   - Hospede online
   - Pegue a URL pública

2. **Capture screenshots**
   - 1280×800, cenários reais, em inglês
   - Salve em `store-assets/screenshots/`

3. **Atualize a versão (se desejar)**
   - Edite `manifest.json` → `"version": "1.0.0"`
   - Atualize `package.json` também para consistência

4. **Regenere o ZIP**
   ```bash
   npm run build
   # (ou manualmente re-zip dist/)
   ```

5. **Acesse o Developer Dashboard**
   - https://chrome.google.com/webstore/devconsole

6. **Clique em "New Item"**
   - Faça upload do `browser-agent.zip`

7. **Preencha os campos:**
   - **Category**: Productivity / Developer Tools
   - **Language**: English (primary), Portuguese (Brazil)
   - **Description**: Cole a descrição longa (item 6)
   - **Privacy Policy URL**: URL da sua página hospedada
   - **Support URL**: GitHub Issues ou email de suporte
   - **Screenshots**: Upload das imagens
   - **Promotional images**: Opcional

8. **Justifique as permissões**
   - Use a tabela do item "Justificativas de Permissões"

9. **Selecione distribuição**
   - Visibility: **Public** (ou Trusted Testers primeiro)
   - Markets: Selecione os países desejados
   - Price: Free

10. **Submit for review**
    - Tempo de revisão: geralmente **1-3 dias úteis**
    - Pode ser mais longo se houver permissões sensíveis (`debugger`)

---

## 📁 Assets da Loja

Crie a pasta:
```
store-assets/
├── screenshots/
│   ├── 01-sidepanel-chat.png        (1280×800)
│   ├── 02-options-page.png          (1280×800)
│   ├── 03-visual-indicators.png     (1280×800)
│   ├── 04-permission-prompt.png     (1280×800)
│   └── 05-task-manager.png         (1280×800)
├── promo-small.png                  (440×280)
└── promo-marquee.png                (1400×560)
```

---

## 🚀 Dica Final: Teste como Reviewer da Google

Antes de submeter, carregue a extensão em um Chrome limpo:
1. `chrome://extensions` → Developer mode ON
2. Load unpacked → selecione `dist/`
3. Teste **todas** as permissões e fluxos principais
4. Verifique o console do service worker por erros
5. Abra o DevTools do side panel → verifique se não há 404s ou crashes

Se algo quebrar, a Google rejeita. Teste bem!

---

**Resumo: os 3 bloqueios reais agora são:**
1. ❌ Política de privacidade hospedada online
2. ❌ Screenshots em 1280×800
3. ❌ Conta de desenvolvedor CWS ativa (US$ 5)

Os demais itens são preenchimento de formulário e aguardar revisão.
