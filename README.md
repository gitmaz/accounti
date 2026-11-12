# Accounti

Australian company books. Staff raise tax invoices and supplier bills, an accountant posts them, and feature set C can require approval first. GST, a BAS worksheet, and a financial year that starts on 1 July are built in.

## Feature sets

- **A** — chart of accounts, contacts with an ABN check, tax invoices, bills, journals, and GST on each line.
- **B** — adds the BAS worksheet (G1, 1A, 1B), profit and loss, balance sheet, and print.
- **C** — adds optional approval, a second approver, bank reconciliation, comments, and email. A blank SMTP host sends that email through Amazon SES. Only a super admin sees SMTP.

## Roles

Admin, accountant, approver, bookkeeper, and auditor. Auditors read. Bookkeepers draft. Approvers decide. Accountants post and reconcile. Admins rename labels and add fields.

## Demo

Company `/harbour`. Password `accounti123`.

- `admin@accounti.demo`
- `accountant@accounti.demo`
- `approver@accounti.demo`
- `bookkeeper@accounti.demo`
- `auditor@accounti.demo`

```bash
npm install
npm --prefix spa install
npm test
npm run dev
```

The local SPA is http://localhost:3060 and the API is http://localhost:3061.

## E2E tests (local, no deploy)

Browser tests run against a dedicated company **`/autotest`** (Autotest Lab) so `/harbour` stays untouched. Demo auth seeds that tenant; each test calls `POST /auth/e2e/reset` to wipe its books and restore the seed roster. The runner starts the local API and SPA when they are not already up (ports 3060/3061), so you do not need to deploy — or to record a demo video from the headed run.

The URL and emails use **autotest** (not a testing-tool name) so a screen recording looks like a normal company demo.

### First-time setup

```bash
npx playwright install chromium
# On a lean WSL/Ubuntu host, either:
#   sudo npx playwright install-deps
# or extract the missing shared libraries under ~/.local/playwright-deps
# (scripts/e2e-run.mjs adds that path to LD_LIBRARY_PATH).
```

### Commands

```bash
npm run test:e2e                      # headless
npm run test:e2e:headed               # watch the browser (maximized)
npm run test:e2e:headed -- --slow     # maximized + 800ms slowMo (2×) + on-screen toasts
npm run test:e2e:headed -- --slower   # maximized + 1200ms slowMo (3×) + on-screen toasts
```

Pass any extra Playwright args after `--`, for example `npm run test:e2e:headed -- --slow -g "bill"`.

### Notes

- **`--slow` / `--slower`** force headed mode, maximise Chromium, and narrate on screen: a large centered toast for the test title (with a short pause to read), then bottom-right toasts for each fill/click/select/stage. The title toast clears as soon as the next toast appears. Off-screen controls are scrolled into view before each action.
- **Tenant.** Autotest Lab users (password `accounti123`): `admin@autotest.accounti`, `accountant@autotest.accounti`, `approver@autotest.accounti`, `bookkeeper@autotest.accounti`, `auditor@autotest.accounti`. Seed includes one customer and one supplier; documents start empty.
- **Servers.** Existing `npm run dev` on 3060/3061 is reused by default. Force a fresh pair with `E2E_REUSE_SERVER=0 npm run test:e2e` after API/seed changes.
- **Store.** E2E memory data lives in `data/e2e-store.json` (gitignored), separate from harbour’s `data/store.json`.

### Coverage (`e2e/workflows.spec.ts`)

- Bookkeeper sign-in and empty invoice list
- Create invoice → post → mark paid
- Bill two-step approve → post → mark paid (with comment)
- Journal submit → approve chain → post
- Add a contact with a valid ABN
- Admin renames a label, adds a field, and saves settings
- Admin adds a person; that person can sign in
- Approver and auditor cannot create documents
- Search finds a posted invoice; Reports open

## Deploy

```bash
npm run spa:build
npx cdk deploy --all -c stage=dev -c spaHosting=cloudfront -c spaUpload=true --require-approval never
```
