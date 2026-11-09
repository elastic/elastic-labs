"""Drive a few hours of realistic delivery activity against the dora-metrics-lab repository.

Every change goes through a pull request, CI, a rebase merge to main and a production deploy
on the self-hosted runner. Some releases are bad on purpose, and each is remediated a
different way, so the DORA queries have something to disagree about.

Ground truth for every event is appended to scenario-events.jsonl (or SCENARIO_EVENTS).
Requires: git, gh (authenticated), docker; env GITHUB_REPO (owner/repo), LAB_REPO_DIR (your local clone
of that repo), KIBANA_URL, KIBANA_API_KEY and RULE_ID (the id of the alert rule).

The run in the article was stopped at the end of its 4-hour window, after 20 merged pull requests and
with the next one still open. Left alone, this script merges 23 changes.
"""

import json
import os
import random
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

REPO = os.environ["GITHUB_REPO"]
WORK = Path(os.environ["LAB_REPO_DIR"]).expanduser().resolve()
EVENTS = Path(os.getenv("SCENARIO_EVENTS", "scenario-events.jsonl")).resolve()
KIBANA = os.environ["KIBANA_URL"].rstrip("/")
KHDR = {
    "Authorization": f"ApiKey {os.environ['KIBANA_API_KEY']}",
    "kbn-xsrf": "true",
    "Content-Type": "application/json",
}
RULE_ID = os.environ["RULE_ID"]
random.seed(2263)
SCENARIO_START = datetime.now(timezone.utc).isoformat()


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def log(event_name, **kw):
    rec = {"ts": now(), "event": event_name, **kw}
    with EVENTS.open("a") as f:
        f.write(json.dumps(rec) + "\n")
    print(rec, flush=True)


def sh(*cmd, check=True):
    r = subprocess.run(cmd, cwd=WORK, capture_output=True, text=True)
    if check and r.returncode:
        raise RuntimeError(f"{cmd}: {r.stderr}")
    return r.stdout.strip()


def wait_runs_idle(timeout=1200):
    """Wait until no Deliver checkout run is queued or in progress."""
    start = time.time()
    while time.time() - start < timeout:
        out = sh(
            "gh",
            "run",
            "list",
            "-R",
            REPO,
            "--workflow",
            "Deliver checkout",
            "--limit",
            "10",
            "--json",
            "status",
        )
        if all(r["status"] == "completed" for r in json.loads(out)):
            return
        time.sleep(15)


def pr_checks_done(branch, timeout=900):
    start = time.time()
    while time.time() - start < timeout:
        out = sh(
            "gh",
            "run",
            "list",
            "-R",
            REPO,
            "--branch",
            branch,
            "--workflow",
            "Deliver checkout",
            "--limit",
            "5",
            "--json",
            "status,conclusion",
        )
        runs = json.loads(out)
        if runs and all(r["status"] == "completed" for r in runs):
            return runs[0]["conclusion"]
        time.sleep(15)
    return "timeout"


def open_pr(n, title, edit, review_minutes, commit=True):
    branch = f"change/{n:02d}"
    sh("git", "checkout", "-q", "main")
    sh("git", "pull", "-q", "--rebase")
    sh("git", "checkout", "-q", "-b", branch)
    edit()
    if commit:
        sh("git", "add", "-A")
        sh("git", "commit", "-q", "-m", title)
    sha = sh("git", "rev-parse", "HEAD")
    sh("git", "push", "-q", "-u", "origin", branch)
    url = sh(
        "gh",
        "pr",
        "create",
        "-R",
        REPO,
        "--head",
        branch,
        "--base",
        "main",
        "--title",
        title,
        "--body",
        "Lab change.",
    )
    log("pr_opened", n=n, title=title, branch=branch, commit=sha, url=url)
    conclusion = pr_checks_done(branch)
    log("pr_checks", n=n, conclusion=conclusion)
    return branch, conclusion, review_minutes


