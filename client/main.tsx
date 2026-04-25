// vite-react-ssg entry. The library:
//   * On the client: auto-mounts <App/> into #root (createRoot when there is
//     no SSR markup, hydrateRoot when data-server-rendered="true" is present).
//   * On the server (during `vite-react-ssg build`): imports this file as
//     SSR, calls the exported `createRoot(false)` to get the React tree, and
//     pipes the result through renderToString.
//
// We use the `single-page` adapter — the site has one route ("/"), no nested
// route data, no loaders. `single-page` skips the react-router server harness
// and just renders <App/> as-is, which keeps the moving parts minimal.
import { ViteReactSSG } from "vite-react-ssg/single-page";
import App from "./App";

export const createRoot = ViteReactSSG(<App />);
