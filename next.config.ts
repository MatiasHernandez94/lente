import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los videos locales de `data/uploads` se trazan dentro de las funciones
  // serverless porque `video-agent` resuelve esa carpeta dinámicamente. En
  // producción los archivos viven en Supabase Storage, así que trazarlos solo
  // infla el deploy (y rompe el `vercel deploy --prebuilt` con ENOENT).
  outputFileTracingExcludes: {
    "/*": ["data/**/*"],
  },
};

export default nextConfig;
