import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("dist");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp("index.html", `${output}/index.html`);
await cp("styles.css", `${output}/styles.css`);
await cp("src", `${output}/src`, { recursive: true });
console.log("Production static site built in dist/.");
