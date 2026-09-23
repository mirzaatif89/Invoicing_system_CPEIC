import { prisma } from "./prisma.js";

export const instituteSettingKeys = ["departmentAndDdo", "costCenter", "projectDescription", "projectCode", "subDetailFunction", "grantNo", "aaaAccountName", "aaaAccountNumber", "accountantLabel", "accountOfficerLabel", "deputyDirectorFinanceLabel", "chairmanModelPharmacyLabel", "directorFinanceLabel", "executiveDirectorLabel", "districtAccountsOfficerLabel", "bankForwardingLabel"] as const;
export type InstituteSettings = Record<typeof instituteSettingKeys[number], string>;

export const instituteDefaults: InstituteSettings = {
  departmentAndDdo: "EXECUTIVE DIRECTOR, WIC WAZIRABAD",
  costCenter: "WIC WAZIRABAD, EXECUTIVE DIRECTOR & DIR. FINANCE",
  projectDescription: "PC21016(016)",
  projectCode: "PC21016(016)",
  subDetailFunction: "073101 General Hospital Services",
  grantNo: "GA 4330",
  aaaAccountName: "Asaan Assignment Account",
  aaaAccountNumber: "NBP 1173593900",
  accountantLabel: "Accountant Model Pharmacy\nCPEIC, Wazirabad",
  accountOfficerLabel: "Account Officer\nCPEIC, Wazirabad",
  deputyDirectorFinanceLabel: "Deputy Director Finance\nCPEIC, Wazirabad",
  chairmanModelPharmacyLabel: "Chairman Model Pharmacy / Medical Superintendent\nCPEIC, Wazirabad",
  directorFinanceLabel: "Director Finance",
  executiveDirectorLabel: "Executive Director/HOI\nWazirabad Institute Of Cardiology, Wazirabad",
  districtAccountsOfficerLabel: "DISTRICT ACCOUNTS OFFICER\nGUJRANWALA",
  bankForwardingLabel: "Manager NBP Civil Lines Gujranwala",
};

export async function getInstituteSettings() {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...instituteSettingKeys] } } });
  const values = { ...instituteDefaults };
  rows.forEach((row) => {
    if (row.value !== null && instituteSettingKeys.includes(row.key as typeof instituteSettingKeys[number])) values[row.key as typeof instituteSettingKeys[number]] = row.value;
  });
  return values;
}
