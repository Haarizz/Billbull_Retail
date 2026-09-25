// Extracted verbatim from POSSales.jsx during the Phase 3 in-place decomposition.
//
// Delivery: the New Delivery Order form, the delivery-person roster, the saved-address
// sub-flow, and the delivery-orders list that backs the settlement modal. Moved
// unchanged: the order projection, the validation order and messages, the modal-open
// resets, the address payload, and every default.
//
// DELIBERATELY NOT MOVED — both are print-coupled, and the brief defers printing:
//   * handleOutForDelivery  (~128 lines) posts the order via posCheckout and then runs
//     the full receipt stack (credit-balance lookup, A4/thermal build, ESC/POS,
//     printer resolution). Its dependency is printing, not delivery.
//   * handleFinalize        the settlement handler, which lives INSIDE the settlement
//     modal's JSX IIFE and reads ~20 tplInvoice* template flags plus the supervisor
//     approval flow.
// Both stay in POSSales and consume this hook's state through the destructure.
//
// NOTE ON SHARED FIELDS: deliveryAddress / deliveryNotes / deliveryDriver / deliveryCharge
// are owned here but are ALSO read by the main checkout payload. POSSales destructures
// them back under their original names, so every existing consumer is untouched.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getDeliveryOrders } from '../../../../../api/posApi';
import { getDeliveryPersons } from '../../../../../api/employeeApi';
import { addCustomerSavedAddress } from '../../../../../api/customerledgerApi';
import { WALK_IN_CUSTOMER } from '../../posConstants';
import { toNumber } from '../../posUtils';

/**
 * @param {object}   args
 * @param {object|null} args.currentTerminal
 * @param {object}   args.currentInvoice          read-only; validation checks item count
 * @param {object|null} args.selectedCustomerData seeds the modal's customer/address
 * @param {Function} args.setPosCustomers         updated when a saved address is added
 * @param {Function} args.clearDeliverySettleLines from the settle payment manager; the
 *                                                 manager itself stays in POSSales
 * @param {*}        args.deliverySettleSelected   owned by POSSales (not this hook) because
 *                                                 deliverySettleBalance/clearDeliverySettleLines
 *                                                 derive from it and this hook receives
 *                                                 clearDeliverySettleLines as an input — so the
 *                                                 state can't originate here without a circular
 *                                                 "hook needs a value that needs the hook" dependency.
 * @param {Function} args.setDeliverySettleSelected
 */
