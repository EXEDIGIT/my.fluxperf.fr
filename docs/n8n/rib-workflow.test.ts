import { describe, expect, it } from "vitest";
import workflow from "./myfluxperf-rib-workflow.json";

describe("RIB n8n workflow template", () => {
  it("ships an inactive importable workflow with the expected secure trigger", () => {
    expect(workflow.active).toBe(false);
    expect(workflow.name).toBe("MyFluxperf - Dépôt RIB / IBAN");

    const webhook = workflow.nodes.find((node) => node.name === "Webhook - MyFluxperf RIB");
    expect(webhook).toMatchObject({
      type: "n8n-nodes-base.webhook",
      parameters: {
        httpMethod: "POST",
        path: "myfluxperf/rib",
        responseMode: "responseNode"
      }
    });

    const validation = workflow.nodes.find((node) => node.name === "Validate + Normalize RIB");
    expect(String(validation?.parameters?.jsCode)).toContain("MYFLUXPERF_RIB_WEBHOOK_SECRET");
  });

  it("includes the Drive, Sheets and Brevo processing chain", () => {
    const nodeNames = workflow.nodes.map((node) => node.name);

    expect(nodeNames).toEqual(
      expect.arrayContaining([
        "Read RIB Documents",
        "Create Client RIB Folder",
        "Upload RIB to Google Drive",
        "Append RIB Document Record",
        "Append RIB Action Record",
        "Brevo - Notify Support RIB"
      ])
    );

    const notification = workflow.nodes.find((node) => node.name === "Brevo - Notify Support RIB");
    expect(notification).toMatchObject({
      type: "n8n-nodes-base.httpRequest",
      retryOnFail: true,
      maxTries: 3
    });
  });
});
