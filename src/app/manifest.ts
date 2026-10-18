import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Home Inventory",
    short_name: "Inventory",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f2f4",
    theme_color: "#1a8be6",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
