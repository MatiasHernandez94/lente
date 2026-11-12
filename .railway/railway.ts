import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "lente";
export default defineRailway(() => {
  const lente = service("lente", {
    source: github("MatiasHernandez94/lente", { branch: "main", checkSuites: false }),
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    start: "npm run worker",
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    replicas: { "iad": 1 },
  });

  return project("talented-eagerness", {
    variables: { managed: false },
    resources: [lente],
  });
});
