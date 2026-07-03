import javax.print.PrintService;
import javax.print.PrintServiceLookup;

public class ListPrinters {
    public static void main(String[] args) {
        PrintService[] printers = PrintServiceLookup.lookupPrintServices(null, null);

        for (PrintService printer : printers) {
            System.out.println(printer.getName());
        }
    }
}