def merge(branch, n):
    wait_runs_idle()
    sh("gh", "pr", "merge", "-R", REPO, branch, "--rebase", "--delete-branch")
    sh("git", "checkout", "-q", "main")
    sh("git", "pull", "-q", "--rebase")
    sha = sh("git", "rev-parse", "HEAD")
    log("merged", n=n, branch=branch, main_sha=sha)
    time.sleep(20)
    wait_runs_idle()
    out = sh(
        "gh",
        "run",
        "list",
        "-R",
        REPO,
        "--branch",
        "main",
        "--workflow",
        "Deliver checkout",
        "--limit",
        "1",
        "--json",
        "databaseId,conclusion,headSha",
    )
    run = json.loads(out)[0]
    log(
        "deployed",
        n=n,
        run_id=run["databaseId"],
        conclusion=run["conclusion"],
        sha=run["headSha"],
    )
    return run


def append_changelog(text):
    def edit():
        p = WORK / "CHANGELOG.md"
        old = p.read_text() if p.exists() else "# Changelog\n"
        p.write_text(old + f"\n- {text}\n")

    return edit


def set_failure_rate(value):
    def edit():
        (WORK / "release.env").write_text(
            f"# Runtime settings shipped with each release\nFAILURE_RATE={value}\n"
        )

    return edit


def break_test(broken):
    def edit():
        p = WORK / "app" / "test_app.py"
        code = 200 if not broken else 201
        p.write_text(
            f"from app import app\n\n\ndef test_health():\n"
            f'    assert app.test_client().get("/health").status_code == {code}\n'
        )

    return edit


