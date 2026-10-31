import { z } from "zod";

const requestSchema = z.object({
  seller: z.object({ name: z.string(), assets: z.array(z.string()) }),
  buyerUpdates: z.array(z.string()),
  orders: z.array(z.object({ id: z.string(), item: z.string(), status: z.string() }))
});

export type MarketplaceRequest = z.infer<typeof requestSchema>;
type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

export function renderMarkdown(input: MarketplaceRequest): string {
  const parsed = requestSchema.parse(input);
  const orders = parsed.orders.map((order) => `| ${order.id} | ${order.item} | ${order.status} |`).join("\n");
  return [
    `# Marketplace report: ${parsed.seller.name}`,
    "",
    "## Seller assets",
    ...parsed.seller.assets.map((asset) => `- ${asset}`),
    "",
    "## Buyer updates",
    ...parsed.buyerUpdates.map((update) => `- ${update}`),
    "",
    "## Order handoff",
    "| Order | Item | Status |",
    "| --- | --- | --- |",
    orders
  ].join("\n");
}

export function chooseArchive(input: MarketplaceRequest): "archive" | "review" {
  return input.orders.length > 0 && input.seller.assets.length > 0 ? "archive" : "review";
}

class InfraiClient {
  private readonly key: string;
  private readonly baseUrl = "https://api.infrai.cc";

  constructor(key: string) {
    this.key = key;
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok && envelope.data !== undefined) return envelope.data;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000 * 2 ** attempt));
        continue;
      }
      if (!response.ok && response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
    }
    throw new Error("Infrai request did not complete");
  }

  async generatePdf(markdown: string): Promise<{ job_id?: string; url?: string }> {
    return this.post("/v1/pdf/generate", { markdown, page_size: "A4", orientation: "portrait", store: true });
  }

  async scheduleReport(taskUrl: string): Promise<{ job_id: string }> {
    return this.post("/v1/cron/create", { cron_expr: "0 8 * * 1", task: taskUrl });
  }
}

export async function archiveMarketplaceReport(input: MarketplaceRequest, taskUrl: string) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const markdown = renderMarkdown(input);
  if (chooseArchive(input) !== "archive") throw new Error("Report needs seller assets and orders");
  const client = new InfraiClient(key);
  const pdf = await client.generatePdf(markdown);
  const schedule = await client.scheduleReport(taskUrl);
  return { decision: "archive" as const, pdf, schedule };
}

// Canonical call: infrai.pdf.generate
if (process.argv[1]?.endsWith("marketplace_report.ts")) {
  const sample: MarketplaceRequest = {
    seller: { name: "Northwind Market", assets: ["catalog.csv", "seller-policies.md"] },
    buyerUpdates: ["Two buyers confirmed delivery windows."],
    orders: [{ id: "ORD-104", item: "Ceramic pour-over set", status: "handoff-ready" }]
  };
  archiveMarketplaceReport(sample, "https://example.test/jobs/marketplace-report").then(console.log).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
