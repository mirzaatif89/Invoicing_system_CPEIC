import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { BookOpen, ChevronDown, ClipboardList, Database, FileBarChart, FilePenLine, FileText, Info, Landmark, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, ReceiptText, Settings, ShieldCheck, UserCircle, Users, X } from "lucide-react";

type Role = "ADMIN" | "ACCOUNTANT" | "USER";
type Item = { label: string; path: string; icon: ComponentType<{ size?: number }> ; admin?: boolean };
type Group = { label: string; icon: ComponentType<{ size?: number }>; match: string[]; items: Item[] };

const groups: Group[] = [
  { label: "Transactions", icon: ReceiptText, match: ["/transactions/invoices", "/transactions/contingent-bills", "/transactions/budgets", "/transactions/po-details", "/transactions/po-supplies", "/transactions/vendor-profiles"], items: [
    { label: "Purchase Orders", path: "/transactions/po-details", icon: FileText },
    { label: "New Purchase Order", path: "/transactions/po-supplies/new", icon: ClipboardList },
    { label: "Invoice Entry", path: "/transactions/invoices/new", icon: FilePenLine },
    { label: "Invoice List", path: "/transactions/invoices", icon: FileText },
    { label: "Contingent Bills", path: "/transactions/contingent-bills", icon: ClipboardList },
    { label: "Budget Entry", path: "/transactions/budgets/new", icon: Landmark },
    { label: "Vendor Profiles", path: "/transactions/vendor-profiles", icon: UserCircle },
  ] },
  { label: "Reports", icon: FileBarChart, match: ["/reports"], items: [
    ["Invoice Printing","invoice"],["Cheque Schedule","cheque"],["Payment Scheduling","paymentScheduling"],["Single Payment Scheduling","singlePaymentScheduling"],["Assignment Account Cheques","assignment-account-cheques"],["Tax Report Of A Vendor","vendorTax"],["Tax Report Of An Account Head","accountTax"],["Payment Register","register"],["Net Payment To A Vendor","vendorNet"],["Budget Position","budget"],["Head Wise Payment","head"],["Vendor Wise Payment","vendor"],
  ].map(([label, slug]) => ({ label, path: `/reports/${slug}`, icon: FileText })) },
  { label: "FBR", icon: Landmark, match: ["/fbr"], items: [
    { label: "Income Tax", path: "/fbr/income-tax", icon: FileText },
    { label: "Sales Tax", path: "/fbr/sales-tax", icon: FileText },
    { label: "L.D. Charges", path: "/fbr/ld-charges", icon: FileText },
    { label: "Shelf Life", path: "/fbr/shelf-life", icon: FileText },
  ] },
  { label: "Tax & Deduction Policies", icon: Settings, match: ["/utilities/item-type-tax-rules", "/utilities/tax-policy-overview"], items: [
    { label: "Tax Policy Overview", path: "/utilities/tax-policy-overview", icon: Settings, admin: true },
    { label: "Item Type Tax Rates", path: "/utilities/item-type-tax-rules", icon: Settings, admin: true },
  ] },
  { label: "Management", icon: Users, match: ["/management"], items: [
    { label: "Payee Code Making", path: "/management/payees/new", icon: UserCircle },
    { label: "Accounts Code Making", path: "/management/account-codes/new", icon: BookOpen },
    { label: "Bank & Branch Setup", path: "/management/banks", icon: Landmark, admin: true },
    { label: "Payee Code List", path: "/management/payees", icon: Users },
    { label: "Account Code List", path: "/management/account-codes", icon: BookOpen },
  ] },
  { label: "Utilities", icon: Settings, match: ["/utilities", "/transactions/vendor-filer-status", "/management/password", "/management/refresh-data", "/management/data-deletion"], items: [
    { label: "Institute Settings", path: "/utilities/institute-settings", icon: Settings, admin: true },
    { label: "L.D. Charges Settings", path: "/utilities/ld-charges-settings", icon: Settings, admin: true },
    { label: "Shelf Life Settings", path: "/utilities/shelf-life-penalty-slabs", icon: Settings, admin: true },
    { label: "Password Change", path: "/management/password", icon: ShieldCheck },
    { label: "Change Fiscal Year", path: "/utilities/fiscal-year", icon: Landmark, admin: true },
    { label: "Backup / Restore Database", path: "/utilities/backup", icon: Database, admin: true },
    { label: "Refresh Report Data", path: "/management/refresh-data", icon: Database, admin: true },
    { label: "Data Deletion", path: "/management/data-deletion", icon: Database, admin: true },
    { label: "User Management", path: "/utilities/users", icon: Users, admin: true },
    { label: "About", path: "/utilities/about", icon: Info },
  ] },
];

