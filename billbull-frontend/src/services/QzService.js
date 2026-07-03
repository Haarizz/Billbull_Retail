import { connectQz, disconnectQz, listQzPrinters } from "../utils/qzTray";

export async function testConnection() {
  try {
    await connectQz();
    console.log("Connected");

    const printers = await listQzPrinters();
    console.log(printers);

    await disconnectQz();
  } catch (e) {
    console.error(e);
  }
}
