import { describe, expect, it } from "vitest";
import workflow from "./myfluxperf-intervention-workflow.json";

describe("n8n intervention workflow template", () => {
  it("contains the expected production webhook path", () => {
    const webhook = workflow.nodes.find((node) => node.name === "Webhook - MyFluxperf");

    expect(webhook?.parameters).toMatchObject({
      httpMethod: "POST",
      path: "myfluxperf/intervention",
      responseMode: "responseNode"
    });
  });

  it("documents the required external service variables", () => {
    const serializedWorkflow = JSON.stringify(workflow);

    expect(serializedWorkflow).toContain("MYFLUXPERF_WEBHOOK_SECRET");
    expect(serializedWorkflow).toContain("TRELLO_INTERVENTION_LIST_ID");
    expect(serializedWorkflow).toContain("OPENAI_API_KEY");
    expect(serializedWorkflow).toContain("OPENAI_MODEL");
    expect(serializedWorkflow).toContain("BREVO_API_KEY");
    expect(serializedWorkflow).toContain("notifications@fluxperf.fr");
  });
});