export function useDelivery({
  currentTerminal,
  currentInvoice,
  selectedCustomerData,
  setPosCustomers,
  clearDeliverySettleLines,
  deliverySettleSelected,
  setDeliverySettleSelected,
} = {}) {
  // Delivery order fields (deliveryAddress/Notes/Driver/Charge are also read by checkout)
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryDriver, setDeliveryDriver] = useState('');
  const [deliveryCharge, setDeliveryCharge] = useState('');
  // Delivery modal
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryModalTab, setDeliveryModalTab] = useState('existing');
  const [deliveryCustomerId, setDeliveryCustomerId] = useState('');
  const [deliveryCustomerSearch, setDeliveryCustomerSearch] = useState('');
  const [deliveryNewName, setDeliveryNewName] = useState('');
  const [deliveryNewMobile, setDeliveryNewMobile] = useState('');
  const [deliveryNewEmail, setDeliveryNewEmail] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [deliveryPersons, setDeliveryPersons] = useState([]);
  const [deliveryPersonsLoading, setDeliveryPersonsLoading] = useState(false);
  const [deliveryValidationErrors, setDeliveryValidationErrors] = useState({});
  // Saved shipping-address picker for the delivery modal (QA-028 pattern reused from CustomerShippingPanel)
  const [deliveryShowAddressPicker, setDeliveryShowAddressPicker] = useState(false);
  const [deliveryShowAddAddressModal, setDeliveryShowAddAddressModal] = useState(false);
  const [deliveryNewAddress, setDeliveryNewAddress] = useState({ name: '', address1: '', city: '', country: 'UAE', contactName: '', contactPhone: '' });
  const [deliveryAddressSaving, setDeliveryAddressSaving] = useState(false);
  const [deliveryAddressError, setDeliveryAddressError] = useState('');
  // Delivery settle modal
  const [showDeliverySettleModal, setShowDeliverySettleModal] = useState(false);
  const [deliverySettleSearch, setDeliverySettleSearch] = useState('');
  const [deliverySettlePersonFilter, setDeliverySettlePersonFilter] = useState('All Persons');
  const [deliveryOrders, setDeliveryOrders] = useState([]);
  const [deliveryOrdersLoading, setDeliveryOrdersLoading] = useState(false);
  const [deliveryOutLoading, setDeliveryOutLoading] = useState(false);
  const [deliverySettleLoading, setDeliverySettleLoading] = useState(false);

  const loadDeliveryOrders = useCallback(async () => {
    const branchId = currentTerminal?.branchId || null;
    setDeliveryOrdersLoading(true);
    try {
      const data = await getDeliveryOrders(branchId);
      setDeliveryOrders(Array.isArray(data) ? data.map(inv => ({
        id: inv.id,
        customer: inv.customerName || 'Walk-in Customer',
        invoice: inv.invoiceNumber,
        mobile: '',
        person: inv.posDriverName || '',
        invoiceAmt: toNumber(inv.invoiceTotal) - toNumber(inv.deliveryCharge),
        deliveryCharge: toNumber(inv.deliveryCharge),
        paidAmt: toNumber(inv.amountPaid),
      })) : []);
    } catch (err) {
      console.warn('Failed to load delivery orders', err);
      setDeliveryOrders([]);
    } finally {
      setDeliveryOrdersLoading(false);
    }
  }, [currentTerminal?.branchId]);

  const loadDeliveryPersons = useCallback(async () => {
    setDeliveryPersonsLoading(true);
    try {
      const data = await getDeliveryPersons();
      setDeliveryPersons(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to load delivery persons', err);
      setDeliveryPersons([]);
    } finally {
      setDeliveryPersonsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showDeliverySettleModal) {
      setDeliverySettleSearch('');
      setDeliverySettlePersonFilter('All Persons');
      setDeliverySettleSelected(null);
      clearDeliverySettleLines();
      loadDeliveryOrders();
    }
  }, [showDeliverySettleModal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showDeliveryModal) {
      loadDeliveryPersons();
      setDeliveryValidationErrors({});
    }
  }, [showDeliveryModal, loadDeliveryPersons]);

  const selectedDeliveryPerson = useMemo(
    () => deliveryPersons.find(person => String(person.employeeCode) === String(deliveryDriver)) || null,
    [deliveryPersons, deliveryDriver]
  );

  const validateDeliveryOrder = useCallback(() => {
    const errors = {};
    if (currentInvoice.items.length === 0) errors.items = 'Add at least one item before dispatching.';
    if (!deliveryCustomerId) errors.customer = 'Customer is required.';
    if (!deliveryAddress.trim()) errors.address = 'Delivery address is required.';
    if (!deliveryDate) errors.date = 'Delivery date is required.';
    if (!deliveryTimeSlot) errors.timeSlot = 'Time slot is required.';
    if (!deliveryDriver) errors.deliveryDriver = 'Assign a delivery person.';
    setDeliveryValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      alert('Please complete the required delivery details before sending the order out for delivery.');
      return false;
    }
    return true;
  }, [currentInvoice.items.length, deliveryAddress, deliveryCustomerId, deliveryDate, deliveryDriver, deliveryTimeSlot]);

  const openDeliveryModal = useCallback(() => {
    setDeliveryModalTab('existing');
    const cust = selectedCustomerData;
    const isReal = cust && cust.id !== WALK_IN_CUSTOMER.id;
    if (isReal) {
      setDeliveryCustomerId(String(cust.id));
      if (cust.address) setDeliveryAddress(prev => (prev?.trim() ? prev : cust.address));
    } else {
      setDeliveryCustomerId('');
    }
    setShowDeliveryModal(true);
  }, [selectedCustomerData]);

  // Add a new saved shipping address for the customer selected in the delivery
  // modal, then select it as the active delivery address. Mirrors
  // CustomerShippingPanel.handleSaveNewAddress (QA-028) — same endpoint/shape,
  // adapted to update posCustomers instead of a single selectedCustomer prop.
  const handleSaveDeliveryNewAddress = useCallback(async () => {
    if (!deliveryCustomerId) return;
    if (!deliveryNewAddress.name.trim() || !deliveryNewAddress.address1.trim()) {
      setDeliveryAddressError('Address label and address are required');
      return;
    }
    setDeliveryAddressSaving(true);
    setDeliveryAddressError('');
    try {
      const updatedAddresses = await addCustomerSavedAddress(deliveryCustomerId, {
        name: deliveryNewAddress.name.trim(),
        address1: deliveryNewAddress.address1.trim(),
        city: deliveryNewAddress.city.trim(),
        country: deliveryNewAddress.country.trim(),
        // Stash contact details on address2 — entity has no dedicated contact fields.
        address2: [deliveryNewAddress.contactName, deliveryNewAddress.contactPhone]
          .filter(v => v && v.trim()).join(' · '),
      });

      setPosCustomers(prev => prev.map(c =>
        String(c.id) === String(deliveryCustomerId) ? { ...c, savedAddresses: updatedAddresses } : c
      ));

      const added = updatedAddresses[updatedAddresses.length - 1];
      if (added) {
        setDeliveryAddress([added.address1, added.address2, added.city, added.country].filter(Boolean).join(', '));
      }
      setDeliveryValidationErrors(prev => ({ ...prev, address: '' }));
      setDeliveryNewAddress({ name: '', address1: '', city: '', country: 'UAE', contactName: '', contactPhone: '' });
      setDeliveryShowAddAddressModal(false);
    } catch (err) {
      console.error(err);
      setDeliveryAddressError('Failed to save address. Please try again.');
    } finally {
      setDeliveryAddressSaving(false);
    }
    // Dependency array preserved verbatim from POSSales. setPosCustomers was a closure
    // binding there and is a parameter here, so the linter now sees it; it is a useState
    // setter with a React-guaranteed stable identity, and adding it would change the
    // array this extraction is required to leave untouched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryCustomerId, deliveryNewAddress]);

  return {
    // order fields (also read by the checkout payload)
    deliveryAddress, setDeliveryAddress,
    deliveryNotes, setDeliveryNotes,
    deliveryDriver, setDeliveryDriver,
    deliveryCharge, setDeliveryCharge,
    // new-order modal
    showDeliveryModal, setShowDeliveryModal,
    deliveryModalTab, setDeliveryModalTab,
    deliveryCustomerId, setDeliveryCustomerId,
    deliveryCustomerSearch, setDeliveryCustomerSearch,
    deliveryNewName, setDeliveryNewName,
    deliveryNewMobile, setDeliveryNewMobile,
    deliveryNewEmail, setDeliveryNewEmail,
    deliveryDate, setDeliveryDate,
    deliveryTimeSlot, setDeliveryTimeSlot,
    deliveryInstructions, setDeliveryInstructions,
    deliveryValidationErrors, setDeliveryValidationErrors,
    // delivery persons
    deliveryPersons, deliveryPersonsLoading, selectedDeliveryPerson, loadDeliveryPersons,
    // saved-address sub-flow
    deliveryShowAddressPicker, setDeliveryShowAddressPicker,
    deliveryShowAddAddressModal, setDeliveryShowAddAddressModal,
    deliveryNewAddress, setDeliveryNewAddress,
    deliveryAddressSaving, deliveryAddressError, setDeliveryAddressError,
    handleSaveDeliveryNewAddress,
    // settlement modal + orders list
    showDeliverySettleModal, setShowDeliverySettleModal,
    deliverySettleSearch, setDeliverySettleSearch,
    deliverySettlePersonFilter, setDeliverySettlePersonFilter,
    deliveryOrders, deliveryOrdersLoading, loadDeliveryOrders,
    // busy flags owned here, driven by the print-coupled handlers left in POSSales
    deliveryOutLoading, setDeliveryOutLoading,
    deliverySettleLoading, setDeliverySettleLoading,
    // actions
    openDeliveryModal, validateDeliveryOrder,
  };
}

export default useDelivery;
