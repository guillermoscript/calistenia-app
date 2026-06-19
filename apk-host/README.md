# APK download host

A tiny nginx container, deployed on Dokploy, that serves the Android APK from
your own domain (`apk.guille.tech`) instead of GitHub Releases — which stall at
100% on Android Chrome for large files.

- Landing page: `https://apk.guille.tech/` (big **Descargar** button)
- Always-newest: `https://apk.guille.tech/latest.apk`
- Browse all builds: `https://apk.guille.tech/apks/`

APK binaries live in a **bind-mounted volume** (`/data/apks` in the container,
e.g. `/var/apks` on the host). The mobile build workflow `scp`s each new build
in and repoints `latest.apk`, so files survive image redeploys.

```
GitHub Action (build-mobile-apk.yml)
  build APK ──scp──▶ host:/var/apks/<tag>.apk
                     ln -sfn <tag>.apk latest.apk
                          │
                  Dokploy nginx (this image)
                  bind: /var/apks → /data/apks
                          │
            https://apk.guille.tech/latest.apk  ◀── phone
```

---

## One-time setup

### 1. DNS
Add an **A record**: `apk.guille.tech` → your Dokploy VPS IP (same server that
hosts `gym.guille.tech`).

### 2. Create the host directory on the VPS
SSH into the VPS and create the directory CI uploads into:
```bash
sudo mkdir -p /var/apks
# Owned by the SSH user CI will log in as (see step 4):
sudo chown -R <ci-user>:<ci-user> /var/apks
chmod 755 /var/apks
```

### 3. Dokploy app
Create a new **Application** in Dokploy:
- **Source**: this Git repo, build type **Dockerfile**, build path `apk-host/`
  (Docker build context `apk-host`, Dockerfile `Dockerfile`).
- **Domain**: `apk.guille.tech`, container **port 80**, HTTPS/Let's Encrypt **on**.
- **Volumes → Bind mount**: host path `/var/apks` → container path `/data/apks`.
- Deploy.

> The image only contains the landing page; APKs come from the bind mount, so an
> empty `/var/apks` just means "no builds yet" until the first CI publish.

### 4. SSH key for CI
Generate a dedicated keypair (no passphrase) for GitHub Actions:
```bash
ssh-keygen -t ed25519 -f apk_deploy_key -N "" -C "github-actions-apk"
# Add the PUBLIC key to the VPS user that owns /var/apks:
ssh-copy-id -i apk_deploy_key.pub <ci-user>@<vps-host>
# (or append apk_deploy_key.pub to ~<ci-user>/.ssh/authorized_keys)
```

### 5. GitHub secrets & variables
In the repo → **Settings → Secrets and variables → Actions**:

**Secrets**
| Name | Value |
|------|-------|
| `DOKPLOY_SSH_KEY`  | full contents of the **private** key `apk_deploy_key` |
| `DOKPLOY_SSH_HOST` | VPS hostname or IP |
| `DOKPLOY_SSH_USER` | the `<ci-user>` that owns `/var/apks` |

**Variables**
| Name | Value |
|------|-------|
| `APK_HOST_DIR`     | `/var/apks` |
| `DOKPLOY_SSH_PORT` | `22` (only if non-standard) |

---

## How a release reaches the phone

1. Trigger a mobile build (tag `mobile-v*` push, or **Build Mobile APK & Release**
   → Run workflow).
2. The **Publish APK to download host** step scp's `Calistenia-<version>.apk` to
   `/var/apks/<tag>.apk` and updates `latest.apk`.
3. On the phone, open `https://apk.guille.tech/` → **Descargar APK** → install.

If the SSH secrets are unset the publish step prints a warning and is skipped —
the build still succeeds and the APK is still attached to the GitHub Release.
