// Public hosting entry point. Local development remains loopback-only by default.
process.env.HOST ||= '0.0.0.0';
await import('./dev-server.mjs');
