# program-directory

Static SPA deployable as a BlueStep GitSite. Routes live at the host root
(`/`, `/claim/:id`, `/portal`, `/admin`); only the built assets sit under `/spa/`.

## Commands

```bash
npm install       # install dependencies
npm run build     # emit index.html + assets/ at the repo root (this IS the deployed artifact)
```

Push to `main` and the BlueStep GitSite auto-deploys. Browse at
`https://programdirectory.bluestep.net/`.
