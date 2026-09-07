import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CashMovements from "../CashMovements";
import * as cashMovementApi from "../../../api/posCashMovementApi";

vi.mock("../../../context/BranchContext", () => ({
  useBranch: () => ({ activeBranch: { id: 7, name: "Main Branch" } }),
}));

const mockCanAction = vi.fn();
vi.mock("../../../context/PermissionContext", () => ({
  usePermissions: () => ({ canAction: mockCanAction }),
}));

vi.mock("../../../api/posCashMovementApi");

const baseRow = {
  id: 10,
  sessionId: 1,
  counterName: "Main Counter",
  terminalId: "T1",
  movementType: "DROP_IN",
  amount: 50,
  description: "Float top-up",
  reference: "REF-1",
  performedBy: "cashierA",
  performedAt: "2026-07-28T09:00:00",
  businessDate: "2026-07-28",
  status: "ACTIVE",
  editable: true,
  voidable: true,
  editCount: 0,
};

function mockPermissions({ create = true, viewAll = true, edit = true, voidPerm = true } = {}) {
  mockCanAction.mockImplementation((module) => {
    if (module === "permissions.pos.cashmovement.create") return create;
    if (module === "permissions.pos.cashmovement.viewall") return viewAll;
    if (module === "permissions.pos.cashmovement.edit") return edit;
    if (module === "permissions.pos.cashmovement.void") return voidPerm;
    return false;
  });
}

const openSession = {
  id: 1, branchId: 7, branchName: "Main Branch", counterName: "Main Counter",
  terminalId: "T1", openedBy: "cashierA", businessDate: "2026-07-28",
  openedAt: "2026-07-28T08:00:00",
};

function mockEligibleSessions(sessions) {
  cashMovementApi.getCashMovementEligibleSessions.mockResolvedValue(sessions);
}

function mockListResponse(content) {
  cashMovementApi.getPosCashMovements.mockResolvedValue({
    content, page: 0, totalPages: 1, totalElements: content.length,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPermissions();
  mockListResponse([baseRow]);
  mockEligibleSessions([openSession]);
});

describe("CashMovements list page", () => {
  it("renders rows returned by the API with key columns", async () => {
    render(<CashMovements />);
    await waitFor(() => expect(cashMovementApi.getPosCashMovements).toHaveBeenCalled());

    const table = await screen.findByRole("table");
    expect(within(table).getByText("DROP_IN")).toBeInTheDocument();
    expect(screen.getByText("Float top-up")).toBeInTheDocument();
    expect(screen.getByText("cashierA")).toBeInTheDocument();
    expect(within(table).getByText("ACTIVE")).toBeInTheDocument();
  });

  it("refetches with updated filters when the movement type filter changes", async () => {
    const user = userEvent.setup();
    render(<CashMovements />);
    await waitFor(() => expect(cashMovementApi.getPosCashMovements).toHaveBeenCalledTimes(1));

    const selects = screen.getAllByRole("combobox");
    const typeSelect = selects.find((s) => within(s).queryByText("All Types"));
    await user.selectOptions(typeSelect, "DROP_OUT");

    await waitFor(() => {
      const lastCall = cashMovementApi.getPosCashMovements.mock.calls.at(-1)[0];
      expect(lastCall.movementType).toBe("DROP_OUT");
    });
  });

  it("blocks listing without a sessionId for users without cross-session view access", async () => {
    mockPermissions({ viewAll: false });
    render(<CashMovements />);

    expect(await screen.findByText(/Enter a Session ID/i)).toBeInTheDocument();
    expect(cashMovementApi.getPosCashMovements).not.toHaveBeenCalled();
  });
});

describe("permission-based visibility", () => {
  it("hides the Add New button when the user lacks create permission", async () => {
    mockPermissions({ create: false });
    render(<CashMovements />);
    await waitFor(() => expect(cashMovementApi.getPosCashMovements).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /add new/i })).not.toBeInTheDocument();
  });

  it("shows the Add New button when the user has create permission", async () => {
    render(<CashMovements />);
    await waitFor(() => expect(cashMovementApi.getPosCashMovements).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /add new/i })).toBeInTheDocument();
  });

  it("hides edit/void action buttons entirely when permission is not granted", async () => {
    mockPermissions({ edit: false, voidPerm: false });
    render(<CashMovements />);
    await waitFor(() => expect(cashMovementApi.getPosCashMovements).toHaveBeenCalled());
    expect(screen.queryByTitle("Edit")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Void")).not.toBeInTheDocument();
  });
});

describe("closed-business-day behaviour", () => {
  it("disables Edit and Void buttons for a row belonging to a closed business day", async () => {
    mockListResponse([{ ...baseRow, editable: false, voidable: false }]);
    render(<CashMovements />);
    await waitFor(() => expect(cashMovementApi.getPosCashMovements).toHaveBeenCalled());

    expect(screen.getByTitle("Edit")).toBeDisabled();
    expect(screen.getByTitle("Void")).toBeDisabled();
  });

  it("keeps Edit and Void enabled for an editable/voidable row", async () => {
    render(<CashMovements />);
    await waitFor(() => expect(cashMovementApi.getPosCashMovements).toHaveBeenCalled());

    expect(screen.getByTitle("Edit")).not.toBeDisabled();
    expect(screen.getByTitle("Void")).not.toBeDisabled();
  });
});

