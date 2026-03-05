#!/usr/bin/env python3
"""
Proactive triage LLM test suite.

Tests that a local LLM (e.g. Qwen3.5 via mlx_lm.server) can correctly
triage diagnostic tool outputs — the same task that analyze_diagnostics()
delegates to Haiku in production.

This validates:
  1. The system prompt elicits parseable JSON responses
  2. Healthy systems are NOT flagged as noteworthy
  3. Genuinely concerning diagnostics ARE flagged
  4. The headline and detail fields are reasonable
  5. Edge cases (empty output, mixed signals) don't crash

Usage:
    # Start local server first:
    #   serve-qwen35-mlx-fast
    #
    # Then run:
    python3 tests/proactive_triage_test.py [--base-url http://localhost:8080/v1]

    # Or with a specific model name:
    python3 tests/proactive_triage_test.py --model Qwen3.5-35B-A3B-4bit-mlx
"""

import argparse
import json
import re
import sys
import time
import urllib.request
import urllib.error
from dataclasses import dataclass


# ── System prompt (must match analyze_diagnostics in llm_client.rs) ──────

def build_system_prompt(category: str) -> str:
    return f"""You are a conservative IT health monitor analyzing {category} diagnostics.
Only flag genuinely concerning issues:
- Disk usage >90% or a single reclaimable folder >5GB
- Recent crash reports (<24h) for user-facing apps
- A process consuming >90% CPU persistently
- Critically low RAM (<500MB free) while idle

Respond in exactly this JSON format (no markdown, no extra text):
{{"noteworthy": true/false, "headline": "~60 char summary", "detail": "1-2 sentence explanation"}}

If nothing is concerning, set noteworthy to false with empty headline and detail."""


# ── Test scenarios ───────────────────────────────────────────────────────

