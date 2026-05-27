const { spawn } = require("child_process");
const net = require("net");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const clientDir = path.join(rootDir, "client");
const viteBin = path.join(clientDir, "node_modules", "vite", "bin", "vite.js");
const processes = [];

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`Khong tim thay port trong tu ${startPort} den ${startPort + 49}.`);
}

function startProcess(command, args, options) {
  const child = spawn(command, args, {
    stdio: "inherit",
    ...options,
  });
  processes.push(child);
  return child;
}

function shutdown(signal) {
  for (const child of processes) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

async function main() {
  const apiPort = Number(process.env.PORT || (await findAvailablePort(4000)));
  const apiUrl = `http://127.0.0.1:${apiPort}`;

  console.log(`Dang dung API tai ${apiUrl}`);

  startProcess(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(apiPort) },
  });

  startProcess(process.execPath, [viteBin], {
    cwd: clientDir,
    env: { ...process.env, VITE_API_URL: apiUrl },
  });

  for (const child of processes) {
    child.on("exit", (code) => {
      if (code && code !== 0) {
        shutdown("SIGTERM");
        process.exit(code);
      }
    });
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
  process.exit(0);
});

main().catch((error) => {
  console.error(error.message || error);
  shutdown("SIGTERM");
  process.exit(1);
});
