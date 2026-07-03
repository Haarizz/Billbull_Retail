import { testConnection } from "../services/QzService";

export default function PrinterTestButton() {
  return (
    <button onClick={testConnection}>
      Test Printer
    </button>
  );
}
