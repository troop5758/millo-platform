# SSH hardening — Phase 20 security hardening

Harden the SSH server on production (Ubuntu) to reduce brute-force and unauthorized access.

- **Key-based auth:** Use SSH keys only; disable password authentication: `PasswordAuthentication no` in `/etc/ssh/sshd_config`.
- **Disable root login (optional):** `PermitRootLogin prohibit-password` (allow root only with keys) or `PermitRootLogin no` if you use a dedicated deploy user.
- **Non-default port (optional):** Change `Port` from 22 to reduce automated scans; update UFW to allow the new port.
- **Fail2Ban:** Already provisioned by Phase 18 (infra/fail2ban.sh) to limit SSH brute-force.
- **Restart SSH:** After changes, `systemctl restart sshd`. Ensure you have key-based access before disabling passwords.

https://milloapp.com
