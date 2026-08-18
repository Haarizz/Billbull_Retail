import { resolveLabelLayout } from '../zebraZpl';

describe('Zebra ZPL Layout Engine', () => {
    
    const generateBaseFields = () => [
        { type: 'text', id: 'company', enabled: true, value: 'Acme Corp' },
        { type: 'text', id: 'productName', enabled: true, value: 'Test Product 123' },
        { type: 'text', id: 'brand', enabled: true, value: 'BrandX' },
        { type: 'text', id: 'code', enabled: true, value: 'Code: 12345' },
        { type: 'barcode', id: 'productBarcode', enabled: true, value: '123456789' },
        { type: 'barcode', id: 'batchBarcode', enabled: true, value: 'BATCH123' },
        { type: 'text', id: 'expiry', enabled: true, value: 'Exp: 2025-01-01' },
        { type: 'text', id: 'price', enabled: true, value: '$99.99' }
    ];

    it('should correctly calculate dimensions for 38x25mm label (approx 304x200 dots)', () => {
        const layout = resolveLabelLayout({ labelWidthMm: 38, labelHeightMm: 25 }, [], { dpi: 8 });
        
        expect(layout.labelWidthDots).toBe(304);
        expect(layout.labelHeightDots).toBe(200);
        
        // safe area
        expect(layout.safeArea.left).toBe(16); // 2mm * 8
        expect(layout.safeArea.right).toBe(288); // 304 - 16
        expect(layout.safeArea.top).toBe(16);
        expect(layout.safeArea.bottom).toBe(184); // 200 - 16
    });

    it('should correctly calculate dimensions for 50x50mm label (approx 400x400 dots)', () => {
        const layout = resolveLabelLayout({ labelWidthMm: 50, labelHeightMm: 50 }, [], { dpi: 8 });
        expect(layout.labelWidthDots).toBe(400);
        expect(layout.labelHeightDots).toBe(400);
    });

    it('should correctly calculate dimensions for 100x75mm label (approx 800x600 dots)', () => {
        const layout = resolveLabelLayout({ labelWidthMm: 100, labelHeightMm: 75 }, [], { dpi: 8 });
        expect(layout.labelWidthDots).toBe(800);
        expect(layout.labelHeightDots).toBe(600);
    });

    it('should respect layout constraints for every element inside a 38x25mm label', () => {
        const fields = generateBaseFields();
        // A 38x25 label physically cannot fit 2 barcodes and 6 text fields.
        // Disable some fields to make it realistic.
        fields.find(f => f.id === 'batchBarcode').enabled = false;
        fields.find(f => f.id === 'expiry').enabled = false;
        fields.find(f => f.id === 'price').enabled = false;

        const layout = resolveLabelLayout({ labelWidthMm: 38, labelHeightMm: 25 }, fields, { dpi: 8 });
        
        expect(layout.validationPassed).toBe(true);
        expect(layout.elements.length).toBe(5);
        
        layout.elements.forEach(el => {
            expect(el.x).toBeGreaterThanOrEqual(0);
            expect(el.y).toBeGreaterThanOrEqual(0);
            expect(el.x + el.width).toBeLessThanOrEqual(layout.labelWidthDots);
            // using the same 1.5mm tolerance logic for descenders as layout engine
            expect(el.y + el.height).toBeLessThanOrEqual(layout.safeArea.bottom + (1.5 * 8)); 
        });
    });

    it('should NOT render disabled fields', () => {
        const fields = generateBaseFields();
        fields.find(f => f.id === 'price').enabled = false;
        
        const layout = resolveLabelLayout({ labelWidthMm: 38, labelHeightMm: 25 }, fields, { dpi: 8 });
        
        const priceElement = layout.elements.find(el => el.id === 'price');
        expect(priceElement).toBeUndefined();
        expect(layout.elements.length).toBe(7);
    });

    it('should dynamically redistribute available height to barcodes if text fields are disabled', () => {
        const fieldsAll = generateBaseFields();
        const layoutAll = resolveLabelLayout({ labelWidthMm: 38, labelHeightMm: 25 }, fieldsAll, { dpi: 8 });
        const barcodeAll = layoutAll.elements.find(el => el.type === 'barcode');
        
        const fieldsMinimal = generateBaseFields().map(f => {
            if (f.type === 'text') f.enabled = false;
            return f;
        });
        const layoutMinimal = resolveLabelLayout({ labelWidthMm: 38, labelHeightMm: 25 }, fieldsMinimal, { dpi: 8 });
        const barcodeMinimal = layoutMinimal.elements.find(el => el.type === 'barcode');
        
        // When there is less text, barcode should be able to expand (subject to maximum bounds)
        expect(barcodeMinimal.barcodeHeight).toBeGreaterThan(barcodeAll.barcodeHeight);
    });
    
    it('large label 100x75 should not become unnecessarily compact', () => {
        const fields = generateBaseFields();
        const layout = resolveLabelLayout({ labelWidthMm: 100, labelHeightMm: 75 }, fields, { dpi: 8 });
        
        // Ensure that standard fonts are used instead of compact fonts
        const productName = layout.elements.find(f => f.id === 'productName');
        expect(productName.fontH).toBe(Math.round(3.4 * 8)); // 3.4mm is standard for productName
        
        const barcode = layout.elements.find(f => f.type === 'barcode');
        // Max barcode height for dual barcodes is 14mm
        expect(barcode.barcodeHeight).toBe(Math.round(14 * 8));
    });

    it('should scale down font for long product names to avoid overprinting on 38x25', () => {
        const fields = generateBaseFields();
        const productField = fields.find(f => f.id === 'productName');
        productField.value = 'BELCOLADE - AMBER CARAMEL'; // 25 chars
        
        const layout = resolveLabelLayout({ labelWidthMm: 38, labelHeightMm: 25 }, fields, { dpi: 8 });
        const productName = layout.elements.find(f => f.id === 'productName');
        
        // Original font height was 2.6mm * 8 = 21 dots.
        // It should be scaled down.
        expect(productName.fontH).toBeLessThan(Math.round(2.6 * 8));
        
        // Because it fits on one line with scaled down font, maxLines is 1
        expect(productName.maxLines).toBe(1);
        expect(productName.displayValue).toBe('BELCOLADE - AMBER CARAMEL');
    });

    it('should truncate extremely long product names to prevent ^FB overprint glitch', () => {
        const fields = generateBaseFields();
        const productField = fields.find(f => f.id === 'productName');
        productField.value = 'BELCOLADE WHITE CHOCOLATE AMBER CARAMEL EXTREMELY LONG TEXT'; // 59 chars
        
        const layout = resolveLabelLayout({ labelWidthMm: 38, labelHeightMm: 25 }, fields, { dpi: 8 });
        const productName = layout.elements.find(f => f.id === 'productName');
        
        // Font should hit minimum 2.0mm * 8 = 16 dots
        expect(productName.fontH).toBe(Math.round(2.0 * 8));
        
        // maxLines allowed is 2
        expect(productName.maxLines).toBe(2);
        
        // Should truncate cleanly instead of overwriting lines
        expect(productName.displayValue.length).toBeLessThan(productField.value.length);
        expect(productName.displayValue.endsWith('...')).toBe(true);
    });
});