export default function Layout({ children, onLogout, role, username = "User" }: { children: ReactNode; onLogout: () => void; role: Role; username?: string }) {
  const location = useLocation();
  const vendorProfileRoute = /^\/management\/payees\/\d+\/profile$/.test(location.pathname);
  const [openGroups, setOpenGroups] = useState(() => new Set([vendorProfileRoute ? "Transactions" : groups.find((group) => group.match.some((prefix) => location.pathname.startsWith(prefix)))?.label || "Transactions"]));
  const [collapsed, setCollapsed] = useState(false), [mobileOpen, setMobileOpen] = useState(false), [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); const group = vendorProfileRoute ? undefined : groups.find((entry) => entry.match.some((prefix) => location.pathname.startsWith(prefix))); if (group) setOpenGroups(new Set([group.label])); }, [location.pathname, vendorProfileRoute]);
  const activeItem = useMemo(() => vendorProfileRoute ? undefined : groups.flatMap((group) => group.items).filter((item) => role === "ADMIN" || !item.admin).sort((a, b) => b.path.length - a.path.length).find((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)), [location.pathname, role, vendorProfileRoute]);
  const title = location.pathname === "/" ? "Dashboard" : /^\/management\/payees\/\d+\/profile$/.test(location.pathname) ? "Vendor Profile" : location.pathname === "/transactions/vendor-filer-status" ? "FBR Status Checker" : location.pathname === "/utilities/about" ? "About" : activeItem?.label || "Institute Accounts";
  const initials = username.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  function toggleGroup(label: string) { setOpenGroups((current) => current.has(label) ? new Set() : new Set([label])); }
  return <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "mobile-nav-open" : ""}`}>
    <button className="mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu /></button><div className="sidebar-scrim" onClick={() => setMobileOpen(false)} />
    <aside className="sidebar"><div className="sidebar-brand"><img className="institute-mark" src="/logo.png" alt="WIC institute logo" />{!collapsed && <div><strong>WIC Accounts</strong><span>Digital Ledger</span></div>}<button className="mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X /></button></div>
      <nav className="sidebar-nav"><NavLink className="dashboard-link" to="/"><LayoutDashboard size={19} /><span>Dashboard</span></NavLink>{groups.map((group) => { const Icon = group.icon, open = openGroups.has(group.label), active = !vendorProfileRoute && group.match.some((prefix) => location.pathname.startsWith(prefix)); const items = group.items.filter((item) => role === "ADMIN" || !item.admin); return <div key={group.label}><div className={`ledger-group ${active ? "active" : ""}`}><button className="ledger-tab" title={collapsed ? group.label : undefined} onClick={() => toggleGroup(group.label)}><Icon size={19} /><span>{group.label}</span><ChevronDown className="chevron" size={16} /></button><div className={`ledger-items ${open ? "open" : ""}`}>{items.map((item) => { const ItemIcon = item.icon; return <NavLink key={item.path} to={item.path} end={item.path === "/management/payees"} className={({ isActive }) => isActive ? "active" : ""}><ItemIcon size={15} /><span>{item.label}</span></NavLink>; })}</div></div></div>; })}</nav>
      <button className="collapse-button" onClick={() => setCollapsed((value) => !value)}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}<span>Collapse sidebar</span></button>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb"><span>WIC Accounts</span><b>/</b><strong>{title}</strong></div><div className="profile-wrap"><button className="profile-button" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen}><span className="avatar">{initials}</span><span className="profile-copy"><strong>{username}</strong><small>{role}</small></span><ChevronDown size={16} /></button>{profileOpen && <div className="profile-menu"><div><strong>{username}</strong><span>{role}</span></div><NavLink to="/transactions/profile"><UserCircle size={16} />My Profile</NavLink><button onClick={onLogout}><LogOut size={16} />Logout</button></div>}</div></header><main key={location.pathname} className="page-content">{children}</main><footer>Institute Accounts & Invoice Management System</footer></div>
  </div>;
}
