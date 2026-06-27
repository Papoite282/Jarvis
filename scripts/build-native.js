import { execSync } from 'node:child_process';
import os from 'node:os';

if (os.platform() !== 'darwin') {
  console.log('Pulando build do binário de voz (não é macOS).');
  process.exit(0);
}

try {
  execSync('swiftc -O native/speech.swift -o native/speech-cli', { stdio: 'inherit' });
} catch (err) {
  console.warn('Não foi possível compilar o binário de voz nativo:', err.message);
}
