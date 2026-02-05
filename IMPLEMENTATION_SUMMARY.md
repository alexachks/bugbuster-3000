# AI Agent Implementation Summary

## ✅ Completed Implementation

Полностью реализован **AI Support Agent** — гибридный AI агент для автоматического анализа багов из Zoho Cliq и создания детальных Jira тикетов.

## 🏗️ Архитектура

### Hybrid AI System

```
┌──────────────────────────────────────────────┐
│          Cliq Message (Bug Report)           │
└──────────────┬───────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│         Webhook Handler + Orchestrator       │
└──────────────┬───────────────────────────────┘
               │
    ┌──────────┴──────────┐
    ▼                     ▼
┌─────────────┐    ┌─────────────┐
│  Claude API │    │ Claude Code │
│  (Sonnet    │    │     CLI     │
│    4.5)     │    │  (Deep      │
│             │    │  Analysis)  │
│ - Reasoning │    │             │
│ - Planning  │    │ - Multi-file│
│ - Tool Use  │    │ - Complex   │
└─────┬───────┘    └──────┬──────┘
      │                   │
      └────────┬──────────┘
               │
               ▼
        ┌─────────────┐
        │   10 Tools  │
        └─────┬───────┘
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
  Code     Logs      Jira
 Analysis  Check   Ticket
```

### Tool System

**10 специализированных инструментов:**

1. **search_code** - Поиск по коду (ripgrep/grep)
2. **read_file** - Чтение файлов (полностью или частично)
3. **git_log** - История коммитов
4. **git_diff** - Сравнение версий
5. **query_logs** - Анализ Docker логов
6. **list_files** - Список файлов в директории
7. **check_env_vars** - Проверка environment variables
8. **ask_user** - Уточняющие вопросы в Cliq
9. **run_claude_code** - Глубокий анализ через Claude Code CLI
10. **create_jira_ticket** - Создание Jira тикета

## 📁 Структура Проекта

```
ai_agent/
├── src/
│   ├── server.js                 # Express server
│   ├── routes/
│   │   ├── cliq.js              # Webhook handler
│   │   └── health.js            # Health checks
│   ├── services/
│   │   ├── claude-agent.js      # Main AI brain
│   │   ├── conversation-manager.js
│   │   └── cliq.js              # Cliq API integration
│   └── tools/
│       ├── index.js             # Tool registry
│       ├── search-code.js       # Code search
│       ├── read-file.js         # File reading
│       ├── git-log.js           # Git history
│       ├── git-diff.js          # Git diff
│       ├── query-logs.js        # Docker logs
│       ├── list-files.js        # File listing
│       ├── check-env-vars.js    # Env var checks
│       ├── ask-user.js          # User interaction
│       ├── run-claude-code.js   # Claude Code CLI
│       └── create-jira-ticket.js
├── Dockerfile
├── package.json
├── .env.example
├── README.md                    # Full documentation
├── DEPLOYMENT.md                # Production setup
├── QUICKSTART.md                # 15-min setup guide
└── test-local.js                # Local testing
```

## 🚀 Возможности

### Автоматический Анализ Багов

**Входные данные:** Сообщение пользователя в Cliq

**Процесс:**
1. Webhook получает сообщение
2. Claude анализирует описание
3. Использует tools для исследования:
   - Ищет код по ключевым словам
   - Читает затронутые файлы
   - Смотрит историю коммитов
   - Проверяет логи на ошибки
   - Анализирует git diff последних изменений
4. При необходимости задаёт уточняющие вопросы
5. Для сложных случаев запускает Claude Code CLI
6. Создаёт детальный Jira тикет

**Выходные данные:**
- Детальный анализ проблемы
- Root cause
- Затронутые файлы с номерами строк
- Возможное решение
- Jira тикет с полным контекстом

### Пример Работы

**Пользователь:**
> "PDF export не работает после вчерашнего обновления"

**Агент выполняет:**
```javascript
1. search_code("pdf export")
   → Находит: src/api/pdf/route.ts

2. read_file("src/api/pdf/route.ts")
   → Видит использование PDF.create()

3. git_log("src/api/pdf/")
   → Находит коммит abc123 вчера: "update PDF lib to v2.0"

4. git_diff("abc123")
   → Видит изменение: PDF.create() теперь async

5. query_logs("main-app", "pdf|error")
   → Находит: "UnhandledPromiseRejection at PDF.create"

6. create_jira_ticket({
     title: "PDF export fails after library update",
     description: `
       ## Problem
       PDF export fails with UnhandledPromiseRejection

       ## Root Cause
       In commit abc123, PDF library was updated from v1.2 to v2.0.
       The new version requires await on PDF.create()

       ## Affected Files
       • src/api/pdf/route.ts:42

       ## Fix
       Change line 42:
       const pdf = PDF.create(options)
       to:
       const pdf = await PDF.create(options)

       ## Evidence
       - Last working version: commit abc122
       - Error log: UnhandledPromiseRejection
       - Commit introducing bug: abc123 (yesterday)
     `,
     priority: "High",
     labels: ["bug", "pdf", "backend"]
   })
```