def active_alerts():
    r = requests.post(
        f"{KIBANA}/internal/rac/alerts/find",
        headers={**KHDR, "x-elastic-internal-origin": "Kibana"},
        json={
            "rule_type_ids": ["observability.rules.custom_threshold"],
            "query": {
                "bool": {
                    "filter": [
                        {"term": {"kibana.alert.rule.uuid": RULE_ID}},
                        {"term": {"kibana.alert.status": "active"}},
                    ]
                }
            },
            "size": 50,
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["hits"]["total"]["value"]


def wait_alert(state, timeout=900):
    """state='active' waits for at least one active alert, 'recovered' waits for none."""
    start = time.time()
    while time.time() - start < timeout:
        n = active_alerts()
        if (state == "active" and n > 0) or (state == "recovered" and n == 0):
            log(f"alert_{state}", active=n)
            return True
        time.sleep(30)
    log(f"alert_{state}_timeout")
    return False


def close_open_cases(note):
    r = requests.get(
        f"{KIBANA}/api/cases/_find",
        headers=KHDR,
        params={"status": "open", "owner": "observability", "perPage": 50},
        timeout=30,
    )
    r.raise_for_status()
    for c in r.json()["cases"]:
        if (
            c["created_at"] < SCENARIO_START
            or "checkout failed transaction rate" not in c["title"]
        ):
            continue
        body = {"cases": [{"id": c["id"], "version": c["version"], "status": "closed"}]}
        requests.patch(
            f"{KIBANA}/api/cases", headers=KHDR, json=body, timeout=30
        ).raise_for_status()
        log("case_closed", case_id=c["id"], title=c["title"], note=note)


def normal(n, text, review=(2, 10), gap=(1, 4)):
    branch, _, _ = open_pr(n, text, append_changelog(text), review)
    time.sleep(random.uniform(*review) * 60)
    merge(branch, n)
    time.sleep(random.uniform(*gap) * 60)


def main():
    changes = iter(
        [
            "Show order totals with two decimals",
            "Add request id to checkout responses",
            "Log payment provider latency",
            "Rename cart summary field",
            "Cache currency table",
            "Add retry budget to payments client",
            "Tighten checkout input validation",
            "Document checkout error codes",
            "Bump Flask to 3.1.3",
            "Add health check detail",
            "Trim unused imports",
            "Add structured log fields",
            "Improve 502 error message",
            "Remove legacy coupon path",
            "Add checkout span attributes",
            "Refresh README",
        ]
    )
    n = 1
    # Healthy start
    for _ in range(4):
        normal(n, next(changes))
        n += 1

    # Bad release 1, remediated with a git revert PR
    branch, _, _ = open_pr(
        n, "Enable new order validation rules", set_failure_rate("0.3"), (3, 3)
    )
    time.sleep(4 * 60)
    bad1 = merge(branch, n)
    n += 1
    log("bad_release", kind="revert", sha=bad1["headSha"])
    wait_alert("active")
    time.sleep(6 * 60)
    branch, _, _ = open_pr(
        n,
        'Revert "Enable new order validation rules"',
        lambda: sh("git", "revert", "--no-edit", bad1["headSha"]),
        (1, 1),
        commit=False,
    )
    time.sleep(60)
    merge(branch, n)
    n += 1
    wait_alert("recovered")
    time.sleep(5 * 60)
    close_open_cases("closed 5 minutes after recovery")

    for _ in range(3):
        normal(n, next(changes))
        n += 1

    # A pull request whose CI fails, then gets fixed in the same PR
    branch, concl, _ = open_pr(n, "Update health check test", break_test(True), (1, 1))
    log("failed_pr_pipeline", n=n, conclusion=concl)
    time.sleep(3 * 60)
    break_test(False)()
    sh("git", "add", "-A")
    sh("git", "commit", "-q", "-m", "Fix health check assertion")
    sh("git", "push", "-q")
    log("pr_fix_pushed", n=n)
    pr_checks_done(branch)
    time.sleep(2 * 60)
    merge(branch, n)
    n += 1

    for _ in range(2):
        normal(n, next(changes))
        n += 1

    # Bad release 2, remediated by fixing forward
    branch, _, _ = open_pr(
        n, "Switch to stricter address parser", set_failure_rate("0.25"), (5, 5)
    )
    time.sleep(5 * 60)
    bad2 = merge(branch, n)
    n += 1
    log("bad_release", kind="fix_forward", sha=bad2["headSha"])
    wait_alert("active")
    time.sleep(10 * 60)
    branch, _, _ = open_pr(
        n, "Fix address parser for unit numbers", set_failure_rate("0.0"), (2, 2)
    )
    time.sleep(2 * 60)
    merge(branch, n)
    n += 1
    wait_alert("recovered")
    time.sleep(25 * 60)  # nobody remembers to close the case for a while
    close_open_cases("closed 25 minutes after recovery")

    for _ in range(2):
        normal(n, next(changes))
        n += 1

    # Incident with no deploy: the payments provider goes down
    good = sh("git", "rev-parse", "HEAD")
    subprocess.run(["docker", "stop", "payments"], check=True, capture_output=True)
    log("payments_outage_start", live_sha=good)
    wait_alert("active")
    time.sleep(7 * 60)
    subprocess.run(["docker", "start", "payments"], check=True, capture_output=True)
    log("payments_outage_end")
    wait_alert("recovered")
    time.sleep(3 * 60)
    close_open_cases("closed 3 minutes after recovery")

    for _ in range(2):
        normal(n, next(changes))
        n += 1

    # Bad release 3, remediated by re-running the previous deploy job (rollback without a commit)
    prev = json.loads(
        sh(
            "gh",
            "run",
            "list",
            "-R",
            REPO,
            "--branch",
            "main",
            "--workflow",
            "Deliver checkout",
            "--limit",
            "1",
            "--json",
            "databaseId,headSha",
        )
    )[0]
    branch, _, _ = open_pr(
        n, "Enable async fraud scoring", set_failure_rate("0.35"), (3, 3)
    )
    time.sleep(3 * 60)
    bad3 = merge(branch, n)
    n += 1
    log(
        "bad_release",
        kind="redeploy_previous",
        sha=bad3["headSha"],
        rollback_to=prev["headSha"],
    )
    wait_alert("active")
    time.sleep(5 * 60)
    jobs = json.loads(
        sh("gh", "run", "view", str(prev["databaseId"]), "-R", REPO, "--json", "jobs")
    )["jobs"]
    deploy_job = next(j for j in jobs if j["name"] == "deploy-production")
    sh(
        "gh",
        "run",
        "rerun",
        str(prev["databaseId"]),
        "-R",
        REPO,
        "--job",
        str(deploy_job["databaseId"]),
    )
    log("rollback_rerun", run_id=prev["databaseId"], sha=prev["headSha"])
    time.sleep(30)
    wait_runs_idle()
    wait_alert("recovered")
    time.sleep(8 * 60)
    close_open_cases("closed 8 minutes after recovery")
    # Fix the code on main so the next deploy does not bring the bad setting back
    branch, _, _ = open_pr(
        n, "Disable async fraud scoring until fixed", set_failure_rate("0.0"), (2, 2)
    )
    time.sleep(2 * 60)
    merge(branch, n)
    n += 1

    for _ in range(3):
        normal(n, next(changes))
        n += 1
    log("scenario_done", changes=n - 1)


if __name__ == "__main__":
    main()
