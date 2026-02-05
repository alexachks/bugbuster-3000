# Next Steps: Getting AI Agent Running

## 🎯 Что Сделано

✅ Полная имплементация AI Agent Service
✅ 10 специализированных tools
✅ Claude API + Claude Code CLI интеграция
✅ Cliq webhook handler
✅ Jira integration
✅ Conversation management
✅ Docker configuration
✅ GitHub Actions deployment workflow
✅ Полная документация

## 🚀 Следующие Шаги

### 1. Локальное Тестирование (15 мин)

```bash
# 1. Перейти в директорию
cd ai_agent

# 2. Установить зависимости
npm install

# 3. Создать .env файл
cp .env.example .env

# 4. Добавить минимальные настройки в .env:
# ANTHROPIC_API_KEY=sk-ant-xxx
# REPO_CLONE_PATH=/Users/admin/Documents/Awkward CRM  # Прямой доступ к проекту
# PORT=3002

# 5. Запустить сервис
npm run dev

# Должно показать:
# 🤖 AI Agent running on port 3002
# 🩺 Health check: http://localhost:3002/health
# 🔧 Claude API: ✓ Configured
```

**Note:** В dev режиме используем прямой доступ к рабочей директории проекта для мгновенного доступа к изменениям.

### 2. Проверить Health Check

```bash
curl http://localhost:3002/health
```

Ожидаемый ответ:
```json
{
  "status": "healthy",
  "service": "AI Agent",
  "features": {
    "claudeAPI": "enabled",
    "cliqIntegration": "disabled",
    "jiraIntegration": "disabled",
    "githubAccess": "disabled",
    "dockerLogs": "disabled"
  }
}
```

### 3. Тест Без Cliq

```bash
npm run test:local "Find authentication code in the project"
```

Должно показать:
- Поиск кода
- Чтение файлов
- Git history
- Детальный анализ

### 4. Применить Database Migration

**В Supabase Dashboard:**

1. Open SQL Editor
2. Run: `../migrations/015_ai_agent_conversations.sql`
3. Verify table created: `ai_agent_conversations`

### 5. Настроить Cliq (30 мин)

**См. подробную инструкцию в `DEPLOYMENT.md`, секция 2**

Коротко:
1. Создать бота в Zoho Cliq
2. Получить Bot Token
3. Настроить Webhook URL
4. Сгенерировать Secret: `openssl rand -hex 32`
5. Добавить в `.env`:
   ```
   CLIQ_API_TOKEN=your_bot_token
   CLIQ_WEBHOOK_SECRET=generated_secret
   ```

### 6. Настроить Jira (15 мин)

**См. подробную инструкцию в `DEPLOYMENT.md`, секция 3**

Коротко:
1. Создать API Token в Jira
2. Найти Project Key
3. Добавить в `.env`:
   ```
   JIRA_BASE_URL=https://your-domain.atlassian.net
   JIRA_EMAIL=your-email@example.com
   JIRA_API_TOKEN=your_token
   JIRA_PROJECT_KEY=PROJ
   ```

### 7. Тест С Cliq

1. Добавить бота в тестовый канал
2. Написать сообщение: "Test message: app is slow"
3. Бот должен:
   - React with 👀
   - Проанализировать
   - Ответить
   - React with ✅

### 8. Deployment to Production (автоматический)

**Добавить Secrets в GitHub:**

```bash
# Go to: GitHub Repo → Settings → Secrets and Variables → Actions

# Add these secrets:
ANTHROPIC_API_KEY=sk-ant-xxx
CLIQ_WEBHOOK_SECRET=xxx
CLIQ_API_TOKEN=xxx
JIRA_BASE_URL=https://xxx.atlassian.net
JIRA_EMAIL=xxx@example.com
JIRA_API_TOKEN=xxx
JIRA_PROJECT_KEY=PROJ
GH_PAT=ghp_xxx  # GitHub Personal Access Token
```

**Deploy:**

```bash
git add .
git commit -m "feat: Add AI Agent Service for Cliq bug analysis"
git push origin main
```

GitHub Actions автоматически:
- Соберёт Docker image
- Deploy на сервер
- Клонирует репозиторий
- Запустит контейнер

### 9. Verify Production Deployment

```bash
# SSH to server
ssh username@your-server

# Check container
docker ps | grep ai-agent

# Check logs
docker logs awkward-crm-ai-agent

# Check health
curl http://localhost:3002/health
```

### 10. Configure Cliq Webhook URL (Production)

В Cliq Bot Settings → Webhook:
```
URL: https://your-domain.com/webhook/cliq
```

## 📋 Checklist

**Local Testing:**
- [ ] npm install успешно
- [ ] .env создан и заполнен
- [ ] Репозиторий клонирован в REPO_CLONE_PATH
- [ ] npm run dev запускается
- [ ] Health check работает
- [ ] test:local выполняется

**Cliq Integration:**
- [ ] Бот создан в Cliq
- [ ] Bot Token получен
- [ ] Webhook настроен
- [ ] Secret сгенерирован
- [ ] Переменные добавлены в .env

**Jira Integration:**
- [ ] Jira API Token создан
- [ ] Project Key найден
- [ ] Переменные добавлены в .env
- [ ] Тестовый тикет создаётся

**Production Deployment:**
- [ ] Все secrets добавлены в GitHub
- [ ] Migration применён в Supabase
- [ ] Код закоммичен и запушен
- [ ] GitHub Action успешно выполнился
- [ ] Контейнер запущен на сервере
- [ ] Health check на продакшене работает
- [ ] Cliq webhook URL обновлён на production URL

**End-to-End Test:**
- [ ] Сообщение в Cliq обрабатывается
- [ ] Бот отвечает с анализом
- [ ] Jira тикет создаётся (если нужно)
- [ ] Лог показывает все tool executions

## 🐛 Troubleshooting

**Если что-то не работает:**

1. **Проверить логи:**
   ```bash
   # Local
   npm run dev  # смотреть в консоли

   # Production
   docker logs awkward-crm-ai-agent
   ```

2. **Проверить health:**
   ```bash
   curl http://localhost:3002/health/detailed
   ```

3. **Проверить secrets:**
   - Все ли переменные заполнены?
   - Правильные ли значения?
   - Нет ли лишних пробелов?

4. **Смотреть документацию:**
   - `README.md` - полная документация
   - `DEPLOYMENT.md` - production setup
   - `QUICKSTART.md` - quick start guide

## 💡 Tips

- **Начни с локального тестирования** - убедись что всё работает локально
- **Используй test:local** для проверки без Cliq
- **Добавляй один интеграцию за раз** - Cliq → Jira → Production
- **Читай логи** - они очень подробные и помогают debugging
- **Health checks твои друзья** - используй их постоянно

## 📞 Need Help?

- 📖 [README.md](./README.md)
- 🚀 [DEPLOYMENT.md](./DEPLOYMENT.md)
- ⚡ [QUICKSTART.md](./QUICKSTART.md)
- 📊 [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)

## 🎉 Success Criteria

Агент работает правильно когда:

1. ✅ Health check возвращает "healthy"
2. ✅ Сообщение в Cliq обрабатывается за < 30 секунд
3. ✅ Агент использует минимум 3-5 tools на запрос
4. ✅ Ответ содержит детальный анализ с файлами и строками
5. ✅ Jira тикет создаётся автоматически (если это реальный баг)
6. ✅ Нет ошибок в логах

---

**Готово к запуску! 🚀**

Если всё правильно настроено, первый bug report будет проанализирован автоматически и тикет создан в Jira.
