const { spawn } = require('child_process');
const path = require('path');

const backendDir = path.join(__dirname, 'backend');

console.log('Starting production server on port ' + (process.env.PORT || '3000') + '...');
const backend = spawn('node', ['server.js'], { 
  cwd: backendDir, 
  stdio: 'inherit', 
  shell: true,
  env: { ...process.env, PORT: process.env.PORT || '3000' } 
});

const cleanup = () => {
  console.log('Cleaning up production server...');
  backend.kill();
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
