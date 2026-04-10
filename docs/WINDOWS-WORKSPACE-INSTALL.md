# Windows — workspace install (npm / pnpm)

## What goes wrong

Root `npm install` can fail with:

```text
npm error EISDIR: illegal operation on a directory, symlink
npm error path …\packages\ppv
npm error dest …\node_modules\@millo\ppv
```

**Cause:** npm **always symlinks** workspace packages into `node_modules` (it does not honor `install-links=false` for workspace roots). Creating directory symlinks on Windows needs **Developer Mode** or an **elevated** shell, or the destination must not already exist as a normal folder (broken/partial `node_modules`).

---

## Fix 1 — Developer Mode (recommended for npm)

1. **Settings → System → For developers** (or **Privacy & security → For developers** on some builds).
2. Turn **Developer Mode** **On**.
3. Close IDEs/terminals that might lock `node_modules`.
4. From repo root:

```powershell
npm run clean:install
```

If `clean:install` still hits **EBUSY**, reboot or close antivirus scan on the folder, then delete `node_modules` manually and run `npm install`.

---

## Fix 2 — Clean install with a stronger Windows delete

The script `scripts/clean-node-modules.js` uses Node `fs.rmSync`. On Windows, locked files can leave a **partial** tree so `node_modules\@millo\ppv` is a **real directory** and the next `symlink` fails.

From **cmd.exe** (repo root):

```cmd
rmdir /s /q node_modules
npm install
```

Or PowerShell (as Administrator if needed):

```powershell
Remove-Item -LiteralPath .\node_modules -Recurse -Force -ErrorAction SilentlyContinue
npm install
```

---

## Fix 3 — WSL2 (Linux-side install)

1. Open **WSL** and use a path under the Linux filesystem (e.g. `~/millo`), not only `/mnt/d/...` if you can avoid it.
2. Install **Node 20+** in WSL.
3. `npm install` at repo root.

Symlinks behave like Linux; same `package-lock.json` can be shared (line endings: use `core.autocrlf` as your team prefers).

---

## Fix 4 — pnpm (optional; often works without Developer Mode)

This repo includes **`pnpm-workspace.yaml`** for an optional **pnpm** workflow. pnpm uses a content store and different linking behavior that often avoids this Windows symlink issue.

```powershell
corepack enable
corepack prepare pnpm@9.15.4 --activate
cd "D:\Millo 3.0"
Remove-Item -Recurse -Force .\node_modules -ErrorAction SilentlyContinue
pnpm install
```

Use `pnpm run …` instead of `npm run …` where you need workspace awareness, or see [pnpm + npm scripts](https://pnpm.io/cli/run).

**Note:** Lockfile will be `pnpm-lock.yaml`, not `package-lock.json`. Align with your team before switching CI.

---

## Misleading: root `.npmrc` `install-links=false`

That setting does **not** stop npm from linking **workspace** packages. It remains useful for some non-workspace `file:` installs only.

---

## Related

- `scripts/clean-node-modules.js` — removes root `node_modules`
- `package.json` scripts: `clean:node_modules`, `clean:install`
- `docs/ENV-SETUP-GUIDE.md` — after install succeeds
