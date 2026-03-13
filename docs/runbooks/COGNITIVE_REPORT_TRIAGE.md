# Cognitive Report Triage

Use this runbook during incident/debug triage when validating journal blocks emitted by cognitive CLI save flows.

## 1. Locate Latest `categorize_report`

```bash
jq -c 'select(.data.type=="categorize_report") | {index, timestamp, source:.data.source, input:.data.report.input}' \
  "$MEMPHIS_DATA_DIR/chains/journal"/*.json | tail -n 1
```

Expected:

- `data.type` = `categorize_report`
- `data.source` = `cli.categorize`
- `data.report.input` present
- `data.report.suggestion` present

## 2. Expected Payload Shape

```json
{
  "data": {
    "type": "categorize_report",
    "source": "cli.categorize",
    "content": "Categorize Report: <n> tag(s) suggested for input",
    "tags": ["categorize", "report"],
    "report": {
      "generatedAt": "2026-03-13T09:00:00.000Z",
      "input": "Prepare release checklist",
      "suggestion": {
        "tags": [{ "tag": "project:release", "confidence": 0.78, "category": "project" }],
        "overallConfidence": 0.78,
        "processingTimeMs": 12,
        "method": "hybrid"
      }
    }
  }
}
```

## 3. Triage Checks

1. Confirm `report.generatedAt` is valid ISO timestamp.
2. Confirm `report.input` matches operator command input.
3. Confirm `report.suggestion.tags` is an array (possibly empty, but present).
4. Confirm `savedBlock.chain=journal` in CLI JSON response when `--save` is used.
5. If payload shape is invalid, treat as regression and run CLI save regression tests.
