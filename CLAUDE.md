# Agent instructions

Инструкции для агента по работе с этим репозиторием. Следуй им всегда.

## Проект

- `family_tree_tool` — локальный GUI для ведения семейной картотеки.
- `gui_server.py` — локальный HTTP-сервер и API на Python (stdlib, без фреймворков).
- `gui/` — фронтенд: `index.html`, `styles.css`, `js/` (ванильный JS, модули; граф на dagre).
- `template-data/docs/` — шаблон картотеки без личных данных.
- `config.json` — рабочая конфигурация, в git не хранится (`config.example.json` — пример).
- Данные — markdown-карточки в `docs/`: `03-people/`, `04-groups/`, `05-places/`, `06-sources/`, `07-research/`.
- Запуск: `python3 gui_server.py`, интерфейс на `http://127.0.0.1:8765`.

## Token-efficient editing

- Do not read entire files when the relevant symbol is known.
- Search for the symbol first and read only nearby lines.
- Prefer minimal patches over rewriting complete files.
- Do not inspect node_modules, dist, build, coverage or generated files.
- Run tests and linters only for affected files first.
- After editing, inspect only the changed diff.
- Keep responses concise.

## Commit / branch / review (husky + commitlint enforced)

Перед коммитом:

- Всегда сначала предложи текст Commit и дождись явного одобрения — не запускай `git commit`, пока пользователь не подтвердит формулировку.
- Никогда не делай Commit в `master`/`main`. Если на master/дефолтной ветке — сначала предложи создать новую ветку.
- Commit и PUSH только когда пользователь просит.
- После задачи, перед Commit, прогони code-review по изменённым файлам и почини найденное.

Формат сообщения:

- Conventional Commits: `type(scope): description`.
- Разрешённые типы: `feat, update, minor, fix, docs, style, refactor, test, revert, ci, perf`.
- Максимум 150 символов в заголовке.
- Всё сообщение (заголовок + тело) на английском.
- НЕ добавляй трейлер `Co-Authored-By: Claude` и любое упоминание авторства AI (это противоположно дефолту Claude Code — здесь побеждает это правило).

Прочее:

- Именование веток: `<issue-number>-<description-in-lowercase-english>`.

Keep status messages under 5 lines.

After an edit, report only:
- files changed;
- what changed;
- test result;
- unresolved issue, if any.

Do not explain obvious code.
Do not repeat the task.
Do not paste code that already exists in the modified file.
