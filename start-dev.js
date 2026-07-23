const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const backendDir = path.join(__dirname, 'backend');
const frontendDir = path.join(__dirname, 'frontend');

// Helper to install dependencies if node_modules doesn't exist
function installDeps(dir) {
  if (!fs.existsSync(path.join(dir, 'node_modules'))) {
    console.log(`Installing dependencies in ${dir}...`);
    require('child_process').execSync('npm install', { cwd: dir, stdio: 'inherit' });
  }
}

try {
  installDeps(backendDir);
  installDeps(frontendDir);
} catch (error) {
  console.error('Error installing dependencies:', error);
  process.exit(1);
}

// Clean up any existing nodemon/vite/server.js processes before starting
try {
  console.log('Cleaning up any existing dev/nodemon/vite processes on ports...');
  const { execSync } = require('child_process');
  execSync('pkill -f "nodemon server.js" || true');
  execSync('pkill -f "vite" || true');
  execSync('pkill -f "node server.js" || true');
} catch (e) {
  // Ignore
}

console.log('Starting backend server on port 5000...');
const backend = spawn('npm', ['run', 'dev'], {
  cwd: backendDir,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT: '5000' }
});

console.log('Starting frontend dev server on port 3000...');
const frontend = spawn('npm', ['run', 'dev'], {
  cwd: frontendDir,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT: '3000' }
});

// Forward termination signals to child processes
const cleanup = () => {
  console.log('Cleaning up child processes...');
  backend.kill();
  frontend.kill();
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
