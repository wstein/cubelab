export const chromeDevToolsWorkspacePath =
  "/.well-known/appspecific/com.chrome.devtools.json";

const workspaceUuid = "9e7dfe52-6a7f-4e2f-8d74-e163aa9ae28a";

export function createChromeDevToolsWorkspaceManifest(projectRoot) {
  return {
    workspace: {
      root: projectRoot,
      uuid: workspaceUuid,
    },
  };
}

export function chromeDevToolsWorkspacePlugin() {
  return {
    name: "cubelab:chrome-devtools-workspace",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestPath = request.url?.split("?", 1)[0];
        if (request.method !== "GET" || requestPath !== chromeDevToolsWorkspacePath) {
          next();
          return;
        }

        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(
          JSON.stringify(createChromeDevToolsWorkspaceManifest(server.config.root)),
        );
      });
    },
  };
}