**Ответ пользователю:**
```
✅ Найдена проблема:

В коммите abc123 (вчера) библиотека PDF была обновлена до v2.0.
Новая версия требует await на PDF.create().

Затронутый файл: src/api/pdf/route.ts:42

Решение: добавить await перед PDF.create()

🎫 Jira тикет создан: PROJ-1234
https://your-domain.atlassian.net/browse/PROJ-1234
```

## 🔐 Безопасность

- ✅ **Webhook Verification**: HMAC-SHA256 signature
- ✅ **Read-Only Repository**: Mounted as read-only volume
- ✅ **Docker Socket Limited**: Only log reading access
- ✅ **Path Traversal Protection**: File access validation
- ✅ **RLS Enabled**: Row Level Security on conversations
- ✅ **Secrets in Env**: No hardcoded credentials

## 📊 Cost Estimation

**Per Bug Report:**
- Claude API: $0.05 - $0.15
- Tools: Free (local operations)
- Storage: Minimal

**Monthly (100 reports):**
- Total: ~$5 - $15

## 🛠️ Deployment

### Автоматический Деплой (GitHub Actions)

**Trigger:** Push to `main` с изменениями в `ai_agent/`

**Процесс:**
1. Build Docker image
2. Push to GHCR
3. Deploy to server
4. Clone/update repository
5. Start container

**Secrets required:**
- `ANTHROPIC_API_KEY`
- `CLIQ_WEBHOOK_SECRET`
- `CLIQ_API_TOKEN`
- `JIRA_API_TOKEN`
- `GH_PAT`

### Где Хостится

**Main CRM Server:**
- Main App (port 3000)
- **AI Agent (port 3002)** ← новый сервис
- Доступ к Docker socket для логов
- Клон репозитория в /opt/awkward-crm-repo

**SEO Engine Server (5.161.204.47):**
- SEO Engine (port 3001)

## 📚 Документация

| Файл | Описание |
|------|----------|
| **README.md** | Полная документация (архитектура, API, примеры) |
| **DEPLOYMENT.md** | Production setup (секреты, Cliq, Jira, deployment) |
| **QUICKSTART.md** | Quick start за 15 минут |
| **IMPLEMENTATION_SUMMARY.md** | Этот файл (обзор имплементации) |

## 🧪 Тестирование

### Локальное Тестирование

```bash
# 1. Установить зависимости
npm install

# 2. Создать .env
cp .env.example .env
# Добавить ANTHROPIC_API_KEY и REPO_CLONE_PATH

# 3. Клонировать репозиторий для анализа
git clone https://github.com/your-org/repo.git /tmp/repo-clone

# 4. Запустить сервис
npm run dev

# 5. Тестировать без Cliq
npm run test:local "Search for authentication code"
```

### Health Checks

```bash
# Basic health
curl http://localhost:3002/health

# Detailed health
curl http://localhost:3002/health/detailed
```

## ✨ Ключевые Особенности

1. **Гибридная Архитектура**
   - Claude API для reasoning
   - Claude Code CLI для глубокого анализа
   - Best of both worlds

2. **Tool Use System**
   - 10 специализированных инструментов
   - Extensible (легко добавить новые)
   - Safe execution (timeout, error handling)

3. **Conversation Management**
   - Persistent state в Supabase
   - In-memory cache для active conversations
   - Auto-cleanup после 24h

4. **Repository Access**
   - Read-only clone
   - Git operations
   - Code search (ripgrep)
   - File reading

5. **Docker Integration**
   - Query logs from containers
   - Check env vars
   - Secure socket access

6. **Jira Automation**
   - Detailed tickets
   - Affected files list
   - Root cause analysis
   - Possible fixes

## 🔮 Будущие Улучшения

- [ ] Automated tests
- [ ] Rate limiting
- [ ] Metrics dashboard
- [ ] Multi-channel support
- [ ] GitHub PR creation
- [ ] Slack integration
- [ ] Custom tool additions via config

## 📞 Support

- **Documentation**: `ai_agent/README.md`
- **Quick Start**: `ai_agent/QUICKSTART.md`
- **Deployment**: `ai_agent/DEPLOYMENT.md`
- **Contact**: sasha@awkward-media.com

## ✅ Ready for Production

Сервис полностью готов к продакшн деплою. Осталось только:

1. Получить API keys (Anthropic, Cliq, Jira)
2. Настроить Cliq webhook
3. Добавить secrets в GitHub
4. Push to main → auto-deploy

**Estimated setup time: 30 minutes**
