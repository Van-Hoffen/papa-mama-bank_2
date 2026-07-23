const { spawn } = require('child_process');
const path = require('path');

const backendDir = path.join(__dirname, 'backend');

console.log('Starting production server...');
const backend = spawn('node', ['server.js'], { cwd: backendDir, stdio: 'inherit', shell: true });

const cleanup = () => {
  console.log('Cleaning up production server...');
  backend.kill();
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
