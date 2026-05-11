const { createWorker } = require("tesseract.js");

async function runOcr(imagePath) {
  const worker = await createWorker("fra");
  try {
    const result = await worker.recognize(imagePath);
    return (result.data.text || "").trim();
  } finally {
    await worker.terminate();
  }
}

async function runFromCli() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    process.stderr.write("Missing image path\n");
    process.exit(2);
    return;
  }
  try {
    const text = await runOcr(imagePath);
    process.stdout.write(JSON.stringify({ ok: true, text }));
    process.exit(0);
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        error: String(error?.message || error),
      })
    );
    process.exit(1);
  }
}

runFromCli();
