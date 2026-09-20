import { defineConfig } from "wxt";

const apiOrigin = process.env.WXT_API_ORIGIN ?? "http://127.0.0.1:4310";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifestVersion: 3,
  manifest: {
    name: "AI Slop Labels",
    description: "Community labels for AI-generated content signals.",
    permissions: ["storage", "identity"],
    host_permissions: ["https://habr.com/*", `${apiOrigin}/*`],
    action: { default_popup: "popup.html" },
    browser_specific_settings: {
      gecko: {
        id: "@ai-slop-labels.dskr.dev",
        data_collection_permissions: {
          required: ["authenticationInfo", "websiteActivity", "personalCommunications"],
        },
      },
    },
  },
});