TRIAGE_SCENARIOS = [
    # ── Should NOT be noteworthy (healthy systems) ──
    {
        "id": "healthy-disk",
        "category": "disk",
        "expect_noteworthy": False,
        "tool_output": """--- mac_disk_usage ---
Volume: Macintosh HD
Capacity: 1 TB
Used: 550 GB (55%)
Free: 450 GB

--- disk_audit ---
Scanned 8 directories:
  ~/Library/Caches        2.1 GB
  ~/Downloads             3.2 GB
  ~/.Trash                0.1 GB
  ~/Library/Developer     1.5 GB
  ~/Library/Containers    0.8 GB
  ~/.npm                  0.3 GB
Total reclaimable: ~8.0 GB (no single folder >5 GB)
""",
        "notes": "55% used, no single folder >5GB — should be fine",
    },
    {
        "id": "healthy-performance",
        "category": "performance",
        "expect_noteworthy": False,
        "tool_output": """--- mac_process_list ---
PID    CPU%   MEM     COMMAND
1234   12.3   2.1 GB  Google Chrome
2345   5.1    1.1 GB  Slack
3456   3.2    520 MB  WindowServer
4567   2.1    380 MB  Finder
5678   1.5    290 MB  Mail

System: 8 cores, 48 GB RAM, 19.7 GB free
""",
        "notes": "Normal CPU, plenty of free RAM",
    },
    {
        "id": "healthy-crash-none",
        "category": "crash",
        "expect_noteworthy": False,
        "tool_output": """--- crash_log_reader ---
No recent crash reports found in DiagnosticReports.
""",
        "notes": "No crashes at all",
    },
    {
        "id": "healthy-crash-old",
        "category": "crash",
        "expect_noteworthy": False,
        "tool_output": """--- crash_log_reader ---
Found 1 crash report(s):

Safari_2026-02-15-101523.ips (18 days ago)
  Exception Type: EXC_CRASH (SIGABRT)
  Crashed Thread: 0
  Application: Safari
""",
        "notes": "Crash is 18 days old — not recent enough to flag",
    },

    # ── SHOULD be noteworthy (concerning diagnostics) ──
    {
        "id": "critical-disk-full",
        "category": "disk",
        "expect_noteworthy": True,
        "tool_output": """--- mac_disk_usage ---
Volume: Macintosh HD
Capacity: 256 GB
Used: 243 GB (95%)
Free: 13 GB

--- disk_audit ---
Scanned 8 directories:
  ~/Library/Caches        4.2 GB
  ~/Downloads             22.3 GB
  ~/.Trash                8.1 GB
  ~/Library/Developer     35.2 GB
  ~/Library/Containers    12.5 GB
Total reclaimable: ~82.3 GB
""",
        "notes": "95% full, Downloads 22GB, Developer 35GB — clearly concerning",
    },
    {
        "id": "critical-cpu-hog",
        "category": "performance",
        "expect_noteworthy": True,
        "tool_output": """--- mac_process_list ---
PID    CPU%   MEM     COMMAND
9999   98.7   3.2 GB  runaway_script.py
1234   12.3   2.1 GB  Google Chrome
2345   5.1    1.1 GB  Slack
3456   3.2    520 MB  WindowServer

System: 8 cores, 48 GB RAM, 14.2 GB free
""",
        "notes": "One process at 98.7% CPU — persistent hog",
    },
    {
        "id": "critical-recent-crash",
        "category": "crash",
        "expect_noteworthy": True,
        "tool_output": """--- crash_log_reader ---
Found 3 crash report(s):

Slack_2026-03-05-091522.ips (2 hours ago)
  Exception Type: EXC_CRASH (SIGABRT)
  Crashed Thread: 0
  Application: Slack

Slack_2026-03-05-083011.ips (3 hours ago)
  Exception Type: EXC_CRASH (SIGABRT)
  Crashed Thread: 0
  Application: Slack

Slack_2026-03-04-221544.ips (12 hours ago)
  Exception Type: EXC_BAD_ACCESS (SIGSEGV)
  Crashed Thread: 2
  Application: Slack
""",
        "notes": "3 crashes for Slack in the last 12 hours — definitely concerning",
    },
    {
        "id": "critical-low-ram",
        "category": "performance",
        "expect_noteworthy": True,
        "tool_output": """--- mac_process_list ---
PID    CPU%   MEM      COMMAND
1234   45.2   18.3 GB  Adobe Premiere Pro
2345   22.1   8.5 GB   Google Chrome
3456   8.3    4.2 GB   Docker Desktop
4567   5.1    2.1 GB   Slack

System: 8 cores, 48 GB RAM, 380 MB free
Swap: 12.5 GB used
""",
        "notes": "Only 380MB free RAM with heavy swap — critically low",
    },
    {
        "id": "critical-huge-folder",
        "category": "disk",
        "expect_noteworthy": True,
        "tool_output": """--- mac_disk_usage ---
Volume: Macintosh HD
Capacity: 512 GB
Used: 410 GB (80%)
Free: 102 GB

--- disk_audit ---
Scanned 8 directories:
  ~/Library/Caches        1.2 GB
  ~/Downloads             65.3 GB
  ~/.Trash                2.1 GB
  ~/Library/Developer     3.5 GB
Total reclaimable: ~72.1 GB
""",
        "notes": "Downloads is 65GB — single reclaimable folder >5GB",
    },

    # ── Edge cases ──
    {
        "id": "edge-empty-output",
        "category": "disk",
        "expect_noteworthy": False,
        "tool_output": """--- mac_disk_usage ---
(no output)

--- disk_audit ---
(no output)
""",
        "notes": "Tools returned nothing — should not flag",
    },
    {
        "id": "edge-mixed-signals",
        "category": "performance",
        "expect_noteworthy": False,
        "tool_output": """--- mac_process_list ---
PID    CPU%   MEM     COMMAND
1234   55.2   2.1 GB  ffmpeg
2345   12.3   1.5 GB  Google Chrome
3456   3.2    520 MB  WindowServer

System: 8 cores, 48 GB RAM, 22.1 GB free
""",
        "notes": "55% CPU for ffmpeg is high but not >90%, RAM is fine — borderline, should not flag",
    },
]


# ── LLM call ─────────────────────────────────────────────────────────────

