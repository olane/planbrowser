FROM node:22-bookworm AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY ui ./ui
RUN npm ci --prefix ui
RUN npm run build && npm run build --prefix ui

FROM node:22-bookworm
WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/ui/dist ./ui/dist
RUN npx playwright install --with-deps chromium && \
    chown -R 1000:1000 /ms-playwright
USER 1000:1000
EXPOSE 3000
CMD ["node", "dist/server.js"]
