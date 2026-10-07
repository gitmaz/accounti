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

## Deploy

```bash
npm run spa:build
npx cdk deploy --all -c stage=dev -c spaHosting=cloudfront -c spaUpload=true --require-approval never
```
