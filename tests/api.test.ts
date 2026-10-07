import { describe, expect, it } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

import { handler } from "../lambda/api/index";
import { resetStoreForTests } from "../lambda/api/store";

function event(method: string, path: string, body?: unknown, token?: string): APIGatewayProxyEventV2 {
  const [pathname, search] = path.split("?");
  const queryStringParameters = search ? Object.fromEntries(new URLSearchParams(search)) : undefined;
  return {
    rawPath: pathname,
    queryStringParameters,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    requestContext: { http: { method, path: pathname } },
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

async function read(result: Awaited<ReturnType<typeof handler>>) {
  if (typeof result === "string") return JSON.parse(result) as Record<string, unknown>;
  return JSON.parse(result.body || "{}") as Record<string, unknown>;
}

describe("accounti API", () => {
  it("lets the harbour admin post a bill only after both approvals", async () => {
    resetStoreForTests();
    const login = await handler(event("POST", "/auth/login", { email: "admin@accounti.demo", password: "accounti123" }));
    const session = await read(login);
    const token = String(session.token);
    const early = await handler(event("POST", "/harbour/documents/doc-bill-1/transition", { action: "post" }, token));
    expect(typeof early !== "string" && early.statusCode).toBe(400);

    const approver = await handler(event("POST", "/auth/login", { email: "approver@accounti.demo", password: "accounti123" }));
    const approverToken = String((await read(approver)).token);
    const first = await handler(event("POST", "/harbour/documents/doc-bill-1/transition", { action: "approve" }, approverToken));
    expect(typeof first !== "string" && first.statusCode).toBe(200);

    const accountant = await handler(event("POST", "/auth/login", { email: "accountant@accounti.demo", password: "accounti123" }));
    const accountantToken = String((await read(accountant)).token);
    const second = await handler(event("POST", "/harbour/documents/doc-bill-1/transition", { action: "approve" }, accountantToken));
    expect(typeof second !== "string" && second.statusCode).toBe(200);
    const posted = await handler(event("POST", "/harbour/documents/doc-bill-1/transition", { action: "post" }, accountantToken));
    expect(typeof posted !== "string" && posted.statusCode).toBe(200);

    const bas = await handler(event("GET", "/harbour/reports?from=2026-07-01&to=2026-09-30&on=2026-10-06", undefined, token));
    const report = await read(bas);
    const worksheet = report.bas as { gstOnPurchases: number; missingSupplierAbn: number };
    expect(worksheet.gstOnPurchases).toBe(20000);
    expect(worksheet.missingSupplierAbn).toBe(0);
  });

  it("hides SMTP from a company admin", async () => {
    resetStoreForTests();
    const login = await handler(event("POST", "/auth/login", { email: "admin@accounti.demo", password: "accounti123" }));
    const token = String((await read(login)).token);
    const saved = await handler(event("PUT", "/harbour/workspace", { smtp: { host: "smtp.example.com", from: "books@example.com", password: "secret" } }, token));
    const body = await read(saved);
    expect(body.smtpAccess).toBe(false);
    expect((body.smtp as { host: string }).host).toBe("");
  });
});
