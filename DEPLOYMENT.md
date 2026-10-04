# Repository access and live website access

## Repository

The intended repository is https://github.com/Lachlanlel/Farm_Forward_Climate_Hackathon.

After the source is pushed, a collaborator can clone it:

```sh
git clone https://github.com/Lachlanlel/Farm_Forward_Climate_Hackathon.git
cd Farm_Forward_Climate_Hackathon
npm ci
npm run build
npm run dev
```

Then open http://127.0.0.1:4174/. For a private repository, its owner must give the sister's GitHub account collaborator access. Do not share an account password or an access token. If the repository is public, it can be cloned without a collaborator invitation.

## Live website

A GitHub repository is source hosting, not a running backend. This app requires its Worker/API; GitHub Pages by itself will not run `/api/cdi/baseline`, `/api/simulation/project` or `/api/results`.

The existing build generates a self-contained Worker in `dist/server/index.js`, including static routes, data and scene assets. `.openai/hosting.json` retains the original Sites project identity. The original project was not accessible from the connected account during this handoff, so this release does not claim to update or publish that Site.

To publish through the original Sites project, use the owning account/access and the supported Sites source/build/deployment workflow. Preserve the existing audience unless explicitly changing sharing. Do not copy a previous deployment's URL into demo instructions and assume it contains these changes.

The supplied local server is for running the demo on the local machine and binds to `127.0.0.1`. It is not exposed as a public service. No hosting secrets or deployment tokens are included in Git.
