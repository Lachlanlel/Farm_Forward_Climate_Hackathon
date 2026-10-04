# Publish the working demo

**Live demo:** https://farm-forward-052x.onrender.com/

Current Render service: `srv-db1265lg1s2s73878h80`, Singapore region, Free plan. The service was created from the public Git repository; update it through **Manual Deploy → Deploy latest commit** after pushing changes, and verify the deployed commit. Do not assume a GitHub push has updated the public demo.

The repository is https://github.com/Lachlanlel/Farm_Forward_Climate_Hackathon.
Use this repository's latest `main` branch. No old ZIP or separate backend is needed.

## Render deployment

The included `render.yaml` defines one **free Node.js Web Service** for the complete frontend, 3D assets, official CDI data and calculation APIs. No database or API key is required. Do not select Static Site: the simulation needs its backend.

1. Sign in at https://dashboard.render.com using GitHub.
2. Choose **New → Blueprint** and connect this repository. If GitHub requests repository access, select only `Farm_Forward_Climate_Hackathon`.
3. Select `main` and review the `farm-forward` Web Service with the **Free** plan.
4. Deploy and wait until Render reports that the service is live.
5. Open the HTTPS URL assigned by Render. Copy the actual URL shown in its dashboard.
6. Verify the live app as described below, then add that URL to the README and submit it as the working demo link.

Alternatively, choose **New → Web Service** and use these settings:

| Setting | Value |
|---|---|
| Repository branch | `main` |
| Root directory | Leave blank |
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/` |
| Instance | Free |
| Environment | `NODE_VERSION=22.14.0`, `NODE_ENV=production`, `HOST=0.0.0.0` |

Render supplies `PORT`; do not hardcode it. `npm start` listens on `0.0.0.0` by default, while `npm run dev` defaults to `127.0.0.1` for local use. Both serve the same compiled Worker. Build before starting, and restart after rebuilding.

Free services sleep after 15 minutes without incoming traffic. The next visit can take longer to load. Open the demo before recording and allow it to wake up. Do not select a paid plan without the account owner's approval.

Provider references: [Web services](https://render.com/docs/web-services), [Blueprints](https://render.com/docs/blueprint-spec), [Free service limits](https://render.com/docs/free).

## Verification before submission

Run the local checks from the repository root:

```sh
npm ci
npm run build
npm run typecheck
npm test
node scripts/verify-demo.mjs
node scripts/verify-hosting.mjs
node scripts/verify-handoff.mjs
```

The hosting check starts the public entry point on a temporary port and verifies all 59 assets, page routes and the three calculation APIs over real HTTP.

To check a deployed URL against this checkout, set `DEMO_BASE_URL` to the exact HTTPS URL from Render and run `node scripts/verify-demo.mjs`. This checks source asset bytes and expected calculation results, catching an outdated deployment. In PowerShell:

```powershell
$env:DEMO_BASE_URL = 'https://YOUR-ACTUAL-SERVICE.onrender.com'
node scripts/verify-demo.mjs
Remove-Item Env:DEMO_BASE_URL
```

Also open the public link in a fresh browser session without Render/GitHub login: search for Wagga Wagga, complete a simulation, review all four Results steps, and confirm that the 3D scene, charts and scenario summary work. Follow [DEMO_GUIDE.md](DEMO_GUIDE.md) for settings and expected results. New location searches require access to the external Photon service.

Submit the **working demo URL**, the **video URL** and the **GitHub URL** in their respective fields. A video must be recorded/uploaded separately; no video is included in this repository.

## Other hosting / original project

GitHub hosts the source and does not run the app. GitHub Pages alone cannot run `/api/cdi/baseline`, `/api/simulation/project` or `/api/results`.

The build also generates a self-contained Worker in `dist/server/index.js`. `.openai/hosting.json` retains the original Sites identity for provenance. That project was unavailable from the connected account during handoff; Render does not require access to it. No hosting credentials are committed.
