import { createServer } from "http";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

process.env.DEMO_AUTH = process.env.DEMO_AUTH || "1";
process.env.STORE = process.env.STORE || "memory";
process.env.STORE_FILE = process.env.STORE_FILE || "data/store.json";
process.env.MAIL_DISABLE_SEND = process.env.MAIL_DISABLE_SEND || "true";

const port = Number(process.env.PORT || 3061);

async function main() {
  const { handler } = await import("../lambda/api/index");
  const server = createServer(async (req, res) => {
    const host = req.headers.host || `localhost:${port}`;
    const url = new URL(req.url || "/", `http://${host}`);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString("utf8");
    const event = {
      rawPath: url.pathname,
      rawQueryString: url.searchParams.toString(),
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      headers: Object.fromEntries(Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value || ""])),
      requestContext: { http: { method: req.method || "GET", path: url.pathname } },
      body: body || undefined,
      isBase64Encoded: false,
    } as APIGatewayProxyEventV2;
    try {
      const result = (await handler(event)) as APIGatewayProxyResultV2;
      if (typeof result === "string") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(result);
        return;
      }
      res.writeHead(result.statusCode || 200, (result.headers || {}) as Record<string, string>);
      res.end(result.body || "");
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "error" }));
    }
  });
  server.listen(port, () => console.log(`Accounti API http://localhost:${port}`));
}

void main();
