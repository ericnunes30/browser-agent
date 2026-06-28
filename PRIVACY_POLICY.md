# Privacy Policy — BrowserAgent

**Effective Date:** June 10, 2026

## 1. Introduction

BrowserAgent ("we", "our", or "us") is a Chrome extension that provides AI-powered browser automation. This Privacy Policy explains how we collect, use, and protect your information when you use BrowserAgent.

## 2. Information We Collect

### 2.1 Locally Stored Information
All data processed by BrowserAgent is stored **locally on your device** using Chrome's `chrome.storage.local` API. We do not operate remote servers for this extension.

Data stored locally includes:
- **API configuration**: Base URLs and API keys for LLM providers you configure manually
- **Conversation history**: Chat messages and tool execution logs per browser tab
- **Site permissions**: Your allow/deny decisions for specific domains
- **Scheduled tasks**: Automation tasks you create within the extension
- **Settings**: Theme preferences, language selections, and UI state

### 2.2 Data Sent to Third Parties
BrowserAgent sends data **only to the LLM providers you explicitly configure** (e.g., OpenAI, Anthropic, Google, Ollama, OpenRouter). This includes:
- Page text and screenshots of the active tab (only when you send a message)
- Tool execution results (e.g., "clicked button X", "page text is Y")
- Your chat messages and prompts

**We do not:**
- Route your data through our own servers
- Log or store your conversations on external infrastructure
- Sell, share, or transfer your data to any third party beyond your chosen LLM provider

### 2.3 Optional Native Messaging Host
If you choose to install the optional **Pi Coding Agent Native Messaging Host**, communication occurs strictly between the BrowserAgent extension and the local host application on your machine. No data leaves your device through this channel.

## 3. Permissions and Their Purpose

BrowserAgent requests the following Chrome permissions solely for the stated purposes:

| Permission | Purpose |
|------------|---------|
| `debugger` | Execute JavaScript in web pages during user-requested automation tasks |
| `nativeMessaging` | Communicate with the optional local Pi Coding Agent SDK |
| `downloads` | Save files to disk when explicitly requested by the user |
| `scripting` | Inject visual indicators (cursor, highlights) into pages |
| `tabs` | Track active tabs to maintain per-tab conversation state |
| `activeTab` | Access the current tab only upon explicit user action |
| `alarms` | Keep the service worker responsive and schedule tasks |
| `notifications` | Alert users about task completions |
| `storage` | Persist user settings and history locally |
| `webNavigation` | Detect page loads to inform the agent of navigation results |
| `offscreen` | Support extended APIs (audio, media) outside the service worker |
| `tabGroups` | Organize tabs opened by the agent |
| `sidePanel` | Display the chat interface |
| `host_permissions` | Allow the agent to navigate and interact with any website you instruct it to visit |

## 4. Data Security

- API keys are stored in Chrome's encrypted storage and are never transmitted anywhere except to the provider's API endpoint you configured.
- The extension uses the minimum viable scope: it only accesses a tab's content when you send a message to the agent.
- All file operations (read/create/edit/download) require explicit user confirmation.

## 5. Your Rights and Choices

- **Uninstall**: Removing BrowserAgent from Chrome deletes all locally stored data immediately.
- **Clear History**: You can clear individual conversations or all history from the side panel UI.
- **Revoke Permissions**: You can disable or remove the extension at any time via `chrome://extensions`.
- **No Account Required**: BrowserAgent does not require user registration or login.

## 6. Children's Privacy

BrowserAgent is not directed at children under 13. We do not knowingly collect personal information from children.

## 7. Changes to This Policy

We may update this Privacy Policy. Changes will be posted with a new effective date. Continued use of BrowserAgent after changes constitutes acceptance.

## 8. Contact Us

For questions about this Privacy Policy, please open an issue on our GitHub repository or contact the developer directly.

---

*This extension is open-source. You can inspect the source code to verify these claims.*
