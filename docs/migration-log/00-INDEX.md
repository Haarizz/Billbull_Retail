# BillBull Kubernetes Migration — Complete Engineering Log

**Index.** This log documents the full migration of `max.billbull.app` from systemd/nginx to k3s Kubernetes on server 77.37.49.42, reconstructed in complete, non-summarized detail from the working conversation. Read the parts in order for the full narrative, or jump directly to whichever section you need.

| Part | File | Contents |
|---|---|---|
| 1 | [01-project-context.md](01-project-context.md) | Initial architecture, the real 2-server/12-client topology, the `max` client's specific facts, migration goals |
| 2 | [02-timeline.md](02-timeline.md) | Complete chronological walkthrough, phase by phase, from the first generic guide review through final retrospective |
| 3 | [03-every-command.md](03-every-command.md) | Every command actually run or instructed, grouped by tool (git, Docker, kubectl, k3s, nginx, systemd, PostgreSQL, networking) — including failed/repeated attempts |
| 4 | [04-every-config-file.md](04-every-config-file.md) | Full content of every Dockerfile, manifest, and config change, each with its rationale — secrets redacted |
| 5 | [05-every-error.md](05-every-error.md) | All 8 errors/incidents in full detail: exact message, root cause, investigation, every failed attempt, the fix, the lesson |
| 6 | [06-every-discussion.md](06-every-discussion.md) | Full architectural reasoning — not just conclusions — for every major decision (why k8s, why Docker, why k3s/Traefik/cert-manager, why Postgres stayed external, why PVC/Recreate/replicas=1, and more) |
| 7 | [07-architecture-evolution.md](07-architecture-evolution.md) | Diagrams: original server → Docker → Kubernetes (actual final state) → the not-yet-built intended future architecture |
| 8 | [08-troubleshooting-journal.md](08-troubleshooting-journal.md) | Every issue in Problem → Hypothesis → Investigation → Evidence → Fix format |
| 9 | [09-checklist-final-architecture-lessons.md](09-checklist-final-architecture-lessons.md) | The exact migration checklist as followed, the complete final production architecture description, and 15 generalizable engineering lessons |

**On the "raw conversation" section:** no literal stored transcript exists to copy verbatim — this log is a faithful reconstruction of every real command, file, error, and piece of reasoning from the working conversation, organized thematically per the original request rather than repeated a second time in strict message order (confirmed with the requester as sufficient, rather than duplicating Parts 1–9's content in a different shape).

**Scope note:** This log covers the `max.billbull.app` pilot only. `nest`, `hilite`, and `albadar` remain offline (stopped deliberately, not yet migrated) as of the end of this log — see Part 9 for the exact final state and Part 7 for the intended (not-yet-built) architecture once they're migrated too.
