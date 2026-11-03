import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

/* Cesium 需要把 Workers / Assets / Widgets / ThirdParty 作为静态资源一起部署。
   资源根路径与 src/main.js 中的 CESIUM_BASE_URL 必须保持一致。 */
const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBase = 'cesium';

export default defineConfig({
  base: './',
  define: {
    CESIUM_BASE_URL: JSON.stringify(`${cesiumBase}/`),
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/ThirdParty`, dest: cesiumBase },
        { src: `${cesiumSource}/Workers`, dest: cesiumBase },
        { src: `${cesiumSource}/Assets`, dest: cesiumBase },
        { src: `${cesiumSource}/Widgets`, dest: cesiumBase },
      ],
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 4096,
  },
});
