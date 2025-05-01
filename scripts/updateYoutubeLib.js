// eslint-disable-next-line @typescript-eslint/no-var-requires
const { exec } = require('child_process');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const util = require('util');

const run = util.promisify(exec);

async function updateLibrary() {
  console.log('🔁 Actualizando youtubei.js...');
  try {
    const { stdout } = await run('npm install youtubei.js@latest');
    console.log(stdout);
  } catch (err) {
    console.error('❌ Error actualizando youtubei.js', err);
  }
}

updateLibrary();
