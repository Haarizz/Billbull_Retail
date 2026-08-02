# Trade POS Testing Checklist

## 1. Catalog & Products
- [ ] Type in search bar; grid filters instantly.
- [ ] Scan a barcode; item immediately adds to cart.
- [ ] Click a category pill; grid filters correctly.
- [ ] Click a product card; adds 1 unit to the cart.

## 2. Customer Management
- [ ] Type a name in customer search; dropdown appears.
- [ ] Select customer; customer card displays correctly.
- [ ] If credit customer with exceeded balance, warning banner appears.
- [ ] Remove customer via the 'X' button.
- [ ] Click "Create New Customer" in dropdown to verify modal appears.

## 3. Cart & Actions
- [ ] Select a row in the cart.
- [ ] Click **Qty**, type `5`, hit **ENTER**. Quantity updates.
- [ ] Click **Discount**, type `10`, hit **ENTER**. Discount updates.
- [ ] Click **Price**, type `50`, hit **ENTER**. Override applies.
- [ ] Verify `DEL` button on numpad backspaces digits.
- [ ] Click **Hold** to clear cart and park invoice.
- [ ] Click **Cash Out** to trigger cash drop dialog.

## 4. Checkout
- [ ] With items in cart, Checkout button turns yellow and shows grand total.
- [ ] Click Checkout to trigger legacy settlement dialog.
- [ ] Complete payment and verify receipt print.