def call_llm(base_url: str, model: str, system: str, user_message: str) -> str:
    """Call the OpenAI-compatible chat completions endpoint."""
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": 200,
        "temperature": 0.0,
    }

    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=data,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            return result["choices"][0]["message"]["content"]
    except urllib.error.URLError as e:
        raise ConnectionError(f"Cannot reach LLM server at {base_url}: {e}")
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise ValueError(f"Unexpected LLM response format: {e}")


def strip_markdown_fences(s: str) -> str:
    """Strip ```json ... ``` fences from LLM output (mirrors Rust strip_markdown_fences)."""
    trimmed = s.strip()
    if trimmed.startswith("```") and trimmed.endswith("```"):
        # Remove first line and trailing ```
        lines = trimmed.split("\n", 1)
        inner = lines[1] if len(lines) > 1 else ""
        if inner.endswith("```"):
            inner = inner[:-3]
        return inner.strip()
    return trimmed


def strip_thinking_tags(s: str) -> str:
    """Strip <think>...</think> tags that some models emit."""
    return re.sub(r"<think>.*?</think>", "", s, flags=re.DOTALL).strip()


def parse_analysis(raw: str) -> dict | None:
    """Parse the LLM response into a DiagnosticAnalysis dict."""
    cleaned = strip_thinking_tags(raw)
    cleaned = strip_markdown_fences(cleaned)
    try:
        result = json.loads(cleaned)
        if "noteworthy" in result:
            return result
        return None
    except json.JSONDecodeError:
        return None


# ── Test runner ──────────────────────────────────────────────────────────

@dataclass
class TestResult:
    scenario_id: str
    category: str
    expect_noteworthy: bool
    got_noteworthy: bool | None  # None = parse failure
    parseable: bool
    headline: str
    detail: str
    raw_response: str
    duration_s: float
    passed: bool
    notes: str


def run_test(scenario: dict, base_url: str, model: str) -> TestResult:
    system = build_system_prompt(scenario["category"])
    start = time.time()

    try:
        raw = call_llm(base_url, model, system, scenario["tool_output"])
    except (ConnectionError, ValueError) as e:
        return TestResult(
            scenario_id=scenario["id"],
            category=scenario["category"],
            expect_noteworthy=scenario["expect_noteworthy"],
            got_noteworthy=None,
            parseable=False,
            headline="",
            detail="",
            raw_response=str(e),
            duration_s=time.time() - start,
            passed=False,
            notes=f"LLM error: {e}",
        )

    duration = time.time() - start
    analysis = parse_analysis(raw)

    if analysis is None:
        return TestResult(
            scenario_id=scenario["id"],
            category=scenario["category"],
            expect_noteworthy=scenario["expect_noteworthy"],
            got_noteworthy=None,
            parseable=False,
            headline="",
            detail="",
            raw_response=raw,
            duration_s=duration,
            passed=False,
            notes="Failed to parse JSON from LLM response",
        )

    got = bool(analysis.get("noteworthy", False))
    expected = scenario["expect_noteworthy"]
    passed = got == expected

    return TestResult(
        scenario_id=scenario["id"],
        category=scenario["category"],
        expect_noteworthy=expected,
        got_noteworthy=got,
        parseable=True,
        headline=analysis.get("headline", ""),
        detail=analysis.get("detail", ""),
        raw_response=raw,
        duration_s=duration,
        passed=passed,
        notes="" if passed else f"Expected noteworthy={expected}, got {got}",
    )


