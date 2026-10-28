# Incident response checklist

1. **Detect:** record the alert, request IDs, affected host, and time window. Do not copy passwords or tokens into the incident ticket.
2. **Contain:** suspend affected accounts, revoke sessions, block abusive IPs at the proxy, and isolate a host if needed.
3. **Investigate:** preserve logs and database evidence; review admin audit records, login failures, and recent file changes.
4. **Fix:** patch the cause, rotate secrets when exposure is possible, and add a regression test.
5. **Notify:** tell the school owner and affected people using the school's approved privacy and safeguarding process.
6. **Learn:** write down the cause, scope, timeline, decisions, and follow-up owners. Verify monitoring and recovery steps afterward.
