import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api } from "./api";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import PayeeList from "./pages/PayeeList";
import PayeeForm from "./pages/PayeeForm";
import AccountList from "./pages/AccountList";
import AccountForm from "./pages/AccountForm";
import ComingSoon from "./pages/ComingSoon";
import InvoiceList from "./pages/InvoiceList";
import InvoiceForm from "./pages/InvoiceForm";
import BudgetDocumentForm from "./pages/BudgetDocumentForm";
import BudgetDocumentList from "./pages/BudgetDocumentList";
import ReportPage, { type ReportKind } from "./pages/ReportPage";
import { AboutHelp, BackupRestore, DataDeletion, FiscalYearSettings, InstituteSettings, LdChargesSettings, PasswordChange, RefreshData, UserManagement } from "./pages/AdminPages";
import Dashboard from "./pages/Dashboard";
import VendorFilerStatusChecker from "./pages/VendorFilerStatusChecker";
import PenaltySlabsPage from "./pages/PenaltySlabsPage";
import PoDetailsPage from "./pages/PoDetailsPage";
import PoSupplyEntryPage from "./pages/PoSupplyEntryPage";
import ProfilePage from "./pages/ProfilePage";
import ItemTypeTaxRulesPage from "./pages/ItemTypeTaxRulesPage";
import TaxPolicyOverviewPage from "./pages/TaxPolicyOverviewPage";
import VendorProfilePage from "./pages/VendorProfilePage";
import BankSetupPage from "./pages/BankSetupPage";
import VendorProfilesListPage from "./pages/VendorProfilesListPage";
import ChequeAuthoritySchedulePage from "./pages/ChequeAuthoritySchedulePage";
import { useToast } from "./components/Toast";

type SessionUser = { id: number; username: string; role: "ADMIN" | "ACCOUNTANT" | "USER" };

export default function App() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const loadUser = () => api<{ user: SessionUser }>("/auth/me").then((result) => setUser(result.user)).catch(() => setUser(null));
  useEffect(() => {
    void loadUser();
    const authenticationRequired = () => setUser(null);
    window.addEventListener("app:authentication-required", authenticationRequired);
    return () => window.removeEventListener("app:authentication-required", authenticationRequired);
  }, []);
  if (user === undefined) return <div className="screen-center">Loading…</div>;
  if (!user) return <Routes><Route path="*" element={<Login onLogin={(username) => { void loadUser(); navigate("/"); showToast(`Welcome back, ${username}! You've successfully logged in.`); }} />} /></Routes>;
  const admin = (element: ReactNode) => user.role === "ADMIN" ? element : <Navigate to="/" />;
  return <Layout role={user.role} username={user.username} onLogout={async () => { await api("/auth/logout", { method: "POST" }); setUser(null); }}><Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/management/payees" element={<PayeeList />} /><Route path="/management/payees/new" element={<PayeeForm />} /><Route path="/management/payees/:id/edit" element={<PayeeForm />} /><Route path="/management/payees/:id/profile" element={<VendorProfilePage />} /><Route path="/management/payees/:id/cheques/:billId/edit" element={<VendorProfilePage />} />
    <Route path="/management/account-codes" element={<AccountList />} /><Route path="/management/account-codes/new" element={<AccountForm />} /><Route path="/management/account-codes/:id/edit" element={<AccountForm />} />
    <Route path="/transactions/invoices" element={<InvoiceList />} /><Route path="/transactions/invoices/new" element={<InvoiceForm />} /><Route path="/transactions/invoices/:id/edit" element={<InvoiceForm />} />
    <Route path="/transactions/contingent-bills" element={<InvoiceList mode="contingent" />} /><Route path="/transactions/contingent-bills/new" element={<InvoiceForm mode="contingent" />} /><Route path="/transactions/contingent-bills/:id/edit" element={<InvoiceForm mode="contingent" />} />
    <Route path="/transactions/po-details" element={<PoDetailsPage />} />
    <Route path="/transactions/po-supplies/new" element={<PoSupplyEntryPage />} />
    <Route path="/transactions/profile" element={<ProfilePage />} />
    <Route path="/transactions/vendor-profiles" element={<VendorProfilesListPage />} />
    <Route path="/reports/assignment-account-cheques" element={<ChequeAuthoritySchedulePage />} />
    <Route path="/transactions/budgets" element={<BudgetDocumentList />} /><Route path="/transactions/budgets/new" element={<BudgetDocumentForm />} /><Route path="/transactions/budgets/:id/edit" element={<BudgetDocumentForm />} />
    <Route path="/transactions/vendor-filer-status" element={<VendorFilerStatusChecker />} />
    {(["invoice","cheque","paymentScheduling","singlePaymentScheduling","vendorTax","accountTax","register","vendorNet","document","budget","excel","head","vendor"] as ReportKind[]).map((kind) => <Route key={kind} path={`/reports/${kind}`} element={<ReportPage kind={kind} />} />)}
    {([ ["/fbr/income-tax", "fbrIncomeTax"], ["/fbr/sales-tax", "fbrSalesTax"], ["/fbr/ld-charges", "ldCharges"], ["/fbr/shelf-life", "shelfLife"] ] as const).map(([path, kind]) => <Route key={path} path={path} element={<ReportPage kind={kind} />} />)}
    <Route path="/management/password" element={<PasswordChange />} />
    <Route path="/management/banks" element={admin(<BankSetupPage />)} />
    <Route path="/management/refresh-data" element={admin(<RefreshData />)} />
    <Route path="/management/data-deletion" element={admin(<DataDeletion />)} />
    <Route path="/utilities/backup" element={admin(<BackupRestore />)} />
    <Route path="/utilities/users" element={admin(<UserManagement />)} />
    <Route path="/utilities/fiscal-year" element={admin(<FiscalYearSettings />)} />
    <Route path="/utilities/institute-settings" element={admin(<InstituteSettings />)} />
    <Route path="/utilities/ld-charges-settings" element={admin(<LdChargesSettings />)} />
    <Route path="/utilities/shelf-life-penalty-slabs" element={admin(<PenaltySlabsPage />)} />
    <Route path="/utilities/item-type-tax-rules" element={admin(<ItemTypeTaxRulesPage />)} />
    <Route path="/utilities/tax-policy-overview" element={admin(<TaxPolicyOverviewPage />)} />
    <Route path="/utilities/about" element={<AboutHelp />} />
    <Route path="/coming-soon/:section" element={<ComingSoon />} /><Route path="*" element={<Navigate to="/" />} />
  </Routes></Layout>;
}
