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

process.on("message", async (message) => {
  if (!message || message.type !== "ocr") return;
  try {
    const text = await runOcr(message.imagePath);
    if (process.send) {
      process.send({ type: "result", ok: true, text });
    }
  } catch (error) {
    if (process.send) {
      process.send({
        type: "result",
        ok: false,
        error: String(error?.message || error),
      });
    }
  } finally {
    process.exit(0);
  }
});
