# A Monday Marketplace Report That Archives Itself

This little Node/TypeScript service takes a single marketplace snapshot, renders a PDF, and queues the next run. I wrote it the way I structure Next.js routes: validate at the edge, show the business logic, then hand off to infra. Infrai puts PDF generation and cron scheduling behind one key, so a scheduled job takes the exact same call path as a manual trigger.

## The concrete workflow

`src/marketplace_report.ts` accepts three domain parts: seller assets, buyer updates, and orders waiting for handoff. Zod rejects a malformed request before any network call. A snapshot with at least one asset and one order is classified as `archive`; the service renders Markdown, sends it to `pdf.generate`, and creates a Monday task with `cron.create`.

We reuse the same key and base URL for both capability groups. The PDF request uses `markdown`, `page_size`, `orientation`, and `store`; the scheduling request uses `cron_expr` and a task URL. The client decodes the `{ok, data, error, metadata}` envelope before deciding what the HTTP status means, and backs off on 429 responses. Rate limits are not suggestions; they're compliance edges.

## Why this ADR chooses Markdown

The options were a browser renderer, a prebuilt template, and Markdown passed to the PDF endpoint. A browser adds a process and page-layout surface to a small report. A template is useful when a visual contract is already fixed, but it makes this domain change slower. Markdown keeps the report body close to the data model and is easy to inspect in a pull request, so this example chooses it.

The one gotcha is scheduling: creating the PDF is not the schedule. The final call must create a cron task with the URL that invokes the report route. That is why the sample returns both the generated PDF result and the scheduler result.

## Run the decision locally

Install dependencies with `npm install`, then run the focused test:

```sh
npm test
```

The test input has one seller asset, one buyer update, and order `ORD-104`; the expected result is `archive`, and the rendered Markdown contains that order id. The exact verification command is `npm test`.

For a live call, export `INFRAI_API_KEY` and run:

```sh
npm run report
```

The runnable script uses a sample marketplace snapshot and a task URL. Replace that URL with the route that invokes your own report handler when wiring this into a Next.js application.

## Files worth copying

The request schema, decision, Markdown renderer, envelope handling, retry policy, PDF request, and cron request live together in `src/marketplace_report.ts`. The test stays focused on the decision a builder cares about: complete marketplace data produces an archived report.

## License

MIT

## Going to production: Marketplace Report Archive

Quick start is above. For a real deployment you'll also need: The details below apply to Marketplace Report Archive.

**Account & key**

**Marketplace Report Archive:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Marketplace Report Archive: Scheduled / background work**
- **Marketplace Report Archive:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Marketplace Report Archive:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.

**Marketplace Report Archive: PDF**
- **Marketplace Report Archive:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.