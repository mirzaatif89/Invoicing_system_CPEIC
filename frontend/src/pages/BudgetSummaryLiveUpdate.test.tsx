import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import InvoiceForm from "./InvoiceForm";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  api: vi.fn(),
}));

const accounts = [
  { id: 1, code: "A1", name: "First account", incomeTaxPercentCompany: 4.5, incomeTaxPercentIndividual: 4.5, salesTaxPercentCompany: 3.6, salesTaxPercentIndividual: 3.6 },
  { id: 2, code: "A2", name: "Second account", incomeTaxPercentCompany: 0, incomeTaxPercentIndividual: 0, salesTaxPercentCompany: 0, salesTaxPercentIndividual: 0 },
];
const summaries = {
  A1: { totalBudget: 1000, totalExpense: 250, balance: 750 },
  A2: { totalBudget: 4000, totalExpense: 1500, balance: 2500 },
};

beforeEach(() => {
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path.startsWith("/account-codes?pageSize=")) return { data: accounts } as never;
    if (path.startsWith("/payees?pageSize=")) return { data: [] } as never;
    if (path === "/settings/ld-charges") return { ldGracePeriodDays: 0, ldRatePercentPerDay: 0.067, ldMaxCapPercent: null } as never;
    if (path === "/shelf-life-penalty-slabs") return { data: [] } as never;
    if (path.includes("/account-codes/A1/budget-summary")) return summaries.A1 as never;
    if (path.includes("/account-codes/A2/budget-summary")) return summaries.A2 as never;
    if (path.endsWith("/next-serial")) return { serialNo: 1 } as never;
    throw new Error(`Unexpected API request: ${path}`);
  });
});

afterEach(cleanup);

function renderPage(element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/new"]}>
      <Routes>
        <Route path="/new" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("budget summary live updates", () => {
  it("keeps Invoice Entry updating when its header account changes", async () => {
    const { container } = renderPage(<InvoiceForm />);
    await waitFor(() =>
      expect(container.querySelector('input[list="account-codes"]')).not.toBeNull(),
    );
    const input = container.querySelector('input[list="account-codes"]') as HTMLInputElement;

    fireEvent.change(input, { target: { value: "A1" } });
    await screen.findByText("PKR 1,000");
    fireEvent.change(input, { target: { value: "A2" } });
    await screen.findByText("PKR 4,000");
    expect(screen.getByText("PKR 1,500")).toBeTruthy();
    expect(screen.getByText("PKR 2,500")).toBeTruthy();
  });

  it("calculates invoice line tax and net totals live", async () => {
    const { container } = renderPage(<InvoiceForm />);
    await waitFor(() => expect(container.querySelector(".legacy-grid-row")).not.toBeNull());
    const numericInputs = container.querySelectorAll<HTMLInputElement>('.legacy-grid-row input[type="number"]');
    fireEvent.change(numericInputs[0], { target: { value: "1000" } });
    fireEvent.change(numericInputs[1], { target: { value: "100" } });
    fireEvent.change(numericInputs[2], { target: { value: "50" } });

    expect((container.querySelector(".net-amount-input") as HTMLInputElement).value).toBe("850.00");
    expect(screen.getByText("PKR 1,000.00")).toBeTruthy();
    expect(screen.getByText("PKR 850.00")).toBeTruthy();
  });

  it("auto-fills editable invoice taxes from the selected account rates", async () => {
    const { container } = renderPage(<InvoiceForm />);
    await waitFor(() => expect(container.querySelector('input[list="account-codes"]')).not.toBeNull());
    fireEvent.change(container.querySelector('input[list="account-codes"]') as HTMLInputElement, { target: { value: "A1" } });
    const numericInputs = container.querySelectorAll<HTMLInputElement>('.legacy-grid-row input[type="number"]');
    fireEvent.change(numericInputs[0], { target: { value: "10000" } });
    expect(numericInputs[1].value).toBe("450");
    expect(numericInputs[2].value).toBe("360");
    expect((container.querySelector(".net-amount-input") as HTMLInputElement).value).toBe("9190.00");
    fireEvent.change(numericInputs[1], { target: { value: "400" } });
    expect(numericInputs[1].value).toBe("400");
  });
});