def main():
    parser = argparse.ArgumentParser(
        description="Test proactive triage LLM behavior against a local model"
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:8080/v1",
        help="OpenAI-compatible server base URL",
    )
    parser.add_argument(
        "--model",
        default="auto",
        help="Model ID (default: auto-detect from server)",
    )
    parser.add_argument(
        "--scenario",
        default=None,
        help="Run only this scenario ID",
    )
    args = parser.parse_args()

    scenarios = TRIAGE_SCENARIOS
    if args.scenario:
        scenarios = [s for s in scenarios if s["id"] == args.scenario]
        if not scenarios:
            print(f"Unknown scenario: {args.scenario}")
            print(f"Available: {', '.join(s['id'] for s in TRIAGE_SCENARIOS)}")
            sys.exit(1)

    # Check server is reachable and resolve model name
    model = args.model
    try:
        with urllib.request.urlopen(f"{args.base_url}/models", timeout=5) as resp:
            models_data = json.loads(resp.read())
            available = [m["id"] for m in models_data.get("data", [])]
            if model == "auto" and available:
                # Prefer local paths (mlx_lm.server requires exact path, not HF slug)
                local = [m for m in available if m.startswith("/")]
                model = local[0] if local else available[-1]
    except Exception:
        print(f"\nERROR: Cannot reach LLM server at {args.base_url}")
        print("Start it first:  serve-qwen35-mlx-fast")
        sys.exit(1)

    print(f"Server: {args.base_url}")
    print(f"Model:  {model}")

    print(f"Running {len(scenarios)} triage scenarios")
    print("=" * 70)

    results: list[TestResult] = []
    for i, scenario in enumerate(scenarios):
        label = f"[{i+1}/{len(scenarios)}] {scenario['id']}"
        print(f"\n{label}")
        print(f"  Category: {scenario['category']}  |  Expect noteworthy: {scenario['expect_noteworthy']}")
        sys.stdout.flush()

        result = run_test(scenario, args.base_url, model)
        results.append(result)

        if result.parseable:
            status = "PASS" if result.passed else "FAIL"
            print(f"  Result: noteworthy={result.got_noteworthy}  |  {status}  |  {result.duration_s:.1f}s")
            if result.headline:
                print(f"  Headline: {result.headline}")
            if not result.passed:
                print(f"  ** {result.notes}")
        else:
            print(f"  PARSE FAIL  |  {result.duration_s:.1f}s")
            print(f"  Raw: {result.raw_response[:200]}")

    # ── Summary ──
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)

    total = len(results)
    passed = sum(1 for r in results if r.passed)
    parseable = sum(1 for r in results if r.parseable)
    false_positives = sum(
        1 for r in results if r.parseable and not r.expect_noteworthy and r.got_noteworthy
    )
    false_negatives = sum(
        1 for r in results if r.parseable and r.expect_noteworthy and not r.got_noteworthy
    )

    print(f"Total:           {total}")
    print(f"Parseable JSON:  {parseable}/{total} ({100*parseable/total:.0f}%)")
    print(f"Correct triage:  {passed}/{total} ({100*passed/total:.0f}%)")
    if false_positives:
        print(f"False positives: {false_positives} (flagged healthy system)")
    if false_negatives:
        print(f"False negatives: {false_negatives} (missed real problem)")

    avg_time = sum(r.duration_s for r in results) / max(total, 1)
    print(f"Avg time:        {avg_time:.1f}s")

    # ── Failures ──
    failures = [r for r in results if not r.passed]
    if failures:
        print(f"\n{'─' * 70}")
        print(f"FAILURES ({len(failures)})")
        for r in failures:
            print(f"\n  {r.scenario_id} [{r.category}]")
            print(f"    Expected noteworthy={r.expect_noteworthy}, got={r.got_noteworthy}")
            if r.headline:
                print(f"    Headline: {r.headline}")
            if not r.parseable:
                print(f"    Raw: {r.raw_response[:200]}")

    # ── Save results ──
    output_path = "tests/proactive_triage_results.json"
    with open(output_path, "w") as f:
        json.dump(
            [
                {
                    "id": r.scenario_id,
                    "category": r.category,
                    "expect_noteworthy": r.expect_noteworthy,
                    "got_noteworthy": r.got_noteworthy,
                    "parseable": r.parseable,
                    "passed": r.passed,
                    "headline": r.headline,
                    "detail": r.detail,
                    "duration_s": r.duration_s,
                    "raw_response": r.raw_response,
                }
                for r in results
            ],
            f,
            indent=2,
        )
    print(f"\nResults saved to {output_path}")

    # Exit code
    sys.exit(0 if all(r.passed for r in results) else 1)


if __name__ == "__main__":
    main()
