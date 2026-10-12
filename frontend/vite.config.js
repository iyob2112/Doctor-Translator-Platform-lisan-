import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const certDir = path.join(frontendDir, "certs");

function lanIps() {
  const ips = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs || []) {
      if (addr.internal) continue;
      if (addr.family === "IPv4" || addr.family === 4) ips.push(addr.address);
    }
  }
  return [...new Set(ips)];
}

function ensureDevHttps() {
  const keyFile = path.join(certDir, "key.pem");
  const certFile = path.join(certDir, "cert.pem");
  const caKeyFile = path.join(certDir, "ca.key.pem");
  const caFile = path.join(certDir, "ca.crt");
  const stampFile = path.join(certDir, "sans.txt");
  const names = ["DNS:localhost", "IP:127.0.0.1", ...lanIps().map((ip) => `IP:${ip}`)];
  const stamp = `ca-v1:${names.join(",")}`;
  if (
    fs.existsSync(keyFile) &&
    fs.existsSync(certFile) &&
    fs.existsSync(caFile) &&
    fs.existsSync(stampFile) &&
    fs.readFileSync(stampFile, "utf8") === stamp
  ) {
    return {
      key: fs.readFileSync(keyFile),
      cert: fs.readFileSync(certFile),
      caPath: caFile,
    };
  }
  fs.mkdirSync(certDir, { recursive: true });
  execFileSync("openssl", [
    "req",
    "-x509",
    "-nodes",
    "-newkey",
    "rsa:2048",
    "-keyout",
    caKeyFile,
    "-out",
    caFile,
    "-days",
    "825",
    "-subj",
    "/CN=Lisan Local CA",
    "-addext",
    "basicConstraints=critical,CA:TRUE,pathlen:1",
    "-addext",
    "keyUsage=critical,keyCertSign,cRLSign",
  ]);
  const csrFile = path.join(certDir, "server.csr");
  execFileSync("openssl", [
    "req",
    "-new",
    "-nodes",
    "-newkey",
    "rsa:2048",
    "-keyout",
    keyFile,
    "-out",
    csrFile,
    "-subj",
    "/CN=Lisan",
  ]);
  const extFile = path.join(certDir, "server.ext");
  fs.writeFileSync(
    extFile,
    [
      `subjectAltName=${names.join(",")}`,
      "basicConstraints=CA:FALSE",
      "keyUsage=digitalSignature,keyEncipherment",
      "extendedKeyUsage=serverAuth",
    ].join("\n")
  );
  execFileSync("openssl", [
    "x509",
    "-req",
    "-in",
    csrFile,
    "-CA",
    caFile,
    "-CAkey",
    caKeyFile,
    "-CAcreateserial",
    "-out",
    certFile,
    "-days",
    "825",
    "-extfile",
    extFile,
  ]);
  fs.writeFileSync(stampFile, stamp);
  return {
    key: fs.readFileSync(keyFile),
    cert: fs.readFileSync(certFile),
    caPath: caFile,
  };
}

const isBuild = process.env.npm_lifecycle_event === "build" || process.argv.includes("build");
const https = isBuild ? null : ensureDevHttps();

function serveCaPlugin(caPath) {
  return {
    name: "serve-lisan-ca",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path !== "/lisan-ca.crt" && path !== "/l-cochlea-ca.crt" && path !== "/roomline-ca.crt") {
          return next();
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/x-x509-ca-cert");
        res.setHeader("Content-Disposition", 'attachment; filename="lisan-ca.crt"');
        res.end(fs.readFileSync(caPath));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), ...(https ? [serveCaPlugin(https.caPath)] : [])],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          daily: ["@daily-co/daily-js"],
          socket: ["socket.io-client"],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    ...(https ? { https: { key: https.key, cert: https.cert } } : {}),
    headers: {
      "Permissions-Policy": "camera=*, microphone=*, display-capture=*",
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://127.0.0.1:4000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