describe("create dialog", () => {
  async function openCreateDialog(user) {
    render(<CashMovements />);
    await waitFor(() => expect(cashMovementApi.getPosCashMovements).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /add new/i }));
    return screen.getByRole("dialog", { name: /new cash drop \/ out/i });
  }

  const sessionPicker = (dialog) =>
    within(dialog).getAllByRole("combobox").find((c) => within(c).queryByText(/open session/i));

  it("only offers sessions a cash movement may be added to", async () => {
    const user = userEvent.setup();
    // A closed session is simply absent from the eligible list the backend returns.
    mockEligibleSessions([openSession]);
    const dialog = await openCreateDialog(user);

    await waitFor(() =>
      expect(cashMovementApi.getCashMovementEligibleSessions).toHaveBeenCalledWith(7)
    );
    const picker = sessionPicker(dialog);
    const options = within(picker).getAllByRole("option");
    expect(options).toHaveLength(2); // placeholder + the one open session
    expect(options[1]).toHaveTextContent("#1");
    expect(within(picker).queryByRole("option", { name: /#2/ })).not.toBeInTheDocument();
  });

  it("disables the picker and Create when no session is eligible", async () => {
    const user = userEvent.setup();
    mockEligibleSessions([]);
    const dialog = await openCreateDialog(user);

    await waitFor(() => expect(sessionPicker(dialog)).toBeDisabled());
    expect(within(dialog).getByRole("button", { name: /^create$/i })).toBeDisabled();
    expect(within(dialog).getByText(/there are no open sessions/i)).toBeInTheDocument();
    expect(cashMovementApi.createPosCashMovement).not.toHaveBeenCalled();
  });

  it("keeps Create disabled until a session is picked when several are open", async () => {
    const user = userEvent.setup();
    mockEligibleSessions([openSession, { ...openSession, id: 2, counterName: "Counter 2" }]);
    const dialog = await openCreateDialog(user);

    await waitFor(() => expect(sessionPicker(dialog)).not.toBeDisabled());
    expect(within(dialog).getByRole("button", { name: /^create$/i })).toBeDisabled();

    await user.selectOptions(sessionPicker(dialog), "2");
    expect(within(dialog).getByRole("button", { name: /^create$/i })).not.toBeDisabled();
  });

  it("validates the amount before submitting", async () => {
    const user = userEvent.setup();
    const dialog = await openCreateDialog(user);
    await waitFor(() => expect(sessionPicker(dialog)).not.toBeDisabled());

    await user.click(within(dialog).getByRole("button", { name: /^create$/i }));

    expect(await screen.findByText(/select an open session and enter a positive amount/i)).toBeInTheDocument();
    expect(cashMovementApi.createPosCashMovement).not.toHaveBeenCalled();
  });

  it("submits a create request with the selected session and entered fields", async () => {
    const user = userEvent.setup();
    cashMovementApi.createPosCashMovement.mockResolvedValue({ ...baseRow, id: 11 });
    const dialog = await openCreateDialog(user);
    // A single eligible session is preselected, so the operator only fills in the amount.
    await waitFor(() => expect(sessionPicker(dialog)).toHaveValue("1"));

    await user.type(within(dialog).getByRole("spinbutton"), "100");
    await user.type(within(dialog).getAllByRole("textbox")[0], "Float top-up");
    await user.click(within(dialog).getByRole("button", { name: /^create$/i }));

    await waitFor(() =>
      expect(cashMovementApi.createPosCashMovement).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 1, movementType: "DROP_IN", amount: 100 })
      )
    );
  });
});

describe("void dialog", () => {
  it("requires a void reason before confirming", async () => {
    const user = userEvent.setup();
    render(<CashMovements />);
    await waitFor(() => expect(cashMovementApi.getPosCashMovements).toHaveBeenCalled());

    await user.click(screen.getByTitle("Void"));
    await user.click(screen.getByRole("button", { name: /void transaction/i }));

    expect(await screen.findByText(/void reason is required/i)).toBeInTheDocument();
    expect(cashMovementApi.voidPosCashMovement).not.toHaveBeenCalled();
  });

  it("submits the void reason and refreshes the list", async () => {
    const user = userEvent.setup();
    cashMovementApi.voidPosCashMovement.mockResolvedValue({ ...baseRow, status: "VOIDED" });
    render(<CashMovements />);
    await waitFor(() => expect(cashMovementApi.getPosCashMovements).toHaveBeenCalled());

    await user.click(screen.getByTitle("Void"));
    const dialog = screen.getByRole("dialog", { name: /void cash movement/i });
    await user.type(within(dialog).getByRole("textbox"), "Cashier miscounted the drop");
    await user.click(within(dialog).getByRole("button", { name: /void transaction/i }));

    await waitFor(() =>
      expect(cashMovementApi.voidPosCashMovement).toHaveBeenCalledWith(10, "Cashier miscounted the drop")
    );
  });
});

describe("edit dialog", () => {
  it("only submits description/reference, never amount/type/session", async () => {
    const user = userEvent.setup();
    cashMovementApi.editPosCashMovement.mockResolvedValue({ ...baseRow, description: "Updated" });
    render(<CashMovements />);
    await waitFor(() => expect(cashMovementApi.getPosCashMovements).toHaveBeenCalled());

    await user.click(screen.getByTitle("Edit"));
    const dialogTextarea = screen.getByDisplayValue("Float top-up");
    await user.clear(dialogTextarea);
    await user.type(dialogTextarea, "Corrected description");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(cashMovementApi.editPosCashMovement).toHaveBeenCalledWith(10, {
        description: "Corrected description",
        reference: "REF-1",
      })
    );
  });
});
