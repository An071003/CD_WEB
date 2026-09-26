# A24 Disc Gallery Clone

A static film and television disc gallery inspired by the A24 experience. The source site is in `dist/` and has no package dependencies.

## Local preview

Serve `dist/` with any static server, for example:

```sh
python -m http.server 4173 --directory dist
```

## Deployment

Pushing to `main` runs [the GitHub Pages workflow](.github/workflows/deploy-pages.yml). It validates the JavaScript, builds the site for the repository path, and deploys it to GitHub Pages. Manual runs are also available through Actions.

To build the Pages artifact locally:

```sh
node scripts/build-pages.mjs
```

The generated `_site/` directory is ignored by Git. The default Pages URL is `https://an071003.github.io/CD_WEB/`.
