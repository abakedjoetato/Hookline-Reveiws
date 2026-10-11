# ADR 0029: One Web Application

## Status

Accepted (supersedes ADR 0003)

## Context

The repo had three Next.js apps (`web`, `host`, `admin`). The host and admin screens were actually built inside `web`; the `host` and `admin` apps were thin shells, and all three would have needed their own deployment, domain and cookie setup.

## Decision

Keep a single Next.js app (`apps/web`) for artists, hosts and admins, with role-gated pages. Delete `apps/host` and `apps/admin`.

## Consequences

- One deployment, one domain, first-party session cookies everywhere.
- Authorization is enforced only by the API (it always was); page-level checks are presentation.
- The admin console can grow inside `/admin/*` as needed.
