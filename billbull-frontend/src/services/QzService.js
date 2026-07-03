import qz from "qz-tray";

export async function testConnection() {
  try {
    await qz.websocket.connect();

    const printer = await qz.printers.find("POS-80C");

    const config = qz.configs.create(printer);

    const data = [
      '\x1B\x40',
      'BILLBULL\n',
      '-----------------------\n',
      'HELLO WORLD\n',
      '\n\n\n',
      '\x1D\x56\x00'
    ];

    await qz.print(config, data);

    await qz.websocket.disconnect();
  } catch (e) {
    console.error(e);
  }
}
